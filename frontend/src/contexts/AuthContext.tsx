import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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

/**
 * How long the session check may block the app before the user is treated
 * as signed out. A backend waking from idle can take several seconds to
 * answer /auth/me; 2s sent signed-in users to the login page on every cold
 * start. The loading screen says why it is waiting once the check runs long
 * (AuthLoadingScreen), and if the answer still arrives after this cap the
 * login page forwards the user on as soon as it does.
 */
export const AUTH_RESTORE_TIMEOUT_MS = 10000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  // Bumped whenever the session changes here (sign-in, sign-out, a 401,
  // first-login setup). A session check started before such a change is
  // stale: its late answer must not undo what the user just did.
  const sessionVersionRef = useRef(0);

  // Check if user is already logged in on mount
  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      setIsAuthLoading(true);
      const startedAt = sessionVersionRef.current;
      const isStale = () => cancelled || sessionVersionRef.current !== startedAt;

      // Hard cap on the loading spinner. If the backend call hasn't
      // resolved in AUTH_RESTORE_TIMEOUT_MS, we stop blocking the UI and
      // treat the user as logged out; a late answer still signs them in
      // below. SECURITY: do NOT restore identity (especially roles)
      // from localStorage — XSS could forge an admin blob. The cost of
      // one extra login is worth not trusting client storage.
      const timeoutId = setTimeout(() => {
        if (isStale()) return;
        setCurrentUser(null);
        setIsAuthenticated(false);
        setIsAuthLoading(false);
      }, AUTH_RESTORE_TIMEOUT_MS);

      try {
        const user = await authService.getCurrentUser();
        clearTimeout(timeoutId);
        if (isStale()) return;

        if (user) {
          setCurrentUser(user);
          setIsAuthenticated(true);
        } else {
          setCurrentUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        if (isStale()) return;
        // Any failure => logged out (auth service already cleared cache).
        console.debug('User not authenticated:', error);
        setCurrentUser(null);
        setIsAuthenticated(false);
      } finally {
        clearTimeout(timeoutId);
        if (!isStale()) setIsAuthLoading(false);
      }
    };

    loadUser();

    // Listen for auth logout events (triggered by 401 errors).
    // Guard against redirect storms when several 401s race in.
    const handleAuthLogout = () => {
      sessionVersionRef.current += 1;
      setCurrentUser(null);
      setIsAuthenticated(false);
      setIsAuthLoading(false);
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
    sessionVersionRef.current += 1;
    setCurrentUser(user);
    setIsAuthenticated(true);
    setIsAuthLoading(false);
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
      sessionVersionRef.current += 1;
      setCurrentUser(null);
      setIsAuthenticated(false);
      setIsAuthLoading(false);
    }
  };

  const setUser = (user: User) => {
    sessionVersionRef.current += 1;
    setCurrentUser(user);
    setIsAuthenticated(true);
    setIsAuthLoading(false);
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
