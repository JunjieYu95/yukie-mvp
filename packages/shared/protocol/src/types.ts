// YWAIP (Yukie-Worker Agentic Invocation Protocol) Types
// Protocol version: 1.0

// ============================================================================
// Core Protocol Types
// ============================================================================

export interface YWAIPServiceMeta {
  service: string;
  version: string;
  protocol: 'ywaip';
  protocolVersion: '1.0';
  description: string;
  capabilities: string[];
  scopes: string[];
}

export interface YWAIPAction {
  name: string;
  description: string;
  parameters: YWAIPParameter[];
  requiredScopes: string[];
  returnsAsync?: boolean;
}

export interface YWAIPParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: unknown;
}

export interface YWAIPActionsResponse {
  actions: YWAIPAction[];
}

export interface YWAIPInvokeRequest {
  action: string;
  params: Record<string, unknown>;
  context?: YWAIPContext;
}

export interface YWAIPContext {
  userId?: string;
  conversationId?: string;
  requestId?: string;
  scopes?: string[];
  utcOffsetMinutes?: number;
}

export interface YWAIPInvokeResponse {
  success: boolean;
  result?: unknown;
  error?: YWAIPError;
  asyncJobId?: string;
}

export interface YWAIPError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// YNFP (Yukie Natural-language Function Protocol) Types
// ============================================================================

export interface YNFPRequest {
  utterance: string;
  context?: YNFPContext;
}

export interface YNFPContext {
  userId?: string;
  conversationHistory?: YNFPMessage[];
  serviceHint?: string;
}

export interface YNFPMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface YNFPRoutingResult {
  targetService: string;
  confidence: number;
  reasoning: string;
}

export interface YNFPFunctionCall {
  function: string;
  params: Record<string, unknown>;
}

export interface YNFPResponse {
  response: string;
  functionCalled?: YNFPFunctionCall;
  serviceUsed?: string;
  asyncJobId?: string;
}

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
  actionInvoked?: string;
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
  action: string;
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
  actionInvoked?: string;
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
