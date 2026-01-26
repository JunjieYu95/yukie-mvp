<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { getInbox, type InboxJob } from '../lib/api';

const emit = defineEmits<{
  close: [];
}>();

const authStore = useAuthStore();

const jobs = ref<InboxJob[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  await loadInbox();
});

async function loadInbox() {
  if (!authStore.token) return;

  isLoading.value = true;
  error.value = null;

  try {
    const response = await getInbox(authStore.token);
    jobs.value = response.jobs;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load inbox';
  } finally {
    isLoading.value = false;
  }
}

function getStatusClass(status: string) {
  switch (status) {
    case 'completed':
      return 'status-completed';
    case 'failed':
      return 'status-failed';
    default:
      return 'status-pending';
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<template>
  <div class="inbox-panel">
    <div class="inbox-header">
      <h2>Inbox</h2>
      <div class="header-actions">
        <button class="refresh-button" @click="loadInbox" :disabled="isLoading">
          Refresh
        </button>
        <button class="close-button" @click="emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>

    <div class="inbox-content">
      <div v-if="isLoading && jobs.length === 0" class="loading-state">
        Loading...
      </div>

      <div v-else-if="error" class="error-state">
        {{ error }}
        <button @click="loadInbox">Retry</button>
      </div>

      <div v-else-if="jobs.length === 0" class="empty-state">
        <div class="empty-icon">📥</div>
        <p>No jobs in your inbox</p>
        <span class="empty-hint">Async operations will appear here</span>
      </div>

      <div v-else class="jobs-list">
        <div
          v-for="job in jobs"
          :key="job.id"
          class="job-card"
        >
          <div class="job-header">
            <span class="job-service">{{ job.service }}</span>
            <span class="job-status" :class="getStatusClass(job.status)">
              {{ job.status }}
            </span>
          </div>
          <div class="job-action">{{ job.action }}</div>
          <div class="job-date">{{ formatDate(job.createdAt) }}</div>

          <div v-if="job.status === 'completed' && job.response" class="job-result">
            <pre>{{ JSON.stringify(job.response, null, 2) }}</pre>
          </div>

          <div v-if="job.status === 'failed' && job.error" class="job-error">
            {{ job.error }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inbox-panel {
  width: 360px;
  display: flex;
  flex-direction: column;
  background: var(--panel, #fff);
  border-left: 1px solid var(--border, #e2e8f0);
}

.inbox-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.inbox-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ink, #0f172a);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.refresh-button {
  padding: 6px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  background: #fff;
  color: var(--muted, #64748b);
  font-size: 13px;
  cursor: pointer;
}

.refresh-button:hover:not(:disabled) {
  background: #f1f5f9;
}

.refresh-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.close-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted, #64748b);
  cursor: pointer;
}

.close-button:hover {
  background: #f1f5f9;
  color: var(--ink, #0f172a);
}

.inbox-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  text-align: center;
  color: var(--muted, #64748b);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.empty-hint {
  font-size: 13px;
  color: #94a3b8;
  margin-top: 4px;
}

.error-state button {
  margin-top: 12px;
  padding: 8px 16px;
  border: 1px solid #ef4444;
  border-radius: 6px;
  background: #fff;
  color: #ef4444;
  cursor: pointer;
}

.jobs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.job-card {
  padding: 14px;
  background: #f9fafb;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
}

.job-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.job-service {
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.job-status {
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
}

.status-pending {
  background: #fef3c7;
  color: #92400e;
}

.status-completed {
  background: #d1fae5;
  color: #065f46;
}

.status-failed {
  background: #fee2e2;
  color: #991b1b;
}

.job-action {
  color: #666;
  font-size: 13px;
  margin-bottom: 4px;
}

.job-date {
  color: #999;
  font-size: 12px;
}

.job-result {
  margin-top: 10px;
  padding: 10px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.job-result pre {
  margin: 0;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
}

.job-error {
  margin-top: 10px;
  padding: 10px;
  background: #fef2f2;
  border-radius: 6px;
  color: #dc2626;
  font-size: 13px;
}
</style>
