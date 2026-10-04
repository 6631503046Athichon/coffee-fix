import React, { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import type { GreenBeanLot, ParchmentLot } from "../../../types";
import Modal from "../../common/Modal";
import Input from "../../common/Input";
import Button from "../../common/Button";
import GradeDropdown from "../workbench/GradeDropdown";
import {
  updateGreenBeanLotDetails,
  type GreenBeanLotCorrection,
} from "../../../services/lots/greenBeanLotService";
import {
  formatGreenBeanId,
  formatParchmentId,
} from "../../../utils/formatDisplayId";
import {
  correctionErrorMessage,
  kgAlreadyOut,
  kgLeftAfter,
  lotWeightError,
  sameKg,
} from "../workbench/lotCorrections";
import {
  exceedsHull,
  hullGreenLimit,
  hullLimitText,
} from "../workbench/hullGreenLimit";

const PERMISSION_MESSAGE =
  "Only the processor who created this lot, or an admin, can edit it.";

type FieldErrors = {
  grade?: string;
  initialWeightKg?: string;
};

export interface EditGreenBeanLotModalProps {
  lot: GreenBeanLot;
  /** The parchment lot it was hulled from, when loaded. */
  parchmentLot?: ParchmentLot;
  /**
   * The loaded green bean lots, so a lot a Hull & Grade made is held to the
   * parchment it hulled (with the other lots it made) before saving.
   */
  greenBeanLots?: GreenBeanLot[];
  onClose: () => void;
  onSaved: (updatedLot: GreenBeanLot) => void;
  /** Called with the message whenever saving fails (e.g. to raise a toast). */
  onError?: (message: string) => void;
}

/**
 * Corrects a green-bean lot's grade or weight (F24). The weight is the lot's
 * whole weight: the kg left moves with it, and the backend refuses (409) a
 * weight below what was already withdrawn, sent to a roaster or sold. A lot a
 * Hull & Grade made can only grow while that Hull & Grade's lots weigh no
 * more than the parchment it hulled (backend 400, shown here before saving).
 */
const EditGreenBeanLotModal: React.FC<EditGreenBeanLotModalProps> = ({
  lot,
  parchmentLot,
  greenBeanLots,
  onClose,
  onSaved,
  onError,
}) => {
  const initialGrade = lot.grade ?? "";
  const initialWeight = Number.isFinite(lot.initialWeightKg)
    ? String(lot.initialWeightKg)
    : "";

  const [grade, setGrade] = useState(initialGrade);
  const [weight, setWeight] = useState(initialWeight);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const outKg = kgAlreadyOut(lot);
  const typedWeight = Number(weight);
  const leftAfter =
    weight.trim() !== "" && Number.isFinite(typedWeight)
      ? kgLeftAfter(lot, typedWeight)
      : null;
  const hullLimit = useMemo(
    () => hullGreenLimit(lot, parchmentLot, greenBeanLots ?? []),
    [lot, parchmentLot, greenBeanLots],
  );
  // Lowering a lot never makes its Hull & Grade outweigh the parchment.
  const overHull = (weightKg: number) =>
    hullLimit !== null &&
    weightKg > lot.initialWeightKg &&
    exceedsHull(hullLimit, weightKg);
  const typedOverHull = leftAfter !== null && overHull(typedWeight);
  const source = parchmentLot
    ? formatParchmentId(parchmentLot)
    : lot.sourceType === "External"
      ? "External"
      : "-";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const changes: GreenBeanLotCorrection = {};
    const nextErrors: FieldErrors = {};
    if (grade.trim() !== initialGrade.trim()) {
      if (!grade.trim()) nextErrors.grade = "Pick a grade.";
      changes.grade = grade.trim();
    }
    if (weight.trim() !== initialWeight) {
      const weightError = lotWeightError(weight, outKg);
      if (weightError) nextErrors.initialWeightKg = weightError;
      else if (hullLimit && overHull(typedWeight)) {
        nextErrors.initialWeightKg = `Green beans cannot weigh more than the parchment they were hulled from. ${hullLimitText(hullLimit)}`;
      } else if (!sameKg(lot.initialWeightKg, typedWeight)) {
        changes.initialWeightKg = typedWeight;
      }
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
      const updated = await updateGreenBeanLotDetails(lot.id, changes);
      onSaved(updated);
    } catch (err: unknown) {
      const message = correctionErrorMessage(
        err,
        PERMISSION_MESSAGE,
        "Could not save the green bean lot. Please try again.",
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
      ariaLabelledBy="edit-green-bean-title"
      className="!p-6 !rounded-2xl"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-600 rounded-lg flex-shrink-0">
            <Pencil className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2
              id="edit-green-bean-title"
              className="text-lg font-bold text-gray-900 leading-tight"
            >
              Edit green bean lot
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
              {formatGreenBeanId(lot)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Hulled from
            </dt>
            <dd className="font-semibold text-gray-900 truncate">{source}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-[1fr_8rem] gap-3">
          {/* GradeDropdown renders its trigger as a plain button, so the
              caption names a group around it for screen readers. */}
          <div role="group" aria-labelledby="edit-green-bean-grade-label">
            <span
              id="edit-green-bean-grade-label"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              Grade
            </span>
            <GradeDropdown
              value={grade}
              onChange={(value) => {
                setGrade(value);
                if (fieldErrors.grade) {
                  setFieldErrors((prev) => ({ ...prev, grade: undefined }));
                }
              }}
              size="md"
            />
            {fieldErrors.grade && (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors.grade}</p>
            )}
          </div>
          <Input
            id="edit-green-bean-weight"
            label="Lot weight (kg)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              if (fieldErrors.initialWeightKg) {
                setFieldErrors((prev) => ({ ...prev, initialWeightKg: undefined }));
              }
            }}
            error={fieldErrors.initialWeightKg}
            fullWidth
          />
        </div>
        <p className="mt-1.5 text-xs text-gray-500" data-testid="edit-green-bean-stock">
          {outKg > 0
            ? `${outKg.toFixed(2)} kg already withdrawn, sent to a roaster or sold, so the weight cannot go below that.`
            : "Nothing withdrawn yet."}
          {leftAfter !== null && ` ${leftAfter.toFixed(2)} kg left in stock after saving.`}
        </p>
        {hullLimit && (
          <p
            className={`mt-1 text-xs ${typedOverHull ? "font-medium text-red-600" : "text-gray-500"}`}
            data-testid="edit-green-bean-hull-limit"
          >
            {hullLimitText(hullLimit)}
          </p>
        )}

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

export default EditGreenBeanLotModal;
