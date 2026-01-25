<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from './stores/auth';
import { useSettingsStore } from './stores/settings';
import ChatWindow from './components/ChatWindow.vue';
import InboxPanel from './components/InboxPanel.vue';

const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const showInbox = ref(false);
const loginError = ref<string | null>(null);
const showModelDropdown = ref(false);

const isAuthenticated = computed(() => authStore.isAuthenticated);

// Initialize auth on mount
authStore.initialize();

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
</script>

<template>
  <div class="app-container">
    <!-- Header -->
    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title">Yukie</h1>
        <span class="app-subtitle">Your AI Assistant</span>
      </div>
      <div class="header-right">
        <div v-if="isAuthenticated" class="model-selector">
          <button
            class="model-button"
            @click="showModelDropdown = !showModelDropdown"
            @blur="handleModelButtonBlur"
          >
            <span class="model-label">Model:</span>
            <span class="model-name">{{ settingsStore.currentModel().name }}</span>
            <span class="model-arrow">▼</span>
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

    <!-- Main Content -->
    <main class="app-main">
      <template v-if="isAuthenticated">
        <ChatWindow :class="{ 'with-inbox': showInbox }" />
        <InboxPanel v-if="showInbox" @close="showInbox = false" />
      </template>
      <div v-else class="login-prompt">
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
.app-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f5f5;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.app-title {
  font-size: 24px;
  font-weight: 700;
  color: #6366f1;
  margin: 0;
}

.app-subtitle {
  font-size: 14px;
  color: #666;
}

.header-right {
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
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fff;
  color: #333;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.model-button:hover {
  background: #f5f5f5;
  border-color: #6366f1;
}

.model-label {
  color: #666;
  font-size: 12px;
}

.model-name {
  font-weight: 500;
  color: #333;
}

.model-arrow {
  font-size: 10px;
  color: #999;
  transition: transform 0.2s;
}

.model-button:hover .model-arrow {
  transform: translateY(1px);
}

.model-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
  border-bottom: 1px solid #f0f0f0;
}

.model-option:last-child {
  border-bottom: none;
}

.model-option:hover {
  background: #f5f5f5;
}

.model-option.active {
  background: #eef2ff;
}

.model-option.active .model-option-name {
  color: #6366f1;
  font-weight: 600;
}

.model-option-name {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  margin-bottom: 2px;
}

.model-option-desc {
  font-size: 12px;
  color: #666;
}

.inbox-toggle {
  padding: 8px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fff;
  color: #333;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.inbox-toggle:hover {
  background: #f5f5f5;
}

.inbox-toggle.active {
  background: #6366f1;
  color: #fff;
  border-color: #6366f1;
}

.user-info {
  padding: 6px 12px;
  background: #f0f0f0;
  border-radius: 6px;
}

.user-id {
  font-size: 13px;
  color: #666;
}

.auth-button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #6366f1;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.auth-button:hover {
  background: #5558e3;
}

.auth-button.logout {
  background: #ef4444;
}

.auth-button.logout:hover {
  background: #dc2626;
}

.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.login-prompt {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-card {
  background: #fff;
  padding: 40px;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  text-align: center;
  max-width: 400px;
}

.login-card h2 {
  margin: 0 0 12px;
  color: #333;
}

.login-card p {
  margin: 0 0 24px;
  color: #666;
}

.login-error {
  margin: 0 0 16px;
  padding: 12px;
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 6px;
  color: #c33;
  font-size: 14px;
}

.login-button {
  padding: 12px 32px;
  border: none;
  border-radius: 8px;
  background: #6366f1;
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.login-button:hover {
  background: #5558e3;
}

.with-inbox {
  flex: 1;
}
</style>
