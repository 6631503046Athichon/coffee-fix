import React, { useState, useEffect } from 'react'
import { User, UserRole } from '../../types'
import { updateUser } from '../../services/userService'
import { X, AlertCircle, Edit, Shield } from 'lucide-react'

interface EditUserModalProps {
  isOpen: boolean
  user: User | null
  onClose: () => void
  onUserUpdated: () => void
}

const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, user, onClose, onUserUpdated }) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [roles, setRoles] = useState<UserRole[]>([])
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const allRoles = Object.values(UserRole)

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setEmail(user.email || '')
      setUsername(user.username || '')
      setRoles(user.roles || [])
      setIsActive(user.isActive !== false)
    }
  }, [user])

  const handleRoleToggle = (role: UserRole) => {
    setRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!user) return

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    if (roles.length === 0) {
      setError('At least one role is required')
      return
    }

    // Email validation if provided
    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        setError('Invalid email format')
        return
      }
    }

    setLoading(true)

    try {
      const trimmedEmail = email.trim()
      const trimmedUsername = username.trim()

      await updateUser(user.id, {
        name: name.trim(),
        email: trimmedEmail || null,
        username: trimmedUsername || user.username || undefined,
        roles,
        isActive,
      })

      onUserUpdated()
      onClose()
      resetForm()
    } catch (err: any) {
      // api.ts throws Error objects with message property, not response objects
      const errorMessage = err instanceof Error ? err.message : (err.response?.data?.error || 'Failed to update user')
      setError(errorMessage)
      console.error('Error updating user:', err)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setName('')
    setEmail('')
    setUsername('')
    setRoles([])
    setIsActive(true)
    setError('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  if (!isOpen || !user) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Edit className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Edit User</h2>
              {user.isSuperAdmin && (
                <div className="flex items-center gap-1 mt-1">
                  <Shield className="h-4 w-4 text-purple-600" />
                  <span className="text-xs text-purple-600 font-semibold">Super Admin</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* User ID (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">User ID</label>
              <input
                type="text"
                value={user.id}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 font-mono text-sm"
              />
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter user's full name"
                required
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Optional username"
              />
              <p className="text-xs text-gray-500 mt-1">
                Clear the field to keep the current username unchanged
              </p>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="user@example.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional - used for password reset
              </p>
            </div>

            {/* Roles */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Roles <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {allRoles.map((role) => (
                  <label
                    key={role}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                      roles.includes(role)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={roles.includes(role)}
                      onChange={() => handleRoleToggle(role)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">{role}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Active Status */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Active Account</span>
              </label>
              <p className="text-xs text-gray-500 mt-1 ml-8">
                Inactive accounts cannot log in
              </p>
            </div>

            {/* Warning for Super Admin */}
            {user.isSuperAdmin && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-sm text-purple-800">
                  <strong>Note:</strong> This is the super admin account. To delete this account,
                  you must first transfer ownership to another admin.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default EditUserModal
