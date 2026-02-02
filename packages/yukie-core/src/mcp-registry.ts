/**
 * MCP Service Registry
 *
 * Service registry for MCP (Model Context Protocol) services.
 * All services communicate via the standard MCP protocol.
 */

import type {
  ServiceRegistryEntry,
  HealthResponse,
  MCPTool,
  MCPToolsListResult,
  MCPToolsCallResult,
  MCPInitializeResult,
  MCPServerCapabilities,
} from '../../shared/protocol/src/types.js';
import { createLogger } from '../../shared/observability/src/logger.js';

const logger = createLogger('mcp-registry');

// ============================================================================
// Types
// ============================================================================

export interface MCPServiceRegistryEntry extends ServiceRegistryEntry {
  mcpEndpoint?: string; // MCP endpoint URL (if different from baseUrl)
  tools?: MCPTool[]; // Cached tools
  toolsCachedAt?: number;
}

export interface MCPConnectionState {
  connected: boolean;
  initialized: boolean;
  serverInfo?: { name: string; version: string };
  capabilities?: MCPServerCapabilities;
  error?: string;
}

export interface InvokeContext {
  userId?: string;
  scopes?: string[];
  requestId?: string;
  utcOffsetMinutes?: number;
}

// ============================================================================
// MCP Service Registry
// ============================================================================

class MCPServiceRegistry {
  private services: Map<string, MCPServiceRegistryEntry> = new Map();
  private healthStatus: Map<string, { ok: boolean; lastCheck: number }> = new Map();
  private connectionState: Map<string, MCPConnectionState> = new Map();
  private toolsCacheTTL = 10 * 60 * 1000; // 10 minutes

  constructor() {}

  // ============================================================================
  // Service Registration
  // ============================================================================

  loadFromConfig(config: { services: Array<ServiceRegistryEntry & { mcpEndpoint?: string }> }): void {
    for (const service of config.services) {
      this.register(service);
    }
    logger.info('Services loaded from config', { count: config.services.length });
  }

  register(service: MCPServiceRegistryEntry): void {
    this.services.set(service.id, service);
    logger.info('Service registered', {
      serviceId: service.id,
      name: service.name,
    });
  }

  unregister(serviceId: string): boolean {
    const deleted = this.services.delete(serviceId);
    if (deleted) {
      this.healthStatus.delete(serviceId);
      this.connectionState.delete(serviceId);
      logger.info('Service unregistered', { serviceId });
    }
    return deleted;
  }

  get(serviceId: string): MCPServiceRegistryEntry | undefined {
    return this.services.get(serviceId);
  }

  getAll(): MCPServiceRegistryEntry[] {
    return Array.from(this.services.values());
  }

  getEnabled(): MCPServiceRegistryEntry[] {
    return Array.from(this.services.values()).filter((s) => s.enabled);
  }

  has(serviceId: string): boolean {
    return this.services.has(serviceId);
  }

  // ============================================================================
  // MCP Connection Management
  // ============================================================================

  async connectMCP(serviceId: string, context?: InvokeContext): Promise<MCPConnectionState> {
    const service = this.get(serviceId);
    if (!service) {
      return { connected: false, initialized: false, error: 'Service not found' };
    }

    try {
      const endpoint = this.getMCPEndpoint(service);
      const result = await this.mcpRequest<MCPInitializeResult>(
        endpoint,
        'initialize',
        {
          protocolVersion: '2024-11-05',
          capabilities: { roots: { listChanged: false } },
          clientInfo: { name: 'yukie-core', version: '1.0.0' },
        },
        context
      );

      // Send initialized notification
      await this.mcpRequest(endpoint, 'initialized', {}, context);

      const state: MCPConnectionState = {
        connected: true,
        initialized: true,
        serverInfo: result.serverInfo,
        capabilities: result.capabilities,
      };

      this.connectionState.set(serviceId, state);
      return state;
    } catch (error) {
      const state: MCPConnectionState = {
        connected: false,
        initialized: false,
        error: error instanceof Error ? error.message : String(error),
      };
      this.connectionState.set(serviceId, state);
      return state;
    }
  }

  getConnectionState(serviceId: string): MCPConnectionState | undefined {
    return this.connectionState.get(serviceId);
  }

  // ============================================================================
  // Tool Discovery
  // ============================================================================

  async fetchTools(serviceId: string, context?: InvokeContext): Promise<MCPTool[]> {
    const service = this.get(serviceId);
    if (!service) {
      return [];
    }

    // Check cache
    if (service.tools && service.toolsCachedAt) {
      if (Date.now() - service.toolsCachedAt < this.toolsCacheTTL) {
        return service.tools;
      }
    }

    try {
      const endpoint = this.getMCPEndpoint(service);
      const result = await this.mcpRequest<MCPToolsListResult>(endpoint, 'tools/list', {}, context);
      const tools = result.tools;

      // Cache the tools
      service.tools = tools;
      service.toolsCachedAt = Date.now();
      this.services.set(serviceId, service);

      return tools;
    } catch (error) {
      logger.error('Error fetching tools', error, { serviceId });
      return service.tools || [];
    }
  }

  // ============================================================================
  // Tool Invocation
  // ============================================================================

  async invokeTool(
    serviceId: string,
    toolName: string,
    args: Record<string, unknown>,
    context?: InvokeContext
  ): Promise<MCPToolsCallResult> {
    const service = this.get(serviceId);
    if (!service) {
      return {
        content: [{ type: 'text', text: 'Service not found' }],
        isError: true,
      };
    }

    try {
      const endpoint = this.getMCPEndpoint(service);
      return await this.mcpRequest<MCPToolsCallResult>(
        endpoint,
        'tools/call',
        { name: toolName, arguments: args },
        context
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Tool invocation failed', error, { serviceId, toolName });
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  }

  // ============================================================================
  // Health Checks
  // ============================================================================

  async checkHealth(serviceId: string): Promise<HealthResponse> {
    const service = this.get(serviceId);
    if (!service) {
      return { ok: false };
    }

    try {
      // Try MCP ping first
      const pingResult = await this.mcpPing(service);
      if (pingResult) {
        this.healthStatus.set(serviceId, { ok: true, lastCheck: Date.now() });
        return { ok: true, service: serviceId };
      }

      // Fall back to health endpoint
      const response = await fetch(`${service.baseUrl}${service.healthEndpoint}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      const ok = response.ok;
      this.healthStatus.set(serviceId, { ok, lastCheck: Date.now() });

      if (!ok) {
        logger.warn('Service health check failed', { serviceId, status: response.status });
      }

      try {
        return (await response.json()) as HealthResponse;
      } catch {
        return { ok, service: serviceId };
      }
    } catch (error) {
      this.healthStatus.set(serviceId, { ok: false, lastCheck: Date.now() });
      logger.error('Service health check error', error, { serviceId });
      return { ok: false, service: serviceId };
    }
  }

  private async mcpPing(service: MCPServiceRegistryEntry): Promise<boolean> {
    try {
      const endpoint = this.getMCPEndpoint(service);
      const result = await this.mcpRequest<{ pong: boolean }>(endpoint, 'ping', {});
      return result.pong === true;
    } catch {
      return false;
    }
  }

  getHealthStatus(serviceId: string): { ok: boolean; lastCheck: number } | undefined {
    return this.healthStatus.get(serviceId);
  }

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

  // ============================================================================
  // MCP Request Helper
  // ============================================================================

  private getMCPEndpoint(service: MCPServiceRegistryEntry): string {
    return service.mcpEndpoint || `${service.baseUrl}/api/mcp`;
  }

  private async mcpRequest<T>(
    endpoint: string,
    method: string,
    params: Record<string, unknown>,
    context?: InvokeContext
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (context?.userId) {
      headers['X-Yukie-User-Id'] = context.userId;
    }
    if (context?.scopes) {
      headers['X-Yukie-Scopes'] = context.scopes.join(',');
    }
    if (context?.requestId) {
      headers['X-Yukie-Request-Id'] = context.requestId;
    }
    if (context?.utcOffsetMinutes !== undefined) {
      headers['X-Yukie-UTC-Offset-Minutes'] = String(context.utcOffsetMinutes);
    }

    const requestId = Date.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`MCP request failed: ${response.status} ${response.statusText}`);
    }

    const jsonRpcResponse = await response.json() as {
      result?: T;
      error?: { code: number; message: string };
    };

    if (jsonRpcResponse.error) {
      throw new Error(jsonRpcResponse.error.message || 'MCP request failed');
    }

    return jsonRpcResponse.result as T;
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  clearToolsCache(serviceId?: string): void {
    if (serviceId) {
      const service = this.get(serviceId);
      if (service) {
        service.tools = undefined;
        service.toolsCachedAt = undefined;
        this.services.set(serviceId, service);
      }
    } else {
      for (const [id, service] of this.services) {
        service.tools = undefined;
        service.toolsCachedAt = undefined;
        this.services.set(id, service);
      }
    }
  }

  getCachedTools(serviceId: string): MCPTool[] | undefined {
    return this.get(serviceId)?.tools;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let mcpRegistryInstance: MCPServiceRegistry | null = null;

export function getMCPRegistry(): MCPServiceRegistry {
  if (!mcpRegistryInstance) {
    mcpRegistryInstance = new MCPServiceRegistry();
  }
  return mcpRegistryInstance;
}

export function resetMCPRegistry(): void {
  mcpRegistryInstance = null;
}

// ============================================================================
// Default Configuration
// ============================================================================

export function getDefaultMCPServicesConfig(): { services: Array<MCPServiceRegistryEntry> } {
  return {
    services: [
      {
        id: 'habit-tracker',
        name: 'Habit Tracker',
        description: 'Track daily habits like waking up early, exercise, reading, meditation. Supports check-ins, streaks, and statistics.',
        baseUrl: process.env.HABIT_TRACKER_URL || 'http://localhost:3001',
        mcpEndpoint: process.env.HABIT_TRACKER_MCP_URL || `${process.env.HABIT_TRACKER_URL || 'http://localhost:3001'}/api/mcp`,
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
      {
        id: 'momentum',
        name: 'Momentum',
        description: 'Binary success/failure tracking for daily habits. Use only when user explicitly says "I did it", "success", "I screwed it", or "failure" for habit outcomes. NOT for logging activities or time.',
        baseUrl: process.env.MOMENTUM_URL || 'https://momentum-mu-one.vercel.app',
        mcpEndpoint:
          process.env.MOMENTUM_MCP_URL ||
          `${process.env.MOMENTUM_URL || 'https://momentum-mu-one.vercel.app'}/api/mcp`,
        capabilities: [
          'momentum tracking',
          'success tracking',
          'failure tracking',
          'habit outcome',
          'did it',
          'screwed it',
          'binary outcome',
        ],
        scopes: [],
        healthEndpoint: '/api/mcp',
        enabled: true,
      },
      {
        id: 'diary-analyzer',
        name: 'Diary Analyzer',
        description: 'Log activities to Google Calendar with time duration and view time statistics. Use for "log activity", "spent time on", "worked on", "did X for Y minutes/hours", "how did I spend my time", "time stats", "productivity stats". Creates calendar events and generates charts.',
        baseUrl: process.env.DIARY_ANALYZER_URL || 'https://diary-analyzer-zeta.vercel.app',
        mcpEndpoint:
          process.env.DIARY_ANALYZER_MCP_URL ||
          `${process.env.DIARY_ANALYZER_URL || 'https://diary-analyzer-zeta.vercel.app'}/api/mcp`,
        capabilities: [
          'log activity',
          'activity logging',
          'calendar events',
          'time tracking',
          'spent time',
          'worked on',
          'highlights',
          'milestones',
          'achievements',
          'diary entry',
          'time statistics',
          'time stats',
          'productivity stats',
          'time distribution',
          'weekly stats',
          'category breakdown',
        ],
        scopes: ['diary:read', 'diary:write'],
        healthEndpoint: '/api/mcp',
        enabled: true,
      },
      {
        id: 'ideas-log',
        name: 'Ideas Log',
        description: 'Capture ideas and retrieve research reports with summaries and full markdown.',
        baseUrl: process.env.IDEAS_LOG_URL || 'https://ideas-log.vercel.app',
        mcpEndpoint:
          process.env.IDEAS_LOG_MCP_URL ||
          `${process.env.IDEAS_LOG_URL || 'https://ideas-log.vercel.app'}/api/mcp`,
        capabilities: [
          'idea capture',
          'idea logging',
          'idea list',
          'idea retrieval',
          'research report',
          'summary',
          'markdown report',
          'insights',
        ],
        scopes: ['ideas:read', 'ideas:write'],
        healthEndpoint: '/api/mcp',
        enabled: true,
      },
    ],
  };
}

export function initializeMCPRegistry(
  config?: { services: Array<MCPServiceRegistryEntry> }
): MCPServiceRegistry {
  const registry = getMCPRegistry();
  const servicesConfig = config || getDefaultMCPServicesConfig();
  registry.loadFromConfig(servicesConfig);
  return registry;
}
