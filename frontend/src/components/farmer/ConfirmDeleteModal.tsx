import React from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  /** Id of the title, which names the dialog. */
  titleId: string;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** The delete is running: both buttons wait and the popup stays open. */
  busy: boolean;
  /** Why the last delete failed, shown in the popup. */
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The site's centred delete confirm for the farmer screens (in place of
 * window.confirm), in the same style as the Customers delete popup. The
 * caller passes its own wording, so a Thai screen keeps a Thai popup.
 */
const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  titleId,
  title,
  message,
  confirmLabel,
  cancelLabel,
  busy,
  error,
  onCancel,
  onConfirm,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={() => { if (!busy) onCancel(); }}
    maxWidth="sm"
    showCloseButton={false}
    ariaLabelledBy={titleId}
    className="!p-5 !rounded-xl"
  >
    <div>
      <p id={titleId} className="flex items-center gap-2 text-base font-semibold text-gray-900">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        {title}
      </p>
      <div className="mt-1 text-sm text-gray-600">{message}</div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {confirmLabel}
        </button>
      </div>
    </div>
  </Modal>
);

export default ConfirmDeleteModal;
