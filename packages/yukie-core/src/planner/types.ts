/**
 * Planner Types
 *
 * Type definitions for multi-tool planning and orchestration.
 */

import type { AuthContext } from '../../../shared/protocol/src/types';
import type { ToolSchema, RiskLevel } from '../registry/types';

// ============================================================================
// Tool Call Types
// ============================================================================

export interface ToolCall {
  id: string;
  serviceId: string;
  toolName: string;
  params: Record<string, unknown>;
  dependsOn?: string[];  // IDs of tool calls this depends on
  riskLevel: RiskLevel;
}

export interface ToolCallResult {
  id: string;
  serviceId: string;
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  durationMs: number;
}

// ============================================================================
// Plan Types
// ============================================================================

export type ExecutionMode = 'single' | 'parallel' | 'sequential' | 'mixed';

export interface Plan {
  id: string;
  message: string;
  toolCalls: ToolCall[];
  executionMode: ExecutionMode;
  executionOrder?: string[][];  // Groups of tool IDs to execute in order
  confidence: number;
  reasoning: string;
  createdAt: number;
}

export interface PlanStep {
  stepNumber: number;
  toolCalls: ToolCall[];  // Tool calls to execute in this step (parallel)
  description: string;
}

// ============================================================================
// Working State Types
// ============================================================================

export interface WorkingState {
  planId: string;
  currentStep: number;
  totalSteps: number;
  completedCalls: string[];
  pendingCalls: string[];
  failedCalls: string[];
  results: Map<string, ToolCallResult>;
  startedAt: number;
  lastUpdatedAt: number;
}

// ============================================================================
// Planner Request/Response Types
// ============================================================================

export interface PlanRequest {
  message: string;
  auth: AuthContext;
  availableTools: Array<{
    serviceId: string;
    serviceName: string;
    tools: ToolSchema[];
  }>;
  model?: string;
  maxTools?: number;
}

export interface PlanResponse {
  plan: Plan;
  planningTimeMs: number;
}

// ============================================================================
// LLM Planning Types
// ============================================================================

export interface LLMPlanningResult {
  toolCalls: Array<{
    serviceId: string;
    toolName: string;
    params: Record<string, unknown>;
    dependsOn?: string[];
    purpose: string;
  }>;
  executionMode: ExecutionMode;
  confidence: number;
  reasoning: string;
}

// ============================================================================
// Plan Execution Types
// ============================================================================

export interface ExecutionOptions {
  maxParallel?: number;
  timeout?: number;
  retryFailedCalls?: boolean;
  maxRetries?: number;
  requireConfirmation?: boolean;
}

export interface ExecutionResult {
  planId: string;
  success: boolean;
  results: ToolCallResult[];
  totalDurationMs: number;
  completedCalls: number;
  failedCalls: number;
  workingState: WorkingState;
}

// ============================================================================
// Plan Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'missing_param' | 'invalid_param' | 'missing_scope' | 'unknown_tool' | 'circular_dependency';
  toolCallId: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationWarning {
  type: 'high_risk' | 'deprecated_tool' | 'slow_tool' | 'rate_limited';
  toolCallId: string;
  message: string;
  details?: Record<string, unknown>;
}
