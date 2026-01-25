import type { YWAIPServiceMeta } from '../../../../shared/protocol/src/types';

// ============================================================================
// Service Metadata
// ============================================================================

export function getServiceMeta(): YWAIPServiceMeta {
  return {
    service: 'habit-tracker',
    version: '1.0.0',
    protocol: 'ywaip',
    protocolVersion: '1.0',
    description: 'Track daily habits like waking up early, exercise, reading, and meditation. Supports check-ins, streaks, and statistics.',
    capabilities: [
      'habit-checkin',
      'habit-query',
      'habit-stats',
      'streak-tracking',
      'monthly-statistics',
    ],
    scopes: ['habit:read', 'habit:write', 'habit:delete'],
  };
}
