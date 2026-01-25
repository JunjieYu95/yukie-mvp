/**
 * Yukie Core - Bundled for Vercel Serverless
 *
 * This file re-exports yukie-core functionality for use in Vercel serverless functions.
 * Uses relative imports to ensure proper bundling.
 *
 * NOTE: Only exports essential functions to avoid module resolution conflicts.
 * The new enhanced registry/router modules are available but not exported here
 * to prevent conflicts with existing files.
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
