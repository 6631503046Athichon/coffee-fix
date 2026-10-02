// An HTTP error answer from the backend. It is still an Error whose message is
// the backend's own reason, so callers that only read `message` are unchanged;
// callers that need more (a 409's details) can read `status` and `data`.
// Kept out of api.ts so tests that mock the api client can still use it.
export class ApiError extends Error {
  readonly status: number
  readonly data: unknown

  constructor(message: string, status: number, data: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof ApiError
