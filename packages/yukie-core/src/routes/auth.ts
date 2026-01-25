import type { Request, Response } from 'express';
import { generateDevToken } from '../../../shared/auth/src/auth';
import { createLogger } from '../../../shared/observability/src/logger';

const logger = createLogger('auth-route');

// ============================================================================
// POST /api/auth/dev-token
// ============================================================================
// Development-only endpoint to generate a token for testing
// In production, this should be replaced with proper OAuth/OIDC flow

export async function handleDevToken(req: Request, res: Response): Promise<void> {
  // Only allow in development (check NODE_ENV)
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Dev token endpoint is not available in production',
    });
    return;
  }

  try {
    const userId = (req.body?.userId as string) || `dev-user-${Date.now()}`;
    const token = await generateDevToken(userId);

    logger.info('Dev token generated', { userId });

    res.json({
      token,
      userId,
      scopes: [
        'habit:read',
        'habit:write',
        'habit:delete',
        'yukie:chat',
        'yukie:inbox',
        'admin',
      ],
      expiresIn: '30d',
    });
  } catch (error) {
    logger.error('Failed to generate dev token', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate token',
    });
  }
}

// ============================================================================
// Express Router Setup Helper
// ============================================================================

export function setupAuthRoutes(app: {
  post: (path: string, handler: (req: Request, res: Response) => void | Promise<void>) => void;
}): void {
  app.post('/api/auth/dev-token', handleDevToken);
}
