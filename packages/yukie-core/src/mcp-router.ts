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
    return {
      selectedTool: null,
      confidence: 1.0,
      reasoning: targetService
        ? `Target service '${targetService}' is not available`
        : 'No services are currently available',
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
    return {
      selectedTool: null,
      confidence: 0,
      reasoning: 'No tools available from any service',
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
      logger.warn('Failed to parse tool selection result', { error, durationMs: timing.durationMs });
      return {
        selectedTool: null,
        confidence: 0,
        reasoning: 'Failed to determine tool selection',
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
    logger.error('Tool routing error', error);
    return {
      selectedTool: null,
      confidence: 0,
      reasoning: 'Tool routing failed due to an error',
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
    logger.warn('Failed to format response with LLM', {}, error);

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
    logger.error('Fallback response generation failed', error);
    return "I'm sorry, I'm having trouble processing your request right now. Please try again later.";
  }
}

// ============================================================================
// Parameter Selection
// ============================================================================

interface SelectedToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export async function selectToolParameters(
  userMessage: string,
  tool: MCPTool,
  model?: string
): Promise<SelectedToolCall | null> {
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
The 'category' parameter is REQUIRED and must be inferred from the activity title:
- "prod" (Productive): coding, programming, work, meetings, learning, studying, reading (default), projects, exercise, gym, running, meditation, writing, research, tutorials
- "nonprod" (Non-productive): gaming, watching TV/movies/YouTube/Netflix, social media, browsing, entertainment, leisure, hanging out, playing games, reading novels, personal calls (call with mom/dad/friend), date night
- "admin" (Admin/Rest): meals (breakfast/lunch/dinner), eating, cooking, sleeping, napping, rest, shower, commute, errands, chores, routine tasks, breaks, appointments, walking the dog

Examples:
- "vibe coding" → category: "prod"
- "watching Netflix" → category: "nonprod"  
- "lunch" → category: "admin"
- "reading" → category: "prod" (default to productive learning)
- "reading a novel" → category: "nonprod" (leisure reading)
- "reading documentation" → category: "prod" (work/learning)
- "gym workout" → category: "prod"
- "taking a shower" → category: "admin"
- "lanius run" or game runs → category: "nonprod" (gaming)
- "playing Fallout" or "Elden Ring" → category: "nonprod" (gaming)
- "call with mom" → category: "nonprod" (personal/social)
- "client call" or "standup" → category: "prod" (work)
- "date night" → category: "nonprod" (social)
- "walking the dog" → category: "admin" (chore)

If the activity is ambiguous (could fit multiple categories), include "categoryConfidence": "low" in your response.
Otherwise include "categoryConfidence": "high".

`;
  }

  // Build a clearer prompt with examples
  const prompt = `You are a parameter extractor. Given a user message and a tool, extract the parameter values as JSON.

Tool: ${tool.name}
Description: ${tool.description}
Parameters:
${params}

User message: "${userMessage}"
${categoryInstructions}
Rules:
- Extract the activity/task name as the "title" parameter
- Only include date/month parameters if the user explicitly specifies an absolute date or month (e.g., YYYY-MM-DD or YYYY-MM).
- If the user says "today", "yesterday", "this week", or "this month", omit date/month parameters and let the server resolve them.
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

      logger.info('Parameter extraction successful', { 
        toolName: tool.name, 
        args,
        attempt,
      });

      return {
        toolName: tool.name,
        args,
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
}

export async function processMCPChatMessage(options: MCPChatFlowOptions): Promise<MCPChatFlowResult> {
  const { message, auth, model, targetService } = options;

  // Step 1: Route to the best tool (with optional direct service targeting)
  const routing = await routeToTool(message, model, targetService);

  // Step 2: Handle routing result
  if (!routing.selectedTool || routing.confidence < 0.5) {
    // No good tool match - generate a fallback response
    const response = await generateFallbackResponse(message, model);
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
  const toolCall = await selectToolParameters(message, tool, model);

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
    response = `I encountered an issue: ${errorText || 'Unknown error'}. Please try again.`;
  } else {
    response = await formatResponse(message, toolResult, serviceName, model);
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
  };
}
