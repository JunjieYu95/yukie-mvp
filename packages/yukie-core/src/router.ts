import type { YNFPRoutingResult, YWAIPInvokeRequest, YWAIPInvokeResponse, AuthContext } from '../../shared/protocol/src/types';
import { getRegistry } from './registry';
import { getLLMClient, completeWithJSON } from './llm/client';
import { buildRoutingPrompt, buildRoutingUserMessage, buildFallbackPrompt, buildResponseFormattingPrompt } from './llm/prompts';
import { createLogger, startTimer } from '../../shared/observability/src/logger';

const logger = createLogger('router');

// ============================================================================
// LLM-Based Service Router
// ============================================================================

export async function routeMessage(userMessage: string, model?: string): Promise<YNFPRoutingResult> {
  const registry = getRegistry();
  const services = registry.getEnabled();

  if (services.length === 0) {
    logger.warn('No enabled services available for routing');
    return {
      targetService: 'none',
      confidence: 1.0,
      reasoning: 'No services are currently available',
    };
  }

  const timer = startTimer();

  try {
    const systemPrompt = buildRoutingPrompt(services);
    const userPromptContent = buildRoutingUserMessage(userMessage);

    const { result, error } = await completeWithJSON<YNFPRoutingResult>([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPromptContent },
    ], {
      temperature: 0.1, // Low temperature for consistent routing
      maxTokens: 256,
      model,
    });

    const timing = timer();

    if (!result || error) {
      logger.warn('Failed to parse routing result', { error, durationMs: timing.durationMs });
      return {
        targetService: 'none',
        confidence: 0,
        reasoning: 'Failed to determine routing',
      };
    }

    logger.info('Routing complete', {
      targetService: result.targetService,
      confidence: result.confidence,
      durationMs: timing.durationMs,
    });

    return result;
  } catch (error) {
    logger.error('Routing error', error);
    return {
      targetService: 'none',
      confidence: 0,
      reasoning: 'Routing failed due to an error',
    };
  }
}

// ============================================================================
// Service Invocation
// ============================================================================

export interface InvokeServiceOptions {
  serviceId: string;
  action: string;
  params: Record<string, unknown>;
  auth: AuthContext;
}

export async function invokeService(options: InvokeServiceOptions): Promise<YWAIPInvokeResponse> {
  const { serviceId, action, params, auth } = options;
  const registry = getRegistry();
  const service = registry.get(serviceId);

  if (!service) {
    return {
      success: false,
      error: {
        code: 'SERVICE_NOT_FOUND',
        message: `Service ${serviceId} not found`,
      },
    };
  }

  if (!service.enabled) {
    return {
      success: false,
      error: {
        code: 'SERVICE_DISABLED',
        message: `Service ${serviceId} is currently disabled`,
      },
    };
  }

  const timer = startTimer();

  try {
    const invokeRequest: YWAIPInvokeRequest = {
      action,
      params,
      context: {
        userId: auth.userId,
        requestId: auth.requestId,
        scopes: auth.scopes,
      },
    };

    const response = await fetch(`${service.baseUrl}/api/v1/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Yukie-User-Id': auth.userId,
        'X-Yukie-Scopes': auth.scopes.join(','),
        'X-Yukie-Request-Id': auth.requestId || '',
      },
      body: JSON.stringify(invokeRequest),
    });

    const timing = timer();

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Service invocation failed', new Error(errorText), {
        serviceId,
        action,
        status: response.status,
        durationMs: timing.durationMs,
      });

      return {
        success: false,
        error: {
          code: 'INVOCATION_FAILED',
          message: `Service returned error: ${response.status}`,
          details: { body: errorText },
        },
      };
    }

    const result: YWAIPInvokeResponse = await response.json();

    logger.info('Service invocation complete', {
      serviceId,
      action,
      success: result.success,
      durationMs: timing.durationMs,
    });

    return result;
  } catch (error) {
    const timing = timer();
    logger.error('Service invocation error', error, {
      serviceId,
      action,
      durationMs: timing.durationMs,
    });

    return {
      success: false,
      error: {
        code: 'INVOCATION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// ============================================================================
// Response Formatting
// ============================================================================

export async function formatResponse(
  originalRequest: string,
  serviceResult: unknown,
  serviceName: string,
  model?: string
): Promise<string> {
  try {
    const client = getLLMClient();
    const prompt = buildResponseFormattingPrompt(originalRequest, serviceResult, serviceName);

    const result = await client.complete([
      { role: 'user', content: prompt },
    ], {
      temperature: 0.7,
      maxTokens: 512,
      model,
    });

    return result.content;
  } catch (error) {
    logger.warn('Failed to format response with LLM', {}, error);
    // Return a basic formatted response as fallback
    return `Here's the result from ${serviceName}: ${JSON.stringify(serviceResult)}`;
  }
}

// ============================================================================
// Fallback Response
// ============================================================================

export async function generateFallbackResponse(userMessage: string, model?: string): Promise<string> {
  try {
    const client = getLLMClient();
    const systemPrompt = buildFallbackPrompt();

    const result = await client.complete([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ], {
      temperature: 0.7,
      maxTokens: 512,
      model,
    });

    return result.content;
  } catch (error) {
    logger.error('Fallback response generation failed', error);
    return "I'm sorry, I'm having trouble processing your request right now. Please try again later.";
  }
}

// ============================================================================
// Full Chat Flow
// ============================================================================

export interface ChatFlowOptions {
  message: string;
  auth: AuthContext;
  conversationId?: string;
  model?: string;
}

export interface ChatFlowResult {
  response: string;
  serviceUsed?: string;
  actionInvoked?: string;
  routingConfidence?: number;
  routingDetails?: {
    targetService: string;
    confidence: number;
    reasoning: string;
  };
}

export async function processChatMessage(options: ChatFlowOptions): Promise<ChatFlowResult> {
  const { message, auth, model } = options;

  // Step 1: Route the message
  const routing = await routeMessage(message, model);

  // Step 2: Handle routing result
  if (routing.targetService === 'none' || routing.confidence < 0.5) {
    // No good service match - generate a fallback response
    const response = await generateFallbackResponse(message, model);
    return {
      response,
      routingConfidence: routing.confidence,
      routingDetails: {
        targetService: routing.targetService,
        confidence: routing.confidence,
        reasoning: routing.reasoning,
      },
    };
  }

  // Step 3: Get the service's actions to determine what to invoke
  const registry = getRegistry();
  const actionsResponse = await registry.fetchActions(routing.targetService);

  if (!actionsResponse) {
    const response = await generateFallbackResponse(message, model);
    return {
      response,
      routingConfidence: routing.confidence,
      routingDetails: {
        targetService: routing.targetService,
        confidence: routing.confidence,
        reasoning: routing.reasoning,
      },
    };
  }

  // Step 4: Use LLM to determine which action to invoke and with what params
  const actionSelection = await selectAction(message, actionsResponse.actions, model);

  if (!actionSelection) {
    const response = await generateFallbackResponse(message, model);
    return {
      response,
      routingConfidence: routing.confidence,
      routingDetails: {
        targetService: routing.targetService,
        confidence: routing.confidence,
        reasoning: routing.reasoning,
      },
    };
  }

  // Step 5: Invoke the service
  const invokeResult = await invokeService({
    serviceId: routing.targetService,
    action: actionSelection.function,
    params: actionSelection.params,
    auth,
  });

  // Step 6: Format the response
  let response: string;
  if (invokeResult.success) {
    response = await formatResponse(message, invokeResult.result, routing.targetService, model);
  } else {
    response = `I encountered an issue: ${invokeResult.error?.message || 'Unknown error'}. Please try again.`;
  }

  return {
    response,
    serviceUsed: routing.targetService,
    actionInvoked: actionSelection.function,
    routingConfidence: routing.confidence,
    routingDetails: {
      targetService: routing.targetService,
      confidence: routing.confidence,
      reasoning: routing.reasoning,
    },
  };
}

// ============================================================================
// Action Selection
// ============================================================================

interface ActionInfo {
  name: string;
  description: string;
  parameters: { name: string; type: string; required: boolean; description: string }[];
}

interface SelectedAction {
  function: string;
  params: Record<string, unknown>;
}

async function selectAction(
  userMessage: string,
  actions: ActionInfo[],
  model?: string
): Promise<SelectedAction | null> {
  const actionsDescription = actions
    .map((a) => {
      const paramsStr = a.parameters
        .map((p) => `${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description}`)
        .join('\n    ');
      return `- ${a.name}: ${a.description}\n  Parameters:\n    ${paramsStr}`;
    })
    .join('\n');

  const prompt = `You are a function selector. Given a user message and available actions, determine which action to call and with what parameters.

Available actions:
${actionsDescription}

User message: "${userMessage}"

Respond ONLY with valid JSON in this format:
{
  "function": "<action-name>",
  "params": { <parameter-values> }
}

Use reasonable defaults for optional parameters. For dates, use ISO format (YYYY-MM-DD). Today's date should be inferred as the current date.`;

  try {
    const { result, error } = await completeWithJSON<SelectedAction>([
      { role: 'user', content: prompt },
    ], {
      temperature: 0.1,
      maxTokens: 256,
      model,
    });

    if (!result || error) {
      logger.warn('Failed to select action', { error });
      return null;
    }

    return result;
  } catch (error) {
    logger.error('Action selection error', error);
    return null;
  }
}
