/**
 * Yukie Core - Bundled for Vercel Serverless
 *
 * This file re-exports yukie-core functionality for use in Vercel serverless functions.
 * Uses relative imports to ensure proper bundling.
 *
 * Module structure:
 * - registry.ts: Original service registry (basic)
 * - router.ts: Original LLM-based router (basic)
 * - enhanced-registry/: Enhanced registry with capability indexing (Phase 2)
 * - retrieval-router/: Retrieval-based routing with keyword extraction (Phase 3)
 */

// Re-export types from protocol
export type {
  YWAIPServiceMeta,
  YWAIPAction,
  YWAIPParameter,
  YWAIPActionsResponse,
  YWAIPInvokeRequest,
  YWAIPInvokeResponse,
  YWAIPContext,
  YWAIPError,
  YNFPRoutingResult,
  YNFPFunctionCall,
  YNFPResponse,
  ServiceRegistryEntry,
  ChatRequest,
  ChatResponse,
  InboxJob,
  AuthContext,
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  HealthResponse,
} from '../../packages/shared/protocol/src/types';

// Re-export logger utilities
export {
  createLogger,
  startTimer,
  Logger,
  recordMetric,
} from '../../packages/shared/observability/src/logger';
export type { LogLevel, TimingResult, Metric } from '../../packages/shared/observability/src/logger';

// Re-export LLM client
export {
  getLLMClient,
  resetLLMClient,
  complete,
  completeWithJSON,
} from '../../packages/yukie-core/src/llm/client';
export type { LLMClient } from '../../packages/yukie-core/src/llm/client';

// Re-export prompts
export {
  buildRoutingPrompt,
  buildRoutingUserMessage,
  buildFallbackPrompt,
  buildResponseFormattingPrompt,
  buildConversationSummaryPrompt,
} from '../../packages/yukie-core/src/llm/prompts';

// Re-export original registry (registry.ts file)
export {
  getRegistry,
  resetRegistry,
  getDefaultServicesConfig,
  initializeRegistry,
} from '../../packages/yukie-core/src/registry';

// Re-export original router (router.ts file)
export {
  routeMessage,
  invokeService,
  formatResponse,
  generateFallbackResponse,
  processChatMessage,
} from '../../packages/yukie-core/src/router';
export type {
  InvokeServiceOptions,
  ChatFlowOptions,
  ChatFlowResult,
} from '../../packages/yukie-core/src/router';
