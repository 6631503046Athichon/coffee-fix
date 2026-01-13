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

/**
 * Require authentication - throws error if not authenticated
 */
export async function requireAuth(request: NextRequest): Promise<AuthenticatedUser> {
  // #region agent log
  const cookieHeader = request.headers.get('cookie') || '';
  const authHeader = request.headers.get('authorization') || '';
  fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:18',message:'requireAuth entry',data:{hasCookieHeader:!!cookieHeader,cookieHeaderLength:cookieHeader.length,hasAuthHeader:!!authHeader},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  const token = extractToken(request)
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:20',message:'extractToken result',data:{hasToken:!!token,tokenLength:token?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  
  if (!token) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:23',message:'No token found',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    throw new Error('Unauthorized')
  }

  // Verify token
  let payload;
  try {
    payload = verifyToken(token)
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:30',message:'Token verified',data:{userId:payload.userId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:33',message:'Token verification failed',data:{errorMessage:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    throw error;
  }

  // Get user from database
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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:45',message:'User not found or inactive',data:{found:!!user,isActive:user?.isActive},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    throw new Error('User not found or inactive')
  }

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

