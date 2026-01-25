import type { YWAIPAction, YWAIPActionsResponse } from '../../../../shared/protocol/src/types';

// ============================================================================
// Available Actions
// ============================================================================

const actions: YWAIPAction[] = [
  {
    name: 'habit.checkin',
    description: 'Record a daily habit check-in. Mark whether the habit was completed for a specific date.',
    parameters: [
      {
        name: 'date',
        type: 'string',
        required: false,
        description: 'Date for the check-in in YYYY-MM-DD format. Defaults to today.',
      },
      {
        name: 'checked',
        type: 'boolean',
        required: false,
        description: 'Whether the habit was completed. Defaults to true.',
        default: true,
      },
      {
        name: 'note',
        type: 'string',
        required: false,
        description: 'Optional note or comment for this check-in.',
      },
      {
        name: 'wakeTime',
        type: 'string',
        required: false,
        description: 'For early wake-up habit, the time woken up (HH:MM format).',
      },
    ],
    requiredScopes: ['habit:write'],
    returnsAsync: false,
  },
  {
    name: 'habit.query',
    description: 'Query habit records for a specific date range. Returns check-in history.',
    parameters: [
      {
        name: 'from',
        type: 'string',
        required: false,
        description: 'Start date in YYYY-MM-DD format. Defaults to 7 days ago.',
      },
      {
        name: 'to',
        type: 'string',
        required: false,
        description: 'End date in YYYY-MM-DD format. Defaults to today.',
      },
      {
        name: 'date',
        type: 'string',
        required: false,
        description: 'Query a specific date (alternative to from/to range).',
      },
    ],
    requiredScopes: ['habit:read'],
    returnsAsync: false,
  },
  {
    name: 'habit.stats',
    description: 'Get habit statistics including current streak, longest streak, and monthly summary.',
    parameters: [
      {
        name: 'month',
        type: 'string',
        required: false,
        description: 'Month to get stats for in YYYY-MM format. Defaults to current month.',
      },
      {
        name: 'includeStreak',
        type: 'boolean',
        required: false,
        description: 'Include current streak information. Defaults to true.',
        default: true,
      },
    ],
    requiredScopes: ['habit:read'],
    returnsAsync: false,
  },
  {
    name: 'habit.delete',
    description: 'Delete a habit check-in record for a specific date.',
    parameters: [
      {
        name: 'date',
        type: 'string',
        required: true,
        description: 'Date of the record to delete in YYYY-MM-DD format.',
      },
    ],
    requiredScopes: ['habit:delete'],
    returnsAsync: false,
  },
];

export function getActions(): YWAIPActionsResponse {
  return { actions };
}

export function getAction(name: string): YWAIPAction | undefined {
  return actions.find((a) => a.name === name);
}

export function getActionNames(): string[] {
  return actions.map((a) => a.name);
}
