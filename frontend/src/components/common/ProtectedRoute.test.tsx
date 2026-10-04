import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { User, UserRole } from '../../types'
import ProtectedRoute from './ProtectedRoute'

// A super admin counts as an Admin whatever roles the account lists (the
// backend's requireRole lets them through), so Admin pages must not send
// them away. A signed-out visitor goes to /login with the page remembered.

const { auth } = vi.hoisted(() => ({
  auth: { currentUser: null as User | null, isAuthenticated: false, isAuthLoading: false },
}))

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))

const LoginProbe: React.FC = () => {
  const location = useLocation()
  return <div>LOGIN PAGE from {String((location.state as { from?: string } | null)?.from)}</div>
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/users"
          element={
            <ProtectedRoute allowedRoles={[UserRole.Admin]}>
              <div>USER MANAGEMENT</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/processor"
          element={
            <ProtectedRoute allowedRoles={[UserRole.Processor, UserRole.Admin]}>
              <div>PROCESSOR WORKBENCH</div>
            </ProtectedRoute>
          }
        />
        <Route path="/farmer-dashboard" element={<div>FARMER DASHBOARD</div>} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>,
  )

const signIn = (user: User | null) => {
  auth.currentUser = user
  auth.isAuthenticated = !!user
  auth.isAuthLoading = false
}

beforeEach(() => signIn(null))

describe('ProtectedRoute', () => {
  it('lets a super admin without the Admin role into an Admin page', () => {
    signIn({ id: 'u-root', name: 'Root', roles: [UserRole.Farmer], isSuperAdmin: true })
    renderAt('/users')
    expect(screen.getByText('USER MANAGEMENT')).toBeInTheDocument()
  })

  it('lets a super admin with no roles at all in as an Admin', () => {
    signIn({ id: 'u-root', name: 'Root', roles: [], isSuperAdmin: true })
    renderAt('/processor')
    expect(screen.getByText('PROCESSOR WORKBENCH')).toBeInTheDocument()
  })

  it('still sends a non-admin away from an Admin page', () => {
    signIn({ id: 'u-farmer', name: 'Fern', roles: [UserRole.Farmer] })
    renderAt('/users')
    expect(screen.getByText('FARMER DASHBOARD')).toBeInTheDocument()
    expect(screen.queryByText('USER MANAGEMENT')).not.toBeInTheDocument()
  })

  it('sends a signed-out visitor to login, remembering the page', () => {
    renderAt('/users')
    expect(screen.getByText('LOGIN PAGE from /users')).toBeInTheDocument()
  })
})
