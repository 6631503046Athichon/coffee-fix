import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';
import { getDashboardPathByRole } from '../../utils/routing';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

// Return ReactNode (not ReactElement) so we can render `children`
// directly without the extra `<></>` wrapper. React 19 + react-router 7
// accept any ReactNode here.
const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps): React.ReactNode => {
  const { currentUser, isAuthenticated, isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Check if user has at least one of the required roles
  const hasRequiredRole = currentUser.roles.some(role => allowedRoles.includes(role));

  if (!hasRequiredRole) {
    // Immediately redirect instead of showing error page
    return <Navigate to={getDashboardPathByRole(currentUser.roles)} replace />;
  }

  return children;
};

export { ProtectedRoute };
export default ProtectedRoute;
