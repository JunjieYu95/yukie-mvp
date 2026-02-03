import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAuthStore } from './auth';
import { useSettingsStore } from './settings';
import { useContactsStore } from './contacts';
import { sendChatMessage } from '../lib/api';
import {
  openclawCheckConnection,
  openclawCheckConnectionProxy,
  openclawSendMessage,
  openclawSendMessageProxy,
  setOpenClawChatEventHandler,
  stopOpenClawClient,
} from '../lib/api-openclaw';

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
  const loadingContactIds = ref<Set<string>>(new Set());
  const error = ref<string | null>(null);
  const processingStatusByContactId = ref<Map<string, {
    stage: 'routing' | 'fetching-actions' | 'invoking' | null;
    service?: string;
    action?: string;
  }>>(new Map());
  const openclawActiveMessageId = ref<string | null>(null);
  const openclawLastTextByMessageId = ref<Record<string, string>>({});
  const openclawStatus = ref<'online' | 'offline' | 'connecting' | 'not_configured'>('offline');
  const openclawStatusDetail = ref<string | null>(null);

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

  // Per-contact loading state - only shows loading for the currently active contact
  const isActiveContactLoading = computed(() => {
    const activeId = contactsStore.activeContactId;
    if (!activeId) return false;
    return loadingContactIds.value.has(activeId);
  });

  // Global loading state - backwards compatibility (true if any contact is loading)
  const isLoading = computed(() => loadingContactIds.value.size > 0);

  // Processing status for the active contact
  const processingStatus = computed(() => {
    const activeId = contactsStore.activeContactId;
    if (!activeId) return null;
    return processingStatusByContactId.value.get(activeId) || null;
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

  function setMessageContent(messageId: string, content: string) {
    for (const conversation of conversations.value.values()) {
      const message = conversation.messages.find((m) => m.id === messageId);
      if (message) {
        message.content = content;
        return;
      }
    }
  }

  function tryGetOpenClawConfig() {
    const url = import.meta.env.VITE_OPENCLAW_GATEWAY_URL as string | undefined;
    const token = import.meta.env.VITE_OPENCLAW_TOKEN as string | undefined;
    if (!url || !token) return null;
    return { url, token };
  }

  async function refreshOpenClawStatus() {
    const config = tryGetOpenClawConfig();
    const canUseProxy = authStore.isAuthenticated;

    openclawStatus.value = 'connecting';
    openclawStatusDetail.value = null;
    try {
      if (config) {
        const res = await openclawCheckConnection(config);
        openclawStatus.value = res.connected ? 'online' : 'offline';
      } else if (canUseProxy) {
        const res = await openclawCheckConnectionProxy(authStore.token);
        openclawStatus.value = res.connected ? 'online' : 'offline';
        openclawStatusDetail.value = res.message || null;
      } else {
        openclawStatus.value = 'not_configured';
        openclawStatusDetail.value = 'Missing gateway URL/token';
      }
    } catch (err) {
      openclawStatus.value = 'offline';
      openclawStatusDetail.value = err instanceof Error ? err.message : 'Connection failed';
    }
  }

  async function processQueuedMessage(queueItem: {
    content: string;
    contactId: string;
    targetService: string | null;
    userMessageId: string;
    createdAt: Date;
  }) {
    // Set loading state for this specific contact
    loadingContactIds.value.add(queueItem.contactId);
    processingStatusByContactId.value.set(
      queueItem.contactId,
      queueItem.targetService
        ? { stage: 'fetching-actions', service: queueItem.targetService }
        : { stage: 'routing' }
    );

    const progressInterval = setInterval(() => {
      if (!loadingContactIds.value.has(queueItem.contactId)) {
        clearInterval(progressInterval);
        return;
      }

      const currentStatus = processingStatusByContactId.value.get(queueItem.contactId);
      const elapsed = Date.now() - queueItem.createdAt.getTime();
      if (elapsed > 2000 && currentStatus?.stage === 'routing') {
        processingStatusByContactId.value.set(queueItem.contactId, { stage: 'fetching-actions', service: 'service' });
      } else if (elapsed > 3000 && currentStatus?.stage === 'fetching-actions') {
        processingStatusByContactId.value.set(queueItem.contactId, { stage: 'invoking', service: 'service' });
      }
    }, 500);

    try {
      const conversationId = ensureConversation(queueItem.contactId);
      const activeContact = contactsStore.contacts.find((c) => c.id === queueItem.contactId);

      if (activeContact?.transport === 'openclaw') {
        openclawStatus.value = 'connecting';
        openclawStatusDetail.value = null;

        const config = tryGetOpenClawConfig();
        const canUseProxy = authStore.isAuthenticated;

        if (!config && !canUseProxy) {
          throw new Error('OpenClaw is not configured. Set VITE_OPENCLAW_GATEWAY_URL and VITE_OPENCLAW_TOKEN.');
        }

        if (config) {
          const assistantMessage = addMessage(
            {
              role: 'assistant',
              content: '',
            },
            queueItem.contactId
          );

          openclawActiveMessageId.value = assistantMessage.id;
          setOpenClawChatEventHandler((evt) => {
            if (openclawActiveMessageId.value !== assistantMessage.id) return;
            if (evt.state === 'delta' && evt.text) {
              const lastText = openclawLastTextByMessageId.value[assistantMessage.id] || '';
              if (evt.text !== lastText) {
                setMessageContent(assistantMessage.id, evt.text);
                openclawLastTextByMessageId.value[assistantMessage.id] = evt.text;
              }
            } else if (evt.state === 'final') {
              openclawActiveMessageId.value = null;
              delete openclawLastTextByMessageId.value[assistantMessage.id];
              setOpenClawChatEventHandler(null);
            } else if (evt.state === 'aborted') {
              addMessage(
                {
                  role: 'system',
                  content: 'OpenClaw message aborted.',
                },
                queueItem.contactId
              );
              openclawActiveMessageId.value = null;
              delete openclawLastTextByMessageId.value[assistantMessage.id];
              setOpenClawChatEventHandler(null);
            } else if (evt.state === 'error') {
              addMessage(
                {
                  role: 'system',
                  content: evt.error || 'OpenClaw error.',
                },
                queueItem.contactId
              );
              openclawActiveMessageId.value = null;
              delete openclawLastTextByMessageId.value[assistantMessage.id];
              setOpenClawChatEventHandler(null);
            }
          });

          processingStatusByContactId.value.set(queueItem.contactId, { stage: 'invoking', service: 'OpenClaw' });
          await openclawSendMessage(config, queueItem.content, 'main');
          openclawStatus.value = 'online';
        } else {
          processingStatusByContactId.value.set(queueItem.contactId, { stage: 'invoking', service: 'OpenClaw' });
          const proxyResponse = await openclawSendMessageProxy(authStore.token, queueItem.content, 'main');
          addMessage(
            {
              role: 'assistant',
              content: proxyResponse.text || '',
            },
            queueItem.contactId
          );
          openclawStatus.value = 'online';
        }

        updateMessage(queueItem.userMessageId, { status: 'sent' });
        clearInterval(progressInterval);
        return;
      }

      const response = await sendChatMessage(
        queueItem.content,
        conversationId,
        undefined,
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
        processingStatusByContactId.value.set(queueItem.contactId, {
          stage: 'invoking',
          service: serviceNameMap[response.serviceUsed] || response.serviceUsed,
          action: response.actionInvoked,
        });
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
      if (openclawActiveMessageId.value) {
        openclawActiveMessageId.value = null;
        setOpenClawChatEventHandler(null);
        stopOpenClawClient();
      }
      openclawStatus.value = 'offline';
      openclawStatusDetail.value = err instanceof Error ? err.message : 'Connection failed';
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

    while (messageQueue.value.length > 0) {
      const nextItem = messageQueue.value[0];
      await processQueuedMessage(nextItem);
      // Clear loading state for this contact after processing
      loadingContactIds.value.delete(nextItem.contactId);
      processingStatusByContactId.value.delete(nextItem.contactId);
      messageQueue.value.shift();
    }

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
    // Clear loading state for this contact
    loadingContactIds.value.delete(activeContact.id);
    processingStatusByContactId.value.delete(activeContact.id);
  }

  function setActiveContact(contactId: string) {
    contactsStore.setActiveContact(contactId);
    const conversationId = conversationByContactId.value.get(contactId);
    activeConversationId.value = conversationId || null;
    // Clear target service when switching contacts
    targetService.value = null;

    if (contactId === 'openclaw') {
      refreshOpenClawStatus();
    }
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
    isActiveContactLoading,
    error,
    processingStatus,
    targetService,
    openclawStatus,
    openclawStatusDetail,
    canSend,
    createConversation,
    addMessage,
    sendMessage,
    clearConversation,
    setActiveContact,
    setTargetService,
    refreshOpenClawStatus,
  };
});
