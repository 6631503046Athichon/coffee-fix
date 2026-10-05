import React from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from '../../common/Modal'
import Button from '../../common/Button'

export interface AdminConfirmModalProps {
  isOpen: boolean
  title: string
  message: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Red confirm button (deletes); otherwise the site blue. */
  danger?: boolean
  /** The action is being saved: both buttons wait and the popup stays. */
  busy?: boolean
  /** Why the last try failed, shown inside the popup. */
  error?: string
  onCancel: () => void
  onConfirm: () => void
}

/**
 * The centred confirm popup the admin pages ask with before a delete (in
 * place of the browser's confirm box). Same shape as the processor pages'
 * HideLotModal / ConfirmActionModal. The caller keeps it open while the
 * request runs and shows a refusal in it.
 */
const AdminConfirmModal: React.FC<AdminConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = true,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={() => { if (!busy) onCancel() }}
    maxWidth="sm"
    showCloseButton={false}
    ariaLabelledBy="admin-confirm-title"
    className="!p-5 !rounded-2xl"
  >
    <div className="flex items-start gap-3">
      <div className={`p-2 rounded-lg flex-shrink-0 ${danger ? 'bg-red-50' : 'bg-amber-50'}`}>
        <AlertTriangle className={`h-5 w-5 ${danger ? 'text-red-600' : 'text-amber-600'}`} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h2
          id="admin-confirm-title"
          className="text-base font-bold text-gray-900 leading-tight"
        >
          {title}
        </h2>
        <div className="mt-1 text-sm text-gray-600">{message}</div>
      </div>
    </div>
    {error && (
      <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
        {error}
      </p>
    )}
    <div className="mt-4 flex justify-end gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onCancel}
        disabled={busy}
      >
        {cancelLabel}
      </Button>
      <Button
        type="button"
        variant={danger ? 'danger' : 'primary'}
        size="sm"
        onClick={() => { if (!busy) onConfirm() }}
        loading={busy}
        disabled={busy}
      >
        {confirmLabel}
      </Button>
    </div>
  </Modal>
)

export default AdminConfirmModal
