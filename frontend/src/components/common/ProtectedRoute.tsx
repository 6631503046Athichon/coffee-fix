import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { UserRole } from '../../types'
import { getDashboardPathByRole } from '../../utils/routing'
import AuthLoadingScreen from '../auth/AuthLoadingScreen'
import { loginRedirectState } from '../auth/loginRedirect'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles: UserRole[]
}

// Return ReactNode (not ReactElement) so we can render `children`
// directly without the extra `<></>` wrapper. React 19 + react-router 7
// accept any ReactNode here.
const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps): React.ReactNode => {
  const { currentUser, isAuthenticated, isAuthLoading } = useAuth()
  const location = useLocation()

  if (isAuthLoading) {
    return <AuthLoadingScreen />
  }

  if (!isAuthenticated || !currentUser) {
    // Remember the page so the login page can come back to it.
    return <Navigate to="/login" replace state={loginRedirectState(location)} />
  }

  // Check if user has at least one of the required roles. A super admin
  // counts as an Admin whatever roles the account lists (isAdminUser; the
  // backend's requireRole lets them through too).
  const normalizedUserRoles = currentUser.roles.map((role) => String(role).trim().toLowerCase())
  if (currentUser.isSuperAdmin) normalizedUserRoles.push(UserRole.Admin.toLowerCase())
  const hasRequiredRole = allowedRoles.some((role) =>
    normalizedUserRoles.includes(String(role).toLowerCase()),
  )

  if (!hasRequiredRole) {
    // Immediately redirect instead of showing error page
    return <Navigate to={getDashboardPathByRole(currentUser.roles)} replace />
  }

  return children
}

export { ProtectedRoute }
export default ProtectedRoute
