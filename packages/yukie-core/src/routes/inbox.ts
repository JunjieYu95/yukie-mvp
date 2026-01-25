import type { Request, Response } from 'express';
import type { AuthContext } from '../../../shared/protocol/src/types';
import { getJobsByUser, getJob, getInboxStats } from '../inbox';
import { canAccessInbox, checkRateLimit } from '../policy';
import { createLogger } from '../../../shared/observability/src/logger';

const logger = createLogger('inbox-route');

// Extend Request type for auth
interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

// ============================================================================
// Middleware: Check inbox access
// ============================================================================

function checkInboxAccess(req: AuthenticatedRequest, res: Response): boolean {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }

  const policyResult = canAccessInbox(req.auth);
  if (!policyResult.allowed) {
    res.status(403).json({
      error: 'Forbidden',
      message: policyResult.reason,
      missingScopes: policyResult.missingScopes,
    });
    return false;
  }

  const rateResult = checkRateLimit(req.auth.userId, 'inbox');
  res.setHeader('X-RateLimit-Remaining', String(rateResult.remaining || 0));
  res.setHeader('X-RateLimit-Reset', String(rateResult.resetAt || 0));

  if (!rateResult.allowed) {
    res.status(429).json({
      error: 'Too Many Requests',
      message: rateResult.reason,
      resetAt: rateResult.resetAt,
    });
    return false;
  }

  return true;
}

// ============================================================================
// GET /api/inbox
// ============================================================================

export function handleListInbox(req: AuthenticatedRequest, res: Response): void {
  if (!checkInboxAccess(req, res)) return;

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const result = getJobsByUser(req.auth!.userId, limit, offset);

    logger.debug('Inbox listed', {
      userId: req.auth!.userId,
      total: result.total,
      returned: result.jobs.length,
    });

    res.json(result);
  } catch (error) {
    logger.error('Error listing inbox', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// ============================================================================
// GET /api/inbox/stats
// ============================================================================

export function handleInboxStats(req: AuthenticatedRequest, res: Response): void {
  if (!checkInboxAccess(req, res)) return;

  try {
    const stats = getInboxStats(req.auth!.userId);

    logger.debug('Inbox stats retrieved', {
      userId: req.auth!.userId,
      stats,
    });

    res.json(stats);
  } catch (error) {
    logger.error('Error getting inbox stats', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// ============================================================================
// GET /api/inbox/:id
// ============================================================================

export function handleGetJob(req: AuthenticatedRequest, res: Response): void {
  if (!checkInboxAccess(req, res)) return;

  const jobId = req.params.id;

  try {
    const job = getJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Not Found', message: 'Job not found' });
      return;
    }

    // Ensure user owns this job
    if (job.userId !== req.auth!.userId) {
      res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
      return;
    }

    logger.debug('Job retrieved', { jobId, userId: req.auth!.userId });

    res.json(job);
  } catch (error) {
    logger.error('Error getting job', error, { jobId });
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// ============================================================================
// Express Router Setup Helper
// ============================================================================

export function setupInboxRoutes(app: {
  get: (path: string, handler: (req: Request, res: Response) => void) => void;
}): void {
  app.get('/api/inbox', handleListInbox as (req: Request, res: Response) => void);
  app.get('/api/inbox/stats', handleInboxStats as (req: Request, res: Response) => void);
  app.get('/api/inbox/:id', handleGetJob as (req: Request, res: Response) => void);
}
