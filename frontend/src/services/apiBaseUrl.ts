// Where the SPA sends its API calls. Every module that builds an API URL
// reads it from here so they can't drift apart.
//
// Production builds use the relative '/api': vercel.json rewrites it to the
// backend deployment, so each call is same-origin and the httpOnly auth
// cookie stays first-party (calling the backend URL directly would make it a
// blocked third-party cookie).
//
// Dev uses VITE_API_URL when set ('/api' with the Vite proxy), otherwise the
// local backend on :3001 at the host the page was opened on. The backend
// refuses cross-site writes and its SameSite=Lax cookie never rides on a
// cross-site fetch, and browsers count localhost and 127.0.0.1 as different
// sites, so a page on 127.0.0.1:5173 has to call 127.0.0.1:3001.
export function resolveApiBaseUrl(
  isProd: boolean,
  envUrl: string | undefined,
  pageHostname: string | undefined,
): string {
  if (isProd) return '/api'
  if (envUrl) return envUrl
  return `http://${pageHostname || 'localhost'}:3001/api`
}

export const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.PROD,
  import.meta.env.VITE_API_URL,
  typeof window === 'undefined' ? undefined : window.location.hostname,
)
