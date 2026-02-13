import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest } from '../_lib/auth.js';
import { setCors } from '../_lib/cors.js';

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

  const authResult = authenticateRequest(
    req.headers.authorization,
    `req_${Date.now()}`,
    req.headers.cookie as string | undefined
  );

  if (!authResult.success || !authResult.context) {
    res.status(401).json({ error: 'Unauthorized', message: authResult.error || 'Authentication required' });
    return;
  }

  res.status(200).json({
    userId: authResult.context.userId,
    scopes: authResult.context.scopes,
  });
}
