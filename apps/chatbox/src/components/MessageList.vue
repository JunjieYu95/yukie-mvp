<script setup lang="ts">
import type { Message } from '../stores/chat';
import MessageBubble from './MessageBubble.vue';

defineProps<{
  messages: Message[];
}>();
</script>

<template>
  <div class="message-list">
    <MessageBubble
      v-for="message in messages"
      :key="message.id"
      :message="message"
    />
  </div>
</template>

<style scoped>
.message-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
