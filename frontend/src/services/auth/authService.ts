// Authentication service - calls backend API
import { User } from '../../types';
import { api } from '../api';

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
      // Clear any existing stale user blob before attempting login
      localStorage.removeItem(STORAGE_KEY);

      // Backend expects "email" field, but we use "identifier" for clarity
      const response = await api.post<AuthResponse>('/auth/login', {
        email: credentials.identifier,  // Map identifier to email for backend
        password: credentials.password,
      });

      // Token is stored in HTTP-only cookie by backend.
      // We cache only a non-sensitive display copy of the user for UX
      // (e.g. greeting on first paint). Roles are never trusted from
      // localStorage on session restore — see getCurrentUser.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(response.user));

      return response.user;
    } catch (error) {
      // Clear any stale user blob on login failure
      localStorage.removeItem(STORAGE_KEY);

      const errorMessage = error instanceof Error ? error.message : 'Login failed';

      // Provide user-friendly error messages
      if (errorMessage.includes('timeout') || errorMessage.includes('not responding') || errorMessage.includes('Cannot connect')) {
        throw new Error('Backend server is not available. Please ensure the backend server is running on port 3001.');
      }

      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        throw new Error('Invalid email/username or password. Please check your credentials and try again.');
      }

      if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        throw new Error('Access denied. Your account may not have permission to access this resource.');
      }

      throw new Error(errorMessage || 'Login failed. Please try again.');
    }
  },

  // Register new user via backend API
  register: async (data: RegisterData): Promise<User> => {
    try {
      const response = await api.post<AuthResponse>('/auth/register', data);

      // Store non-sensitive user copy for UX. Token lives in httpOnly cookie.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(response.user));

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
    }
  },

  // Get current user from backend (validates session)
  // SECURITY: Roles must always come from the backend session.
  // We never restore identity (especially roles) from localStorage —
  // an XSS that writes a forged user blob must not yield admin access.
  getCurrentUser: async (): Promise<User | null> => {
    try {
      const response = await api.get<{ user: User }>('/auth/me');

      if (response.user) {
        // Refresh non-sensitive cached copy for UX (display name only).
        // ProtectedRoute and any role-gated UI must read from the
        // AuthContext's `currentUser`, which is sourced from this call.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(response.user));
        return response.user;
      }

      return null;
    } catch (error) {
      // Any failure (401, timeout, network error) => treat as logged out.
      // The one-extra-login cost is acceptable to prevent role forgery
      // via tampered localStorage.
      localStorage.removeItem(STORAGE_KEY);
      const errorMessage = error instanceof Error ? error.message : '';
      if (!errorMessage.includes('401') && !errorMessage.includes('Unauthorized')) {
        console.debug('getCurrentUser failed, treating as logged out:', errorMessage);
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

// First-login credential update
export const firstLoginUpdate = async (data: {
  currentPassword: string;
  newUsername?: string;
  newEmail?: string;
  newPassword?: string;
}): Promise<{ user: User; message: string }> => {
  return api.post<{ user: User; message: string }>('/auth/first-login-update', data);
};

// Forgot password
export const forgotPassword = async (email: string): Promise<{ message: string; devToken?: string; devResetUrl?: string }> => {
  return api.post<{ message: string; devToken?: string; devResetUrl?: string }>('/auth/forgot-password', { email });
};

// Verify reset token
export const verifyResetToken = async (token: string): Promise<{ valid: boolean; email?: string }> => {
  return api.get<{ valid: boolean; email?: string }>(`/auth/verify-reset-token`, { token });
};

// Reset password with token
export const resetPassword = async (token: string, password: string): Promise<void> => {
  await api.post('/auth/reset-password', { token, password });
};
export const isAuthenticated = authService.isAuthenticated;

// Default export
export default authService;
