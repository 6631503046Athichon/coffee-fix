import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { authService } from '../services/authService';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean; // Renamed for clarity
  login: (identifier: string, password: string) => Promise<User>;
  logout: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Renamed isLoading to isAuthLoading for clarity to distinguish from data loading
interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean; // Renamed from isLoading
  login: (identifier: string, password: string) => Promise<User>;
  logout: () => Promise<void>; // Changed to async
  setUser: (user: User) => void;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  // Check if user is already logged in on mount
  useEffect(() => {
    const loadUser = async () => {
      setIsAuthLoading(true);
      
      // Set a maximum timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        setIsAuthLoading(false);
        // If timeout, check localStorage for stored user
        const storedUser = localStorage.getItem('coffee_lab_user');
        if (storedUser) {
          try {
            const user = JSON.parse(storedUser) as User;
            setCurrentUser(user);
            setIsAuthenticated(true);
          } catch {
            setCurrentUser(null);
            setIsAuthenticated(false);
          }
        } else {
          setCurrentUser(null);
          setIsAuthenticated(false);
        }
      }, 5000); // 5 second timeout

      try {
        const user = await authService.getCurrentUser();
        clearTimeout(timeoutId);
        
        if (user) {
          setCurrentUser(user);
          setIsAuthenticated(true);
        } else {
          // Clear invalid state
          setCurrentUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        // User not authenticated - clear state
        console.debug('User not authenticated:', error);
        setCurrentUser(null);
        setIsAuthenticated(false);
      } finally {
        clearTimeout(timeoutId);
        setIsAuthLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (identifier: string, password: string): Promise<User> => {
    const user = await authService.login({ identifier, password });
    setCurrentUser(user);
    setIsAuthenticated(true);
    return user;
  };

  const logout = () => {
    authService.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
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
