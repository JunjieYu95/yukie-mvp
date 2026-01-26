import type { Request, Response } from 'express';
import type { ChatRequest, ChatResponse, AuthContext } from '../../../shared/protocol/src/types';
import { processChatMessage } from '../router';
import { processMCPChatMessage, processLegacyChatMessage, type MCPChatFlowResult } from '../mcp-router';
import { canUseChat, checkRateLimit } from '../policy';
import { createLogger, startTimer } from '../../../shared/observability/src/logger';

// Use MCP protocol if environment variable is set
const USE_MCP = process.env.USE_MCP_PROTOCOL === 'true';

const logger = createLogger('chat-route');

// Extend Request type for auth
interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

// ============================================================================
// POST /api/chat
// ============================================================================

export async function handleChat(req: AuthenticatedRequest, res: Response): Promise<void> {
  const timer = startTimer();

  // Validate auth
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Check policy
  const policyResult = canUseChat(req.auth);
  if (!policyResult.allowed) {
    res.status(403).json({
      error: 'Forbidden',
      message: policyResult.reason,
      missingScopes: policyResult.missingScopes,
    });
    return;
  }

  // Check rate limit
  const rateResult = checkRateLimit(req.auth.userId, 'chat');
  res.setHeader('X-RateLimit-Remaining', String(rateResult.remaining || 0));
  res.setHeader('X-RateLimit-Reset', String(rateResult.resetAt || 0));

  if (!rateResult.allowed) {
    res.status(429).json({
      error: 'Too Many Requests',
      message: rateResult.reason,
      resetAt: rateResult.resetAt,
    });
    return;
  }

  // Validate request body
  const body = req.body as ChatRequest;
  if (!body.message || typeof body.message !== 'string') {
    res.status(400).json({ error: 'Bad Request', message: 'message is required' });
    return;
  }

  if (body.message.trim().length === 0) {
    res.status(400).json({ error: 'Bad Request', message: 'message cannot be empty' });
    return;
  }

  if (body.message.length > 10000) {
    res.status(400).json({ error: 'Bad Request', message: 'message is too long (max 10000 characters)' });
    return;
  }

  try {
    logger.info('Processing chat message', {
      userId: req.auth.userId,
      conversationId: body.conversationId,
      messageLength: body.message.length,
      useMCP: USE_MCP,
    });

    // Process the message using MCP or legacy router
    let result: MCPChatFlowResult | Awaited<ReturnType<typeof processChatMessage>>;

    if (USE_MCP) {
      // Use the new MCP router
      result = await processMCPChatMessage({
        message: body.message,
        auth: req.auth,
        conversationId: body.conversationId,
        model: body.model,
      });
    } else {
      // Use the legacy YWAIP router
      result = await processChatMessage({
        message: body.message,
        auth: req.auth,
        conversationId: body.conversationId,
        model: body.model,
      });
    }

    const timing = timer();

    // Build response (handle both MCP and legacy result formats)
    const actionOrTool = USE_MCP
      ? (result as MCPChatFlowResult).toolInvoked
      : (result as Awaited<ReturnType<typeof processChatMessage>>).actionInvoked;

    const response: ChatResponse = {
      response: result.response,
      conversationId: body.conversationId || generateConversationId(),
      serviceUsed: result.serviceUsed,
      actionInvoked: actionOrTool,
      routingDetails: result.routingDetails ? {
        targetService: result.routingDetails.service || result.routingDetails.targetService || 'unknown',
        confidence: result.routingDetails.confidence,
        reasoning: result.routingDetails.reasoning,
      } : undefined,
    };

    logger.info('Chat message processed', {
      userId: req.auth.userId,
      serviceUsed: result.serviceUsed,
      actionInvoked: actionOrTool,
      useMCP: USE_MCP,
      durationMs: timing.durationMs,
    });

    res.json(response);
  } catch (error) {
    const timing = timer();
    logger.error('Chat processing error', error, { durationMs: timing.durationMs });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while processing your message',
    });
  }
}

function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// Express Router Setup Helper
// ============================================================================

export function setupChatRoutes(app: { post: (path: string, handler: (req: Request, res: Response) => void) => void }): void {
  app.post('/api/chat', handleChat as (req: Request, res: Response) => void);
}
