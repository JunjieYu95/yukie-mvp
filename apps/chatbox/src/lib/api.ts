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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
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
  model?: string
): Promise<ChatResponse> {
  return request<ChatResponse>(
    '/chat',
    {
      method: 'POST',
      body: JSON.stringify({ message, conversationId, model }),
    },
    token
  );
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
