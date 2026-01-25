import type { ServiceRegistryEntry } from '../../../shared/protocol/src/types';

// ============================================================================
// Routing Prompt
// ============================================================================

export function buildRoutingPrompt(services: ServiceRegistryEntry[]): string {
  const serviceDescriptions = services
    .filter((s) => s.enabled)
    .map((s) => `- ${s.id}: ${s.description} (capabilities: ${s.capabilities.join(', ')})`)
    .join('\n');

  return `You are Yukie, an intelligent assistant router. Your job is to determine which service should handle a user's request.

Available services:
${serviceDescriptions}

Analyze the user's message and determine:
1. Which service is best suited to handle this request
2. Your confidence level (0.0 to 1.0)
3. Brief reasoning for your choice

If no service matches, respond with targetService: "none".

Respond ONLY with valid JSON in this exact format:
{
  "targetService": "<service-id>",
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation>"
}`;
}

export function buildRoutingUserMessage(userMessage: string): string {
  return `User request: "${userMessage}"

Determine which service should handle this request. Respond with JSON only.`;
}

// ============================================================================
// Fallback Response Prompt
// ============================================================================

export function buildFallbackPrompt(): string {
  return `You are Yukie, a helpful AI assistant. The user's request doesn't match any specific service capability.

Respond naturally and helpfully. If the request is about something you can help with through general knowledge, do so.
If it's about a capability you don't have, politely explain what you can help with instead.

Keep responses concise and friendly.`;
}

// ============================================================================
// Response Formatting Prompt
// ============================================================================

export function buildResponseFormattingPrompt(
  originalRequest: string,
  serviceResult: unknown,
  serviceName: string
): string {
  return `You are Yukie, an intelligent assistant. You received a response from the ${serviceName} service for the user's request.

User's original request: "${originalRequest}"

Service response data:
${JSON.stringify(serviceResult, null, 2)}

Format this response in a natural, conversational way for the user. Be concise but informative.
If there was an error, explain it helpfully without technical jargon.`;
}

// ============================================================================
// Conversation Summary Prompt (for context management)
// ============================================================================

export function buildConversationSummaryPrompt(messages: { role: string; content: string }[]): string {
  const conversation = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  return `Summarize this conversation in 2-3 sentences, capturing the key topics and any important context that should be preserved:

${conversation}`;
}
