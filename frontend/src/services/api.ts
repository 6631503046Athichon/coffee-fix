// Base API utility for making requests to backend
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface RequestOptions extends RequestInit {
  params?: Record<string, string>
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options

  // Build URL with query params
  let url = `${API_BASE_URL}${endpoint}`
  if (params) {
    const searchParams = new URLSearchParams(params)
    url += `?${searchParams.toString()}`
  }

  // Get auth token from cookie or localStorage
  const token = getAuthToken()

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...fetchOptions.headers,
    },
    credentials: 'include', // Include cookies
  })

  if (!response.ok) {
    // Handle 401 Unauthorized - token expired or invalid
    if (response.status === 401) {
      // For login endpoint, don't clear token (user is trying to login)
      const isLoginEndpoint = endpoint.includes('/auth/login')
      if (!isLoginEndpoint) {
        // Clear invalid token for other endpoints
        localStorage.removeItem('auth-token')
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
}

function getAuthToken(): string | null {
  // Try to get from cookie (if available in browser)
  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split(';')
    const authCookie = cookies.find(c => c.trim().startsWith('auth-token='))
    if (authCookie) {
      return authCookie.split('=')[1]
    }
  }
  
  // Fallback to localStorage (for compatibility)
  return localStorage.getItem('auth-token')
}

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

  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
}

