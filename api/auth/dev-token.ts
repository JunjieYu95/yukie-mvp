import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCors } from '../_lib/cors.js';
import * as crypto from 'crypto';

// ============================================================================
// Inline JWT utilities (to avoid module resolution issues in Vercel)
// ============================================================================

const SCOPES = [
  'habit:read',
  'habit:write',
  'habit:delete',
  'yukie:chat',
  'yukie:inbox',
  'admin',
];

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function hmacSign(message: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(message);
  return hmac.digest('base64url');
}

interface JWTPayload {
  sub: string;
  scopes: string[];
  iat: number;
  exp: number;
}

function generateToken(userId: string, scopes: string[], expiresInDays: number = 30): string {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const expirySeconds = expiresInDays * 24 * 60 * 60;

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: JWTPayload = {
    sub: userId,
    scopes,
    iat: now,
    exp: now + expirySeconds,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const message = `${headerEncoded}.${payloadEncoded}`;
  const signature = hmacSign(message, secret);

  return `${message}.${signature}`;
}

// ============================================================================
// API Handler
// ============================================================================

// POST /api/auth/dev-token
// Generate a development token for testing
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow in non-production environments (but allow in preview/deployment for testing)
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
    const token = generateToken(userId, SCOPES, 30);

    res.status(200).json({
      token,
      userId,
      scopes: SCOPES,
      expiresIn: '30d',
    });
  } catch (error) {
    console.error('Failed to generate dev token:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to generate token',
    });
  }
}
