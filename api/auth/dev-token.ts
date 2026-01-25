import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateDevToken } from '../../packages/shared/auth/src/auth';
import { createLogger } from '../../packages/shared/observability/src/logger';

const logger = createLogger('api-auth');

// POST /api/auth/dev-token
// Generate a development token for testing
// In production, this should be replaced with proper OAuth/OIDC flow
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

  // Only allow in non-production environments (but allow in preview/deployment for testing)
  // You can remove this check if you want to allow dev tokens in production
  if (process.env.VERCEL_ENV === 'production' && process.env.ALLOW_DEV_TOKEN !== 'true') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Dev token endpoint is not available in production',
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const userId = (req.body as { userId?: string })?.userId || `dev-user-${Date.now()}`;
    const token = await generateDevToken(userId);

    logger.info('Dev token generated', { userId });

    res.status(200).json({
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
