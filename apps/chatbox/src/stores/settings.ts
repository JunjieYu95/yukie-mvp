import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  family: 'haiku' | 'sonnet' | 'opus';
  tier: 'fast' | 'balanced' | 'advanced';
}

export const AVAILABLE_MODELS: ModelOption[] = [
  // Advanced tier - Most capable
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    description: 'Most capable, best for complex tasks',
    family: 'opus',
    tier: 'advanced',
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    description: 'High capability, great balance',
    family: 'sonnet',
    tier: 'advanced',
  },
  // Balanced tier
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    description: 'Previous gen flagship',
    family: 'sonnet',
    tier: 'balanced',
  },
  {
    id: 'claude-3-7-sonnet-20250219',
    name: 'Claude Sonnet 3.7',
    description: 'Extended thinking, reasoning',
    family: 'sonnet',
    tier: 'balanced',
  },
  // Fast tier
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude Haiku 3.5',
    description: 'Fast and efficient',
    family: 'haiku',
    tier: 'fast',
  },
];

const MODEL_KEY = 'yukie_selected_model';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929'; // Sonnet 4.5 as default (good balance)

export const useSettingsStore = defineStore('settings', () => {
  const selectedModel = ref<string>(
    // Load from localStorage or use default
    localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL
  );

  function setModel(modelId: string) {
    selectedModel.value = modelId;
    localStorage.setItem(MODEL_KEY, modelId);
  }

  const currentModel = () => {
    return AVAILABLE_MODELS.find((m) => m.id === selectedModel.value) || AVAILABLE_MODELS[0];
  };

  return {
    selectedModel,
    setModel,
    currentModel,
    availableModels: AVAILABLE_MODELS,
  };
});
