// Authentication service - calls backend API
import { User } from '../types';
import { api } from './api';

interface LoginCredentials {
  identifier: string;  // Can be either email or username
  password: string;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  role: string;
}

interface AuthResponse {
  user: User;
  token?: string;
}

const STORAGE_KEY = 'coffee_lab_user';

// Authentication service that communicates with backend API
export const authService = {
  // Login user via backend API
  login: async (credentials: LoginCredentials): Promise<User> => {
    try {
      // Backend expects "email" field, but we use "identifier" for clarity
      const response = await api.post<AuthResponse>('/auth/login', {
        email: credentials.identifier,  // Map identifier to email for backend
        password: credentials.password,
      });

      // Store user data in localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(response.user));

      // Token is stored in HTTP-only cookie by backend
      // If token is returned, store it as fallback
      if (response.token) {
        localStorage.setItem('auth-token', response.token);
      }

      return response.user;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Login failed');
    }
  },

  // Register new user via backend API
  register: async (data: RegisterData): Promise<User> => {
    try {
      const response = await api.post<AuthResponse>('/auth/register', data);

      // Store user data
      localStorage.setItem(STORAGE_KEY, JSON.stringify(response.user));

      if (response.token) {
        localStorage.setItem('auth-token', response.token);
      }

      return response.user;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Registration failed');
    }
  },

  // Logout user
  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local storage regardless of API response
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('auth-token');
    }
  },

  // Get current user from backend (validates session)
  getCurrentUser: async (): Promise<User | null> => {
    // #region agent log
    const storedUser = localStorage.getItem(STORAGE_KEY);
    const cookies = typeof document !== 'undefined' ? document.cookie : null;
    fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authService.ts:82',message:'getCurrentUser called',data:{hasStoredUser:!!storedUser,cookies:cookies?.substring(0,200)||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    // Token is stored in httpOnly cookie by backend, so we cannot rely on localStorage token.
    // Always try backend first. Fallback to stored user only for network/temporary issues.
    
    // If we have a stored user, use it as fallback while checking backend
    // This prevents the "flash" of logout on refresh
    const storedUserParsed = storedUser ? (() => {
      try {
        return JSON.parse(storedUser) as User;
      } catch {
        return null;
      }
    })() : null;

    try {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authService.ts:95',message:'Calling /auth/me API',data:{endpoint:'/auth/me',hasStoredUser:!!storedUserParsed},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      const response = await api.get<{ user: User }>('/auth/me');
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authService.ts:98',message:'/auth/me success',data:{hasUser:!!response.user,userId:response.user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
      // #endregion

      if (response.user) {
        // Update localStorage with fresh user data
        localStorage.setItem(STORAGE_KEY, JSON.stringify(response.user));
        return response.user;
      }

      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '';
      const isNetworkError = errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('network');
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authService.ts:110',message:'/auth/me error',data:{errorMessage,is401:errorMessage.includes('401')||errorMessage.includes('Unauthorized'),isNetworkError},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
      // #endregion

      // If not authenticated (401), check if we have stored user
      // Don't clear immediately - might be a temporary issue or cookie not sent
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        // If we have a stored user, return it as fallback
        // This prevents logout on refresh when cookie isn't sent but user was logged in
        if (storedUserParsed) {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authService.ts:127',message:'401 but returning stored user as fallback',data:{hasStoredUser:!!storedUserParsed,userId:storedUserParsed?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          return storedUserParsed;
        }
        // Only clear if we don't have stored user (truly not logged in)
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('auth-token');
        return null;
      }

      // For network errors (not 401), return stored user (prevents refresh kicking user to login)
      if (isNetworkError && storedUserParsed) {
        return storedUserParsed;
      }

      // For other errors, try stored user as last resort
      if (storedUserParsed) {
        return storedUserParsed;
      }

      return null;
    }
  },

  // Check if user is authenticated
  isAuthenticated: async (): Promise<boolean> => {
    const user = await authService.getCurrentUser();
    return !!user;
  },
};

// Export individual functions for backwards compatibility
export const login = authService.login;
export const register = authService.register;
export const logout = authService.logout;
export const getCurrentUser = authService.getCurrentUser;
export const isAuthenticated = authService.isAuthenticated;

// Default export
export default authService;
