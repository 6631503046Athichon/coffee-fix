// A toast from code that cannot reach the ToastContext, such as a plain helper
// (downloadCsv). It goes out as a window event; the app's ToastContainer
// (components/common/ToastContainer) listens and hands it to addToast, so it
// looks like every other toast. With no ToastContainer mounted (a page outside
// the app shell, most tests) nothing is shown.

export type AppToastType = 'success' | 'info' | 'warning' | 'error';

export interface AppToast {
  type: AppToastType;
  message: string;
  duration?: number;
}

export const APP_TOAST_EVENT = 'coffee-lab:toast';

/** Shows `toast` through the app's toast list. */
export function showAppToast(toast: AppToast): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AppToast>(APP_TOAST_EVENT, { detail: toast }));
}

/** Calls `listener` with every showAppToast toast; returns the unsubscribe. */
export function onAppToast(listener: (toast: AppToast) => void): () => void {
  const handle = (event: Event) => {
    const toast = (event as CustomEvent<AppToast>).detail;
    if (toast && typeof toast.message === 'string') listener(toast);
  };
  window.addEventListener(APP_TOAST_EVENT, handle);
  return () => window.removeEventListener(APP_TOAST_EVENT, handle);
}
