import type { Request, Response } from 'express';
import type { HealthResponse } from '../../../shared/protocol/src/types';
import { getMCPRegistry } from '../mcp-registry';
import { createLogger } from '../../../shared/observability/src/logger';

const logger = createLogger('health-route');

const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';

// ============================================================================
// GET /healthz
// ============================================================================

export function handleHealth(_req: Request, res: Response): void {
  const response: HealthResponse = {
    ok: true,
    service: 'yukie-core',
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
  };

  res.json(response);
}

// ============================================================================
// GET /healthz/ready
// ============================================================================

export async function handleReadiness(_req: Request, res: Response): Promise<void> {
  try {
    const registry = getMCPRegistry();
    const services = registry.getEnabled();

    // Check if at least one service is healthy
    const healthChecks = await Promise.all(
      services.map(async (service) => {
        const health = await registry.checkHealth(service.id);
        return { serviceId: service.id, ok: health.ok };
      })
    );

    const allHealthy = healthChecks.length === 0 || healthChecks.some((h) => h.ok);

    const response = {
      ok: allHealthy,
      service: 'yukie-core',
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString(),
      services: healthChecks,
    };

    if (allHealthy) {
      res.json(response);
    } else {
      res.status(503).json(response);
    }
  } catch (error) {
    logger.error('Readiness check failed', error);
    res.status(503).json({
      ok: false,
      service: 'yukie-core',
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed',
    });
  }
}

// ============================================================================
// GET /healthz/live
// ============================================================================

export function handleLiveness(_req: Request, res: Response): void {
  // Simple liveness check - just confirms the server is responding
  res.json({
    ok: true,
    service: 'yukie-core',
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// GET /healthz/services
// ============================================================================

export async function handleServicesHealth(_req: Request, res: Response): Promise<void> {
  try {
    const registry = getMCPRegistry();
    const healthResults = await registry.checkAllHealth();

    const services: Record<string, { ok: boolean; lastCheck?: number }> = {};
    for (const [serviceId, health] of healthResults.entries()) {
      const cached = registry.getHealthStatus(serviceId);
      services[serviceId] = {
        ok: health.ok,
        lastCheck: cached?.lastCheck,
      };
    }

    res.json({
      ok: true,
      services,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Services health check failed', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to check services health',
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// Express Router Setup Helper
// ============================================================================

export function setupHealthRoutes(app: {
  get: (path: string, handler: (req: Request, res: Response) => void | Promise<void>) => void;
}): void {
  app.get('/healthz', handleHealth);
  app.get('/healthz/ready', handleReadiness);
  app.get('/healthz/live', handleLiveness);
  app.get('/healthz/services', handleServicesHealth);
}
