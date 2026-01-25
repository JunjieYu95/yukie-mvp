import { getActions } from './actions';

// ============================================================================
// Domain LLM Prompts for Habit Tracker
// ============================================================================

export function buildHabitAssistantSystemPrompt(): string {
  const actionsResponse = getActions();
  const actionsDescription = actionsResponse.actions
    .map((a) => {
      const paramsStr = a.parameters
        .map((p) => `    - ${p.name} (${p.type}${p.required ? ', required' : ', optional'}): ${p.description}`)
        .join('\n');
      return `${a.name}: ${a.description}\n  Parameters:\n${paramsStr}`;
    })
    .join('\n\n');

  return `You are a helpful habit tracking assistant. You help users track their daily habits, especially early wake-up habits.

You have access to the following actions:

${actionsDescription}

When the user asks about their habits, determine which action to call and with what parameters.
Always respond with a JSON object in this exact format:

{
  "function": "<action-name>",
  "params": { <parameter-values> }
}

Guidelines:
- For check-ins without a specific date, use today's date (omit the date parameter)
- For queries about "yesterday" or "last week", calculate the appropriate date range
- For "did I..." questions, use habit.query with the relevant date
- For streak or stats questions, use habit.stats
- If the user just wants to "check in" or "mark complete", use habit.checkin with checked=true
- If the user says they missed a day or didn't do it, use habit.checkin with checked=false

Today's date is: ${new Date().toISOString().split('T')[0]}`;
}

export function buildNaturalLanguageParserPrompt(utterance: string): string {
  return `User said: "${utterance}"

Based on this, determine the appropriate action and parameters. Respond with JSON only.`;
}

// ============================================================================
// Response Templates
// ============================================================================

export function formatCheckinResponse(result: { checked: boolean; date: string; note?: string }): string {
  if (result.checked) {
    return `Great job! I've recorded your check-in for ${result.date}. Keep up the good work!`;
  }
  return `I've noted that ${result.date} was missed. Don't worry, tomorrow is a new opportunity!`;
}

export function formatQueryResponse(result: { records: Array<{ date: string; checked: boolean }> }): string {
  if (result.records.length === 0) {
    return "I don't have any records for that period.";
  }

  const completed = result.records.filter((r) => r.checked).length;
  const total = result.records.length;

  return `Found ${total} record(s): ${completed} completed, ${total - completed} missed.`;
}

export function formatStatsResponse(result: {
  stats: { currentStreak: number; completedDays: number; totalDays: number };
  summary: string;
}): string {
  return result.summary;
}

// ============================================================================
// Error Messages
// ============================================================================

export const errorMessages = {
  unknownAction: "I'm not sure how to help with that. Try asking about check-ins, your streak, or your habit history.",
  parseError: "I had trouble understanding that. Could you rephrase your request?",
  executionError: "Something went wrong while processing your request. Please try again.",
  authError: "You don't have permission to perform this action.",
};
