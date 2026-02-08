/**
 * MCP Router
 *
 * Routes user messages to appropriate MCP tools and services.
 * Uses LLM-based routing to select the best tool for each request.
 */

import type {
  AuthContext,
  MCPTool,
  MCPToolsCallResult,
} from '../../shared/protocol/src/types.js';
import { getMCPRegistry, type InvokeContext } from './mcp-registry.js';
import { getLLMClient, completeWithJSON } from './llm/client.js';
import { buildFallbackPrompt, buildResponseFormattingPrompt } from './llm/prompts.js';
import { createLogger, startTimer } from '../../shared/observability/src/logger.js';

const logger = createLogger('mcp-router');

// ============================================================================
// Types
// ============================================================================

interface ToolWithService {
  tool: MCPTool;
  serviceId: string;
  serviceName: string;
}

interface RoutingResult {
  selectedTool: ToolWithService | null;
  confidence: number;
  reasoning: string;
}

// ============================================================================
// Tool-Based Routing
// ============================================================================

export async function routeToTool(
  userMessage: string,
  model?: string,
  targetService?: string
): Promise<RoutingResult> {
  const registry = getMCPRegistry();
  const allServices = registry.getEnabled();

  // Filter services if targetService is specified
  const services = targetService
    ? allServices.filter((s) => s.id === targetService)
    : allServices;

  if (services.length === 0) {
    const allServiceIds = allServices.map(s => s.id).join(', ');
    return {
      selectedTool: null,
      confidence: 1.0,
      reasoning: targetService
        ? `Target service '${targetService}' is not available or not enabled. Available services: [${allServiceIds || 'none registered'}]`
        : 'No services are currently enabled in the registry. Check service configuration.',
    };
  }

  const timer = startTimer();

  // Gather tools from filtered services (or all if no target)
  const allTools: ToolWithService[] = [];
  for (const service of services) {
    const tools = await registry.fetchTools(service.id);
    for (const tool of tools) {
      allTools.push({
        tool,
        serviceId: service.id,
        serviceName: service.name,
      });
    }
  }

  if (allTools.length === 0) {
    const serviceNames = services.map(s => `${s.name} (${s.id})`).join(', ');
    return {
      selectedTool: null,
      confidence: 0,
      reasoning: `No tools could be fetched from any service. Checked services: [${serviceNames}]. Services may be down or not exposing MCP tools.`,
    };
  }

  // Build tool selection prompt
  const toolsDescription = allTools
    .map((t) => {
      const schema = t.tool.inputSchema;
      const params = schema.properties
        ? Object.entries(schema.properties)
            .map(([name, prop]) => {
              const required = schema.required?.includes(name) ? ', required' : '';
              const desc = (prop as { description?: string }).description || '';
              const type = (prop as { type?: string }).type || 'string';
              return `    ${name} (${type}${required}): ${desc}`;
            })
            .join('\n')
        : '    (no parameters)';
      return `- ${t.tool.name} [${t.serviceName}]: ${t.tool.description}\n  Parameters:\n${params}`;
    })
    .join('\n');

  const prompt = `You are a tool selector for an AI assistant. Given a user message and available tools, determine which tool to use.

Available tools:
${toolsDescription}

User message: "${userMessage}"

Respond ONLY with valid JSON in this format:
{
  "tool": "<tool-name>",
  "service": "<service-name>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}

If no tool is appropriate, respond with:
{
  "tool": "none",
  "service": "none",
  "confidence": 1.0,
  "reasoning": "<explanation of why no tool matches>"
}`;

  try {
    const { result, error } = await completeWithJSON<{
      tool: string;
      service: string;
      confidence: number;
      reasoning: string;
    }>([{ role: 'user', content: prompt }], {
      temperature: 0.1,
      maxTokens: 256,
      model,
    });

    const timing = timer();

    if (!result || error) {
      logger.warn('Failed to parse tool selection result', {
        error,
        durationMs: timing.durationMs,
        toolCount: allTools.length,
        userMessage: userMessage.substring(0, 100),
      });
      return {
        selectedTool: null,
        confidence: 0,
        reasoning: `Tool selection failed: LLM did not return a valid routing decision. ${error || 'No result returned.'}`,
      };
    }

    if (result.tool === 'none') {
      return {
        selectedTool: null,
        confidence: result.confidence,
        reasoning: result.reasoning,
      };
    }

    // Find the selected tool
    const selected = allTools.find((t) => t.tool.name === result.tool);

    logger.info('Tool routing complete', {
      selectedTool: result.tool,
      service: result.service,
      confidence: result.confidence,
      durationMs: timing.durationMs,
    });

    return {
      selectedTool: selected || null,
      confidence: result.confidence,
      reasoning: result.reasoning,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Tool routing error', error, {
      toolCount: allTools.length,
      userMessage: userMessage.substring(0, 100),
    });
    return {
      selectedTool: null,
      confidence: 0,
      reasoning: `Tool routing failed: ${errorMessage}`,
    };
  }
}

// ============================================================================
// Tool Invocation
// ============================================================================

export interface InvokeToolOptions {
  serviceId: string;
  toolName: string;
  args: Record<string, unknown>;
  auth: AuthContext;
}

export async function invokeTool(options: InvokeToolOptions): Promise<MCPToolsCallResult> {
  const { serviceId, toolName, args, auth } = options;
  const registry = getMCPRegistry();

  const context: InvokeContext = {
    userId: auth.userId,
    scopes: auth.scopes,
    requestId: auth.requestId,
    utcOffsetMinutes: auth.utcOffsetMinutes,
  };

  return registry.invokeTool(serviceId, toolName, args, context);
}

function extractDailyBreakdown(
  structuredContent: unknown
): Array<{ date: string; prod: number; admin: number; nonprod: number; total: number }> | null {
  if (!structuredContent || typeof structuredContent !== 'object') return null;
  const stats = (structuredContent as { stats?: { dailyBreakdown?: Record<string, unknown> } }).stats;
  if (!stats || !stats.dailyBreakdown) return null;

  const entries = Object.entries(stats.dailyBreakdown);
  const parsed = entries
    .map(([date, value]) => {
      if (!value || typeof value !== 'object') return null;
      const record = value as { prod?: number; admin?: number; nonprod?: number; total?: number };
      if (typeof record.total !== 'number') return null;
      return {
        date,
        prod: typeof record.prod === 'number' ? record.prod : 0,
        admin: typeof record.admin === 'number' ? record.admin : 0,
        nonprod: typeof record.nonprod === 'number' ? record.nonprod : 0,
        total: record.total,
      };
    })
    .filter(
      (item): item is { date: string; prod: number; admin: number; nonprod: number; total: number } => !!item
    );

  if (parsed.length === 0) return null;
  parsed.sort((a, b) => a.date.localeCompare(b.date));
  return parsed;
}

function getWeekStart(date: Date): Date {
  const day = date.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - daysSinceMonday);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function pickGranularity(
  intent: SelectedToolCall['intentAnalysis'],
  firstDate: Date,
  lastDate: Date
): 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' {
  if (intent?.granularity) return intent.granularity;
  const rangeDays = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / 86400000) + 1);
  if (rangeDays > 365) return 'monthly';
  if (rangeDays > 120) return 'monthly';
  if (rangeDays > 45) return 'weekly';
  return 'daily';
}

function aggregateDailyBreakdown(
  daily: Array<{ date: string; prod: number; admin: number; nonprod: number; total: number }>,
  granularity: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
): { labels: string[]; prod: number[]; admin: number[]; nonprod: number[] } {
  const buckets = new Map<
    string,
    { prod: number; admin: number; nonprod: number }
  >();

  for (const entry of daily) {
    const date = new Date(`${entry.date}T00:00:00`);
    let key = entry.date;

    if (granularity === 'weekly') {
      key = getDateKey(getWeekStart(date));
    } else if (granularity === 'monthly') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    } else if (granularity === 'quarterly') {
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      key = `${date.getFullYear()}-Q${quarter}`;
    } else if (granularity === 'yearly') {
      key = String(date.getFullYear());
    }

    if (!buckets.has(key)) {
      buckets.set(key, { prod: 0, admin: 0, nonprod: 0 });
    }

    const bucket = buckets.get(key)!;
    bucket.prod += entry.prod;
    bucket.admin += entry.admin;
    bucket.nonprod += entry.nonprod;
  }

  const labels = Array.from(buckets.keys()).sort();
  const prod = labels.map((label) => Number(((buckets.get(label)?.prod || 0) / 60).toFixed(2))).map(Number);
  const admin = labels.map((label) => Number(((buckets.get(label)?.admin || 0) / 60).toFixed(2))).map(Number);
  const nonprod = labels.map((label) => Number(((buckets.get(label)?.nonprod || 0) / 60).toFixed(2))).map(Number);
  return { labels, prod, admin, nonprod };
}

async function generateTrendChartImage(
  daily: Array<{ date: string; prod: number; admin: number; nonprod: number; total: number }>,
  intent: SelectedToolCall['intentAnalysis']
): Promise<{ data: string; mimeType: string } | null> {
  if (daily.length === 0) return null;
  const firstDate = new Date(`${daily[0].date}T00:00:00`);
  const lastDate = new Date(`${daily[daily.length - 1].date}T00:00:00`);
  const granularity = pickGranularity(intent, firstDate, lastDate);
  const { labels, prod, admin, nonprod } = aggregateDailyBreakdown(daily, granularity);

  if (labels.length === 0) return null;

  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Productive',
          data: prod,
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15, 118, 110, 0.15)',
          fill: false,
          tension: 0.25,
        },
        {
          label: 'Admin/Rest',
          data: admin,
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.15)',
          fill: false,
          tension: 0.25,
        },
        {
          label: 'Non-productive',
          data: nonprod,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          fill: false,
          tension: 0.25,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: true },
      },
      scales: {
        y: {
          title: { display: true, text: 'Hours' },
        },
      },
    },
  };

  try {
    const response = await fetch('https://quickchart.io/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart: chartConfig,
        width: 1000,
        height: 600,
        backgroundColor: 'white',
      }),
    });

    if (!response.ok) {
      logger.warn('QuickChart request failed', { status: response.status });
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return { data: buffer.toString('base64'), mimeType: 'image/png' };
  } catch (error) {
    logger.warn('Failed to generate trend chart image', {}, error);
    return null;
  }
}

// ============================================================================
// Response Formatting
// ============================================================================

export async function formatResponse(
  originalRequest: string,
  toolResult: MCPToolsCallResult,
  serviceName: string,
  model?: string
): Promise<string> {
  try {
    const client = getLLMClient();

    // Extract the content from the MCP result
    const textContent = toolResult.content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');

    const resultData = toolResult.structuredContent || textContent;
    const prompt = buildResponseFormattingPrompt(originalRequest, resultData, serviceName);

    const result = await client.complete([{ role: 'user', content: prompt }], {
      temperature: 0.7,
      maxTokens: 512,
      model,
    });

    return result.content;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('Failed to format response with LLM, using raw tool output', {
      serviceName,
      errorMessage,
    }, error);

    // Return content from the tool result as fallback
    const textContent = toolResult.content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');

    return textContent || `Here's the result from ${serviceName}: ${JSON.stringify(toolResult.structuredContent || {})}`;
  }
}

// ============================================================================
// Fallback Response
// ============================================================================

export async function generateFallbackResponse(userMessage: string, model?: string): Promise<string> {
  try {
    const client = getLLMClient();
    const systemPrompt = buildFallbackPrompt();

    const result = await client.complete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      {
        temperature: 0.7,
        maxTokens: 512,
        model,
      }
    );

    return result.content;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Fallback response generation failed', error);

    return classifyAndFormatLLMError(errorMessage);
  }
}

/**
 * Classifies an LLM error message and returns a user-friendly description.
 * Used by both generateFallbackResponse and processMCPChatMessage to ensure
 * actual error details always reach the user.
 */
function classifyAndFormatLLMError(errorMessage: string): string {
  const msg = errorMessage.toLowerCase();

  if (msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('429') || msg.includes('too many requests') || msg.includes('quota') || msg.includes('overloaded') || msg.includes('529')) {
    return `I'm temporarily unable to respond because the AI service is rate-limited or overloaded. Please wait a moment and try again. (Error: ${errorMessage})`;
  }
  if (msg.includes('authentication') || msg.includes('unauthorized') || msg.includes('401') || msg.includes('api key') || msg.includes('api_key') || msg.includes('invalid key') || msg.includes('403') || msg.includes('forbidden') || msg.includes('access denied')) {
    return `I'm unable to respond due to an AI service authentication or permission issue. Please contact the administrator. (Error: ${errorMessage})`;
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborterror') || msg.includes('deadline') || msg.includes('took too long')) {
    return `The AI service took too long to respond. Please try again. (Error: ${errorMessage})`;
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('enotfound') || msg.includes('dns') || msg.includes('socket') || msg.includes('cannot reach') || msg.includes('unable to reach')) {
    return `I'm having trouble connecting to the AI service. Please check the connection and try again. (Error: ${errorMessage})`;
  }
  if (msg.includes('model') && (msg.includes('not found') || msg.includes('does not exist') || msg.includes('invalid'))) {
    return `The configured AI model could not be found or is invalid. Please check the model configuration. (Error: ${errorMessage})`;
  }
  if (msg.includes('content filter') || msg.includes('safety') || msg.includes('blocked')) {
    return `The AI service could not process this request due to content filtering. Please try rephrasing your message. (Error: ${errorMessage})`;
  }
  if (msg.includes('context length') || msg.includes('too long') || msg.includes('max tokens') || msg.includes('token limit')) {
    return `The request was too large for the AI service to process. Please try a shorter message. (Error: ${errorMessage})`;
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('internal server error') || msg.includes('bad gateway') || msg.includes('service unavailable')) {
    return `The AI service is temporarily experiencing issues. Please try again shortly. (Error: ${errorMessage})`;
  }

  // Always include the actual error message so the user/developer can diagnose
  return `I'm having trouble processing your request. (Error: ${errorMessage})`;
}

// ============================================================================
// Parameter Selection
// ============================================================================

interface SelectedToolCall {
  toolName: string;
  args: Record<string, unknown>;
  intentAnalysis?: {
    intent: 'log' | 'query' | 'summary' | 'trend' | 'chart' | 'other';
    timeRange?: {
      from?: string;
      to?: string;
      month?: string;
      year?: number;
      quarter?: string;
    };
    granularity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null;
    visualization?: 'line' | 'bar' | 'area' | 'pie' | 'heatmap' | null;
    output?: 'chart' | 'table' | 'both' | 'text' | null;
  };
}

export async function selectToolParameters(
  userMessage: string,
  tool: MCPTool,
  model?: string,
  utcOffsetMinutes?: number
): Promise<SelectedToolCall | null> {
  // =========================================================================
  // MOMENTUM: Direct pattern matching for simple phrases (skip LLM)
  // =========================================================================
  if (tool.name === 'momentum.record') {
    const msg = userMessage.toLowerCase().trim();
    
    // Success patterns
    const successPatterns = [
      /^did it!?$/i, /^i did it!?$/i, /^done!?$/i, /^i'm done!?$/i,
      /^success!?$/i, /^nailed it!?$/i, /^completed!?$/i,
      /^yes!?$/i, /^yeah!?$/i, /^yep!?$/i, /^yup!?$/i,
      /^accomplished!?$/i, /^finished!?$/i, /^made it!?$/i,
      /^got it done!?$/i, /^check!?$/i, /^checked!?$/i,
      /^crushed it!?$/i, /^killed it!?$/i, /^boom!?$/i,
      /^win!?$/i, /^winner!?$/i, /^victory!?$/i,
      /^✓$/, /^✅$/, /^👍$/,
    ];
    
    // Failure patterns
    const failurePatterns = [
      /^screwed it!?$/i, /^i screwed it!?$/i,
      /^failed!?$/i, /^i failed!?$/i, /^failure!?$/i, /^fail!?$/i,
      /^no!?$/i, /^nope!?$/i,
      /^didn't do it!?$/i, /^i didn't do it!?$/i,
      /^missed it!?$/i, /^i missed it!?$/i,
      /^skipped!?$/i, /^i skipped!?$/i,
      /^couldn't!?$/i, /^i couldn't!?$/i, /^couldn't do it!?$/i,
      /^blew it!?$/i, /^i blew it!?$/i,
      /^messed up!?$/i, /^i messed up!?$/i,
      /^oops!?$/i, /^whoops!?$/i, /^not today!?$/i,
      /^lost!?$/i, /^l!?$/i,
      /^❌$/, /^👎$/,
    ];
    
    for (const pattern of successPatterns) {
      if (pattern.test(msg)) {
        logger.info('Momentum: Direct pattern match for success', { userMessage });
        return { toolName: 'momentum.record', args: { outcome: 'success' } };
      }
    }
    
    for (const pattern of failurePatterns) {
      if (pattern.test(msg)) {
        logger.info('Momentum: Direct pattern match for failure', { userMessage });
        return { toolName: 'momentum.record', args: { outcome: 'failure' } };
      }
    }
    
    // If no direct match, fall through to LLM extraction
    logger.info('Momentum: No direct pattern match, using LLM', { userMessage });
  }

  // =========================================================================
  // MOMENTUM STATS: Direct pattern matching
  // =========================================================================
  if (tool.name === 'momentum.stats') {
    // Stats is simple - just return empty args (server uses defaults)
    logger.info('Momentum stats: Using default parameters', { userMessage });
    return { toolName: 'momentum.stats', args: {} };
  }

  const schema = tool.inputSchema;
  const params = schema.properties
    ? Object.entries(schema.properties)
        .map(([name, prop]) => {
          const required = schema.required?.includes(name) ? ', required' : '';
          const desc = (prop as { description?: string }).description || '';
          const type = (prop as { type?: string }).type || 'string';
          const defaultVal = (prop as { default?: unknown }).default;
          const defaultStr = defaultVal !== undefined ? `, default: ${JSON.stringify(defaultVal)}` : '';
          return `  ${name} (${type}${required}${defaultStr}): ${desc}`;
        })
        .join('\n')
    : '  (no parameters)';

  // Check if this tool has a category parameter for activity logging
  const hasCategory = schema.properties && 'category' in schema.properties;
  
  // Build category inference instructions if needed
  let categoryInstructions = '';
  if (hasCategory && tool.name === 'diary.log') {
    categoryInstructions = `
CATEGORY INFERENCE (IMPORTANT):
The 'category' parameter is REQUIRED. Use these definitions:

- "prod" (Productive): Intentional work or self-improvement activities
  Examples: coding, programming, work, meetings, learning, studying, reading documentation, projects, exercise, gym, running, meditation, writing, research, tutorials, client calls, standup

- "admin" (Admin/Rest): Regular life activities including leisure and entertainment (this is normal rest!)
  Examples: meals (breakfast/lunch/dinner), eating, cooking, sleeping, napping, rest, shower, commute, errands, chores, breaks, appointments, walking the dog, watching TV/movies/Netflix/YouTube, gaming, playing games, social media, browsing, entertainment, hanging out, reading novels, personal calls (call with mom/dad/friend), date night, lanius run, playing Fallout/Elden Ring

- "nonprod" (Non-productive): ONLY use when user explicitly expresses regret, negativity, or waste
  Trigger words: "damn", "wasted", "waste of time", "shouldn't have", "regret", "sad", "ugh", "unfortunately", "too much", "unproductive"
  Examples: "damn, wasted 3 hours on YouTube" → nonprod, "ugh scrolled Twitter for too long" → nonprod

CRITICAL: Regular entertainment (gaming, watching TV, etc.) goes to "admin" unless the user expresses negativity about it!

Examples:
- "vibe coding" → category: "prod"
- "watching Netflix" → category: "admin" (regular leisure)
- "damn, wasted time watching Netflix" → category: "nonprod" (user expressed regret)
- "lunch" → category: "admin"
- "gaming session" → category: "admin" (regular leisure)
- "lanius run" → category: "admin" (gaming is normal rest)
- "ugh, played games for too long" → category: "nonprod" (user expressed negativity)
- "gym workout" → category: "prod"
- "call with mom" → category: "admin" (regular social)
- "client call" → category: "prod" (work)
- "reading a novel" → category: "admin" (leisure reading)
- "reading documentation" → category: "prod" (work/learning)

If the activity is ambiguous (could fit multiple categories), include "categoryConfidence": "low" in your response.
Otherwise include "categoryConfidence": "high".

`;
  }

  function formatDateLocal(date: Date, offsetMinutes?: number): string {
    // If UTC offset is provided, adjust the date to user's local time
    let targetDate = date;
    if (offsetMinutes !== undefined) {
      // offsetMinutes is positive for timezones ahead of UTC (e.g., UTC+8 = 480)
      // and negative for timezones behind UTC (e.g., UTC-5 = -300)
      const utcMs = date.getTime() + date.getTimezoneOffset() * 60000; // Convert to UTC
      const localMs = utcMs + offsetMinutes * 60000; // Apply user's offset
      targetDate = new Date(localMs);
    }
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async function analyzeUserIntent(message: string) {
    const today = formatDateLocal(new Date(), utcOffsetMinutes);
    const prompt = `You are an intent and time-range analyst for an assistant.

Today is ${today} (this is the user's local date - use this to resolve relative dates).

Given the user message, extract:
- intent: one of ["log", "query", "summary", "trend", "chart", "other"]
- timeRange: { "from"?: "YYYY-MM-DD", "to"?: "YYYY-MM-DD", "month"?: "YYYY-MM", "year"?: number, "quarter"?: "YYYY-QN" }
- granularity: one of ["daily", "weekly", "monthly", "quarterly", "yearly"] or null
- visualization: one of ["line", "bar", "area", "pie", "heatmap"] or null
- output: one of ["chart", "table", "both", "text"] or null

User message: "${message}"

Rules:
- If the user asks for a trend or visualization, set intent to "trend" or "chart".
- Resolve relative periods like "last month", "last quarter", "last year" into explicit dates or month/quarter fields.
- If the user asks for weekly/monthly breakdowns, set granularity accordingly.
- Output ONLY valid JSON.
`;

    try {
      const { result, error } = await completeWithJSON<{
        intent: 'log' | 'query' | 'summary' | 'trend' | 'chart' | 'other';
        timeRange?: {
          from?: string;
          to?: string;
          month?: string;
          year?: number;
          quarter?: string;
        };
        granularity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null;
        visualization?: 'line' | 'bar' | 'area' | 'pie' | 'heatmap' | null;
        output?: 'chart' | 'table' | 'both' | 'text' | null;
      }>([{ role: 'user', content: prompt }], {
        temperature: 0.1,
        maxTokens: 256,
        model,
      });

      if (error || !result) return null;
      return result;
    } catch (error) {
      logger.warn('Intent analysis failed', {}, error);
      return null;
    }
  }

  const intentAnalysis = await analyzeUserIntent(userMessage);

  function getMonthRange(month: string): { from: string; to: string } | null {
    const match = month.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (Number.isNaN(year) || Number.isNaN(monthIndex)) return null;
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0);
    return { from: formatDateLocal(start), to: formatDateLocal(end) };
  }

  function getQuarterRange(quarter: string): { from: string; to: string } | null {
    const match = quarter.match(/^(\d{4})-Q([1-4])$/i);
    if (!match) return null;
    const year = Number(match[1]);
    const quarterIndex = Number(match[2]) - 1;
    if (Number.isNaN(year) || Number.isNaN(quarterIndex)) return null;
    const startMonth = quarterIndex * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    return { from: formatDateLocal(start), to: formatDateLocal(end) };
  }

  function applyIntentToArgs(
    toolName: string,
    args: Record<string, unknown>,
    intent: typeof intentAnalysis
  ): Record<string, unknown> {
    if (!intent || !intent.timeRange) return args;

    const nextArgs = { ...args };
    const timeRange = intent.timeRange;

    if (toolName === 'diary.getTimeStats') {
      if (timeRange.from && timeRange.to) {
        nextArgs.period = 'custom';
        nextArgs.from = timeRange.from;
        nextArgs.to = timeRange.to;
      } else if (timeRange.month) {
        const range = getMonthRange(timeRange.month);
        if (range) {
          nextArgs.period = 'custom';
          nextArgs.from = range.from;
          nextArgs.to = range.to;
        }
      } else if (timeRange.year) {
        const start = new Date(timeRange.year, 0, 1);
        const end = new Date(timeRange.year, 11, 31);
        nextArgs.period = 'custom';
        nextArgs.from = formatDateLocal(start);
        nextArgs.to = formatDateLocal(end);
      } else if (timeRange.quarter) {
        const range = getQuarterRange(timeRange.quarter);
        if (range) {
          nextArgs.period = 'custom';
          nextArgs.from = range.from;
          nextArgs.to = range.to;
        }
      }

      if (intent.visualization && !nextArgs.chartType) {
        const allowedChartTypes = new Set(['bar', 'pie', 'doughnut']);
        if (allowedChartTypes.has(intent.visualization)) {
          nextArgs.chartType = intent.visualization;
        }
      }
      if (intent.output === 'chart') {
        nextArgs.includeChart = true;
      }
    }

    if (toolName === 'diary.queryEvents') {
      if (timeRange.from && timeRange.to) {
        nextArgs.from = timeRange.from;
        nextArgs.to = timeRange.to;
      } else if (timeRange.month) {
        const range = getMonthRange(timeRange.month);
        if (range) {
          nextArgs.from = range.from;
          nextArgs.to = range.to;
        }
      } else if (timeRange.year) {
        const start = new Date(timeRange.year, 0, 1);
        const end = new Date(timeRange.year, 11, 31);
        nextArgs.from = formatDateLocal(start);
        nextArgs.to = formatDateLocal(end);
      } else if (timeRange.quarter) {
        const range = getQuarterRange(timeRange.quarter);
        if (range) {
          nextArgs.from = range.from;
          nextArgs.to = range.to;
        }
      }

      if (intent.output === 'chart') {
        nextArgs.includeChart = true;
      }
    }

    return nextArgs;
  }

  // Build a clearer prompt with examples
  const prompt = `You are a parameter extractor. Given a user message and a tool, extract the parameter values as JSON.

Tool: ${tool.name}
Description: ${tool.description}
Parameters:
${params}

User message: "${userMessage}"
${categoryInstructions}
${intentAnalysis ? `Intent analysis (use this to fill parameters when schema supports it):\n${JSON.stringify(intentAnalysis)}\n` : ''}
Rules:
- Extract the activity/task name as the "title" parameter
- If the user specifies any time period (absolute or relative), map it to the tool's date/month parameters using ISO formats.
- Use intent analysis to set date ranges, granularity, and visualization parameters when the schema supports them.
- Use reasonable defaults for optional parameters.
- For dates, use ISO format (YYYY-MM-DD).
- For boolean parameters, infer from context (e.g., "check in" implies checked=true).
- For time parameters, extract exact times if specified (e.g., "from 2pm to 3pm" → startTime: "2pm", endTime: "3pm").
- If time is not specified, omit time parameters to let the server use smart defaults.

IMPORTANT: Output ONLY valid JSON with no additional text or explanation.

${tool.name === 'diary.log' ? `Example output for "Log coding from 3pm to 5pm":
{"args":{"title":"coding","category":"prod","startTime":"3pm","endTime":"5pm"},"categoryConfidence":"high"}

` : ''}Respond with JSON:`;

  // Try up to 2 times
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { result, error, raw } = await completeWithJSON<{ 
        args: Record<string, unknown>;
        categoryConfidence?: 'high' | 'low';
      }>(
        [{ role: 'user', content: prompt }],
        {
          temperature: attempt === 1 ? 0.1 : 0.0, // Lower temperature on retry
          maxTokens: 256,
          model,
        }
      );

      if (!result || error) {
        logger.warn('Failed to extract parameters', { 
          error, 
          attempt, 
          toolName: tool.name,
          rawResponse: raw?.substring(0, 200),
        });
        
        if (attempt < 2) {
          continue; // Retry
        }
        return null;
      }

      // Validate that we have required fields
      if (tool.name === 'diary.log') {
        if (!result.args?.title) {
          logger.warn('Missing required title parameter', { args: result.args, attempt });
          if (attempt < 2) continue;
          return null;
        }
      }

      // If category confidence is low, add it to args so the MCP service can handle follow-up
      const args = { ...result.args };
      if (result.categoryConfidence === 'low' && tool.name === 'diary.log') {
        args._categoryConfidence = 'low';
      }

      const adjustedArgs = applyIntentToArgs(tool.name, args, intentAnalysis);

      logger.info('Parameter extraction successful', { 
        toolName: tool.name, 
        args: adjustedArgs,
        attempt,
      });

      return {
        toolName: tool.name,
        args: adjustedArgs,
        intentAnalysis: intentAnalysis || undefined,
      };
    } catch (error) {
      logger.error('Parameter extraction error', error, { attempt, toolName: tool.name });
      if (attempt < 2) continue;
      return null;
    }
  }

  return null;
}

// ============================================================================
// Full MCP Chat Flow
// ============================================================================

export interface MCPChatFlowOptions {
  message: string;
  auth: AuthContext;
  conversationId?: string;
  model?: string;
  targetService?: string; // Optional: bypass LLM routing and send directly to this service
}

export interface MCPChatFlowResult {
  response: string;
  serviceUsed?: string;
  toolInvoked?: string;
  routingConfidence?: number;
  routingDetails?: {
    tool: string;
    service: string;
    confidence: number;
    reasoning: string;
  };
  structuredContent?: unknown;
  // Rich content (images, etc.) from MCP tool responses
  content?: Array<{
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
}

export async function processMCPChatMessage(options: MCPChatFlowOptions): Promise<MCPChatFlowResult> {
  const { message, auth, model, targetService } = options;

  // Step 1: Route to the best tool (with optional direct service targeting)
  const routing = await routeToTool(message, model, targetService);

  // Step 2: Handle routing result
  if (!routing.selectedTool || routing.confidence < 0.5) {
    // Check if routing itself failed due to an LLM/network error.
    // If so, don't attempt another LLM call (it will also fail).
    const routingFailedDueToError = routing.reasoning.startsWith('Tool routing failed:') ||
      routing.reasoning.startsWith('Tool selection failed:');

    let response: string;
    if (routingFailedDueToError) {
      // Extract the error from the routing reasoning and format it for the user
      logger.warn('Routing failed due to LLM/network error, skipping fallback LLM call', {
        reasoning: routing.reasoning,
      });
      response = classifyAndFormatLLMError(routing.reasoning);
    } else {
      // Routing worked but no tool matched - use LLM for a conversational response
      response = await generateFallbackResponse(message, model);
    }

    return {
      response,
      routingConfidence: routing.confidence,
      routingDetails: {
        tool: 'none',
        service: 'none',
        confidence: routing.confidence,
        reasoning: routing.reasoning,
      },
    };
  }

  const { tool, serviceId, serviceName } = routing.selectedTool;

  // Step 3: Extract parameters for the tool
  const toolCall = await selectToolParameters(message, tool, model, auth.utcOffsetMinutes);

  if (!toolCall) {
    // Parameter extraction failed - provide a helpful message instead of generic fallback
    logger.warn('Parameter extraction failed, providing helpful error', { 
      toolName: tool.name, 
      serviceId, 
      message: message.substring(0, 100),
    });
    
    // Generate a helpful error message specific to the tool
    let response: string;
    if (tool.name === 'diary.log') {
      response = `I understood you want to log an activity, but I had trouble parsing the details. Could you try rephrasing? For example:\n\n"Log [activity name] from [start time] to [end time]"\n\nLike: "Log coding from 2pm to 4pm" or "Log lunch from 12pm to 1pm"`;
    } else {
      response = `I understood your request should go to ${serviceName}, but I had trouble parsing the details. Could you try rephrasing your request more clearly?`;
    }
    
    return {
      response,
      serviceUsed: serviceId,
      routingConfidence: routing.confidence,
      routingDetails: {
        tool: tool.name,
        service: serviceId,
        confidence: routing.confidence,
        reasoning: `Parameter extraction failed: ${routing.reasoning}`,
      },
    };
  }

  if (toolCall.toolName === 'create_idea') {
    const current = typeof toolCall.args.content === 'string' ? toolCall.args.content.trim() : '';
    if (!current) {
      const cleaned = message.replace(/^\\s*(create|log|save)\\s+idea\\s*:\\s*/i, '').trim();
      toolCall.args.content = cleaned || message;
    }
  }

  // Step 4: Invoke the tool
  const toolResult = await invokeTool({
    serviceId,
    toolName: toolCall.toolName,
    args: toolCall.args,
    auth,
  });

  // Step 5: Format the response
  let response: string;
  if (toolResult.isError) {
    const errorText = toolResult.content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');

    // Provide more context-aware error messages
    let errorResponse: string;
    if (errorText.includes('not found')) {
      errorResponse = `The requested operation could not be completed because the tool or service was not found. Details: ${errorText}`;
    } else if (errorText.includes('timeout') || errorText.includes('timed out')) {
      errorResponse = `The service '${serviceName}' took too long to respond. It may be temporarily overloaded. Please try again. Details: ${errorText}`;
    } else if (errorText.includes('permission') || errorText.includes('Insufficient')) {
      errorResponse = `You don't have the required permissions for this operation on '${serviceName}'. Details: ${errorText}`;
    } else if (errorText.includes('connect') || errorText.includes('reach')) {
      errorResponse = `Unable to reach the service '${serviceName}'. It may be temporarily down. Please try again later. Details: ${errorText}`;
    } else {
      errorResponse = `The service '${serviceName}' returned an error while executing '${toolCall.toolName}': ${errorText || 'Unknown error'}. Please try again.`;
    }
    response = errorResponse;
  } else {
    const filteredForFormat = {
      ...toolResult,
      content: toolResult.content.filter(
        (c) => !(c.type === 'text' && c.mimeType === 'text/markdown')
      ),
    };
    response = await formatResponse(message, filteredForFormat, serviceName, model);
  }

  // Extract rich content (images, etc.) from tool result
  const richContent: Array<{
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
  }> = [];

  for (const content of toolResult.content) {
    if (content.type === 'image' && content.data) {
      richContent.push({
        type: 'image',
        data: content.data,
        mimeType: content.mimeType || 'image/png',
      });
    }
    if (content.type === 'text' && content.mimeType === 'text/markdown' && content.text) {
      richContent.push({
        type: 'text',
        text: content.text,
        mimeType: 'text/markdown',
      });
    }
  }

  if (
    richContent.length === 0 &&
    toolCall.toolName === 'diary.getTimeStats' &&
    toolCall.intentAnalysis &&
    (toolCall.intentAnalysis.intent === 'trend' || toolCall.intentAnalysis.output === 'chart')
  ) {
    const dailyBreakdown = extractDailyBreakdown(toolResult.structuredContent);
    if (dailyBreakdown) {
      const chartImage = await generateTrendChartImage(dailyBreakdown, toolCall.intentAnalysis);
      if (chartImage) {
        richContent.push({
          type: 'image',
          data: chartImage.data,
          mimeType: chartImage.mimeType,
        });
      }
    }
  }

  return {
    response,
    serviceUsed: serviceId,
    toolInvoked: toolCall.toolName,
    routingConfidence: routing.confidence,
    routingDetails: {
      tool: tool.name,
      service: serviceId,
      confidence: routing.confidence,
      reasoning: routing.reasoning,
    },
    structuredContent: toolResult.structuredContent,
    content: richContent.length > 0 ? richContent : undefined,
  };
}
