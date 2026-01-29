// ============================================================================
// API Client for Yukie Core
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface ChatResponse {
  response: string;
  conversationId: string;
  asyncJobId?: string;
  serviceUsed?: string;
  actionInvoked?: string;
  routingDetails?: {
    targetService: string;
    tool?: string;
    confidence: number;
    reasoning: string;
  };
}

export interface InboxJob {
  id: string;
  userId: string;
  conversationId?: string;
  service: string;
  action: string;
  status: 'pending' | 'completed' | 'failed';
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxListResponse {
  jobs: InboxJob[];
  total: number;
  hasMore: boolean;
}

export interface InboxStats {
  total: number;
  pending: number;
  completed: number;
  failed: number;
}

export interface TranscriptionResponse {
  text: string;
  duration?: number;
  language?: string;
}

// ============================================================================
// HTTP Helpers
// ============================================================================

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const utcOffsetMinutes = -new Date().getTimezoneOffset();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Yukie-UTC-Offset-Minutes': String(utcOffsetMinutes),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Check if response is JSON before parsing
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    throw new ApiError(
      `Expected JSON but got ${contentType}. Response: ${text.substring(0, 100)}`,
      response.status
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.message || data.error || 'Request failed',
      response.status,
      data
    );
  }

  return data;
}

// ============================================================================
// Chat API
// ============================================================================

export async function sendChatMessage(
  message: string,
  conversationId?: string,
  token?: string,
  model?: string,
  targetService?: string
): Promise<ChatResponse> {
  return request<ChatResponse>(
    '/chat',
    {
      method: 'POST',
      body: JSON.stringify({ message, conversationId, model, targetService }),
    },
    token
  );
}

// ============================================================================
// Voice Transcription API
// ============================================================================

export async function transcribeAudio(
  audioBlob: Blob,
  token?: string
): Promise<TranscriptionResponse> {
  const formData = new FormData();

  // Determine file extension based on MIME type
  let extension = 'webm';
  if (audioBlob.type.includes('mp3') || audioBlob.type.includes('mpeg')) {
    extension = 'mp3';
  } else if (audioBlob.type.includes('wav')) {
    extension = 'wav';
  } else if (audioBlob.type.includes('m4a') || audioBlob.type.includes('mp4')) {
    extension = 'm4a';
  } else if (audioBlob.type.includes('ogg')) {
    extension = 'ogg';
  }

  formData.append('audio', audioBlob, `recording.${extension}`);

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/transcribe`, {
    method: 'POST',
    headers,
    body: formData,
  });

  // Check if response is JSON before parsing
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    throw new ApiError(
      `Expected JSON but got ${contentType}. Response: ${text.substring(0, 100)}`,
      response.status
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.message || data.error || 'Transcription failed',
      response.status,
      data
    );
  }

  return data as TranscriptionResponse;
}

// ============================================================================
// Inbox API
// ============================================================================

export async function getInbox(
  token: string,
  limit: number = 50,
  offset: number = 0
): Promise<InboxListResponse> {
  return request<InboxListResponse>(
    `/inbox?limit=${limit}&offset=${offset}`,
    { method: 'GET' },
    token
  );
}

export async function getInboxJob(token: string, jobId: string): Promise<InboxJob> {
  return request<InboxJob>(
    `/inbox/${jobId}`,
    { method: 'GET' },
    token
  );
}

export async function getInboxStats(token: string): Promise<InboxStats> {
  return request<InboxStats>(
    '/inbox/stats',
    { method: 'GET' },
    token
  );
}

// ============================================================================
// Health API
// ============================================================================

export async function checkHealth(): Promise<{ ok: boolean }> {
  try {
    const response = await fetch(`${API_BASE_URL.replace('/api', '')}/healthz`);
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}
