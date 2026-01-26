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
  },
  {
    id: 'habit-tracker',
    name: 'Habit Tracker',
    subtitle: 'Streaks · Check-ins',
    type: 'service',
    status: 'online',
    unreadCount: 0,
    accent: '#f97316',
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
  };
});
