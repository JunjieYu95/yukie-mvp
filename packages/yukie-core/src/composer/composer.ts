/**
 * Response Composer
 *
 * Composes natural language responses from multi-tool execution results.
 * Uses LLM to format results in a conversational way.
 */

import { createLogger, startTimer } from '../../../shared/observability/src/logger';
import { getLLMClient } from '../llm/client';
import type { Plan, ToolCallResult, ExecutionResult } from '../planner/types';

const logger = createLogger('composer');

// ============================================================================
// Composition Types
// ============================================================================

export interface CompositionRequest {
  originalMessage: string;
  plan: Plan;
  executionResult: ExecutionResult;
  model?: string;
}

export interface CompositionResult {
  response: string;
  compositionTimeMs: number;
  success: boolean;
}

// ============================================================================
// Composer
// ============================================================================

export class ResponseComposer {
  /**
   * Compose a natural language response from execution results
   */
  async compose(request: CompositionRequest): Promise<CompositionResult> {
    const timer = startTimer();

    try {
      const { originalMessage, plan, executionResult } = request;

      // Handle empty results
      if (executionResult.results.length === 0) {
        return {
          response: "I wasn't able to perform any actions for your request. Could you please rephrase or provide more details?",
          compositionTimeMs: timer().durationMs,
          success: true,
        };
      }

      // Handle single result
      if (executionResult.results.length === 1) {
        const result = executionResult.results[0];
        return this.composeSingleResult(originalMessage, result, request.model);
      }

      // Handle multiple results
      return this.composeMultipleResults(originalMessage, plan, executionResult, request.model);
    } catch (error) {
      const timing = timer();
      logger.error('Composition error', error);

      return {
        response: "I completed your request but had trouble formatting the response. Here's a summary of what happened.",
        compositionTimeMs: timing.durationMs,
        success: false,
      };
    }
  }

  /**
   * Compose response for a single tool result
   */
  private async composeSingleResult(
    originalMessage: string,
    result: ToolCallResult,
    model?: string
  ): Promise<CompositionResult> {
    const timer = startTimer();

    if (!result.success) {
      const timing = timer();
      return {
        response: `I encountered an issue: ${result.error?.message || 'Unknown error'}. Please try again.`,
        compositionTimeMs: timing.durationMs,
        success: true,
      };
    }

    const prompt = this.buildSingleResultPrompt(originalMessage, result);

    try {
      const client = getLLMClient();
      const response = await client.complete(
        [{ role: 'user', content: prompt }],
        {
          temperature: 0.7,
          maxTokens: 512,
          model,
        }
      );

      const timing = timer();

      return {
        response: response.content,
        compositionTimeMs: timing.durationMs,
        success: true,
      };
    } catch (error) {
      const timing = timer();
      logger.warn('Failed to format response with LLM', {}, error);

      // Fallback to basic formatting
      return {
        response: this.formatBasicResponse(result),
        compositionTimeMs: timing.durationMs,
        success: true,
      };
    }
  }

  /**
   * Compose response for multiple tool results
   */
  private async composeMultipleResults(
    originalMessage: string,
    plan: Plan,
    executionResult: ExecutionResult,
    model?: string
  ): Promise<CompositionResult> {
    const timer = startTimer();

    const prompt = this.buildMultiResultPrompt(originalMessage, plan, executionResult);

    try {
      const client = getLLMClient();
      const response = await client.complete(
        [{ role: 'user', content: prompt }],
        {
          temperature: 0.7,
          maxTokens: 1024,
          model,
        }
      );

      const timing = timer();

      return {
        response: response.content,
        compositionTimeMs: timing.durationMs,
        success: true,
      };
    } catch (error) {
      const timing = timer();
      logger.warn('Failed to format multi-result response with LLM', {}, error);

      // Fallback to basic formatting
      return {
        response: this.formatBasicMultiResponse(executionResult),
        compositionTimeMs: timing.durationMs,
        success: true,
      };
    }
  }

  // ============================================================================
  // Prompt Building
  // ============================================================================

  private buildSingleResultPrompt(originalMessage: string, result: ToolCallResult): string {
    return `You are Yukie, a helpful AI assistant. You just performed an action for the user. Format the result in a natural, conversational way.

User's original request: "${originalMessage}"

Action performed: ${result.toolName} on ${result.serviceId}

Result:
${JSON.stringify(result.result, null, 2)}

Format this response naturally for the user. Be concise but informative.
- If it's a success, present the information clearly
- If there are numbers or dates, format them nicely
- Add a brief relevant comment if appropriate
- Don't be overly verbose`;
  }

  private buildMultiResultPrompt(
    originalMessage: string,
    plan: Plan,
    executionResult: ExecutionResult
  ): string {
    const resultsDescription = executionResult.results
      .map((r) => {
        const status = r.success ? 'Success' : `Failed: ${r.error?.message}`;
        const data = r.success ? JSON.stringify(r.result, null, 2) : 'N/A';
        return `- ${r.toolName} (${r.serviceId}): ${status}\n  Data: ${data}`;
      })
      .join('\n\n');

    return `You are Yukie, a helpful AI assistant. You just performed multiple actions for the user. Compose a unified, natural response.

User's original request: "${originalMessage}"

Plan reasoning: ${plan.reasoning}

Results from ${executionResult.results.length} actions:
${resultsDescription}

Summary:
- Completed: ${executionResult.completedCalls}
- Failed: ${executionResult.failedCalls}

Compose a natural, unified response that:
1. Addresses the user's original request
2. Presents the information from all successful actions
3. Mentions any failures briefly if relevant
4. Is conversational and helpful
5. Doesn't repeat "I" too much
6. Keeps a friendly tone`;
  }

  // ============================================================================
  // Basic Formatting (Fallback)
  // ============================================================================

  private formatBasicResponse(result: ToolCallResult): string {
    if (!result.success) {
      return `I encountered an issue: ${result.error?.message || 'Unknown error'}. Please try again.`;
    }

    if (!result.result) {
      return 'Done! The action was completed successfully.';
    }

    // Try to format the result nicely
    if (typeof result.result === 'string') {
      return result.result;
    }

    if (typeof result.result === 'object') {
      const obj = result.result as Record<string, unknown>;

      // Look for common response patterns
      if ('message' in obj && typeof obj.message === 'string') {
        return obj.message;
      }

      if ('data' in obj) {
        return `Here's what I found:\n${JSON.stringify(obj.data, null, 2)}`;
      }

      return `Here's the result:\n${JSON.stringify(result.result, null, 2)}`;
    }

    return `Result: ${result.result}`;
  }

  private formatBasicMultiResponse(executionResult: ExecutionResult): string {
    const parts: string[] = [];

    for (const result of executionResult.results) {
      if (result.success) {
        parts.push(`${result.toolName}: ${this.formatBasicResponse(result)}`);
      } else {
        parts.push(`${result.toolName}: Failed - ${result.error?.message}`);
      }
    }

    if (executionResult.failedCalls > 0) {
      parts.push(`\n(${executionResult.failedCalls} action(s) failed)`);
    }

    return parts.join('\n\n');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let composerInstance: ResponseComposer | null = null;

export function getComposer(): ResponseComposer {
  if (!composerInstance) {
    composerInstance = new ResponseComposer();
  }
  return composerInstance;
}

export function resetComposer(): void {
  composerInstance = null;
}
