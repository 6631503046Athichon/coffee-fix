import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { Users as UsersIcon, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>('');

    // Load users from backend on component mount
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                setLoading(true);
                setError('');
                // TODO: Implement GET /api/users endpoint in backend
                const response = await api.get<{ users: User[] }>('/users');
                setUsers(response.users || []);
            } catch (err) {
                console.error('Error fetching users:', err);
                setError('Failed to load users. The user management API is not yet implemented.');
                // For now, show empty list
                setUsers([]);
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, []);

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

    return (
        <div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <UsersIcon className="h-8 w-8 text-indigo-600" />
                            User Management
                        </h1>
                        <p className="text-gray-600 mt-2">View all user accounts in the system.</p>
                        <p className="text-sm text-amber-600 mt-1">
                            Note: User creation and editing features are coming soon. For now, users can be created via database seeding.
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-lg">
                    <div className="flex items-start">
                        <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 mr-3" />
                        <div>
                            <p className="text-sm font-semibold text-amber-800">API Not Implemented</p>
                            <p className="text-sm text-amber-700 mt-1">{error}</p>
                            <p className="text-xs text-amber-600 mt-2">
                                To see users, please implement the GET /api/users endpoint in the backend.
                            </p>
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
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Email</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Roles</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">User ID</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <UsersIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                        <p className="text-gray-500 font-medium">No users found</p>
                                        <p className="text-sm text-gray-400 mt-1">
                                            Users will appear here once the backend API is implemented
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                users.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{user.name}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-500">{(user as any).email || 'N/A'}</div>
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
                                                    (user as any).isActive !== false
                                                        ? 'bg-green-50 text-green-700 border-green-200'
                                                        : 'bg-gray-100 text-gray-600 border-gray-200'
                                                }`}
                                            >
                                                {(user as any).isActive !== false ? 'Active' : 'Disabled'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-xs text-gray-500 font-mono">{user.id}</div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default UserManagement;
