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
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: var(--panel);
}

.tool-row {
  display: flex;
  gap: 6px;
}

.tool-button {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(15, 23, 42, 0.04);
  cursor: pointer;
  font-size: 16px;
}

.tool-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-field {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  font-size: 15px;
  font-family: inherit;
  resize: none;
  outline: none;
  transition: border-color 0.2s;
  max-height: 160px;
  min-height: 44px;
  background: #ffffff;
}

.input-field:focus {
  border-color: #0f766e;
}

.input-field:disabled {
  background: #f1f5f9;
  cursor: not-allowed;
}

.send-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 14px;
  background: #0f766e;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.send-button:hover:not(:disabled) {
  background: #0d9488;
}

.send-button:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}
</style>
