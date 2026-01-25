/**
 * Retrieval-Based Router
 *
 * Pre-filters tools using keyword/capability matching before
 * passing candidates to the LLM for final routing decisions.
 * This enables scaling to 100+ services without context overflow.
 */

import { createLogger, startTimer } from '../../../shared/observability/src/logger';
import type { YNFPRoutingResult, AuthContext } from '../../../shared/protocol/src/types';
import { getEnhancedRegistry, type EnhancedServiceEntry } from '../registry';
import { getKeywordExtractor, type KeywordExtractor } from './keyword-extractor';
import { completeWithJSON } from '../llm/client';
import type {
  RoutingRequest,
  RoutingResult,
  CandidateTool,
  RetrievalConfig,
  RetrievalResult,
  LLMRoutingResponse,
  DEFAULT_RETRIEVAL_CONFIG,
} from './types';

const logger = createLogger('retrieval-router');

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: RetrievalConfig = {
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
// Retrieval Router
// ============================================================================

export class RetrievalRouter {
  private config: RetrievalConfig;
  private keywordExtractor: KeywordExtractor;

  constructor(config?: Partial<RetrievalConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.keywordExtractor = getKeywordExtractor();
  }

  // ============================================================================
  // Main Routing Method
  // ============================================================================

  /**
   * Route a user message to the appropriate service
   */
  async route(request: RoutingRequest): Promise<RoutingResult> {
    const totalTimer = startTimer();

    // Step 1: Retrieve candidate tools
    const retrievalTimer = startTimer();
    const retrieval = await this.retrieveCandidates(
      request.message,
      request.maxCandidates || this.config.maxCandidates
    );
    const retrievalTime = retrievalTimer();

    logger.debug('Candidates retrieved', {
      count: retrieval.candidates.length,
      durationMs: retrievalTime.durationMs,
    });

    // Step 2: If no candidates, return early
    if (retrieval.candidates.length === 0) {
      return {
        targetService: 'none',
        confidence: 1.0,
        reasoning: 'No matching services found for this request',
        candidates: [],
        retrievalTime: retrievalTime.durationMs,
        routingTime: 0,
      };
    }

    // Step 3: Use LLM to make final routing decision
    const routingTimer = startTimer();
    const llmResult = await this.llmRoute(request.message, retrieval.candidates, request.model);
    const routingTime = routingTimer();

    const totalTime = totalTimer();

    logger.info('Routing complete', {
      targetService: llmResult.targetService,
      confidence: llmResult.confidence,
      candidateCount: retrieval.candidates.length,
      totalDurationMs: totalTime.durationMs,
    });

    return {
      targetService: llmResult.targetService,
      confidence: llmResult.confidence,
      reasoning: llmResult.reasoning,
      candidates: retrieval.candidates,
      retrievalTime: retrievalTime.durationMs,
      routingTime: routingTime.durationMs,
    };
  }

  // ============================================================================
  // Candidate Retrieval
  // ============================================================================

  /**
   * Retrieve candidate tools based on the user message
   */
  async retrieveCandidates(message: string, maxCandidates: number): Promise<RetrievalResult> {
    const timer = startTimer();

    // Extract keywords from the message
    const extracted = this.keywordExtractor.extract(message);

    // Get the enhanced registry
    const registry = getEnhancedRegistry();

    // Score all enabled services
    const candidates: CandidateTool[] = [];
    const enabledServices = registry.getEnabled();

    for (const service of enabledServices) {
      const score = this.scoreService(service, extracted);
      if (score >= this.config.minScore) {
        candidates.push({
          serviceId: service.id,
          serviceName: service.name,
          serviceDescription: service.description,
          matchScore: score,
          matchType: 'combined',
          priority: service.priority,
          riskLevel: service.riskLevel,
        });
      }
    }

    // Sort by score descending, then by priority
    candidates.sort((a, b) => {
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      return b.priority - a.priority;
    });

    // Limit to max candidates
    const limited = candidates.slice(0, maxCandidates);

    const timing = timer();

    return {
      candidates: limited,
      method: 'keyword', // Will be 'hybrid' when semantic search is added
      queryTime: timing.durationMs,
      totalMatches: candidates.length,
    };
  }

  /**
   * Score a service based on extracted keywords
   */
  private scoreService(
    service: EnhancedServiceEntry,
    extracted: { keywords: string[]; phrases: string[]; intents: string[]; entities: string[] }
  ): number {
    let score = 0;

    // Keyword matching
    for (const keyword of extracted.keywords) {
      const keywordLower = keyword.toLowerCase();

      // Check service keywords
      if (service.keywords?.some((k) => k.toLowerCase().includes(keywordLower))) {
        score += this.config.weights.keyword * 2;
      } else if (service.keywords?.some((k) => keywordLower.includes(k.toLowerCase()))) {
        score += this.config.weights.keyword;
      }

      // Check capabilities
      if (service.capabilities?.some((c) => c.toLowerCase().includes(keywordLower))) {
        score += this.config.weights.capability * 2;
      }

      // Check description
      if (service.description?.toLowerCase().includes(keywordLower)) {
        score += this.config.weights.keyword * 0.5;
      }
    }

    // Phrase matching (more specific = higher score)
    for (const phrase of extracted.phrases) {
      const phraseLower = phrase.toLowerCase();
      if (service.capabilities?.some((c) => c.toLowerCase().includes(phraseLower))) {
        score += this.config.weights.capability * 3;
      }
      if (service.description?.toLowerCase().includes(phraseLower)) {
        score += this.config.weights.keyword;
      }
    }

    // Tag matching
    for (const keyword of extracted.keywords) {
      if (service.tags?.some((t) => t.toLowerCase() === keyword.toLowerCase())) {
        score += this.config.weights.tag * 2;
      }
    }

    // Intent matching (boost services that match detected intents)
    if (extracted.intents.includes('check-in') || extracted.intents.includes('create')) {
      if (
        service.capabilities?.some(
          (c) =>
            c.toLowerCase().includes('check-in') ||
            c.toLowerCase().includes('log') ||
            c.toLowerCase().includes('record')
        )
      ) {
        score += this.config.weights.capability * 2;
      }
    }

    if (extracted.intents.includes('statistics') || extracted.intents.includes('query')) {
      if (
        service.capabilities?.some(
          (c) =>
            c.toLowerCase().includes('stat') ||
            c.toLowerCase().includes('query') ||
            c.toLowerCase().includes('history')
        )
      ) {
        score += this.config.weights.capability * 2;
      }
    }

    // Priority bonus
    score += (service.priority / 100) * this.config.weights.priority;

    return score;
  }

  // ============================================================================
  // LLM Routing
  // ============================================================================

  /**
   * Use LLM to make final routing decision from candidates
   */
  private async llmRoute(
    message: string,
    candidates: CandidateTool[],
    model?: string
  ): Promise<LLMRoutingResponse> {
    // Build prompt with candidates
    const prompt = this.buildRoutingPrompt(message, candidates);

    try {
      const { result, error } = await completeWithJSON<YNFPRoutingResult>(
        [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        {
          temperature: 0.1,
          maxTokens: 256,
          model,
        }
      );

      if (!result || error) {
        logger.warn('Failed to parse routing result', { error });
        return {
          targetService: 'none',
          confidence: 0,
          reasoning: 'Failed to determine routing',
        };
      }

      return {
        targetService: result.targetService,
        confidence: result.confidence,
        reasoning: result.reasoning,
      };
    } catch (error) {
      logger.error('LLM routing error', error);
      return {
        targetService: 'none',
        confidence: 0,
        reasoning: 'Routing failed due to an error',
      };
    }
  }

  /**
   * Build the routing prompt for the LLM
   */
  private buildRoutingPrompt(
    message: string,
    candidates: CandidateTool[]
  ): { system: string; user: string } {
    const candidateDescriptions = candidates
      .map(
        (c, i) =>
          `${i + 1}. ${c.serviceId}: ${c.serviceName}\n   Description: ${c.serviceDescription}\n   Match Score: ${c.matchScore.toFixed(2)}`
      )
      .join('\n\n');

    const system = `You are Yukie, an intelligent assistant router. Your job is to select the best service to handle a user's request from a pre-filtered list of candidates.

The candidates have been pre-selected based on keyword matching. You need to make the final decision.

Available candidate services:
${candidateDescriptions}

Rules:
1. Select the service that best matches the user's intent
2. If no service is a good match, respond with targetService: "none"
3. Provide a confidence score from 0.0 to 1.0
4. Give brief reasoning for your choice

Respond ONLY with valid JSON in this exact format:
{
  "targetService": "<service-id or 'none'>",
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation>"
}`;

    const user = `User request: "${message}"

Select the best service from the candidates. Respond with JSON only.`;

    return { system, user };
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Update router configuration
   */
  updateConfig(config: Partial<RetrievalConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): RetrievalConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let retrievalRouterInstance: RetrievalRouter | null = null;

export function getRetrievalRouter(config?: Partial<RetrievalConfig>): RetrievalRouter {
  if (!retrievalRouterInstance) {
    retrievalRouterInstance = new RetrievalRouter(config);
  }
  return retrievalRouterInstance;
}

export function resetRetrievalRouter(): void {
  retrievalRouterInstance = null;
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * Route a message using retrieval-based routing
 */
export async function routeWithRetrieval(
  message: string,
  auth: AuthContext,
  options?: { model?: string; maxCandidates?: number }
): Promise<RoutingResult> {
  const router = getRetrievalRouter();
  return router.route({
    message,
    auth,
    model: options?.model,
    maxCandidates: options?.maxCandidates,
  });
}
