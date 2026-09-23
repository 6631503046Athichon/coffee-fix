import { afterEach, beforeEach, vi } from 'vitest'

export interface CapturedCsv {
  /** Raw file contents, UTF-8 byte order mark included. */
  text: string
  /** Blob type the download was created with. */
  type: string | undefined
  /** File name the download link offered. */
  filename: string
  /** Rows split on CRLF, without the byte order mark; row 0 is the header. */
  lines: string[]
}

/**
 * Records every CSV a test triggers through downloadCsv: jsdom has no object
 * URLs and cannot follow a download link, so both are stubbed for the test.
 * Call once inside a describe block.
 */
export function captureCsvDownloads(): CapturedCsv[] {
  const downloads: CapturedCsv[] = []
  const OriginalBlob = globalThis.Blob
  const { createObjectURL, revokeObjectURL } = URL

  beforeEach(() => {
    downloads.length = 0
    const pending: { text: string; type: string | undefined }[] = []
    class RecordingBlob extends OriginalBlob {
      constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
        super(parts, options)
        pending.push({ text: parts.join(''), type: options?.type })
      }
    }
    vi.stubGlobal('Blob', RecordingBlob)
    URL.createObjectURL = vi.fn(() => 'blob:test-csv')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      const blob = pending.shift()
      if (!blob) return
      downloads.push({
        ...blob,
        filename: this.download,
        lines: blob.text.replace(/^\uFEFF/, '').split('\r\n'),
      })
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
  })

  return downloads
}
