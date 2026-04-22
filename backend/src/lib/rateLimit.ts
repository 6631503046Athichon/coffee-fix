import { NextRequest, NextResponse } from 'next/server'

/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Suitable for a single-instance Next.js deployment (one Node process).
 * For Vercel / serverless or multi-instance setups, replace the `buckets` Map
 * with a shared store such as Redis (e.g. `@upstash/ratelimit`) — the
 * `rateLimit()` function contract is intentionally small so a swap is easy.
 */

export type RateLimitOptions = {
  /** Sliding window length in milliseconds. */
  windowMs: number
  /** Maximum allowed requests per window per key. */
  max: number
  /** Extract the rate-limit key (default: client IP). */
  keyFn?: (req: NextRequest) => Promise<string> | string
  /** Namespace so different endpoints don't share buckets. */
  name?: string
}

type Bucket = {
  timestamps: number[]
}

const buckets = new Map<string, Bucket>()

// Periodic lazy cleanup to prevent unbounded growth.
let lastCleanup = 0
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

function cleanupStaleEntries(maxWindowMs: number): void {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now

  const cutoff = now - maxWindowMs
  for (const [key, bucket] of buckets.entries()) {
    bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff)
    if (bucket.timestamps.length === 0) {
      buckets.delete(key)
    }
  }
}

/**
 * Best-effort client IP extraction.
 *
 * Next.js strips the TCP peer IP, so we rely on reverse-proxy headers.
 * Behind Vercel / Nginx / Railway the first entry of `x-forwarded-for`
 * is the real client address.
 */
export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = request.headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'anonymous'
}

/**
 * Check the rate limit for the current request.
 *
 * Returns a 429 `NextResponse` if the caller should be blocked,
 * or `null` if the request is allowed (and has been counted).
 *
 * Usage in a route handler:
 *
 *   const limited = await rateLimit(request, RATE_LIMITS.LOGIN)
 *   if (limited) return limited
 *   // … continue with handler
 */
export async function rateLimit(
  request: NextRequest,
  options: RateLimitOptions,
): Promise<NextResponse | null> {
  const { windowMs, max, keyFn, name = 'global' } = options

  const rawKey = keyFn ? await keyFn(request) : getClientIp(request)
  const key = `${name}:${rawKey}`

  const now = Date.now()
  const cutoff = now - windowMs

  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { timestamps: [] }
    buckets.set(key, bucket)
  }

  // Drop timestamps that fell out of the window.
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff)

  // Piggy-back a global cleanup pass onto each request.
  cleanupStaleEntries(windowMs * 2)

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0]
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    const resetAtSec = Math.ceil((oldest + windowMs) / 1000)

    return NextResponse.json(
      {
        error: 'Too many requests. Please try again later.',
        retryAfter: retryAfterSec,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(resetAtSec),
        },
      },
    )
  }

  bucket.timestamps.push(now)
  return null
}

/**
 * Preset rate limits for common auth flows.
 *
 * Values tuned to be tight enough to stop credential stuffing and
 * email-quota abuse, but loose enough to not lock out legitimate users
 * who mistype a password a few times.
 */
export const RATE_LIMITS = {
  LOGIN: { windowMs: 15 * 60 * 1000, max: 5, name: 'login' },
  FORGOT_PASSWORD: { windowMs: 60 * 60 * 1000, max: 3, name: 'forgot-password' },
  RESET_PASSWORD: { windowMs: 15 * 60 * 1000, max: 5, name: 'reset-password' },
  REGISTER: { windowMs: 60 * 60 * 1000, max: 10, name: 'register' },
  VERIFY_TOKEN: { windowMs: 15 * 60 * 1000, max: 20, name: 'verify-token' },
  FIRST_LOGIN: { windowMs: 15 * 60 * 1000, max: 10, name: 'first-login' },
} as const

/**
 * Test-only: wipe all buckets. Do not call from production code.
 */
export function __resetRateLimitForTests(): void {
  buckets.clear()
  lastCleanup = 0
}
