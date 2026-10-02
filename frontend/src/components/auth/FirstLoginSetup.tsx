import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { firstLoginUpdate } from '../../services/auth/authService'
import { User } from '../../types'

interface FirstLoginSetupProps {
  user: User
}

// Mirrors the backend's usernameSchema and passwordSchema
// (backend/src/lib/validations/user.ts), so the form says what is wrong
// before the request is sent.
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,50}$/

const passwordProblem = (password: string): string | null => {
  if (password.length < 8) return 'Password must be at least 8 characters long'
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain a number'
  return null
}

export const FirstLoginSetup: React.FC<FirstLoginSetupProps> = ({ user }) => {
  const navigate = useNavigate()
  const { setUser, logout } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!currentPassword) {
      setError('Current password is required')
      return
    }

    if (user.mustChangeUsername && !newUsername) {
      setError('New username is required')
      return
    }

    if (user.mustChangeUsername && !USERNAME_PATTERN.test(newUsername)) {
      setError('Username must be 3-50 characters: letters, numbers, _ or - (no @ or spaces)')
      return
    }

    if (user.mustChangeEmail && !newEmail) {
      setError('Email is required')
      return
    }

    if (user.mustChangeEmail && newEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(newEmail)) {
        setError('Invalid email format')
        return
      }
    }

    if (user.mustChangePassword && !newPassword) {
      setError('New password is required')
      return
    }

    if (user.mustChangePassword && newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (user.mustChangePassword) {
      const problem = passwordProblem(newPassword)
      if (problem) {
        setError(problem)
        return
      }
      if (newPassword === currentPassword) {
        setError('New password must be different from the current password')
        return
      }
    }

    setLoading(true)

    try {
      const response = await firstLoginUpdate({
        currentPassword,
        newUsername: user.mustChangeUsername ? newUsername : undefined,
        newEmail: user.mustChangeEmail ? newEmail : undefined,
        newPassword: user.mustChangePassword ? newPassword : undefined,
      })

      // Update user in context
      setUser(response.user)

      // Redirect to dashboard
      navigate('/')
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  // The rest of the app is closed until setup is done, so signing out
  // happens here.
  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome, {user.name}!</h1>
          <p className="text-gray-600">
            Please update your credentials to continue
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Password */}
          <div>
            <label htmlFor="first-login-current-password" className="block text-sm font-medium text-gray-700 mb-1">
              Current Password *
            </label>
            <div className="relative">
              <input
                id="first-login-current-password"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showCurrentPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* New Username (if required) */}
          {user.mustChangeUsername && (
            <div>
              <label htmlFor="first-login-new-username" className="block text-sm font-medium text-gray-700 mb-1">
                New Username *
              </label>
              <input
                id="first-login-new-username"
                type="text"
                value={newUsername}
                // Shown exactly as it is saved: the backend stores usernames
                // in lowercase, and sign-in is typed against what was shown.
                onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                placeholder="Choose a unique username"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Current: {user.username}. 3-50 lowercase letters, numbers, _ or -.
              </p>
            </div>
          )}

          {/* Email (if required) */}
          {user.mustChangeEmail && (
            <div>
              <label htmlFor="first-login-new-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address *
              </label>
              <input
                id="first-login-new-email"
                type="email"
                value={newEmail}
                // Saved in lowercase, so shown in lowercase.
                onChange={(e) => setNewEmail(e.target.value.toLowerCase())}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                placeholder="your.email@example.com"
                required
              />
            </div>
          )}

          {/* New Password (if required) */}
          {user.mustChangePassword && (
            <>
              <div>
                <label htmlFor="first-login-new-password" className="block text-sm font-medium text-gray-700 mb-1">
                  New Password *
                </label>
                <div className="relative">
                  <input
                    id="first-login-new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                    placeholder="8+ characters with A-Z, a-z and 0-9"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="first-login-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password *
                </label>
                <div className="relative">
                  <input
                    id="first-login-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                    placeholder="Re-enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Updating...' : 'Update & Continue'}
          </button>
        </form>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> You must complete this setup to access the system.
          </p>
        </div>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-800 underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
