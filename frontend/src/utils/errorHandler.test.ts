import {
  handleApiError,
  handleApiErrorWithFallback,
  withErrorHandling,
} from './errorHandler'

describe('handleApiError', () => {
  const op = 'fetch farms'

  test('returns a generic "Failed to {operation}" when the error is not an Error', () => {
    expect(handleApiError('some string', op)).toBe(`Failed to ${op}`)
    expect(handleApiError(null, op)).toBe(`Failed to ${op}`)
  })

  test('maps 401 / Unauthorized to an auth-required message', () => {
    expect(handleApiError(new Error('HTTP 401 Unauthorized'), op)).toContain(
      'Authentication required',
    )
  })

  test('maps 403 / Forbidden to a permission message', () => {
    expect(handleApiError(new Error('403 Forbidden'), op)).toContain("don't have permission")
  })

  test('maps 404 / not found to a resource-not-found message', () => {
    expect(handleApiError(new Error('404 not found'), op)).toContain('Resource not found')
  })

  test('maps timeout errors to a retry message', () => {
    expect(handleApiError(new Error('request timeout'), op)).toContain('Request timeout')
  })

  test('maps network errors to a connection message', () => {
    expect(handleApiError(new Error('Failed to fetch'), op)).toContain('Network error')
  })

  test('returns the raw error message when no pattern matches', () => {
    expect(handleApiError(new Error('validation failed: field X'), op)).toBe(
      'validation failed: field X',
    )
  })
})

describe('handleApiErrorWithFallback', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('returns the fallback value when provided', () => {
    const result = handleApiErrorWithFallback<string[]>(new Error('boom'), {
      operation: 'list things',
      fallbackValue: [],
    })
    expect(result).toEqual([])
  })

  test('throws when no fallback is provided', () => {
    expect(() =>
      handleApiErrorWithFallback(new Error('boom'), { operation: 'list things' }),
    ).toThrowError('boom')
  })
})

describe('withErrorHandling', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('returns the resolved value on success', async () => {
    const result = await withErrorHandling(async () => 42, { operation: 'compute' })
    expect(result).toBe(42)
  })

  test('returns the fallback when the wrapped function throws', async () => {
    const result = await withErrorHandling<number>(
      async () => {
        throw new Error('boom')
      },
      { operation: 'compute', fallbackValue: 0 },
    )
    expect(result).toBe(0)
  })

  test('rethrows when no fallback is provided', async () => {
    await expect(
      withErrorHandling(
        async () => {
          throw new Error('boom')
        },
        { operation: 'compute' },
      ),
    ).rejects.toThrow('boom')
  })
})
