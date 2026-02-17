/**
 * Phase 1 Security Fix: JWT Secret Validation Tests
 * Tests for JWT_SECRET validation at startup
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'

describe('JWT Secret Validation', () => {
  let originalJwtSecret: string | undefined

  beforeEach(() => {
    // Save original JWT_SECRET
    originalJwtSecret = process.env.JWT_SECRET
    // Clear the module cache to force re-import
    jest.resetModules()
  })

  afterEach(() => {
    // Restore original JWT_SECRET
    if (originalJwtSecret) {
      process.env.JWT_SECRET = originalJwtSecret
    }
    jest.resetModules()
  })

  test('should fail startup with missing JWT_SECRET', async () => {
    // Remove JWT_SECRET
    delete process.env.JWT_SECRET

    // Import auth module - should throw error
    await expect(async () => {
      const { generateToken } = await import('@/lib/auth')
      generateToken({ userId: 'test', roles: [] })
    }).rejects.toThrow('JWT_SECRET environment variable is not set')
  })

  test('should fail startup with short JWT_SECRET (less than 32 chars)', async () => {
    // Set a short JWT_SECRET
    process.env.JWT_SECRET = 'short_secret_123'

    await expect(async () => {
      const { generateToken } = await import('@/lib/auth')
      generateToken({ userId: 'test', roles: [] })
    }).rejects.toThrow('JWT_SECRET must be at least 32 characters long')
  })

  test('should fail startup with low entropy JWT_SECRET', async () => {
    // Set a secret with low entropy (repeating characters)
    process.env.JWT_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' // 36 a's

    await expect(async () => {
      const { generateToken } = await import('@/lib/auth')
      generateToken({ userId: 'test', roles: [] })
    }).rejects.toThrow('JWT_SECRET has insufficient entropy')
  })

  test('should succeed with strong JWT_SECRET (32+ chars, good entropy)', async () => {
    // Set a strong secret
    process.env.JWT_SECRET = 'strong_secret_key_with_good_entropy_1234567890abcdef'

    const { generateToken, verifyToken } = await import('@/lib/auth')

    // Should not throw
    const token = generateToken({ userId: 'test-user', roles: ['Admin'] })
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')

    // Verify token can be decoded
    const decoded = verifyToken(token)
    expect(decoded.userId).toBe('test-user')
    expect(decoded.roles).toEqual(['Admin'])
  })

  test('should include issuer claim in JWT tokens', async () => {
    process.env.JWT_SECRET = 'strong_secret_key_with_good_entropy_1234567890abcdef'

    const { generateToken } = await import('@/lib/auth')
    const jwt = await import('jsonwebtoken')

    const token = generateToken({ userId: 'test-user', roles: [] })

    // Decode without verification to inspect claims
    const decoded = jwt.decode(token, { complete: true }) as any

    expect(decoded.payload.iss).toBe('coffee-lab-api')
  })

  test('should include audience claim in JWT tokens', async () => {
    process.env.JWT_SECRET = 'strong_secret_key_with_good_entropy_1234567890abcdef'

    const { generateToken } = await import('@/lib/auth')
    const jwt = await import('jsonwebtoken')

    const token = generateToken({ userId: 'test-user', roles: [] })

    // Decode without verification to inspect claims
    const decoded = jwt.decode(token, { complete: true }) as any

    expect(decoded.payload.aud).toBe('coffee-lab-app')
  })

  test('should set token expiry to 24 hours', async () => {
    process.env.JWT_SECRET = 'strong_secret_key_with_good_entropy_1234567890abcdef'

    const { generateToken } = await import('@/lib/auth')
    const jwt = await import('jsonwebtoken')

    const beforeTime = Math.floor(Date.now() / 1000)
    const token = generateToken({ userId: 'test-user', roles: [] })
    const afterTime = Math.floor(Date.now() / 1000)

    // Decode without verification to inspect claims
    const decoded = jwt.decode(token, { complete: true }) as any

    const iat = decoded.payload.iat // Issued at
    const exp = decoded.payload.exp // Expiry

    // Should be issued within the test time window
    expect(iat).toBeGreaterThanOrEqual(beforeTime)
    expect(iat).toBeLessThanOrEqual(afterTime)

    // Should expire in 24 hours (86400 seconds)
    const expiryDuration = exp - iat
    expect(expiryDuration).toBe(86400)
  })

  test('should reject tokens with wrong issuer', async () => {
    process.env.JWT_SECRET = 'strong_secret_key_with_good_entropy_1234567890abcdef'

    const { verifyToken } = await import('@/lib/auth')
    const jwt = await import('jsonwebtoken')

    // Create a token with wrong issuer
    const token = jwt.sign(
      { userId: 'test-user', roles: [] },
      process.env.JWT_SECRET,
      {
        expiresIn: '24h',
        algorithm: 'HS256',
        issuer: 'wrong-issuer',
        audience: 'coffee-lab-app'
      }
    )

    expect(() => verifyToken(token)).toThrow('Invalid or expired token')
  })

  test('should reject tokens with wrong audience', async () => {
    process.env.JWT_SECRET = 'strong_secret_key_with_good_entropy_1234567890abcdef'

    const { verifyToken } = await import('@/lib/auth')
    const jwt = await import('jsonwebtoken')

    // Create a token with wrong audience
    const token = jwt.sign(
      { userId: 'test-user', roles: [] },
      process.env.JWT_SECRET,
      {
        expiresIn: '24h',
        algorithm: 'HS256',
        issuer: 'coffee-lab-api',
        audience: 'wrong-audience'
      }
    )

    expect(() => verifyToken(token)).toThrow('Invalid or expired token')
  })

  test('should reject expired tokens', async () => {
    process.env.JWT_SECRET = 'strong_secret_key_with_good_entropy_1234567890abcdef'

    const { verifyToken } = await import('@/lib/auth')
    const jwt = await import('jsonwebtoken')

    // Create an already expired token
    const token = jwt.sign(
      { userId: 'test-user', roles: [] },
      process.env.JWT_SECRET,
      {
        expiresIn: '-1h', // Expired 1 hour ago
        algorithm: 'HS256',
        issuer: 'coffee-lab-api',
        audience: 'coffee-lab-app'
      }
    )

    expect(() => verifyToken(token)).toThrow('Invalid or expired token')
  })

  test('should use HS256 algorithm only', async () => {
    process.env.JWT_SECRET = 'strong_secret_key_with_good_entropy_1234567890abcdef'

    const { generateToken } = await import('@/lib/auth')
    const jwt = await import('jsonwebtoken')

    const token = generateToken({ userId: 'test-user', roles: [] })

    // Decode without verification to inspect algorithm
    const decoded = jwt.decode(token, { complete: true }) as any

    expect(decoded.header.alg).toBe('HS256')
  })
})
