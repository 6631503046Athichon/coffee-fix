import React, { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { User, UserRole } from '../types';
import { Users as UsersIcon, AlertCircle, UserPlus, Edit, Trash2, Shield, Search, Key, X, Filter, ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import CreateUserModal from './modals/CreateUserModal';
import EditUserModal from './modals/EditUserModal';
import TransferOwnershipModal from './modals/TransferOwnershipModal';

// Custom Dropdown Component
interface DropdownOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
}

interface CustomDropdownProps {
    options: DropdownOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    icon?: React.ReactNode;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({ options, value, onChange, placeholder, icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={dropdownRef} className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 pl-3 pr-3 py-2.5 border rounded-xl text-sm transition-all duration-200 cursor-pointer font-medium min-w-[140px] ${
                    isOpen
                        ? 'border-indigo-500 ring-2 ring-indigo-500 bg-white'
                        : 'border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300'
                }`}
            >
                {icon && <span className="text-gray-400">{icon}</span>}
                <span className={`flex-1 text-left ${value ? 'text-gray-700' : 'text-gray-400'}`}>
                    {selectedOption?.label || placeholder}
                </span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
                    <div className="py-1 max-h-60 overflow-y-auto">
                        {options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                                    value === option.value
                                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                                        : 'text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                {option.icon && <span>{option.icon}</span>}
                                <span className="flex-1 text-left">{option.label}</span>
                                {value === option.value && (
                                    <Check className="h-4 w-4 text-indigo-600" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

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

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 10;

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
        setCurrentPage(1);
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
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 mb-6 relative z-20">
                <div className="flex flex-col lg:flex-row gap-4">
                    {/* Search Input */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name, email, or username..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
                        />
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 items-center">
                        {/* Role Filter */}
                        <CustomDropdown
                            options={[
                                { value: '', label: 'All Roles' },
                                ...Object.values(UserRole).map(role => ({
                                    value: role,
                                    label: role,
                                    icon: <div className={`h-2 w-2 rounded-full ${
                                        role === UserRole.Admin ? 'bg-purple-500' :
                                        role === UserRole.Farmer ? 'bg-green-500' :
                                        role === UserRole.Processor ? 'bg-blue-500' :
                                        role === UserRole.Roaster ? 'bg-orange-500' :
                                        role === UserRole.HeadJudge ? 'bg-indigo-500' :
                                        'bg-pink-500'
                                    }`} />
                                }))
                            ]}
                            value={roleFilter}
                            onChange={setRoleFilter}
                            placeholder="All Roles"
                            icon={<Filter className="h-4 w-4" />}
                        />

                        {/* Status Filter */}
                        <CustomDropdown
                            options={[
                                { value: '', label: 'All Status', icon: <div className="h-2 w-2 rounded-full bg-gray-300" /> },
                                { value: 'active', label: 'Active', icon: <div className="h-2 w-2 rounded-full bg-green-500" /> },
                                { value: 'inactive', label: 'Inactive', icon: <div className="h-2 w-2 rounded-full bg-gray-400" /> },
                            ]}
                            value={statusFilter}
                            onChange={setStatusFilter}
                            placeholder="All Status"
                        />

                        {/* Clear Button */}
                        {(searchTerm || roleFilter || statusFilter) && (
                            <button
                                onClick={clearFilters}
                                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 hover:border-red-300 transition-all duration-200"
                            >
                                <X className="h-4 w-4" />
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* Results Count */}
                {(searchTerm || roleFilter || statusFilter) && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-semibold text-indigo-600">{users.length}</span>
                            <span className="text-gray-500">user{users.length !== 1 ? 's' : ''} found</span>
                            {searchTerm && (
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-xs font-medium">
                                    "{searchTerm}"
                                </span>
                            )}
                            {roleFilter && (
                                <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md text-xs font-medium">
                                    {roleFilter}
                                </span>
                            )}
                            {statusFilter && (
                                <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                                    statusFilter === 'active'
                                        ? 'bg-green-50 text-green-700'
                                        : 'bg-gray-100 text-gray-600'
                                }`}>
                                    {statusFilter}
                                </span>
                            )}
                        </div>
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
                                <th className="w-[15%] px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Name</th>
                                <th className="w-[18%] px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Username</th>
                                <th className="w-[25%] px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Email</th>
                                <th className="w-[17%] px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Roles</th>
                                <th className="w-[10%] px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                                <th className="w-[15%] px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center">
                                        <UsersIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                        <p className="text-gray-500 font-medium">No users found</p>
                                        <p className="text-sm text-gray-400 mt-1">
                                            Click "Create User" to add your first user
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                users.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(user => (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="text-sm font-medium text-gray-900 truncate">{user.name}</div>
                                                {user.isSuperAdmin && (
                                                    <Shield className="h-4 w-4 text-purple-600 flex-shrink-0" title="Super Admin" />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="text-sm text-gray-500 truncate" title={user.username || 'N/A'}>{user.username || 'N/A'}</div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="text-sm text-gray-500 truncate" title={user.email || 'N/A'}>{user.email || 'N/A'}</div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {user.roles.map(role => (
                                                    <span
                                                        key={role}
                                                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${getRoleBadgeColor(role)}`}
                                                    >
                                                        {role}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
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
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleEditUser(user)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Edit user"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setResetPasswordUser(user);
                                                        setNewPassword('');
                                                    }}
                                                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                    title="Reset password"
                                                >
                                                    <Key className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(user)}
                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                {/* Pagination */}
                {users.length > PAGE_SIZE && (
                    <div className="flex justify-center items-center px-4 py-3 bg-gray-50 border-t border-gray-200">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            {Array.from({ length: Math.ceil(users.length / PAGE_SIZE) }, (_, i) => i + 1).map(page => (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={`w-8 h-8 text-sm font-medium rounded-md transition-colors ${
                                        currentPage === page
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                                >
                                    {page}
                                </button>
                            ))}
                            <button
                                onClick={() => setCurrentPage(p => Math.min(Math.ceil(users.length / PAGE_SIZE), p + 1))}
                                disabled={currentPage === Math.ceil(users.length / PAGE_SIZE)}
                                className="p-2 text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
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
