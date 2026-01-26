<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { useChatStore } from '../stores/chat';
import MessageList from './MessageList.vue';
import InputBar from './InputBar.vue';
import type { Contact } from '../stores/contacts';

const chatStore = useChatStore();
const messagesContainer = ref<HTMLElement | null>(null);

const props = defineProps<{
  contact: Contact | null;
  compact?: boolean;
}>();

const emit = defineEmits<{
  back: [];
}>();

const isServiceContact = computed(() => props.contact?.type === 'service');

// Auto-scroll to bottom when new messages arrive
watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick();
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  }
);

function handleSend(message: string) {
  chatStore.sendMessage(message);
}

function handleClear() {
  chatStore.clearConversation();
}
</script>

<template>
  <div class="chat-window">
    <div class="chat-header">
      <div class="header-left">
        <button v-if="compact" class="back-button" @click="emit('back')">
          ←
        </button>
        <div class="contact-meta">
          <div class="contact-title">
            <span class="contact-name">{{ props.contact?.name || 'Chat' }}</span>
            <span class="status-dot" :class="props.contact?.status || 'offline'"></span>
          </div>
          <span class="contact-subtitle">{{ props.contact?.subtitle || 'Personal assistant' }}</span>
        </div>
      </div>
      <div class="header-actions">
        <button
          v-if="chatStore.messages.length > 0"
          class="clear-button"
          @click="handleClear"
        >
          Clear
        </button>
      </div>
    </div>

    <div ref="messagesContainer" class="messages-container">
      <MessageList :messages="chatStore.messages" />

      <div v-if="chatStore.messages.length === 0" class="empty-state">
        <div class="empty-icon">💬</div>
        <h3>{{ isServiceContact ? 'Direct chat coming soon' : 'Start a conversation' }}</h3>
        <p v-if="!isServiceContact">Ask me anything! Try:</p>
        <p v-else>Yukie will soon let you chat with services directly.</p>
        <ul v-if="!isServiceContact" class="suggestions">
          <li @click="handleSend('Check me in for today')">
            Check me in for today
          </li>
          <li @click="handleSend('What\\'s my current streak?')">
            What's my current streak?
          </li>
          <li @click="handleSend('How many days this month?')">
            How many days this month?
          </li>
        </ul>
      </div>

      <div v-if="chatStore.isLoading" class="loading-indicator">
        <div class="loading-content">
          <div class="loading-dots">
            <span class="loading-dot"></span>
            <span class="loading-dot"></span>
            <span class="loading-dot"></span>
          </div>
          <div v-if="chatStore.processingStatus" class="loading-status">
            <span v-if="chatStore.processingStatus.stage === 'routing'" class="status-text">
              🔍 Finding the right service...
            </span>
            <span v-else-if="chatStore.processingStatus.stage === 'fetching-actions'" class="status-text">
              📋 Getting actions from <strong>{{ chatStore.processingStatus.service === 'habit-tracker' ? 'Habit Tracker' : chatStore.processingStatus.service || 'service' }}</strong>...
            </span>
            <span v-else-if="chatStore.processingStatus.stage === 'invoking'" class="status-text">
              ⚡ Calling <strong>{{ chatStore.processingStatus.service === 'habit-tracker' ? 'Habit Tracker' : chatStore.processingStatus.service || 'service' }}</strong>
              <span v-if="chatStore.processingStatus.action" class="action-name">
                ({{ chatStore.processingStatus.action }})
              </span>
            </span>
            <span v-else class="status-text">
              🤔 Processing your request...
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="chatStore.error" class="error-banner">
      {{ chatStore.error }}
    </div>

    <InputBar
      :disabled="chatStore.isLoading || isServiceContact"
      @send="handleSend"
    />
  </div>
</template>

<style scoped>
.chat-window {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-right: 1px solid var(--border);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(120deg, rgba(15, 118, 110, 0.08), rgba(249, 115, 22, 0.08));
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-button {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--panel);
  font-size: 18px;
  cursor: pointer;
}

.contact-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.contact-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.contact-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ink);
}

.contact-subtitle {
  font-size: 13px;
  color: var(--muted);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #94a3b8;
}

.status-dot.online {
  background: #22c55e;
}

.status-dot.away {
  background: #f59e0b;
}

.status-dot.offline {
  background: #94a3b8;
}

.clear-button {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-button:hover {
  background: rgba(15, 118, 110, 0.08);
  color: var(--ink);
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: var(--surface);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--muted);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state h3 {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--ink);
}

.empty-state p {
  margin: 0 0 16px;
}

.suggestions {
  list-style: none;
  padding: 0;
  margin: 0;
}

.suggestions li {
  padding: 10px 16px;
  margin: 8px 0;
  background: #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: var(--ink);
}

.suggestions li:hover {
  background: #0f766e;
  color: #fff;
}

.loading-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.loading-dots {
  display: flex;
  gap: 4px;
}

.loading-dot {
  width: 8px;
  height: 8px;
  background: #0f766e;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}

.loading-dot:nth-child(1) {
  animation-delay: -0.32s;
}

.loading-dot:nth-child(2) {
  animation-delay: -0.16s;
}

.loading-status {
  text-align: center;
}

.status-text {
  font-size: 13px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
}

.status-text strong {
  color: #0f766e;
  font-weight: 600;
}

.action-name {
  font-size: 11px;
  color: #94a3b8;
  font-style: italic;
  margin-left: 4px;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.error-banner {
  padding: 12px 20px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 14px;
  border-top: 1px solid #fecaca;
}
</style>
