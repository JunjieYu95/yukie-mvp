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

// Check if message has image content
const hasImages = computed(() => {
  return props.message.richContent?.some(c => c.type === 'image' && c.data);
});

const imageContents = computed(() => {
  if (!props.message.richContent) return [];
  return props.message.richContent.filter(c => c.type === 'image' && c.data);
});

// Generate data URL for image
function getImageDataUrl(content: { data?: string; mimeType?: string }): string {
  const mimeType = content.mimeType || 'image/png';
  return `data:${mimeType};base64,${content.data}`;
}
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
      'has-image': hasImages,
    }"
  >
    <div class="message-content">
      {{ message.content }}
    </div>

    <!-- Render image content -->
    <div v-if="hasImages" class="message-images">
      <div
        v-for="(img, index) in imageContents"
        :key="index"
        class="message-image-container"
      >
        <img
          :src="getImageDataUrl(img)"
          :alt="`Chart ${index + 1}`"
          class="message-image"
          loading="lazy"
        />
      </div>
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
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 18px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  position: relative;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  animation: messageSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (min-width: 600px) {
  .message-bubble {
    max-width: 80%;
    padding: 12px 16px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
  }
}

@media (min-width: 981px) {
  .message-bubble {
    max-width: 75%;
  }
}

.user-message {
  align-self: flex-end;
  background: linear-gradient(135deg, #0f766e, #14b8a6);
  color: #f8fafc;
  border-bottom-right-radius: 6px;
  margin-left: 15%;
}

@media (min-width: 600px) {
  .user-message {
    margin-left: 20%;
  }
}

.assistant-message {
  align-self: flex-start;
  background: #ffffff;
  color: #0f172a;
  border-bottom-left-radius: 6px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  margin-right: 15%;
}

@media (min-width: 600px) {
  .assistant-message {
    margin-right: 20%;
  }
}

.system-message {
  align-self: center;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  color: #92400e;
  font-size: 12px;
  text-align: center;
  max-width: 90%;
  box-shadow: none;
  padding: 8px 14px;
  border-radius: 12px;
}

@media (min-width: 600px) {
  .system-message {
    font-size: 13px;
    padding: 10px 16px;
  }
}

.message-bubble.error {
  background: linear-gradient(135deg, #fee2e2, #fecaca);
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.message-bubble.sending {
  opacity: 0.7;
  animation: messagePulse 1.5s ease-in-out infinite;
}

@keyframes messagePulse {
  0%, 100% {
    opacity: 0.7;
  }
  50% {
    opacity: 0.5;
  }
}

.message-content {
  white-space: pre-wrap;
  line-height: 1.5;
  font-size: 14px;
  word-break: break-word;
}

@media (min-width: 600px) {
  .message-content {
    font-size: 15px;
  }
}

/* Handle code blocks and pre tags */
.message-content :deep(pre),
.message-content :deep(code) {
  max-width: 100%;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Image content styles */
.message-bubble.has-image {
  max-width: 95%;
}

@media (min-width: 600px) {
  .message-bubble.has-image {
    max-width: 90%;
  }
}

@media (min-width: 981px) {
  .message-bubble.has-image {
    max-width: 85%;
  }
}

.message-images {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message-image-container {
  border-radius: 12px;
  overflow: hidden;
  background: #f8fafc;
  border: 1px solid rgba(226, 232, 240, 0.8);
}

.message-image {
  width: 100%;
  height: auto;
  display: block;
  max-height: 400px;
  object-fit: contain;
}

@media (min-width: 600px) {
  .message-image {
    max-height: 500px;
  }
}

@media (min-width: 981px) {
  .message-image {
    max-height: 600px;
  }
}

.user-message .message-image-container {
  border-color: rgba(255, 255, 255, 0.2);
}

.user-message .message-image {
  background: rgba(255, 255, 255, 0.1);
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 10px;
  opacity: 0.75;
  flex-wrap: wrap;
}

@media (min-width: 600px) {
  .message-meta {
    gap: 8px;
    font-size: 11px;
  }
}

.user-message .message-meta {
  justify-content: flex-end;
}

.message-time {
  font-weight: 500;
}

.status-sending {
  font-style: italic;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.status-sending::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: sendingDot 1s ease-in-out infinite;
}

@keyframes sendingDot {
  0%, 100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}

.status-error {
  color: #ef4444;
  font-weight: 500;
}

.service-badge {
  padding: 2px 6px;
  background: rgba(15, 118, 110, 0.12);
  border: 1px solid rgba(15, 118, 110, 0.25);
  border-radius: 6px;
  font-size: 9px;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #0f766e;
}

@media (min-width: 600px) {
  .service-badge {
    padding: 2px 8px;
    font-size: 10px;
  }
}

.action-badge {
  padding: 2px 6px;
  background: rgba(15, 23, 42, 0.06);
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 6px;
  font-size: 9px;
  text-transform: capitalize;
  color: #475569;
}

@media (min-width: 600px) {
  .action-badge {
    padding: 2px 8px;
    font-size: 10px;
  }
}

.user-message .service-badge {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.95);
}

.user-message .action-badge {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.85);
}
</style>
