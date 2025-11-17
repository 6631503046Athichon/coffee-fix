# API Testing Guide

This is a general API testing guide. For detailed backend API documentation, see:
- **Backend APIs**: `docs/backend/API_TESTING.md`
- **Frontend Integration**: `docs/frontend/API_INTEGRATION.md`

## Quick Start

### Base Configuration
- **Backend URL**: `http://localhost:3000/api`
- **Frontend URL**: `http://localhost:5173`
- **Headers**: `Content-Type: application/json`

### Common Endpoints

#### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user
- `POST /api/auth/forgot-password` - Request password reset
- `GET /api/auth/verify-reset-token` - Verify reset token
- `POST /api/auth/reset-password` - Reset password

For detailed request/response examples, see `docs/backend/API_TESTING.md`
