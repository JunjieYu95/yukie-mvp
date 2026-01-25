/**
 * Keyword Extractor
 *
 * Extracts keywords, phrases, and intents from user messages
 * for retrieval-based routing.
 */

import { createLogger } from '../../../shared/observability/src/logger';
import type { ExtractedKeywords, KeywordExtractionOptions } from './types';

const logger = createLogger('keyword-extractor');

// ============================================================================
// Stop Words
// ============================================================================

const STOP_WORDS = new Set([
  // Common English stop words
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
  'theirs', 'themselves', 'please', 'thanks', 'thank', 'hi', 'hello', 'hey',
  'okay', 'ok', 'yes', 'no', 'yeah', 'yep', 'nope', 'sure', 'want', 'need',
  'like', 'get', 'got', 'let', 'make', 'made', 'take', 'took', 'give', 'gave',
]);

// ============================================================================
// Intent Patterns
// ============================================================================

interface IntentPattern {
  intent: string;
  patterns: RegExp[];
  keywords: string[];
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'query',
    patterns: [
      /^(what|how|when|where|why|who|which|show|list|get|find|search|tell|display)/i,
      /\?$/,
    ],
    keywords: ['what', 'how', 'show', 'list', 'get', 'find', 'search', 'display'],
  },
  {
    intent: 'create',
    patterns: [
      /^(create|add|new|make|start|begin|set up|setup|record|log)/i,
    ],
    keywords: ['create', 'add', 'new', 'make', 'start', 'record', 'log'],
  },
  {
    intent: 'update',
    patterns: [
      /^(update|change|modify|edit|fix|correct|adjust)/i,
    ],
    keywords: ['update', 'change', 'modify', 'edit', 'fix', 'adjust'],
  },
  {
    intent: 'delete',
    patterns: [
      /^(delete|remove|cancel|clear|reset|undo)/i,
    ],
    keywords: ['delete', 'remove', 'cancel', 'clear', 'reset'],
  },
  {
    intent: 'check-in',
    patterns: [
      /check[- ]?in/i,
      /log(ged)?/i,
      /did (i|my)/i,
      /i (did|woke|exercised|read|meditated)/i,
    ],
    keywords: ['checkin', 'check-in', 'log', 'logged', 'completed', 'done', 'finished'],
  },
  {
    intent: 'statistics',
    patterns: [
      /stat(s|istics)?/i,
      /streak/i,
      /progress/i,
      /summary/i,
      /report/i,
      /how (many|much|often)/i,
    ],
    keywords: ['stats', 'statistics', 'streak', 'progress', 'summary', 'report', 'count'],
  },
  {
    intent: 'schedule',
    patterns: [
      /schedul/i,
      /meeting/i,
      /event/i,
      /appointment/i,
      /calendar/i,
      /remind/i,
    ],
    keywords: ['schedule', 'meeting', 'event', 'appointment', 'calendar', 'reminder'],
  },
];

// ============================================================================
// Entity Patterns
// ============================================================================

interface EntityPattern {
  type: string;
  pattern: RegExp;
  normalize?: (match: string) => string;
}

const ENTITY_PATTERNS: EntityPattern[] = [
  {
    type: 'date',
    pattern: /\b(today|tomorrow|yesterday|this week|last week|this month|last month)\b/i,
    normalize: (match) => match.toLowerCase(),
  },
  {
    type: 'date',
    pattern: /\b(\d{4}-\d{2}-\d{2})\b/,
  },
  {
    type: 'time',
    pattern: /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i,
    normalize: (match) => match.toLowerCase(),
  },
  {
    type: 'duration',
    pattern: /\b(\d+\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?))\b/i,
    normalize: (match) => match.toLowerCase(),
  },
  {
    type: 'habit',
    pattern: /\b(wake\s*up|wakeup|exercise|workout|reading|read|meditat(?:e|ion)|yoga|running|jogging)\b/i,
    normalize: (match) => match.toLowerCase().replace(/\s+/g, '-'),
  },
];

// ============================================================================
// Keyword Extractor
// ============================================================================

export class KeywordExtractor {
  private stopWords: Set<string>;
  private intentPatterns: IntentPattern[];
  private entityPatterns: EntityPattern[];

  constructor() {
    this.stopWords = STOP_WORDS;
    this.intentPatterns = INTENT_PATTERNS;
    this.entityPatterns = ENTITY_PATTERNS;
  }

  /**
   * Extract keywords, phrases, intents, and entities from a message
   */
  extract(message: string, options?: KeywordExtractionOptions): ExtractedKeywords {
    const opts = {
      maxKeywords: options?.maxKeywords || 20,
      includeNgrams: options?.includeNgrams !== false,
      detectIntents: options?.detectIntents !== false,
      detectEntities: options?.detectEntities !== false,
    };

    // Normalize the message
    const normalized = this.normalizeText(message);

    // Extract single keywords
    const keywords = this.extractKeywords(normalized, opts.maxKeywords);

    // Extract phrases (n-grams)
    const phrases = opts.includeNgrams ? this.extractPhrases(normalized) : [];

    // Detect intents
    const intents = opts.detectIntents ? this.detectIntents(message) : [];

    // Extract entities
    const entities = opts.detectEntities ? this.extractEntities(message) : [];

    logger.debug('Keywords extracted', {
      keywordCount: keywords.length,
      phraseCount: phrases.length,
      intentCount: intents.length,
      entityCount: entities.length,
    });

    return {
      keywords,
      phrases,
      intents,
      entities,
    };
  }

  /**
   * Extract single keywords from normalized text
   */
  private extractKeywords(text: string, maxKeywords: number): string[] {
    const words = text.split(/\s+/);
    const keywords: string[] = [];
    const seen = new Set<string>();

    for (const word of words) {
      if (word.length < 2) continue;
      if (this.stopWords.has(word)) continue;
      if (seen.has(word)) continue;

      seen.add(word);
      keywords.push(word);

      if (keywords.length >= maxKeywords) break;
    }

    return keywords;
  }

  /**
   * Extract phrases (bigrams and trigrams)
   */
  private extractPhrases(text: string): string[] {
    const words = text.split(/\s+/).filter((w) => w.length >= 2);
    const phrases: string[] = [];
    const seen = new Set<string>();

    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      // Only include if at least one word is not a stop word
      if (!this.stopWords.has(words[i]) || !this.stopWords.has(words[i + 1])) {
        if (!seen.has(bigram)) {
          seen.add(bigram);
          phrases.push(bigram);
        }
      }
    }

    // Trigrams
    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      // Only include if at least two words are not stop words
      const nonStopCount = [words[i], words[i + 1], words[i + 2]].filter(
        (w) => !this.stopWords.has(w)
      ).length;
      if (nonStopCount >= 2) {
        if (!seen.has(trigram)) {
          seen.add(trigram);
          phrases.push(trigram);
        }
      }
    }

    return phrases;
  }

  /**
   * Detect intents from the message
   */
  private detectIntents(message: string): string[] {
    const intents: string[] = [];

    for (const intentPattern of this.intentPatterns) {
      // Check patterns
      for (const pattern of intentPattern.patterns) {
        if (pattern.test(message)) {
          if (!intents.includes(intentPattern.intent)) {
            intents.push(intentPattern.intent);
          }
          break;
        }
      }

      // Check keywords
      const messageLower = message.toLowerCase();
      for (const keyword of intentPattern.keywords) {
        if (messageLower.includes(keyword)) {
          if (!intents.includes(intentPattern.intent)) {
            intents.push(intentPattern.intent);
          }
          break;
        }
      }
    }

    return intents;
  }

  /**
   * Extract entities from the message
   */
  private extractEntities(message: string): string[] {
    const entities: string[] = [];

    for (const entityPattern of this.entityPatterns) {
      const matches = message.match(new RegExp(entityPattern.pattern, 'gi'));
      if (matches) {
        for (const match of matches) {
          const normalized = entityPattern.normalize ? entityPattern.normalize(match) : match;
          if (!entities.includes(normalized)) {
            entities.push(normalized);
          }
        }
      }
    }

    return entities;
  }

  /**
   * Normalize text for keyword extraction
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"')
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get intent keywords for a given intent
   */
  getIntentKeywords(intent: string): string[] {
    const pattern = this.intentPatterns.find((p) => p.intent === intent);
    return pattern?.keywords || [];
  }

  /**
   * Check if a message likely matches an intent
   */
  hasIntent(message: string, intent: string): boolean {
    const detected = this.detectIntents(message);
    return detected.includes(intent);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let keywordExtractorInstance: KeywordExtractor | null = null;

export function getKeywordExtractor(): KeywordExtractor {
  if (!keywordExtractorInstance) {
    keywordExtractorInstance = new KeywordExtractor();
  }
  return keywordExtractorInstance;
}

export function resetKeywordExtractor(): void {
  keywordExtractorInstance = null;
}
