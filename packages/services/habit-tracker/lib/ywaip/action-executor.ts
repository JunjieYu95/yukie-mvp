import type { YWAIPInvokeRequest, YWAIPInvokeResponse, YWAIPContext } from '../../../../shared/protocol/src/types';
import { getAction } from './actions';
import { requireScopes } from '../../../../shared/auth/src/auth';
import { createLogger } from '../../../../shared/observability/src/logger';

const logger = createLogger('habit-action-executor');

// ============================================================================
// External API Client (Connects to deployed early-wakeup-habit app)
// ============================================================================

const EARLY_WAKEUP_API_URL = process.env.EARLY_WAKEUP_API_URL || 'https://early-wakeup-habit.vercel.app';

interface ExternalRecord {
  date: string;
  checked: number; // 0 or 1
  imageUrl?: string | null;
  imagePublicId?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExternalRecordsResponse {
  records: ExternalRecord[];
}

interface ExternalRecordResponse {
  record: ExternalRecord | null;
}

async function fetchRecords(from?: string, to?: string): Promise<ExternalRecord[]> {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);

  const url = `${EARLY_WAKEUP_API_URL}/api/records${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch habit records from ${EARLY_WAKEUP_API_URL}: HTTP ${response.status} ${response.statusText}. The habit tracking service may be temporarily unavailable.`);
  }

  const data = (await response.json()) as ExternalRecordsResponse;
  return data.records || [];
}

async function fetchRecord(date: string): Promise<ExternalRecord | null> {
  const url = `${EARLY_WAKEUP_API_URL}/api/records/${date}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to fetch habit record for date '${date}' from ${EARLY_WAKEUP_API_URL}: HTTP ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as ExternalRecordResponse;
  return data.record || null;
}

async function createOrUpdateRecord(date: string, checked: boolean, note?: string): Promise<void> {
  const url = `${EARLY_WAKEUP_API_URL}/api/records`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date,
      checked,
      note: note || null,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to save habit record for date '${date}' to ${EARLY_WAKEUP_API_URL}: HTTP ${response.status} ${response.statusText}`);
  }
}

async function updateRecord(date: string, checked?: boolean, note?: string): Promise<void> {
  const url = `${EARLY_WAKEUP_API_URL}/api/records/${date}`;
  const body: Record<string, unknown> = {};
  if (checked !== undefined) body.checked = checked;
  if (note !== undefined) body.note = note || null;

  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to update habit record for date '${date}' at ${EARLY_WAKEUP_API_URL}: HTTP ${response.status} ${response.statusText}`);
  }
}

async function deleteRecord(date: string): Promise<void> {
  const url = `${EARLY_WAKEUP_API_URL}/api/records/${date}`;
  const response = await fetch(url, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete habit record for date '${date}' at ${EARLY_WAKEUP_API_URL}: HTTP ${response.status} ${response.statusText}`);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function generateId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleCheckin(
  params: Record<string, unknown>,
  context: YWAIPContext
): Promise<YWAIPInvokeResponse> {
  const userId = context.userId!;
  const date = (params.date as string) || getTodayDate();
  const checked = params.checked !== false;
  const note = params.note as string | undefined;
  const wakeTime = params.wakeTime as string | undefined;

  // Combine note and wakeTime if both provided
  const fullNote = wakeTime ? (note ? `${note} (Woke up at ${wakeTime})` : `Woke up at ${wakeTime}`) : note;

  try {
    await createOrUpdateRecord(date, checked, fullNote);

    logger.info('Habit check-in recorded', { userId, date, checked, apiUrl: EARLY_WAKEUP_API_URL });

    return {
      success: true,
      result: {
        message: checked
          ? `Check-in recorded for ${date}. Great job!`
          : `Marked as not completed for ${date}.`,
        record: {
          date,
          checked,
          note: fullNote,
          wakeTime,
        },
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to record check-in', error, { userId, date, apiUrl: EARLY_WAKEUP_API_URL });
    return {
      success: false,
      error: {
        code: 'CHECKIN_FAILED',
        message: `Failed to record habit check-in for ${date}: ${errorMsg}`,
      },
    };
  }
}

async function handleQuery(
  params: Record<string, unknown>,
  context: YWAIPContext
): Promise<YWAIPInvokeResponse> {
  const userId = context.userId!;

  try {
    // Handle single date query
    if (params.date) {
      const date = params.date as string;
      const record = await fetchRecord(date);

      return {
        success: true,
        result: {
          date,
          found: !!record,
          record: record
            ? {
                date: record.date,
                checked: record.checked === 1,
                note: record.note || undefined,
              }
            : null,
        },
      };
    }

    // Handle date range query
    const from = (params.from as string) || getDateDaysAgo(7);
    const to = (params.to as string) || getTodayDate();

    const externalRecords = await fetchRecords(from, to);

    const records = externalRecords.map((r) => ({
      date: r.date,
      checked: r.checked === 1,
      note: r.note || undefined,
    }));

    logger.info('Records fetched', { userId, from, to, count: records.length, apiUrl: EARLY_WAKEUP_API_URL });

    return {
      success: true,
      result: {
        from,
        to,
        count: records.length,
        records,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to query records', error, { userId, apiUrl: EARLY_WAKEUP_API_URL });
    return {
      success: false,
      error: {
        code: 'QUERY_FAILED',
        message: `Failed to query habit records: ${errorMsg}`,
      },
    };
  }
}

async function handleStats(
  params: Record<string, unknown>,
  context: YWAIPContext
): Promise<YWAIPInvokeResponse> {
  const userId = context.userId!;
  const month = (params.month as string) || getCurrentMonth();
  const includeStreak = params.includeStreak !== false;

  try {
    // Fetch all records for the month (and a bit before for streak calculation)
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-31`;
    const fromDate = includeStreak ? getDateDaysAgo(60) : monthStart; // Get more data for streak calc
    const toDate = includeStreak ? getTodayDate() : monthEnd;

    const externalRecords = await fetchRecords(fromDate, toDate);

    // Convert to internal format
    const allRecords = externalRecords
      .map((r) => ({
        date: r.date,
        checked: r.checked === 1,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    logger.info('Calculating stats', {
      userId,
      month,
      totalRecords: allRecords.length,
      apiUrl: EARLY_WAKEUP_API_URL,
    });

    // Calculate monthly stats
    const monthRecords = allRecords.filter((r) => r.date.startsWith(month));
    const completedDays = monthRecords.filter((r) => r.checked).length;
    const totalDays = monthRecords.length;

    // Calculate current streak
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    if (includeStreak) {
      // Sort by date descending for current streak
      const sortedRecords = [...allRecords].sort((a, b) => b.date.localeCompare(a.date));

      // Calculate current streak (consecutive days from today going backwards)
      const today = getTodayDate();
      let expectedDate = today;

      for (const record of sortedRecords) {
        if (record.date === expectedDate && record.checked) {
          currentStreak++;
          // Move to previous day
          const prevDate = new Date(expectedDate);
          prevDate.setDate(prevDate.getDate() - 1);
          expectedDate = prevDate.toISOString().split('T')[0];
        } else if (record.date < expectedDate) {
          break;
        }
      }

      // Calculate longest streak
      for (const record of allRecords) {
        if (record.checked) {
          tempStreak++;
          longestStreak = Math.max(longestStreak, tempStreak);
        } else {
          tempStreak = 0;
        }
      }
    }

    const completionRate = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

    return {
      success: true,
      result: {
        month,
        stats: {
          completedDays,
          totalDays,
          completionRate: `${completionRate}%`,
          ...(includeStreak && {
            currentStreak,
            longestStreak,
          }),
        },
        summary:
          currentStreak > 0
            ? `You're on a ${currentStreak}-day streak! This month: ${completedDays}/${totalDays} days (${completionRate}%).`
            : `This month: ${completedDays}/${totalDays} days (${completionRate}%). Start your streak today!`,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to calculate stats', error, { userId, month, apiUrl: EARLY_WAKEUP_API_URL });
    return {
      success: false,
      error: {
        code: 'STATS_FAILED',
        message: `Failed to calculate habit statistics for ${month}: ${errorMsg}`,
      },
    };
  }
}

async function handleDelete(
  params: Record<string, unknown>,
  context: YWAIPContext
): Promise<YWAIPInvokeResponse> {
  const userId = context.userId!;
  const date = params.date as string;

  if (!date) {
    return {
      success: false,
      error: {
        code: 'MISSING_PARAM',
        message: 'date parameter is required',
      },
    };
  }

  try {
    // Check if record exists first
    const record = await fetchRecord(date);
    if (!record) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `No record found for ${date}`,
        },
      };
    }

    await deleteRecord(date);
    logger.info('Habit record deleted', { userId, date, apiUrl: EARLY_WAKEUP_API_URL });

    return {
      success: true,
      result: {
        message: `Record for ${date} has been deleted.`,
        date,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to delete record', error, { userId, date, apiUrl: EARLY_WAKEUP_API_URL });
    return {
      success: false,
      error: {
        code: 'DELETE_FAILED',
        message: `Failed to delete habit record for ${date}: ${errorMsg}`,
      },
    };
  }
}

// ============================================================================
// Action Executor
// ============================================================================

const actionHandlers: Record<
  string,
  (params: Record<string, unknown>, context: YWAIPContext) => Promise<YWAIPInvokeResponse>
> = {
  'habit.checkin': handleCheckin,
  'habit.query': handleQuery,
  'habit.stats': handleStats,
  'habit.delete': handleDelete,
};

export async function executeAction(request: YWAIPInvokeRequest): Promise<YWAIPInvokeResponse> {
  const { action, params, context } = request;

  // Validate action exists
  const actionDef = getAction(action);
  if (!actionDef) {
    const availableActions = Object.keys(actionHandlers).join(', ');
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ACTION',
        message: `Unknown action '${action}' on habit tracker service. Available actions: [${availableActions}]`,
      },
    };
  }

  // Validate context
  if (!context?.userId) {
    return {
      success: false,
      error: {
        code: 'MISSING_CONTEXT',
        message: 'userId is required in context',
      },
    };
  }

  // Validate scopes
  if (context.scopes) {
    const scopeCheck = requireScopes(context.scopes, actionDef.requiredScopes);
    if (!scopeCheck.authorized) {
      return {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Insufficient permissions for action '${action}'. Required scopes: [${actionDef.requiredScopes.join(', ')}]. Missing: [${scopeCheck.missingScopes?.join(', ') || ''}]`,
          details: { missingScopes: scopeCheck.missingScopes },
        },
      };
    }
  }

  // Execute action
  const handler = actionHandlers[action];
  if (!handler) {
    const availableActions = Object.keys(actionHandlers).join(', ');
    return {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: `Action '${action}' is defined but has no handler implementation. Available handlers: [${availableActions}]`,
      },
    };
  }

  try {
    return await handler(params, context);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Action execution error', error, { action, userId: context.userId });
    return {
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: `Unexpected error executing action '${action}': ${errorMsg}`,
      },
    };
  }
}
