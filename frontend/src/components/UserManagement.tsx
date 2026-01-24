import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { User, UserRole } from '../types';
import { Users as UsersIcon, AlertCircle, UserPlus, Edit, Trash2, Shield, Search, Key, X, Filter } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import CreateUserModal from './modals/CreateUserModal';
import EditUserModal from './modals/EditUserModal';
import TransferOwnershipModal from './modals/TransferOwnershipModal';

const UserManagement: React.FC = () => {
    const { currentUser } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>('');

    // Check if user has Admin role
    const isAdmin = currentUser?.roles?.includes(UserRole.Admin) ?? false;

    // Search and filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('');

    // Redirect if not admin (additional check in component)
    useEffect(() => {
        if (currentUser && !isAdmin) {
            // This should not happen if ProtectedRoute works, but adding as safety
            window.location.href = '/farmer-dashboard';
        }
    }, [currentUser, isAdmin]);

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
    const [newPassword, setNewPassword] = useState<string>('');

    // Load users from backend on component mount and when filters change
    useEffect(() => {
        fetchUsers();
    }, [searchTerm, roleFilter, statusFilter]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            setError('');

            // Build query params
            const params: Record<string, string> = {};
            if (searchTerm) params.search = searchTerm;
            if (roleFilter) params.role = roleFilter;
            if (statusFilter) params.status = statusFilter;

            const queryString = Object.keys(params).length > 0
                ? '?' + new URLSearchParams(params).toString()
                : '';

            const response = await api.get<{ users: User[] }>(`/users${queryString}`);
            setUsers(response.users || []);
        } catch (err: any) {
            console.error('Error fetching users:', err);
            
            // Provide more specific error messages
            let errorMessage = 'Failed to load users.';
            if (err instanceof Error) {
                const errMsg = err.message.toLowerCase();
                if (errMsg.includes('401') || errMsg.includes('unauthorized')) {
                    errorMessage = 'Authentication required. Please log in again.';
                } else if (errMsg.includes('403') || errMsg.includes('forbidden')) {
                    errorMessage = 'Access denied. Admin role required to view users.';
                } else if (errMsg.includes('connection pool') || errMsg.includes('maxclientsinsessionmode') || errMsg.includes('pool exhausted')) {
                    errorMessage = 'Database connection pool exhausted. This is a server configuration issue. Please configure connection pooling in Vercel environment variables. See CONNECTION_POOLING.md for details.';
                } else if (errMsg.includes('failed to fetch') || errMsg.includes('network') || errMsg.includes('cannot connect')) {
                    errorMessage = 'Cannot connect to backend server. Please check if the backend is running.';
                } else if (errMsg.includes('timeout')) {
                    errorMessage = 'Request timeout. The server is taking too long to respond.';
                } else {
                    errorMessage = `Failed to load users: ${err.message}`;
                }
            }
            
            setError(errorMessage);
            setUsers([]);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!resetPasswordUser) return;

        // Generate a random password
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
        const generatedPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

        try {
            await api.put(`/users/${resetPasswordUser.id}`, { password: generatedPassword });
            setNewPassword(generatedPassword);
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to reset password');
            setResetPasswordUser(null);
        }
    };

    const clearFilters = () => {
        setSearchTerm('');
        setRoleFilter('');
        setStatusFilter('');
    };

    const handleEditUser = (user: User) => {
        setSelectedUser(user);
        setShowEditModal(true);
    };

    const handleDeleteUser = async (user: User) => {
        if (user.isSuperAdmin) {
            alert('Cannot delete super admin. Transfer ownership first.');
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete ${user.name}? This action cannot be undone.`
        );

        if (!confirmed) return;

        try {
            await api.delete(`/users/${user.id}`);
            fetchUsers();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete user');
        }
    };

    const handleTransferOwnership = () => {
        setShowTransferModal(true);
    };

    const getRoleBadgeColor = (role: UserRole) => {
        const colors: Record<UserRole, string> = {
            [UserRole.Admin]: 'bg-purple-100 text-purple-700 border-purple-200',
            [UserRole.Farmer]: 'bg-green-100 text-green-700 border-green-200',
            [UserRole.Processor]: 'bg-blue-100 text-blue-700 border-blue-200',
            [UserRole.Roaster]: 'bg-orange-100 text-orange-700 border-orange-200',
            [UserRole.HeadJudge]: 'bg-indigo-100 text-indigo-700 border-indigo-200',
            [UserRole.Cupper]: 'bg-pink-100 text-pink-700 border-pink-200',
        };
        return colors[role] || 'bg-gray-100 text-gray-700 border-gray-200';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading users...</p>
                </div>
            </div>
        );
    }

    const superAdmin = users.find((u) => u.isSuperAdmin);

    return (
        <div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <UsersIcon className="h-8 w-8 text-indigo-600" />
                            User Management
                        </h1>
                        <p className="text-gray-600 mt-2">
                            Manage user accounts, roles, and permissions.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        {currentUser?.isSuperAdmin && (
                            <button
                                onClick={handleTransferOwnership}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                            >
                                <Shield className="h-5 w-5" />
                                Transfer Ownership
                            </button>
                        )}
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                        >
                            <UserPlus className="h-5 w-5" />
                            Create User
                        </button>
                    </div>
                </div>
            </div>

            {/* Search and Filter Section */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name, email, or username..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div className="flex gap-3">
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">All Roles</option>
                            {Object.values(UserRole).map(role => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                        {(searchTerm || roleFilter || statusFilter) && (
                            <button
                                onClick={clearFilters}
                                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                <X className="h-4 w-4" />
                                Clear
                            </button>
                        )}
                    </div>
                </div>
                {(searchTerm || roleFilter || statusFilter) && (
                    <div className="mt-3 text-sm text-gray-500">
                        Found {users.length} user{users.length !== 1 ? 's' : ''}
                    </div>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-lg">
                    <div className="flex items-start">
                        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-red-800">Error</p>
                            <p className="text-sm text-red-700 mt-1">{error}</p>
                            {error.includes('Authentication required') && (
                                <p className="text-xs text-red-600 mt-2">
                                    Your session may have expired. Please try refreshing the page or logging in again.
                                </p>
                            )}
                            {error.includes('Access denied') && (
                                <p className="text-xs text-red-600 mt-2">
                                    You need Admin role to access this page. Please contact an administrator.
                                </p>
                            )}
                            {error.includes('Cannot connect') && (
                                <p className="text-xs text-red-600 mt-2">
                                    Make sure the backend server is running and accessible. Check the console for more details.
                                </p>
                            )}
                            {error.includes('connection pool') && (
                                <div className="text-xs text-red-600 mt-2 space-y-1">
                                    <p><strong>วิธีแก้ไข:</strong></p>
                                    <ol className="list-decimal list-inside ml-2 space-y-1">
                                        <li>ไปที่ Vercel Project Settings → Environment Variables</li>
                                        <li>ตั้งค่า DATABASE_URL ให้ใช้ connection pooler:</li>
                                        <li className="ml-4">- Supabase: ใช้ port 6543 และเพิ่ม ?pgbouncer=true</li>
                                        <li className="ml-4">- Neon: เพิ่ม ?pgbouncer=true&connection_limit=1</li>
                                        <li className="ml-4">- หรือใช้ Prisma Accelerate (แนะนำ)</li>
                                        <li>Redeploy application</li>
                                    </ol>
                                    <p className="mt-2">ดูรายละเอียดเพิ่มเติมใน backend/CONNECTION_POOLING.md</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-900">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Name</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Username</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Email</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Password</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Roles</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center">
                                        <UsersIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                        <p className="text-gray-500 font-medium">No users found</p>
                                        <p className="text-sm text-gray-400 mt-1">
                                            Click "Create User" to add your first user
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                users.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className="text-sm font-medium text-gray-900">{user.name}</div>
                                                {user.isSuperAdmin && (
                                                    <Shield className="h-4 w-4 text-purple-600" title="Super Admin" />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-500">{user.username || 'N/A'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-500">{user.email || 'N/A'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {user.temporaryPassword ? (
                                                <div className="flex items-center gap-2">
                                                    <code className="text-xs font-mono bg-amber-50 text-amber-800 px-2 py-1 rounded border border-amber-200">
                                                        {user.temporaryPassword}
                                                    </code>
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(user.temporaryPassword!);
                                                            alert('Password copied!');
                                                        }}
                                                        className="text-xs text-amber-600 hover:text-amber-800"
                                                        title="Copy password"
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-sm text-gray-400">*****</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {user.roles.map(role => (
                                                    <span
                                                        key={role}
                                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${getRoleBadgeColor(role)}`}
                                                    >
                                                        {role}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                                    user.isActive !== false
                                                        ? 'bg-green-50 text-green-700 border-green-200'
                                                        : 'bg-gray-100 text-gray-600 border-gray-200'
                                                }`}
                                            >
                                                {user.isActive !== false ? 'Active' : 'Disabled'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleEditUser(user)}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Edit user"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setResetPasswordUser(user);
                                                        setNewPassword('');
                                                    }}
                                                    className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                    title="Reset password"
                                                >
                                                    <Key className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(user)}
                                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title={user.isSuperAdmin ? "Cannot delete super admin" : "Delete user"}
                                                    disabled={user.isSuperAdmin}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            <CreateUserModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onUserCreated={fetchUsers}
            />

            <EditUserModal
                isOpen={showEditModal}
                user={selectedUser}
                onClose={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                }}
                onUserUpdated={fetchUsers}
            />

            <TransferOwnershipModal
                isOpen={showTransferModal}
                currentSuperAdmin={superAdmin || null}
                onClose={() => setShowTransferModal(false)}
                onTransferComplete={fetchUsers}
            />

            {/* Reset Password Modal */}
            {resetPasswordUser && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="fixed inset-0 bg-black/50" onClick={() => setResetPasswordUser(null)} />
                        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">
                                Reset Password for {resetPasswordUser.name}
                            </h3>

                            {!newPassword ? (
                                <div className="space-y-4">
                                    <p className="text-sm text-gray-600">
                                        This will generate a new password for <strong>{resetPasswordUser.username}</strong>.
                                        The user will be required to change it on next login.
                                    </p>
                                    <div className="flex justify-end gap-3">
                                        <button
                                            onClick={() => setResetPasswordUser(null)}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleResetPassword}
                                            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
                                        >
                                            Reset Password
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                        <p className="text-sm font-semibold text-green-800 mb-2">
                                            Password reset successfully!
                                        </p>
                                        <div className="bg-white rounded p-3">
                                            <p className="text-xs text-gray-500 mb-1">New Password:</p>
                                            <div className="flex items-center gap-2">
                                                <code className="flex-1 text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                                                    {newPassword}
                                                </code>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(newPassword);
                                                        alert('Password copied!');
                                                    }}
                                                    className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-amber-700 mt-2">
                                            ⚠️ Save this password! It won't be shown again.
                                        </p>
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => {
                                                setResetPasswordUser(null);
                                                setNewPassword('');
                                            }}
                                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
