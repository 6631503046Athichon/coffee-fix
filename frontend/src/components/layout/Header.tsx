import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, Bell } from 'lucide-react';
import { UserRole } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationItem,
} from '../../services/notificationService';

interface HeaderProps {
  currentUserRoles: UserRole[]; // Changed to support multiple roles
}

const Header: React.FC<HeaderProps> = ({ currentUserRoles }) => {
  const navigate = useNavigate();
  const { logout, currentUser } = useAuth();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const refreshNotifications = async () => {
    if (!currentUser?.id) return;
    setIsLoadingNotifications(true);
    setNotificationsError(null);
    try {
      const res = await fetchNotifications(currentUser.id);
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      setNotificationsError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    // Initial load
    refreshNotifications();

    // Poll periodically (lightweight)
    const id = window.setInterval(() => {
      refreshNotifications();
    }, 30000);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!notificationsOpen) return;
      if (!notificationsRef.current) return;
      if (!notificationsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [notificationsOpen]);

  const handleOpenNotifications = async () => {
    const next = !notificationsOpen;
    setNotificationsOpen(next);
    if (next) {
      await refreshNotifications();
    }
  };

  const handleNotificationClick = (n: NotificationItem) => {
    if (!currentUser?.id) return;

    markNotificationRead(currentUser.id, n.id);
    setUnreadCount((c) => Math.max(0, c - 1));

    if (n.href) {
      navigate(n.href);
    }

    setNotificationsOpen(false);
  };

  const handleMarkAllRead = () => {
    if (!currentUser?.id) return;
    markAllNotificationsRead(currentUser.id, notifications);
    setUnreadCount(0);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
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
    // Prioritize role colors: Admin > Head Judge > Roaster > Processor > Cupper > Farmer
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
        {/* Notification Button & Dropdown */}
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={handleOpenNotifications}
            className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Notifications"
          >
          <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
        </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
              <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-md font-bold text-gray-800">Notifications</h3>
                {notifications.length > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {isLoadingNotifications ? (
                  <div className="p-8 text-center text-sm text-gray-500">Loading...</div>
                ) : notificationsError ? (
                  <div className="p-4 text-center text-sm text-red-600">{notificationsError}</div>
                ) : notifications.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-500">No notifications yet.</div>
                ) : (
                  <ul>
                    {notifications.map((n) => (
                      <li key={n.id}>
                        <button
                          onClick={() => handleNotificationClick(n)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                        >
                          <p className="font-bold text-sm text-gray-800">{n.title}</p>
                          <p className="text-sm text-gray-600">{n.message}</p>
                          <p className="text-xs text-gray-400 mt-1">{formatTime(n.createdAt)}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

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
