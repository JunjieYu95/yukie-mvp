import type { LLMMessage, LLMCompletionOptions, LLMCompletionResult } from '../../../shared/protocol/src/types';
import { createLogger } from '../../../shared/observability/src/logger';

const logger = createLogger('llm-client');

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
    this.defaultModel = process.env.LLM_MODEL || 'claude-3-5-haiku-20241022';
  }

  getProvider(): string {
    return 'anthropic';
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
      logger.error('Anthropic API error', new Error(errorText), { status: response.status });
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    const content = data.content?.[0]?.text || '';

    logger.debug('Anthropic API response', {
      model: data.model,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    });

    return {
      content,
      model: data.model,
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
      logger.error('OpenAI API error', new Error(errorText), { status: response.status });
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    const content = data.choices?.[0]?.message?.content || '';

    logger.debug('OpenAI API response', {
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    });

    return {
      content,
      model: data.model,
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

  const provider = process.env.LLM_PROVIDER?.toLowerCase() || 'anthropic';

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
  return client.complete(messages, options);
}

// ============================================================================
// JSON Response Helper
// ============================================================================

export async function completeWithJSON<T>(
  messages: LLMMessage[],
  options?: LLMCompletionOptions
): Promise<{ result: T | null; raw: string; error?: string }> {
  const result = await complete(messages, options);
  const content = result.content.trim();

  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                      content.match(/```\s*([\s\S]*?)\s*```/) ||
                      [null, content];

    const jsonStr = jsonMatch[1] || content;
    const parsed = JSON.parse(jsonStr) as T;

    return { result: parsed, raw: content };
  } catch (error) {
    logger.warn('Failed to parse JSON from LLM response', { content }, error);
    return { result: null, raw: content, error: `JSON parse error: ${error}` };
  }
}
