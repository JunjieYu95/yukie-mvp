import type { LLMMessage, LLMCompletionOptions, LLMCompletionResult } from '../../../shared/protocol/src/types.js';
import { createLogger } from '../../../shared/observability/src/logger.js';

const logger = createLogger('llm-client');

// ============================================================================
// API Response Types
// ============================================================================

interface AnthropicResponse {
  content?: Array<{ text?: string }>;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

// ============================================================================
// LLM Client Interface
// ============================================================================

export interface LLMClient {
  complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletionResult>;
  getProvider(): string;
}

// ============================================================================
// Anthropic Client
// ============================================================================

class AnthropicClient implements LLMClient {
  private apiKey: string;
  private defaultModel: string;

  constructor() {
    const apiKey = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('LLM_API_KEY or ANTHROPIC_API_KEY environment variable is not set');
    }
    this.apiKey = apiKey;
    this.defaultModel = process.env.LLM_MODEL || 'claude-sonnet-4-5-20250929';
  }

  getProvider(): string {
    return 'anthropic';
  }

  private parseAPIErrorDetail(errorText: string): string {
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) return parsed.error.message;
      if (parsed.message) return parsed.message;
    } catch {
      // Not JSON, use raw text
    }
    return errorText.substring(0, 200);
  }

  private formatAPIError(provider: string, status: number, detail: string): string {
    switch (status) {
      case 401:
        return `${provider} API authentication failed: Invalid or expired API key. Check that LLM_API_KEY or ANTHROPIC_API_KEY is set correctly.`;
      case 403:
        return `${provider} API access denied: Your API key does not have permission for this operation. Detail: ${detail}`;
      case 404:
        return `${provider} API model not found: The requested model may not exist or you may not have access to it. Detail: ${detail}`;
      case 429:
        return `${provider} API rate limit exceeded: Too many requests or token quota exhausted. Please wait and retry. Detail: ${detail}`;
      case 500:
        return `${provider} API internal server error: The API service encountered an unexpected error. This is usually temporary. Detail: ${detail}`;
      case 502:
      case 503:
        return `${provider} API service unavailable: The API is temporarily down or overloaded. Please retry shortly. Detail: ${detail}`;
      case 529:
        return `${provider} API overloaded: The API is currently overloaded. Please retry after a brief wait. Detail: ${detail}`;
      default:
        return `${provider} API error (HTTP ${status}): ${detail}`;
    }
  }

  async complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const model = options?.model || this.defaultModel;

    // Separate system message from conversation
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const requestBody: Record<string, unknown> = {
      model,
      max_tokens: options?.maxTokens || 4096,
      messages: conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemMessage) {
      requestBody.system = systemMessage.content;
    }

    if (options?.temperature !== undefined) {
      requestBody.temperature = options.temperature;
    }

    if (options?.stopSequences) {
      requestBody.stop_sequences = options.stopSequences;
    }

    logger.debug('Anthropic API request', { model, messageCount: messages.length });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorDetail = this.parseAPIErrorDetail(errorText);
      logger.error('Anthropic API error', new Error(errorText), {
        status: response.status,
        model,
        messageCount: messages.length,
        errorDetail,
      });
      throw new Error(this.formatAPIError('Anthropic', response.status, errorDetail));
    }

    const data = await response.json() as AnthropicResponse;

    if (!data.content || data.content.length === 0) {
      logger.warn('Anthropic API returned empty content', { model: data.model });
    }

    const content = data.content?.[0]?.text || '';

    logger.debug('Anthropic API response', {
      model: data.model,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    });

    return {
      content,
      model: data.model || '',
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
    };
  }
}

// ============================================================================
// OpenAI Client
// ============================================================================

class OpenAIClient implements LLMClient {
  private apiKey: string;
  private defaultModel: string;

  constructor() {
    const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('LLM_API_KEY or OPENAI_API_KEY environment variable is not set');
    }
    this.apiKey = apiKey;
    this.defaultModel = process.env.LLM_MODEL || 'gpt-4-turbo';
  }

  getProvider(): string {
    return 'openai';
  }

  private parseAPIErrorDetail(errorText: string): string {
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) return parsed.error.message;
      if (parsed.message) return parsed.message;
    } catch {
      // Not JSON, use raw text
    }
    return errorText.substring(0, 200);
  }

  private formatAPIError(provider: string, status: number, detail: string): string {
    switch (status) {
      case 401:
        return `${provider} API authentication failed: Invalid or expired API key. Check that LLM_API_KEY or OPENAI_API_KEY is set correctly.`;
      case 403:
        return `${provider} API access denied: Your API key does not have permission for this operation. Detail: ${detail}`;
      case 404:
        return `${provider} API model not found: The requested model may not exist or you may not have access to it. Detail: ${detail}`;
      case 429:
        return `${provider} API rate limit exceeded: Too many requests or token quota exhausted. Please wait and retry. Detail: ${detail}`;
      case 500:
        return `${provider} API internal server error: The API service encountered an unexpected error. This is usually temporary. Detail: ${detail}`;
      case 502:
      case 503:
        return `${provider} API service unavailable: The API is temporarily down or overloaded. Please retry shortly. Detail: ${detail}`;
      default:
        return `${provider} API error (HTTP ${status}): ${detail}`;
    }
  }

  async complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const model = options?.model || this.defaultModel;

    const requestBody: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (options?.maxTokens) {
      requestBody.max_tokens = options.maxTokens;
    }

    if (options?.temperature !== undefined) {
      requestBody.temperature = options.temperature;
    }

    if (options?.stopSequences) {
      requestBody.stop = options.stopSequences;
    }

    logger.debug('OpenAI API request', { model, messageCount: messages.length });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorDetail = this.parseAPIErrorDetail(errorText);
      logger.error('OpenAI API error', new Error(errorText), {
        status: response.status,
        model,
        messageCount: messages.length,
        errorDetail,
      });
      throw new Error(this.formatAPIError('OpenAI', response.status, errorDetail));
    }

    const data = await response.json() as OpenAIResponse;

    if (!data.choices || data.choices.length === 0) {
      logger.warn('OpenAI API returned empty choices', { model: data.model });
    }

    const content = data.choices?.[0]?.message?.content || '';

    logger.debug('OpenAI API response', {
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    });

    return {
      content,
      model: data.model || '',
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
    };
  }
}

// ============================================================================
// Client Factory
// ============================================================================

let clientInstance: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (clientInstance) {
    return clientInstance;
  }

  const provider = (process.env.LLM_PROVIDER || 'anthropic').trim().toLowerCase();

  switch (provider) {
    case 'anthropic':
      clientInstance = new AnthropicClient();
      break;
    case 'openai':
      clientInstance = new OpenAIClient();
      break;
    default:
      throw new Error(`Unknown LLM provider: ${provider}. Supported: anthropic, openai`);
  }

  logger.info('LLM client initialized', { provider });
  return clientInstance;
}

// For testing - reset the singleton
export function resetLLMClient(): void {
  clientInstance = null;
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function complete(
  messages: LLMMessage[],
  options?: LLMCompletionOptions
): Promise<LLMCompletionResult> {
  const client = getLLMClient();
  try {
    return await client.complete(messages, options);
  } catch (error) {
    // Enhance network-level errors with more context
    if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network'))) {
      throw new Error(`LLM API network error: Unable to reach ${client.getProvider()} API. Check your internet connection and API endpoint configuration. Original error: ${error.message}`);
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`LLM API timeout: Request to ${client.getProvider()} API timed out. The model may be overloaded or the request too large.`);
    }
    throw error;
  }
}

// ============================================================================
// JSON Response Helper
// ============================================================================

/**
 * Extract JSON from LLM response with multiple fallback strategies
 */
function extractJSON(content: string): string | null {
  // Strategy 1: Look for ```json ... ``` blocks
  const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch?.[1]) {
    return jsonBlockMatch[1].trim();
  }

  // Strategy 2: Look for ``` ... ``` blocks (generic code block)
  const codeBlockMatch = content.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch?.[1]) {
    const inner = codeBlockMatch[1].trim();
    // Verify it looks like JSON
    if (inner.startsWith('{') || inner.startsWith('[')) {
      return inner;
    }
  }

  // Strategy 3: Find JSON object directly in content
  // Look for first { and last matching }
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const potentialJson = content.slice(firstBrace, lastBrace + 1);
    try {
      JSON.parse(potentialJson);
      return potentialJson;
    } catch {
      // Not valid JSON, continue
    }
  }

  // Strategy 4: Find JSON array directly in content
  const firstBracket = content.indexOf('[');
  const lastBracket = content.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const potentialJson = content.slice(firstBracket, lastBracket + 1);
    try {
      JSON.parse(potentialJson);
      return potentialJson;
    } catch {
      // Not valid JSON, continue
    }
  }

  // Strategy 5: If entire content looks like JSON, use it
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }

  return null;
}

export async function completeWithJSON<T>(
  messages: LLMMessage[],
  options?: LLMCompletionOptions
): Promise<{ result: T | null; raw: string; error?: string }> {
  const result = await complete(messages, options);
  const content = result.content.trim();

  try {
    // Use robust JSON extraction
    const jsonStr = extractJSON(content);

    if (!jsonStr) {
      logger.warn('No JSON found in LLM response', { content: content.substring(0, 200) });
      return { result: null, raw: content, error: `LLM response did not contain valid JSON. The model returned plain text instead of the expected structured format. Response preview: "${content.substring(0, 100)}..."` };
    }

    const parsed = JSON.parse(jsonStr) as T;
    return { result: parsed, raw: content };
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error);
    logger.warn('Failed to parse JSON from LLM response', { content: content.substring(0, 200) }, error);
    return { result: null, raw: content, error: `LLM response contained malformed JSON that could not be parsed. Parse error: ${parseError}. Response preview: "${content.substring(0, 100)}..."` };
  }
}
