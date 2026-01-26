<script setup lang="ts">
import type { Message } from '../stores/chat';
import MessageBubble from './MessageBubble.vue';

defineProps<{
  messages: Message[];
}>();
</script>

<template>
  <TransitionGroup name="message" tag="div" class="message-list">
    <MessageBubble
      v-for="message in messages"
      :key="message.id"
      :message="message"
    />
  </TransitionGroup>
</template>

<style scoped>
.message-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-enter-active,
.message-leave-active {
  transition: all 0.2s ease;
}

.message-enter-from,
.message-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
