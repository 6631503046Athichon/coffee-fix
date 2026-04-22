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
      // Clear any existing invalid tokens before attempting login
      localStorage.removeItem('auth-token');
      localStorage.removeItem(STORAGE_KEY);

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
      // Clear any invalid tokens on login failure
      localStorage.removeItem('auth-token');
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
    // Token is stored in httpOnly cookie by backend, so we cannot rely on localStorage token.
    // Always try backend first. Fallback to stored user only for network/temporary issues.
    
    // If we have a stored user, use it as fallback while checking backend
    // This prevents the "flash" of logout on refresh
    const storedUser = localStorage.getItem(STORAGE_KEY);
    const storedUserParsed = storedUser ? (() => {
      try {
        return JSON.parse(storedUser) as User;
      } catch {
        return null;
      }
    })() : null;

    try {
      const response = await api.get<{ user: User }>('/auth/me');

      if (response.user) {
        // Update localStorage with fresh user data
        localStorage.setItem(STORAGE_KEY, JSON.stringify(response.user));
        return response.user;
      }

      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '';
      const isNetworkError = errorMessage.includes('Failed to fetch') || 
                           errorMessage.includes('NetworkError') || 
                           errorMessage.includes('network') ||
                           errorMessage.includes('timeout') ||
                           errorMessage.includes('not responding');

      // If not authenticated (401), clear token and logout
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('auth-token');
        return null;
      }

      // For network errors or timeouts (not 401), return stored user (prevents refresh kicking user to login)
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
