import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface AuthState {
  token: string | null;
  userId: string | null;
  scopes: string[];
}

const TOKEN_KEY = 'yukie_token';
const USER_ID_KEY = 'yukie_user_id';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null);
  const userId = ref<string | null>(null);
  const scopes = ref<string[]>([]);

  const isAuthenticated = computed(() => !!token.value && !!userId.value);

  function initialize() {
    // Load from localStorage
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUserId = localStorage.getItem(USER_ID_KEY);

    if (savedToken && savedUserId) {
      token.value = savedToken;
      userId.value = savedUserId;
      // Decode scopes from token (simplified - in production, properly decode JWT)
      scopes.value = ['yukie:chat', 'yukie:inbox', 'habit:read', 'habit:write'];
    }
  }

  function setAuth(newToken: string, newUserId: string, newScopes: string[] = []) {
    token.value = newToken;
    userId.value = newUserId;
    scopes.value = newScopes;

    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_ID_KEY, newUserId);
  }

  function logout() {
    token.value = null;
    userId.value = null;
    scopes.value = [];

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
  }

  // Dev login for testing
  async function loginDev() {
    try {
      // Call the dev token endpoint
      const response = await fetch('/api/auth/dev-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: `dev-user-${Date.now()}`,
        }),
      });

      // Read the response body once
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
        const errorMessage = data.message || data.error || 'Failed to generate token';
        throw new Error(errorMessage);
      }

      // Success - set auth
      setAuth(data.token, data.userId, data.scopes || []);
    } catch (error) {
      console.error('Failed to login:', error);
      // Re-throw so the UI can handle it
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
    setAuth,
    logout,
    loginDev,
    hasScope,
    hasScopes,
  };
});
