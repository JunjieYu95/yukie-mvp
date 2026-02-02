import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface AuthState {
  token: string | null;
  userId: string | null;
  scopes: string[];
}

const USER_ID_KEY = 'yukie_user_id';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null);
  const userId = ref<string | null>(null);
  const scopes = ref<string[]>([]);

  const isAuthenticated = computed(() => !!userId.value);

  function initialize() {
    const savedUserId = localStorage.getItem(USER_ID_KEY);
    if (savedUserId) {
      userId.value = savedUserId;
    }
    refreshSession();
  }

  function setAuth(newUserId: string, newScopes: string[] = []) {
    userId.value = newUserId;
    scopes.value = newScopes;
    localStorage.setItem(USER_ID_KEY, newUserId);
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Failed to logout:', error);
    } finally {
      token.value = null;
      userId.value = null;
      scopes.value = [];
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_ID_KEY);
    }
  }

  async function refreshSession() {
    try {
      const response = await fetch('/api/auth/me', { method: 'GET' });
      if (!response.ok) return;
      const data = (await response.json()) as { userId?: string; scopes?: string[] };
      if (data.userId) {
        setAuth(data.userId, data.scopes || []);
      }
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }
  }

  async function login(password: string) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      let data: any;
      if (isJson) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Expected JSON but got ${contentType}. Response: ${text.substring(0, 200)}`);
      }

      // Check if response was successful after parsing
      if (!response.ok) {
        const errorMessage = data.message || data.error || 'Failed to login';
        throw new Error(errorMessage);
      }

      if (data.userId) {
        setAuth(data.userId, data.scopes || []);
      }
    } catch (error) {
      console.error('Failed to login:', error);
      throw error;
    }
  }

  function hasScope(scope: string): boolean {
    return scopes.value.includes(scope);
  }

  function hasScopes(requiredScopes: string[]): boolean {
    return requiredScopes.every((s) => scopes.value.includes(s));
  }

  return {
    token,
    userId,
    scopes,
    isAuthenticated,
    initialize,
    refreshSession,
    setAuth,
    logout,
    login,
    hasScope,
    hasScopes,
  };
});
