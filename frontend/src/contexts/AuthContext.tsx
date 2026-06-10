import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { authService } from '../services/auth/authService';
import { getCurrentHashRoute, redirectToHashRoute } from '../utils/hashRouting';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean; // Renamed for clarity
  login: (identifier: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  // Check if user is already logged in on mount
  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      setIsAuthLoading(true);

      // Hard cap on the loading spinner. If the backend call hasn't
      // resolved in 2s, we stop blocking the UI and treat the user as
      // logged out. SECURITY: do NOT restore identity (especially roles)
      // from localStorage — XSS could forge an admin blob. The cost of
      // one extra login is worth not trusting client storage.
      const timeoutId = setTimeout(() => {
        if (cancelled) return;
        setCurrentUser(null);
        setIsAuthenticated(false);
        setIsAuthLoading(false);
      }, 2000);

      try {
        const user = await authService.getCurrentUser();
        if (cancelled) return;
        clearTimeout(timeoutId);

        if (user) {
          setCurrentUser(user);
          setIsAuthenticated(true);
        } else {
          setCurrentUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        if (cancelled) return;
        clearTimeout(timeoutId);
        // Any failure => logged out (auth service already cleared cache).
        console.debug('User not authenticated:', error);
        setCurrentUser(null);
        setIsAuthenticated(false);
      } finally {
        if (cancelled) return;
        clearTimeout(timeoutId);
        setIsAuthLoading(false);
      }
    };

    loadUser();

    // Listen for auth logout events (triggered by 401 errors).
    // Guard against redirect storms when several 401s race in.
    const handleAuthLogout = () => {
      setCurrentUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem('coffee_lab_user');

      // If we're already on the login page, don't kick off another
      // navigation — multiple concurrent 401s can dispatch this event
      // in quick succession.
      const currentRoute = getCurrentHashRoute();
      if (currentRoute === '/login' || window.location.hash.endsWith('/login')) {
        return;
      }
      redirectToHashRoute('/login');
    };

    window.addEventListener('auth:logout', handleAuthLogout);

    return () => {
      cancelled = true;
      window.removeEventListener('auth:logout', handleAuthLogout);
    };
  }, []);

  const login = async (identifier: string, password: string): Promise<User> => {
    const user = await authService.login({ identifier, password });
    setCurrentUser(user);
    setIsAuthenticated(true);
    return user;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      // Backend logout failed — still clear local state so the user
      // isn't trapped in a "logged in" UI with a dead session.
      console.error('Backend logout failed, clearing local state anyway:', error);
    } finally {
      setCurrentUser(null);
      setIsAuthenticated(false);
    }
  };

  const setUser = (user: User) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
  };

  const value = {
    currentUser,
    isAuthenticated,
    isAuthLoading,
    login,
    logout,
    setUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
