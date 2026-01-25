import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAuthStore } from './auth';
import { useSettingsStore } from './settings';
import { sendChatMessage } from '../lib/api';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status: 'sending' | 'sent' | 'error';
  serviceUsed?: string;
  actionInvoked?: string;
}

export interface Conversation {
  id: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export const useChatStore = defineStore('chat', () => {
  const authStore = useAuthStore();
  const settingsStore = useSettingsStore();

  const conversations = ref<Map<string, Conversation>>(new Map());
  const activeConversationId = ref<string | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const processingStatus = ref<{
    stage: 'routing' | 'fetching-actions' | 'invoking' | null;
    service?: string;
    action?: string;
  } | null>(null);

  const activeConversation = computed(() => {
    if (!activeConversationId.value) return null;
    return conversations.value.get(activeConversationId.value) || null;
  });

  const messages = computed(() => {
    return activeConversation.value?.messages || [];
  });

  function generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  function createConversation(): string {
    const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();

    conversations.value.set(id, {
      id,
      messages: [],
      createdAt: now,
      updatedAt: now,
    });

    activeConversationId.value = id;
    return id;
  }

  function ensureConversation(): string {
    if (!activeConversationId.value) {
      return createConversation();
    }
    return activeConversationId.value;
  }

  function addMessage(message: Omit<Message, 'id' | 'timestamp' | 'status'>): Message {
    const conversationId = ensureConversation();
    const conversation = conversations.value.get(conversationId)!;

    const newMessage: Message = {
      ...message,
      id: generateId(),
      timestamp: new Date(),
      status: message.role === 'user' ? 'sending' : 'sent',
    };

    conversation.messages.push(newMessage);
    conversation.updatedAt = new Date();

    return newMessage;
  }

  function updateMessage(messageId: string, updates: Partial<Message>) {
    const conversation = activeConversation.value;
    if (!conversation) return;

    const message = conversation.messages.find((m) => m.id === messageId);
    if (message) {
      Object.assign(message, updates);
    }
  }

  async function sendMessage(content: string) {
    if (!authStore.isAuthenticated) {
      error.value = 'Not authenticated';
      return;
    }

    if (!content.trim()) return;

    error.value = null;
    isLoading.value = true;
    processingStatus.value = { stage: 'routing' };

    // Add user message
    const userMessage = addMessage({
      role: 'user',
      content: content.trim(),
    });

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      if (!isLoading.value) {
        clearInterval(progressInterval);
        return;
      }
      
      // Update status based on elapsed time
      const elapsed = Date.now() - userMessage.timestamp.getTime();
      if (elapsed > 2000 && processingStatus.value?.stage === 'routing') {
        processingStatus.value = { stage: 'fetching-actions', service: 'service' };
      } else if (elapsed > 3000 && processingStatus.value?.stage === 'fetching-actions') {
        processingStatus.value = { stage: 'invoking', service: 'service' };
      }
    }, 500);

    try {
      const conversationId = ensureConversation();

      const response = await sendChatMessage(
        content.trim(),
        conversationId,
        authStore.token!,
        settingsStore.selectedModel
      );

      clearInterval(progressInterval);

      // Update status with actual service info
      if (response.serviceUsed) {
        processingStatus.value = {
          stage: 'invoking',
          service: response.serviceUsed,
          action: response.actionInvoked,
        };
      }

      // Update user message status
      updateMessage(userMessage.id, { status: 'sent' });

      // Add assistant response
      addMessage({
        role: 'assistant',
        content: response.response,
        serviceUsed: response.serviceUsed,
        actionInvoked: response.actionInvoked,
      });

      // Show routing details if available
      if (response.routingDetails && response.routingDetails.targetService !== 'none') {
        // Add a system message showing what happened
        const serviceName = response.routingDetails.targetService === 'habit-tracker' 
          ? 'Habit Tracker' 
          : response.routingDetails.targetService;
        addMessage({
          role: 'system',
          content: `✓ Routed to ${serviceName} (${Math.round(response.routingDetails.confidence * 100)}% confidence)${response.actionInvoked ? ` → ${response.actionInvoked}` : ''}`,
        });
      }

      // Update conversation ID if server returned a different one
      if (response.conversationId !== conversationId) {
        activeConversationId.value = response.conversationId;
      }
    } catch (err) {
      clearInterval(progressInterval);
      updateMessage(userMessage.id, { status: 'error' });
      error.value = err instanceof Error ? err.message : 'Failed to send message';

      // Add error message
      addMessage({
        role: 'system',
        content: 'Sorry, I had trouble processing your message. Please try again.',
      });
    } finally {
      isLoading.value = false;
      processingStatus.value = null;
    }
  }

  function clearConversation() {
    if (activeConversationId.value) {
      conversations.value.delete(activeConversationId.value);
    }
    activeConversationId.value = null;
    error.value = null;
    processingStatus.value = null;
  }

  function switchConversation(conversationId: string) {
    if (conversations.value.has(conversationId)) {
      activeConversationId.value = conversationId;
    }
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    messages,
    isLoading,
    error,
    processingStatus,
    createConversation,
    addMessage,
    sendMessage,
    clearConversation,
    switchConversation,
  };
});
