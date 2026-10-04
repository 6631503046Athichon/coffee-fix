import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';

export interface Toast {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  duration?: number;
}

interface ToastActions {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

interface ToastContextType extends ToastActions {
  toasts: Toast[];
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// addToast and removeToast alone, in a value that never changes. useToast's
// value changes with the toast list, so a component that only shows toasts
// (the app shell) would re-render, with every page under it, each time a
// toast comes or goes.
const ToastActionsContext = createContext<ToastActions | undefined>(undefined);

// Lightweight uuid fallback for non-secure contexts where crypto.randomUUID
// is unavailable (older Safari, plain http during local dev).
const newId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track the timeout per toast so removeToast can clear it and we can
  // flush everything on unmount (prevents leaked timers + setState
  // calls after unmount).
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = timeoutsRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timeoutsRef.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = newId();
    const newToast: Toast = { ...toast, id };

    setToasts(prev => [...prev, newToast]);

    // Auto remove after duration (default 5 seconds)
    const duration = toast.duration || 5000;
    const timer = setTimeout(() => {
      timeoutsRef.current.delete(id);
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
    timeoutsRef.current.set(id, timer);
  }, []);

  // Clear all pending timers on unmount.
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach(clearTimeout);
      timeouts.clear();
    };
  }, []);

  const value = {
    toasts,
    addToast,
    removeToast,
  };

  const actions = useMemo(() => ({ addToast, removeToast }), [addToast, removeToast]);

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastContext.Provider value={value}>
        {children}
      </ToastContext.Provider>
    </ToastActionsContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

/** addToast / removeToast without re-rendering when the toast list changes. */
export const useToastActions = () => {
  const context = useContext(ToastActionsContext);
  if (context === undefined) {
    throw new Error('useToastActions must be used within a ToastProvider');
  }
  return context;
};

export default ToastContext;
