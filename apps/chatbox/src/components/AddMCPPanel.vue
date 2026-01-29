<script setup lang="ts">
import { computed } from 'vue';
import { useContactsStore, availableMCPServices } from '../stores/contacts';

const contactsStore = useContactsStore();

const emit = defineEmits<{
  close: [];
}>();

// Filter out services that are already added
const availableToAdd = computed(() => {
  return availableMCPServices.filter(
    (service) => !contactsStore.hasContact(service.id)
  );
});

// Services that can be removed (current contacts minus Yukie)
const removableContacts = computed(() => {
  return contactsStore.contacts.filter(
    (c) => c.type === 'service'
  );
});

function addService(serviceId: string) {
  const service = availableMCPServices.find((s) => s.id === serviceId);
  if (service) {
    contactsStore.addContact(service);
  }
}

function removeService(serviceId: string) {
  contactsStore.removeContact(serviceId);
}
</script>

<template>
  <div class="add-mcp-panel">
    <div class="panel-header">
      <h3>Manage MCP Services</h3>
      <button class="close-button" @click="emit('close')">&times;</button>
    </div>

    <div class="panel-content">
      <!-- Current services -->
      <div v-if="removableContacts.length > 0" class="section">
        <h4>Your Services</h4>
        <div class="service-list">
          <div
            v-for="contact in removableContacts"
            :key="contact.id"
            class="service-item"
          >
            <div class="service-avatar" :style="{ background: contact.accent }">
              {{ contact.name.charAt(0) }}
            </div>
            <div class="service-info">
              <span class="service-name">{{ contact.name }}</span>
              <span class="service-subtitle">{{ contact.subtitle }}</span>
            </div>
            <button
              class="remove-button"
              title="Remove service"
              @click="removeService(contact.id)"
            >
              -
            </button>
          </div>
        </div>
      </div>

      <!-- Available to add -->
      <div class="section">
        <h4>Add Public MCP Services</h4>
        <div v-if="availableToAdd.length === 0" class="empty-message">
          All available services have been added.
        </div>
        <div v-else class="service-list">
          <div
            v-for="service in availableToAdd"
            :key="service.id"
            class="service-item"
          >
            <div class="service-avatar" :style="{ background: service.accent }">
              {{ service.name.charAt(0) }}
            </div>
            <div class="service-info">
              <span class="service-name">{{ service.name }}</span>
              <span class="service-subtitle">{{ service.subtitle }}</span>
            </div>
            <button
              class="add-button"
              title="Add service"
              @click="addService(service.id)"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <p class="note">
        Note: These are example MCP services. Connect your own MCP servers to enable real functionality.
      </p>
    </div>
  </div>
</template>

<style scoped>
.add-mcp-panel {
  position: absolute;
  top: 60px;
  left: 12px;
  right: 12px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.15);
  z-index: 100;
  max-height: calc(100vh - 120px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(135deg, rgba(15, 118, 110, 0.06), rgba(249, 115, 22, 0.06));
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
}

.close-button {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-button:hover {
  background: rgba(0, 0, 0, 0.1);
}

.panel-content {
  padding: 16px;
  overflow-y: auto;
}

.section {
  margin-bottom: 20px;
}

.section h4 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.service-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.service-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(15, 23, 42, 0.03);
  border-radius: 12px;
  transition: background 0.2s ease;
}

.service-item:hover {
  background: rgba(15, 23, 42, 0.06);
}

.service-avatar {
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 14px;
}

.service-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.service-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.service-subtitle {
  font-size: 12px;
  color: var(--muted);
}

.add-button,
.remove-button {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 8px;
  border: none;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.add-button {
  background: linear-gradient(135deg, var(--primary, #0f766e), #14b8a6);
  color: white;
}

.add-button:hover {
  transform: scale(1.05);
}

.remove-button {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.remove-button:hover {
  background: rgba(239, 68, 68, 0.2);
}

.empty-message {
  padding: 16px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  background: rgba(15, 23, 42, 0.03);
  border-radius: 12px;
}

.note {
  margin: 0;
  padding: 12px;
  font-size: 12px;
  color: var(--muted);
  background: rgba(249, 115, 22, 0.08);
  border-radius: 10px;
  line-height: 1.5;
}
</style>
