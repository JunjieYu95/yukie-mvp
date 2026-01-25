import type { ServiceRegistryEntry, YWAIPServiceMeta, YWAIPActionsResponse, HealthResponse } from '../../shared/protocol/src/types.js';
import { createLogger } from '../../shared/observability/src/logger.js';

const logger = createLogger('registry');

// ============================================================================
// Service Registry
// ============================================================================

class ServiceRegistry {
  private services: Map<string, ServiceRegistryEntry> = new Map();
  private healthStatus: Map<string, { ok: boolean; lastCheck: number }> = new Map();

  constructor() {}

  // Load services from configuration
  loadFromConfig(config: { services: ServiceRegistryEntry[] }): void {
    for (const service of config.services) {
      this.register(service);
    }
    logger.info('Services loaded from config', { count: config.services.length });
  }

  // Register a service
  register(service: ServiceRegistryEntry): void {
    this.services.set(service.id, service);
    logger.info('Service registered', { serviceId: service.id, name: service.name });
  }

  // Unregister a service
  unregister(serviceId: string): boolean {
    const deleted = this.services.delete(serviceId);
    if (deleted) {
      this.healthStatus.delete(serviceId);
      logger.info('Service unregistered', { serviceId });
    }
    return deleted;
  }

  // Get a service by ID
  get(serviceId: string): ServiceRegistryEntry | undefined {
    return this.services.get(serviceId);
  }

  // Get all enabled services
  getAll(): ServiceRegistryEntry[] {
    return Array.from(this.services.values());
  }

  // Get all enabled services
  getEnabled(): ServiceRegistryEntry[] {
    return Array.from(this.services.values()).filter((s) => s.enabled);
  }

  // Check if a service exists
  has(serviceId: string): boolean {
    return this.services.has(serviceId);
  }

  // Get service metadata via YWAIP
  async fetchMeta(serviceId: string): Promise<YWAIPServiceMeta | null> {
    const service = this.get(serviceId);
    if (!service) {
      return null;
    }

    try {
      const response = await fetch(`${service.baseUrl}/api/v1/meta`);
      if (!response.ok) {
        logger.warn('Failed to fetch service meta', { serviceId, status: response.status });
        return null;
      }
      return await response.json() as YWAIPServiceMeta;
    } catch (error) {
      logger.error('Error fetching service meta', error, { serviceId });
      return null;
    }
  }

  // Get service actions via YWAIP
  async fetchActions(serviceId: string): Promise<YWAIPActionsResponse | null> {
    const service = this.get(serviceId);
    if (!service) {
      return null;
    }

    try {
      const response = await fetch(`${service.baseUrl}/api/v1/actions`);
      if (!response.ok) {
        logger.warn('Failed to fetch service actions', { serviceId, status: response.status });
        return null;
      }
      return await response.json() as YWAIPActionsResponse;
    } catch (error) {
      logger.error('Error fetching service actions', error, { serviceId });
      return null;
    }
  }

  // Check service health
  async checkHealth(serviceId: string): Promise<HealthResponse> {
    const service = this.get(serviceId);
    if (!service) {
      return { ok: false };
    }

    try {
      const response = await fetch(`${service.baseUrl}${service.healthEndpoint}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const ok = response.ok;
      this.healthStatus.set(serviceId, { ok, lastCheck: Date.now() });

      if (!ok) {
        logger.warn('Service health check failed', { serviceId, status: response.status });
      }

      try {
        return await response.json() as HealthResponse;
      } catch {
        return { ok, service: serviceId };
      }
    } catch (error) {
      this.healthStatus.set(serviceId, { ok: false, lastCheck: Date.now() });
      logger.error('Service health check error', error, { serviceId });
      return { ok: false, service: serviceId };
    }
  }

  // Get cached health status
  getHealthStatus(serviceId: string): { ok: boolean; lastCheck: number } | undefined {
    return this.healthStatus.get(serviceId);
  }

  // Check all services health
  async checkAllHealth(): Promise<Map<string, HealthResponse>> {
    const results = new Map<string, HealthResponse>();

    await Promise.all(
      this.getEnabled().map(async (service) => {
        const health = await this.checkHealth(service.id);
        results.set(service.id, health);
      })
    );

    return results;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let registryInstance: ServiceRegistry | null = null;

export function getRegistry(): ServiceRegistry {
  if (!registryInstance) {
    registryInstance = new ServiceRegistry();
  }
  return registryInstance;
}

// For testing - reset the singleton
export function resetRegistry(): void {
  registryInstance = null;
}

// ============================================================================
// Default Service Configuration
// ============================================================================

export function getDefaultServicesConfig(): { services: ServiceRegistryEntry[] } {
  return {
    services: [
      {
        id: 'habit-tracker',
        name: 'Habit Tracker',
        description: 'Track daily habits like waking up early, exercise, reading, meditation. Supports check-ins, streaks, and statistics.',
        baseUrl: process.env.HABIT_TRACKER_URL || 'http://localhost:3001',
        capabilities: [
          'habit check-in',
          'habit tracking',
          'streak calculation',
          'monthly statistics',
          'habit history query',
        ],
        scopes: ['habit:read', 'habit:write', 'habit:delete'],
        healthEndpoint: '/api/health',
        enabled: true,
      },
    ],
  };
}

// ============================================================================
// Initialize Registry
// ============================================================================

export function initializeRegistry(config?: { services: ServiceRegistryEntry[] }): ServiceRegistry {
  const registry = getRegistry();
  const servicesConfig = config || getDefaultServicesConfig();
  registry.loadFromConfig(servicesConfig);
  return registry;
}
