/**
 * Yukie Core - Bundled for Vercel Serverless
 *
 * This file re-exports all yukie-core functionality for use in Vercel serverless functions.
 * It uses relative imports to ensure proper bundling.
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

// Re-export registry
export {
  getRegistry,
  resetRegistry,
  getDefaultServicesConfig,
  initializeRegistry,
} from '../../packages/yukie-core/src/registry';

// Re-export router (original)
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

// Re-export enhanced registry
export {
  EnhancedServiceRegistry,
  getEnhancedRegistry,
  resetEnhancedRegistry,
  CapabilityIndex,
  getCapabilityIndex,
  ManifestCache,
  getManifestCache,
} from '../../packages/yukie-core/src/registry/index';

// Re-export retrieval router
export {
  RetrievalRouter,
  getRetrievalRouter,
  routeWithRetrieval,
  KeywordExtractor,
  getKeywordExtractor,
} from '../../packages/yukie-core/src/router/index';

// Re-export planner
export {
  Planner,
  getPlanner,
} from '../../packages/yukie-core/src/planner/index';

// Re-export executor
export {
  Executor,
  getExecutor,
  ParameterValidator,
  getValidator,
} from '../../packages/yukie-core/src/executor/index';

// Re-export composer
export {
  ResponseComposer,
  getComposer,
} from '../../packages/yukie-core/src/composer/index';

// Re-export security
export {
  RiskClassifier,
  getRiskClassifier,
  ConfirmationGate,
  getConfirmationGate,
  InputSanitizer,
  getInputSanitizer,
} from '../../packages/yukie-core/src/security/index';

// Re-export audit
export {
  AuditLogger,
  getAuditLogger,
} from '../../packages/yukie-core/src/audit/index';
