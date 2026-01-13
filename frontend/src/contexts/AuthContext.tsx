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
      // #region agent log
      const storedUser = localStorage.getItem('coffee_lab_user');
      const cookies = typeof document !== 'undefined' ? document.cookie : null;
      fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:32',message:'loadUser called on mount',data:{hasStoredUser:!!storedUser,cookies:cookies?.substring(0,200)||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      try {
        const user = await authService.getCurrentUser();
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:36',message:'getCurrentUser result',data:{hasUser:!!user,userId:user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        if (user) {
          setCurrentUser(user);
          setIsAuthenticated(true);
        } else {
          // Clear invalid state
          setCurrentUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:45',message:'getCurrentUser error',data:{errorMessage:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        // User not authenticated - clear state
        console.debug('User not authenticated:', error);
        setCurrentUser(null);
        setIsAuthenticated(false);
      } finally {
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
