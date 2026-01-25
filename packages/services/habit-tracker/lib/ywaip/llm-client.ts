import { getLLMClient, completeWithJSON } from '../../../../yukie-core/src/llm/client';
import { buildHabitAssistantSystemPrompt, buildNaturalLanguageParserPrompt } from './prompts';
import { createLogger } from '../../../../shared/observability/src/logger';

const logger = createLogger('habit-llm-client');

// ============================================================================
// Types
// ============================================================================

export interface ParsedIntent {
  function: string;
  params: Record<string, unknown>;
}

// ============================================================================
// Natural Language Processing
// ============================================================================

export async function parseUserIntent(utterance: string): Promise<ParsedIntent | null> {
  try {
    const systemPrompt = buildHabitAssistantSystemPrompt();
    const userPrompt = buildNaturalLanguageParserPrompt(utterance);

    const { result, error } = await completeWithJSON<ParsedIntent>([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      temperature: 0.1, // Low temperature for consistent parsing
      maxTokens: 256,
    });

    if (!result || error) {
      logger.warn('Failed to parse user intent', { utterance, error });
      return null;
    }

    logger.debug('Parsed user intent', { utterance, function: result.function });
    return result;
  } catch (error) {
    logger.error('Error parsing user intent', error, { utterance });
    return null;
  }
}

// ============================================================================
// Response Generation
// ============================================================================

export async function generateNaturalResponse(
  originalUtterance: string,
  actionResult: unknown,
  actionName: string
): Promise<string> {
  try {
    const client = getLLMClient();

    const prompt = `You are a friendly habit tracking assistant. The user asked: "${originalUtterance}"

You performed the action "${actionName}" and got this result:
${JSON.stringify(actionResult, null, 2)}

Generate a natural, conversational response for the user. Be encouraging and supportive.
Keep it concise (1-2 sentences). Don't use technical jargon.`;

    const result = await client.complete([
      { role: 'user', content: prompt },
    ], {
      temperature: 0.7,
      maxTokens: 150,
    });

    return result.content;
  } catch (error) {
    logger.error('Error generating natural response', error);
    // Return a generic response based on the action
    return getDefaultResponse(actionName, actionResult);
  }
}

function getDefaultResponse(actionName: string, result: unknown): string {
  const data = result as Record<string, unknown>;

  switch (actionName) {
    case 'habit.checkin':
      return data.message as string || 'Check-in recorded!';
    case 'habit.query':
      return `Found ${(data.count as number) || 0} records.`;
    case 'habit.stats':
      return data.summary as string || 'Stats retrieved.';
    case 'habit.delete':
      return data.message as string || 'Record deleted.';
    default:
      return 'Done!';
  }
}
