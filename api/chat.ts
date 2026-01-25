import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ChatRequest, ChatResponse, AuthContext } from '../packages/shared/protocol/src/types';
import { authenticateRequest } from '../packages/shared/auth/src/auth';
import { initializeRegistry } from '../packages/yukie-core/src/registry';
import { processChatMessage } from '../packages/yukie-core/src/router';
import { canUseChat, checkRateLimit } from '../packages/yukie-core/src/policy';
import { createLogger, startTimer } from '../packages/shared/observability/src/logger';

const logger = createLogger('api-chat');

// Initialize registry on cold start
initializeRegistry();

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

  const timer = startTimer();

  // Authenticate request
  const authResult = await authenticateRequest({
    authorizationHeader: req.headers.authorization as string,
    yukieUserIdHeader: req.headers['x-yukie-user-id'] as string,
    yukieScopesHeader: req.headers['x-yukie-scopes'] as string,
    yukieRequestIdHeader: req.headers['x-yukie-request-id'] as string,
  });

  if (!authResult.success || !authResult.context) {
    res.status(401).json({
      error: 'Unauthorized',
      message: authResult.error || 'Authentication required',
    });
    return;
  }

  const auth: AuthContext = authResult.context;

  // Check policy
  const policyResult = canUseChat(auth);
  if (!policyResult.allowed) {
    res.status(403).json({
      error: 'Forbidden',
      message: policyResult.reason,
      missingScopes: policyResult.missingScopes,
    });
    return;
  }

  // Check rate limit
  const rateResult = checkRateLimit(auth.userId, 'chat');
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
      userId: auth.userId,
      conversationId: body.conversationId,
      messageLength: body.message.length,
    });

    // Process the message
    const result = await processChatMessage({
      message: body.message,
      auth,
      conversationId: body.conversationId,
      model: body.model,
    });

    const timing = timer();

    // Build response
    const response: ChatResponse = {
      response: result.response,
      conversationId: body.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      serviceUsed: result.serviceUsed,
      actionInvoked: result.actionInvoked,
      routingDetails: result.routingDetails,
    };

    logger.info('Chat message processed', {
      userId: auth.userId,
      serviceUsed: result.serviceUsed,
      actionInvoked: result.actionInvoked,
      durationMs: timing.durationMs,
    });

    res.status(200).json(response);
  } catch (error) {
    const timing = timer();
    logger.error('Chat processing error', error, { durationMs: timing.durationMs });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while processing your message',
    });
  }
}
