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
  if (!authStore.isAuthenticated) return;

  isLoading.value = true;
  error.value = null;

  try {
    const response = await getInbox();
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
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  background: var(--panel, #fff);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.12);
  max-height: 85vh;
  max-height: 85dvh;
  overflow: hidden;
  animation: panelSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes panelSlideIn {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@media (min-width: 981px) {
  .inbox-panel {
    border-radius: 0;
    box-shadow: none;
    max-height: none;
    height: auto;
    border-left: 1px solid var(--border, #e2e8f0);
    animation: none;
  }
}

.inbox-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  flex-shrink: 0;
}

@media (min-width: 600px) {
  .inbox-header {
    padding: 16px 20px;
  }
}

.inbox-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ink, #0f172a);
}

@media (min-width: 600px) {
  .inbox-header h2 {
    font-size: 18px;
  }
}

.header-actions {
  display: flex;
  gap: 8px;
}

.refresh-button {
  padding: 6px 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  background: #fff;
  color: var(--muted, #64748b);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

@media (min-width: 600px) {
  .refresh-button {
    padding: 6px 12px;
    font-size: 13px;
  }
}

.refresh-button:hover:not(:disabled) {
  background: #f1f5f9;
}

.refresh-button:active:not(:disabled) {
  transform: scale(0.96);
}

.refresh-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.close-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--muted, #64748b);
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-button:hover {
  background: #f1f5f9;
  color: var(--ink, #0f172a);
}

.close-button:active {
  transform: scale(0.94);
}

.inbox-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px;
  -webkit-overflow-scrolling: touch;
}

@media (min-width: 600px) {
  .inbox-content {
    padding: 16px;
  }
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  text-align: center;
  color: var(--muted, #64748b);
  padding: 20px;
}

.empty-icon {
  font-size: 36px;
  margin-bottom: 10px;
}

@media (min-width: 600px) {
  .empty-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }
}

.empty-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}

@media (min-width: 600px) {
  .empty-hint {
    font-size: 13px;
  }
}

.error-state button {
  margin-top: 12px;
  padding: 8px 14px;
  border: 1px solid #ef4444;
  border-radius: 8px;
  background: #fff;
  color: #ef4444;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s ease;
}

.error-state button:active {
  transform: scale(0.96);
}

.jobs-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

@media (min-width: 600px) {
  .jobs-list {
    gap: 12px;
  }
}

.job-card {
  padding: 12px;
  background: #f9fafb;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  transition: all 0.2s ease;
}

@media (min-width: 600px) {
  .job-card {
    padding: 14px;
  }
}

.job-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  gap: 8px;
}

@media (min-width: 600px) {
  .job-header {
    margin-bottom: 8px;
  }
}

.job-service {
  font-weight: 600;
  color: #333;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (min-width: 600px) {
  .job-service {
    font-size: 14px;
  }
}

.job-status {
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

@media (min-width: 600px) {
  .job-status {
    font-size: 11px;
  }
}

.status-pending {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  color: #92400e;
}

.status-completed {
  background: linear-gradient(135deg, #d1fae5, #a7f3d0);
  color: #065f46;
}

.status-failed {
  background: linear-gradient(135deg, #fee2e2, #fecaca);
  color: #991b1b;
}

.job-action {
  color: #666;
  font-size: 12px;
  margin-bottom: 4px;
  word-break: break-word;
}

@media (min-width: 600px) {
  .job-action {
    font-size: 13px;
  }
}

.job-date {
  color: #999;
  font-size: 11px;
}

@media (min-width: 600px) {
  .job-date {
    font-size: 12px;
  }
}

.job-result {
  margin-top: 10px;
  padding: 10px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}

.job-result pre {
  margin: 0;
  font-size: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  max-width: 100%;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  line-height: 1.4;
}

@media (min-width: 600px) {
  .job-result pre {
    font-size: 11px;
  }
}

.job-error {
  margin-top: 10px;
  padding: 10px;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  border-radius: 8px;
  color: #dc2626;
  font-size: 12px;
  word-break: break-word;
}

@media (min-width: 600px) {
  .job-error {
    font-size: 13px;
  }
}
</style>
