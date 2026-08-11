import React, { useState, useEffect } from 'react'
import { User, UserRole } from '../../../types'
import { getAllUsers, transferOwnership } from '../../../services/auth/userService'
import { X, AlertCircle, Shield, ArrowRight } from 'lucide-react'

interface TransferOwnershipModalProps {
  isOpen: boolean
  currentSuperAdmin: User | null
  onClose: () => void
  onTransferComplete: () => void
}

const TransferOwnershipModal: React.FC<TransferOwnershipModalProps> = ({
  isOpen,
  currentSuperAdmin,
  onClose,
  onTransferComplete,
}) => {
  const [admins, setAdmins] = useState<User[]>([])
  const [selectedAdminId, setSelectedAdminId] = useState<string>('')
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingAdmins, setLoadingAdmins] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      fetchAdmins()
    }
  }, [isOpen])

  const fetchAdmins = async () => {
    setLoadingAdmins(true)
    setError('')

    try {
      const users = await getAllUsers()

      // Filter for active admins (excluding current super admin)
      const adminUsers = users.filter(
        (user) =>
          user.roles.includes(UserRole.Admin) &&
          user.isActive !== false &&
          !user.isSuperAdmin &&
          user.id !== currentSuperAdmin?.id
      )

      setAdmins(adminUsers)

      if (adminUsers.length === 0) {
        setError('No eligible admin users found. Create an active admin account first.')
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to load admin users')
    } finally {
      setLoadingAdmins(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError('')

    if (!selectedAdminId) {
      setError('Please select an admin to transfer ownership to')
      return
    }

    if (confirmText !== 'TRANSFER') {
      setError('Please type TRANSFER to confirm')
      return
    }

    setLoading(true)

    try {
      await transferOwnership(selectedAdminId)

      onTransferComplete()
      resetForm()
      onClose()
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to transfer ownership')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSelectedAdminId('')
    setConfirmText('')
    setError('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  if (!isOpen || !currentSuperAdmin) return null

  const selectedAdmin = admins.find((admin) => admin.id === selectedAdminId)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-purple-600" />
            <h2 className="text-xl font-bold text-gray-900">Transfer Super Admin Ownership</h2>
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
            {/* Warning Banner */}
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Critical Action</p>
                  <p className="text-sm text-red-700 mt-1">
                    Transferring ownership will remove your super admin privileges and grant them
                    to the selected user. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Current Super Admin */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Super Admin
              </label>
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{currentSuperAdmin.name}</p>
                    <p className="text-sm text-gray-600">{currentSuperAdmin.email || currentSuperAdmin.username}</p>
                  </div>
                  <div className="flex items-center gap-2 text-purple-600">
                    <Shield className="h-5 w-5" />
                    <span className="text-sm font-semibold">Super Admin</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <ArrowRight className="h-6 w-6 text-gray-400" />
            </div>

            {/* Select New Super Admin */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transfer Ownership To <span className="text-red-500">*</span>
              </label>

              {loadingAdmins ? (
                <div className="p-4 bg-gray-50 rounded-lg text-center">
                  <p className="text-sm text-gray-600">Loading admin users...</p>
                </div>
              ) : admins.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    No eligible admin users available. Create an active admin account first.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {admins.map((admin) => (
                    <label
                      key={admin.id}
                      className={`flex items-center p-4 border rounded-lg cursor-pointer transition-all ${
                        selectedAdminId === admin.id
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetAdmin"
                        value={admin.id}
                        checked={selectedAdminId === admin.id}
                        onChange={(e) => setSelectedAdminId(e.target.value)}
                        className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                      />
                      <div className="ml-3 flex-1">
                        <p className="font-semibold text-gray-900">{admin.name}</p>
                        <p className="text-sm text-gray-600">{admin.email || admin.username}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {admin.roles.map((role) => (
                            <span
                              key={role}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200"
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            {selectedAdmin && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  <strong>{selectedAdmin.name}</strong> will become the new super admin and gain
                  full system control.
                </p>
              </div>
            )}

            {/* Confirmation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type <strong>TRANSFER</strong> to confirm <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-purple-500 font-mono"
                placeholder="TRANSFER"
                disabled={!selectedAdminId || admins.length === 0}
              />
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
                disabled={loading || !selectedAdminId || confirmText !== 'TRANSFER' || admins.length === 0}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'Transferring...' : 'Transfer Ownership'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default TransferOwnershipModal
