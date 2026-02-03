<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
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

// Service contacts now support direct chat

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

function handleIdeaAction(payload: { type: 'check-status' | 'fetch-report'; ideaId: string }) {
  if (payload.type === 'check-status') {
    chatStore.sendMessage(`get idea id ${payload.ideaId}`);
    return;
  }
  chatStore.sendMessage(`get report for idea id ${payload.ideaId}`);
}

function handleClear() {
  chatStore.clearConversation();
}

function handleIdeasLogAction(action: 'list' | 'fetch') {
  if (action === 'list') {
    chatStore.sendMessage('list ideas');
    return;
  }
  const ideaId = window.prompt('Enter idea ID to fetch the report:');
  if (ideaId && ideaId.trim()) {
    chatStore.sendMessage(`get report for idea id ${ideaId.trim()}`);
  }
}

function openclawStatusLabel() {
  switch (chatStore.openclawStatus) {
    case 'online':
      return 'Connected';
    case 'connecting':
      return 'Connecting…';
    case 'not_configured':
      return 'Not configured';
    default:
      return 'Offline';
  }
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
        <div v-if="props.contact?.id === 'openclaw'" class="openclaw-status">
          <span class="status-pill" :class="`status-${chatStore.openclawStatus}`">
            {{ openclawStatusLabel() }}
          </span>
          <span v-if="chatStore.openclawStatusDetail" class="status-detail">
            {{ chatStore.openclawStatusDetail }}
          </span>
        </div>
        <div v-if="props.contact?.id === 'ideas-log'" class="ideas-actions">
          <button class="ideas-action-button" @click="handleIdeasLogAction('list')">
            List ideas
          </button>
          <button class="ideas-action-button primary" @click="handleIdeasLogAction('fetch')">
            Fetch report
          </button>
        </div>
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
      <MessageList :messages="chatStore.messages" @action="handleIdeaAction" />

      <div v-if="chatStore.messages.length === 0" class="empty-state">
        <div class="empty-icon">💬</div>
        <h3>Start a conversation</h3>
        <p v-if="props.contact?.type === 'assistant'">Ask me anything! Try:</p>
        <p v-else>Chat directly with {{ props.contact?.name }}:</p>
        <ul v-if="props.contact?.type === 'assistant'" class="suggestions">
          <li @click="handleSend('Check me in for today')">
            🌅 Check me in for today
          </li>
          <li @click="handleSend('Log that I spent 1 hour reading')">
            📖 Log that I spent 1 hour reading
          </li>
          <li @click="handleSend('Start working on my project')">
            💼 Start working on my project
          </li>
          <li @click="handleSend('Add a highlight: finished a big task')">
            ⭐ Add a highlight
          </li>
        </ul>
        <!-- Service-specific suggestions -->
        <ul v-else-if="props.contact?.id === 'diary-analyzer'" class="suggestions">
          <li @click="handleSend('Log that I spent 1 hour reading')">
            📖 Log an activity
          </li>
          <li @click="handleSend('Add a highlight: completed a big task')">
            ⭐ Add a highlight
          </li>
        </ul>
        <ul v-else-if="props.contact?.id === 'momentum'" class="suggestions">
          <li @click="handleSend('Did it!')">
            ✅ Did it!
          </li>
          <li @click="handleSend('Screwed it')">
            ❌ Screwed it
          </li>
        </ul>
        <ul v-else class="suggestions">
          <li @click="handleSend('Help')">
            ❓ What can you do?
          </li>
        </ul>
      </div>

      <div v-if="chatStore.isActiveContactLoading" class="loading-indicator">
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
              📋 Getting actions from <strong>{{ chatStore.processingStatus.service || 'service' }}</strong>...
            </span>
            <span v-else-if="chatStore.processingStatus.stage === 'invoking'" class="status-text">
              ⚡ Calling <strong>{{ chatStore.processingStatus.service || 'service' }}</strong>
              <span v-if="chatStore.processingStatus.action" class="action-name">
                → {{ chatStore.processingStatus.action }}
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
      :disabled="!chatStore.canSend"
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
  min-width: 0; /* Prevent flex children from overflowing */
  overflow: hidden;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(120deg, rgba(15, 118, 110, 0.06), rgba(249, 115, 22, 0.06));
  min-height: 56px;
  flex-shrink: 0;
  gap: 12px;
}

@media (min-width: 600px) {
  .chat-header {
    padding: 14px 18px;
    min-height: 60px;
  }
}

@media (min-width: 981px) {
  .chat-header {
    padding: 16px 20px;
    min-height: 64px;
    background: linear-gradient(120deg, rgba(15, 118, 110, 0.08), rgba(249, 115, 22, 0.08));
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

@media (min-width: 600px) {
  .header-left {
    gap: 12px;
  }
}

.back-button {
  width: 40px;
  height: 40px;
  min-width: 40px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--panel);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.back-button:active {
  transform: scale(0.94);
  background: var(--surface);
}

.contact-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

@media (min-width: 600px) {
  .contact-meta {
    gap: 4px;
  }
}

.contact-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

@media (min-width: 600px) {
  .contact-title {
    gap: 8px;
  }
}

.contact-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (min-width: 600px) {
  .contact-name {
    font-size: 17px;
  }
}

@media (min-width: 981px) {
  .contact-name {
    font-size: 18px;
  }
}

.contact-subtitle {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (min-width: 600px) {
  .contact-subtitle {
    font-size: 13px;
  }
}

.status-dot {
  width: 8px;
  height: 8px;
  min-width: 8px;
  border-radius: 999px;
  background: #94a3b8;
  transition: background 0.3s ease;
}

.status-dot.online {
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

.status-dot.away {
  background: #f59e0b;
}

.status-dot.offline {
  background: #94a3b8;
}

.header-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.openclaw-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}

.status-pill {
  padding: 4px 8px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  border: 1px solid transparent;
}

.status-pill.status-online {
  color: #065f46;
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
}

.status-pill.status-connecting {
  color: #92400e;
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.35);
}

.status-pill.status-not_configured {
  color: #9f1239;
  background: rgba(244, 63, 94, 0.12);
  border-color: rgba(244, 63, 94, 0.35);
}

.status-pill.status-offline {
  color: #374151;
  background: rgba(148, 163, 184, 0.2);
  border-color: rgba(148, 163, 184, 0.4);
}

.status-detail {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clear-button {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

@media (min-width: 600px) {
  .clear-button {
    padding: 6px 12px;
    font-size: 13px;
  }
}

.clear-button:hover {
  background: rgba(15, 118, 110, 0.08);
  color: var(--ink);
}

.clear-button:active {
  transform: scale(0.96);
}

.ideas-actions {
  display: flex;
  gap: 8px;
}

.ideas-action-button {
  border: 1px solid rgba(148, 163, 184, 0.6);
  background: #ffffff;
  color: #0f172a;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.ideas-action-button:hover {
  border-color: #94a3b8;
  background: #f1f5f9;
}

.ideas-action-button.primary {
  background: linear-gradient(135deg, #0f766e, #14b8a6);
  border-color: transparent;
  color: #f8fafc;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 12px;
  background: var(--surface);
  /* Smooth scrolling for iOS */
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}

@media (min-width: 600px) {
  .messages-container {
    padding: 20px 16px;
  }
}

@media (min-width: 981px) {
  .messages-container {
    padding: 24px;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--muted);
  padding: 20px;
  animation: fadeIn 0.4s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

@media (min-width: 600px) {
  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }
}

.empty-state h3 {
  margin: 0 0 6px;
  font-size: 16px;
  color: var(--ink);
}

@media (min-width: 600px) {
  .empty-state h3 {
    margin: 0 0 8px;
    font-size: 18px;
  }
}

.empty-state p {
  margin: 0 0 14px;
  font-size: 13px;
}

@media (min-width: 600px) {
  .empty-state p {
    margin: 0 0 16px;
    font-size: 14px;
  }
}

.suggestions {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  max-width: 320px;
}

.suggestions li {
  padding: 10px 14px;
  margin: 6px 0;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
  color: var(--ink);
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (min-width: 600px) {
  .suggestions li {
    padding: 12px 16px;
    margin: 8px 0;
    font-size: 14px;
    gap: 10px;
  }
}

.suggestions li:hover {
  background: linear-gradient(135deg, #0f766e, #14b8a6);
  color: #fff;
  border-color: transparent;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.2);
}

.suggestions li:active {
  transform: scale(0.98) translateY(0);
}

.loading-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  animation: fadeIn 0.3s ease;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  border: 1px solid var(--border);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
}

.loading-dots {
  display: flex;
  gap: 6px;
}

.loading-dot {
  width: 10px;
  height: 10px;
  background: linear-gradient(135deg, #0f766e, #14b8a6);
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
  font-size: 12px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
}

@media (min-width: 600px) {
  .status-text {
    font-size: 13px;
  }
}

.status-text strong {
  color: var(--primary, #0f766e);
  font-weight: 600;
}

.action-name {
  font-size: 10px;
  color: #94a3b8;
  font-style: italic;
  margin-left: 4px;
}

@media (min-width: 600px) {
  .action-name {
    font-size: 11px;
  }
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
  padding: 10px 14px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(135deg, #fee2e2, #fecaca);
  color: #b91c1c;
  font-size: 13px;
  border-top: 1px solid #fecaca;
  animation: slideUp 0.3s ease;
}

@media (min-width: 600px) {
  .error-banner {
    padding: 12px 20px;
    font-size: 14px;
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
