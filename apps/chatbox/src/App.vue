<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAuthStore } from './stores/auth';
import { useSettingsStore } from './stores/settings';
import { useContactsStore } from './stores/contacts';
import { useChatStore } from './stores/chat';
import ChatWindow from './components/ChatWindow.vue';
import ContactList from './components/ContactList.vue';
import InboxPanel from './components/InboxPanel.vue';

const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const contactsStore = useContactsStore();
const chatStore = useChatStore();

const showInbox = ref(false);
const showContacts = ref(false);
const loginError = ref<string | null>(null);
const showModelDropdown = ref(false);
const isCompact = ref(false);

const isAuthenticated = computed(() => authStore.isAuthenticated);
const activeContact = computed(() => contactsStore.activeContact);

const mediaQuery = ref<MediaQueryList | null>(null);

function updateCompactState() {
  if (!mediaQuery.value) return;
  isCompact.value = mediaQuery.value.matches;
  if (!isCompact.value) {
    showContacts.value = false;
  }
}

onMounted(() => {
  authStore.initialize();
  mediaQuery.value = window.matchMedia('(max-width: 980px)');
  updateCompactState();
  mediaQuery.value.addEventListener('change', updateCompactState);
});

onBeforeUnmount(() => {
  mediaQuery.value?.removeEventListener('change', updateCompactState);
});

async function handleLogin() {
  loginError.value = null;
  try {
    await authStore.loginDev();
  } catch (error) {
    loginError.value = error instanceof Error ? error.message : 'Failed to login';
    console.error('Login error:', error);
  }
}

function handleModelChange(modelId: string) {
  settingsStore.setModel(modelId);
  showModelDropdown.value = false;
}

function handleModelButtonBlur() {
  setTimeout(() => {
    showModelDropdown.value = false;
  }, 200);
}

function handleSelectContact(contactId: string) {
  chatStore.setActiveContact(contactId);
  if (isCompact.value) {
    showContacts.value = false;
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="top-bar">
      <div class="brand">
        <button v-if="isCompact" class="mobile-toggle" @click="showContacts = true">
          ☰
        </button>
        <div class="brand-mark">Y</div>
        <div>
          <h1 class="brand-title">Yukie</h1>
          <p class="brand-subtitle">Your calm, capable co-pilot</p>
        </div>
      </div>

      <div class="top-actions">
        <div v-if="isAuthenticated" class="model-selector">
          <button
            class="model-button"
            @click="showModelDropdown = !showModelDropdown"
            @blur="handleModelButtonBlur"
          >
            <span class="model-label">Model</span>
            <span class="model-name">{{ settingsStore.currentModel().name }}</span>
            <span class="model-arrow">▾</span>
          </button>
          <div v-if="showModelDropdown" class="model-dropdown">
            <button
              v-for="model in settingsStore.availableModels"
              :key="model.id"
              class="model-option"
              :class="{ active: settingsStore.selectedModel === model.id }"
              @click="handleModelChange(model.id)"
            >
              <div class="model-option-name">{{ model.name }}</div>
              <div class="model-option-desc">{{ model.description }}</div>
            </button>
          </div>
        </div>

        <button
          v-if="isAuthenticated"
          class="inbox-toggle"
          :class="{ active: showInbox }"
          @click="showInbox = !showInbox"
        >
          Inbox
        </button>

        <div v-if="isAuthenticated" class="user-info">
          <span class="user-id">{{ authStore.userId }}</span>
        </div>

        <button
          v-if="!isAuthenticated"
          class="auth-button"
          @click="handleLogin"
        >
          Login (Dev)
        </button>
        <button
          v-else
          class="auth-button logout"
          @click="authStore.logout()"
        >
          Logout
        </button>
      </div>
    </header>

    <main class="main-grid" :class="{ compact: isCompact }">
      <aside class="contacts-panel" :class="{ open: showContacts || !isCompact }">
        <div class="panel-header">
          <div>
            <h2>Contacts</h2>
            <p>Assistant + services</p>
          </div>
          <button v-if="isCompact" class="panel-close" @click="showContacts = false">✕</button>
        </div>
        <ContactList
          :contacts="contactsStore.orderedContacts"
          :active-id="contactsStore.activeContactId"
          @select="handleSelectContact"
        />
      </aside>

      <section class="chat-panel">
        <ChatWindow
          :contact="activeContact"
          :compact="isCompact"
          @back="showContacts = true"
        />
      </section>

      <aside v-if="isAuthenticated && !isCompact" class="details-panel">
        <div class="details-card" v-if="!showInbox">
          <h3>Contact Details</h3>
          <div class="detail-item">
            <span class="detail-label">Active</span>
            <span class="detail-value">{{ activeContact?.name || 'None' }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Status</span>
            <span class="detail-value">{{ activeContact?.status || 'offline' }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Type</span>
            <span class="detail-value">{{ activeContact?.type || 'n/a' }}</span>
          </div>
          <div class="detail-actions">
            <button class="ghost">Mute</button>
            <button class="ghost">Archive</button>
          </div>
        </div>
        <InboxPanel v-else @close="showInbox = false" />
      </aside>

      <div v-if="isAuthenticated && isCompact && showInbox" class="mobile-inbox">
        <InboxPanel @close="showInbox = false" />
      </div>

      <div v-if="!isAuthenticated" class="login-prompt">
        <div class="login-card">
          <h2>Welcome to Yukie</h2>
          <p>Please log in to start chatting with your AI assistant.</p>
          <div v-if="loginError" class="login-error">
            {{ loginError }}
          </div>
          <button class="login-button" @click="handleLogin">
            Login with Dev Account
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
:global(body) {
  margin: 0;
  font-family: 'Space Grotesk', 'IBM Plex Sans', 'Helvetica Neue', sans-serif;
  color: #0f172a;
  background: radial-gradient(circle at top left, #fef9c3 0%, #f8fafc 40%, #e2e8f0 100%);
}

:global(*) {
  box-sizing: border-box;
}

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  --panel: #ffffff;
  --surface: #f8fafc;
  --border: #e2e8f0;
  --ink: #0f172a;
  --muted: #64748b;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(8px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: linear-gradient(135deg, #0f766e, #22c55e);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
}

.brand-title {
  margin: 0;
  font-size: 22px;
}

.brand-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

.mobile-toggle {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #fff;
  font-size: 18px;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
}

.model-selector {
  position: relative;
}

.model-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  font-size: 13px;
}

.model-label {
  color: var(--muted);
}

.model-name {
  font-weight: 600;
}

.model-arrow {
  font-size: 12px;
  color: var(--muted);
}

.model-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  min-width: 220px;
  z-index: 1000;
  overflow: hidden;
}

.model-option {
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid #f1f5f9;
}

.model-option:last-child {
  border-bottom: none;
}

.model-option:hover {
  background: #f8fafc;
}

.model-option.active {
  background: rgba(15, 118, 110, 0.12);
}

.model-option-name {
  font-size: 14px;
  color: #0f172a;
  font-weight: 600;
  margin-bottom: 2px;
}

.model-option-desc {
  font-size: 12px;
  color: var(--muted);
}

.inbox-toggle {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
}

.inbox-toggle.active {
  background: #0f766e;
  color: #fff;
  border-color: #0f766e;
}

.user-info {
  padding: 6px 12px;
  background: #f1f5f9;
  border-radius: 8px;
}

.user-id {
  font-size: 12px;
  color: var(--muted);
}

.auth-button {
  padding: 8px 16px;
  border: none;
  border-radius: 10px;
  background: #0f766e;
  color: #fff;
  font-size: 14px;
}

.auth-button.logout {
  background: #f97316;
}

.main-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 320px 1fr 320px;
  min-height: 0;
}

.main-grid.compact {
  grid-template-columns: 1fr;
}

.contacts-panel {
  background: rgba(255, 255, 255, 0.85);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: transform 0.2s ease;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 18px 8px;
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
}

.panel-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.panel-close {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: #fff;
}

.chat-panel {
  min-width: 0;
  display: flex;
}

.details-panel {
  border-left: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.9);
  padding: 16px;
}

.details-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.06);
}

.details-card h3 {
  margin: 0 0 14px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
}

.detail-label {
  color: var(--muted);
}

.detail-actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
}

.ghost {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: #fff;
}

.login-prompt {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-card {
  background: #fff;
  padding: 40px;
  border-radius: 20px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
  text-align: center;
  max-width: 400px;
}

.login-card h2 {
  margin: 0 0 12px;
}

.login-card p {
  margin: 0 0 24px;
  color: var(--muted);
}

.login-error {
  margin: 0 0 16px;
  padding: 12px;
  background: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  color: #b91c1c;
  font-size: 14px;
}

.login-button {
  padding: 12px 32px;
  border: none;
  border-radius: 10px;
  background: #0f766e;
  color: #fff;
  font-size: 16px;
}

.mobile-inbox {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: grid;
  place-items: center;
  z-index: 100;
}

@media (max-width: 980px) {
  .contacts-panel {
    position: fixed;
    top: 72px;
    bottom: 0;
    left: 0;
    width: 80%;
    max-width: 320px;
    transform: translateX(-100%);
    z-index: 200;
  }

  .contacts-panel.open {
    transform: translateX(0);
    box-shadow: 24px 0 40px rgba(15, 23, 42, 0.2);
  }

  .details-panel {
    display: none;
  }
}
</style>
