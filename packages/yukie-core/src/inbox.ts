import type { InboxJob, InboxListResponse } from '../../shared/protocol/src/types';
import { createLogger } from '../../shared/observability/src/logger';

const logger = createLogger('inbox');

// ============================================================================
// In-Memory Inbox Store (Replace with Turso for production)
// ============================================================================

const inboxStore = new Map<string, InboxJob>();

function generateId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// Inbox Operations
// ============================================================================

export interface CreateJobOptions {
  userId: string;
  conversationId?: string;
  service: string;
  action: string;
  request: Record<string, unknown>;
}

export function createJob(options: CreateJobOptions): InboxJob {
  const now = new Date().toISOString();
  const job: InboxJob = {
    id: generateId(),
    userId: options.userId,
    conversationId: options.conversationId,
    service: options.service,
    action: options.action,
    status: 'pending',
    request: options.request,
    createdAt: now,
    updatedAt: now,
  };

  inboxStore.set(job.id, job);
  logger.info('Job created', { jobId: job.id, service: job.service, action: job.action });

  return job;
}

export function getJob(jobId: string): InboxJob | undefined {
  return inboxStore.get(jobId);
}

export function getJobsByUser(userId: string, limit: number = 50, offset: number = 0): InboxListResponse {
  const userJobs = Array.from(inboxStore.values())
    .filter((job) => job.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = userJobs.length;
  const paginatedJobs = userJobs.slice(offset, offset + limit);

  return {
    jobs: paginatedJobs,
    total,
    hasMore: offset + limit < total,
  };
}

export function getPendingJobs(userId?: string): InboxJob[] {
  let jobs = Array.from(inboxStore.values()).filter((job) => job.status === 'pending');

  if (userId) {
    jobs = jobs.filter((job) => job.userId === userId);
  }

  return jobs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export interface UpdateJobOptions {
  status?: 'pending' | 'completed' | 'failed';
  response?: Record<string, unknown>;
  error?: string;
}

export function updateJob(jobId: string, updates: UpdateJobOptions): InboxJob | undefined {
  const job = inboxStore.get(jobId);
  if (!job) {
    return undefined;
  }

  const updatedJob: InboxJob = {
    ...job,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  inboxStore.set(jobId, updatedJob);
  logger.info('Job updated', { jobId, status: updatedJob.status });

  return updatedJob;
}

export function completeJob(jobId: string, response: Record<string, unknown>): InboxJob | undefined {
  return updateJob(jobId, {
    status: 'completed',
    response,
  });
}

export function failJob(jobId: string, error: string): InboxJob | undefined {
  return updateJob(jobId, {
    status: 'failed',
    error,
  });
}

export function deleteJob(jobId: string): boolean {
  const deleted = inboxStore.delete(jobId);
  if (deleted) {
    logger.info('Job deleted', { jobId });
  }
  return deleted;
}

// Delete jobs older than specified age
export function cleanupOldJobs(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  let deletedCount = 0;

  for (const [jobId, job] of inboxStore.entries()) {
    const jobTime = new Date(job.createdAt).getTime();
    if (jobTime < cutoff && job.status !== 'pending') {
      inboxStore.delete(jobId);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    logger.info('Old jobs cleaned up', { deletedCount });
  }

  return deletedCount;
}

// ============================================================================
// Job Processing (for async operations)
// ============================================================================

export type JobProcessor = (job: InboxJob) => Promise<{
  success: boolean;
  response?: Record<string, unknown>;
  error?: string;
}>;

const jobProcessors = new Map<string, JobProcessor>();

export function registerJobProcessor(service: string, processor: JobProcessor): void {
  jobProcessors.set(service, processor);
  logger.info('Job processor registered', { service });
}

export async function processJob(jobId: string): Promise<boolean> {
  const job = getJob(jobId);
  if (!job) {
    logger.warn('Job not found for processing', { jobId });
    return false;
  }

  if (job.status !== 'pending') {
    logger.warn('Job is not pending', { jobId, status: job.status });
    return false;
  }

  const processor = jobProcessors.get(job.service);
  if (!processor) {
    failJob(jobId, `No processor registered for service: ${job.service}`);
    return false;
  }

  try {
    const result = await processor(job);

    if (result.success) {
      completeJob(jobId, result.response || {});
    } else {
      failJob(jobId, result.error || 'Processing failed');
    }

    return result.success;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    failJob(jobId, errorMessage);
    logger.error('Job processing error', error, { jobId });
    return false;
  }
}

// Process all pending jobs for a service
export async function processPendingJobs(service?: string): Promise<number> {
  const pendingJobs = getPendingJobs().filter((job) => !service || job.service === service);

  let processedCount = 0;

  for (const job of pendingJobs) {
    const success = await processJob(job.id);
    if (success) {
      processedCount++;
    }
  }

  return processedCount;
}

// ============================================================================
// Cleanup Interval
// ============================================================================

let cleanupInterval: NodeJS.Timeout | null = null;

export function startInboxCleanup(intervalMs: number = 3600000): void {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(() => cleanupOldJobs(), intervalMs);
  }
}

export function stopInboxCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// ============================================================================
// Statistics
// ============================================================================

export interface InboxStats {
  total: number;
  pending: number;
  completed: number;
  failed: number;
}

export function getInboxStats(userId?: string): InboxStats {
  let jobs = Array.from(inboxStore.values());

  if (userId) {
    jobs = jobs.filter((job) => job.userId === userId);
  }

  return {
    total: jobs.length,
    pending: jobs.filter((j) => j.status === 'pending').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };
}
