/**
 * Risk Classifier
 *
 * Classifies tool calls by risk level and determines if additional
 * security measures (like confirmation) are required.
 */

import { createLogger } from '../../../shared/observability/src/logger';
import type { RiskLevel, ToolSchema } from '../registry/types';
import type { ToolCall } from '../planner/types';

const logger = createLogger('risk-classifier');

// ============================================================================
// Risk Classification Types
// ============================================================================

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
  requiresConfirmation: boolean;
  mitigations?: string[];
}

export interface RiskRule {
  id: string;
  name: string;
  description: string;
  check: (call: ToolCall, schema?: ToolSchema) => RiskMatch | null;
  elevatesTo: RiskLevel;
  requiresConfirmation: boolean;
}

export interface RiskMatch {
  ruleId: string;
  reason: string;
  severity: number; // 1-10
}

// ============================================================================
// Built-in Risk Rules
// ============================================================================

const BUILTIN_RULES: RiskRule[] = [
  {
    id: 'delete-operation',
    name: 'Delete Operation',
    description: 'Operations that delete data',
    check: (call) => {
      if (
        call.toolName.includes('delete') ||
        call.toolName.includes('remove') ||
        call.toolName.includes('destroy')
      ) {
        return {
          ruleId: 'delete-operation',
          reason: `Tool ${call.toolName} performs deletion`,
          severity: 7,
        };
      }
      return null;
    },
    elevatesTo: 'high',
    requiresConfirmation: true,
  },
  {
    id: 'bulk-operation',
    name: 'Bulk Operation',
    description: 'Operations affecting multiple items',
    check: (call) => {
      const params = call.params;
      if (
        params.all === true ||
        params.bulk === true ||
        (Array.isArray(params.ids) && params.ids.length > 10)
      ) {
        return {
          ruleId: 'bulk-operation',
          reason: 'Operation affects multiple items',
          severity: 6,
        };
      }
      return null;
    },
    elevatesTo: 'medium',
    requiresConfirmation: true,
  },
  {
    id: 'external-api',
    name: 'External API Call',
    description: 'Operations that call external APIs',
    check: (call) => {
      if (
        call.toolName.includes('external') ||
        call.toolName.includes('webhook') ||
        call.toolName.includes('notify')
      ) {
        return {
          ruleId: 'external-api',
          reason: 'Operation calls external API',
          severity: 5,
        };
      }
      return null;
    },
    elevatesTo: 'medium',
    requiresConfirmation: false,
  },
  {
    id: 'financial-operation',
    name: 'Financial Operation',
    description: 'Operations involving money or payments',
    check: (call) => {
      const financialKeywords = ['payment', 'charge', 'refund', 'transfer', 'withdraw', 'deposit'];
      if (financialKeywords.some((k) => call.toolName.toLowerCase().includes(k))) {
        return {
          ruleId: 'financial-operation',
          reason: 'Operation involves financial transaction',
          severity: 9,
        };
      }
      return null;
    },
    elevatesTo: 'high',
    requiresConfirmation: true,
  },
  {
    id: 'admin-operation',
    name: 'Admin Operation',
    description: 'Administrative or privileged operations',
    check: (call) => {
      const adminKeywords = ['admin', 'manage', 'config', 'setting', 'permission', 'role'];
      if (adminKeywords.some((k) => call.toolName.toLowerCase().includes(k))) {
        return {
          ruleId: 'admin-operation',
          reason: 'Operation requires admin privileges',
          severity: 8,
        };
      }
      return null;
    },
    elevatesTo: 'high',
    requiresConfirmation: true,
  },
  {
    id: 'data-export',
    name: 'Data Export',
    description: 'Operations that export user data',
    check: (call) => {
      if (
        call.toolName.includes('export') ||
        call.toolName.includes('download') ||
        call.toolName.includes('backup')
      ) {
        return {
          ruleId: 'data-export',
          reason: 'Operation exports user data',
          severity: 5,
        };
      }
      return null;
    },
    elevatesTo: 'medium',
    requiresConfirmation: false,
  },
];

// ============================================================================
// Risk Classifier
// ============================================================================

export class RiskClassifier {
  private rules: RiskRule[] = [...BUILTIN_RULES];
  private confirmationThreshold: RiskLevel = 'high';

  constructor() {}

  // ============================================================================
  // Risk Assessment
  // ============================================================================

  /**
   * Assess the risk of a tool call
   */
  assess(call: ToolCall, schema?: ToolSchema): RiskAssessment {
    const matches: RiskMatch[] = [];
    let maxLevel: RiskLevel = call.riskLevel || 'low';
    let requiresConfirmation = false;

    // Check all rules
    for (const rule of this.rules) {
      const match = rule.check(call, schema);
      if (match) {
        matches.push(match);

        // Elevate risk level if rule requires it
        if (this.compareRiskLevels(rule.elevatesTo, maxLevel) > 0) {
          maxLevel = rule.elevatesTo;
        }

        // Check if confirmation is required
        if (rule.requiresConfirmation) {
          requiresConfirmation = true;
        }
      }
    }

    // Check schema-based risk level
    if (schema?.riskLevel && this.compareRiskLevels(schema.riskLevel, maxLevel) > 0) {
      maxLevel = schema.riskLevel;
    }

    // Determine if confirmation is required based on threshold
    if (this.compareRiskLevels(maxLevel, this.confirmationThreshold) >= 0) {
      requiresConfirmation = true;
    }

    const assessment: RiskAssessment = {
      level: maxLevel,
      reasons: matches.map((m) => m.reason),
      requiresConfirmation,
    };

    // Add mitigations for high-risk operations
    if (maxLevel === 'high') {
      assessment.mitigations = [
        'Require explicit user confirmation',
        'Log detailed audit trail',
        'Consider rate limiting',
      ];
    } else if (maxLevel === 'medium') {
      assessment.mitigations = [
        'Log audit trail',
        'Validate all parameters',
      ];
    }

    logger.debug('Risk assessment complete', {
      callId: call.id,
      level: maxLevel,
      matchCount: matches.length,
      requiresConfirmation,
    });

    return assessment;
  }

  /**
   * Assess multiple tool calls
   */
  assessPlan(calls: ToolCall[], schemas?: Map<string, ToolSchema>): Map<string, RiskAssessment> {
    const assessments = new Map<string, RiskAssessment>();

    for (const call of calls) {
      const schema = schemas?.get(`${call.serviceId}.${call.toolName}`);
      assessments.set(call.id, this.assess(call, schema));
    }

    return assessments;
  }

  /**
   * Get the overall risk level for a plan
   */
  getOverallRisk(assessments: Map<string, RiskAssessment>): RiskLevel {
    let maxLevel: RiskLevel = 'low';

    for (const assessment of assessments.values()) {
      if (this.compareRiskLevels(assessment.level, maxLevel) > 0) {
        maxLevel = assessment.level;
      }
    }

    return maxLevel;
  }

  // ============================================================================
  // Rule Management
  // ============================================================================

  /**
   * Add a custom rule
   */
  addRule(rule: RiskRule): void {
    this.rules.push(rule);
    logger.debug('Rule added', { ruleId: rule.id });
  }

  /**
   * Remove a rule
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index !== -1) {
      this.rules.splice(index, 1);
      logger.debug('Rule removed', { ruleId });
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getRules(): RiskRule[] {
    return [...this.rules];
  }

  /**
   * Set confirmation threshold
   */
  setConfirmationThreshold(level: RiskLevel): void {
    this.confirmationThreshold = level;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private compareRiskLevels(a: RiskLevel, b: RiskLevel): number {
    const order: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
    return order[a] - order[b];
  }
}

// ============================================================================
// Singleton
// ============================================================================

let riskClassifierInstance: RiskClassifier | null = null;

export function getRiskClassifier(): RiskClassifier {
  if (!riskClassifierInstance) {
    riskClassifierInstance = new RiskClassifier();
  }
  return riskClassifierInstance;
}

export function resetRiskClassifier(): void {
  riskClassifierInstance = null;
}
