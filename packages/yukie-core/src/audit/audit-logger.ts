/**
 * Audit Logger
 *
 * Comprehensive audit logging for tool invocations and security events.
 * Provides structured logging, query capabilities, and retention management.
 */

import { createLogger } from '../../../shared/observability/src/logger';
import type { AuthContext } from '../../../shared/protocol/src/types';
import type { ToolCall, ToolCallResult, Plan } from '../planner/types';
import type { RiskAssessment } from '../security/risk-classifier';

const logger = createLogger('audit-logger');

// ============================================================================
// Audit Types
// ============================================================================

export type AuditEventType =
  | 'tool_invocation'
  | 'tool_completion'
  | 'tool_failure'
  | 'plan_created'
  | 'plan_executed'
  | 'confirmation_requested'
  | 'confirmation_granted'
  | 'confirmation_denied'
  | 'security_warning'
  | 'security_block'
  | 'auth_success'
  | 'auth_failure';

export interface AuditEntry {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  userId: string;
  requestId?: string;
  planId?: string;
  toolCallId?: string;
  serviceId?: string;
  toolName?: string;
  riskLevel?: string;
  success?: boolean;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AuditQuery {
  userId?: string;
  eventTypes?: AuditEventType[];
  serviceId?: string;
  riskLevel?: string;
  success?: boolean;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalEntries: number;
  entriesByType: Record<AuditEventType, number>;
  entriesByService: Record<string, number>;
  successRate: number;
  securityEvents: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}

// ============================================================================
// Audit Logger
// ============================================================================

export class AuditLogger {
  private entries: AuditEntry[] = [];
  private maxEntries: number = 10000;
  private retentionDays: number = 30;

  constructor() {}

  // ============================================================================
  // Logging Methods
  // ============================================================================

  /**
   * Log a tool invocation
   */
  logToolInvocation(
    auth: AuthContext,
    call: ToolCall,
    plan?: Plan,
    riskAssessment?: RiskAssessment
  ): string {
    return this.log({
      eventType: 'tool_invocation',
      userId: auth.userId,
      requestId: auth.requestId,
      planId: plan?.id,
      toolCallId: call.id,
      serviceId: call.serviceId,
      toolName: call.toolName,
      riskLevel: riskAssessment?.level || call.riskLevel,
      details: {
        params: this.redactSensitive(call.params),
        requiresConfirmation: riskAssessment?.requiresConfirmation,
      },
    });
  }

  /**
   * Log a tool completion
   */
  logToolCompletion(auth: AuthContext, result: ToolCallResult): string {
    return this.log({
      eventType: result.success ? 'tool_completion' : 'tool_failure',
      userId: auth.userId,
      requestId: auth.requestId,
      toolCallId: result.id,
      serviceId: result.serviceId,
      toolName: result.toolName,
      success: result.success,
      details: {
        durationMs: result.durationMs,
        error: result.error,
      },
    });
  }

  /**
   * Log a plan creation
   */
  logPlanCreated(auth: AuthContext, plan: Plan): string {
    return this.log({
      eventType: 'plan_created',
      userId: auth.userId,
      requestId: auth.requestId,
      planId: plan.id,
      details: {
        toolCallCount: plan.toolCalls.length,
        executionMode: plan.executionMode,
        confidence: plan.confidence,
        reasoning: plan.reasoning,
      },
    });
  }

  /**
   * Log a plan execution
   */
  logPlanExecuted(
    auth: AuthContext,
    planId: string,
    success: boolean,
    details?: Record<string, unknown>
  ): string {
    return this.log({
      eventType: 'plan_executed',
      userId: auth.userId,
      requestId: auth.requestId,
      planId,
      success,
      details,
    });
  }

  /**
   * Log a confirmation request
   */
  logConfirmationRequested(
    auth: AuthContext,
    call: ToolCall,
    riskAssessment: RiskAssessment
  ): string {
    return this.log({
      eventType: 'confirmation_requested',
      userId: auth.userId,
      requestId: auth.requestId,
      toolCallId: call.id,
      serviceId: call.serviceId,
      toolName: call.toolName,
      riskLevel: riskAssessment.level,
      details: {
        reasons: riskAssessment.reasons,
      },
    });
  }

  /**
   * Log a confirmation response
   */
  logConfirmationResponse(
    auth: AuthContext,
    toolCallId: string,
    granted: boolean,
    reason?: string
  ): string {
    return this.log({
      eventType: granted ? 'confirmation_granted' : 'confirmation_denied',
      userId: auth.userId,
      requestId: auth.requestId,
      toolCallId,
      success: granted,
      details: { reason },
    });
  }

  /**
   * Log a security warning
   */
  logSecurityWarning(
    auth: AuthContext,
    message: string,
    details?: Record<string, unknown>
  ): string {
    return this.log({
      eventType: 'security_warning',
      userId: auth.userId,
      requestId: auth.requestId,
      details: { message, ...details },
    });
  }

  /**
   * Log a security block
   */
  logSecurityBlock(
    auth: AuthContext,
    message: string,
    details?: Record<string, unknown>
  ): string {
    return this.log({
      eventType: 'security_block',
      userId: auth.userId,
      requestId: auth.requestId,
      success: false,
      details: { message, ...details },
    });
  }

  /**
   * Log authentication events
   */
  logAuthEvent(userId: string, success: boolean, details?: Record<string, unknown>): string {
    return this.log({
      eventType: success ? 'auth_success' : 'auth_failure',
      userId,
      success,
      details,
    });
  }

  // ============================================================================
  // Core Logging
  // ============================================================================

  private log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): string {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const fullEntry: AuditEntry = {
      ...entry,
      id,
      timestamp: Date.now(),
    };

    this.entries.push(fullEntry);

    // Log to standard logger as well
    logger.info(`Audit: ${entry.eventType}`, {
      auditId: id,
      userId: entry.userId,
      eventType: entry.eventType,
      success: entry.success,
    });

    // Trim old entries
    this.trimEntries();

    return id;
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Query audit entries
   */
  query(query: AuditQuery): AuditEntry[] {
    let results = [...this.entries];

    // Filter by userId
    if (query.userId) {
      results = results.filter((e) => e.userId === query.userId);
    }

    // Filter by event types
    if (query.eventTypes && query.eventTypes.length > 0) {
      results = results.filter((e) => query.eventTypes!.includes(e.eventType));
    }

    // Filter by serviceId
    if (query.serviceId) {
      results = results.filter((e) => e.serviceId === query.serviceId);
    }

    // Filter by risk level
    if (query.riskLevel) {
      results = results.filter((e) => e.riskLevel === query.riskLevel);
    }

    // Filter by success
    if (query.success !== undefined) {
      results = results.filter((e) => e.success === query.success);
    }

    // Filter by time range
    if (query.startTime) {
      results = results.filter((e) => e.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      results = results.filter((e) => e.timestamp <= query.endTime!);
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    if (query.offset) {
      results = results.slice(query.offset);
    }
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Get audit entry by ID
   */
  getById(id: string): AuditEntry | null {
    return this.entries.find((e) => e.id === id) || null;
  }

  /**
   * Get entries for a specific plan
   */
  getByPlanId(planId: string): AuditEntry[] {
    return this.entries
      .filter((e) => e.planId === planId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get entries for a specific tool call
   */
  getByToolCallId(toolCallId: string): AuditEntry[] {
    return this.entries
      .filter((e) => e.toolCallId === toolCallId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get audit statistics
   */
  getStats(): AuditStats {
    const entriesByType: Record<string, number> = {};
    const entriesByService: Record<string, number> = {};
    let successCount = 0;
    let totalWithSuccess = 0;
    let securityEvents = 0;

    for (const entry of this.entries) {
      // Count by type
      entriesByType[entry.eventType] = (entriesByType[entry.eventType] || 0) + 1;

      // Count by service
      if (entry.serviceId) {
        entriesByService[entry.serviceId] = (entriesByService[entry.serviceId] || 0) + 1;
      }

      // Count success rate
      if (entry.success !== undefined) {
        totalWithSuccess++;
        if (entry.success) successCount++;
      }

      // Count security events
      if (
        entry.eventType === 'security_warning' ||
        entry.eventType === 'security_block' ||
        entry.eventType === 'confirmation_requested'
      ) {
        securityEvents++;
      }
    }

    return {
      totalEntries: this.entries.length,
      entriesByType: entriesByType as Record<AuditEventType, number>,
      entriesByService,
      successRate: totalWithSuccess > 0 ? successCount / totalWithSuccess : 1,
      securityEvents,
      oldestEntry: this.entries.length > 0 ? this.entries[0].timestamp : null,
      newestEntry: this.entries.length > 0 ? this.entries[this.entries.length - 1].timestamp : null,
    };
  }

  // ============================================================================
  // Maintenance
  // ============================================================================

  /**
   * Trim old entries
   */
  private trimEntries(): void {
    // Remove entries beyond max count
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Remove entries beyond retention period
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    this.entries = this.entries.filter((e) => e.timestamp >= cutoff);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
    logger.info('Audit log cleared');
  }

  /**
   * Export entries
   */
  export(): AuditEntry[] {
    return [...this.entries];
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Set maximum entries
   */
  setMaxEntries(max: number): void {
    this.maxEntries = max;
    this.trimEntries();
  }

  /**
   * Set retention days
   */
  setRetentionDays(days: number): void {
    this.retentionDays = days;
    this.trimEntries();
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Redact sensitive fields from params
   */
  private redactSensitive(params: Record<string, unknown>): Record<string, unknown> {
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential', 'auth'];
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      const isFieldSensitive = sensitiveFields.some((f) => key.toLowerCase().includes(f));
      if (isFieldSensitive && typeof value === 'string') {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        redacted[key] = this.redactSensitive(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let auditLoggerInstance: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger();
  }
  return auditLoggerInstance;
}

export function resetAuditLogger(): void {
  auditLoggerInstance = null;
}
