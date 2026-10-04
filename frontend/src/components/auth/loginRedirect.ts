import { User } from '../../types'
import { FIRST_LOGIN_SETUP_PATH, needsFirstLoginSetup } from '../../utils/firstLogin'
import { getDashboardPathByRole } from '../../utils/routing'

// A signed-out visitor of an app page is sent to /login with the page they
// wanted in the navigation state, so the login page can send them back there
// once they are signed in (a deep link opened signed out, or during a slow
// session check on a cold start, no longer always lands on the dashboard).

export interface LoginRedirectState {
  from: string
}

// Pages that are never a destination after signing in.
const AUTH_PAGES = ['/', '/login', '/forgot-password', '/reset-password', FIRST_LOGIN_SETUP_PATH]

/** Navigation state for <Navigate to="/login">, remembering the page asked for. */
export const loginRedirectState = (location: {
  pathname: string
  search?: string
  hash?: string
}): LoginRedirectState => ({
  from: `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`,
})

/**
 * The page saved by loginRedirectState, or null when there is none. Only an
 * in-app path is followed: never another origin ("//host") or an auth page.
 */
export const redirectTargetFrom = (state: unknown): string | null => {
  const from = (state as Partial<LoginRedirectState> | null | undefined)?.from
  if (typeof from !== 'string') return null
  if (!from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return null
  const path = from.split(/[?#]/)[0]
  if (AUTH_PAGES.includes(path)) return null
  return from
}

/**
 * Where a user goes once signed in: the setup page while they still owe it,
 * else the page they asked for, else their dashboard. A page their roles do
 * not open is still refused there (ProtectedRoute sends them to their own).
 */
export const postLoginPath = (user: User, state: unknown): string => {
  if (needsFirstLoginSetup(user)) return FIRST_LOGIN_SETUP_PATH
  return redirectTargetFrom(state) ?? getDashboardPathByRole(user.roles)
}
