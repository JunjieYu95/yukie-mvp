import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { AuthContext } from '../../packages/shared/protocol/src/types';
import { authenticateRequest } from '../../packages/shared/auth/src/auth';
import { setCors } from '../_lib/cors.js';
import { getJob } from '../../packages/yukie-core/src/inbox';
import { canAccessInbox, checkRateLimit } from '../../packages/yukie-core/src/policy';
import { createLogger } from '../../packages/shared/observability/src/logger';

const logger = createLogger('api-inbox-job');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);

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

  const jobId = req.query.id as string;

  try {
    const job = getJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Not Found', message: 'Job not found' });
      return;
    }

    // Ensure user owns this job
    if (job.userId !== auth.userId) {
      res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
      return;
    }

    logger.debug('Job retrieved', { jobId, userId: auth.userId });

    res.status(200).json(job);
  } catch (error) {
    logger.error('Error getting job', error, { jobId });
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
