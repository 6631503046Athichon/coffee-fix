/**
 * Test setup file - runs before all tests
 */

// Mock environment variables for testing
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_sufficient_length_and_entropy_for_testing_1234567890'
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db'
process.env.NODE_ENV = 'test'

// Increase timeout for all tests
jest.setTimeout(30000)

// Reset in-memory rate limiter buckets between tests so shared state
// across test files doesn't cause false 429s.
beforeEach(() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { __resetRateLimitForTests } = require('../src/lib/rateLimit')
    if (typeof __resetRateLimitForTests === 'function') {
      __resetRateLimitForTests()
    }
  } catch {
    // Module may not be loaded yet in some test files — safe to ignore.
  }
})

// Global test cleanup
afterAll(async () => {
  // Close any open connections
  await new Promise(resolve => setTimeout(resolve, 500))
})
