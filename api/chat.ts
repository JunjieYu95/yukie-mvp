import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest, hasScope, type AuthContext } from './_lib/auth.js';
import {
  processMCPChatMessage,
  initializeMCPRegistry,
  createLogger,
} from './_lib/yukie-core.js';

// Wrap logger creation in try-catch to prevent cold start crashes
let logger: ReturnType<typeof createLogger>;
try {
  logger = createLogger('api-chat');
} catch (e) {
  // Fallback logger if createLogger fails
  logger = {
    info: (...args: unknown[]) => console.log('[INFO]', ...args),
    warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
    error: (...args: unknown[]) => console.error('[ERROR]', ...args),
    debug: (...args: unknown[]) => console.log('[DEBUG]', ...args),
  } as ReturnType<typeof createLogger>;
}

// Flag to control routing - can be toggled for debugging
const ENABLE_ROUTING = process.env.ENABLE_ROUTING !== 'false';

// ============================================================================
// Fallback Direct LLM Call (when routing is disabled)
// ============================================================================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function callAnthropicDirect(messages: ChatMessage[], model?: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const selectedModel = model || process.env.LLM_MODEL || 'claude-3-5-haiku-20241022';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: selectedModel,
      max_tokens: 4096,
      system: 'You are Yukie, a helpful AI assistant. Be friendly, concise, and helpful.',
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorDetail = errorText.substring(0, 200);
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) errorDetail = parsed.error.message;
    } catch { /* not JSON */ }

    switch (response.status) {
      case 401:
        throw new Error(`Anthropic API authentication failed: Invalid or expired API key. Check ANTHROPIC_API_KEY environment variable.`);
      case 429:
        throw new Error(`Anthropic API rate limit exceeded: Too many requests or token quota exhausted. Please wait and retry. Detail: ${errorDetail}`);
      case 500:
      case 502:
      case 503:
        throw new Error(`Anthropic API service error (HTTP ${response.status}): The API is temporarily unavailable. Please retry shortly. Detail: ${errorDetail}`);
      case 529:
        throw new Error(`Anthropic API overloaded: The API is currently overloaded. Please retry after a brief wait.`);
      default:
        throw new Error(`Anthropic API error (HTTP ${response.status}): ${errorDetail}`);
    }
  }

  const data = (await response.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text || 'I could not generate a response.';
}

// ============================================================================
// API Handler
// ============================================================================

interface ChatRequest {
  message: string;
  conversationId?: string;
  model?: string;
}

// Initialize registry on cold start
let registryInitialized = false;

function ensureRegistryInitialized(): void {
  if (!registryInitialized) {
    initializeMCPRegistry();
    registryInitialized = true;
    logger.info('Registry initialized');
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Yukie-User-Id, X-Yukie-Scopes, X-Yukie-Request-Id'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Generate request ID
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Authenticate
  const authResult = authenticateRequest(
    req.headers.authorization,
    requestId,
    req.headers.cookie as string | undefined
  );
  if (!authResult.success || !authResult.context) {
    res.status(401).json({
      error: 'Unauthorized',
      message: authResult.error || 'Authentication required',
    });
    return;
  }

  const auth: AuthContext = authResult.context;
  const utcOffsetHeader = req.headers['x-yukie-utc-offset-minutes'];
  const utcOffsetMinutes = Array.isArray(utcOffsetHeader)
    ? parseInt(utcOffsetHeader[0] || '', 10)
    : parseInt(utcOffsetHeader || '', 10);
  if (Number.isFinite(utcOffsetMinutes)) {
    auth.utcOffsetMinutes = utcOffsetMinutes;
  }

  // Check for chat scope
  if (!hasScope(auth, 'yukie:chat')) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Missing required scope: yukie:chat',
    });
    return;
  }

  // Validate request
  const body = req.body as ChatRequest;
  if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
    res.status(400).json({ error: 'Bad Request', message: 'message is required' });
    return;
  }

  if (body.message.length > 10000) {
    res.status(400).json({ error: 'Bad Request', message: 'message is too long (max 10000 characters)' });
    return;
  }

  const conversationId =
    body.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  try {
    if (ENABLE_ROUTING) {
      // Initialize registry if needed
      try {
        ensureRegistryInitialized();
      } catch (initError) {
        const initMsg = initError instanceof Error ? initError.message : String(initError);
        console.error('[CHAT] Registry initialization failed:', initError);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Service registry failed to initialize. No services are available to handle your request. This usually indicates a configuration issue.',
          stage: 'registry_init',
          detail: initMsg,
        });
        return;
      }

      // Use the full routing system
      logger.info('Processing chat with routing', { userId: auth.userId, requestId });

      let result;
      try {
        result = await processMCPChatMessage({
          message: body.message,
          auth,
          conversationId,
          model: body.model,
        });
      } catch (processError) {
        const errorMsg = processError instanceof Error ? processError.message : String(processError);
        console.error('[CHAT] processMCPChatMessage failed:', processError);

        // Categorize for user-friendly error messages
        let userMessage: string;
        let stage: string;

        if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
          userMessage = 'The AI service is currently rate limited. Please wait a moment and try again.';
          stage = 'llm_rate_limit';
        } else if (errorMsg.includes('authentication') || errorMsg.includes('401') || errorMsg.includes('API key')) {
          userMessage = 'There is an issue with the AI service configuration. Please contact the administrator.';
          stage = 'llm_auth';
        } else if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
          userMessage = 'The request took too long to process. Please try again.';
          stage = 'timeout';
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('Cannot reach')) {
          userMessage = 'Unable to connect to a required service. Please try again later.';
          stage = 'network';
        } else if (errorMsg.includes('not found')) {
          userMessage = 'The requested service or tool could not be found.';
          stage = 'not_found';
        } else {
          userMessage = 'An error occurred while processing your message. Please try again.';
          stage = 'process_chat';
        }

        res.status(500).json({
          error: 'Internal Server Error',
          message: userMessage,
          stage,
          detail: errorMsg,
        });
        return;
      }

      logger.info('Chat processed', {
        userId: auth.userId,
        requestId,
        serviceUsed: result.serviceUsed,
        routingConfidence: result.routingConfidence,
      });

      // Transform routingDetails to expected format
      const routingDetails = result.routingDetails ? {
        targetService: result.routingDetails.service || 'none',
        tool: result.routingDetails.tool || 'none',
        confidence: result.routingDetails.confidence,
        reasoning: result.routingDetails.reasoning,
      } : undefined;

      res.status(200).json({
        response: result.response,
        conversationId,
        serviceUsed: result.serviceUsed,
        actionInvoked: result.toolInvoked,
        routingDetails,
        // Include rich content (images, etc.) if present
        content: result.content,
      });
    } else {
      // Fallback to direct LLM call (routing disabled)
      logger.info('Processing chat without routing (fallback mode)', { userId: auth.userId, requestId });

      const response = await callAnthropicDirect(
        [{ role: 'user', content: body.message }],
        body.model
      );

      res.status(200).json({
        response,
        conversationId,
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[CHAT] Unhandled error:', error);
    logger.error('Chat error', error, { userId: auth.userId, requestId });

    let userMessage: string;
    let stage: string;

    if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
      userMessage = 'The AI service is currently rate limited. Please wait and try again.';
      stage = 'llm_rate_limit';
    } else if (errorMsg.includes('authentication') || errorMsg.includes('API key')) {
      userMessage = 'There is a service configuration issue. Please contact the administrator.';
      stage = 'llm_auth';
    } else if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
      userMessage = 'The request timed out. Please try again.';
      stage = 'timeout';
    } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
      userMessage = 'Unable to reach a required service. Please try again later.';
      stage = 'network';
    } else {
      userMessage = 'An unexpected error occurred while processing your message. Please try again.';
      stage = 'unknown';
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: userMessage,
      stage,
      detail: errorMsg,
    });
  }
}
