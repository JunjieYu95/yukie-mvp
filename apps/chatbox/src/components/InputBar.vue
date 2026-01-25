<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  send: [message: string];
}>();

const inputText = ref('');

function handleSubmit() {
  const message = inputText.value.trim();
  if (message) {
    emit('send', message);
    inputText.value = '';
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSubmit();
  }
}
</script>

<template>
  <div class="input-bar">
    <textarea
      v-model="inputText"
      class="input-field"
      :disabled="disabled"
      placeholder="Type your message..."
      rows="1"
      @keydown="handleKeydown"
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
  border-top: 1px solid #e0e0e0;
  background: #fff;
}

.input-field {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  font-size: 15px;
  font-family: inherit;
  resize: none;
  outline: none;
  transition: border-color 0.2s;
  max-height: 120px;
  min-height: 44px;
}

.input-field:focus {
  border-color: #6366f1;
}

.input-field:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.send-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 12px;
  background: #6366f1;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.send-button:hover:not(:disabled) {
  background: #5558e3;
}

.send-button:disabled {
  background: #e0e0e0;
  color: #999;
  cursor: not-allowed;
}
</style>
