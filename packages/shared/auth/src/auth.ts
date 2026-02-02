import type { JWTPayload, AuthContext } from '../../protocol/src/types';

// ============================================================================
// JWT Utilities (using jose library for edge compatibility)
// ============================================================================

const ALGORITHM = 'HS256';
const DEFAULT_EXPIRY = '24h';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

// Base64URL encoding/decoding utilities
function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(data: string): string {
  let padded = data.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) {
    padded += '=';
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const crypto = await import('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(message);
  return hmac.digest('base64url');
}

async function hmacVerify(message: string, signature: string, secret: string): Promise<boolean> {
  const expectedSignature = await hmacSign(message, secret);
  return signature === expectedSignature;
}

// ============================================================================
// Token Generation
// ============================================================================

export interface GenerateTokenOptions {
  userId: string;
  scopes: string[];
  expiresIn?: string; // e.g., '24h', '7d'
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid expiry format: ${expiry}`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * multipliers[unit];
}

export async function generateToken(options: GenerateTokenOptions): Promise<string> {
  const { userId, scopes, expiresIn = DEFAULT_EXPIRY } = options;
  const secret = getJwtSecret();

  const now = Math.floor(Date.now() / 1000);
  const expirySeconds = parseExpiry(expiresIn);

  const header = {
    alg: ALGORITHM,
    typ: 'JWT',
  };

  const payload: JWTPayload = {
    sub: userId,
    scopes,
    iat: now,
    exp: now + expirySeconds,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const message = `${headerEncoded}.${payloadEncoded}`;
  const signature = await hmacSign(message, secret);

  return `${message}.${signature}`;
}

// ============================================================================
// Token Validation
// ============================================================================

export interface ValidateTokenResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
}

export async function validateToken(token: string): Promise<ValidateTokenResult> {
  try {
    const secret = getJwtSecret();
    const parts = token.split('.');

    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [headerEncoded, payloadEncoded, signature] = parts;
    const message = `${headerEncoded}.${payloadEncoded}`;

    // Verify signature
    const isValid = await hmacVerify(message, signature, secret);
    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Decode payload
    const payload = JSON.parse(base64UrlDecode(payloadEncoded)) as JWTPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: `Token validation failed: ${error}` };
  }
}

// ============================================================================
// Authorization Helpers
// ============================================================================

export function hasScopes(userScopes: string[], requiredScopes: string[]): boolean {
  return requiredScopes.every((scope) => userScopes.includes(scope));
}

export function hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean {
  return requiredScopes.some((scope) => userScopes.includes(scope));
}

export interface RequireScopesResult {
  authorized: boolean;
  missingScopes?: string[];
}

export function requireScopes(userScopes: string[], requiredScopes: string[]): RequireScopesResult {
  const missingScopes = requiredScopes.filter((scope) => !userScopes.includes(scope));
  return {
    authorized: missingScopes.length === 0,
    missingScopes: missingScopes.length > 0 ? missingScopes : undefined,
  };
}

// ============================================================================
// Request Authentication
// ============================================================================

export interface AuthenticateRequestOptions {
  authorizationHeader?: string;
  yukieUserIdHeader?: string;
  yukieScopesHeader?: string;
  yukieRequestIdHeader?: string;
  cookieHeader?: string;
}

export interface AuthenticateResult {
  success: boolean;
  context?: AuthContext;
  error?: string;
}

export async function authenticateRequest(options: AuthenticateRequestOptions): Promise<AuthenticateResult> {
  const {
    authorizationHeader,
    yukieUserIdHeader,
    yukieScopesHeader,
    yukieRequestIdHeader,
    cookieHeader,
  } = options;

  const cookies = (cookieHeader || '').split(';').reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});

  // Check for Bearer token
  if (authorizationHeader?.startsWith('Bearer ')) {
    const token = authorizationHeader.slice(7);
    const result = await validateToken(token);

    if (!result.valid || !result.payload) {
      return { success: false, error: result.error || 'Invalid token' };
    }

    return {
      success: true,
      context: {
        userId: result.payload.sub,
        scopes: result.payload.scopes,
        requestId: yukieRequestIdHeader,
      },
    };
  }

  // Check for session cookie
  if (cookies.yukie_session) {
    const result = await validateToken(cookies.yukie_session);
    if (!result.valid || !result.payload) {
      return { success: false, error: result.error || 'Invalid token' };
    }

    return {
      success: true,
      context: {
        userId: result.payload.sub,
        scopes: result.payload.scopes,
        requestId: yukieRequestIdHeader,
      },
    };
  }

  // Check for direct headers (used by Yukie Core when calling services)
  if (yukieUserIdHeader && yukieScopesHeader) {
    return {
      success: true,
      context: {
        userId: yukieUserIdHeader,
        scopes: yukieScopesHeader.split(',').map((s) => s.trim()),
        requestId: yukieRequestIdHeader,
      },
    };
  }

  return { success: false, error: 'No authentication credentials provided' };
}

// ============================================================================
// Middleware Factory (for Express-style handlers)
// ============================================================================

export interface AuthMiddlewareRequest {
  headers: {
    authorization?: string;
    'x-yukie-user-id'?: string;
    'x-yukie-scopes'?: string;
    'x-yukie-request-id'?: string;
    cookie?: string;
  };
  auth?: AuthContext;
}

export interface AuthMiddlewareResponse {
  status: (code: number) => AuthMiddlewareResponse;
  json: (data: unknown) => void;
}

export type AuthMiddlewareNext = () => void;

export function createAuthMiddleware(requiredScopes?: string[]) {
  return async (
    req: AuthMiddlewareRequest,
    res: AuthMiddlewareResponse,
    next: AuthMiddlewareNext
  ): Promise<void> => {
    const result = await authenticateRequest({
      authorizationHeader: req.headers.authorization,
      yukieUserIdHeader: req.headers['x-yukie-user-id'],
      yukieScopesHeader: req.headers['x-yukie-scopes'],
      yukieRequestIdHeader: req.headers['x-yukie-request-id'],
      cookieHeader: req.headers.cookie,
    });

    if (!result.success || !result.context) {
      res.status(401).json({ error: 'Unauthorized', message: result.error });
      return;
    }

    // Check required scopes if specified
    if (requiredScopes && requiredScopes.length > 0) {
      const scopeCheck = requireScopes(result.context.scopes, requiredScopes);
      if (!scopeCheck.authorized) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions',
          missingScopes: scopeCheck.missingScopes,
        });
        return;
      }
    }

    req.auth = result.context;
    next();
  };
}

// ============================================================================
// Scope Constants
// ============================================================================

export const SCOPES = {
  // Habit Tracker scopes
  HABIT_READ: 'habit:read',
  HABIT_WRITE: 'habit:write',
  HABIT_DELETE: 'habit:delete',

  // Yukie Core scopes
  YUKIE_CHAT: 'yukie:chat',
  YUKIE_INBOX: 'yukie:inbox',

  // Admin scopes
  ADMIN: 'admin',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

// ============================================================================
// Development Helpers
// ============================================================================

export async function generateDevToken(userId: string = 'dev-user'): Promise<string> {
  return generateToken({
    userId,
    scopes: Object.values(SCOPES),
    expiresIn: '30d',
  });
}
