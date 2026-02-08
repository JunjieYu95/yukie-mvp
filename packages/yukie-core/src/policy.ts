import type { AuthContext } from '../../shared/protocol/src/types';
import { requireScopes, SCOPES } from '../../shared/auth/src/auth';
import { getMCPRegistry } from './mcp-registry';
import { createLogger } from '../../shared/observability/src/logger';

const logger = createLogger('policy');

// ============================================================================
// Policy Types
// ============================================================================

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  missingScopes?: string[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
  resetAt?: number;
  reason?: string;
}

// ============================================================================
// Policy Enforcement
// ============================================================================

// Check if user can access a service
export function canAccessService(auth: AuthContext, serviceId: string): PolicyCheckResult {
  const registry = getMCPRegistry();
  const service = registry.get(serviceId);

  if (!service) {
    const available = registry.getAll().map(s => s.id).join(', ');
    return {
      allowed: false,
      reason: `Service '${serviceId}' not found in registry. Available services: [${available || 'none'}]`,
    };
  }

  if (!service.enabled) {
    return {
      allowed: false,
      reason: `Service '${serviceId}' (${service.name}) is currently disabled by configuration`,
    };
  }

  // Check if user has at least one required scope for the service
  const hasRequiredScope = service.scopes.length === 0 || service.scopes.some((scope) => auth.scopes.includes(scope));

  if (!hasRequiredScope) {
    return {
      allowed: false,
      reason: `Insufficient permissions to access service '${serviceId}' (${service.name}). Required scopes (need at least one): [${service.scopes.join(', ')}]. Your scopes: [${auth.scopes.join(', ')}]`,
      missingScopes: service.scopes,
    };
  }

  return { allowed: true };
}

// Check if user can perform an action
export function canPerformAction(
  auth: AuthContext,
  serviceId: string,
  actionRequiredScopes: string[]
): PolicyCheckResult {
  // First check service access
  const serviceCheck = canAccessService(auth, serviceId);
  if (!serviceCheck.allowed) {
    return serviceCheck;
  }

  // Then check action-specific scopes
  const scopeCheck = requireScopes(auth.scopes, actionRequiredScopes);

  if (!scopeCheck.authorized) {
    return {
      allowed: false,
      reason: 'Insufficient permissions for this action',
      missingScopes: scopeCheck.missingScopes,
    };
  }

  return { allowed: true };
}

// Check if user can use chat
export function canUseChat(auth: AuthContext): PolicyCheckResult {
  const scopeCheck = requireScopes(auth.scopes, [SCOPES.YUKIE_CHAT]);

  if (!scopeCheck.authorized) {
    return {
      allowed: false,
      reason: 'Chat access not authorized',
      missingScopes: scopeCheck.missingScopes,
    };
  }

  return { allowed: true };
}

// Check if user can access inbox
export function canAccessInbox(auth: AuthContext): PolicyCheckResult {
  const scopeCheck = requireScopes(auth.scopes, [SCOPES.YUKIE_INBOX]);

  if (!scopeCheck.authorized) {
    return {
      allowed: false,
      reason: 'Inbox access not authorized',
      missingScopes: scopeCheck.missingScopes,
    };
  }

  return { allowed: true };
}

// ============================================================================
// Rate Limiting (In-Memory Implementation)
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  chat: { windowMs: 60000, maxRequests: 30 }, // 30 requests per minute
  invoke: { windowMs: 60000, maxRequests: 60 }, // 60 requests per minute
  inbox: { windowMs: 60000, maxRequests: 100 }, // 100 requests per minute
};

export function checkRateLimit(
  userId: string,
  operation: string,
  config?: RateLimitConfig
): RateLimitResult {
  const effectiveConfig = config || DEFAULT_RATE_LIMITS[operation] || DEFAULT_RATE_LIMITS.chat;
  const key = `${userId}:${operation}`;
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  // Clean up old entry if window has passed
  if (entry && now - entry.windowStart >= effectiveConfig.windowMs) {
    entry = undefined;
  }

  if (!entry) {
    // Start new window
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: effectiveConfig.maxRequests - 1,
      resetAt: now + effectiveConfig.windowMs,
    };
  }

  if (entry.count >= effectiveConfig.maxRequests) {
    const resetAt = entry.windowStart + effectiveConfig.windowMs;
    const resetDate = new Date(resetAt);
    const waitSeconds = Math.ceil((resetAt - now) / 1000);
    logger.warn('Rate limit exceeded', {
      userId,
      operation,
      resetAt,
      maxRequests: effectiveConfig.maxRequests,
      windowMs: effectiveConfig.windowMs,
      waitSeconds,
    });
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      reason: `Rate limit exceeded for '${operation}': ${effectiveConfig.maxRequests} requests per ${Math.round(effectiveConfig.windowMs / 1000)}s window. Please wait ${waitSeconds}s (resets at ${resetDate.toISOString()}).`,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: effectiveConfig.maxRequests - entry.count,
    resetAt: entry.windowStart + effectiveConfig.windowMs,
  };
}

// Clean up expired rate limit entries periodically
export function cleanupRateLimits(): void {
  const now = Date.now();
  const maxAge = 300000; // 5 minutes

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart > maxAge) {
      rateLimitStore.delete(key);
    }
  }
}

// Start cleanup interval
let cleanupInterval: NodeJS.Timeout | null = null;

export function startRateLimitCleanup(): void {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupRateLimits, 60000); // Run every minute
  }
}

export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// ============================================================================
// Policy Middleware Factory
// ============================================================================

export interface PolicyMiddlewareRequest {
  auth?: AuthContext;
}

export interface PolicyMiddlewareResponse {
  status: (code: number) => PolicyMiddlewareResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

export type PolicyMiddlewareNext = () => void;

export function createPolicyMiddleware(
  policyCheck: (auth: AuthContext) => PolicyCheckResult,
  rateLimitOperation?: string
) {
  return (
    req: PolicyMiddlewareRequest,
    res: PolicyMiddlewareResponse,
    next: PolicyMiddlewareNext
  ): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Check policy
    const policyResult = policyCheck(req.auth);
    if (!policyResult.allowed) {
      res.status(403).json({
        error: 'Forbidden',
        message: policyResult.reason,
        missingScopes: policyResult.missingScopes,
      });
      return;
    }

    // Check rate limit
    if (rateLimitOperation) {
      const rateResult = checkRateLimit(req.auth.userId, rateLimitOperation);
      res.setHeader('X-RateLimit-Remaining', String(rateResult.remaining || 0));
      res.setHeader('X-RateLimit-Reset', String(rateResult.resetAt || 0));

      if (!rateResult.allowed) {
        res.status(429).json({
          error: 'Too Many Requests',
          message: rateResult.reason,
          resetAt: rateResult.resetAt,
        });
        return;
      }
    }

    next();
  };
}
