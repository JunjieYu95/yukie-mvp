import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export type ContactType = 'assistant' | 'service' | 'system';
export type ContactStatus = 'online' | 'away' | 'offline';

export interface Contact {
  id: string;
  name: string;
  type: ContactType;
  subtitle?: string;
  status: ContactStatus;
  lastMessage?: string;
  lastMessageAt?: Date;
  unreadCount: number;
  pinned?: boolean;
  accent?: string;
  avatarUrl?: string;
}

const seedContacts: Contact[] = [
  {
    id: 'yukie',
    name: 'Yukie',
    subtitle: 'Master concierge',
    type: 'assistant',
    status: 'online',
    unreadCount: 0,
    pinned: true,
    accent: '#0f766e',
    avatarUrl: '/icons/yukie-avatar.png',
  },
  {
    id: 'diary-analyzer',
    name: 'Diary Analyzer',
    subtitle: 'Activity logging · Calendar',
    type: 'service',
    status: 'online',
    unreadCount: 0,
    accent: '#8b5cf6',
  },
  {
    id: 'early-wakeup',
    name: 'Early Wakeup',
    subtitle: 'Sleep discipline',
    type: 'service',
    status: 'away',
    unreadCount: 0,
    accent: '#06b6d4',
  },
  {
    id: 'momentum',
    name: 'Momentum',
    subtitle: 'Did it · Screwed it',
    type: 'service',
    status: 'online',
    unreadCount: 0,
    accent: '#22c55e',
  },
];

// Available public MCP services that can be added
export const availableMCPServices: Omit<Contact, 'unreadCount' | 'lastMessage' | 'lastMessageAt'>[] = [
  {
    id: 'gmail-mcp',
    name: 'Gmail',
    subtitle: 'Email management',
    type: 'service',
    status: 'online',
    accent: '#ea4335',
  },
  {
    id: 'calendar-mcp',
    name: 'Google Calendar',
    subtitle: 'Schedule & events',
    type: 'service',
    status: 'online',
    accent: '#4285f4',
  },
  {
    id: 'notion-mcp',
    name: 'Notion',
    subtitle: 'Notes & databases',
    type: 'service',
    status: 'online',
    accent: '#000000',
  },
  {
    id: 'slack-mcp',
    name: 'Slack',
    subtitle: 'Team messaging',
    type: 'service',
    status: 'online',
    accent: '#4a154b',
  },
  {
    id: 'github-mcp',
    name: 'GitHub',
    subtitle: 'Code & repos',
    type: 'service',
    status: 'online',
    accent: '#24292e',
  },
];

export const useContactsStore = defineStore('contacts', () => {
  const contacts = ref<Contact[]>([...seedContacts]);
  const activeContactId = ref<string>('yukie');

  const activeContact = computed(() =>
    contacts.value.find((contact) => contact.id === activeContactId.value) || null
  );

  const orderedContacts = computed(() => {
    const sorted = [...contacts.value].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const timeA = a.lastMessageAt?.getTime() || 0;
      const timeB = b.lastMessageAt?.getTime() || 0;
      return timeB - timeA;
    });
    return sorted;
  });

  function setActiveContact(contactId: string) {
    activeContactId.value = contactId;
    clearUnread(contactId);
  }

  function updateLastMessage(contactId: string, message: string, timestamp: Date) {
    const contact = contacts.value.find((item) => item.id === contactId);
    if (!contact) return;
    contact.lastMessage = message;
    contact.lastMessageAt = timestamp;
  }

  function incrementUnread(contactId: string) {
    const contact = contacts.value.find((item) => item.id === contactId);
    if (!contact) return;
    contact.unreadCount += 1;
  }

  function clearUnread(contactId: string) {
    const contact = contacts.value.find((item) => item.id === contactId);
    if (!contact) return;
    contact.unreadCount = 0;
  }

  function setStatus(contactId: string, status: ContactStatus) {
    const contact = contacts.value.find((item) => item.id === contactId);
    if (!contact) return;
    contact.status = status;
  }

  function addContact(contact: Omit<Contact, 'unreadCount' | 'lastMessage' | 'lastMessageAt'>) {
    // Check if contact already exists
    if (contacts.value.find((c) => c.id === contact.id)) {
      return false;
    }
    contacts.value.push({
      ...contact,
      unreadCount: 0,
    });
    return true;
  }

  function removeContact(contactId: string) {
    // Don't allow removing Yukie
    if (contactId === 'yukie') return false;

    const index = contacts.value.findIndex((c) => c.id === contactId);
    if (index === -1) return false;

    // If removing the active contact, switch to Yukie
    if (activeContactId.value === contactId) {
      activeContactId.value = 'yukie';
    }

    contacts.value.splice(index, 1);
    return true;
  }

  function hasContact(contactId: string) {
    return contacts.value.some((c) => c.id === contactId);
  }

  return {
    contacts,
    orderedContacts,
    activeContactId,
    activeContact,
    setActiveContact,
    updateLastMessage,
    incrementUnread,
    clearUnread,
    setStatus,
    addContact,
    removeContact,
    hasContact,
  };
});
