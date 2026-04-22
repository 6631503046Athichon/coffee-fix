export const normalizeHashRoute = (path: string): string => {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
};

export const getCurrentHashRoute = (): string => {
  if (typeof window === 'undefined') return '/';

  const hashPath = window.location.hash.replace(/^#/, '');
  return normalizeHashRoute(hashPath || '/');
};

export const redirectToHashRoute = (path: string): void => {
  if (typeof window === 'undefined') return;

  const normalizedPath = normalizeHashRoute(path);
  if (getCurrentHashRoute() === normalizedPath) return;

  window.location.hash = normalizedPath;
};
