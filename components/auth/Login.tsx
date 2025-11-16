import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coffee, LogIn, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getAllUsers } from '../../services/authService';
import { MockUser } from '../../mockUsers';
import { UserRole } from '../../types';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  // Get role-based colors (same as Header)
  const getRoleColors = (role: UserRole) => {
    switch (role) {
      case UserRole.Farmer:
        return { bg: 'bg-green-100', hoverBg: 'group-hover:bg-green-200', text: 'text-green-600', badge: 'bg-green-100 text-green-700 border-green-200' };
      case UserRole.Processor:
        return { bg: 'bg-blue-100', hoverBg: 'group-hover:bg-blue-200', text: 'text-blue-600', badge: 'bg-blue-100 text-blue-700 border-blue-200' };
      case UserRole.Roaster:
        return { bg: 'bg-orange-100', hoverBg: 'group-hover:bg-orange-200', text: 'text-orange-600', badge: 'bg-orange-100 text-orange-700 border-orange-200' };
      case UserRole.HeadJudge:
      case UserRole.Cupper:
        return { bg: 'bg-purple-100', hoverBg: 'group-hover:bg-purple-200', text: 'text-purple-600', badge: 'bg-purple-100 text-purple-700 border-purple-200' };
      case UserRole.Admin:
        return { bg: 'bg-red-100', hoverBg: 'group-hover:bg-red-200', text: 'text-red-600', badge: 'bg-red-100 text-red-700 border-red-200' };
      default:
        return { bg: 'bg-gray-100', hoverBg: 'group-hover:bg-gray-200', text: 'text-gray-600', badge: 'bg-gray-100 text-gray-700 border-gray-200' };
    }
  };

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [displayUsers, setDisplayUsers] = useState<MockUser[]>([]);

  // Load users from localStorage on mount
  useEffect(() => {
    const users = getAllUsers();
    setDisplayUsers(users);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(formData.email, formData.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (email: string, password: string) => {
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="max-w-6xl w-full">
        {/* Main Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-600 p-4 rounded-lg shadow-sm">
              <Coffee className="h-12 w-12 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Coffee Lab</h1>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Login Form */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h2>
              <p className="text-gray-600">Sign in to your account</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email Input */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm hover:border-gray-400"
                  placeholder="your.email@coffee.com"
                />
              </div>

              {/* Password Input */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-sm hover:border-gray-400"
                  placeholder="••••••••"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg text-sm">
                  <p className="font-semibold">Error</p>
                  <p>{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-5 w-5" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Mock Users Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <User className="h-6 w-6 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Demo Accounts</h2>
              </div>
            </div>

            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
              {displayUsers.map((user) => {
                const primaryRole = user.roles[0] as UserRole;
                const colors = getRoleColors(primaryRole);
                return (
                  <button
                    key={user.id}
                    onClick={() => handleQuickLogin(user.email, user.password)}
                    disabled={isLoading}
                    className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed group bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className={`${colors.bg} p-2 rounded-lg ${colors.hoverBg} transition-colors`}>
                          <User className={`h-5 w-5 ${colors.text}`} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-base">{user.name}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {user.roles.map((role, index) => {
                              const roleColors = getRoleColors(role as UserRole);
                              return (
                                <span
                                  key={role}
                                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${roleColors.badge}`}
                                >
                                  {role}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <LogIn className={`h-5 w-5 text-gray-400 ${colors.text.replace('text-', 'group-hover:text-')} transition-colors`} />
                    </div>
                    <div className="pl-12 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-semibold min-w-[45px]">Email:</span>
                        <span className="font-mono text-xs bg-gray-50 px-2 py-1 rounded text-gray-700 border border-gray-200">{user.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-semibold min-w-[45px]">Pass:</span>
                        <span className="font-mono text-xs bg-gray-50 px-2 py-1 rounded text-gray-700 border border-gray-200">{user.password}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 text-sm">
        </div>
      </div>
    </div>
  );
};

export default Login;