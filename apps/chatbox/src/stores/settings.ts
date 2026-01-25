import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  family: 'haiku' | 'sonnet' | 'opus';
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude Haiku 3.5',
    description: 'Fast and efficient',
    family: 'haiku',
  },
  {
    id: 'claude-3-7-sonnet-20250219',
    name: 'Claude Sonnet 3.7',
    description: 'Balanced performance',
    family: 'sonnet',
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude Sonnet 3.5',
    description: 'Previous generation',
    family: 'sonnet',
  },
];

const MODEL_KEY = 'yukie_selected_model';

export const useSettingsStore = defineStore('settings', () => {
  const selectedModel = ref<string>(() => {
    // Load from localStorage or use default
    const saved = localStorage.getItem(MODEL_KEY);
    return saved || AVAILABLE_MODELS[0].id;
  });

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
