// Runs one data reload at a time and merges bursts of requests into one.
//
// A full reload costs two bulk-load calls, which the backend rate-limits per
// user (10 a minute). Saves, events, the auto-refresh and reconnects each
// used to start their own reload, so a few quick actions ran into the limit
// and the screen silently kept stale data. With this queue:
// - a request made while nothing is running waits `delayMs`, and every
//   request made in that window shares the one reload;
// - a request made while a reload is running joins a single follow-up that
//   starts when the running one ends, so it still sees the latest writes;
// - every caller's promise settles once the reload covering it has ended.
//   It never rejects: `run` reports its own failures.

export interface RefreshQueue {
  /** Ask for a reload. `immediate` skips the merge window (not a running reload). */
  request: (options?: { immediate?: boolean }) => Promise<void>
  /** Stop: a waiting request settles without reloading, later ones do nothing. */
  dispose: () => void
}

export const createRefreshQueue = (run: () => Promise<void>, delayMs: number): RefreshQueue => {
  let running: Promise<void> | null = null
  let waiting: Promise<void> | null = null
  let startWaiting: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const start = (): Promise<void> => {
    const current = Promise.resolve()
      .then(run)
      .catch(() => undefined)
      .then(() => {
        if (running === current) running = null
      })
    running = current
    return current
  }

  const request = (options: { immediate?: boolean } = {}): Promise<void> => {
    if (disposed) return Promise.resolve()

    if (!waiting) {
      waiting = new Promise<void>((resolve) => {
        const go = () => {
          if (timer) clearTimeout(timer)
          timer = null
          startWaiting = null
          void (running ?? Promise.resolve())
            .then(() => {
              waiting = null
              return disposed ? undefined : start()
            })
            .then(resolve)
        }
        startWaiting = go
        timer = setTimeout(go, delayMs)
      })
    }

    const pending = waiting
    if (options.immediate && startWaiting) startWaiting()
    return pending
  }

  const dispose = () => {
    disposed = true
    if (startWaiting) startWaiting()
  }

  return { request, dispose }
}
