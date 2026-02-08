/**
 * MCP Client Implementation
 *
 * This module provides a lightweight MCP (Model Context Protocol) client
 * for connecting to MCP servers over HTTP transport.
 *
 * Based on MCP specification: https://modelcontextprotocol.io
 */

import type {
  MCPJsonRpcRequest,
  MCPJsonRpcResponse,
  MCPInitializeResult,
  MCPServerCapabilities,
  MCPTool,
  MCPToolsListResult,
  MCPToolsCallRequest,
  MCPToolsCallResult,
  MCPResource,
  MCPResourcesListResult,
  MCPResourcesReadResult,
  MCPPrompt,
  MCPPromptsListResult,
  MCPPromptsGetResult,
  AuthContext,
} from '../../protocol/src/types';

// ============================================================================
// Types
// ============================================================================

export interface MCPClientConfig {
  baseUrl: string;
  clientInfo?: {
    name: string;
    version: string;
  };
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

export interface MCPClientContext {
  userId?: string;
  scopes?: string[];
  requestId?: string;
  utcOffsetMinutes?: number;
}

export interface MCPConnectionState {
  connected: boolean;
  initialized: boolean;
  serverInfo?: {
    name: string;
    version: string;
  };
  capabilities?: MCPServerCapabilities;
  error?: string;
}

// ============================================================================
// MCP Client Class
// ============================================================================

export class MCPClient {
  private config: MCPClientConfig;
  private state: MCPConnectionState = {
    connected: false,
    initialized: false,
  };
  private toolsCache: MCPTool[] = [];
  private resourcesCache: MCPResource[] = [];
  private promptsCache: MCPPrompt[] = [];
  private requestIdCounter = 0;
  private cacheTimestamp = 0;
  private cacheTTL: number;

  constructor(config: MCPClientConfig) {
    this.config = {
      timeout: 30000,
      retryCount: 3,
      retryDelay: 1000,
      clientInfo: {
        name: 'yukie-mcp-client',
        version: '1.0.0',
      },
      ...config,
    };
    this.cacheTTL = 10 * 60 * 1000; // 10 minutes
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  async connect(context?: MCPClientContext): Promise<MCPConnectionState> {
    try {
      // Initialize connection
      const result = await this.initialize(context);

      this.state = {
        connected: true,
        initialized: true,
        serverInfo: result.serverInfo,
        capabilities: result.capabilities,
      };

      // Pre-fetch tools if supported
      if (result.capabilities?.tools) {
        await this.listTools(context);
      }

      return this.state;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.state = {
        connected: false,
        initialized: false,
        error: `Failed to connect to MCP service at ${this.config.baseUrl}: ${errorMessage}`,
      };
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.state = {
      connected: false,
      initialized: false,
    };
    this.toolsCache = [];
    this.resourcesCache = [];
    this.promptsCache = [];
  }

  getState(): MCPConnectionState {
    return { ...this.state };
  }

  isConnected(): boolean {
    return this.state.connected && this.state.initialized;
  }

  // ============================================================================
  // Protocol Methods
  // ============================================================================

  private async initialize(context?: MCPClientContext): Promise<MCPInitializeResult> {
    const result = await this.sendRequest<MCPInitializeResult>(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: false },
        },
        clientInfo: this.config.clientInfo,
      },
      context
    );

    // Send initialized notification
    await this.sendRequest('initialized', {}, context);

    return result;
  }

  async listTools(context?: MCPClientContext): Promise<MCPTool[]> {
    // Check cache
    if (this.isCacheValid() && this.toolsCache.length > 0) {
      return this.toolsCache;
    }

    const result = await this.sendRequest<MCPToolsListResult>('tools/list', {}, context);
    this.toolsCache = result.tools;
    this.cacheTimestamp = Date.now();
    return result.tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    context?: MCPClientContext
  ): Promise<MCPToolsCallResult> {
    const request: MCPToolsCallRequest = {
      name,
      arguments: args,
    };
    return this.sendRequest<MCPToolsCallResult>('tools/call', request, context);
  }

  async listResources(context?: MCPClientContext): Promise<MCPResource[]> {
    if (this.isCacheValid() && this.resourcesCache.length > 0) {
      return this.resourcesCache;
    }

    const result = await this.sendRequest<MCPResourcesListResult>('resources/list', {}, context);
    this.resourcesCache = result.resources;
    return result.resources;
  }

  async readResource(uri: string, context?: MCPClientContext): Promise<MCPResourcesReadResult> {
    return this.sendRequest<MCPResourcesReadResult>('resources/read', { uri }, context);
  }

  async listPrompts(context?: MCPClientContext): Promise<MCPPrompt[]> {
    if (this.isCacheValid() && this.promptsCache.length > 0) {
      return this.promptsCache;
    }

    const result = await this.sendRequest<MCPPromptsListResult>('prompts/list', {}, context);
    this.promptsCache = result.prompts;
    return result.prompts;
  }

  async getPrompt(
    name: string,
    args?: Record<string, string>,
    context?: MCPClientContext
  ): Promise<MCPPromptsGetResult> {
    return this.sendRequest<MCPPromptsGetResult>(
      'prompts/get',
      { name, arguments: args },
      context
    );
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.sendRequest<{ pong: boolean }>('ping', {});
      return result.pong === true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.cacheTTL;
  }

  clearCache(): void {
    this.toolsCache = [];
    this.resourcesCache = [];
    this.promptsCache = [];
    this.cacheTimestamp = 0;
  }

  getCachedTools(): MCPTool[] {
    return [...this.toolsCache];
  }

  // ============================================================================
  // HTTP Transport
  // ============================================================================

  private async sendRequest<T>(
    method: string,
    params: Record<string, unknown>,
    context?: MCPClientContext
  ): Promise<T> {
    const requestId = ++this.requestIdCounter;

    const jsonRpcRequest: MCPJsonRpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add context headers
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

    let lastError: Error | null = null;
    const retryCount = this.config.retryCount || 3;
    const retryDelay = this.config.retryDelay || 1000;

    for (let attempt = 0; attempt < retryCount; attempt++) {
      try {
        const response = await this.fetchWithTimeout(
          this.config.baseUrl,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(jsonRpcRequest),
          },
          this.config.timeout || 30000
        );

        if (!response.ok) {
          const statusMessage = this.describeHTTPError(response.status, response.statusText);
          throw new Error(`MCP service HTTP error (${response.status}): ${statusMessage} [URL: ${this.config.baseUrl}, method: ${method}]`);
        }

        let jsonRpcResponse: MCPJsonRpcResponse;
        try {
          jsonRpcResponse = await response.json();
        } catch (parseError) {
          throw new Error(`MCP service returned invalid JSON response for method '${method}'. The service at ${this.config.baseUrl} may be misconfigured or returning HTML instead of JSON-RPC.`);
        }

        if (jsonRpcResponse.error) {
          const codeDesc = this.describeJsonRpcError(jsonRpcResponse.error.code);
          throw new MCPClientError(
            jsonRpcResponse.error.code,
            `MCP error [${codeDesc}]: ${jsonRpcResponse.error.message} [method: ${method}]`,
            jsonRpcResponse.error.data
          );
        }

        return jsonRpcResponse.result as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (MCP protocol errors)
        if (error instanceof MCPClientError) {
          throw error;
        }

        // Enhance timeout/abort errors
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error(`MCP request timed out after ${this.config.timeout}ms for method '${method}' at ${this.config.baseUrl}. The service may be unresponsive or overloaded.`);
        }

        // Enhance network errors
        if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('Failed'))) {
          lastError = new Error(`Cannot reach MCP service at ${this.config.baseUrl} for method '${method}'. The service may be down, the URL may be wrong, or there's a network issue. Original error: ${error.message}`);
        }

        // Wait before retrying
        if (attempt < retryCount - 1) {
          await this.delay(retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw new Error(`MCP request failed after ${retryCount} attempts for method '${method}' at ${this.config.baseUrl}. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private describeHTTPError(status: number, statusText: string): string {
    switch (status) {
      case 400: return `Bad request - the MCP request format was rejected by the service`;
      case 401: return `Authentication failed - the service requires valid credentials`;
      case 403: return `Access forbidden - insufficient permissions to access this service`;
      case 404: return `MCP endpoint not found - the service URL may be incorrect or the /api/mcp endpoint is not configured`;
      case 405: return `Method not allowed - the service does not accept POST requests at this endpoint`;
      case 408: return `Request timeout - the service took too long to respond`;
      case 429: return `Rate limited - too many requests sent to this service`;
      case 500: return `Internal server error - the service encountered an unexpected error`;
      case 502: return `Bad gateway - the service is unreachable through the proxy/gateway`;
      case 503: return `Service unavailable - the service is temporarily down or overloaded`;
      case 504: return `Gateway timeout - the service did not respond in time`;
      default: return statusText || `Unexpected error`;
    }
  }

  private describeJsonRpcError(code: number): string {
    switch (code) {
      case -32700: return 'Parse Error - invalid JSON was received';
      case -32600: return 'Invalid Request - the JSON-RPC request structure is invalid';
      case -32601: return 'Method Not Found - the requested MCP method does not exist';
      case -32602: return 'Invalid Params - the parameters provided are invalid';
      case -32603: return 'Internal Error - the MCP server encountered an internal error';
      case -32002: return 'Resource Not Found';
      case -32003: return 'Tool Not Found';
      case -32004: return 'Prompt Not Found';
      default: return `Error Code ${code}`;
    }
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  getServerInfo(): { name: string; version: string } | undefined {
    return this.state.serverInfo;
  }

  getCapabilities(): MCPServerCapabilities | undefined {
    return this.state.capabilities;
  }
}

// ============================================================================
// MCP Client Error
// ============================================================================

export class MCPClientError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'MCPClientError';
    this.code = code;
    this.data = data;
  }
}

// ============================================================================
// Client Factory
// ============================================================================

const clientCache = new Map<string, MCPClient>();

/**
 * Get or create an MCP client for a service
 */
export function getMCPClient(baseUrl: string, config?: Partial<MCPClientConfig>): MCPClient {
  const cacheKey = baseUrl;

  if (!clientCache.has(cacheKey)) {
    clientCache.set(
      cacheKey,
      new MCPClient({
        baseUrl,
        ...config,
      })
    );
  }

  return clientCache.get(cacheKey)!;
}

/**
 * Clear the client cache
 */
export function clearMCPClientCache(): void {
  clientCache.clear();
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert AuthContext to MCPClientContext
 */
export function authContextToMCPContext(auth: AuthContext): MCPClientContext {
  return {
    userId: auth.userId,
    scopes: auth.scopes,
    requestId: auth.requestId,
    utcOffsetMinutes: auth.utcOffsetMinutes,
  };
}

/**
 * Check if a tool exists in a list
 */
export function findTool(tools: MCPTool[], name: string): MCPTool | undefined {
  return tools.find((t) => t.name === name);
}

/**
 * Get tool names from a list
 */
export function getToolNames(tools: MCPTool[]): string[] {
  return tools.map((t) => t.name);
}

/**
 * Extract text content from tool result
 */
export function extractTextContent(result: MCPToolsCallResult): string {
  const textContents = result.content.filter((c) => c.type === 'text' && c.text);
  return textContents.map((c) => c.text).join('\n');
}

/**
 * Extract structured content from tool result
 */
export function extractStructuredContent<T = unknown>(result: MCPToolsCallResult): T | undefined {
  if (result.structuredContent) {
    return result.structuredContent as T;
  }

  // Try to parse from text content
  const text = extractTextContent(result);
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}
