<script setup lang="ts">
import { onMounted, ref } from 'vue';

defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  send: [message: string];
}>();

const inputText = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);

function resizeTextarea() {
  if (!textareaRef.value) return;
  textareaRef.value.style.height = 'auto';
  textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 160)}px`;
}

function handleSubmit() {
  const message = inputText.value.trim();
  if (message) {
    emit('send', message);
    inputText.value = '';
    resizeTextarea();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSubmit();
  }
}

onMounted(() => {
  resizeTextarea();
});
</script>

<template>
  <div class="input-bar">
    <div class="tool-row">
      <button class="tool-button" :disabled="disabled" title="Emoji picker (coming soon)">
        🙂
      </button>
      <button class="tool-button" :disabled="disabled" title="Attach file (coming soon)">
        📎
      </button>
      <button class="tool-button" :disabled="disabled" title="Voice note (coming soon)">
        🎙️
      </button>
    </div>
    <textarea
      ref="textareaRef"
      v-model="inputText"
      class="input-field"
      :disabled="disabled"
      placeholder="Type a message…"
      rows="1"
      @keydown="handleKeydown"
      @input="resizeTextarea"
    />
    <button
      class="send-button"
      :disabled="disabled || !inputText.trim()"
      @click="handleSubmit"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.input-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
  background: var(--panel);
  transition: padding 0.2s ease;
}

@media (min-width: 600px) {
  .input-bar {
    gap: 10px;
    padding: 14px 16px;
    padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  }
}

@media (min-width: 981px) {
  .input-bar {
    gap: 12px;
    padding: 16px 20px;
    padding-bottom: 16px; /* No safe area needed on desktop */
  }
}

.tool-row {
  display: flex;
  gap: 4px;
}

@media (min-width: 600px) {
  .tool-row {
    gap: 6px;
  }
}

/* Hide some tool buttons on very small screens */
@media (max-width: 400px) {
  .tool-row {
    display: none;
  }
}

.tool-button {
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(15, 23, 42, 0.04);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

@media (min-width: 600px) {
  .tool-button {
    width: 40px;
    height: 40px;
    min-width: 40px;
    border-radius: 12px;
    font-size: 16px;
  }
}

.tool-button:not(:disabled):active {
  transform: scale(0.94);
  background: rgba(15, 23, 42, 0.08);
}

.tool-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-field {
  flex: 1;
  padding: 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: 20px;
  font-size: 16px; /* 16px prevents iOS zoom on focus */
  font-family: inherit;
  resize: none;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  max-height: 120px;
  min-height: 40px;
  background: #ffffff;
  line-height: 1.4;
}

@media (min-width: 600px) {
  .input-field {
    padding: 11px 16px;
    border-radius: 18px;
    max-height: 140px;
    min-height: 44px;
  }
}

@media (min-width: 981px) {
  .input-field {
    padding: 12px 16px;
    border-radius: 16px;
    font-size: 15px;
    max-height: 160px;
    min-height: 44px;
  }
}

.input-field:focus {
  border-color: var(--primary, #0f766e);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
}

.input-field:disabled {
  background: #f1f5f9;
  cursor: not-allowed;
}

.input-field::placeholder {
  color: var(--muted, #64748b);
  opacity: 0.7;
}

.send-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  min-width: 40px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--primary, #0f766e), #14b8a6);
  color: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(15, 118, 110, 0.25);
}

@media (min-width: 600px) {
  .send-button {
    width: 44px;
    height: 44px;
    min-width: 44px;
    border-radius: 14px;
  }
}

.send-button:not(:disabled):hover {
  background: linear-gradient(135deg, #0d9488, #2dd4bf);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.35);
}

.send-button:not(:disabled):active {
  transform: scale(0.94) translateY(0);
  box-shadow: 0 2px 6px rgba(15, 118, 110, 0.2);
}

.send-button:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
  box-shadow: none;
}

.send-button svg {
  width: 18px;
  height: 18px;
}

@media (min-width: 600px) {
  .send-button svg {
    width: 20px;
    height: 20px;
  }
}
</style>
