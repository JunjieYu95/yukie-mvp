import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { AuthContext } from '../../packages/shared/protocol/src/types';
import { authenticateRequest } from '../../packages/shared/auth/src/auth';
import { getJobsByUser } from '../../packages/yukie-core/src/inbox';
import { canAccessInbox, checkRateLimit } from '../../packages/yukie-core/src/policy';
import { createLogger } from '../../packages/shared/observability/src/logger';

const logger = createLogger('api-inbox');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Yukie-User-Id, X-Yukie-Scopes, X-Yukie-Request-Id'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Authenticate request
  const authResult = await authenticateRequest({
    authorizationHeader: req.headers.authorization as string,
    yukieUserIdHeader: req.headers['x-yukie-user-id'] as string,
    yukieScopesHeader: req.headers['x-yukie-scopes'] as string,
    yukieRequestIdHeader: req.headers['x-yukie-request-id'] as string,
    cookieHeader: req.headers.cookie as string,
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
  const policyResult = canAccessInbox(auth);
  if (!policyResult.allowed) {
    res.status(403).json({
      error: 'Forbidden',
      message: policyResult.reason,
      missingScopes: policyResult.missingScopes,
    });
    return;
  }

  // Check rate limit
  const rateResult = checkRateLimit(auth.userId, 'inbox');
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

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = getJobsByUser(auth.userId, limit, offset);

    logger.debug('Inbox listed', {
      userId: auth.userId,
      total: result.total,
      returned: result.jobs.length,
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error('Error listing inbox', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
