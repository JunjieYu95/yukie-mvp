import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAuthStore } from './auth';
import { useSettingsStore } from './settings';
import { useContactsStore } from './contacts';
import { sendChatMessage } from '../lib/api';

export interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  data?: string;  // base64 encoded image data
  mimeType?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status: 'sending' | 'sent' | 'error';
  serviceUsed?: string;
  actionInvoked?: string;
  structuredContent?: unknown;
  // Rich content (images, etc.)
  richContent?: MessageContent[];
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
  const contactsStore = useContactsStore();

  const conversations = ref<Map<string, Conversation>>(new Map());
  const activeConversationId = ref<string | null>(null);
  const conversationByContactId = ref<Map<string, string>>(new Map());
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const processingStatus = ref<{
    stage: 'routing' | 'fetching-actions' | 'invoking' | null;
    service?: string;
    action?: string;
  } | null>(null);

  // Target service for manual routing control
  const targetService = ref<string | null>(null);

  const messageQueue = ref<
    Array<{
      content: string;
      contactId: string;
      targetService: string | null;
      userMessageId: string;
      createdAt: Date;
    }>
  >([]);
  const isProcessingQueue = ref(false);

  const canSend = computed(() => {
    return authStore.isAuthenticated && !!contactsStore.activeContact;
  });

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

  function ensureConversation(contactId: string): string {
    const existing = conversationByContactId.value.get(contactId);
    if (existing) {
      activeConversationId.value = existing;
      return existing;
    }
    const newConversationId = createConversation();
    conversationByContactId.value.set(contactId, newConversationId);
    activeConversationId.value = newConversationId;
    return newConversationId;
  }

  function addMessage(
    message: Omit<Message, 'id' | 'timestamp' | 'status'>,
    contactId: string
  ): Message {
    const conversationId = ensureConversation(contactId);
    const conversation = conversations.value.get(conversationId)!;

    const newMessage: Message = {
      ...message,
      id: generateId(),
      timestamp: new Date(),
      status: message.role === 'user' ? 'sending' : 'sent',
    };

    conversation.messages.push(newMessage);
    conversation.updatedAt = new Date();

    contactsStore.updateLastMessage(contactId, message.content, newMessage.timestamp);
    if (message.role === 'assistant' && contactsStore.activeContactId !== contactId) {
      contactsStore.incrementUnread(contactId);
    }

    return newMessage;
  }

  function updateMessage(messageId: string, updates: Partial<Message>) {
    for (const conversation of conversations.value.values()) {
      const message = conversation.messages.find((m) => m.id === messageId);
      if (message) {
        Object.assign(message, updates);
        return;
      }
    }
  }

  async function processQueuedMessage(queueItem: {
    content: string;
    contactId: string;
    targetService: string | null;
    userMessageId: string;
    createdAt: Date;
  }) {
    processingStatus.value = queueItem.targetService
      ? { stage: 'fetching-actions', service: queueItem.targetService }
      : { stage: 'routing' };

    const progressInterval = setInterval(() => {
      if (!isLoading.value) {
        clearInterval(progressInterval);
        return;
      }

      const elapsed = Date.now() - queueItem.createdAt.getTime();
      if (elapsed > 2000 && processingStatus.value?.stage === 'routing') {
        processingStatus.value = { stage: 'fetching-actions', service: 'service' };
      } else if (elapsed > 3000 && processingStatus.value?.stage === 'fetching-actions') {
        processingStatus.value = { stage: 'invoking', service: 'service' };
      }
    }, 500);

    try {
      const conversationId = ensureConversation(queueItem.contactId);

      const response = await sendChatMessage(
        queueItem.content,
        conversationId,
        authStore.token!,
        settingsStore.selectedModel,
        queueItem.targetService || undefined
      );

      clearInterval(progressInterval);

      if (response.serviceUsed) {
        const serviceNameMap: Record<string, string> = {
          'habit-tracker': 'Habit Tracker',
          'momentum': 'Momentum',
          'diary-analyzer': 'Diary Analyzer',
          'workstyle': 'Workstyle',
          'ideas-log': 'Ideas Log',
        };
        processingStatus.value = {
          stage: 'invoking',
          service: serviceNameMap[response.serviceUsed] || response.serviceUsed,
          action: response.actionInvoked,
        };
      }

      updateMessage(queueItem.userMessageId, { status: 'sent' });

      addMessage(
        {
          role: 'assistant',
          content: response.response,
          serviceUsed: response.serviceUsed,
          actionInvoked: response.actionInvoked,
          structuredContent: response.structuredContent,
          richContent: response.content,
        },
        queueItem.contactId
      );

      if (response.routingDetails && response.routingDetails.targetService !== 'none') {
        const serviceNameMap: Record<string, string> = {
          'habit-tracker': 'Habit Tracker',
          'momentum': 'Momentum',
          'diary-analyzer': 'Diary Analyzer',
          'workstyle': 'Workstyle',
        };
        const serviceName =
          serviceNameMap[response.routingDetails.targetService] ||
          response.routingDetails.targetService;
        const toolName = response.routingDetails.tool || response.actionInvoked;

        addMessage(
          {
            role: 'system',
            content: `✓ Routed to ${serviceName} (${Math.round(response.routingDetails.confidence * 100)}% confidence)${toolName && toolName !== 'none' ? ` → ${toolName}` : ''}`,
          },
          queueItem.contactId
        );
      }

      if (response.conversationId !== conversationId) {
        if (contactsStore.activeContactId === queueItem.contactId) {
          activeConversationId.value = response.conversationId;
        }
        conversationByContactId.value.set(queueItem.contactId, response.conversationId);
      }
    } catch (err) {
      updateMessage(queueItem.userMessageId, { status: 'error' });
      error.value = err instanceof Error ? err.message : 'Failed to send message';

      addMessage(
        {
          role: 'system',
          content: 'Sorry, I had trouble processing your message. Please try again.',
        },
        queueItem.contactId
      );
    } finally {
      clearInterval(progressInterval);
    }
  }

  async function processQueue() {
    if (isProcessingQueue.value) return;

    isProcessingQueue.value = true;
    isLoading.value = true;

    while (messageQueue.value.length > 0) {
      const nextItem = messageQueue.value[0];
      await processQueuedMessage(nextItem);
      messageQueue.value.shift();
    }

    isLoading.value = false;
    processingStatus.value = null;
    isProcessingQueue.value = false;
  }

  async function sendMessage(content: string) {
    if (!authStore.isAuthenticated) {
      error.value = 'Not authenticated';
      return;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    const activeContact = contactsStore.activeContact;
    if (!activeContact) {
      error.value = 'No contact selected';
      return;
    }

    let effectiveTargetService = targetService.value;
    if (!effectiveTargetService && activeContact.type === 'service') {
      effectiveTargetService = activeContact.id;
    }

    error.value = null;

    const userMessage = addMessage(
      {
        role: 'user',
        content: trimmedContent,
      },
      activeContact.id
    );

    messageQueue.value.push({
      content: trimmedContent,
      contactId: activeContact.id,
      targetService: effectiveTargetService,
      userMessageId: userMessage.id,
      createdAt: userMessage.timestamp,
    });

    processQueue();
  }

  function clearConversation() {
    const activeContact = contactsStore.activeContact;
    if (!activeContact) return;
    const conversationId = conversationByContactId.value.get(activeContact.id);
    if (conversationId) {
      conversations.value.delete(conversationId);
      conversationByContactId.value.delete(activeContact.id);
    }
    activeConversationId.value = null;
    error.value = null;
    processingStatus.value = null;
  }

  function setActiveContact(contactId: string) {
    contactsStore.setActiveContact(contactId);
    const conversationId = conversationByContactId.value.get(contactId);
    activeConversationId.value = conversationId || null;
    // Clear target service when switching contacts
    targetService.value = null;
  }

  function setTargetService(serviceId: string | null) {
    targetService.value = serviceId;
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    messages,
    isLoading,
    error,
    processingStatus,
    targetService,
    canSend,
    createConversation,
    addMessage,
    sendMessage,
    clearConversation,
    setActiveContact,
    setTargetService,
  };
});
