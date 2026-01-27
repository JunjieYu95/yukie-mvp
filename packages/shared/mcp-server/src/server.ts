/**
 * MCP Server Implementation
 *
 * This module provides a lightweight MCP (Model Context Protocol) server
 * implementation for HTTP transport, designed to work with Vercel serverless
 * functions and other Node.js HTTP servers.
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
  MCPToolContent,
  MCPResource,
  MCPResourcesListResult,
  MCPResourcesReadResult,
  MCPPrompt,
  MCPPromptsListResult,
  MCPPromptsGetResult,
  MCPServerConfig,
} from '../../protocol/src/types';

import { MCPErrorCodes } from '../../protocol/src/types';

// ============================================================================
// Types
// ============================================================================

export type ToolHandler = (
  args: Record<string, unknown>,
  context?: MCPRequestContext
) => Promise<MCPToolsCallResult>;

export type ResourceHandler = (
  uri: string,
  context?: MCPRequestContext
) => Promise<MCPResourcesReadResult>;

export type PromptHandler = (
  args: Record<string, string>,
  context?: MCPRequestContext
) => Promise<MCPPromptsGetResult>;

export interface MCPRequestContext {
  requestId: string | number;
  userId?: string;
  scopes?: string[];
  utcOffsetMinutes?: number;
}

export interface RegisteredTool {
  definition: MCPTool;
  handler: ToolHandler;
  requiredScopes?: string[];
}

export interface RegisteredResource {
  definition: MCPResource;
  handler: ResourceHandler;
}

export interface RegisteredPrompt {
  definition: MCPPrompt;
  handler: PromptHandler;
}

// ============================================================================
// MCP Server Class
// ============================================================================

export class MCPServer {
  private config: MCPServerConfig;
  private tools: Map<string, RegisteredTool> = new Map();
  private resources: Map<string, RegisteredResource> = new Map();
  private prompts: Map<string, RegisteredPrompt> = new Map();

  constructor(config: MCPServerConfig) {
    this.config = {
      ...config,
      capabilities: config.capabilities || {
        tools: { listChanged: false },
        resources: { listChanged: false, subscribe: false },
        prompts: { listChanged: false },
      },
    };
  }

  // ============================================================================
  // Tool Registration
  // ============================================================================

  registerTool(
    name: string,
    definition: Omit<MCPTool, 'name'>,
    handler: ToolHandler,
    options?: { requiredScopes?: string[] }
  ): void {
    this.tools.set(name, {
      definition: { name, ...definition },
      handler,
      requiredScopes: options?.requiredScopes,
    });
  }

  // ============================================================================
  // Resource Registration
  // ============================================================================

  registerResource(
    uri: string,
    definition: Omit<MCPResource, 'uri'>,
    handler: ResourceHandler
  ): void {
    this.resources.set(uri, {
      definition: { uri, ...definition },
      handler,
    });
  }

  // ============================================================================
  // Prompt Registration
  // ============================================================================

  registerPrompt(
    name: string,
    definition: Omit<MCPPrompt, 'name'>,
    handler: PromptHandler
  ): void {
    this.prompts.set(name, {
      definition: { name, ...definition },
      handler,
    });
  }

  // ============================================================================
  // Request Handling
  // ============================================================================

  async handleRequest(
    request: MCPJsonRpcRequest,
    context?: MCPRequestContext
  ): Promise<MCPJsonRpcResponse> {
    const { id, method, params } = request;
    const ctx = context || { requestId: id };

    try {
      let result: unknown;

      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(params as unknown);
          break;

        case 'initialized':
          // Client notification that initialization is complete
          return { jsonrpc: '2.0', id, result: {} };

        case 'ping':
          result = { pong: true };
          break;

        case 'tools/list':
          result = await this.handleToolsList(params, ctx);
          break;

        case 'tools/call':
          result = await this.handleToolsCall(params as unknown, ctx);
          break;

        case 'resources/list':
          result = await this.handleResourcesList(params, ctx);
          break;

        case 'resources/read':
          result = await this.handleResourcesRead(params as { uri: string }, ctx);
          break;

        case 'prompts/list':
          result = await this.handlePromptsList(params, ctx);
          break;

        case 'prompts/get':
          result = await this.handlePromptsGet(
            params as { name: string; arguments?: Record<string, string> },
            ctx
          );
          break;

        default:
          return this.errorResponse(id, MCPErrorCodes.METHOD_NOT_FOUND, `Unknown method: ${method}`);
      }

      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.errorResponse(id, MCPErrorCodes.INTERNAL_ERROR, message);
    }
  }

  // ============================================================================
  // Method Handlers
  // ============================================================================

  private async handleInitialize(_params: unknown): Promise<MCPInitializeResult> {
    return {
      protocolVersion: '2024-11-05',
      capabilities: this.config.capabilities!,
      serverInfo: {
        name: this.config.name,
        version: this.config.version,
      },
      instructions: this.config.description,
    };
  }

  private async handleToolsList(
    _params: unknown,
    _ctx: MCPRequestContext
  ): Promise<MCPToolsListResult> {
    const tools = Array.from(this.tools.values()).map((t) => t.definition);
    return { tools };
  }

  private async handleToolsCall(
    params: unknown,
    ctx: MCPRequestContext
  ): Promise<MCPToolsCallResult> {
    const { name, arguments: args } = params as MCPToolsCallRequest;
    const tool = this.tools.get(name);

    if (!tool) {
      throw new MCPError(MCPErrorCodes.TOOL_NOT_FOUND, `Tool not found: ${name}`);
    }

    // Check scopes if required
    if (tool.requiredScopes && tool.requiredScopes.length > 0) {
      const userScopes = ctx.scopes || [];
      const hasRequired = tool.requiredScopes.every((s) => userScopes.includes(s) || userScopes.includes('admin'));
      if (!hasRequired) {
        throw new MCPError(MCPErrorCodes.INVALID_PARAMS, 'Insufficient permissions');
      }
    }

    return await tool.handler(args || {}, ctx);
  }

  private async handleResourcesList(
    _params: unknown,
    _ctx: MCPRequestContext
  ): Promise<MCPResourcesListResult> {
    const resources = Array.from(this.resources.values()).map((r) => r.definition);
    return { resources };
  }

  private async handleResourcesRead(
    params: { uri: string },
    ctx: MCPRequestContext
  ): Promise<MCPResourcesReadResult> {
    const { uri } = params;
    const resource = this.resources.get(uri);

    if (!resource) {
      throw new MCPError(MCPErrorCodes.RESOURCE_NOT_FOUND, `Resource not found: ${uri}`);
    }

    return await resource.handler(uri, ctx);
  }

  private async handlePromptsList(
    _params: unknown,
    _ctx: MCPRequestContext
  ): Promise<MCPPromptsListResult> {
    const prompts = Array.from(this.prompts.values()).map((p) => p.definition);
    return { prompts };
  }

  private async handlePromptsGet(
    params: { name: string; arguments?: Record<string, string> },
    ctx: MCPRequestContext
  ): Promise<MCPPromptsGetResult> {
    const { name, arguments: args } = params;
    const prompt = this.prompts.get(name);

    if (!prompt) {
      throw new MCPError(MCPErrorCodes.PROMPT_NOT_FOUND, `Prompt not found: ${name}`);
    }

    return await prompt.handler(args || {}, ctx);
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  private errorResponse(
    id: string | number,
    code: number,
    message: string,
    data?: unknown
  ): MCPJsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getTools(): MCPTool[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  getResources(): MCPResource[] {
    return Array.from(this.resources.values()).map((r) => r.definition);
  }

  getPrompts(): MCPPrompt[] {
    return Array.from(this.prompts.values()).map((p) => p.definition);
  }

  getServerInfo(): { name: string; version: string; description?: string } {
    return {
      name: this.config.name,
      version: this.config.version,
      description: this.config.description,
    };
  }

  getCapabilities(): MCPServerCapabilities {
    return this.config.capabilities!;
  }
}

// ============================================================================
// MCP Error Class
// ============================================================================

export class MCPError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.data = data;
  }
}

// ============================================================================
// Result Helpers
// ============================================================================

/**
 * Create a text content result
 */
export function textContent(text: string): MCPToolContent {
  return { type: 'text', text };
}

/**
 * Create a JSON content result
 */
export function jsonContent(data: unknown): MCPToolContent {
  return { type: 'text', text: JSON.stringify(data, null, 2) };
}

/**
 * Create a successful tool result
 */
export function successResult(data: unknown): MCPToolsCallResult {
  return {
    content: [jsonContent(data)],
    structuredContent: data,
  };
}

/**
 * Create an error tool result
 */
export function errorResult(message: string, details?: unknown): MCPToolsCallResult {
  return {
    content: [
      textContent(message),
      ...(details ? [jsonContent(details)] : []),
    ],
    isError: true,
  };
}
