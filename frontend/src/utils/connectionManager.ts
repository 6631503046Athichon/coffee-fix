/**
 * connectionManager - Singleton that tracks backend connectivity state.
 *
 * Prevents the frontend from flooding the backend (or logging noise) with
 * 15+ parallel API calls when the server is known to be down.
 *
 * Usage in api.ts:
 *   - Call connectionManager.reportFailure() on network/timeout errors.
 *   - Call connectionManager.reportSuccess() on any HTTP response (even 4xx).
 *   - Guard outgoing calls with connectionManager.shouldSuppress().
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

/** Duration (ms) after the first failure during which all API calls are suppressed. */
const SUPPRESS_WINDOW_MS = 30_000

/** How often (ms) the recovery probe pings the backend while disconnected. */
const RECOVERY_INTERVAL_MS = 15_000

/** Timeout (ms) for the lightweight recovery probe fetch. */
const RECOVERY_PROBE_TIMEOUT_MS = 5_000

type ConnectionState = 'connected' | 'disconnected'

// --- Internal state -----------------------------------------------------------

let state: ConnectionState = 'connected'
let failureCount = 0
let lastFailureTime = 0
let recoveryTimer: ReturnType<typeof setInterval> | null = null

// --- Helpers ------------------------------------------------------------------

function dispatchEvent(name: 'backend:connected' | 'backend:disconnected'): void {
  window.dispatchEvent(new CustomEvent(name))
}

async function probeBackend(): Promise<void> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), RECOVERY_PROBE_TIMEOUT_MS)

  try {
    // Lightweight health check — no auth needed, minimal DB overhead.
    await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    connectionManager.reportSuccess()
  } catch {
    // Network error or abort — backend still unreachable, keep polling.
    clearTimeout(timeoutId)
  }
}

// --- Public API ---------------------------------------------------------------

export const connectionManager = {
  /**
   * Returns true when the backend is known to be down AND we are still within
   * the suppress window. Callers should skip the API request in this case.
   */
  shouldSuppress(): boolean {
    if (state !== 'disconnected') return false
    return Date.now() - lastFailureTime < SUPPRESS_WINDOW_MS
  },

  /**
   * Call this whenever a network-level error occurs (no HTTP response received).
   * Fires 'backend:disconnected' exactly once per transition.
   */
  reportFailure(): void {
    const wasConnected = state !== 'disconnected'

    state = 'disconnected'
    lastFailureTime = Date.now()
    failureCount += 1

    if (wasConnected) {
      dispatchEvent('backend:disconnected')
    }

    connectionManager.startRecoveryPolling()
  },

  /**
   * Call this whenever any HTTP response is received (including 4xx/5xx).
   * A response — however unhappy — means the server is reachable.
   * Fires 'backend:connected' exactly once per transition.
   */
  reportSuccess(): void {
    const wasDisconnected = state === 'disconnected'

    state = 'connected'
    failureCount = 0

    if (wasDisconnected) {
      dispatchEvent('backend:connected')
    }

    connectionManager.stopRecoveryPolling()
  },

  /** Returns true only when state is explicitly 'connected'. */
  isConnected(): boolean {
    return state === 'connected'
  },

  /**
   * Starts a periodic probe that pings the backend every 15 s.
   * Safe to call multiple times — only one timer will run at a time.
   */
  startRecoveryPolling(): void {
    if (recoveryTimer !== null) return
    recoveryTimer = setInterval(probeBackend, RECOVERY_INTERVAL_MS)
  },

  /** Stops the recovery polling timer. */
  stopRecoveryPolling(): void {
    if (recoveryTimer === null) return
    clearInterval(recoveryTimer)
    recoveryTimer = null
  },
}
