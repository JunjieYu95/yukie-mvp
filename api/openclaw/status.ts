import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest, hasScope } from '../_lib/auth.js';
import { OpenClawGatewayClient } from '@openclaw/gateway-client';
import WebSocket from 'ws';
import * as crypto from 'crypto';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Yukie-User-Id, X-Yukie-Scopes, X-Yukie-Request-Id, X-OpenClaw-Proxy-Secret'
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function hasValidProxySecret(req: VercelRequest): boolean {
  const secret = process.env.OPENCLAW_PROXY_SECRET;
  if (!secret) return true;
  const header = req.headers['x-openclaw-proxy-secret'];
  const headerValue = Array.isArray(header) ? header[0] : header;
  const cookies = parseCookies(req.headers.cookie as string | undefined);
  const cookieValue = cookies.yukie_proxy_secret;
  const candidate = headerValue || cookieValue;
  if (!candidate) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

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

  if (!hasScope(authResult.context, 'yukie:chat')) {
    res.status(403).json({ error: 'Forbidden', message: 'Missing required scope: yukie:chat' });
    return;
  }

  if (!hasValidProxySecret(req)) {
    res.status(403).json({ error: 'Forbidden', message: 'Missing or invalid OpenClaw proxy secret' });
    return;
  }

  try {
    const gatewayUrl = requireEnv('OPENCLAW_GATEWAY_URL');
    const gatewayToken = requireEnv('OPENCLAW_GATEWAY_TOKEN');

    // @ts-expect-error - Node global WebSocket is not typed in this environment
    globalThis.WebSocket = WebSocket;

    const client = new OpenClawGatewayClient({
      url: gatewayUrl,
      token: gatewayToken,
      clientId: 'webchat-ui',
      platform: 'node',
    });

    client.start();
    await client.waitForHello();
    res.status(200).json({ connected: true });
    client.stop();
  } catch (err) {
    res.status(200).json({
      connected: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
