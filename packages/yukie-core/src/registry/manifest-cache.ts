/**
 * Manifest Cache
 *
 * Caches tool manifests with TTL-based expiration.
 * Supports background refresh and version tracking.
 */

import { createLogger, startTimer } from '../../../shared/observability/src/logger';
import type { ToolManifest, ToolSchema } from './types';
import type { YWAIPActionsResponse } from '../../../shared/protocol/src/types';

const logger = createLogger('manifest-cache');

// ============================================================================
// Cache Entry
// ============================================================================

interface CacheEntry {
  manifest: ToolManifest;
  fetchedAt: number;
  expiresAt: number;
  version: string;
  etag?: string;
}

// ============================================================================
// Manifest Cache
// ============================================================================

export class ManifestCache {
  private cache: Map<string, CacheEntry> = new Map();
  private defaultTTL: number; // milliseconds

  // Background refresh state
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private refreshCallbacks: Map<string, () => Promise<YWAIPActionsResponse | null>> = new Map();

  constructor(ttlSeconds: number = 600) {
    this.defaultTTL = ttlSeconds * 1000;
  }

  // ============================================================================
  // Cache Operations
  // ============================================================================

  /**
   * Get a cached manifest
   */
  get(serviceId: string): ToolManifest | null {
    const entry = this.cache.get(serviceId);
    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      logger.debug('Manifest expired', { serviceId });
      return null;
    }

    return entry.manifest;
  }

  /**
   * Set a manifest in the cache
   */
  set(
    serviceId: string,
    manifest: ToolManifest,
    options?: { ttl?: number; etag?: string }
  ): void {
    const ttl = options?.ttl ? options.ttl * 1000 : this.defaultTTL;
    const now = Date.now();

    const entry: CacheEntry = {
      manifest: {
        ...manifest,
        fetchedAt: now,
        expiresAt: now + ttl,
      },
      fetchedAt: now,
      expiresAt: now + ttl,
      version: manifest.version,
      etag: options?.etag,
    };

    this.cache.set(serviceId, entry);

    logger.debug('Manifest cached', {
      serviceId,
      toolCount: manifest.tools.length,
      ttlMs: ttl,
    });
  }

  /**
   * Cache manifest from YWAIP actions response
   */
  setFromActions(
    serviceId: string,
    serviceName: string,
    actions: YWAIPActionsResponse,
    options?: { ttl?: number; version?: string }
  ): ToolManifest {
    const tools: ToolSchema[] = actions.actions.map((action) => ({
      name: action.name,
      description: action.description,
      parameters: action.parameters,
      requiredScopes: action.requiredScopes,
      returnsAsync: action.returnsAsync,
    }));

    const manifest: ToolManifest = {
      serviceId,
      serviceName,
      version: options?.version || '1.0',
      protocolVersion: '1.0',
      tools,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + (options?.ttl ? options.ttl * 1000 : this.defaultTTL),
    };

    this.set(serviceId, manifest, options);
    return manifest;
  }

  /**
   * Check if a manifest is cached and valid
   */
  has(serviceId: string): boolean {
    const entry = this.cache.get(serviceId);
    return entry !== null && entry !== undefined && Date.now() <= entry.expiresAt;
  }

  /**
   * Invalidate a cached manifest
   */
  invalidate(serviceId: string): boolean {
    return this.cache.delete(serviceId);
  }

  /**
   * Invalidate all cached manifests
   */
  invalidateAll(): void {
    this.cache.clear();
    logger.info('All manifests invalidated');
  }

  /**
   * Get all cached service IDs
   */
  getCachedServiceIds(): string[] {
    const now = Date.now();
    const ids: string[] = [];
    for (const [serviceId, entry] of this.cache) {
      if (now <= entry.expiresAt) {
        ids.push(serviceId);
      }
    }
    return ids;
  }

  /**
   * Get all tools from all cached manifests
   */
  getAllTools(): Array<{ serviceId: string; tool: ToolSchema }> {
    const now = Date.now();
    const tools: Array<{ serviceId: string; tool: ToolSchema }> = [];

    for (const [serviceId, entry] of this.cache) {
      if (now <= entry.expiresAt) {
        for (const tool of entry.manifest.tools) {
          tools.push({ serviceId, tool });
        }
      }
    }

    return tools;
  }

  // ============================================================================
  // Background Refresh
  // ============================================================================

  /**
   * Register a refresh callback for a service
   */
  registerRefreshCallback(
    serviceId: string,
    callback: () => Promise<YWAIPActionsResponse | null>
  ): void {
    this.refreshCallbacks.set(serviceId, callback);
  }

  /**
   * Unregister a refresh callback
   */
  unregisterRefreshCallback(serviceId: string): void {
    this.refreshCallbacks.delete(serviceId);
  }

  /**
   * Start background refresh
   */
  startBackgroundRefresh(intervalSeconds: number = 300): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(async () => {
      await this.refreshExpiring();
    }, intervalSeconds * 1000);

    logger.info('Background refresh started', { intervalSeconds });
  }

  /**
   * Stop background refresh
   */
  stopBackgroundRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      logger.info('Background refresh stopped');
    }
  }

  /**
   * Refresh manifests that are about to expire
   */
  private async refreshExpiring(): Promise<void> {
    const now = Date.now();
    const threshold = now + this.defaultTTL * 0.2; // Refresh when 20% TTL remaining

    const toRefresh: string[] = [];
    for (const [serviceId, entry] of this.cache) {
      if (entry.expiresAt < threshold && this.refreshCallbacks.has(serviceId)) {
        toRefresh.push(serviceId);
      }
    }

    if (toRefresh.length === 0) return;

    logger.debug('Refreshing expiring manifests', { count: toRefresh.length });

    await Promise.all(
      toRefresh.map(async (serviceId) => {
        const callback = this.refreshCallbacks.get(serviceId);
        if (!callback) return;

        try {
          const actions = await callback();
          if (actions) {
            const entry = this.cache.get(serviceId);
            if (entry) {
              this.setFromActions(serviceId, entry.manifest.serviceName, actions);
            }
          }
        } catch (error) {
          logger.warn('Failed to refresh manifest', { serviceId }, error);
        }
      })
    );
  }

  // ============================================================================
  // Version Tracking
  // ============================================================================

  /**
   * Check if a manifest version has changed
   */
  hasVersionChanged(serviceId: string, newVersion: string): boolean {
    const entry = this.cache.get(serviceId);
    if (!entry) return true;
    return entry.version !== newVersion;
  }

  /**
   * Get the cached version for a service
   */
  getVersion(serviceId: string): string | null {
    const entry = this.cache.get(serviceId);
    return entry?.version || null;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get cache statistics
   */
  getStats(): {
    totalCached: number;
    validCached: number;
    expiredCached: number;
    totalTools: number;
    oldestFetch: number | null;
    newestFetch: number | null;
  } {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;
    let totalTools = 0;
    let oldestFetch: number | null = null;
    let newestFetch: number | null = null;

    for (const entry of this.cache.values()) {
      if (now <= entry.expiresAt) {
        validCount++;
        totalTools += entry.manifest.tools.length;
      } else {
        expiredCount++;
      }

      if (oldestFetch === null || entry.fetchedAt < oldestFetch) {
        oldestFetch = entry.fetchedAt;
      }
      if (newestFetch === null || entry.fetchedAt > newestFetch) {
        newestFetch = entry.fetchedAt;
      }
    }

    return {
      totalCached: this.cache.size,
      validCached: validCount,
      expiredCached: expiredCount,
      totalTools,
      oldestFetch,
      newestFetch,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [serviceId, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(serviceId);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Cleaned up expired manifests', { removed });
    }

    return removed;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let manifestCacheInstance: ManifestCache | null = null;

export function getManifestCache(ttlSeconds?: number): ManifestCache {
  if (!manifestCacheInstance) {
    manifestCacheInstance = new ManifestCache(ttlSeconds);
  }
  return manifestCacheInstance;
}

export function resetManifestCache(): void {
  if (manifestCacheInstance) {
    manifestCacheInstance.stopBackgroundRefresh();
  }
  manifestCacheInstance = null;
}
