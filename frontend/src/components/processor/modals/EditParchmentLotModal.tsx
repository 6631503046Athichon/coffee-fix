import React, { useState } from "react";
import { Pencil } from "lucide-react";
import type { ParchmentLot, ProcessingBatch } from "../../../types";
import Modal from "../../common/Modal";
import Input from "../../common/Input";
import Button from "../../common/Button";
import { updateParchmentLot } from "../../../services/lots/parchmentLotService";
import type { ParchmentLotCorrection } from "../../../services/lots/parchmentLotService";
import {
  formatParchmentId,
  formatProcessingBatchId,
} from "../../../utils/formatDisplayId";
import {
  correctionErrorMessage,
  kgAlreadyOut,
  kgLeftAfter,
  lotWeightError,
  moistureError,
  sameKg,
} from "../workbench/lotCorrections";

const PERMISSION_MESSAGE =
  "Only the processor who recorded this parchment's batch, or an admin, can edit it.";

type FieldErrors = {
  initialWeightKg?: string;
  moistureContent?: string;
};

const numberText = (value: number | undefined): string =>
  value !== undefined && Number.isFinite(value) ? String(value) : "";

export interface EditParchmentLotModalProps {
  lot: ParchmentLot;
  /** The batch it came from, when loaded (none for external parchment). */
  batch?: ProcessingBatch;
  onClose: () => void;
  onSaved: (updatedLot: ParchmentLot) => void;
  /** Called with the message whenever saving fails (e.g. to raise a toast). */
  onError?: (message: string) => void;
}

/**
 * Corrects a parchment lot's weight or moisture (F24). Used for parchment
 * that is not a batch's only output: external parchment, or a legacy batch
 * split into several lots. The kg left and the status follow from the
 * weight; the backend refuses (409) a weight below what already went out.
 */
const EditParchmentLotModal: React.FC<EditParchmentLotModalProps> = ({
  lot,
  batch,
  onClose,
  onSaved,
  onError,
}) => {
  const initialWeight = numberText(lot.initialWeightKg);
  const initialMoisture = numberText(lot.moistureContent);

  const [weight, setWeight] = useState(initialWeight);
  const [moisture, setMoisture] = useState(initialMoisture);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const outKg = kgAlreadyOut(lot);
  const typedWeight = Number(weight);
  const leftAfter =
    weight.trim() !== "" && Number.isFinite(typedWeight)
      ? kgLeftAfter(lot, typedWeight)
      : null;
  const source = lot.processingBatchId
    ? `Batch ${formatProcessingBatchId(batch ?? { id: lot.processingBatchId })}`
    : lot.externalSource?.code
      ? `External ${lot.externalSource.code}`
      : "External";

  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const changes: ParchmentLotCorrection = {};
    const nextErrors: FieldErrors = {};
    if (weight.trim() !== initialWeight) {
      const weightError = lotWeightError(weight, outKg);
      if (weightError) nextErrors.initialWeightKg = weightError;
      else if (!sameKg(lot.initialWeightKg, typedWeight)) {
        changes.initialWeightKg = typedWeight;
      }
    }
    if (moisture.trim() !== initialMoisture) {
      const moistureProblem = moistureError(moisture);
      if (moistureProblem) nextErrors.moistureContent = moistureProblem;
      else changes.moistureContent = Number(moisture);
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const updated = await updateParchmentLot(lot.id, changes);
      onSaved(updated);
    } catch (err: unknown) {
      const message = correctionErrorMessage(
        err,
        PERMISSION_MESSAGE,
        "Could not save the parchment lot. Please try again.",
      );
      setError(message);
      onError?.(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={saving ? () => {} : onClose}
      maxWidth="md"
      showCloseButton={false}
      ariaLabelledBy="edit-parchment-title"
      className="!p-6 !rounded-2xl"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-600 rounded-lg flex-shrink-0">
            <Pencil className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2
              id="edit-parchment-title"
              className="text-lg font-bold text-gray-900 leading-tight"
            >
              Edit parchment lot
            </h2>
            <p className="text-xs text-gray-500">
              The kg left moves with the lot weight.
            </p>
          </div>
        </div>

        <dl className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Lot ID
            </dt>
            <dd className="font-semibold text-gray-900 truncate">
              {formatParchmentId(lot)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Source
            </dt>
            <dd className="font-semibold text-gray-900 truncate" title={source}>
              {source}
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="edit-parchment-weight"
            label="Lot weight (kg)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              clearFieldError("initialWeightKg");
            }}
            error={fieldErrors.initialWeightKg}
            fullWidth
          />
          <Input
            id="edit-parchment-moisture"
            label="Moisture (%)"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            max="100"
            placeholder="0.0"
            value={moisture}
            onChange={(e) => {
              setMoisture(e.target.value);
              clearFieldError("moistureContent");
            }}
            error={fieldErrors.moistureContent}
            fullWidth
          />
        </div>
        <p className="mt-1.5 text-xs text-gray-500" data-testid="edit-parchment-stock">
          {outKg > 0
            ? `${outKg.toFixed(2)} kg already withdrawn or hulled, so the weight cannot go below that.`
            : "Nothing withdrawn or hulled yet."}
          {leftAfter !== null && ` ${leftAfter.toFixed(2)} kg left in stock after saving.`}
        </p>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default EditParchmentLotModal;
