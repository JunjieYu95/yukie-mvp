import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest, hasScope, type AuthContext } from './_lib/auth';
import {
  processChatMessage,
  initializeRegistry,
  createLogger,
} from './_lib/yukie-core';

const logger = createLogger('api-chat');

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
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
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
    initializeRegistry();
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
    requestId
  );
  if (!authResult.success || !authResult.context) {
    res.status(401).json({
      error: 'Unauthorized',
      message: authResult.error || 'Authentication required',
    });
    return;
  }

  const auth: AuthContext = authResult.context;

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
      ensureRegistryInitialized();

      // Use the full routing system
      logger.info('Processing chat with routing', { userId: auth.userId, requestId });

      const result = await processChatMessage({
        message: body.message,
        auth,
        conversationId,
        model: body.model,
      });

      logger.info('Chat processed', {
        userId: auth.userId,
        requestId,
        serviceUsed: result.serviceUsed,
        routingConfidence: result.routingConfidence,
      });

      res.status(200).json({
        response: result.response,
        conversationId,
        serviceUsed: result.serviceUsed,
        actionInvoked: result.actionInvoked,
        routingDetails: result.routingDetails,
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
    logger.error('Chat error', error, { userId: auth.userId, requestId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while processing your message',
    });
  }
}
