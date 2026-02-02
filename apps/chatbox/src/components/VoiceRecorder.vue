<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { transcribeAudio } from '../lib/api';

// ============================================================================
// Props & Emits
// ============================================================================

const props = defineProps<{
  disabled?: boolean;
  variant?: 'icon' | 'hold';
}>();

const emit = defineEmits<{
  transcription: [text: string];
  error: [message: string];
}>();

// ============================================================================
// State
// ============================================================================


type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing';

const state = ref<RecordingState>('idle');
const recordingDuration = ref(0);
const errorMessage = ref<string | null>(null);
const isPressing = ref(false);
const stopAfterStart = ref(false);

// MediaRecorder instances
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let durationInterval: ReturnType<typeof setInterval> | null = null;
let audioStream: MediaStream | null = null;

// ============================================================================
// Computed
// ============================================================================

const isRecording = computed(() => state.value === 'recording');
const isProcessing = computed(() => state.value === 'processing');
const isRequesting = computed(() => state.value === 'requesting');
const isActive = computed(() => state.value !== 'idle');
const isHoldVariant = computed(() => props.variant === 'hold');

const formattedDuration = computed(() => {
  const minutes = Math.floor(recordingDuration.value / 60);
  const seconds = recordingDuration.value % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

const statusText = computed(() => {
  switch (state.value) {
    case 'requesting':
      return 'Requesting microphone...';
    case 'recording':
      return 'Recording...';
    case 'processing':
      return 'Transcribing...';
    default:
      return '';
  }
});

// ============================================================================
// Recording Functions
// ============================================================================

async function startRecording() {
  if (state.value !== 'idle') return;

  errorMessage.value = null;
  state.value = 'requesting';

  try {
    // Request microphone permission
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100,
      },
    });

    // Determine best supported MIME type
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];

    let selectedMimeType = '';
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType;
        break;
      }
    }

    if (!selectedMimeType) {
      throw new Error('No supported audio format found in this browser');
    }

    // Create MediaRecorder
    mediaRecorder = new MediaRecorder(audioStream, {
      mimeType: selectedMimeType,
    });

    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      await processRecording();
    };

    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event);
      handleError('Recording failed. Please try again.');
    };

    // Start recording
    mediaRecorder.start(100); // Collect data every 100ms
    state.value = 'recording';
    recordingDuration.value = 0;

    // Start duration timer
    durationInterval = setInterval(() => {
      recordingDuration.value++;
    }, 1000);

    if (stopAfterStart.value) {
      stopAfterStart.value = false;
      stopRecording();
    }
  } catch (error) {
    console.error('Failed to start recording:', error);

    if (error instanceof Error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        handleError('Microphone access denied. Please allow microphone access in your browser settings.');
      } else if (error.name === 'NotFoundError') {
        handleError('No microphone found. Please connect a microphone and try again.');
      } else {
        handleError(error.message || 'Failed to start recording');
      }
    } else {
      handleError('Failed to start recording');
    }
  }
}

function stopRecording() {
  if (state.value !== 'recording' || !mediaRecorder) return;

  // Stop duration timer
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }

  // Stop recording
  mediaRecorder.stop();
  state.value = 'processing';
}

function cancelRecording() {
  cleanup();
  state.value = 'idle';
  recordingDuration.value = 0;
  errorMessage.value = null;
}

async function processRecording() {
  if (audioChunks.length === 0) {
    handleError('No audio recorded');
    return;
  }

  try {
    // Create blob from chunks
    const mimeType = mediaRecorder?.mimeType || 'audio/webm';
    const audioBlob = new Blob(audioChunks, { type: mimeType });

    // Check minimum size (very short recordings might not have useful content)
    if (audioBlob.size < 1000) {
      handleError('Recording too short. Please try again.');
      return;
    }

    // Clean up streams before API call
    cleanup();

    // Send to transcription API
    const result = await transcribeAudio(audioBlob, undefined);

    if (result.text && result.text.trim()) {
      emit('transcription', result.text.trim());
    } else {
      handleError('No speech detected. Please try again.');
    }
  } catch (error) {
    console.error('Transcription error:', error);

    if (error instanceof Error) {
      handleError(error.message || 'Transcription failed');
    } else {
      handleError('Transcription failed');
    }
  } finally {
    state.value = 'idle';
    recordingDuration.value = 0;
  }
}

function handleError(message: string) {
  errorMessage.value = message;
  emit('error', message);
  cleanup();
  state.value = 'idle';
  recordingDuration.value = 0;
  isPressing.value = false;
  stopAfterStart.value = false;
}

function cleanup() {
  // Stop timer
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }

  // Stop and cleanup media recorder
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch {
      // Ignore errors when stopping
    }
  }
  mediaRecorder = null;
  audioChunks = [];

  // Stop all audio tracks
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = null;
  }
}

function dismissError() {
  errorMessage.value = null;
}

function handlePressStart(event: PointerEvent) {
  if (props.disabled || isProcessing.value) return;
  if (event.button !== 0) return;
  const target = event.currentTarget as HTMLElement | null;
  if (target && event.pointerId !== undefined) {
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Ignore if capture is not supported
    }
  }
  isPressing.value = true;
  stopAfterStart.value = false;
  startRecording();
}

function handlePressEnd(event?: PointerEvent) {
  if (!isPressing.value) return;
  if (event?.currentTarget && event.pointerId !== undefined) {
    const target = event.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore if release is not supported
    }
  }
  isPressing.value = false;

  if (state.value === 'recording') {
    stopRecording();
  } else if (state.value === 'requesting') {
    stopAfterStart.value = true;
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.repeat) return;
  if (event.key !== ' ' && event.key !== 'Enter') return;
  event.preventDefault();
  if (props.disabled || isProcessing.value) return;
  isPressing.value = true;
  stopAfterStart.value = false;
  startRecording();
}

function handleKeyup(event: KeyboardEvent) {
  if (event.key !== ' ' && event.key !== 'Enter') return;
  event.preventDefault();
  handlePressEnd();
}

// ============================================================================
// Lifecycle
// ============================================================================

onUnmounted(() => {
  cleanup();
});

// ============================================================================
// Exposed for parent component
// ============================================================================

defineExpose({
  startRecording,
  stopRecording,
  cancelRecording,
  isRecording,
  isProcessing,
  isActive,
});
</script>

<template>
  <div class="voice-recorder" :class="{ hold: isHoldVariant }">
    <!-- Recording Button -->
    <button
      class="voice-button"
      :class="{
        recording: isRecording,
        processing: isProcessing,
        requesting: isRequesting,
        hold: isHoldVariant,
      }"
      :disabled="props.disabled || isProcessing"
      :title="
        isRecording
          ? 'Release to stop recording'
          : isProcessing
            ? 'Transcribing...'
            : 'Hold to talk'
      "
      aria-label="Hold to talk"
      :aria-pressed="isRecording"
      :aria-busy="isProcessing"
      @pointerdown.prevent="handlePressStart"
      @pointerup="handlePressEnd"
      @pointercancel="handlePressEnd"
      @contextmenu.prevent
      @selectstart.prevent
      @keydown="handleKeydown"
      @keyup="handleKeyup"
    >
      <!-- Microphone icon (idle state) -->
      <svg
        v-if="!isActive"
        class="icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>

      <!-- Stop icon (recording state) -->
      <svg
        v-else-if="isRecording"
        class="icon stop-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>

      <!-- Spinner icon (processing state) -->
      <svg
        v-else
        class="icon spinner"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>

      <span v-if="isHoldVariant" class="hold-label">
        {{ isRecording ? 'Release to stop' : 'Hold to Talk' }}
      </span>

      <!-- Recording pulse animation -->
      <span v-if="isRecording" class="pulse" />
    </button>

    <!-- Recording Overlay -->
    <Transition name="fade">
      <div v-if="isActive" class="recording-overlay">
        <div class="overlay-content">
          <span class="status-text">{{ statusText }}</span>
          <span v-if="isRecording" class="duration">{{ formattedDuration }}</span>
          <button
            v-if="isRecording"
            class="cancel-button"
            title="Cancel recording"
            @click="cancelRecording"
          >
            Cancel
          </button>
        </div>
      </div>
    </Transition>

    <!-- Error Toast -->
    <Transition name="slide-up">
      <div v-if="errorMessage" class="error-toast" @click="dismissError">
        <span class="error-icon">!</span>
        <span class="error-message">{{ errorMessage }}</span>
        <button class="dismiss-button" title="Dismiss">&times;</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.voice-recorder {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.voice-recorder.hold {
  width: 100%;
}

.voice-button {
  width: 48px;
  height: 48px;
  min-width: 48px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(15, 23, 42, 0.04);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: none;
}

.voice-button.hold {
  width: 100%;
  min-width: 0;
  height: 52px;
  border-radius: 14px;
  gap: 10px;
  padding: 0 16px;
  justify-content: center;
}

@media (min-width: 600px) {
  .voice-button {
    width: 52px;
    height: 52px;
    min-width: 52px;
    border-radius: 14px;
  }

  .voice-button.hold {
    height: 56px;
    border-radius: 16px;
  }
}

.voice-button:not(:disabled):hover {
  background: rgba(15, 23, 42, 0.08);
}

.voice-button:not(:disabled):active {
  transform: scale(0.94);
}

.voice-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.voice-button.recording {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  border-color: #ef4444;
  color: white;
}

.voice-button.processing {
  background: linear-gradient(135deg, var(--primary, #0f766e), #14b8a6);
  border-color: var(--primary, #0f766e);
  color: white;
}

.voice-button.requesting {
  background: rgba(15, 23, 42, 0.08);
  animation: pulse-bg 1s ease-in-out infinite;
}

@keyframes pulse-bg {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.icon {
  width: 18px;
  height: 18px;
}

.hold-label {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

@media (min-width: 600px) {
  .icon {
    width: 20px;
    height: 20px;
  }
}

.stop-icon {
  animation: pulse-icon 0.5s ease-in-out infinite;
}

@keyframes pulse-icon {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(0.9);
  }
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.pulse {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.3);
  animation: pulse-ring 1.5s ease-out infinite;
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

/* Recording Overlay */
.recording-overlay {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--panel, #ffffff);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  white-space: nowrap;
  z-index: 10;
}

.overlay-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-text {
  font-size: 13px;
  color: var(--muted, #64748b);
}

.duration {
  font-size: 14px;
  font-weight: 600;
  color: #ef4444;
  font-variant-numeric: tabular-nums;
}

.cancel-button {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--muted, #64748b);
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-button:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #ef4444;
}

/* Error Toast */
.error-toast {
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  z-index: 100;
  max-width: calc(100vw - 32px);
}

.error-icon {
  width: 20px;
  height: 20px;
  min-width: 20px;
  border-radius: 50%;
  background: #ef4444;
  color: white;
  font-size: 12px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-message {
  font-size: 14px;
  color: #991b1b;
  flex: 1;
}

.dismiss-button {
  background: transparent;
  border: none;
  color: #991b1b;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px);
}
</style>
