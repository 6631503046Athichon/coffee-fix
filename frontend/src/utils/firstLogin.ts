import { User } from '../types'

/** The page where a new account replaces the credentials the Admin gave it. */
export const FIRST_LOGIN_SETUP_PATH = '/first-login-setup'

/**
 * True while the account still has to change its username, email or
 * password. Such a user is held on the setup page: everything else in the app
 * redirects there until the backend clears the flags.
 */
export const needsFirstLoginSetup = (user: User | null | undefined): boolean =>
  !!user && !!(user.mustChangePassword || user.mustChangeUsername || user.mustChangeEmail)
