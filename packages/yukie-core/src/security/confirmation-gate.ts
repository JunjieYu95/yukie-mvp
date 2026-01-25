/**
 * Confirmation Gate
 *
 * Requires explicit user confirmation for high-risk operations.
 * Provides a mechanism to pause execution until confirmation is received.
 */

import { createLogger } from '../../../shared/observability/src/logger';
import type { ToolCall } from '../planner/types';
import type { RiskAssessment } from './risk-classifier';

const logger = createLogger('confirmation-gate');

// ============================================================================
// Confirmation Types
// ============================================================================

export interface ConfirmationRequest {
  id: string;
  planId: string;
  toolCall: ToolCall;
  riskAssessment: RiskAssessment;
  message: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'confirmed' | 'denied' | 'expired';
}

export interface ConfirmationResponse {
  requestId: string;
  confirmed: boolean;
  reason?: string;
  respondedAt: number;
}

export type ConfirmationCallback = (request: ConfirmationRequest) => Promise<boolean>;

// ============================================================================
// Confirmation Gate
// ============================================================================

export class ConfirmationGate {
  private pendingConfirmations: Map<string, ConfirmationRequest> = new Map();
  private confirmationHistory: ConfirmationRequest[] = [];
  private defaultTimeout: number = 300000; // 5 minutes
  private maxHistorySize: number = 1000;

  // Callback for handling confirmation requests (e.g., send to user)
  private confirmationCallback?: ConfirmationCallback;

  constructor() {}

  // ============================================================================
  // Confirmation Request
  // ============================================================================

  /**
   * Create a confirmation request for a tool call
   */
  createRequest(
    planId: string,
    toolCall: ToolCall,
    riskAssessment: RiskAssessment
  ): ConfirmationRequest {
    const now = Date.now();
    const requestId = `confirm_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const message = this.buildConfirmationMessage(toolCall, riskAssessment);

    const request: ConfirmationRequest = {
      id: requestId,
      planId,
      toolCall,
      riskAssessment,
      message,
      createdAt: now,
      expiresAt: now + this.defaultTimeout,
      status: 'pending',
    };

    this.pendingConfirmations.set(requestId, request);

    logger.info('Confirmation request created', {
      requestId,
      planId,
      toolCallId: toolCall.id,
      riskLevel: riskAssessment.level,
    });

    return request;
  }

  /**
   * Request confirmation and wait for response
   */
  async requestConfirmation(
    planId: string,
    toolCall: ToolCall,
    riskAssessment: RiskAssessment
  ): Promise<boolean> {
    const request = this.createRequest(planId, toolCall, riskAssessment);

    // If callback is set, use it
    if (this.confirmationCallback) {
      try {
        const confirmed = await this.confirmationCallback(request);
        this.respond(request.id, confirmed);
        return confirmed;
      } catch (error) {
        logger.error('Confirmation callback error', error, { requestId: request.id });
        this.respond(request.id, false, 'Callback error');
        return false;
      }
    }

    // Otherwise, auto-deny (no callback configured)
    logger.warn('No confirmation callback configured, auto-denying', { requestId: request.id });
    this.respond(request.id, false, 'No confirmation mechanism configured');
    return false;
  }

  /**
   * Respond to a confirmation request
   */
  respond(requestId: string, confirmed: boolean, reason?: string): ConfirmationResponse {
    const request = this.pendingConfirmations.get(requestId);

    if (!request) {
      logger.warn('Confirmation request not found', { requestId });
      return {
        requestId,
        confirmed: false,
        reason: 'Request not found',
        respondedAt: Date.now(),
      };
    }

    // Check if expired
    if (Date.now() > request.expiresAt) {
      request.status = 'expired';
      this.moveToHistory(request);

      return {
        requestId,
        confirmed: false,
        reason: 'Request expired',
        respondedAt: Date.now(),
      };
    }

    // Update request status
    request.status = confirmed ? 'confirmed' : 'denied';
    this.moveToHistory(request);

    logger.info('Confirmation response received', {
      requestId,
      confirmed,
      reason,
    });

    return {
      requestId,
      confirmed,
      reason,
      respondedAt: Date.now(),
    };
  }

  // ============================================================================
  // Request Management
  // ============================================================================

  /**
   * Get a pending confirmation request
   */
  getRequest(requestId: string): ConfirmationRequest | null {
    return this.pendingConfirmations.get(requestId) || null;
  }

  /**
   * Get all pending confirmations for a plan
   */
  getPendingForPlan(planId: string): ConfirmationRequest[] {
    return Array.from(this.pendingConfirmations.values()).filter(
      (r) => r.planId === planId && r.status === 'pending'
    );
  }

  /**
   * Cancel all pending confirmations for a plan
   */
  cancelPlan(planId: string): number {
    let cancelled = 0;
    for (const [id, request] of this.pendingConfirmations) {
      if (request.planId === planId) {
        request.status = 'denied';
        this.moveToHistory(request);
        cancelled++;
      }
    }
    logger.info('Plan confirmations cancelled', { planId, count: cancelled });
    return cancelled;
  }

  /**
   * Clean up expired requests
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, request] of this.pendingConfirmations) {
      if (now > request.expiresAt) {
        request.status = 'expired';
        this.moveToHistory(request);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Expired confirmations cleaned up', { count: cleaned });
    }

    return cleaned;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Set the confirmation callback
   */
  setConfirmationCallback(callback: ConfirmationCallback): void {
    this.confirmationCallback = callback;
  }

  /**
   * Set the default timeout for confirmation requests
   */
  setTimeout(timeoutMs: number): void {
    this.defaultTimeout = timeoutMs;
  }

  // ============================================================================
  // History
  // ============================================================================

  /**
   * Get confirmation history
   */
  getHistory(limit?: number): ConfirmationRequest[] {
    const history = [...this.confirmationHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Get history for a specific user (by checking tool call context)
   */
  getHistoryForPlan(planId: string): ConfirmationRequest[] {
    return this.confirmationHistory.filter((r) => r.planId === planId);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private buildConfirmationMessage(toolCall: ToolCall, assessment: RiskAssessment): string {
    const parts = [
      `⚠️ Confirmation Required (${assessment.level.toUpperCase()} RISK)`,
      '',
      `Action: ${toolCall.toolName}`,
      `Service: ${toolCall.serviceId}`,
      '',
      'Risk Factors:',
      ...assessment.reasons.map((r) => `  • ${r}`),
      '',
      'Do you want to proceed with this action?',
    ];

    return parts.join('\n');
  }

  private moveToHistory(request: ConfirmationRequest): void {
    this.pendingConfirmations.delete(request.id);
    this.confirmationHistory.push(request);

    // Trim history if too large
    if (this.confirmationHistory.length > this.maxHistorySize) {
      this.confirmationHistory = this.confirmationHistory.slice(-this.maxHistorySize);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let confirmationGateInstance: ConfirmationGate | null = null;

export function getConfirmationGate(): ConfirmationGate {
  if (!confirmationGateInstance) {
    confirmationGateInstance = new ConfirmationGate();
  }
  return confirmationGateInstance;
}

export function resetConfirmationGate(): void {
  confirmationGateInstance = null;
}
