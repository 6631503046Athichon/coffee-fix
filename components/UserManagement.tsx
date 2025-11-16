import React, { useState, useRef, useEffect } from 'react';
import { useDataContext } from '../hooks/useDataContext';
import { User, UserRole } from '../types';
import { PlusCircle, Edit, Trash2, X, ChevronDown, Check } from 'lucide-react';
import { updateUserCredentials, addUserCredentials, deleteUserCredentials, getAllUsers, updateUserActive } from '../services/authService';

// Custom Multi-Select Dropdown Component for Roles
const CustomRoleMultiSelect: React.FC<{
  selectedRoles: UserRole[];
  onChange: (roles: UserRole[]) => void;
  options: UserRole[];
}> = ({ selectedRoles, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleRole = (role: UserRole) => {
    if (selectedRoles.includes(role)) {
      onChange(selectedRoles.filter(r => r !== role));
    } else {
      onChange([...selectedRoles, role]);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all hover:border-gray-400 flex items-center justify-between gap-2 min-h-[42px]"
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {selectedRoles.length > 0 ? (
            selectedRoles.map(role => (
              <span key={role} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700">
                {role}
              </span>
            ))
          ) : (
            <span className="text-gray-400">Select roles...</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto w-full">
          <div className="py-1">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => toggleRole(option)}
                className={`w-full text-left px-4 py-2 hover:bg-indigo-50 transition-colors flex items-center justify-between text-sm ${
                  selectedRoles.includes(option) ? 'bg-indigo-50' : ''
                }`}
              >
                <span className="font-medium text-gray-900">{option}</span>
                {selectedRoles.includes(option) && (
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
    const { data, setData } = useDataContext();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [userPassword, setUserPassword] = useState('');
    const [userRoles, setUserRoles] = useState<UserRole[]>([UserRole.Farmer]);

    // Load users from localStorage on component mount
    useEffect(() => {
        const storedUsers = getAllUsers();
        if (storedUsers && storedUsers.length > 0) {
            const usersForUI = storedUsers.map(u => ({
                id: u.id,
                name: u.name,
                roles: u.roles,
                isActive: u.isActive ?? true,
            }));
            setData(prev => ({
                ...prev,
                users: usersForUI,
            }));
        }
    }, [setData]);

    const openModalForNew = () => {
        setEditingUser(null);
        setUserName('');
        setUserEmail('');
        setUserPassword('');
        setUserRoles([UserRole.Farmer]);
        setIsModalOpen(true);
    };

    const openModalForEdit = (user: User) => {
        console.log('Opening edit modal for user:', user);
        setEditingUser(user);
        setUserName(user.name);
        setUserEmail(''); // Don't show email when editing for security
        setUserPassword(''); // Don't show password when editing
        setUserRoles(user.roles);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
    };

    const handleDelete = (userId: string) => {
        if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            // Remove from UI state
            setData(prev => ({
                ...prev,
                users: prev.users.filter(u => u.id !== userId),
            }));
            // Remove from localStorage (credentials)
            deleteUserCredentials(userId);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log('Submitting form. Editing user?', editingUser);
        console.log('New values:', { userName, userRoles });

        if (editingUser) {
            // Edit existing user
            console.log('Updating user with ID:', editingUser.id);
            const updatedUser: User = {
                id: editingUser.id,
                name: userName,
                roles: userRoles,
            };

            // Update UI state
            setData(prev => ({
                ...prev,
                users: prev.users.map(u => u.id === editingUser.id ? updatedUser : u),
            }));

            // Update localStorage (credentials)
            updateUserCredentials(updatedUser);
        } else {
            // Add new user - validate required fields
            if (!userEmail || !userPassword) {
                alert('Please provide email and password for new user');
                return;
            }

            const newId = `user-${Date.now()}-${userName.toLowerCase().replace(/\s/g, '')}`;
            const newUser: User = {
                id: newId,
                name: userName,
                roles: userRoles,
            };
            console.log('Creating new user:', newUser);

            // Update UI state first
            setData(prev => {
                const updated = {
                    ...prev,
                    users: [newUser, ...prev.users],
                };
                console.log('Updated users count:', updated.users.length);
                return updated;
            });

            // Save to localStorage (with credentials)
            addUserCredentials(newUser, userEmail, userPassword);

            alert(`User "${userName}" created successfully! You can now login with email: ${userEmail}`);
        }
        closeModal();
    };

    return (
        <div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
                        <p className="text-gray-600 mt-2">Add, edit, or remove user accounts.</p>
                    </div>
                    <button
                        onClick={openModalForNew}
                        className="inline-flex items-center justify-center rounded-lg border border-transparent bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors">
                        <PlusCircle className="h-5 w-5 mr-2" />
                        Add New User
                    </button>
                </div>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-900">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">User</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Role</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">User ID</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.users.map(user => (
                                <tr key={user.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        <div className="flex flex-wrap gap-1">
                                            {user.roles.map(role => (
                                                <span key={role} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700">
                                                    {role}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{user.id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <button
                                            onClick={() => {
                                                const next = !(user as any).isActive;
                                                // Persist to credentials store
                                                updateUserActive(user.id, next);
                                                // Reflect in UI DataContext
                                                setData(prev => ({
                                                    ...prev,
                                                    users: prev.users.map(u => u.id === user.id ? { ...u, isActive: next } : u),
                                                }));
                                            }}
                                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                                                (user as any).isActive !== false
                                                    ? 'bg-green-50 text-green-700 border-green-200'
                                                    : 'bg-gray-100 text-gray-600 border-gray-200'
                                            }`}
                                            title={(user as any).isActive !== false ? 'Active - click to disable' : 'Disabled - click to enable'}
                                        >
                                            {(user as any).isActive !== false ? 'Active' : 'Disabled'}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                                        <button onClick={() => openModalForEdit(user)} className="text-indigo-600 hover:text-indigo-900 p-1 rounded-md hover:bg-indigo-50" title={`Edit ${user.name}`}><Edit className="h-4 w-4" /></button>
                                        <button onClick={() => handleDelete(user.id)} className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50" title={`Delete ${user.name}`}><Trash2 className="h-4 w-4" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
                    <div className="bg-white rounded-xl p-8 shadow-2xl w-full max-w-md">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-800">{editingUser ? 'Edit User' : 'Add New User'}</h2>
                            <button onClick={closeModal} className="text-gray-500 hover:text-gray-800 transition-colors">
                                <X className="h-6 w-6" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="userName" className="block text-sm font-semibold text-gray-700 mb-2">User Name</label>
                                    <input
                                        type="text"
                                        id="userName"
                                        value={userName}
                                        onChange={e => setUserName(e.target.value)}
                                        required
                                        className="block w-full border border-gray-300 rounded-xl shadow-sm py-2.5 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                    />
                                </div>
                                {!editingUser && (
                                    <>
                                        <div>
                                            <label htmlFor="userEmail" className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                                            <input
                                                type="email"
                                                id="userEmail"
                                                value={userEmail}
                                                onChange={e => setUserEmail(e.target.value)}
                                                required
                                                placeholder="user@example.com"
                                                className="block w-full border border-gray-300 rounded-xl shadow-sm py-2.5 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="userPassword" className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                                            <input
                                                type="password"
                                                id="userPassword"
                                                value={userPassword}
                                                onChange={e => setUserPassword(e.target.value)}
                                                required
                                                placeholder="Enter password"
                                                className="block w-full border border-gray-300 rounded-xl shadow-sm py-2.5 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                            />
                                        </div>
                                    </>
                                )}
                                <div>
                                    <label htmlFor="userRoles" className="block text-sm font-semibold text-gray-700 mb-2">Roles</label>
                                    <CustomRoleMultiSelect
                                        selectedRoles={userRoles}
                                        onChange={setUserRoles}
                                        options={Object.values(UserRole)}
                                    />
                                </div>
                            </div>
                            <div className="mt-8 flex justify-end space-x-3">
                                <button type="button" onClick={closeModal} className="bg-white py-2.5 px-5 border border-gray-300 rounded-lg shadow-sm text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                                <button type="submit" className="inline-flex justify-center py-2.5 px-5 border border-transparent shadow-sm text-sm font-semibold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors">{editingUser ? 'Save Changes' : 'Create User'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
