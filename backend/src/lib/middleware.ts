import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken, generateToken } from './auth'
import { AUTH_COOKIE_NAME, authCookieOptions } from './authCookie'
import prisma from './prisma'

export interface AuthenticatedUser {
  id: string
  email: string | null
  username: string | null
  name: string
  roles: string[]
  isActive: boolean
  isSuperAdmin: boolean
}

// In-memory cache for authenticated users.
//
// TTL is kept short (10s) on purpose: it's just enough to absorb the burst of
// requests a single page-load fires (each subresource that hits the API
// re-runs requireAuth), without holding stale state for long. Anything bigger
// means a user who's been deactivated, had their role revoked, or had their
// account disabled keeps the run of the app for up to TTL seconds after the
// admin's change — i.e. revocation latency. 10s is the smallest window that
// still meaningfully reduces DB load.
//
// Each entry also keeps the user's passwordChangedAt, so a token issued before
// the last password change is refused on a cache hit too. The instance that
// saves a new password drops the entry (forgetCachedAuth); another instance
// may keep its older copy for up to the TTL, the same latency as above.
const AUTH_CACHE_TTL = 10 * 1000
interface CachedAuth {
  user: AuthenticatedUser
  passwordChangedAt: Date | null
  expiresAt: number
}
const authCache = new Map<string, CachedAuth>()

function getCachedAuth(userId: string): CachedAuth | null {
  const cached = authCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached
  }
  if (cached) {
    authCache.delete(userId)
  }
  return null
}

function setCachedAuth(userId: string, user: AuthenticatedUser, passwordChangedAt: Date | null): void {
  // Limit cache size to prevent memory leaks
  if (authCache.size > 1000) {
    const firstKey = authCache.keys().next().value
    if (firstKey) authCache.delete(firstKey)
  }
  authCache.set(userId, { user, passwordChangedAt, expiresAt: Date.now() + AUTH_CACHE_TTL })
}

/**
 * Drop a user's cached auth row. Call it after saving a new password, so this
 * instance re-reads passwordChangedAt on the next request instead of letting
 * an older token through on the cached copy.
 */
export function forgetCachedAuth(userId: string): void {
  authCache.delete(userId)
}

/**
 * True when the token was issued before the user's last password change, so
 * the session it carries is revoked. A JWT's iat is in whole seconds, so the
 * change time is compared in whole seconds too: the token handed out in the
 * same second as the change (refreshSessionCookie) stays valid.
 */
export function isTokenRevoked(issuedAt: number | undefined, passwordChangedAt: Date | null | undefined): boolean {
  if (!passwordChangedAt) return false
  if (typeof issuedAt !== 'number') return true
  return issuedAt < Math.floor(passwordChangedAt.getTime() / 1000)
}

/**
 * Give the session that just changed its own password a fresh token, so the
 * passwordChangedAt check that signs out every older session keeps this one
 * signed in. Same claims and cookie as login.
 */
export function refreshSessionCookie(
  response: NextResponse,
  user: { id: string; email: string | null; username: string | null; roles: string[] },
): NextResponse {
  const token = generateToken({
    userId: user.id,
    email: user.email || undefined,
    username: user.username || undefined,
    roles: user.roles,
  })
  // 1 day to match the JWT's 24h expiry, as login sets it.
  response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions(60 * 60 * 24))
  return response
}

export interface RequireAuthOptions {
  /**
   * Let through an account that still has to replace the credentials the
   * Admin gave it (any mustChange* flag set). Only the routes the first-login
   * setup page needs pass this: /api/auth/me and /api/auth/first-login-update.
   */
  allowSetupPending?: boolean
}

/** Thrown for an account whose first-login setup is not done; answered with 403. */
export const SETUP_REQUIRED_MESSAGE = 'First-login setup required'

/**
 * Require authentication - throws error if not authenticated.
 * An account that still owes its first-login setup is refused (403) unless
 * the route passes `allowSetupPending`, so the setup cannot be skipped by
 * calling the API directly with the password the Admin handed out.
 */
export async function requireAuth(
  request: NextRequest,
  options: RequireAuthOptions = {},
): Promise<AuthenticatedUser> {
  const token = extractToken(request)

  if (!token) {
    throw new Error('Unauthorized')
  }

  // Verify token
  const payload = verifyToken(token)
  const issuedAt = (payload as { iat?: number }).iat

  // Check cache first. Only accounts with setup done are ever cached.
  const cached = getCachedAuth(payload.userId)
  if (cached) {
    if (isTokenRevoked(issuedAt, cached.passwordChangedAt)) {
      throw new Error('Invalid or expired token')
    }
    return cached.user
  }

  // Get user from database (only on cache miss)
  const row = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      roles: true,
      isActive: true,
      isSuperAdmin: true,
      mustChangePassword: true,
      mustChangeUsername: true,
      mustChangeEmail: true,
      passwordChangedAt: true,
    },
  })

  if (!row || !row.isActive) {
    throw new Error('User not found or inactive')
  }

  const { mustChangePassword, mustChangeUsername, mustChangeEmail, passwordChangedAt, ...user } = row

  // A password change signs out every session started before it: a stolen
  // cookie stops working once the password is changed (audit F30).
  if (isTokenRevoked(issuedAt, passwordChangedAt)) {
    throw new Error('Invalid or expired token')
  }

  if (mustChangePassword || mustChangeUsername || mustChangeEmail) {
    // Not cached: the request after setup is saved must see the cleared
    // flags at once, on whichever instance serves it.
    if (!options.allowSetupPending) {
      throw Object.assign(new Error(SETUP_REQUIRED_MESSAGE), { statusCode: 403 })
    }
    return user
  }

  // Cache the result
  setCachedAuth(user.id, user, passwordChangedAt ?? null)

  return user
}

/**
 * Require specific role(s) - throws error if user doesn't have required role
 */
export function requireRole(user: AuthenticatedUser, allowedRoles: string[]): void {
  const hasRole = user.roles.some((role: string) => allowedRoles.includes(role))

  if (!hasRole && !user.isSuperAdmin) {
    throw new Error('Insufficient permissions')
  }
}

/**
 * Require ownership - throws error if user is not the owner and not an admin
 * @param user - The authenticated user
 * @param ownerId - The ID of the resource owner
 * @param allowedRoles - Roles that can bypass ownership check (defaults to ['Admin'])
 */
export function requireOwnership(
  user: AuthenticatedUser,
  ownerId: string | null | undefined,
  allowedRoles: string[] = ['Admin']
): void {
  // Admins and super admins can bypass ownership checks
  if (user.isSuperAdmin) return

  const hasAllowedRole = user.roles.some(role => allowedRoles.includes(role))
  if (hasAllowedRole) return

  // Check ownership
  if (!ownerId || user.id !== ownerId) {
    throw new Error('Insufficient permissions')
  }
}

/**
 * Optional authentication - returns user if authenticated, null otherwise
 */
export async function optionalAuth(request: NextRequest): Promise<AuthenticatedUser | null> {
  try {
    return await requireAuth(request)
  } catch {
    return null
  }
}

/**
 * Error response helper
 */
export function errorResponse(message: string, status: number = 500): NextResponse {
  return NextResponse.json(
    { error: message },
    { status }
  )
}

/**
 * Success response helper
 */
export function successResponse(data: unknown, status: number = 200): NextResponse {
  return NextResponse.json(data, { status })
}

/**
 * Handle API errors
 */
export function handleApiError(error: unknown): NextResponse {
  const err = error as { message?: string; code?: string; statusCode?: number }

  // Avoid noisy logs for expected auth failures
  const isExpectedAuthError =
    err?.message === 'Unauthorized' ||
    err?.message === 'Invalid or expired token' ||
    err?.message === 'Insufficient permissions' ||
    err?.message === 'User not found or inactive' ||
    err?.message === SETUP_REQUIRED_MESSAGE

  // Check for database connection / pool errors
  const isConnectionError =
    err?.message?.includes('MaxClientsInSessionMode') ||
    err?.message?.includes('max clients reached') ||
    err?.code === 'P1001' || // Can't reach database server
    err?.code === 'P1008' || // Operations timed out
    err?.code === 'P1017' || // Server has closed the connection
    err?.code === 'P2024' || // Timed out fetching connection from pool
    err?.message?.includes('10054') ||
    err?.message?.includes('ECONNRESET') ||
    err?.message?.includes('ECONNREFUSED')

  if (isConnectionError) {
    console.error('Database Connection Error:', err?.code || '', err?.message?.substring(0, 200))
    return errorResponse(
      'Database temporarily unavailable. Please try again in a moment.',
      503
    )
  }

  if (!isExpectedAuthError) {
    console.error('API Error:', error)
  }

  // Prisma errors
  if (err.code === 'P2002') {
    return errorResponse('Record already exists', 409)
  }

  if (err.code === 'P2025') {
    return errorResponse('Record not found', 404)
  }

  if (err.code === 'P2003') {
    return errorResponse('Invalid reference', 400)
  }

  if (err.code === 'P2014') {
    return errorResponse('Required relation missing', 400)
  }

  // Authentication errors
  if (err.message === 'Unauthorized' || err.message === 'Invalid or expired token') {
    return errorResponse('Unauthorized', 401)
  }

  if (err.message === 'Insufficient permissions') {
    return errorResponse('Forbidden', 403)
  }

  if (err.message === 'User not found or inactive') {
    return errorResponse('User not found or inactive', 401)
  }

  // An error a route throws on purpose carries a 4xx statusCode, and its
  // message is written for the client.
  if (
    typeof err.statusCode === 'number' &&
    err.statusCode >= 400 &&
    err.statusCode < 500 &&
    err.message
  ) {
    return errorResponse(err.message, err.statusCode)
  }

  // Anything else is unexpected. Its text can hold Prisma query details,
  // table and column names or config hints, so it stays in the server log
  // (above) and the client gets a generic message (audit F28).
  //
  // A bare SyntaxError lands here too: it may come from request.json(), but
  // just as well from JSON.parse on stored data in a GET, which is a server
  // fault, not a bad request. A route that answers 400 for a body that is
  // not JSON catches request.json() itself (validateBody, readJsonObjectBody).
  return errorResponse('Internal server error', 500)
}

