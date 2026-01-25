/**
 * Parameter Validator
 *
 * JSON Schema-based validation for tool call parameters.
 */

import { createLogger } from '../../../shared/observability/src/logger';
import type { ToolSchema, ToolParameter } from '../enhanced-registry/types';
import type { ToolCall } from '../planner/types';

const logger = createLogger('validator');

// ============================================================================
// Validation Result Types
// ============================================================================

export interface ParamValidationResult {
  valid: boolean;
  errors: ParamValidationError[];
}

export interface ParamValidationError {
  param: string;
  message: string;
  received?: unknown;
  expected?: string;
}

// ============================================================================
// Validator
// ============================================================================

export class ParameterValidator {
  /**
   * Validate tool call parameters against a tool schema
   */
  validate(call: ToolCall, schema: ToolSchema): ParamValidationResult {
    const errors: ParamValidationError[] = [];

    // Check required parameters
    for (const param of schema.parameters) {
      if (param.required && !(param.name in call.params)) {
        errors.push({
          param: param.name,
          message: `Required parameter '${param.name}' is missing`,
          expected: param.type,
        });
      }
    }

    // Validate provided parameters
    for (const [name, value] of Object.entries(call.params)) {
      const paramSchema = schema.parameters.find((p) => p.name === name);

      if (!paramSchema) {
        // Unknown parameter - just log a warning, don't fail
        logger.debug('Unknown parameter', { toolName: schema.name, param: name });
        continue;
      }

      const typeError = this.validateType(value, paramSchema);
      if (typeError) {
        errors.push({
          param: name,
          message: typeError,
          received: value,
          expected: paramSchema.type,
        });
      }

      // Validate enum values
      if (paramSchema.enum && !paramSchema.enum.includes(String(value))) {
        errors.push({
          param: name,
          message: `Value must be one of: ${paramSchema.enum.join(', ')}`,
          received: value,
          expected: `one of [${paramSchema.enum.join(', ')}]`,
        });
      }

      // Validate numeric constraints
      if (paramSchema.type === 'number' && typeof value === 'number') {
        if (paramSchema.minimum !== undefined && value < paramSchema.minimum) {
          errors.push({
            param: name,
            message: `Value must be >= ${paramSchema.minimum}`,
            received: value,
            expected: `>= ${paramSchema.minimum}`,
          });
        }
        if (paramSchema.maximum !== undefined && value > paramSchema.maximum) {
          errors.push({
            param: name,
            message: `Value must be <= ${paramSchema.maximum}`,
            received: value,
            expected: `<= ${paramSchema.maximum}`,
          });
        }
      }

      // Validate string pattern
      if (paramSchema.type === 'string' && typeof value === 'string' && paramSchema.pattern) {
        const regex = new RegExp(paramSchema.pattern);
        if (!regex.test(value)) {
          errors.push({
            param: name,
            message: `Value must match pattern: ${paramSchema.pattern}`,
            received: value,
            expected: `pattern: ${paramSchema.pattern}`,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate a value against a parameter type
   */
  private validateType(value: unknown, param: ToolParameter): string | null {
    if (value === null || value === undefined) {
      if (param.required) {
        return `Parameter '${param.name}' cannot be null or undefined`;
      }
      return null;
    }

    switch (param.type) {
      case 'string':
        if (typeof value !== 'string') {
          return `Expected string, got ${typeof value}`;
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return `Expected number, got ${typeof value}`;
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return `Expected boolean, got ${typeof value}`;
        }
        break;

      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          return `Expected object, got ${Array.isArray(value) ? 'array' : typeof value}`;
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return `Expected array, got ${typeof value}`;
        }
        break;
    }

    return null;
  }

  /**
   * Coerce parameters to expected types when possible
   */
  coerceParams(params: Record<string, unknown>, schema: ToolSchema): Record<string, unknown> {
    const coerced: Record<string, unknown> = { ...params };

    for (const paramSchema of schema.parameters) {
      const value = coerced[paramSchema.name];
      if (value === undefined) continue;

      switch (paramSchema.type) {
        case 'number':
          if (typeof value === 'string') {
            const num = parseFloat(value);
            if (!isNaN(num)) {
              coerced[paramSchema.name] = num;
            }
          }
          break;

        case 'boolean':
          if (typeof value === 'string') {
            if (value.toLowerCase() === 'true') {
              coerced[paramSchema.name] = true;
            } else if (value.toLowerCase() === 'false') {
              coerced[paramSchema.name] = false;
            }
          } else if (typeof value === 'number') {
            coerced[paramSchema.name] = value !== 0;
          }
          break;

        case 'string':
          if (typeof value !== 'string') {
            coerced[paramSchema.name] = String(value);
          }
          break;

        case 'array':
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              if (Array.isArray(parsed)) {
                coerced[paramSchema.name] = parsed;
              }
            } catch {
              // If it's comma-separated, split it
              coerced[paramSchema.name] = value.split(',').map((s) => s.trim());
            }
          }
          break;

        case 'object':
          if (typeof value === 'string') {
            try {
              coerced[paramSchema.name] = JSON.parse(value);
            } catch {
              // Keep as is
            }
          }
          break;
      }
    }

    // Apply defaults for missing optional parameters
    for (const paramSchema of schema.parameters) {
      if (!(paramSchema.name in coerced) && paramSchema.default !== undefined) {
        coerced[paramSchema.name] = paramSchema.default;
      }
    }

    return coerced;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let validatorInstance: ParameterValidator | null = null;

export function getValidator(): ParameterValidator {
  if (!validatorInstance) {
    validatorInstance = new ParameterValidator();
  }
  return validatorInstance;
}

export function resetValidator(): void {
  validatorInstance = null;
}
