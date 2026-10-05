import React from "react";
import { EyeOff } from "lucide-react";
import type { GreenBeanLot } from "../../../types";
import Modal from "../../common/Modal";
import Button from "../../common/Button";
import { formatGreenBeanId } from "../../../utils/formatDisplayId";

export interface HideLotModalProps {
  lot: GreenBeanLot;
  /** The hide is being saved: both buttons wait. */
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Asks before a green bean lot that still has kg is hidden from sale (its
 * availabilityStatus set to Withdrawn). Nothing is withdrawn: the kg stay in
 * stock, but the lot cannot be withdrawn or claimed by a roaster until it is
 * put back on sale.
 */
const HideLotModal: React.FC<HideLotModalProps> = ({
  lot,
  saving,
  onCancel,
  onConfirm,
}) => (
  <Modal
    isOpen
    onClose={saving ? () => {} : onCancel}
    maxWidth="sm"
    showCloseButton={false}
    ariaLabelledBy="hide-lot-title"
    className="!p-5 !rounded-2xl"
  >
    <div className="flex items-start gap-3">
      <div className="p-2 bg-gray-100 rounded-lg flex-shrink-0">
        <EyeOff className="h-5 w-5 text-gray-600" />
      </div>
      <div className="min-w-0">
        <h2
          id="hide-lot-title"
          className="text-base font-bold text-gray-900 leading-tight"
        >
          Hide {formatGreenBeanId(lot)} from sale?
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Its {(lot.currentWeightKg ?? 0).toFixed(2)} kg stay in stock and
          nothing is withdrawn. While hidden, the lot cannot be withdrawn or
          claimed by a roaster. Put it back on sale at any time.
        </p>
      </div>
    </div>
    <div className="mt-4 flex justify-end gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onCancel}
        disabled={saving}
      >
        Keep on sale
      </Button>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={onConfirm}
        loading={saving}
        disabled={saving}
      >
        Hide lot
      </Button>
    </div>
  </Modal>
);

export default HideLotModal;
