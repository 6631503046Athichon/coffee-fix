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

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:24',message:'Making request',data:{url,endpoint,hasToken:!!token,hasAuthHeader:!!token,cookies:typeof document!=='undefined'?document.cookie:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...fetchOptions.headers,
    },
    credentials: 'include', // Include cookies
  })
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:33',message:'Response received',data:{status:response.status,statusText:response.statusText,ok:response.ok,endpoint},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  if (!response.ok) {
    // Handle 401 Unauthorized - token expired or invalid
    if (response.status === 401) {
      // For login endpoint, don't clear token (user is trying to login)
      const isLoginEndpoint = endpoint.includes('/auth/login')
      const isAuthMeEndpoint = endpoint.includes('/auth/me')
      
      if (!isLoginEndpoint) {
        // Clear invalid token for other endpoints
        localStorage.removeItem('auth-token')
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
}

function getAuthToken(): string | null {
  // httpOnly cookies cannot be read from JavaScript, so we rely on localStorage token
  // The cookie is still sent automatically by the browser for same-origin requests
  // But for cross-origin (localhost:5173 -> localhost:3001), we need Authorization header
  const token = localStorage.getItem('auth-token')
  
  // #region agent log
  if (typeof document !== 'undefined') {
    const cookies = document.cookie;
    fetch('http://127.0.0.1:7243/ingest/84336004-c515-4477-b161-abcf43f933fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:77',message:'getAuthToken called',data:{hasToken:!!token,tokenLength:token?.length||0,hasCookies:!!cookies,cookieLength:cookies.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'G'})}).catch(()=>{});
  }
  // #endregion
  
  return token
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

