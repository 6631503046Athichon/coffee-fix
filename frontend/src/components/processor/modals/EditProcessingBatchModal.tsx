import React, { useState } from "react";
import { Pencil } from "lucide-react";
import type {
  HarvestLot,
  ParchmentLot,
  ProcessingBatch,
  ProcessType,
} from "../../../types";
import Modal from "../../common/Modal";
import Input from "../../common/Input";
import Button from "../../common/Button";
import DatePicker from "../../common/DatePicker";
import ProcessTypeChips from "../workbench/ProcessTypeChips";
import {
  updateProcessingBatch,
  type ProcessingBatchUpdate,
  type UpdatedProcessingBatch,
} from "../../../services/processing/processingBatchService";
import {
  formatHarvestLotId,
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
  "Only the processor who recorded this batch, or an admin, can edit it.";

type FieldErrors = {
  parchmentWeightKg?: string;
  moistureContent?: string;
  dryingEndDate?: string;
};

const numberText = (value: number | undefined): string =>
  value !== undefined && Number.isFinite(value) ? String(value) : "";

export interface EditProcessingBatchModalProps {
  batch: ProcessingBatch;
  /**
   * The batch's parchment output (its only parchment lot). Its weight,
   * moisture and process type follow the batch, and what was already
   * withdrawn or hulled from it sets the lowest weight the batch can take.
   */
  parchmentLot?: ParchmentLot;
  /** The cherry lot it came from: parchment can never weigh more. */
  cherryLot?: HarvestLot;
  /** The admin-managed process types (data.processTypes). */
  processTypes: ProcessType[];
  onClose: () => void;
  onSaved: (result: UpdatedProcessingBatch) => void;
  /** Called with the message whenever saving fails (e.g. to raise a toast). */
  onError?: (message: string) => void;
}

/**
 * The batch edit popup (F24): process type, parchment output, moisture,
 * drying dates and notes of a recorded batch. Only the fields that changed
 * are sent; the backend re-weighs the batch's parchment lot in the same
 * transaction and refuses (409) a weight below what already went out.
 */
const EditProcessingBatchModal: React.FC<EditProcessingBatchModalProps> = ({
  batch,
  parchmentLot,
  cherryLot,
  processTypes,
  onClose,
  onSaved,
  onError,
}) => {
  // What the batch holds now. The parchment lot is the stock itself, so its
  // weight is what a correction moves.
  const initialProcessType = batch.processType || parchmentLot?.processType || "";
  const storedWeight = parchmentLot?.initialWeightKg ?? batch.parchmentWeightKg;
  const storedMoisture = batch.moistureContent ?? parchmentLot?.moistureContent;
  const initialWeight = numberText(storedWeight);
  const initialMoisture = numberText(storedMoisture);
  const initialStart = batch.dryingStartDate ?? "";
  const initialEnd = batch.dryingEndDate ?? "";
  const initialNotes = batch.processNotes ?? "";

  const [processType, setProcessType] = useState(initialProcessType);
  const [weight, setWeight] = useState(initialWeight);
  const [moisture, setMoisture] = useState(initialMoisture);
  const [dryingStartDate, setDryingStartDate] = useState(initialStart);
  const [dryingEndDate, setDryingEndDate] = useState(initialEnd);
  const [notes, setNotes] = useState(initialNotes);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const outKg = parchmentLot ? kgAlreadyOut(parchmentLot) : 0;
  const cherryKg =
    cherryLot && Number.isFinite(cherryLot.weightKg) ? cherryLot.weightKg : undefined;
  const typedWeight = Number(weight);
  const leftAfter =
    parchmentLot && weight.trim() !== "" && Number.isFinite(typedWeight)
      ? kgLeftAfter(parchmentLot, typedWeight)
      : null;

  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const changes: ProcessingBatchUpdate = {};
    const nextErrors: FieldErrors = {};
    if (processType && processType !== initialProcessType) {
      changes.processType = processType;
    }
    if (weight.trim() !== initialWeight) {
      const weightError = lotWeightError(weight, outKg, cherryKg);
      if (weightError) nextErrors.parchmentWeightKg = weightError;
      else if (!sameKg(storedWeight, typedWeight)) {
        changes.parchmentWeightKg = typedWeight;
      }
    }
    if (moisture.trim() !== initialMoisture) {
      const moistureProblem = moistureError(moisture);
      if (moistureProblem) nextErrors.moistureContent = moistureProblem;
      else changes.moistureContent = Number(moisture);
    }
    if (dryingStartDate !== initialStart) changes.dryingStartDate = dryingStartDate;
    if (dryingEndDate !== initialEnd) {
      changes.dryingEndDate = dryingEndDate;
      // Record Process bags on the drying end date, so the bagging date
      // follows a corrected end date unless it was set to something else.
      if (!batch.baggingDate || batch.baggingDate === initialEnd) {
        changes.baggingDate = dryingEndDate;
      }
    }
    if (
      (dryingStartDate !== initialStart || dryingEndDate !== initialEnd) &&
      dryingStartDate &&
      dryingEndDate &&
      dryingEndDate < dryingStartDate
    ) {
      nextErrors.dryingEndDate = "The drying end date cannot be before the start date.";
    }
    if (notes.trim() !== initialNotes.trim()) changes.processNotes = notes.trim();

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const result = await updateProcessingBatch(batch.id, changes);
      onSaved(result);
    } catch (err: unknown) {
      const message = correctionErrorMessage(
        err,
        PERMISSION_MESSAGE,
        "Could not save the batch. Please try again.",
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
      maxWidth="lg"
      showCloseButton={false}
      ariaLabelledBy="edit-batch-title"
      className="!p-6 !rounded-2xl"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-600 rounded-lg flex-shrink-0">
            <Pencil className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2
              id="edit-batch-title"
              className="text-lg font-bold text-gray-900 leading-tight"
            >
              Edit processing batch
            </h2>
            <p className="text-xs text-gray-500">
              Its parchment lot follows the weight, moisture and process.
            </p>
          </div>
        </div>

        {/* Read-only identity of the batch */}
        <dl className="mb-4 grid grid-cols-3 gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Batch
            </dt>
            <dd className="font-semibold text-gray-900 truncate">
              {formatProcessingBatchId(batch)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Parchment lot
            </dt>
            <dd className="font-semibold text-gray-900 truncate">
              {parchmentLot ? formatParchmentId(parchmentLot) : "-"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Cherry lot
            </dt>
            <dd
              className="font-semibold text-gray-900 truncate"
              title={cherryLot?.farmerName}
            >
              {cherryLot ? formatHarvestLotId(cherryLot) : "-"}
            </dd>
          </div>
        </dl>

        <div>
          <span className="block text-sm font-semibold text-gray-700 mb-2">
            Process type
          </span>
          <ProcessTypeChips
            value={processType}
            onChange={setProcessType}
            processTypes={processTypes}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Input
            id="edit-batch-weight"
            label="Parchment output (kg)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              clearFieldError("parchmentWeightKg");
            }}
            error={fieldErrors.parchmentWeightKg}
            fullWidth
          />
          <Input
            id="edit-batch-moisture"
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
        {parchmentLot && (
          <p className="mt-1.5 text-xs text-gray-500" data-testid="edit-batch-stock">
            {outKg > 0
              ? `${outKg.toFixed(2)} kg already withdrawn or hulled, so the output cannot go below that.`
              : "Nothing withdrawn or hulled yet."}
            {leftAfter !== null && ` ${leftAfter.toFixed(2)} kg left in stock after saving.`}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <DatePicker
            value={dryingStartDate}
            onChange={setDryingStartDate}
            label="Drying start date"
          />
          <div>
            <DatePicker
              value={dryingEndDate}
              onChange={(value) => {
                setDryingEndDate(value);
                clearFieldError("dryingEndDate");
              }}
              label="Drying end date"
            />
            {fieldErrors.dryingEndDate && (
              <p className="mt-1.5 text-sm text-red-600">
                {fieldErrors.dryingEndDate}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3">
          <label
            htmlFor="edit-batch-notes"
            className="block text-sm font-semibold text-gray-700 mb-2"
          >
            Process notes
          </label>
          <textarea
            id="edit-batch-notes"
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Ferment 24h in sealed tank, raised-bed drying..."
            className="w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
          />
        </div>

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

export default EditProcessingBatchModal;
