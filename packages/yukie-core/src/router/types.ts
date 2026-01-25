/**
 * Router Types
 *
 * Type definitions for the retrieval-based routing system.
 */

import type { YWAIPAction, AuthContext } from '../../../shared/protocol/src/types';
import type { EnhancedServiceEntry, ToolSchema, RiskLevel } from '../registry/types';

// ============================================================================
// Routing Request/Response Types
// ============================================================================

export interface RoutingRequest {
  message: string;
  auth: AuthContext;
  conversationId?: string;
  model?: string;
  maxCandidates?: number;
}

export interface RoutingResult {
  targetService: string;
  confidence: number;
  reasoning: string;
  candidates?: CandidateTool[];
  retrievalTime?: number;
  routingTime?: number;
}

// ============================================================================
// Candidate Tool Types
// ============================================================================

export interface CandidateTool {
  serviceId: string;
  serviceName: string;
  serviceDescription: string;
  tool?: ToolSchema;
  matchScore: number;
  matchType: 'keyword' | 'tag' | 'capability' | 'semantic' | 'combined';
  priority: number;
  riskLevel: RiskLevel;
}

export interface CandidateService {
  service: EnhancedServiceEntry;
  matchScore: number;
  matchReasons: string[];
  tools?: ToolSchema[];
}

// ============================================================================
// Keyword Extraction Types
// ============================================================================

export interface ExtractedKeywords {
  keywords: string[];
  phrases: string[];
  intents: string[];
  entities: string[];
}

export interface KeywordExtractionOptions {
  maxKeywords?: number;
  includeNgrams?: boolean;
  detectIntents?: boolean;
  detectEntities?: boolean;
}

// ============================================================================
// Retrieval Configuration
// ============================================================================

export interface RetrievalConfig {
  // Maximum number of candidates to return
  maxCandidates: number;

  // Minimum score threshold for candidates
  minScore: number;

  // Weights for different match types
  weights: {
    keyword: number;
    tag: number;
    capability: number;
    semantic: number;
    priority: number;
  };

  // Whether to use semantic search (requires embeddings)
  useSemanticSearch: boolean;

  // Timeout for retrieval operations (milliseconds)
  timeout: number;
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  maxCandidates: 15,
  minScore: 0.1,
  weights: {
    keyword: 1.0,
    tag: 1.5,
    capability: 2.0,
    semantic: 2.5,
    priority: 0.5,
  },
  useSemanticSearch: false,
  timeout: 5000,
};

// ============================================================================
// LLM Routing Types
// ============================================================================

export interface LLMRoutingRequest {
  message: string;
  candidates: CandidateTool[];
  model?: string;
}

export interface LLMRoutingResponse {
  targetService: string;
  selectedTool?: string;
  confidence: number;
  reasoning: string;
  params?: Record<string, unknown>;
}

export interface LLMActionSelectionRequest {
  message: string;
  serviceId: string;
  actions: YWAIPAction[];
  model?: string;
}

export interface LLMActionSelectionResponse {
  action: string;
  params: Record<string, unknown>;
  confidence: number;
  reasoning?: string;
}

// ============================================================================
// Retrieval Method Types
// ============================================================================

export type RetrievalMethod = 'keyword' | 'semantic' | 'hybrid';

export interface RetrievalResult {
  candidates: CandidateTool[];
  method: RetrievalMethod;
  queryTime: number;
  totalMatches: number;
}

// ============================================================================
// Router Pipeline Types
// ============================================================================

export interface RouterPipelineStep {
  name: string;
  durationMs: number;
  result?: unknown;
}

export interface RouterPipelineResult {
  steps: RouterPipelineStep[];
  totalDurationMs: number;
  finalResult: RoutingResult;
}
