import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
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
    // Redirect to dashboard based on user's role
    const getDashboardPathByRole = (roles: UserRole[]): string => {
      if (roles.includes(UserRole.Processor)) return '/processor';
      if (roles.includes(UserRole.Roaster)) return '/roaster';
      if (roles.includes(UserRole.Cupper) || roles.includes(UserRole.HeadJudge)) return '/cupping';
      if (roles.includes(UserRole.Farmer) || roles.includes(UserRole.Admin)) return '/farmer-dashboard';
      return '/farmer-dashboard';
    };

    // Immediately redirect instead of showing error page
    return <Navigate to={getDashboardPathByRole(currentUser.roles)} replace />;
  }

  return <>{children}</>;
};

export { ProtectedRoute };
export default ProtectedRoute;
