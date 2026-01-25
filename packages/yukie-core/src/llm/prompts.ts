import type { ServiceRegistryEntry } from '../../../shared/protocol/src/types';

// ============================================================================
// Candidate Tool Type (for retrieval-based routing)
// ============================================================================

interface CandidateTool {
  serviceId: string;
  serviceName: string;
  serviceDescription: string;
  matchScore: number;
}

// ============================================================================
// Routing Prompt (Original - for backward compatibility)
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
// Candidate-Based Routing Prompt (for retrieval-based routing)
// ============================================================================

export function buildCandidateRoutingPrompt(candidates: CandidateTool[]): string {
  const candidateDescriptions = candidates
    .map(
      (c, i) =>
        `${i + 1}. ${c.serviceId}: ${c.serviceName}\n   Description: ${c.serviceDescription}\n   Match Score: ${c.matchScore.toFixed(2)}`
    )
    .join('\n\n');

  return `You are Yukie, an intelligent assistant router. Your job is to select the best service to handle a user's request from a pre-filtered list of candidates.

The candidates have been pre-selected based on keyword matching. You need to make the final decision.

Available candidate services:
${candidateDescriptions}

Rules:
1. Select the service that best matches the user's intent
2. If no service is a good match, respond with targetService: "none"
3. Provide a confidence score from 0.0 to 1.0
4. Give brief reasoning for your choice

Respond ONLY with valid JSON in this exact format:
{
  "targetService": "<service-id or 'none'>",
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation>"
}`;
}

export function buildCandidateRoutingUserMessage(userMessage: string): string {
  return `User request: "${userMessage}"

Select the best service from the candidates. Respond with JSON only.`;
}

// ============================================================================
// Multi-Tool Routing Prompt (for multi-service orchestration)
// ============================================================================

export function buildMultiToolRoutingPrompt(candidates: CandidateTool[]): string {
  const candidateDescriptions = candidates
    .map((c, i) => `${i + 1}. ${c.serviceId}: ${c.serviceName} - ${c.serviceDescription}`)
    .join('\n');

  return `You are Yukie, an intelligent assistant router. Your job is to determine which services should handle a user's request.

The user's request may require one or multiple services. Analyze the request and determine:
1. Which services are needed (can be one or more)
2. Whether they should be called in parallel or sequentially
3. Your confidence level

Available services:
${candidateDescriptions}

Respond ONLY with valid JSON in this exact format:
{
  "services": [
    { "serviceId": "<service-id>", "purpose": "<what this service will do>" }
  ],
  "executionMode": "parallel" | "sequential",
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation>"
}

If no services match, respond with an empty services array.`;
}

export function buildMultiToolRoutingUserMessage(userMessage: string): string {
  return `User request: "${userMessage}"

Determine which services are needed and how they should be executed. Respond with JSON only.`;
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
