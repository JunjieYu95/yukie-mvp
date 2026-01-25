import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

// Load .env from project root
// When run via "cd packages/yukie-core && npx tsx", cwd is packages/yukie-core
// So we need to go up 2 levels to reach project root
const envPath = resolve(process.cwd(), '../../.env');
config({ path: envPath });

// ES module __filename equivalent
const __filename = fileURLToPath(import.meta.url);

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import type { AuthContext } from '../../shared/protocol/src/types';
import { authenticateRequest } from '../../shared/auth/src/auth';
import { initializeRegistry } from './registry';
import { startRateLimitCleanup, stopRateLimitCleanup } from './policy';
import { startInboxCleanup, stopInboxCleanup } from './inbox';
import { setupChatRoutes } from './routes/chat';
import { setupInboxRoutes } from './routes/inbox';
import { setupHealthRoutes } from './routes/health';
import { setupAuthRoutes } from './routes/auth';
import { createLogger, startTimer } from '../../shared/observability/src/logger';

const logger = createLogger('server');

// ============================================================================
// Extended Request Type
// ============================================================================

declare module 'express' {
  interface Request {
    auth?: AuthContext;
    requestId?: string;
  }
}

// ============================================================================
// Middleware: Request ID
// ============================================================================

function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = req.headers['x-yukie-request-id'] as string ||
                  `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  next();
}

// ============================================================================
// Middleware: Request Logging
// ============================================================================

function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const timer = startTimer();

  res.on('finish', () => {
    const timing = timer();
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: timing.durationMs,
      requestId: req.requestId,
    });
  });

  next();
}

// ============================================================================
// Middleware: Authentication
// ============================================================================

async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Skip auth for health endpoints, root, and dev auth endpoints
  if (req.path.startsWith('/healthz') || req.path === '/' || req.path === '/api/auth/dev-token') {
    next();
    return;
  }

  const result = await authenticateRequest({
    authorizationHeader: req.headers.authorization,
    yukieUserIdHeader: req.headers['x-yukie-user-id'] as string,
    yukieScopesHeader: req.headers['x-yukie-scopes'] as string,
    yukieRequestIdHeader: req.requestId,
  });

  if (!result.success || !result.context) {
    res.status(401).json({
      error: 'Unauthorized',
      message: result.error || 'Authentication required',
    });
    return;
  }

  req.auth = result.context;
  next();
}

// ============================================================================
// Middleware: Error Handler
// ============================================================================

function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error('Unhandled error', err, { requestId: req.requestId, path: req.path });

  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    requestId: req.requestId,
  });
}

// ============================================================================
// Create Server
// ============================================================================

export interface ServerOptions {
  port?: number;
  corsOrigins?: string | string[];
}

export function createServer(options: ServerOptions = {}) {
  const app = express();

  // Basic middleware
  app.use(express.json());
  app.use(cors({
    origin: options.corsOrigins || '*',
    credentials: true,
  }));

  // Custom middleware
  app.use(requestIdMiddleware);
  app.use(requestLoggingMiddleware);
  app.use(authMiddleware);

  // Setup routes
  setupHealthRoutes(app);
  setupAuthRoutes(app);
  setupChatRoutes(app);
  setupInboxRoutes(app);

  // Root endpoint - API information
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      service: 'yukie-core',
      version: process.env.npm_package_version || '1.0.0',
      endpoints: {
        health: {
          '/healthz': 'Basic health check (no auth required)',
          '/healthz/ready': 'Readiness check (no auth required)',
          '/healthz/live': 'Liveness check (no auth required)',
          '/healthz/services': 'Service registry health (no auth required)',
        },
        api: {
          '/api/chat': 'POST - Chat with Yukie (auth required)',
          '/api/inbox': 'GET - List inbox items (auth required)',
          '/api/inbox/stats': 'GET - Inbox statistics (auth required)',
          '/api/inbox/:id': 'GET - Get specific inbox item (auth required)',
        },
      },
      authentication: 'Bearer token required for /api/* endpoints',
      documentation: 'See README.md for usage examples',
    });
  });

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // Error handler
  app.use(errorHandler);

  return app;
}

// ============================================================================
// Start Server
// ============================================================================

export async function startServer(options: ServerOptions = {}): Promise<{
  app: express.Application;
  close: () => Promise<void>;
}> {
  const port = options.port || parseInt(process.env.PORT || '3000', 10);

  // Initialize components
  initializeRegistry();
  startRateLimitCleanup();
  startInboxCleanup();

  const app = createServer(options);

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      logger.info('Server started', { port });

      resolve({
        app,
        close: async () => {
          stopRateLimitCleanup();
          stopInboxCleanup();
          return new Promise((resolveClose) => {
            server.close(() => {
              logger.info('Server stopped');
              resolveClose();
            });
          });
        },
      });
    });
  });
}

// ============================================================================
// Main Entry Point
// ============================================================================

// ES module equivalent of require.main === module
const isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (isMainModule) {
  startServer().catch((error) => {
    logger.error('Failed to start server', error);
    process.exit(1);
  });
}
