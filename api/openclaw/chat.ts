import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest, hasScope } from '../_lib/auth.js';
import { OpenClawGatewayClient } from '@openclaw/gateway-client';
import WebSocket from 'ws';
import * as crypto from 'crypto';

type ChatRequest = {
  message: string;
  sessionKey?: string;
};

type ChatEventPayload = {
  runId?: string;
  sessionKey?: string;
  state?: 'delta' | 'final' | 'aborted' | 'error';
  message?: { content?: Array<{ type?: string; text?: string }> };
  errorMessage?: string;
};

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

function extractDeltaText(payload: ChatEventPayload): string {
  const blocks = payload.message?.content;
  if (!blocks || blocks.length === 0) return '';
  const textBlock = blocks.find((b) => b?.type === 'text');
  return textBlock?.text || '';
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

  const body = req.body as ChatRequest;
  if (!body?.message || typeof body.message !== 'string') {
    res.status(400).json({ error: 'Bad Request', message: 'message is required' });
    return;
  }

  const gatewayUrl = requireEnv('OPENCLAW_GATEWAY_URL');
  const gatewayToken = requireEnv('OPENCLAW_GATEWAY_TOKEN');
  const sessionKey = body.sessionKey || 'main';

  // Provide WebSocket for gateway client in Node.
  // @ts-expect-error - Node global WebSocket is not typed in this environment
  globalThis.WebSocket = WebSocket;

  let onEvent: ((evt: { event: string; payload?: unknown }) => void) | null = null;

  const client = new OpenClawGatewayClient({
    url: gatewayUrl,
    token: gatewayToken,
    clientId: 'webchat-ui',
    platform: 'node',
    onEvent: (evt) => onEvent?.(evt),
  });

  let lastText = '';
  let runId: string | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('OpenClaw timeout')), 30_000);

      client.start();

      client.waitForHello()
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeout));
    });

    const result = (await client.request('chat.send', {
      sessionKey,
      message: body.message,
      deliver: false,
      idempotencyKey: crypto.randomUUID(),
    })) as { runId?: string };

    runId = result.runId || null;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('OpenClaw response timeout')), 60_000);

      onEvent = (evt: { event: string; payload?: unknown }) => {
        if (evt.event !== 'chat') return;
        const payload = evt.payload as ChatEventPayload;
        if (runId && payload.runId && payload.runId !== runId) return;

        if (payload.state === 'delta') {
          const text = extractDeltaText(payload);
          if (text) lastText = text;
        } else if (payload.state === 'final') {
          clearTimeout(timeout);
          resolve();
        } else if (payload.state === 'error') {
          clearTimeout(timeout);
          reject(new Error(payload.errorMessage || 'OpenClaw error'));
        } else if (payload.state === 'aborted') {
          clearTimeout(timeout);
          reject(new Error('OpenClaw message aborted'));
        }
      };

    });

    res.status(200).json({ text: lastText, runId });
  } catch (err) {
    res.status(500).json({ error: 'OpenClaw proxy failed', message: err instanceof Error ? err.message : String(err) });
  } finally {
    client.stop();
  }
}
