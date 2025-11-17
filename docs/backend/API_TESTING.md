# Backend API Testing Guide

## Prerequisites

**⚠️ Important: You must start the backend server before testing with Postman!**

### Start Backend Server

1. Open terminal in the `backend` directory
2. Run the development server:
   ```bash
   cd backend
   npm run dev
   ```
3. Wait for the server to start (you should see: `Ready on http://localhost:3000`)
4. Keep this terminal running while testing

### Verify Server is Running

- Check if port 3000 is accessible: Open browser and go to `http://localhost:3000`
- Or test with Postman: Send a GET request to `http://localhost:3000/api/auth/me` (should return 401, which means server is running)

---

## Base Configuration

- **Base URL**: `http://localhost:3000/api`
- **Headers**: `Content-Type: application/json`

---

## Authentication Endpoints

### Forgot Password (Request Reset Link)

**Endpoint**: `POST /api/auth/forgot-password`

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Success Response (200)**:

**Production Mode**:
```json
{
  "message": "If an account with that email exists, we have sent a password reset link."
}
```

**Development Mode** (includes token for testing):
```json
{
  "message": "If an account with that email exists, we have sent a password reset link.",
  "devToken": "abc123def456...",
  "devResetUrl": "http://localhost:5173/reset-password?token=abc123def456..."
}
```

> **Note**: `devToken` and `devResetUrl` are only included when `NODE_ENV !== 'production'` for security reasons.

**Error Responses**:
- `400`: `{ "error": "Email is required" }`
- `500`: `{ "error": "Email service is not configured. Please set EMAIL_ENABLED=true and RESEND_API_KEY in .env" }`
- `500`: `{ "error": "Failed to send email: [error message]" }`

---

### Verify Reset Token

**Endpoint**: `GET /api/auth/verify-reset-token?token=YOUR_TOKEN`

**Query Parameters**:
- `token`: Reset token from email

**Success Response (200)**:
```json
{
  "valid": true,
  "email": "user@example.com"
}
```

**Invalid Token (200)**:
```json
{
  "valid": false
}
```

**Error Response (400)**:
```json
{
  "error": "Token is required"
}
```

---

### Reset Password

**Endpoint**: `POST /api/auth/reset-password`

**Request Body**:
```json
{
  "token": "your_reset_token_here",
  "password": "newpassword123"
}
```

**Success Response (200)**:
```json
{
  "message": "Password has been reset successfully. You can now log in with your new password."
}
```

**Error Responses**:
- `400`: `{ "error": "Token and password are required" }`
- `400`: `{ "error": "Password must be at least 6 characters" }`
- `400`: `{ "error": "Invalid or expired reset token" }`
- `400`: `{ "error": "This reset token has already been used" }`
- `400`: `{ "error": "Reset token has expired. Please request a new one." }`

---

## Testing Flow

### Method 1: Using Development Mode (Recommended for Postman)

1. **Request Reset**: POST to `/api/auth/forgot-password` with email
2. **Get Token from Response**: In development mode, the response includes `devToken` and `devResetUrl`
   ```json
   {
     "message": "If an account with that email exists, we have sent a password reset link.",
     "devToken": "abc123...",
     "devResetUrl": "http://localhost:5173/reset-password?token=abc123..."
   }
   ```
3. **Verify Token**: GET `/api/auth/verify-reset-token?token=...` (use token from step 2)
4. **Reset Password**: POST to `/api/auth/reset-password` with token and new password

### Method 2: Using Database (Prisma Studio)

1. **Request Reset**: POST to `/api/auth/forgot-password` with email
2. **Open Prisma Studio**: Run `npx prisma studio` in backend directory
3. **View Token**: Navigate to `PasswordResetToken` table and find the latest token
4. **Copy Token**: Copy the `token` value
5. **Verify Token**: GET `/api/auth/verify-reset-token?token=...`
6. **Reset Password**: POST to `/api/auth/reset-password` with token and new password

### Method 3: Using Resend Dashboard

1. **Request Reset**: POST to `/api/auth/forgot-password` with email
2. **Check Resend Dashboard**: Go to https://resend.com/emails
3. **View Email**: Click on the latest email sent
4. **Extract Token**: Copy the token from the reset link in the email
5. **Verify Token**: GET `/api/auth/verify-reset-token?token=...`
6. **Reset Password**: POST to `/api/auth/reset-password` with token and new password

---

## Troubleshooting

### Email not sending?
- Check backend console logs for `[EMAIL]` and `[ERROR]` messages
- Verify `EMAIL_ENABLED=true` in `.env`
- Verify `RESEND_API_KEY` is correct
- Check Resend dashboard: https://resend.com/emails

### Getting 500 error?
- Check backend console for detailed error message
- Verify email configuration in `.env`
- Check Resend API key is valid

### Token not working?
- Token expires in 10 minutes
- Token can only be used once
- Check token is copied correctly from email or response

### How to get token for Postman testing?

**Option 1: Development Mode (Easiest - Recommended)**
- Make sure `NODE_ENV` is not set to `production` (default in development)
- Send POST request to `/api/auth/forgot-password` with email
- The response will include `devToken` field
- Copy the token from the response and use it in subsequent requests

**Option 2: Prisma Studio**
- Run `npx prisma studio` in the backend directory
- Open `PasswordResetToken` table
- Find the latest token (sorted by `createdAt` descending)
- Copy the `token` value

**Option 3: Resend Dashboard**
- Go to https://resend.com/emails
- View the latest email sent
- Extract token from the reset link in the email (look for `?token=...`)

