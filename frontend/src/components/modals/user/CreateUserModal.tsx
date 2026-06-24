import React, { useState } from 'react'
import { UserRole } from '../../../types'
import { createUser } from '../../../services/auth/userService'
import { X, Copy, Check, AlertCircle, UserPlus } from 'lucide-react'

interface CreateUserModalProps {
  isOpen: boolean
  onClose: () => void
  onUserCreated: () => void
}

interface GeneratedCredentials {
  username: string
  password: string
  message?: string
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({ isOpen, onClose, onUserCreated }) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [roles, setRoles] = useState<UserRole[]>([])
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generatedCredentials, setGeneratedCredentials] = useState<GeneratedCredentials | null>(null)
  const [copiedField, setCopiedField] = useState<'username' | 'password' | null>(null)

  const allRoles = Object.values(UserRole)

  const handleRoleToggle = (role: UserRole) => {
    setRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmedEmail = email.trim()

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    if (roles.length === 0) {
      setError('At least one role is required')
      return
    }

    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(trimmedEmail)) {
        setError('Invalid email format')
        return
      }
    }

    setLoading(true)

    try {
      const payload: any = {
        name: name.trim(),
        roles,
        isActive,
        autoGenerate: true,
      }

      // Add optional email
      if (trimmedEmail) {
        payload.email = trimmedEmail
      }

      const response = await createUser(payload)

      if (response.credentials) {
        setGeneratedCredentials(response.credentials)
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async (field: 'username' | 'password', value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleFinish = () => {
    onUserCreated()
    resetForm()
    onClose()
  }

  const resetForm = () => {
    setName('')
    setEmail('')
    setRoles([])
    setIsActive(true)
    setError('')
    setGeneratedCredentials(null)
    setCopiedField(null)
  }

  const handleClose = () => {
    if (generatedCredentials) {
      const confirmed = window.confirm(
        'You have not saved the generated credentials. Are you sure you want to close?'
      )
      if (!confirmed) return
    }
    resetForm()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <UserPlus className="h-6 w-6 text-indigo-600" />
            <h2 className="text-xl font-bold text-gray-900">
              {generatedCredentials ? 'User Created Successfully' : 'Create New User'}
            </h2>
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
          {!generatedCredentials ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                  placeholder="Enter user's full name"
                  required
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                  placeholder="user@example.com"
                />
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
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={roles.includes(role)}
                        onChange={() => handleRoleToggle(role)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">{role}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Username will be generated based on the first selected role
                </p>
              </div>

              {/* Active Status */}
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Active Account</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-8">
                  Inactive accounts cannot log in
                </p>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Username and password will be automatically generated. The user will be required to change their credentials on first login.
                </p>
              </div>

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
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                >
                  {loading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Success Message */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800 font-medium">
                  User account has been created successfully!
                </p>
              </div>

              {/* Generated Credentials */}
              <div className="space-y-4">
                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg">
                  <p className="text-sm font-semibold text-amber-800 mb-2">
                    Important: Save these credentials!
                  </p>
                  <p className="text-sm text-amber-700">
                    {generatedCredentials.message}
                  </p>
                </div>

                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Generated Username
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={generatedCredentials.username}
                      readOnly
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                    />
                    <button
                      onClick={() => handleCopy('username', generatedCredentials.username)}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
                    >
                      {copiedField === 'username' ? (
                        <>
                          <Check className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-green-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 text-gray-600" />
                          <span className="text-sm text-gray-600">Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Generated Password
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={generatedCredentials.password}
                      readOnly
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                    />
                    <button
                      onClick={() => handleCopy('password', generatedCredentials.password)}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
                    >
                      {copiedField === 'password' ? (
                        <>
                          <Check className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-green-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 text-gray-600" />
                          <span className="text-sm text-gray-600">Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Warning */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-800">
                    <strong>Warning:</strong> These credentials will not be shown again.
                    Make sure to copy and securely share them with the user.
                  </p>
                </div>
              </div>

              {/* Finish Button */}
              <button
                onClick={handleFinish}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreateUserModal
