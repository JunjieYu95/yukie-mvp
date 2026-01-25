/**
 * Multi-Tool Planner
 *
 * Uses LLM to plan multi-tool workflows from user messages.
 * Supports single, parallel, and sequential execution modes.
 */

import { createLogger, startTimer } from '../../../shared/observability/src/logger';
import type { AuthContext } from '../../../shared/protocol/src/types';
import { completeWithJSON } from '../llm/client';
import type { ToolSchema, RiskLevel } from '../registry/types';
import type {
  Plan,
  PlanRequest,
  PlanResponse,
  ToolCall,
  LLMPlanningResult,
  ExecutionMode,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types';

const logger = createLogger('planner');

// ============================================================================
// Planner
// ============================================================================

export class Planner {
  private defaultMaxTools: number = 5;

  constructor() {}

  // ============================================================================
  // Plan Generation
  // ============================================================================

  /**
   * Generate a plan from a user message
   */
  async plan(request: PlanRequest): Promise<PlanResponse> {
    const timer = startTimer();

    // Build prompt with available tools
    const prompt = this.buildPlanningPrompt(request);

    try {
      const { result, error } = await completeWithJSON<LLMPlanningResult>(
        [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        {
          temperature: 0.1,
          maxTokens: 1024,
          model: request.model,
        }
      );

      const timing = timer();

      if (!result || error) {
        logger.warn('Failed to generate plan', { error });
        return {
          plan: this.createEmptyPlan(request.message, 'Failed to generate plan'),
          planningTimeMs: timing.durationMs,
        };
      }

      // Convert LLM result to Plan
      const plan = this.convertToPlan(request.message, result, request.availableTools);

      // Validate the plan
      const validation = this.validatePlan(plan, request.auth, request.availableTools);
      if (!validation.valid) {
        logger.warn('Plan validation failed', { errors: validation.errors });
        // Still return the plan, but log the issues
      }

      logger.info('Plan generated', {
        planId: plan.id,
        toolCallCount: plan.toolCalls.length,
        executionMode: plan.executionMode,
        confidence: plan.confidence,
        durationMs: timing.durationMs,
      });

      return {
        plan,
        planningTimeMs: timing.durationMs,
      };
    } catch (error) {
      const timing = timer();
      logger.error('Planning error', error);
      return {
        plan: this.createEmptyPlan(request.message, 'Planning failed due to an error'),
        planningTimeMs: timing.durationMs,
      };
    }
  }

  // ============================================================================
  // Prompt Building
  // ============================================================================

  private buildPlanningPrompt(request: PlanRequest): { system: string; user: string } {
    const toolDescriptions = request.availableTools
      .map((service) => {
        const tools = service.tools
          .map((t) => {
            const params = t.parameters
              .map((p) => `    - ${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description}`)
              .join('\n');
            return `  - ${t.name}: ${t.description}\n    Parameters:\n${params}`;
          })
          .join('\n');
        return `Service: ${service.serviceName} (${service.serviceId})\n${tools}`;
      })
      .join('\n\n');

    const maxTools = request.maxTools || this.defaultMaxTools;

    const system = `You are Yukie, an intelligent assistant planner. Your job is to analyze a user's request and create a plan of tool calls to fulfill it.

Available tools:
${toolDescriptions}

Rules:
1. Analyze the user's request to determine what tools are needed
2. If multiple tools are needed, decide if they can run in parallel or must be sequential
3. Use "parallel" if tools are independent, "sequential" if one depends on another's output
4. Use "single" if only one tool is needed
5. Maximum ${maxTools} tool calls allowed
6. Provide confidence (0.0-1.0) based on how well the tools match the request
7. If no tools can handle the request, return empty toolCalls array

Respond ONLY with valid JSON in this exact format:
{
  "toolCalls": [
    {
      "serviceId": "<service-id>",
      "toolName": "<tool-name>",
      "params": { <parameter-values> },
      "dependsOn": ["<id-of-dependent-call>"],  // optional, for sequential dependencies
      "purpose": "<what this call accomplishes>"
    }
  ],
  "executionMode": "single" | "parallel" | "sequential" | "mixed",
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation of the plan>"
}`;

    const user = `User request: "${request.message}"

Create a plan to fulfill this request using the available tools. Respond with JSON only.`;

    return { system, user };
  }

  // ============================================================================
  // Plan Conversion
  // ============================================================================

  private convertToPlan(
    message: string,
    result: LLMPlanningResult,
    availableTools: Array<{ serviceId: string; tools: ToolSchema[] }>
  ): Plan {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const toolCalls: ToolCall[] = result.toolCalls.map((tc, index) => {
      // Find the tool to get risk level
      const service = availableTools.find((s) => s.serviceId === tc.serviceId);
      const tool = service?.tools.find((t) => t.name === tc.toolName);
      const riskLevel: RiskLevel = tool?.riskLevel || 'low';

      return {
        id: `call_${index}_${tc.toolName}`,
        serviceId: tc.serviceId,
        toolName: tc.toolName,
        params: tc.params,
        dependsOn: tc.dependsOn,
        riskLevel,
      };
    });

    // Determine execution order based on dependencies
    const executionOrder = this.calculateExecutionOrder(toolCalls);

    return {
      id: planId,
      message,
      toolCalls,
      executionMode: result.executionMode,
      executionOrder,
      confidence: result.confidence,
      reasoning: result.reasoning,
      createdAt: Date.now(),
    };
  }

  private calculateExecutionOrder(toolCalls: ToolCall[]): string[][] {
    if (toolCalls.length === 0) return [];
    if (toolCalls.length === 1) return [[toolCalls[0].id]];

    // Build dependency graph
    const dependencyMap = new Map<string, Set<string>>();
    const reverseDependencyMap = new Map<string, Set<string>>();

    for (const call of toolCalls) {
      dependencyMap.set(call.id, new Set(call.dependsOn || []));
      if (!reverseDependencyMap.has(call.id)) {
        reverseDependencyMap.set(call.id, new Set());
      }
      for (const dep of call.dependsOn || []) {
        if (!reverseDependencyMap.has(dep)) {
          reverseDependencyMap.set(dep, new Set());
        }
        reverseDependencyMap.get(dep)!.add(call.id);
      }
    }

    // Topological sort to determine execution order
    const order: string[][] = [];
    const remaining = new Set(toolCalls.map((c) => c.id));

    while (remaining.size > 0) {
      // Find all calls with no pending dependencies
      const ready: string[] = [];
      for (const id of remaining) {
        const deps = dependencyMap.get(id);
        if (!deps || deps.size === 0 || Array.from(deps).every((d) => !remaining.has(d))) {
          ready.push(id);
        }
      }

      if (ready.length === 0) {
        // Circular dependency - just add remaining
        order.push(Array.from(remaining));
        break;
      }

      order.push(ready);
      for (const id of ready) {
        remaining.delete(id);
      }
    }

    return order;
  }

  private createEmptyPlan(message: string, reasoning: string): Plan {
    return {
      id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      message,
      toolCalls: [],
      executionMode: 'single',
      executionOrder: [],
      confidence: 0,
      reasoning,
      createdAt: Date.now(),
    };
  }

  // ============================================================================
  // Plan Validation
  // ============================================================================

  validatePlan(
    plan: Plan,
    auth: AuthContext,
    availableTools: Array<{ serviceId: string; tools: ToolSchema[] }>
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const call of plan.toolCalls) {
      // Find the service and tool
      const service = availableTools.find((s) => s.serviceId === call.serviceId);
      if (!service) {
        errors.push({
          type: 'unknown_tool',
          toolCallId: call.id,
          message: `Unknown service: ${call.serviceId}`,
        });
        continue;
      }

      const tool = service.tools.find((t) => t.name === call.toolName);
      if (!tool) {
        errors.push({
          type: 'unknown_tool',
          toolCallId: call.id,
          message: `Unknown tool: ${call.toolName} in service ${call.serviceId}`,
        });
        continue;
      }

      // Check required parameters
      for (const param of tool.parameters) {
        if (param.required && !(param.name in call.params)) {
          errors.push({
            type: 'missing_param',
            toolCallId: call.id,
            message: `Missing required parameter: ${param.name}`,
            details: { paramName: param.name, toolName: call.toolName },
          });
        }
      }

      // Check required scopes
      for (const scope of tool.requiredScopes) {
        if (!auth.scopes.includes(scope) && !auth.scopes.includes('admin')) {
          errors.push({
            type: 'missing_scope',
            toolCallId: call.id,
            message: `Missing required scope: ${scope}`,
            details: { scope, toolName: call.toolName },
          });
        }
      }

      // Check risk level
      if (call.riskLevel === 'high') {
        warnings.push({
          type: 'high_risk',
          toolCallId: call.id,
          message: `High-risk tool call: ${call.toolName}`,
        });
      }

      // Check dependencies exist
      for (const depId of call.dependsOn || []) {
        if (!plan.toolCalls.some((c) => c.id === depId)) {
          errors.push({
            type: 'circular_dependency',
            toolCallId: call.id,
            message: `Dependency not found: ${depId}`,
            details: { dependencyId: depId },
          });
        }
      }
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (id: string): boolean => {
      visited.add(id);
      recursionStack.add(id);

      const call = plan.toolCalls.find((c) => c.id === id);
      for (const depId of call?.dependsOn || []) {
        if (!visited.has(depId)) {
          if (hasCycle(depId)) return true;
        } else if (recursionStack.has(depId)) {
          return true;
        }
      }

      recursionStack.delete(id);
      return false;
    };

    for (const call of plan.toolCalls) {
      if (!visited.has(call.id) && hasCycle(call.id)) {
        errors.push({
          type: 'circular_dependency',
          toolCallId: call.id,
          message: 'Circular dependency detected',
        });
        break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let plannerInstance: Planner | null = null;

export function getPlanner(): Planner {
  if (!plannerInstance) {
    plannerInstance = new Planner();
  }
  return plannerInstance;
}

export function resetPlanner(): void {
  plannerInstance = null;
}
