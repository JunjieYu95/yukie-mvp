/**
 * Capability Index
 *
 * Fast capability lookup using inverted indexes.
 * Supports keyword, tag, and capability-based retrieval.
 */

import { createLogger } from '../../../shared/observability/src/logger';
import type { ServiceDefinition, CapabilityMatch, ToolSchema } from './types';

const logger = createLogger('capability-index');

// ============================================================================
// Capability Index
// ============================================================================

export class CapabilityIndex {
  // Inverted indexes: term -> Set<serviceId>
  private keywordIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private capabilityIndex: Map<string, Set<string>> = new Map();
  private toolNameIndex: Map<string, Set<string>> = new Map();

  // Service metadata for quick access
  private serviceInfo: Map<string, { name: string; priority: number }> = new Map();

  // Stop words to filter out
  private readonly stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
    'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if',
    'or', 'because', 'until', 'while', 'although', 'both', 'either', 'neither',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'i',
    'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your',
    'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she',
    'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their',
    'theirs', 'themselves',
  ]);

  constructor() {}

  // ============================================================================
  // Index Building
  // ============================================================================

  /**
   * Add a service to the index
   */
  addService(service: ServiceDefinition): void {
    const serviceId = service.id;

    // Store service info
    this.serviceInfo.set(serviceId, {
      name: service.name,
      priority: service.priority,
    });

    // Index keywords
    for (const keyword of service.keywords || []) {
      this.addToIndex(this.keywordIndex, keyword, serviceId);
    }

    // Index tags
    for (const tag of service.tags || []) {
      this.addToIndex(this.tagIndex, tag, serviceId);
    }

    // Index capabilities
    for (const capability of service.capabilities || []) {
      this.addToIndex(this.capabilityIndex, capability, serviceId);
      // Also index individual words from the capability
      const words = this.tokenize(capability);
      for (const word of words) {
        this.addToIndex(this.capabilityIndex, word, serviceId);
      }
    }

    // Index service description
    const descWords = this.tokenize(service.description);
    for (const word of descWords) {
      this.addToIndex(this.keywordIndex, word, serviceId);
    }

    logger.debug('Service added to index', { serviceId, name: service.name });
  }

  /**
   * Add tool schemas to the index
   */
  addTools(serviceId: string, tools: ToolSchema[]): void {
    for (const tool of tools) {
      // Index tool name
      this.addToIndex(this.toolNameIndex, tool.name, serviceId);

      // Index tool description words
      const descWords = this.tokenize(tool.description);
      for (const word of descWords) {
        this.addToIndex(this.keywordIndex, word, serviceId);
      }
    }

    logger.debug('Tools added to index', { serviceId, toolCount: tools.length });
  }

  /**
   * Remove a service from the index
   */
  removeService(serviceId: string): void {
    this.removeFromAllIndexes(serviceId);
    this.serviceInfo.delete(serviceId);
    logger.debug('Service removed from index', { serviceId });
  }

  /**
   * Clear all indexes
   */
  clear(): void {
    this.keywordIndex.clear();
    this.tagIndex.clear();
    this.capabilityIndex.clear();
    this.toolNameIndex.clear();
    this.serviceInfo.clear();
  }

  // ============================================================================
  // Search
  // ============================================================================

  /**
   * Search for services matching a query string
   */
  search(query: string, limit: number = 10): CapabilityMatch[] {
    const tokens = this.tokenize(query);
    const scores = new Map<string, number>();
    const matches: CapabilityMatch[] = [];

    for (const token of tokens) {
      // Search keyword index (weight: 1)
      this.searchIndex(this.keywordIndex, token, scores, 1);

      // Search tag index (weight: 2)
      this.searchIndex(this.tagIndex, token, scores, 2);

      // Search capability index (weight: 3)
      this.searchIndex(this.capabilityIndex, token, scores, 3);

      // Search tool name index (weight: 4)
      this.searchIndex(this.toolNameIndex, token, scores, 4);
    }

    // Convert scores to matches
    const sortedMatches = Array.from(scores.entries())
      .sort((a, b) => {
        // Sort by score descending, then by priority descending
        if (b[1] !== a[1]) return b[1] - a[1];
        const priorityA = this.serviceInfo.get(a[0])?.priority || 0;
        const priorityB = this.serviceInfo.get(b[0])?.priority || 0;
        return priorityB - priorityA;
      })
      .slice(0, limit);

    for (const [serviceId, score] of sortedMatches) {
      const info = this.serviceInfo.get(serviceId);
      matches.push({
        serviceId,
        serviceName: info?.name || serviceId,
        matchType: 'keyword', // Generic for combined search
        score,
      });
    }

    return matches;
  }

  /**
   * Search a specific index
   */
  private searchIndex(
    index: Map<string, Set<string>>,
    token: string,
    scores: Map<string, number>,
    weight: number
  ): void {
    // Exact match
    const exactMatches = index.get(token);
    if (exactMatches) {
      for (const serviceId of exactMatches) {
        scores.set(serviceId, (scores.get(serviceId) || 0) + weight * 2);
      }
    }

    // Prefix match
    for (const [key, serviceIds] of index) {
      if (key.startsWith(token) || token.startsWith(key)) {
        for (const serviceId of serviceIds) {
          scores.set(serviceId, (scores.get(serviceId) || 0) + weight);
        }
      }
    }
  }

  /**
   * Get services matching specific keywords
   */
  getByKeywords(keywords: string[]): Set<string> {
    const result = new Set<string>();
    for (const keyword of keywords) {
      const normalized = this.normalize(keyword);
      const matches = this.keywordIndex.get(normalized);
      if (matches) {
        for (const serviceId of matches) {
          result.add(serviceId);
        }
      }
    }
    return result;
  }

  /**
   * Get services matching specific tags
   */
  getByTags(tags: string[]): Set<string> {
    const result = new Set<string>();
    for (const tag of tags) {
      const normalized = this.normalize(tag);
      const matches = this.tagIndex.get(normalized);
      if (matches) {
        for (const serviceId of matches) {
          result.add(serviceId);
        }
      }
    }
    return result;
  }

  /**
   * Get services matching specific capabilities
   */
  getByCapabilities(capabilities: string[]): Set<string> {
    const result = new Set<string>();
    for (const capability of capabilities) {
      const normalized = this.normalize(capability);
      const matches = this.capabilityIndex.get(normalized);
      if (matches) {
        for (const serviceId of matches) {
          result.add(serviceId);
        }
      }
    }
    return result;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get index statistics
   */
  getStats(): {
    keywordCount: number;
    tagCount: number;
    capabilityCount: number;
    toolNameCount: number;
    serviceCount: number;
  } {
    return {
      keywordCount: this.keywordIndex.size,
      tagCount: this.tagIndex.size,
      capabilityCount: this.capabilityIndex.size,
      toolNameCount: this.toolNameIndex.size,
      serviceCount: this.serviceInfo.size,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private addToIndex(index: Map<string, Set<string>>, term: string, serviceId: string): void {
    const normalized = this.normalize(term);
    if (!normalized || normalized.length < 2) return;

    if (!index.has(normalized)) {
      index.set(normalized, new Set());
    }
    index.get(normalized)!.add(serviceId);
  }

  private removeFromAllIndexes(serviceId: string): void {
    for (const index of [this.keywordIndex, this.tagIndex, this.capabilityIndex, this.toolNameIndex]) {
      for (const [, serviceIds] of index) {
        serviceIds.delete(serviceId);
      }
    }
  }

  private normalize(term: string): string {
    return term
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '');
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2 && !this.stopWords.has(w));
  }
}

// ============================================================================
// Singleton
// ============================================================================

let capabilityIndexInstance: CapabilityIndex | null = null;

export function getCapabilityIndex(): CapabilityIndex {
  if (!capabilityIndexInstance) {
    capabilityIndexInstance = new CapabilityIndex();
  }
  return capabilityIndexInstance;
}

export function resetCapabilityIndex(): void {
  capabilityIndexInstance = null;
}
