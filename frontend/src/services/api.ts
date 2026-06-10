// Base API utility for making requests to backend
import { connectionManager } from '../utils/connectionManager'
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface RequestOptions extends RequestInit {
  params?: Record<string, string>
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
  retries: number = 2
): Promise<T> {
  const { params, ...fetchOptions } = options

  // If backend is known to be down, fail fast without a network call
  if (connectionManager.shouldSuppress()) {
    throw new Error('Cannot connect to backend server. Please ensure the backend server is running on port 3001.')
  }

  // Build URL with query params
  let url = `${API_BASE_URL}${endpoint}`
  if (params) {
    const searchParams = new URLSearchParams(params)
    url += `?${searchParams.toString()}`
  }

  // Create AbortController for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

  try {
    // Auth is carried entirely by the httpOnly cookie attached via
    // `credentials: 'include'`. No Authorization header — never read a
    // JWT from localStorage (XSS surface).
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
      credentials: 'include', // Include httpOnly auth cookie
    })
    
    clearTimeout(timeoutId)

    // Retry on 503 (connection pool exhausted) with exponential backoff
    // Do NOT report success yet — the retry may still fail
    if (response.status === 503 && retries > 0) {
      const backoffMs = (3 - retries) * 1000; // 1s, 2s
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return request<T>(endpoint, options, retries - 1);
    }

    // Persistent 503 after retries means DB is truly down
    if (response.status === 503) {
      connectionManager.reportFailure()
    } else {
      connectionManager.reportSuccess()
    }

    if (!response.ok) {
      // Handle 401 Unauthorized - token expired or invalid
      if (response.status === 401) {
        // For login endpoint, don't clear token (user is trying to login)
        const isLoginEndpoint = endpoint.includes('/auth/login')
        const isAuthMeEndpoint = endpoint.includes('/auth/me')
        
        if (!isLoginEndpoint && !isAuthMeEndpoint) {
          // Clear cached user blob for other endpoints
          // (auth token lives in httpOnly cookie and is cleared by /auth/logout)
          localStorage.removeItem('coffee_lab_user')

          // Dispatch custom event to notify AuthContext to logout
          // This ensures the app state is cleared and user is redirected to login
          window.dispatchEvent(new CustomEvent('auth:logout', {
            detail: { reason: 'token_expired' }
          }))
        }
        
        // For /auth/me, 401 is expected when user is not logged in
        // Don't log it as an error to reduce console noise
        if (isAuthMeEndpoint) {
          // Silently handle - user is simply not authenticated
          const errorMessage = 'Unauthorized'
          throw new Error(errorMessage)
        }
      }
      
      // Try to parse error response
      let errorMessage = `HTTP error! status: ${response.status}`
      try {
        const error = await response.json()
        errorMessage = error.error || error.message || errorMessage
      } catch {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage
      }
      
      throw new Error(errorMessage)
    }

    return response.json()
  } catch (error) {
    clearTimeout(timeoutId)
    
    // Handle different types of errors
    if (error instanceof Error) {
      // Timeout error
      if (error.name === 'AbortError') {
        connectionManager.reportFailure()
        throw new Error('Connection timeout: Backend server is not responding. Please ensure the backend server is running on port 3001.')
      }
      
      // Network errors (ERR_EMPTY_RESPONSE, Failed to fetch, etc.)
      const errorMessage = error.message.toLowerCase()
      if (errorMessage.includes('failed to fetch') ||
          errorMessage.includes('networkerror') ||
          errorMessage.includes('empty_response') ||
          errorMessage.includes('network error')) {
        connectionManager.reportFailure()
        throw new Error('Cannot connect to backend server. Please ensure the backend server is running on port 3001.')
      }
    }
    
    throw error
  }
}

// Bulk-load types
export interface BulkPhase1Response {
  farms: any[]
  harvestLots: any[]
  cropYears: any[]
  processTypes: any[]
  activityTypes: any[]
  customers: any[]
  users: any[]
}

export interface BulkPhase2Response {
  soilAnalyses: any[]
  weatherRecords: any[]
  gapLogs: any[]
  processingBatches: any[]
  parchmentLots: any[]
  greenBeanLots: any[]
  roasterInventory: any[]
  roastBatches: any[]
}

export const bulkLoadPhase1 = () => request<BulkPhase1Response>('/bulk-load', { method: 'GET', params: { phase: '1' } })
export const bulkLoadPhase2 = () => request<BulkPhase2Response>('/bulk-load', { method: 'GET', params: { phase: '2' } })

export const api = {
  get: <T>(endpoint: string, params?: Record<string, string>) =>
    request<T>(endpoint, { method: 'GET', params }),

  post: <T>(endpoint: string, data?: any) =>
    request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  put: <T>(endpoint: string, data?: any) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  patch: <T>(endpoint: string, data?: any) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
}

