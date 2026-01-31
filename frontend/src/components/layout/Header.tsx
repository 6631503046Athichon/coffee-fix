import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut } from 'lucide-react';
import { UserRole } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  currentUserRoles: UserRole[];
}

const Header: React.FC<HeaderProps> = ({ currentUserRoles }) => {
  const navigate = useNavigate();
  const { logout, currentUser } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleBadgeColor = (role: UserRole) => {
    const colors: Record<string, string> = {
      'Admin': 'bg-red-100 text-red-700 border-red-200',
      'Farmer': 'bg-green-100 text-green-700 border-green-200',
      'Processor': 'bg-blue-100 text-blue-700 border-blue-200',
      'Roaster': 'bg-amber-100 text-amber-700 border-amber-200',
      'HeadJudge': 'bg-blue-100 text-blue-700 border-blue-200',
      'Cupper': 'bg-blue-100 text-blue-700 border-blue-200',
    };
    return colors[role] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getAvatarStyle = (roles: UserRole[]) => {
    const priority = [UserRole.Admin, UserRole.HeadJudge, UserRole.Roaster, UserRole.Processor, UserRole.Cupper, UserRole.Farmer];
    const primaryRole = priority.find(role => roles.includes(role)) || roles[0];

    const styles: Record<string, string> = {
      'Farmer': 'bg-green-600',
      'Processor': 'bg-blue-600',
      'Roaster': 'bg-amber-600',
      'HeadJudge': 'bg-purple-600',
      'Cupper': 'bg-indigo-600',
      'Admin': 'bg-red-600',
    };
    return styles[primaryRole] || 'bg-blue-600';
  };

  const avatarBgColor = getAvatarStyle(currentUserRoles);

  return (
    <header className="h-16 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between px-4 pl-16 lg:pl-6 lg:px-8 flex-shrink-0">
      {/* Left Section - User Info */}
      <div className="flex items-center space-x-4">
        <div className="relative">
          <div className={`flex items-center justify-center ${avatarBgColor} w-12 h-12 rounded-lg`}>
            <User className="h-6 w-6 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
        </div>
        <div className="hidden sm:block">
          <p className="text-sm font-bold text-gray-900">{currentUser?.name || 'User'}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {currentUserRoles.map(role => (
              <span key={role} className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getRoleBadgeColor(role)}`}>
                {role}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Section - Actions */}
      <div className="flex items-center space-x-3">
        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-lg transition-colors border border-gray-200 hover:border-red-200 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-sm font-semibold hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
