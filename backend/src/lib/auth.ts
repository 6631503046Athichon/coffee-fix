import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production'
const JWT_EXPIRES_IN = '7d'

export interface JWTPayload {
  userId: string
  email?: string
  username?: string
  roles: string[]
}

/**
 * Hash password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Generate JWT token
 */
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  })
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    return decoded
  } catch (error) {
    throw new Error('Invalid or expired token')
  }
}

/**
 * Extract token from Authorization header or cookie
 */
export function extractToken(request: Request): string | null {
  // #region agent log
  const authHeader = request.headers.get('authorization');
  const cookieHeader = request.headers.get('cookie');
  fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.ts:53',message:'extractToken entry',data:{hasAuthHeader:!!authHeader,hasCookieHeader:!!cookieHeader,cookieHeaderLength:cookieHeader?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  // Try Authorization header first
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.ts:57',message:'Token from Authorization header',data:{tokenLength:token.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return token;
  }

  // Try cookie
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim())
    const authCookie = cookies.find(c => c.startsWith('auth-token='))
    if (authCookie) {
      const token = authCookie.substring('auth-token='.length);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.ts:66',message:'Token from cookie',data:{tokenLength:token.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return token;
    }
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.ts:70',message:'No auth-token cookie found',data:{cookieCount:cookies.length,cookieNames:cookies.map(c=>c.split('=')[0]).join(',')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
  }

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.ts:75',message:'No token found',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  return null
}

