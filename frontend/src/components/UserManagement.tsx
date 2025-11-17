import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { Users as UsersIcon, AlertCircle, UserPlus, Edit, Trash2, Shield } from 'lucide-react';
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

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    // Load users from backend on component mount
    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            setError('');
            const response = await api.get<{ users: User[] }>('/users');
            setUsers(response.users || []);
        } catch (err) {
            console.error('Error fetching users:', err);
            setError('Failed to load users. Please check if the backend is running.');
            setUsers([]);
        } finally {
            setLoading(false);
        }
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

            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-lg">
                    <div className="flex items-start">
                        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3" />
                        <div>
                            <p className="text-sm font-semibold text-red-800">Error</p>
                            <p className="text-sm text-red-700 mt-1">{error}</p>
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
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Roles</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
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
        </div>
    );
};

export default UserManagement;
