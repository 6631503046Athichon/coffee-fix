import React from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "../../common/Modal";
import Button from "../../common/Button";

export interface ConfirmActionModalProps {
  title: string;
  message: React.ReactNode;
  /** The confirm button's text, e.g. "Delete lot". */
  confirmLabel: string;
  /** The cancel button's text. */
  cancelLabel?: string;
  /** The action is running: both buttons wait, so a second click sends nothing. */
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The site's centred confirm popup for the Processor pages' deletes, in
 * place of the browser's window.confirm. Same shape as HideLotModal.
 */
const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  busy,
  onCancel,
  onConfirm,
}) => (
  <Modal
    isOpen
    onClose={busy ? () => {} : onCancel}
    maxWidth="sm"
    showCloseButton={false}
    ariaLabelledBy="confirm-action-title"
    className="!p-5 !rounded-2xl"
  >
    <div className="flex items-start gap-3">
      <div className="p-2 bg-red-50 rounded-lg flex-shrink-0">
        <AlertTriangle className="h-5 w-5 text-red-600" />
      </div>
      <div className="min-w-0">
        <h2
          id="confirm-action-title"
          className="text-base font-bold text-gray-900 leading-tight"
        >
          {title}
        </h2>
        <div className="mt-1 text-sm text-gray-600">{message}</div>
      </div>
    </div>
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
        variant="danger"
        size="sm"
        onClick={() => {
          if (!busy) onConfirm();
        }}
        loading={busy}
        disabled={busy}
      >
        {confirmLabel}
      </Button>
    </div>
  </Modal>
);

export default ConfirmActionModal;
