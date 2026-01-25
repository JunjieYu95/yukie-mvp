import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// ============================================================================
// Inline Auth Utilities
// ============================================================================

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

function base64UrlDecode(data: string): string {
  let padded = data.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) {
    padded += '=';
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}

function hmacVerify(message: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(message);
  const expectedSignature = hmac.digest('base64url');
  return signature === expectedSignature;
}

interface JWTPayload {
  sub: string;
  scopes: string[];
  iat: number;
  exp: number;
}

interface AuthContext {
  userId: string;
  scopes: string[];
}

function validateToken(token: string): { valid: boolean; payload?: JWTPayload; error?: string } {
  try {
    const secret = getJwtSecret();
    const parts = token.split('.');

    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [headerEncoded, payloadEncoded, signature] = parts;
    const message = `${headerEncoded}.${payloadEncoded}`;

    if (!hmacVerify(message, signature, secret)) {
      return { valid: false, error: 'Invalid signature' };
    }

    const payload = JSON.parse(base64UrlDecode(payloadEncoded)) as JWTPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: `Token validation failed: ${error}` };
  }
}

function authenticateRequest(authHeader?: string): { success: boolean; context?: AuthContext; error?: string } {
  if (!authHeader?.startsWith('Bearer ')) {
    return { success: false, error: 'No bearer token provided' };
  }

  const token = authHeader.slice(7);
  const result = validateToken(token);

  if (!result.valid || !result.payload) {
    return { success: false, error: result.error || 'Invalid token' };
  }

  return {
    success: true,
    context: {
      userId: result.payload.sub,
      scopes: result.payload.scopes,
    },
  };
}

// ============================================================================
// Anthropic API Client
// ============================================================================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function callAnthropic(messages: ChatMessage[], model?: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const selectedModel = model || process.env.LLM_MODEL || 'claude-3-5-haiku-20241022';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: selectedModel,
      max_tokens: 4096,
      system: 'You are Yukie, a helpful AI assistant. Be friendly, concise, and helpful.',
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text || 'I could not generate a response.';
}

// ============================================================================
// API Handler
// ============================================================================

interface ChatRequest {
  message: string;
  conversationId?: string;
  model?: string;
}

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

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Authenticate
  const authResult = authenticateRequest(req.headers.authorization);
  if (!authResult.success || !authResult.context) {
    res.status(401).json({
      error: 'Unauthorized',
      message: authResult.error || 'Authentication required',
    });
    return;
  }

  // Check for chat scope
  if (!authResult.context.scopes.includes('yukie:chat')) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Missing required scope: yukie:chat',
    });
    return;
  }

  // Validate request
  const body = req.body as ChatRequest;
  if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
    res.status(400).json({ error: 'Bad Request', message: 'message is required' });
    return;
  }

  if (body.message.length > 10000) {
    res.status(400).json({ error: 'Bad Request', message: 'message is too long (max 10000 characters)' });
    return;
  }

  try {
    // Call Anthropic API
    const response = await callAnthropic(
      [{ role: 'user', content: body.message }],
      body.model
    );

    const conversationId = body.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    res.status(200).json({
      response,
      conversationId,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while processing your message',
    });
  }
}
