<script setup lang="ts">
import { computed } from 'vue';
import type { Message } from '../stores/chat';

const props = defineProps<{
  message: Message;
}>();

const isUser = computed(() => props.message.role === 'user');
const isSystem = computed(() => props.message.role === 'system');

const timeString = computed(() => {
  const date = new Date(props.message.timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});

const serviceDisplayName = computed(() => {
  if (!props.message.serviceUsed) return null;
  // Convert service ID to display name
  const names: Record<string, string> = {
    'habit-tracker': 'Habit Tracker',
  };
  return names[props.message.serviceUsed] || props.message.serviceUsed;
});

const actionDisplayName = computed(() => {
  if (!props.message.actionInvoked) return null;
  // Convert action name to display name
  return props.message.actionInvoked.replace('habit.', '').replace(/\./g, ' ');
});
</script>

<template>
  <div
    class="message-bubble"
    :class="{
      'user-message': isUser,
      'assistant-message': !isUser && !isSystem,
      'system-message': isSystem,
      'error': message.status === 'error',
      'sending': message.status === 'sending',
    }"
  >
    <div class="message-content">
      {{ message.content }}
    </div>

    <div class="message-meta">
      <span class="message-time">{{ timeString }}</span>
      <span v-if="message.status === 'sending'" class="status-sending">
        Sending...
      </span>
      <span v-if="message.status === 'error'" class="status-error">
        Failed to send
      </span>
      <template v-if="serviceDisplayName || actionDisplayName">
        <span v-if="serviceDisplayName" class="service-badge">
          {{ serviceDisplayName }}
        </span>
        <span v-if="actionDisplayName" class="action-badge">
          {{ actionDisplayName }}
        </span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.message-bubble {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 18px;
  word-wrap: break-word;
  position: relative;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.user-message {
  align-self: flex-end;
  background: linear-gradient(135deg, #0f766e, #14b8a6);
  color: #f8fafc;
  border-bottom-right-radius: 6px;
}

.assistant-message {
  align-self: flex-start;
  background: #f8fafc;
  color: #0f172a;
  border-bottom-left-radius: 6px;
}

.system-message {
  align-self: center;
  background: #fef3c7;
  color: #92400e;
  font-size: 13px;
  text-align: center;
  max-width: 90%;
  box-shadow: none;
}

.message-bubble.error {
  background: #fee2e2;
  color: #b91c1c;
}

.message-bubble.sending {
  opacity: 0.7;
}

.message-content {
  white-space: pre-wrap;
  line-height: 1.5;
  font-size: 15px;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  opacity: 0.7;
  flex-wrap: wrap;
}

.user-message .message-meta {
  justify-content: flex-end;
}

.status-sending {
  font-style: italic;
}

.status-error {
  color: #ef4444;
}

.service-badge {
  padding: 2px 8px;
  background: rgba(15, 118, 110, 0.12);
  border: 1px solid rgba(15, 118, 110, 0.28);
  border-radius: 4px;
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 600;
  color: #0f766e;
}

.action-badge {
  padding: 2px 8px;
  background: rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 4px;
  font-size: 10px;
  text-transform: capitalize;
  color: #475569;
}

.user-message .service-badge {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.9);
}

.user-message .action-badge {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.8);
}
</style>
