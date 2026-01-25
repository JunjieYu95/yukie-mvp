import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

// Load .env from project root
// When run via "cd packages/services/habit-tracker && npx tsx", cwd is packages/services/habit-tracker
// So we need to go up 3 levels to reach project root
const envPath = resolve(process.cwd(), '../../../.env');
config({ path: envPath });

// ES module __filename equivalent
const __filename = fileURLToPath(import.meta.url);

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import type { YWAIPInvokeRequest, AuthContext } from '../../../shared/protocol/src/types';
import { authenticateRequest } from '../../../shared/auth/src/auth';
import { getServiceMeta } from '../lib/ywaip/meta';
import { getActions } from '../lib/ywaip/actions';
import { executeAction } from '../lib/ywaip/action-executor';
import { createLogger, startTimer } from '../../../shared/observability/src/logger';

const logger = createLogger('habit-tracker');

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
// Middleware: Authentication (for invoke endpoint)
// ============================================================================

async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Skip auth for meta, actions, and health endpoints
  if (req.path === '/api/v1/meta' ||
      req.path === '/api/v1/actions' ||
      req.path === '/api/health') {
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
// Routes
// ============================================================================

// GET /api/v1/meta
function handleMeta(_req: Request, res: Response): void {
  res.json(getServiceMeta());
}

// GET /api/v1/actions
function handleActions(_req: Request, res: Response): void {
  res.json(getActions());
}

// POST /api/v1/invoke
async function handleInvoke(req: Request, res: Response): Promise<void> {
  const timer = startTimer();

  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const body = req.body as YWAIPInvokeRequest;

  if (!body.action) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'action is required' },
    });
    return;
  }

  try {
    // Build context from auth and request
    const request: YWAIPInvokeRequest = {
      action: body.action,
      params: body.params || {},
      context: {
        userId: req.auth.userId,
        requestId: req.requestId,
        scopes: req.auth.scopes,
        conversationId: body.context?.conversationId,
      },
    };

    const result = await executeAction(request);
    const timing = timer();

    logger.info('Action executed', {
      action: body.action,
      success: result.success,
      durationMs: timing.durationMs,
      userId: req.auth.userId,
    });

    res.json(result);
  } catch (error) {
    const timing = timer();
    logger.error('Invoke error', error, { durationMs: timing.durationMs });

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred while processing the request',
      },
    });
  }
}

// GET /api/health
function handleHealth(_req: Request, res: Response): void {
  res.json({
    ok: true,
    service: 'habit-tracker',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
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

  // YWAIP endpoints
  app.get('/api/v1/meta', handleMeta);
  app.get('/api/v1/actions', handleActions);
  app.post('/api/v1/invoke', handleInvoke);

  // Health endpoint
  app.get('/api/health', handleHealth);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', err, { requestId: req.requestId, path: req.path });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  return app;
}

// ============================================================================
// Start Server
// ============================================================================

export async function startServer(options: ServerOptions = {}): Promise<{
  app: express.Application;
  close: () => Promise<void>;
}> {
  const port = options.port || parseInt(process.env.PORT || '3001', 10);

  const app = createServer(options);

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      logger.info('Habit Tracker server started', { port });

      resolve({
        app,
        close: async () => {
          return new Promise((resolveClose) => {
            server.close(() => {
              logger.info('Habit Tracker server stopped');
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
    logger.error('Failed to start Habit Tracker server', error);
    process.exit(1);
  });
}
