import React, { useState } from "react";
import { Pencil } from "lucide-react";
import { HarvestLot } from "../../../types";
import Modal from "../../common/Modal";
import Input from "../../common/Input";
import Button from "../../common/Button";
import DatePicker from "../../common/DatePicker";
import {
  updateHarvestLotDetails,
  type HarvestLotDetailsUpdate,
} from "../../../services/lots/harvestLotService";
import { formatHarvestLotId } from "../../../utils/formatDisplayId";

const PERMISSION_MESSAGE =
  "You can't edit this lot. Processors can only change cherry lots that haven't been processed yet.";

// DatePicker hands back YYYY-MM-DD, or "" after Clear.
const isValidDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

type FieldErrors = {
  cherryVariety?: string;
  weightKg?: string;
  farmPlotLocation?: string;
  harvestDate?: string;
};

export interface EditHarvestLotModalProps {
  lot: HarvestLot;
  onClose: () => void;
  onSaved: (updatedLot: HarvestLot) => void;
  /** Called with the message whenever saving fails (e.g. to raise a toast). */
  onError?: (message: string) => void;
}

const EditHarvestLotModal: React.FC<EditHarvestLotModalProps> = ({
  lot,
  onClose,
  onSaved,
  onError,
}) => {
  // What the lot holds now. Only fields that differ from these are checked
  // and sent, so a value stored before these rules (a blank plot, say) never
  // blocks correcting another field.
  const initialVariety = lot.cherryVariety ?? "";
  const initialWeight = Number.isFinite(lot.weightKg) ? String(lot.weightKg) : "";
  const initialPlot = lot.farmPlotLocation ?? "";
  const initialDate = lot.harvestDate ?? "";

  const [cherryVariety, setCherryVariety] = useState(initialVariety);
  const [weight, setWeight] = useState(initialWeight);
  const [farmPlotLocation, setFarmPlotLocation] = useState(initialPlot);
  const [harvestDate, setHarvestDate] = useState(initialDate);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const variety = cherryVariety.trim();
    const plot = farmPlotLocation.trim();
    const weightNum = Number(weight);
    const changes: HarvestLotDetailsUpdate = {};
    const nextErrors: FieldErrors = {};
    if (variety !== initialVariety.trim()) {
      if (!variety) nextErrors.cherryVariety = "Enter the cherry variety.";
      changes.cherryVariety = variety;
    }
    if (weight.trim() !== initialWeight) {
      if (weight.trim() === "" || !Number.isFinite(weightNum) || weightNum <= 0) {
        nextErrors.weightKg = "Enter a weight greater than 0.";
      }
      changes.weightKg = weightNum;
    }
    if (plot !== initialPlot.trim()) {
      // The backend refuses a blank plot from a processor.
      if (!plot) nextErrors.farmPlotLocation = "Enter the plot location.";
      changes.farmPlotLocation = plot;
    }
    if (harvestDate !== initialDate) {
      if (!isValidDate(harvestDate)) {
        nextErrors.harvestDate = "Pick the harvest date.";
      }
      changes.harvestDate = harvestDate;
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
      // Only the changed ones of these four fields — never farmerName,
      // status, cropYearId or farmId.
      const updated = await updateHarvestLotDetails(lot.id, changes);
      onSaved(updated);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "";
      // A failed ownership/role check comes back as a 403 whose body is
      // { error: "Forbidden" }, and the api client throws that text.
      const message =
        raw === "Forbidden" || raw === "Insufficient permissions"
          ? PERMISSION_MESSAGE
          : raw || "Could not save the cherry lot. Please try again.";
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
      ariaLabelledBy="edit-harvest-lot-title"
      className="!p-6 !rounded-2xl"
    >
      <form onSubmit={handleSubmit} noValidate>
        {/* Header — same compact shape as the workbench's other lot modals */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-600 rounded-lg flex-shrink-0">
            <Pencil className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2
              id="edit-harvest-lot-title"
              className="text-lg font-bold text-gray-900 leading-tight"
            >
              Edit cherry lot
            </h2>
            <p className="text-xs text-gray-500">
              Editable until the lot is processed.
            </p>
          </div>
        </div>

        {/* Read-only identity of the lot */}
        <dl className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Lot ID
            </dt>
            <dd className="font-semibold text-gray-900 truncate">
              {formatHarvestLotId(lot)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Farmer
            </dt>
            <dd
              className="font-semibold text-gray-900 truncate"
              title={lot.farmerName}
            >
              {lot.farmerName || "-"}
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Input
            id="edit-harvest-variety"
            label="Variety"
            type="text"
            value={cherryVariety}
            onChange={(e) => {
              setCherryVariety(e.target.value);
              clearFieldError("cherryVariety");
            }}
            error={fieldErrors.cherryVariety}
            fullWidth
          />
          <Input
            id="edit-harvest-weight"
            label="Weight (kg)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              clearFieldError("weightKg");
            }}
            error={fieldErrors.weightKg}
            fullWidth
          />
        </div>

        <div className="mt-3">
          <Input
            id="edit-harvest-plot"
            label="Plot location"
            type="text"
            value={farmPlotLocation}
            onChange={(e) => {
              setFarmPlotLocation(e.target.value);
              clearFieldError("farmPlotLocation");
            }}
            error={fieldErrors.farmPlotLocation}
            fullWidth
          />
        </div>

        {/* DatePicker renders its trigger as a plain button, so the caption
            names a group around it for screen readers. */}
        <div
          className="mt-3"
          role="group"
          aria-labelledby="edit-harvest-date-label"
        >
          <span
            id="edit-harvest-date-label"
            className="block text-sm font-semibold text-gray-700 mb-2"
          >
            Harvest date
          </span>
          <DatePicker
            value={harvestDate}
            onChange={(value) => {
              setHarvestDate(value);
              clearFieldError("harvestDate");
            }}
          />
          {fieldErrors.harvestDate && (
            <p className="mt-1.5 text-sm text-red-600">
              {fieldErrors.harvestDate}
            </p>
          )}
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

export default EditHarvestLotModal;
