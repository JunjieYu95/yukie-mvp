<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Contact } from '../stores/contacts';

const props = defineProps<{
  contacts: Contact[];
  activeId: string | null;
}>();

const emit = defineEmits<{
  select: [contactId: string];
}>();

const query = ref('');

const filteredContacts = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) return props.contacts;
  return props.contacts.filter((contact) =>
    [contact.name, contact.subtitle].filter(Boolean).some((value) =>
      value!.toLowerCase().includes(needle)
    )
  );
});

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function timeLabel(date?: Date) {
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
</script>

<template>
  <div class="contact-list">
    <div class="search-row">
      <input
        v-model="query"
        type="search"
        placeholder="Search contacts"
        class="search-input"
      />
      <button class="new-contact" title="Add contact (coming soon)">+</button>
    </div>

    <div class="contact-scroll">
      <button
        v-for="contact in filteredContacts"
        :key="contact.id"
        class="contact-card"
        :class="{ active: contact.id === activeId }"
        @click="emit('select', contact.id)"
      >
        <div class="avatar" :style="{ background: contact.accent || '#0f766e' }">
          <img v-if="contact.avatarUrl" :src="contact.avatarUrl" :alt="contact.name" />
          <span v-else>{{ initials(contact.name) }}</span>
          <span class="status" :class="contact.status"></span>
        </div>
        <div class="contact-main">
          <div class="contact-top">
            <span class="contact-name">{{ contact.name }}</span>
            <span class="contact-time">{{ timeLabel(contact.lastMessageAt) }}</span>
          </div>
          <div class="contact-bottom">
            <span class="contact-preview">
              {{ contact.lastMessage || contact.subtitle || 'No messages yet' }}
            </span>
            <span v-if="contact.unreadCount" class="unread">{{ contact.unreadCount }}</span>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.contact-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  flex: 1;
  height: 40px;
  border-radius: 14px;
  border: 1px solid var(--border);
  padding: 0 14px;
  font-family: inherit;
  font-size: 14px;
  background: #fff;
}

.new-contact {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  border: 1px dashed var(--border);
  background: rgba(15, 118, 110, 0.08);
  color: var(--ink);
  font-size: 18px;
  cursor: pointer;
}

.contact-scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.contact-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.contact-card:hover {
  border-color: var(--border);
  transform: translateY(-1px);
}

.contact-card.active {
  border-color: rgba(15, 118, 110, 0.4);
  background: rgba(15, 118, 110, 0.08);
  box-shadow: 0 8px 20px rgba(15, 118, 110, 0.12);
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 600;
  position: relative;
  font-size: 14px;
  overflow: hidden;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.status {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid #fff;
  background: #94a3b8;
}

.status.online {
  background: #22c55e;
}

.status.away {
  background: #f59e0b;
}

.status.offline {
  background: #94a3b8;
}

.contact-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.contact-top,
.contact-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.contact-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}

.contact-time {
  font-size: 12px;
  color: var(--muted);
}

.contact-preview {
  font-size: 13px;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.unread {
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #f97316;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 600;
}

@media (max-width: 720px) {
  .contact-list {
    padding: 12px;
  }
}
</style>
