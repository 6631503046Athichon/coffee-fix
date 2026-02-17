import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const JWT_EXPIRES_IN = '24h' // Reduced from 7d to 24h for security
const JWT_ISSUER = 'coffee-lab-api'
const JWT_AUDIENCE = 'coffee-lab-app'

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error(
      'FATAL: JWT_SECRET environment variable is not set. ' +
      'Please configure JWT_SECRET in your .env file for security.'
    )
  }

  // Validate minimum length (32 characters minimum)
  if (secret.length < 32) {
    throw new Error(
      'FATAL: JWT_SECRET must be at least 32 characters long. ' +
      'Current length: ' + secret.length + '. ' +
      'Generate a secure secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
    )
  }

  // Validate entropy - check if secret is not too simple
  const uniqueChars = new Set(secret).size
  if (uniqueChars < 16) {
    throw new Error(
      'FATAL: JWT_SECRET has insufficient entropy (only ' + uniqueChars + ' unique characters). ' +
      'Please use a cryptographically random secret. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
    )
  }

  return secret
}

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
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256', // Explicitly set algorithm
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  })
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'], // Only allow HS256
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JWTPayload
    return decoded
  } catch (error) {
    throw new Error('Invalid or expired token')
  }
}

/**
 * Extract token from Authorization header or cookie
 */
export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  const cookieHeader = request.headers.get('Cookie');

  // Try Authorization header first
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return token;
  }

  // Try cookie
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim())
    const authCookie = cookies.find(c => c.startsWith('auth-token='))
    if (authCookie) {
      const token = authCookie.substring('auth-token='.length);
      return token;
    }
  }

  return null
}

