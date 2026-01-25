/**
 * Enhanced Service Registry
 *
 * Features:
 * - YAML configuration support
 * - Tool manifest caching with TTL
 * - Capability indexing for fast retrieval
 * - Health monitoring
 * - Version tracking
 */

import { createLogger, startTimer } from '../../../shared/observability/src/logger';
import type { YWAIPActionsResponse, YWAIPServiceMeta, HealthResponse } from '../../../shared/protocol/src/types';
import type {
  ServiceDefinition,
  EnhancedServiceEntry,
  ToolManifest,
  RegistryConfig,
  RegistryYAML,
  ServiceHealthStatus,
  RegistryStats,
  ServiceQuery,
  ServiceQueryResult,
  CapabilityMatch,
} from './types';

const logger = createLogger('enhanced-registry');

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: RegistryConfig = {
  manifestCacheTTL: 600,          // 10 minutes
  healthCheckInterval: 60,        // 1 minute
  defaultTimeout: 30000,          // 30 seconds
  maxRoutingCandidates: 15,
};

// ============================================================================
// Enhanced Service Registry
// ============================================================================

export class EnhancedServiceRegistry {
  private services: Map<string, EnhancedServiceEntry> = new Map();
  private config: RegistryConfig = DEFAULT_CONFIG;

  // Capability indexes
  private keywordIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private capabilityIndex: Map<string, Set<string>> = new Map();

  // Manifest cache
  private manifestCache: Map<string, ToolManifest> = new Map();

  constructor(config?: Partial<RegistryConfig>) {
    if (config) {
      this.config = { ...DEFAULT_CONFIG, ...config };
    }
  }

  // ============================================================================
  // Configuration Loading
  // ============================================================================

  /**
   * Load services from YAML configuration object
   */
  loadFromYAML(yamlConfig: RegistryYAML): void {
    // Apply configuration
    if (yamlConfig.config) {
      this.config = { ...DEFAULT_CONFIG, ...yamlConfig.config };
    }

    // Clear existing data
    this.services.clear();
    this.keywordIndex.clear();
    this.tagIndex.clear();
    this.capabilityIndex.clear();

    // Load services
    for (const service of yamlConfig.services) {
      this.registerService(service);
    }

    logger.info('Registry loaded from YAML', {
      serviceCount: yamlConfig.services.length,
      enabledCount: yamlConfig.services.filter((s) => s.enabled).length,
    });
  }

  /**
   * Load services from JSON configuration (backward compatibility)
   */
  loadFromJSON(config: { services: ServiceDefinition[] }): void {
    for (const service of config.services) {
      this.registerService(service);
    }
    logger.info('Registry loaded from JSON', { serviceCount: config.services.length });
  }

  // ============================================================================
  // Service Registration
  // ============================================================================

  /**
   * Register a service and build indexes
   */
  registerService(service: ServiceDefinition): void {
    const entry: EnhancedServiceEntry = { ...service };
    this.services.set(service.id, entry);

    // Build keyword index
    for (const keyword of service.keywords || []) {
      const normalized = this.normalizeKeyword(keyword);
      if (!this.keywordIndex.has(normalized)) {
        this.keywordIndex.set(normalized, new Set());
      }
      this.keywordIndex.get(normalized)!.add(service.id);
    }

    // Build tag index
    for (const tag of service.tags || []) {
      const normalized = this.normalizeKeyword(tag);
      if (!this.tagIndex.has(normalized)) {
        this.tagIndex.set(normalized, new Set());
      }
      this.tagIndex.get(normalized)!.add(service.id);
    }

    // Build capability index
    for (const capability of service.capabilities || []) {
      const normalized = this.normalizeKeyword(capability);
      if (!this.capabilityIndex.has(normalized)) {
        this.capabilityIndex.set(normalized, new Set());
      }
      this.capabilityIndex.get(normalized)!.add(service.id);

      // Also index individual words from capabilities
      const words = capability.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 2) {
          if (!this.capabilityIndex.has(word)) {
            this.capabilityIndex.set(word, new Set());
          }
          this.capabilityIndex.get(word)!.add(service.id);
        }
      }
    }

    logger.debug('Service registered', { serviceId: service.id, name: service.name });
  }

  /**
   * Unregister a service
   */
  unregisterService(serviceId: string): boolean {
    const service = this.services.get(serviceId);
    if (!service) return false;

    // Remove from indexes
    this.removeFromIndexes(service);

    // Remove from caches
    this.services.delete(serviceId);
    this.manifestCache.delete(serviceId);

    logger.info('Service unregistered', { serviceId });
    return true;
  }

  private removeFromIndexes(service: EnhancedServiceEntry): void {
    for (const keyword of service.keywords || []) {
      const normalized = this.normalizeKeyword(keyword);
      this.keywordIndex.get(normalized)?.delete(service.id);
    }
    for (const tag of service.tags || []) {
      const normalized = this.normalizeKeyword(tag);
      this.tagIndex.get(normalized)?.delete(service.id);
    }
    for (const capability of service.capabilities || []) {
      const normalized = this.normalizeKeyword(capability);
      this.capabilityIndex.get(normalized)?.delete(service.id);
    }
  }

  private normalizeKeyword(keyword: string): string {
    return keyword.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
  }

  // ============================================================================
  // Service Retrieval
  // ============================================================================

  /**
   * Get a service by ID
   */
  get(serviceId: string): EnhancedServiceEntry | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Get all services
   */
  getAll(): EnhancedServiceEntry[] {
    return Array.from(this.services.values());
  }

  /**
   * Get enabled services
   */
  getEnabled(): EnhancedServiceEntry[] {
    return Array.from(this.services.values()).filter((s) => s.enabled);
  }

  /**
   * Get healthy services
   */
  getHealthy(): EnhancedServiceEntry[] {
    return Array.from(this.services.values()).filter(
      (s) => s.enabled && s.healthStatus?.ok !== false
    );
  }

  /**
   * Check if a service exists
   */
  has(serviceId: string): boolean {
    return this.services.has(serviceId);
  }

  // ============================================================================
  // Capability-Based Retrieval
  // ============================================================================

  /**
   * Find services matching a query
   */
  query(query: ServiceQuery): ServiceQueryResult {
    const timer = startTimer();
    const matches: CapabilityMatch[] = [];
    const serviceScores = new Map<string, number>();

    // Search keywords
    if (query.keywords) {
      for (const keyword of query.keywords) {
        const normalized = this.normalizeKeyword(keyword);

        // Exact keyword match
        const keywordMatches = this.keywordIndex.get(normalized);
        if (keywordMatches) {
          for (const serviceId of keywordMatches) {
            const score = (serviceScores.get(serviceId) || 0) + 10;
            serviceScores.set(serviceId, score);
            matches.push({
              serviceId,
              serviceName: this.services.get(serviceId)!.name,
              matchType: 'keyword',
              score: 10,
            });
          }
        }

        // Partial keyword match
        for (const [key, serviceIds] of this.keywordIndex) {
          if (key.includes(normalized) || normalized.includes(key)) {
            for (const serviceId of serviceIds) {
              const score = (serviceScores.get(serviceId) || 0) + 5;
              serviceScores.set(serviceId, score);
            }
          }
        }
      }
    }

    // Search tags
    if (query.tags) {
      for (const tag of query.tags) {
        const normalized = this.normalizeKeyword(tag);
        const tagMatches = this.tagIndex.get(normalized);
        if (tagMatches) {
          for (const serviceId of tagMatches) {
            const score = (serviceScores.get(serviceId) || 0) + 8;
            serviceScores.set(serviceId, score);
            matches.push({
              serviceId,
              serviceName: this.services.get(serviceId)!.name,
              matchType: 'tag',
              score: 8,
            });
          }
        }
      }
    }

    // Search capabilities
    if (query.capabilities) {
      for (const capability of query.capabilities) {
        const normalized = this.normalizeKeyword(capability);
        const capMatches = this.capabilityIndex.get(normalized);
        if (capMatches) {
          for (const serviceId of capMatches) {
            const score = (serviceScores.get(serviceId) || 0) + 15;
            serviceScores.set(serviceId, score);
            matches.push({
              serviceId,
              serviceName: this.services.get(serviceId)!.name,
              matchType: 'capability',
              score: 15,
            });
          }
        }
      }
    }

    // Get services sorted by score
    let services = Array.from(serviceScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([serviceId]) => this.services.get(serviceId)!)
      .filter(Boolean);

    // Apply filters
    if (query.enabledOnly !== false) {
      services = services.filter((s) => s.enabled);
    }

    if (query.healthyOnly) {
      services = services.filter((s) => s.healthStatus?.ok !== false);
    }

    if (query.riskLevel) {
      services = services.filter((s) => s.riskLevel === query.riskLevel);
    }

    // Apply limit
    if (query.limit && services.length > query.limit) {
      services = services.slice(0, query.limit);
    }

    const timing = timer();
    return {
      services,
      matches,
      queryTime: timing.durationMs,
    };
  }

  /**
   * Find services by keywords extracted from a user message
   */
  findByUserMessage(message: string, limit?: number): ServiceQueryResult {
    // Extract keywords from the message
    const words = message.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    return this.query({
      keywords: words,
      enabledOnly: true,
      limit: limit || this.config.maxRoutingCandidates,
    });
  }

  // ============================================================================
  // Manifest Management
  // ============================================================================

  /**
   * Fetch and cache service metadata
   */
  async fetchMeta(serviceId: string): Promise<YWAIPServiceMeta | null> {
    const service = this.get(serviceId);
    if (!service) return null;

    try {
      const response = await fetch(`${service.baseUrl}${service.endpoints.meta}`, {
        signal: AbortSignal.timeout(this.config.defaultTimeout),
      });

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

  /**
   * Fetch and cache service actions
   */
  async fetchActions(serviceId: string): Promise<YWAIPActionsResponse | null> {
    const service = this.get(serviceId);
    if (!service) return null;

    // Check cache
    const cached = this.manifestCache.get(serviceId);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        actions: cached.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          requiredScopes: t.requiredScopes,
          returnsAsync: t.returnsAsync,
        })),
      };
    }

    try {
      const timer = startTimer();
      const response = await fetch(`${service.baseUrl}${service.endpoints.actions}`, {
        signal: AbortSignal.timeout(this.config.defaultTimeout),
      });

      if (!response.ok) {
        logger.warn('Failed to fetch service actions', { serviceId, status: response.status });
        return null;
      }

      const data = await response.json() as YWAIPActionsResponse;
      const timing = timer();

      // Cache the manifest
      const manifest: ToolManifest = {
        serviceId,
        serviceName: service.name,
        version: '1.0',
        protocolVersion: '1.0',
        tools: data.actions.map((a) => ({
          name: a.name,
          description: a.description,
          parameters: a.parameters,
          requiredScopes: a.requiredScopes,
          returnsAsync: a.returnsAsync,
        })),
        fetchedAt: Date.now(),
        expiresAt: Date.now() + this.config.manifestCacheTTL * 1000,
      };

      this.manifestCache.set(serviceId, manifest);
      service.manifest = manifest;
      service.lastManifestFetch = Date.now();

      logger.debug('Actions fetched and cached', {
        serviceId,
        actionCount: data.actions.length,
        durationMs: timing.durationMs,
      });

      return data;
    } catch (error) {
      logger.error('Error fetching service actions', error, { serviceId });
      return null;
    }
  }

  /**
   * Get cached manifest for a service
   */
  getCachedManifest(serviceId: string): ToolManifest | null {
    const cached = this.manifestCache.get(serviceId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }
    return null;
  }

  /**
   * Invalidate manifest cache for a service
   */
  invalidateManifest(serviceId: string): void {
    this.manifestCache.delete(serviceId);
    const service = this.services.get(serviceId);
    if (service) {
      service.manifest = undefined;
    }
  }

  /**
   * Refresh all manifests
   */
  async refreshAllManifests(): Promise<void> {
    const enabled = this.getEnabled();
    await Promise.all(enabled.map((s) => this.fetchActions(s.id)));
    logger.info('All manifests refreshed', { count: enabled.length });
  }

  // ============================================================================
  // Health Management
  // ============================================================================

  /**
   * Check health of a service
   */
  async checkHealth(serviceId: string): Promise<ServiceHealthStatus> {
    const service = this.get(serviceId);
    if (!service) {
      return { ok: false, lastCheck: Date.now(), error: 'Service not found' };
    }

    try {
      const timer = startTimer();
      const response = await fetch(`${service.baseUrl}${service.endpoints.health}`, {
        signal: AbortSignal.timeout(5000),
      });

      const timing = timer();
      const ok = response.ok;

      let version: string | undefined;
      try {
        const data = await response.json() as HealthResponse;
        version = data.version;
      } catch {
        // Ignore JSON parse errors
      }

      const status: ServiceHealthStatus = {
        ok,
        lastCheck: Date.now(),
        responseTimeMs: timing.durationMs,
        version,
      };

      service.healthStatus = status;

      if (!ok) {
        logger.warn('Service health check failed', { serviceId, status: response.status });
      }

      return status;
    } catch (error) {
      const status: ServiceHealthStatus = {
        ok: false,
        lastCheck: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      service.healthStatus = status;
      logger.error('Service health check error', error, { serviceId });

      return status;
    }
  }

  /**
   * Check health of all enabled services
   */
  async checkAllHealth(): Promise<Map<string, ServiceHealthStatus>> {
    const results = new Map<string, ServiceHealthStatus>();
    const enabled = this.getEnabled();

    await Promise.all(
      enabled.map(async (service) => {
        const status = await this.checkHealth(service.id);
        results.set(service.id, status);
      })
    );

    logger.info('Health check complete', {
      total: enabled.length,
      healthy: Array.from(results.values()).filter((s) => s.ok).length,
    });

    return results;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get registry statistics
   */
  getStats(): RegistryStats {
    const all = this.getAll();
    const enabled = all.filter((s) => s.enabled);
    const healthy = all.filter((s) => s.healthStatus?.ok);
    const withManifests = Array.from(this.manifestCache.values()).filter(
      (m) => m.expiresAt > Date.now()
    );

    return {
      totalServices: all.length,
      enabledServices: enabled.length,
      healthyServices: healthy.length,
      unhealthyServices: enabled.length - healthy.length,
      servicesWithManifests: withManifests.length,
      totalTools: withManifests.reduce((sum, m) => sum + m.tools.length, 0),
      indexedKeywords: this.keywordIndex.size,
      indexedTags: this.tagIndex.size,
      indexedCapabilities: this.capabilityIndex.size,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): RegistryConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let enhancedRegistryInstance: EnhancedServiceRegistry | null = null;

export function getEnhancedRegistry(): EnhancedServiceRegistry {
  if (!enhancedRegistryInstance) {
    enhancedRegistryInstance = new EnhancedServiceRegistry();
  }
  return enhancedRegistryInstance;
}

export function resetEnhancedRegistry(): void {
  enhancedRegistryInstance = null;
}
