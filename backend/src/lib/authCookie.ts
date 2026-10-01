// Attributes of the httpOnly auth cookie, shared by login, register and
// logout so they can't drift apart (logout must overwrite what login set).
//
// SameSite=Lax. The SPA never calls this backend cross-site: in production
// frontend/vercel.json rewrites /api/* on the frontend host to this
// deployment, and every production build uses the relative '/api' as its
// API base (frontend/src/services/api.ts), so the cookie is first-party to
// the frontend host and each API call is same-origin. In dev the Vite proxy
// does the same, or localhost:5173 -> localhost:3001 is same-site. Lax keeps
// the cookie off the POSTs, form submissions and fetches another site can
// trigger — the CSRF hole SameSite=None left open.
//
// This relies on the rewrite. Two *.vercel.app hosts are cross-site to each
// other (vercel.app is on the Public Suffix List), so a frontend calling the
// backend host directly would stop getting the cookie back.

export const AUTH_COOKIE_NAME = 'auth-token'

export interface AuthCookieOptions {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  maxAge: number
  path: '/'
}

export function authCookieOptions(maxAge: number): AuthCookieOptions {
  const isDeployed =
    process.env.NODE_ENV === 'production' ||
    !!process.env.VERCEL ||
    !!process.env.RAILWAY_ENVIRONMENT
  return {
    httpOnly: true,
    secure: isDeployed, // HTTPS-only when deployed; plain http on localhost
    sameSite: 'lax',
    maxAge,
    path: '/',
  }
}
