import { afterEach, beforeEach } from 'vitest'
import { onAppToast } from '../utils/appToast'
import type { AppToast } from '../utils/appToast'

/**
 * Records every toast a test sends through showAppToast, such as
 * downloadCsv's "Nothing to export", without mounting the app's
 * ToastContainer. Call once inside a describe block.
 */
export function captureAppToasts(): AppToast[] {
  const toasts: AppToast[] = []
  let stop = () => {}

  beforeEach(() => {
    toasts.length = 0
    stop = onAppToast((toast) => toasts.push(toast))
  })

  afterEach(() => {
    stop()
  })

  return toasts
}
