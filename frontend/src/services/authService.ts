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
    // Token is stored in httpOnly cookie by backend, so we cannot rely on localStorage token.
    // Always try backend first. Fallback to stored user only for network/temporary issues.
    const storedUser = localStorage.getItem(STORAGE_KEY);

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

      // If not authenticated, clear local state
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('auth-token');
        return null;
      }

      // For network errors, return stored user (prevents refresh kicking user to login)
      if (storedUser) {
        try {
          return JSON.parse(storedUser) as User;
        } catch {
          return null;
        }
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
