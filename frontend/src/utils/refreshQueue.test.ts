import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRefreshQueue } from './refreshQueue'

// F42: every reload is two rate-limited bulk-load calls. The queue runs one
// reload at a time and merges bursts, so several requests cost one reload.

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createRefreshQueue', () => {
  it('merges requests made within the window into one reload', async () => {
    const run = vi.fn(async () => {})
    const queue = createRefreshQueue(run, 300)

    const a = queue.request()
    const b = queue.request()
    await vi.advanceTimersByTimeAsync(100)
    const c = queue.request()
    expect(run).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)
    await Promise.all([a, b, c])
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('starts at once when asked to, still sharing the reload with waiting requests', async () => {
    const run = vi.fn(async () => {})
    const queue = createRefreshQueue(run, 300)

    const a = queue.request()
    const b = queue.request({ immediate: true })
    await flush()
    expect(run).toHaveBeenCalledTimes(1)
    await Promise.all([a, b])
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('never runs two reloads at once: requests during one share a single follow-up', async () => {
    const first = deferred()
    const second = deferred()
    const run = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const queue = createRefreshQueue(run, 0)

    const a = queue.request({ immediate: true })
    await flush()
    expect(run).toHaveBeenCalledTimes(1)

    let followUpDone = false
    const b = queue.request({ immediate: true })
    const c = queue.request({ immediate: true })
    const d = queue.request()
    void Promise.all([b, c, d]).then(() => {
      followUpDone = true
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(1)

    first.resolve()
    await a
    await flush()
    expect(run).toHaveBeenCalledTimes(2)
    expect(followUpDone).toBe(false)

    second.resolve()
    await Promise.all([b, c, d])
    expect(followUpDone).toBe(true)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('settles callers even when the reload fails, and keeps working', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('429')).mockResolvedValue(undefined)
    const queue = createRefreshQueue(run, 0)

    await expect(queue.request({ immediate: true })).resolves.toBeUndefined()
    await queue.request({ immediate: true })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('after dispose, a waiting request settles without reloading', async () => {
    const run = vi.fn(async () => {})
    const queue = createRefreshQueue(run, 300)

    const waiting = queue.request()
    queue.dispose()
    await waiting
    await vi.advanceTimersByTimeAsync(1000)
    await queue.request({ immediate: true })
    expect(run).not.toHaveBeenCalled()
  })
})
