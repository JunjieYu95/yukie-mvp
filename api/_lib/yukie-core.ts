/**
 * Yukie Core - Bundled for Vercel Serverless
 *
 * This file re-exports yukie-core functionality for use in Vercel serverless functions.
 * Uses relative imports to ensure proper bundling.
 *
 * Module structure:
 * - mcp-registry.ts: MCP service registry
 * - mcp-router.ts: MCP tool-based router
 * - enhanced-registry/: Enhanced registry with capability indexing (Phase 2)
 * - retrieval-router/: Retrieval-based routing with keyword extraction (Phase 3)
 */

// Re-export types from protocol
export type {
  ServiceRegistryEntry,
  ChatRequest,
  ChatResponse,
  InboxJob,
  AuthContext,
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  HealthResponse,
  // MCP types
  MCPJsonRpcRequest,
  MCPJsonRpcResponse,
  MCPTool,
  MCPToolsCallResult,
  MCPToolContent,
  MCPServerCapabilities,
  MCPInitializeResult,
} from '../../packages/shared/protocol/src/types.js';

// Re-export logger utilities
export {
  createLogger,
  startTimer,
  Logger,
  recordMetric,
} from '../../packages/shared/observability/src/logger.js';
export type { LogLevel, TimingResult, Metric } from '../../packages/shared/observability/src/logger.js';

// Re-export LLM client
export {
  getLLMClient,
  resetLLMClient,
  complete,
  completeWithJSON,
} from '../../packages/yukie-core/src/llm/client.js';
export type { LLMClient } from '../../packages/yukie-core/src/llm/client.js';

// Re-export prompts
export {
  buildRoutingPrompt,
  buildRoutingUserMessage,
  buildFallbackPrompt,
  buildResponseFormattingPrompt,
  buildConversationSummaryPrompt,
} from '../../packages/yukie-core/src/llm/prompts.js';

// Re-export MCP registry
export {
  getMCPRegistry,
  resetMCPRegistry,
  getDefaultMCPServicesConfig,
  initializeMCPRegistry,
} from '../../packages/yukie-core/src/mcp-registry.js';
export type {
  MCPServiceRegistryEntry,
  MCPConnectionState,
  InvokeContext,
} from '../../packages/yukie-core/src/mcp-registry.js';

// Re-export MCP router
export {
  routeToTool,
  invokeTool,
  formatResponse,
  generateFallbackResponse,
  selectToolParameters,
  processMCPChatMessage,
} from '../../packages/yukie-core/src/mcp-router.js';
export type {
  InvokeToolOptions,
  MCPChatFlowOptions,
  MCPChatFlowResult,
} from '../../packages/yukie-core/src/mcp-router.js';
