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
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

@media (min-width: 600px) {
  .contact-list {
    gap: 12px;
    padding: 14px;
  }
}

@media (min-width: 981px) {
  .contact-list {
    padding: 16px;
  }
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  height: 40px;
  border-radius: 12px;
  border: 1.5px solid var(--border);
  padding: 0 12px;
  font-family: inherit;
  font-size: 14px;
  background: #fff;
  transition: all 0.2s ease;
  min-width: 0;
}

@media (min-width: 600px) {
  .search-input {
    height: 42px;
    border-radius: 14px;
    padding: 0 14px;
  }
}

.search-input:focus {
  outline: none;
  border-color: var(--primary, #0f766e);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
}

.new-contact {
  width: 40px;
  height: 40px;
  min-width: 40px;
  border-radius: 12px;
  border: 1.5px dashed var(--border);
  background: rgba(15, 118, 110, 0.06);
  color: var(--ink);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

@media (min-width: 600px) {
  .new-contact {
    width: 42px;
    height: 42px;
    min-width: 42px;
    border-radius: 14px;
  }
}

.new-contact:active {
  transform: scale(0.94);
  background: rgba(15, 118, 110, 0.12);
}

.contact-scroll {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

@media (min-width: 600px) {
  .contact-scroll {
    gap: 10px;
  }
}

.contact-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

@media (min-width: 600px) {
  .contact-card {
    gap: 12px;
    padding: 12px;
    border-radius: 16px;
  }
}

.contact-card:hover {
  border-color: var(--border);
  transform: translateY(-1px);
}

.contact-card:active {
  transform: scale(0.99);
}

.contact-card.active {
  border-color: rgba(15, 118, 110, 0.35);
  background: rgba(15, 118, 110, 0.08);
  box-shadow: 0 4px 16px rgba(15, 118, 110, 0.1);
}

.avatar {
  width: 40px;
  height: 40px;
  min-width: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 600;
  position: relative;
  font-size: 13px;
  overflow: hidden;
}

@media (min-width: 600px) {
  .avatar {
    width: 44px;
    height: 44px;
    min-width: 44px;
    border-radius: 14px;
    font-size: 14px;
  }
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
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 2px solid #fff;
  background: #94a3b8;
  transition: background 0.3s ease;
}

@media (min-width: 600px) {
  .status {
    width: 12px;
    height: 12px;
  }
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
  gap: 4px;
  min-width: 0;
}

@media (min-width: 600px) {
  .contact-main {
    gap: 6px;
  }
}

.contact-top,
.contact-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

@media (min-width: 600px) {
  .contact-top,
  .contact-bottom {
    gap: 12px;
  }
}

.contact-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (min-width: 600px) {
  .contact-name {
    font-size: 15px;
  }
}

.contact-time {
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
}

@media (min-width: 600px) {
  .contact-time {
    font-size: 12px;
  }
}

.contact-preview {
  font-size: 12px;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

@media (min-width: 600px) {
  .contact-preview {
    font-size: 13px;
  }
}

.unread {
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  background: linear-gradient(135deg, #f97316, #fb923c);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  padding: 0 6px;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(249, 115, 22, 0.3);
}

@media (min-width: 600px) {
  .unread {
    min-width: 22px;
    height: 22px;
    font-size: 12px;
  }
}
</style>
