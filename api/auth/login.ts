import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyPassword } from '../_lib/password.js';
import * as crypto from 'crypto';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Yukie-User-Id, X-Yukie-Scopes, X-Yukie-Request-Id'
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

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

function generateToken(userId: string, scopes: string[], expiresInDays: number = 7): string {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const expirySeconds = expiresInDays * 24 * 60 * 60;

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
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

function getCookieOptions() {
  const isProd = process.env.VERCEL_ENV === 'production';
  const maxAgeSeconds = 7 * 24 * 60 * 60;
  return {
    maxAgeSeconds,
    secure: isProd,
  };
}

function buildCookie(value: string, maxAgeSeconds: number, secure: boolean) {
  return [
    value,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { password } = req.body as { password?: string };
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'Bad Request', message: 'password is required' });
      return;
    }

    const passwordHash = requireEnv('APP_PASSWORD_HASH');
    const isValid = verifyPassword(password, passwordHash);
    if (!isValid) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
      return;
    }

    const userId = process.env.APP_USER_ID || 'owner';
    const scopes = SCOPES;
    const token = generateToken(userId, scopes, 7);

    const { maxAgeSeconds, secure } = getCookieOptions();
    const cookies = [
      buildCookie(`yukie_session=${encodeURIComponent(token)}`, maxAgeSeconds, secure),
    ];
    const proxySecret = process.env.OPENCLAW_PROXY_SECRET;
    if (proxySecret) {
      cookies.push(buildCookie(`yukie_proxy_secret=${encodeURIComponent(proxySecret)}`, maxAgeSeconds, secure));
    }

    res.setHeader('Set-Cookie', cookies);
    res.status(200).json({
      userId,
      scopes,
      expiresIn: '7d',
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to login',
    });
  }
}
