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
const showInstallBanner = ref(false);
const installMode = ref<'ios' | 'prompt' | null>(null);

const isAuthenticated = computed(() => authStore.isAuthenticated);
const activeContact = computed(() => contactsStore.activeContact);

const mediaQuery = ref<MediaQueryList | null>(null);
const installPrompt = ref<BeforeInstallPromptEvent | null>(null);

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

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

  const dismissed = localStorage.getItem('yukie_install_dismissed') === '1';
  if (!dismissed && !isStandaloneMode()) {
    if (isIOSDevice()) {
      installMode.value = 'ios';
      showInstallBanner.value = true;
    }
  }

  window.addEventListener('beforeinstallprompt', handleInstallPrompt as EventListener);
  window.addEventListener('appinstalled', handleAppInstalled);
});

onBeforeUnmount(() => {
  mediaQuery.value?.removeEventListener('change', updateCompactState);
  window.removeEventListener('beforeinstallprompt', handleInstallPrompt as EventListener);
  window.removeEventListener('appinstalled', handleAppInstalled);
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

function handleInstallPrompt(event: Event) {
  event.preventDefault();
  installPrompt.value = event as BeforeInstallPromptEvent;
  if (!localStorage.getItem('yukie_install_dismissed')) {
    installMode.value = 'prompt';
    showInstallBanner.value = true;
  }
}

async function handleInstallClick() {
  if (!installPrompt.value) return;
  await installPrompt.value.prompt();
  const choice = await installPrompt.value.userChoice;
  showInstallBanner.value = false;
  installPrompt.value = null;
  if (choice.outcome === 'dismissed') {
    localStorage.setItem('yukie_install_dismissed', '1');
  }
}

function dismissInstallBanner() {
  showInstallBanner.value = false;
  localStorage.setItem('yukie_install_dismissed', '1');
}

function handleAppInstalled() {
  showInstallBanner.value = false;
  localStorage.setItem('yukie_install_dismissed', '1');
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
              :class="{ active: settingsStore.selectedModel === model.id, [model.tier]: true }"
              @click="handleModelChange(model.id)"
            >
              <div class="model-option-header">
                <span class="model-option-name">{{ model.name }}</span>
                <span v-if="model.tier === 'advanced'" class="model-tier-badge advanced">★ Pro</span>
                <span v-else-if="model.tier === 'balanced'" class="model-tier-badge balanced">Balanced</span>
                <span v-else class="model-tier-badge fast">Fast</span>
              </div>
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

    <div v-if="showInstallBanner" class="install-banner">
      <div class="install-content">
        <strong>Install Yukie</strong>
        <span v-if="installMode === 'ios'">Tap Share → Add to Home Screen for the full app experience.</span>
        <span v-else>Add Yukie to your home screen for a full-screen experience.</span>
      </div>
      <div class="install-actions">
        <button v-if="installMode === 'prompt'" class="install-button" @click="handleInstallClick">
          Install
        </button>
        <button class="install-dismiss" @click="dismissInstallBanner">Not now</button>
      </div>
    </div>

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
  /* Mobile-friendly font sizes */
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

:global(*) {
  box-sizing: border-box;
  /* Prevent text selection on interactive elements for touch */
  -webkit-tap-highlight-color: transparent;
}

:global(html) {
  /* Prevent horizontal scroll */
  overflow-x: hidden;
}

.app-shell {
  min-height: 100vh;
  min-height: 100dvh; /* Dynamic viewport height for mobile browsers */
  display: flex;
  flex-direction: column;
  --panel: #ffffff;
  --surface: #f8fafc;
  --border: #e2e8f0;
  --ink: #0f172a;
  --muted: #64748b;
  --primary: #0f766e;
  --primary-light: #14b8a6;
  --accent: #f97316;
  /* Safe area insets for notched devices */
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
  /* Prevent content from going under system UI */
  padding-top: var(--safe-area-top);
  padding-left: var(--safe-area-left);
  padding-right: var(--safe-area-right);
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 50;
  min-height: 60px;
  gap: 12px;
}

@media (min-width: 981px) {
  .top-bar {
    padding: 16px 24px;
    min-height: 72px;
  }
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0; /* Allow shrinking */
  flex-shrink: 1;
}

.brand-mark {
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--primary), #22c55e);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 14px;
}

@media (min-width: 981px) {
  .brand-mark {
    width: 42px;
    height: 42px;
    min-width: 42px;
    border-radius: 14px;
    font-size: 16px;
  }
}

.brand-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

@media (min-width: 981px) {
  .brand-title {
    font-size: 22px;
  }
}

.brand-subtitle {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  display: none; /* Hide on mobile to save space */
}

@media (min-width: 600px) {
  .brand-subtitle {
    display: block;
    font-size: 13px;
  }
}

.mobile-toggle {
  width: 44px;
  height: 44px;
  min-width: 44px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.mobile-toggle:active {
  background: var(--surface);
  transform: scale(0.96);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  flex-shrink: 0;
}

@media (min-width: 981px) {
  .top-actions {
    gap: 12px;
  }
}

.model-selector {
  position: relative;
  display: none; /* Hide on small mobile */
}

@media (min-width: 480px) {
  .model-selector {
    display: block;
  }
}

.model-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 36px;
}

@media (min-width: 981px) {
  .model-button {
    gap: 8px;
    padding: 6px 12px;
    font-size: 13px;
    min-height: 40px;
  }
}

.model-button:active {
  transform: scale(0.98);
}

.model-label {
  color: var(--muted);
  display: none;
}

@media (min-width: 600px) {
  .model-label {
    display: inline;
  }
}

.model-name {
  font-weight: 600;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 600px) {
  .model-name {
    max-width: none;
  }
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
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
  min-width: 200px;
  max-width: calc(100vw - 32px);
  z-index: 1000;
  overflow: hidden;
  animation: dropdownFade 0.15s ease;
}

@keyframes dropdownFade {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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

.model-option-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.model-option-name {
  font-size: 14px;
  color: #0f172a;
  font-weight: 600;
}

.model-tier-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.model-tier-badge.advanced {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  color: #92400e;
}

.model-tier-badge.balanced {
  background: #e0f2fe;
  color: #0369a1;
}

.model-tier-badge.fast {
  background: #dcfce7;
  color: #166534;
}

.model-option.advanced {
  border-left: 3px solid #f59e0b;
}

.model-option-desc {
  font-size: 12px;
  color: var(--muted);
}

.inbox-toggle {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (min-width: 981px) {
  .inbox-toggle {
    padding: 8px 16px;
    font-size: 14px;
    min-height: 40px;
  }
}

.inbox-toggle:active {
  transform: scale(0.96);
}

.inbox-toggle.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.user-info {
  padding: 6px 10px;
  background: #f1f5f9;
  border-radius: 8px;
  display: none; /* Hide on mobile to save space */
}

@media (min-width: 600px) {
  .user-info {
    display: block;
  }
}

.user-id {
  font-size: 11px;
  color: var(--muted);
}

@media (min-width: 981px) {
  .user-id {
    font-size: 12px;
  }
}

.auth-button {
  padding: 8px 12px;
  border: none;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 36px;
  white-space: nowrap;
}

@media (min-width: 981px) {
  .auth-button {
    padding: 8px 16px;
    font-size: 14px;
    min-height: 40px;
  }
}

.auth-button:active {
  transform: scale(0.96);
}

.auth-button.logout {
  background: var(--accent);
}

.main-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 320px 1fr 320px;
  min-height: 0;
}

.install-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  padding-left: calc(16px + var(--safe-area-left));
  padding-right: calc(16px + var(--safe-area-right));
  background: linear-gradient(135deg, #0f172a, #1e293b);
  color: #f8fafc;
  font-size: 12px;
}

@media (min-width: 600px) {
  .install-banner {
    padding: 12px 20px;
    padding-left: calc(20px + var(--safe-area-left));
    padding-right: calc(20px + var(--safe-area-right));
    font-size: 13px;
  }
}

.install-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.install-content strong {
  font-size: 13px;
}

.install-content span {
  opacity: 0.85;
  font-size: 11px;
}

@media (min-width: 600px) {
  .install-content strong {
    font-size: 14px;
  }
  .install-content span {
    font-size: 12px;
  }
}

.install-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.install-button {
  padding: 8px 12px;
  border-radius: 10px;
  border: none;
  background: #22c55e;
  color: #0f172a;
  font-weight: 600;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  min-height: 36px;
}

@media (min-width: 600px) {
  .install-button {
    padding: 8px 14px;
    font-size: 13px;
  }
}

.install-button:active {
  transform: scale(0.96);
}

.install-dismiss {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(248, 250, 252, 0.3);
  background: transparent;
  color: #f8fafc;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  min-height: 36px;
  white-space: nowrap;
}

.install-dismiss:active {
  background: rgba(255, 255, 255, 0.1);
}

.main-grid.compact {
  grid-template-columns: 1fr;
}

.contacts-panel {
  background: rgba(255, 255, 255, 0.92);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
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
    top: 60px; /* Match mobile header height */
    bottom: 0;
    left: 0;
    width: 85%;
    max-width: 320px;
    transform: translateX(-100%);
    z-index: 200;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .contacts-panel.open {
    transform: translateX(0);
    box-shadow: 8px 0 32px rgba(15, 23, 42, 0.15);
  }

  .details-panel {
    display: none;
  }
}

/* Tablet breakpoint */
@media (max-width: 768px) {
  .top-bar {
    padding: 10px 12px;
    min-height: 56px;
  }

  .brand {
    gap: 8px;
  }

  .brand-mark {
    width: 32px;
    height: 32px;
    min-width: 32px;
    border-radius: 10px;
    font-size: 13px;
  }

  .brand-title {
    font-size: 16px;
  }
}

/* Small mobile breakpoint */
@media (max-width: 480px) {
  .install-banner {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 10px 12px;
  }

  .install-actions {
    justify-content: flex-end;
  }

  .top-actions {
    gap: 6px;
  }

  .inbox-toggle {
    padding: 6px 10px;
    font-size: 12px;
  }

  .auth-button {
    padding: 6px 10px;
    font-size: 12px;
  }
}

/* Landscape mode on mobile */
@media (max-height: 500px) and (orientation: landscape) {
  .top-bar {
    padding: 8px 16px;
    min-height: 48px;
  }

  .brand-mark {
    width: 28px;
    height: 28px;
    min-width: 28px;
  }

  .contacts-panel {
    top: 48px;
  }
}
</style>
