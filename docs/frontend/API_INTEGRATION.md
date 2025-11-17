# Frontend API Integration Guide

## API Configuration

### Base URL
The frontend is configured to call the backend API at:
- **Development**: `http://localhost:3000/api`
- **Production**: Set via `VITE_API_URL` environment variable

### Configuration File
- **Location**: `frontend/src/services/api.ts`
- **Default**: `http://localhost:3000/api`

## Authentication Services

### Login
- **Service**: `authService.login(email, password)`
- **Backend**: `POST /api/auth/login`
- **Returns**: User object

### Register
- **Service**: `authService.register(data)`
- **Backend**: `POST /api/auth/register`
- **Returns**: User object

### Logout
- **Service**: `authService.logout()`
- **Backend**: `POST /api/auth/logout`

### Get Current User
- **Service**: `authService.getCurrentUser()`
- **Backend**: `GET /api/auth/me`

### Forgot Password
- **Component**: `ForgotPassword.tsx`
- **Backend**: `POST /api/auth/forgot-password`
- **Request**: `{ email: string }`
- **Response**: `{ message: string }`

### Reset Password
- **Component**: `ResetPassword.tsx`
- **Backend**: 
  - `GET /api/auth/verify-reset-token?token=...` (verify token)
  - `POST /api/auth/reset-password` (reset password)
- **Request**: `{ token: string, password: string }`
- **Response**: `{ message: string }`

## API Utility

### Location
`frontend/src/services/api.ts`

### Methods
```typescript
api.get<T>(endpoint: string, params?: Record<string, string>)
api.post<T>(endpoint: string, data?: any)
api.put<T>(endpoint: string, data?: any)
api.delete<T>(endpoint: string)
```

### Features
- Automatic token inclusion from cookies/localStorage
- Error handling and parsing
- CORS support with credentials

## Testing Frontend API Calls

### Using Browser DevTools

1. Open Browser DevTools (F12)
2. Go to **Network** tab
3. Perform action in frontend (e.g., submit forgot password)
4. Check network requests:
   - **Request URL**: Should be `http://localhost:3000/api/...`
   - **Request Method**: POST/GET/PUT/DELETE
   - **Request Headers**: Should include `Content-Type: application/json`
   - **Request Payload**: Check if data is correct
   - **Response**: Check status and body

### Common Issues

**CORS Error**:
- Check backend CORS configuration in `backend/next.config.js`
- Verify `FRONTEND_URL` in backend `.env`

**401 Unauthorized**:
- Check if user is logged in
- Verify token in cookies/localStorage

**404 Not Found**:
- Verify backend server is running on port 3000
- Check API endpoint path is correct

**500 Internal Server Error**:
- Check backend console logs
- Verify backend configuration

## Frontend Routes

### Public Routes
- `/login` - Login page
- `/forgot-password` - Forgot password page
- `/reset-password?token=...` - Reset password page

### Protected Routes
- `/dashboard` - Main dashboard
- `/processor` - Processor workbench
- `/cupping` - Cupping hub
- `/roaster` - Roaster workbench
- And more...

## Environment Variables

Create `frontend/.env` (optional):
```env
VITE_API_URL=http://localhost:3000/api
```

If not set, defaults to `http://localhost:3000/api`

