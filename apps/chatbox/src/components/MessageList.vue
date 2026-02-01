<script setup lang="ts">
import type { Message } from '../stores/chat';
import MessageBubble from './MessageBubble.vue';

defineProps<{
  messages: Message[];
}>();

const emit = defineEmits<{
  action: [payload: { type: 'check-status' | 'fetch-report'; ideaId: string }];
}>();
</script>

<template>
  <TransitionGroup name="message" tag="div" class="message-list">
    <MessageBubble
      v-for="message in messages"
      :key="message.id"
      :message="message"
      @action="emit('action', $event)"
    />
  </TransitionGroup>
</template>

<style scoped>
.message-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

@media (min-width: 600px) {
  .message-list {
    gap: 12px;
  }
}

@media (min-width: 981px) {
  .message-list {
    gap: 16px;
  }
}

.message-enter-active,
.message-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.message-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.message-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
