// Yukie Protocol Types
// Using MCP (Model Context Protocol) - https://modelcontextprotocol.io

// ============================================================================
// Yukie Core Types
// ============================================================================

export interface ServiceRegistryEntry {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  capabilities: string[];
  scopes: string[];
  healthEndpoint: string;
  enabled: boolean;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  model?: string;
}

export interface ChatResponse {
  response: string;
  conversationId: string;
  asyncJobId?: string;
  serviceUsed?: string;
  toolInvoked?: string;
  routingDetails?: {
    targetService: string;
    confidence: number;
    reasoning: string;
  };
}

export interface InboxJob {
  id: string;
  userId: string;
  conversationId?: string;
  service: string;
  tool: string;
  status: 'pending' | 'completed' | 'failed';
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxListResponse {
  jobs: InboxJob[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Auth Types
// ============================================================================

export interface JWTPayload {
  sub: string; // user id
  scopes: string[];
  iat: number;
  exp: number;
}

export interface AuthContext {
  userId: string;
  scopes: string[];
  requestId?: string;
  utcOffsetMinutes?: number;
}

// ============================================================================
// LLM Types
// ============================================================================

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface LLMCompletionResult {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ============================================================================
// Database Types
// ============================================================================

export interface Conversation {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: MessageMetadata;
  createdAt: string;
}

export interface MessageMetadata {
  serviceUsed?: string;
  toolInvoked?: string;
  routingConfidence?: number;
  processingTimeMs?: number;
}

// ============================================================================
// Health Check Types
// ============================================================================

export interface HealthResponse {
  ok: boolean;
  service?: string;
  version?: string;
  timestamp?: string;
}

// ============================================================================
// MCP (Model Context Protocol) Types
// Protocol specification: https://modelcontextprotocol.io
// ============================================================================

/**
 * JSON-RPC 2.0 base types for MCP
 */
export interface MCPJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: MCPJsonRpcError;
}

export interface MCPJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP Initialization
 */
export interface MCPClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

export interface MCPServerCapabilities {
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
  logging?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

export interface MCPInitializeRequest {
  protocolVersion: string;
  capabilities: MCPClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
  instructions?: string;
}

/**
 * MCP Tools
 */
export interface MCPToolInputSchema {
  type: 'object';
  properties?: Record<string, MCPJsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface MCPJsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: MCPJsonSchemaProperty;
  properties?: Record<string, MCPJsonSchemaProperty>;
  required?: string[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface MCPToolsListResult {
  tools: MCPTool[];
  nextCursor?: string;
}

export interface MCPToolsCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface MCPToolContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

export interface MCPToolsCallResult {
  content: MCPToolContent[];
  isError?: boolean;
  structuredContent?: unknown;
}

/**
 * MCP Resources
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: string[];
    priority?: number;
  };
}

export interface MCPResourcesListResult {
  resources: MCPResource[];
  nextCursor?: string;
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface MCPResourcesReadResult {
  contents: MCPResourceContent[];
}

/**
 * MCP Prompts
 */
export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptsListResult {
  prompts: MCPPrompt[];
  nextCursor?: string;
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: MCPToolContent;
}

export interface MCPPromptsGetResult {
  description?: string;
  messages: MCPPromptMessage[];
}

/**
 * MCP Error Codes (from JSON-RPC 2.0 + MCP spec)
 */
export const MCPErrorCodes = {
  // JSON-RPC 2.0 standard errors
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // MCP-specific errors
  RESOURCE_NOT_FOUND: -32002,
  TOOL_NOT_FOUND: -32003,
  PROMPT_NOT_FOUND: -32004,
} as const;

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  name: string;
  version: string;
  description?: string;
  transport: 'http' | 'sse' | 'stdio';
  capabilities?: MCPServerCapabilities;
}

/**
 * MCP Service Registry Entry
 */
export interface MCPServiceRegistryEntry extends Omit<ServiceRegistryEntry, 'capabilities'> {
  protocol: 'mcp';
  protocolVersion: string;
  mcpEndpoint?: string;
  mcpCapabilities?: MCPServerCapabilities;
  tools?: MCPTool[];
  resources?: MCPResource[];
  prompts?: MCPPrompt[];
}

/**
 * MCP Request Context
 */
export interface MCPRequestContext {
  userId?: string;
  scopes?: string[];
  requestId?: string;
  utcOffsetMinutes?: number;
}
