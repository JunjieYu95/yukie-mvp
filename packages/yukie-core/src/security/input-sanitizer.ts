/**
 * Input Sanitizer
 *
 * Sanitizes tool input parameters to prevent injection attacks
 * and other security vulnerabilities.
 */

import { createLogger } from '../../../shared/observability/src/logger';

const logger = createLogger('input-sanitizer');

// ============================================================================
// Sanitization Types
// ============================================================================

export interface SanitizationResult {
  sanitized: Record<string, unknown>;
  warnings: SanitizationWarning[];
  blocked: SanitizationBlock[];
}

export interface SanitizationWarning {
  param: string;
  issue: string;
  original: unknown;
  sanitized: unknown;
}

export interface SanitizationBlock {
  param: string;
  issue: string;
  pattern?: string;
}

export interface SanitizationOptions {
  allowHtml?: boolean;
  allowScripts?: boolean;
  maxStringLength?: number;
  maxArrayLength?: number;
  maxObjectDepth?: number;
  allowedProtocols?: string[];
  blockedPatterns?: RegExp[];
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<SanitizationOptions> = {
  allowHtml: false,
  allowScripts: false,
  maxStringLength: 10000,
  maxArrayLength: 1000,
  maxObjectDepth: 10,
  allowedProtocols: ['http', 'https', 'mailto'],
  blockedPatterns: [
    // SQL injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b.*\b(FROM|INTO|SET|TABLE)\b)/i,
    // Command injection patterns
    /[;&|`$(){}[\]<>]/,
    // Path traversal
    /\.\.\//,
    /\.\.\\/,
    // Null bytes
    /\x00/,
  ],
};

// ============================================================================
// Input Sanitizer
// ============================================================================

export class InputSanitizer {
  private options: Required<SanitizationOptions>;

  constructor(options?: SanitizationOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ============================================================================
  // Main Sanitization
  // ============================================================================

  /**
   * Sanitize all parameters
   */
  sanitize(params: Record<string, unknown>): SanitizationResult {
    const warnings: SanitizationWarning[] = [];
    const blocked: SanitizationBlock[] = [];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      const result = this.sanitizeValue(key, value, 0);

      if (result.blocked) {
        blocked.push({
          param: key,
          issue: result.reason || 'Blocked content detected',
          pattern: result.pattern,
        });
      } else {
        sanitized[key] = result.value;

        if (result.warning) {
          warnings.push({
            param: key,
            issue: result.warning,
            original: value,
            sanitized: result.value,
          });
        }
      }
    }

    if (blocked.length > 0) {
      logger.warn('Input blocked during sanitization', { blockedParams: blocked.map((b) => b.param) });
    }

    return { sanitized, warnings, blocked };
  }

  // ============================================================================
  // Value Sanitization
  // ============================================================================

  private sanitizeValue(
    key: string,
    value: unknown,
    depth: number
  ): { value: unknown; warning?: string; blocked?: boolean; reason?: string; pattern?: string } {
    // Check depth
    if (depth > this.options.maxObjectDepth) {
      return { value: null, blocked: true, reason: 'Max object depth exceeded' };
    }

    // Handle null/undefined
    if (value === null || value === undefined) {
      return { value };
    }

    // Handle strings
    if (typeof value === 'string') {
      return this.sanitizeString(key, value);
    }

    // Handle numbers
    if (typeof value === 'number') {
      if (!isFinite(value)) {
        return { value: 0, warning: 'Non-finite number replaced with 0' };
      }
      return { value };
    }

    // Handle booleans
    if (typeof value === 'boolean') {
      return { value };
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return this.sanitizeArray(key, value, depth);
    }

    // Handle objects
    if (typeof value === 'object') {
      return this.sanitizeObject(key, value as Record<string, unknown>, depth);
    }

    // Unknown type - convert to string
    return { value: String(value), warning: 'Unknown type converted to string' };
  }

  private sanitizeString(
    key: string,
    value: string
  ): { value: string; warning?: string; blocked?: boolean; reason?: string; pattern?: string } {
    let sanitized = value;
    let warning: string | undefined;

    // Check length
    if (sanitized.length > this.options.maxStringLength) {
      sanitized = sanitized.substring(0, this.options.maxStringLength);
      warning = `String truncated to ${this.options.maxStringLength} characters`;
    }

    // Check for blocked patterns
    for (const pattern of this.options.blockedPatterns) {
      if (pattern.test(sanitized)) {
        return {
          value: sanitized,
          blocked: true,
          reason: 'Potentially dangerous pattern detected',
          pattern: pattern.source,
        };
      }
    }

    // Remove HTML if not allowed
    if (!this.options.allowHtml) {
      const htmlRemoved = this.removeHtml(sanitized);
      if (htmlRemoved !== sanitized) {
        sanitized = htmlRemoved;
        warning = warning ? `${warning}; HTML removed` : 'HTML tags removed';
      }
    }

    // Remove scripts if not allowed
    if (!this.options.allowScripts) {
      const scriptsRemoved = this.removeScripts(sanitized);
      if (scriptsRemoved !== sanitized) {
        sanitized = scriptsRemoved;
        warning = warning ? `${warning}; Scripts removed` : 'Script content removed';
      }
    }

    // Sanitize URLs
    if (this.looksLikeUrl(sanitized)) {
      const urlResult = this.sanitizeUrl(sanitized);
      if (urlResult.blocked) {
        return urlResult;
      }
      if (urlResult.warning) {
        warning = warning ? `${warning}; ${urlResult.warning}` : urlResult.warning;
      }
      sanitized = urlResult.value;
    }

    return { value: sanitized, warning };
  }

  private sanitizeArray(
    key: string,
    value: unknown[],
    depth: number
  ): { value: unknown[]; warning?: string; blocked?: boolean; reason?: string } {
    let warning: string | undefined;

    // Check length
    let array = value;
    if (array.length > this.options.maxArrayLength) {
      array = array.slice(0, this.options.maxArrayLength);
      warning = `Array truncated to ${this.options.maxArrayLength} items`;
    }

    // Sanitize each item
    const sanitized: unknown[] = [];
    for (let i = 0; i < array.length; i++) {
      const result = this.sanitizeValue(`${key}[${i}]`, array[i], depth + 1);
      if (result.blocked) {
        return { value: [], blocked: true, reason: `Blocked item at index ${i}: ${result.reason}` };
      }
      sanitized.push(result.value);
      if (result.warning) {
        warning = warning ? `${warning}; ${result.warning}` : result.warning;
      }
    }

    return { value: sanitized, warning };
  }

  private sanitizeObject(
    key: string,
    value: Record<string, unknown>,
    depth: number
  ): { value: Record<string, unknown>; warning?: string; blocked?: boolean; reason?: string } {
    let warning: string | undefined;
    const sanitized: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(value)) {
      // Sanitize key
      const sanitizedKey = this.sanitizeObjectKey(k);
      if (!sanitizedKey) {
        warning = warning ? `${warning}; Skipped invalid key` : 'Skipped invalid key';
        continue;
      }

      // Sanitize value
      const result = this.sanitizeValue(`${key}.${sanitizedKey}`, v, depth + 1);
      if (result.blocked) {
        return { value: {}, blocked: true, reason: `Blocked value for key ${sanitizedKey}: ${result.reason}` };
      }
      sanitized[sanitizedKey] = result.value;
      if (result.warning) {
        warning = warning ? `${warning}; ${result.warning}` : result.warning;
      }
    }

    return { value: sanitized, warning };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private removeHtml(str: string): string {
    return str.replace(/<[^>]*>/g, '');
  }

  private removeScripts(str: string): string {
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  private looksLikeUrl(str: string): boolean {
    return /^[a-z]+:\/\//i.test(str) || str.includes('://');
  }

  private sanitizeUrl(url: string): { value: string; warning?: string; blocked?: boolean; reason?: string } {
    try {
      const parsed = new URL(url);
      const protocol = parsed.protocol.replace(':', '');

      if (!this.options.allowedProtocols.includes(protocol)) {
        return {
          value: url,
          blocked: true,
          reason: `Disallowed protocol: ${protocol}`,
        };
      }

      return { value: url };
    } catch {
      return { value: url, warning: 'Could not parse URL' };
    }
  }

  private sanitizeObjectKey(key: string): string | null {
    // Remove any non-alphanumeric characters except underscore and hyphen
    const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, '');

    // Key must not be empty
    if (!sanitized) {
      return null;
    }

    // Key must start with a letter or underscore
    if (!/^[a-zA-Z_]/.test(sanitized)) {
      return '_' + sanitized;
    }

    return sanitized;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Update options
   */
  updateOptions(options: Partial<SanitizationOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Add a blocked pattern
   */
  addBlockedPattern(pattern: RegExp): void {
    this.options.blockedPatterns.push(pattern);
  }

  /**
   * Add an allowed protocol
   */
  addAllowedProtocol(protocol: string): void {
    if (!this.options.allowedProtocols.includes(protocol)) {
      this.options.allowedProtocols.push(protocol);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let inputSanitizerInstance: InputSanitizer | null = null;

export function getInputSanitizer(options?: SanitizationOptions): InputSanitizer {
  if (!inputSanitizerInstance) {
    inputSanitizerInstance = new InputSanitizer(options);
  }
  return inputSanitizerInstance;
}

export function resetInputSanitizer(): void {
  inputSanitizerInstance = null;
}
