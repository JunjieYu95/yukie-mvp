/**
 * Auth Utilities for Vercel Serverless Functions
 *
 * This file provides authentication utilities specifically designed for
 * Vercel serverless functions, with inlined JWT handling to avoid
 * module resolution issues.
 */

import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface JWTPayload {
  sub: string;
  scopes: string[];
  iat: number;
  exp: number;
}

export interface AuthContext {
  userId: string;
  scopes: string[];
  requestId?: string;
  utcOffsetMinutes?: number;
}

export interface AuthResult {
  success: boolean;
  context?: AuthContext;
  error?: string;
}

// ============================================================================
// JWT Utilities
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

export function validateToken(token: string): { valid: boolean; payload?: JWTPayload; error?: string } {
  try {
    const secret = getJwtSecret();
    const parts = token.split('.');

    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format: Expected JWT with 3 parts (header.payload.signature)' };
    }

    const [headerEncoded, payloadEncoded, signature] = parts;
    const message = `${headerEncoded}.${payloadEncoded}`;

    if (!hmacVerify(message, signature, secret)) {
      return { valid: false, error: 'Invalid token signature: The token may have been tampered with or the JWT_SECRET has changed' };
    }

    const payload = JSON.parse(base64UrlDecode(payloadEncoded)) as JWTPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      const expiredAgo = now - payload.exp;
      return { valid: false, error: `Token expired ${expiredAgo}s ago. Please log in again to get a new token.` };
    }

    return { valid: true, payload };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { valid: false, error: `Token validation failed: ${errorMsg}` };
  }
}

// ============================================================================
// Request Authentication
// ============================================================================

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function extractBearer(authHeader?: string): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export function authenticateRequest(
  authHeader?: string,
  requestId?: string,
  cookieHeader?: string
): AuthResult {
  const bearer = extractBearer(authHeader);
  const cookies = parseCookieHeader(cookieHeader);
  const token = bearer || cookies.yukie_session;
  if (!token) {
    return { success: false, error: 'No authentication token provided. Send a Bearer token in the Authorization header or set the yukie_session cookie.' };
  }

  const result = validateToken(token);

  if (!result.valid || !result.payload) {
    return { success: false, error: result.error || 'Invalid token' };
  }

  return {
    success: true,
    context: {
      userId: result.payload.sub,
      scopes: result.payload.scopes,
      requestId,
    },
  };
}

// ============================================================================
// Scope Checking
// ============================================================================

export function hasScope(context: AuthContext, scope: string): boolean {
  return context.scopes.includes(scope) || context.scopes.includes('admin');
}

export function hasScopes(context: AuthContext, requiredScopes: string[]): boolean {
  if (context.scopes.includes('admin')) return true;
  return requiredScopes.every((scope) => context.scopes.includes(scope));
}

export function hasAnyScope(context: AuthContext, scopes: string[]): boolean {
  if (context.scopes.includes('admin')) return true;
  return scopes.some((scope) => context.scopes.includes(scope));
}
