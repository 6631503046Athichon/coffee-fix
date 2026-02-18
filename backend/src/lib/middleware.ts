import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractToken } from './auth'
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

// In-memory cache for authenticated users (TTL: 2 minutes)
const AUTH_CACHE_TTL = 2 * 60 * 1000
const authCache = new Map<string, { user: AuthenticatedUser; expiresAt: number }>()

function getCachedUser(userId: string): AuthenticatedUser | null {
  const cached = authCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user
  }
  if (cached) {
    authCache.delete(userId)
  }
  return null
}

function setCachedUser(userId: string, user: AuthenticatedUser): void {
  // Limit cache size to prevent memory leaks
  if (authCache.size > 1000) {
    const firstKey = authCache.keys().next().value
    if (firstKey) authCache.delete(firstKey)
  }
  authCache.set(userId, { user, expiresAt: Date.now() + AUTH_CACHE_TTL })
}

/**
 * Require authentication - throws error if not authenticated
 */
export async function requireAuth(request: NextRequest): Promise<AuthenticatedUser> {
  const token = extractToken(request)

  if (!token) {
    throw new Error('Unauthorized')
  }

  // Verify token
  let payload;
  try {
    payload = verifyToken(token)
  } catch (error) {
    throw error;
  }

  // Check cache first
  const cachedUser = getCachedUser(payload.userId)
  if (cachedUser) {
    return cachedUser
  }

  // Get user from database (only on cache miss)
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      roles: true,
      isActive: true,
      isSuperAdmin: true,
    },
  })

  if (!user || !user.isActive) {
    throw new Error('User not found or inactive')
  }

  // Cache the result
  setCachedUser(user.id, user)

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
export function successResponse(data: any, status: number = 200): NextResponse {
  return NextResponse.json(data, { status })
}

/**
 * Handle API errors
 */
export function handleApiError(error: any): NextResponse {
  // Avoid noisy logs for expected auth failures
  const isExpectedAuthError =
    error?.message === 'Unauthorized' ||
    error?.message === 'Invalid or expired token' ||
    error?.message === 'Insufficient permissions' ||
    error?.message === 'User not found or inactive'

  // Check for database connection / pool errors
  const isConnectionError =
    error?.message?.includes('MaxClientsInSessionMode') ||
    error?.message?.includes('max clients reached') ||
    error?.code === 'P1001' || // Can't reach database server
    error?.code === 'P1008' || // Operations timed out
    error?.code === 'P1017' || // Server has closed the connection
    error?.code === 'P2024' || // Timed out fetching connection from pool
    error?.message?.includes('10054') ||
    error?.message?.includes('ECONNRESET') ||
    error?.message?.includes('ECONNREFUSED')

  if (isConnectionError) {
    console.error('Database Connection Error:', error?.code || '', error?.message?.substring(0, 200))
    return errorResponse(
      'Database temporarily unavailable. Please try again in a moment.',
      503
    )
  }

  if (!isExpectedAuthError) {
  console.error('API Error:', error)
  }

  // Prisma errors
  if (error.code === 'P2002') {
    return errorResponse('Record already exists', 409)
  }

  if (error.code === 'P2025') {
    return errorResponse('Record not found', 404)
  }

  if (error.code === 'P2003') {
    return errorResponse('Invalid reference', 400)
  }

  if (error.code === 'P2014') {
    return errorResponse('Required relation missing', 400)
  }

  // Authentication errors
  if (error.message === 'Unauthorized' || error.message === 'Invalid or expired token') {
    return errorResponse('Unauthorized', 401)
  }

  if (error.message === 'Insufficient permissions') {
    return errorResponse('Forbidden', 403)
  }

  if (error.message === 'User not found or inactive') {
    return errorResponse('User not found or inactive', 401)
  }

  // Generic error
  return errorResponse(error.message || 'Internal server error', error.statusCode || 500)
}

