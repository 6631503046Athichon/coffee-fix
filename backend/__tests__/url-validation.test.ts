/**
 * URL Schema Validation Tests
 * Tests for the fixed urlSchema that handles null, empty strings, and undefined
 */

import { describe, test, expect } from '@jest/globals'
import { urlSchema } from '@/lib/validations/common'

describe('URL Schema Validation', () => {
  describe('Valid URLs', () => {
    test('should accept valid HTTP URL', () => {
      const result = urlSchema.safeParse('http://example.com')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('http://example.com')
      }
    })

    test('should accept valid HTTPS URL', () => {
      const result = urlSchema.safeParse('https://example.com')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('https://example.com')
      }
    })

    test('should accept URL with path', () => {
      const result = urlSchema.safeParse('https://example.com/path/to/resource')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('https://example.com/path/to/resource')
      }
    })

    test('should accept URL with query parameters', () => {
      const result = urlSchema.safeParse('https://example.com?param=value')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('https://example.com?param=value')
      }
    })

    test('should accept Google Maps URL', () => {
      const result = urlSchema.safeParse('https://maps.google.com/?q=13.7563,100.5018')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('https://maps.google.com/?q=13.7563,100.5018')
      }
    })

    test('should accept Google Maps shortened URL', () => {
      const result = urlSchema.safeParse('https://goo.gl/maps/abc123')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('https://goo.gl/maps/abc123')
      }
    })
  })

  describe('Empty and Null Values', () => {
    test('should accept empty string and transform to null', () => {
      const result = urlSchema.safeParse('')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    test('should accept null', () => {
      const result = urlSchema.safeParse(null)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    test('should accept undefined', () => {
      const result = urlSchema.safeParse(undefined)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeUndefined()
      }
    })
  })

  describe('Invalid URLs', () => {
    test('should reject invalid URL format', () => {
      const result = urlSchema.safeParse('not a url')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('รูปแบบ URL ไม่ถูกต้อง')
      }
    })

    test('should reject URL without protocol', () => {
      const result = urlSchema.safeParse('example.com')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('รูปแบบ URL ไม่ถูกต้อง')
      }
    })

    test('should reject malformed URL', () => {
      const result = urlSchema.safeParse('http://')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('รูปแบบ URL ไม่ถูกต้อง')
      }
    })

    test('should reject URL with spaces', () => {
      const result = urlSchema.safeParse('http://example .com')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('รูปแบบ URL ไม่ถูกต้อง')
      }
    })

    test('should reject random text that is not a URL', () => {
      const result = urlSchema.safeParse('just some text')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('รูปแบบ URL ไม่ถูกต้อง')
      }
    })
  })

  describe('Edge Cases', () => {
    test('should handle whitespace-only string as invalid', () => {
      const result = urlSchema.safeParse('   ')
      expect(result.success).toBe(false)
    })

    test('should accept URL with port number', () => {
      const result = urlSchema.safeParse('http://localhost:3000')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('http://localhost:3000')
      }
    })

    test('should accept URL with username and password', () => {
      const result = urlSchema.safeParse('https://user:pass@example.com')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('https://user:pass@example.com')
      }
    })

    test('should accept URL with fragment', () => {
      const result = urlSchema.safeParse('https://example.com#section')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('https://example.com#section')
      }
    })
  })

  describe('Transformation Behavior', () => {
    test('should transform empty string to null but keep other values unchanged', () => {
      const emptyResult = urlSchema.safeParse('')
      const urlResult = urlSchema.safeParse('https://example.com')
      const nullResult = urlSchema.safeParse(null)

      expect(emptyResult.success).toBe(true)
      expect(urlResult.success).toBe(true)
      expect(nullResult.success).toBe(true)

      if (emptyResult.success) {
        expect(emptyResult.data).toBeNull()
      }
      if (urlResult.success) {
        expect(urlResult.data).toBe('https://example.com')
      }
      if (nullResult.success) {
        expect(nullResult.data).toBeNull()
      }
    })
  })
})
