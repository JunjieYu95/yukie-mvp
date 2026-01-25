/**
 * Auth Utilities for Vercel Serverless Functions
 *
 * This file provides authentication utilities specifically designed for
 * Vercel serverless functions, with inlined JWT handling to avoid
 * module resolution issues.
 */

import crypto from 'crypto';

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

// ============================================================================
// Request Authentication
// ============================================================================

export function authenticateRequest(authHeader?: string, requestId?: string): AuthResult {
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
