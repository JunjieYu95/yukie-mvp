/**
 * Plan Executor
 *
 * Executes multi-tool plans with support for parallel and sequential execution.
 * Includes validation, security checks, and working state management.
 */

import { createLogger, startTimer } from '../../../shared/observability/src/logger';
import type { AuthContext, YWAIPInvokeRequest, YWAIPInvokeResponse } from '../../../shared/protocol/src/types';
import { getEnhancedRegistry } from '../enhanced-registry';
import type {
  Plan,
  ToolCall,
  ToolCallResult,
  WorkingState,
  ExecutionOptions,
  ExecutionResult,
} from '../planner/types';

const logger = createLogger('executor');

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_OPTIONS: ExecutionOptions = {
  maxParallel: 5,
  timeout: 30000,
  retryFailedCalls: false,
  maxRetries: 2,
  requireConfirmation: false,
};

// ============================================================================
// Executor
// ============================================================================

export class Executor {
  private options: ExecutionOptions;

  constructor(options?: Partial<ExecutionOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ============================================================================
  // Plan Execution
  // ============================================================================

  /**
   * Execute a plan
   */
  async execute(plan: Plan, auth: AuthContext, options?: Partial<ExecutionOptions>): Promise<ExecutionResult> {
    const opts = { ...this.options, ...options };
    const totalTimer = startTimer();

    // Initialize working state
    const workingState = this.initializeWorkingState(plan);

    const results: ToolCallResult[] = [];

    try {
      // Execute based on execution mode
      if (plan.executionMode === 'single' && plan.toolCalls.length === 1) {
        // Single tool execution
        const result = await this.executeToolCall(plan.toolCalls[0], auth, opts);
        results.push(result);
        this.updateWorkingState(workingState, result);
      } else if (plan.executionOrder && plan.executionOrder.length > 0) {
        // Execute in order (supports both parallel groups and sequential execution)
        for (const group of plan.executionOrder) {
          const groupCalls = plan.toolCalls.filter((c) => group.includes(c.id));

          if (groupCalls.length === 1) {
            // Sequential execution for single call
            const result = await this.executeToolCall(groupCalls[0], auth, opts, workingState.results);
            results.push(result);
            this.updateWorkingState(workingState, result);
          } else if (groupCalls.length > 1) {
            // Parallel execution for multiple calls
            const groupResults = await this.executeParallel(groupCalls, auth, opts, workingState.results);
            results.push(...groupResults);
            for (const result of groupResults) {
              this.updateWorkingState(workingState, result);
            }
          }

          workingState.currentStep++;
        }
      } else {
        // Fallback: execute all in parallel
        const allResults = await this.executeParallel(plan.toolCalls, auth, opts);
        results.push(...allResults);
        for (const result of allResults) {
          this.updateWorkingState(workingState, result);
        }
      }

      const timing = totalTimer();

      const success = results.every((r) => r.success);
      const completedCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      logger.info('Plan execution complete', {
        planId: plan.id,
        success,
        completedCalls: completedCount,
        failedCalls: failedCount,
        totalDurationMs: timing.durationMs,
      });

      return {
        planId: plan.id,
        success,
        results,
        totalDurationMs: timing.durationMs,
        completedCalls: completedCount,
        failedCalls: failedCount,
        workingState,
      };
    } catch (error) {
      const timing = totalTimer();
      logger.error('Plan execution error', error, { planId: plan.id });

      return {
        planId: plan.id,
        success: false,
        results,
        totalDurationMs: timing.durationMs,
        completedCalls: results.filter((r) => r.success).length,
        failedCalls: results.filter((r) => !r.success).length + (plan.toolCalls.length - results.length),
        workingState,
      };
    }
  }

  // ============================================================================
  // Tool Call Execution
  // ============================================================================

  /**
   * Execute a single tool call
   */
  private async executeToolCall(
    call: ToolCall,
    auth: AuthContext,
    opts: ExecutionOptions,
    previousResults?: Map<string, ToolCallResult>
  ): Promise<ToolCallResult> {
    const timer = startTimer();

    try {
      // Resolve any parameter references to previous results
      const resolvedParams = this.resolveParams(call.params, call.dependsOn, previousResults);

      // Get service from registry
      const registry = getEnhancedRegistry();
      const service = registry.get(call.serviceId);

      if (!service) {
        const timing = timer();
        return {
          id: call.id,
          serviceId: call.serviceId,
          toolName: call.toolName,
          success: false,
          error: {
            code: 'SERVICE_NOT_FOUND',
            message: `Service ${call.serviceId} not found`,
          },
          durationMs: timing.durationMs,
        };
      }

      // Build invoke request
      const invokeRequest: YWAIPInvokeRequest = {
        action: call.toolName,
        params: resolvedParams,
        context: {
          userId: auth.userId,
          requestId: auth.requestId,
          scopes: auth.scopes,
        },
      };

      // Make the service call
      const response = await fetch(`${service.baseUrl}${service.endpoints.invoke}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Yukie-User-Id': auth.userId,
          'X-Yukie-Scopes': auth.scopes.join(','),
          'X-Yukie-Request-Id': auth.requestId || '',
        },
        body: JSON.stringify(invokeRequest),
        signal: AbortSignal.timeout(opts.timeout || DEFAULT_OPTIONS.timeout!),
      });

      const timing = timer();

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn('Tool call failed', { callId: call.id, status: response.status });

        return {
          id: call.id,
          serviceId: call.serviceId,
          toolName: call.toolName,
          success: false,
          error: {
            code: 'INVOCATION_FAILED',
            message: `Service returned error: ${response.status}`,
            details: { body: errorText },
          },
          durationMs: timing.durationMs,
        };
      }

      const result = await response.json() as YWAIPInvokeResponse;

      logger.debug('Tool call completed', {
        callId: call.id,
        success: result.success,
        durationMs: timing.durationMs,
      });

      return {
        id: call.id,
        serviceId: call.serviceId,
        toolName: call.toolName,
        success: result.success,
        result: result.result,
        error: result.error ? {
          code: result.error.code,
          message: result.error.message,
          details: result.error.details,
        } : undefined,
        durationMs: timing.durationMs,
      };
    } catch (error) {
      const timing = timer();
      logger.error('Tool call error', error, { callId: call.id });

      return {
        id: call.id,
        serviceId: call.serviceId,
        toolName: call.toolName,
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        durationMs: timing.durationMs,
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel
   */
  private async executeParallel(
    calls: ToolCall[],
    auth: AuthContext,
    opts: ExecutionOptions,
    previousResults?: Map<string, ToolCallResult>
  ): Promise<ToolCallResult[]> {
    const maxParallel = opts.maxParallel || DEFAULT_OPTIONS.maxParallel!;

    // Batch calls if exceeding max parallel
    const results: ToolCallResult[] = [];

    for (let i = 0; i < calls.length; i += maxParallel) {
      const batch = calls.slice(i, i + maxParallel);
      const batchResults = await Promise.all(
        batch.map((call) => this.executeToolCall(call, auth, opts, previousResults))
      );
      results.push(...batchResults);
    }

    return results;
  }

  // ============================================================================
  // Parameter Resolution
  // ============================================================================

  /**
   * Resolve parameter references to previous results
   */
  private resolveParams(
    params: Record<string, unknown>,
    dependsOn?: string[],
    previousResults?: Map<string, ToolCallResult>
  ): Record<string, unknown> {
    if (!dependsOn || !previousResults) {
      return params;
    }

    const resolved = { ...params };

    // Look for parameter references like "${callId.result.field}"
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        const ref = value.slice(2, -1);
        const parts = ref.split('.');

        if (parts.length >= 2) {
          const callId = parts[0];
          const path = parts.slice(1);

          const prevResult = previousResults.get(callId);
          if (prevResult && prevResult.success && prevResult.result) {
            resolved[key] = this.getNestedValue(prevResult.result, path);
          }
        }
      }
    }

    return resolved;
  }

  private getNestedValue(obj: unknown, path: string[]): unknown {
    let current = obj;
    for (const key of path) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return current;
  }

  // ============================================================================
  // Working State Management
  // ============================================================================

  private initializeWorkingState(plan: Plan): WorkingState {
    return {
      planId: plan.id,
      currentStep: 0,
      totalSteps: plan.executionOrder?.length || 1,
      completedCalls: [],
      pendingCalls: plan.toolCalls.map((c) => c.id),
      failedCalls: [],
      results: new Map(),
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
    };
  }

  private updateWorkingState(state: WorkingState, result: ToolCallResult): void {
    state.results.set(result.id, result);
    state.pendingCalls = state.pendingCalls.filter((id) => id !== result.id);

    if (result.success) {
      state.completedCalls.push(result.id);
    } else {
      state.failedCalls.push(result.id);
    }

    state.lastUpdatedAt = Date.now();
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  updateOptions(options: Partial<ExecutionOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): ExecutionOptions {
    return { ...this.options };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let executorInstance: Executor | null = null;

export function getExecutor(options?: Partial<ExecutionOptions>): Executor {
  if (!executorInstance) {
    executorInstance = new Executor(options);
  }
  return executorInstance;
}

export function resetExecutor(): void {
  executorInstance = null;
}
