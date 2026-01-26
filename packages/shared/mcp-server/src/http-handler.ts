/**
 * MCP HTTP Handler
 *
 * Provides HTTP request handling for MCP servers in Vercel serverless functions
 * and other Node.js HTTP environments.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { MCPJsonRpcRequest, MCPJsonRpcResponse } from '../../protocol/src/types';
import type { MCPServer, MCPRequestContext } from './server';

// ============================================================================
// Types
// ============================================================================

export interface MCPHttpRequest {
  method?: string;
  url?: string;
  headers: {
    'content-type'?: string;
    authorization?: string;
    'x-yukie-user-id'?: string;
    'x-yukie-scopes'?: string;
    'x-yukie-request-id'?: string;
    'x-yukie-utc-offset-minutes'?: string;
  };
  body?: unknown;
}

export interface MCPHttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface MCPHttpHandlerOptions {
  server: MCPServer;
  cors?: boolean;
  corsOrigin?: string | string[];
}

// ============================================================================
// HTTP Handler
// ============================================================================

/**
 * Create an HTTP handler for an MCP server
 */
export function createMCPHttpHandler(options: MCPHttpHandlerOptions) {
  const { server, cors = true, corsOrigin = '*' } = options;

  const corsHeaders: Record<string, string> = cors
    ? {
        'Access-Control-Allow-Origin': Array.isArray(corsOrigin) ? corsOrigin.join(', ') : corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Yukie-User-Id, X-Yukie-Scopes, X-Yukie-Request-Id, X-Yukie-UTC-Offset-Minutes',
      }
    : {};

  return async (req: MCPHttpRequest): Promise<MCPHttpResponse> => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: corsHeaders,
        body: '',
      };
    }

    // Handle GET request for server info
    if (req.method === 'GET') {
      const info = server.getServerInfo();
      const capabilities = server.getCapabilities();
      const tools = server.getTools();

      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...info,
          protocol: 'mcp',
          protocolVersion: '2024-11-05',
          capabilities,
          toolCount: tools.length,
          tools: tools.map((t) => ({ name: t.name, description: t.description })),
        }),
      };
    }

    // Handle POST request for JSON-RPC
    if (req.method !== 'POST') {
      return {
        statusCode: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    // Parse request body
    let jsonRpcRequest: MCPJsonRpcRequest;
    try {
      if (typeof req.body === 'string') {
        jsonRpcRequest = JSON.parse(req.body);
      } else if (typeof req.body === 'object' && req.body !== null) {
        jsonRpcRequest = req.body as MCPJsonRpcRequest;
      } else {
        throw new Error('Invalid request body');
      }

      // Validate JSON-RPC structure
      if (jsonRpcRequest.jsonrpc !== '2.0' || !jsonRpcRequest.method) {
        throw new Error('Invalid JSON-RPC request');
      }
    } catch (error) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
            data: error instanceof Error ? error.message : String(error),
          },
        }),
      };
    }

    // Build request context from headers
    const context: MCPRequestContext = {
      requestId: jsonRpcRequest.id,
      userId: req.headers['x-yukie-user-id'],
      scopes: req.headers['x-yukie-scopes']?.split(',').map((s) => s.trim()),
      utcOffsetMinutes: req.headers['x-yukie-utc-offset-minutes']
        ? parseInt(req.headers['x-yukie-utc-offset-minutes'], 10)
        : undefined,
    };

    // Handle the request
    const response = await server.handleRequest(jsonRpcRequest, context);

    return {
      statusCode: response.error ? 400 : 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(response),
    };
  };
}

// ============================================================================
// Vercel Serverless Handler
// ============================================================================

/**
 * Create a Vercel serverless handler for an MCP server
 */
export function createVercelMCPHandler(options: MCPHttpHandlerOptions) {
  const handler = createMCPHttpHandler(options);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Parse request body
    let body: unknown = undefined;
    if (req.method === 'POST') {
      body = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
      });
      try {
        body = JSON.parse(body as string);
      } catch {
        // Keep as string if not valid JSON
      }
    }

    // Build request object
    const mcpRequest: MCPHttpRequest = {
      method: req.method,
      url: req.url,
      headers: {
        'content-type': req.headers['content-type'],
        authorization: req.headers.authorization,
        'x-yukie-user-id': req.headers['x-yukie-user-id'] as string,
        'x-yukie-scopes': req.headers['x-yukie-scopes'] as string,
        'x-yukie-request-id': req.headers['x-yukie-request-id'] as string,
        'x-yukie-utc-offset-minutes': req.headers['x-yukie-utc-offset-minutes'] as string,
      },
      body,
    };

    // Handle request
    const response = await handler(mcpRequest);

    // Send response
    res.writeHead(response.statusCode, response.headers);
    res.end(response.body);
  };
}

// ============================================================================
// Express-style Handler
// ============================================================================

export interface ExpressRequest {
  method: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ExpressResponse {
  status: (code: number) => ExpressResponse;
  set: (headers: Record<string, string>) => ExpressResponse;
  json: (data: unknown) => void;
  send: (data: string) => void;
}

/**
 * Create an Express-compatible handler for an MCP server
 */
export function createExpressMCPHandler(options: MCPHttpHandlerOptions) {
  const handler = createMCPHttpHandler(options);

  return async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
    const mcpRequest: MCPHttpRequest = {
      method: req.method,
      url: req.url,
      headers: {
        'content-type': req.headers['content-type'] as string,
        authorization: req.headers.authorization as string,
        'x-yukie-user-id': req.headers['x-yukie-user-id'] as string,
        'x-yukie-scopes': req.headers['x-yukie-scopes'] as string,
        'x-yukie-request-id': req.headers['x-yukie-request-id'] as string,
        'x-yukie-utc-offset-minutes': req.headers['x-yukie-utc-offset-minutes'] as string,
      },
      body: req.body,
    };

    const response = await handler(mcpRequest);

    res.status(response.statusCode).set(response.headers);

    if (response.headers['Content-Type'] === 'application/json') {
      res.json(JSON.parse(response.body));
    } else {
      res.send(response.body);
    }
  };
}
