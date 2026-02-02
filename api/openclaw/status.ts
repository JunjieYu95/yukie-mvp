import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'crypto';
import WebSocket from 'ws';
import { authenticateRequest, hasScope } from '../_lib/auth.js';

type RpcFrame =
  | { type: 'req'; id: string; method: string; params?: unknown }
  | { type: 'res'; id: string; ok: boolean; result?: unknown; error?: { message?: string } };

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

async function openclawConnect(ws: WebSocket, token: string): Promise<void> {
  const id = crypto.randomUUID();
  const frame: RpcFrame = {
    type: 'req',
    id,
    method: 'connect',
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'webchat-ui',
        version: '1.0.0',
        platform: 'node',
        mode: 'webchat',
      },
      role: 'operator',
      scopes: ['operator.admin', 'operator.approvals', 'operator.pairing'],
      caps: [],
      auth: { token },
    },
  };

  const result = await new Promise<RpcFrame>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('connect timeout')), 20_000);
    const onMessage = (data: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(String(data)) as RpcFrame;
        if (parsed.type === 'res' && parsed.id === id) {
          clearTimeout(timeout);
          ws.off('message', onMessage);
          resolve(parsed);
        }
      } catch {
        // ignore
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify(frame));
  });

  if (result.type !== 'res' || !result.ok) {
    throw new Error(result.type === 'res' ? result.error?.message || 'connect failed' : 'connect failed');
  }
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

    const ws = new WebSocket(gatewayUrl);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', (err) => reject(err));
      setTimeout(() => reject(new Error('socket open timeout')), 15_000);
    });

    await openclawConnect(ws, gatewayToken);
    ws.close();

    res.status(200).json({ connected: true });
  } catch (err) {
    res.status(200).json({
      connected: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
