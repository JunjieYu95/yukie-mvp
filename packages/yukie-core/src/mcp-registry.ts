/**
 * MCP-Aware Service Registry
 *
 * This registry supports both YWAIP and MCP protocols, enabling a gradual
 * migration from YWAIP to MCP while maintaining backward compatibility.
 */

import type {
  ServiceRegistryEntry,
  YWAIPServiceMeta,
  YWAIPActionsResponse,
  YWAIPAction,
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

export type ServiceProtocol = 'ywaip' | 'mcp';

export interface MCPServiceRegistryEntry extends ServiceRegistryEntry {
  protocol: ServiceProtocol;
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

  loadFromConfig(config: { services: Array<ServiceRegistryEntry & { protocol?: ServiceProtocol; mcpEndpoint?: string }> }): void {
    for (const service of config.services) {
      this.register({
        ...service,
        protocol: service.protocol || 'ywaip', // Default to YWAIP for backward compatibility
      });
    }
    logger.info('Services loaded from config', { count: config.services.length });
  }

  register(service: MCPServiceRegistryEntry): void {
    this.services.set(service.id, service);
    logger.info('Service registered', {
      serviceId: service.id,
      name: service.name,
      protocol: service.protocol,
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

  getProtocol(serviceId: string): ServiceProtocol | undefined {
    return this.services.get(serviceId)?.protocol;
  }

  // ============================================================================
  // MCP Connection Management
  // ============================================================================

  async connectMCP(serviceId: string, context?: InvokeContext): Promise<MCPConnectionState> {
    const service = this.get(serviceId);
    if (!service) {
      return { connected: false, initialized: false, error: 'Service not found' };
    }

    if (service.protocol !== 'mcp') {
      return { connected: false, initialized: false, error: 'Service is not MCP-compatible' };
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
  // Tool Discovery (Works for both protocols)
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
      let tools: MCPTool[];

      if (service.protocol === 'mcp') {
        tools = await this.fetchMCPTools(service, context);
      } else {
        // Convert YWAIP actions to MCP tools
        tools = await this.fetchYWAIPToolsAsMCP(service);
      }

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

  private async fetchMCPTools(service: MCPServiceRegistryEntry, context?: InvokeContext): Promise<MCPTool[]> {
    const endpoint = this.getMCPEndpoint(service);
    const result = await this.mcpRequest<MCPToolsListResult>(endpoint, 'tools/list', {}, context);
    return result.tools;
  }

  private async fetchYWAIPToolsAsMCP(service: MCPServiceRegistryEntry): Promise<MCPTool[]> {
    const actionsResponse = await this.fetchYWAIPActions(service.id);
    if (!actionsResponse) {
      return [];
    }

    // Convert YWAIP actions to MCP tools
    return actionsResponse.actions.map((action) => this.ywaipActionToMCPTool(action));
  }

  private ywaipActionToMCPTool(action: YWAIPAction): MCPTool {
    const properties: Record<string, { type: string; description?: string; default?: unknown }> = {};
    const required: string[] = [];

    for (const param of action.parameters) {
      properties[param.name] = {
        type: this.ywaipTypeToJsonSchemaType(param.type),
        description: param.description,
        default: param.default,
      };
      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      name: action.name,
      description: action.description,
      inputSchema: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      },
      annotations: {
        readOnlyHint: action.name.includes('query') || action.name.includes('stats'),
        destructiveHint: action.name.includes('delete'),
      },
    };
  }

  private ywaipTypeToJsonSchemaType(type: string): string {
    const mapping: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      object: 'object',
      array: 'array',
    };
    return mapping[type] || 'string';
  }

  // ============================================================================
  // Tool Invocation (Works for both protocols)
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
      if (service.protocol === 'mcp') {
        return await this.invokeMCPTool(service, toolName, args, context);
      } else {
        return await this.invokeYWAIPAction(service, toolName, args, context);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Tool invocation failed', error, { serviceId, toolName });
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  }

  private async invokeMCPTool(
    service: MCPServiceRegistryEntry,
    toolName: string,
    args: Record<string, unknown>,
    context?: InvokeContext
  ): Promise<MCPToolsCallResult> {
    const endpoint = this.getMCPEndpoint(service);
    return await this.mcpRequest<MCPToolsCallResult>(
      endpoint,
      'tools/call',
      { name: toolName, arguments: args },
      context
    );
  }

  private async invokeYWAIPAction(
    service: MCPServiceRegistryEntry,
    actionName: string,
    params: Record<string, unknown>,
    context?: InvokeContext
  ): Promise<MCPToolsCallResult> {
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

    const response = await fetch(`${service.baseUrl}/api/v1/invoke`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: actionName,
        params,
        context: {
          userId: context?.userId,
          scopes: context?.scopes,
          requestId: context?.requestId,
          utcOffsetMinutes: context?.utcOffsetMinutes,
        },
      }),
    });

    const result = await response.json();

    // Convert YWAIP response to MCP format
    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: result.result?.message || JSON.stringify(result.result, null, 2),
          },
        ],
        structuredContent: result.result,
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: result.error?.message || 'Action failed',
          },
        ],
        isError: true,
        structuredContent: result.error,
      };
    }
  }

  // ============================================================================
  // YWAIP Protocol Methods (Backward Compatibility)
  // ============================================================================

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
      return (await response.json()) as YWAIPServiceMeta;
    } catch (error) {
      logger.error('Error fetching service meta', error, { serviceId });
      return null;
    }
  }

  async fetchYWAIPActions(serviceId: string): Promise<YWAIPActionsResponse | null> {
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
      return (await response.json()) as YWAIPActionsResponse;
    } catch (error) {
      logger.error('Error fetching service actions', error, { serviceId });
      return null;
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
      // For MCP services, try ping first
      if (service.protocol === 'mcp') {
        const pingResult = await this.mcpPing(service);
        if (pingResult) {
          this.healthStatus.set(serviceId, { ok: true, lastCheck: Date.now() });
          return { ok: true, service: serviceId };
        }
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

    const jsonRpcResponse = await response.json();

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
// Default Configuration with MCP Support
// ============================================================================

export function getDefaultMCPServicesConfig(): { services: Array<MCPServiceRegistryEntry> } {
  return {
    services: [
      {
        id: 'habit-tracker',
        name: 'Habit Tracker',
        description: 'Track daily habits like waking up early, exercise, reading, meditation. Supports check-ins, streaks, and statistics.',
        baseUrl: process.env.HABIT_TRACKER_URL || 'http://localhost:3001',
        protocol: 'mcp', // Now using MCP!
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
