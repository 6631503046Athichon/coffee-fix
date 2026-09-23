import React, { useState } from "react";
import { DollarSign } from "lucide-react";
import { GreenBeanLot } from "../../../types";
import Modal from "../../common/Modal";
import Input from "../../common/Input";
import Button from "../../common/Button";
import Select from "../../common/Select";
import DatePicker from "../../common/DatePicker";
import { updateGreenBeanLotPrice } from "../../../services/lots/greenBeanLotService";
import { formatGreenBeanId } from "../../../utils/formatDisplayId";
import { formatDate } from "../../../utils/formatters";

const CURRENCY_OPTIONS = [
  { value: "THB", label: "THB" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

// Today as YYYY-MM-DD in the viewer's own timezone (toISOString would give
// the UTC date, which is yesterday for Thailand before 07:00).
const todayLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const PERMISSION_MESSAGE =
  "Only the processor who created this lot, or an admin, can set its price.";

export interface SetPriceModalProps {
  lot: GreenBeanLot;
  onClose: () => void;
  onSaved: (updatedLot: GreenBeanLot) => void;
  /** Called with the message whenever saving fails (e.g. to raise a toast). */
  onError?: (message: string) => void;
}

const SetPriceModal: React.FC<SetPriceModalProps> = ({
  lot,
  onClose,
  onSaved,
  onError,
}) => {
  const hasPrice = typeof lot.pricePerKg === "number" && lot.pricePerKg > 0;
  const [price, setPrice] = useState(hasPrice ? String(lot.pricePerKg) : "");
  const [currency, setCurrency] = useState<string>(
    CURRENCY_OPTIONS.some((o) => o.value === lot.currency)
      ? (lot.currency as string)
      : "THB",
  );
  const [effectiveDate, setEffectiveDate] = useState(todayLocal);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const weightKg = lot.currentWeightKg ?? 0;
  const priceNum = parseFloat(price);
  const validPrice = Number.isFinite(priceNum) && priceNum > 0;
  const total = validPrice ? priceNum * weightKg : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!validPrice) {
      setPriceError("Enter a price greater than 0.");
      return;
    }
    setPriceError(null);
    setError(null);
    setSaving(true);
    try {
      const updated = await updateGreenBeanLotPrice(lot.id, {
        pricePerKg: priceNum,
        currency,
        ...(effectiveDate && { priceSetDate: effectiveDate }),
      });
      onSaved(updated);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "";
      // The backend answers a failed ownership/role check with a 403 whose
      // body is { error: "Forbidden" }, and the api client throws that text.
      const message =
        raw === "Forbidden" || raw === "Insufficient permissions"
          ? PERMISSION_MESSAGE
          : raw || "Could not save the price. Please try again.";
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
      ariaLabelledBy="set-price-title"
      className="!p-6 !rounded-2xl"
    >
      <form onSubmit={handleSubmit} noValidate>
        {/* Header — same compact shape as the workbench's other lot modals */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-blue-600 rounded-lg flex-shrink-0">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2
                id="set-price-title"
                className="text-lg font-bold text-gray-900 leading-tight"
              >
                {hasPrice ? "Edit price" : "Set price"}
              </h2>
              <p className="text-xs text-gray-500 truncate">
                Lot #{formatGreenBeanId(lot)} · {lot.grade}
              </p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Weight
            </p>
            <p className="text-base font-bold text-gray-900 leading-tight">
              {weightKg.toFixed(2)}
              <span className="text-xs font-normal text-gray-400 ml-1">kg</span>
            </p>
          </div>
        </div>

        {hasPrice && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
            <span className="text-gray-500">Current price</span>
            <span className="font-semibold text-gray-900 text-right">
              {(lot.pricePerKg as number).toFixed(2)} {lot.currency || "THB"}/kg
              {lot.priceSetDate && (
                <span className="font-normal text-gray-400">
                  {" "}· since {formatDate(lot.priceSetDate)}
                </span>
              )}
            </span>
          </div>
        )}

        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Input
            id="set-price-per-kg"
            label="Price per kg"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              if (priceError) setPriceError(null);
            }}
            error={priceError ?? undefined}
            fullWidth
          />
          {/* Select and DatePicker render their trigger as a plain button,
              so the caption names a group around it for screen readers. */}
          <div role="group" aria-labelledby="set-price-currency-label">
            <span
              id="set-price-currency-label"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              Currency
            </span>
            <Select
              options={CURRENCY_OPTIONS}
              value={currency}
              onChange={(v) => setCurrency(v ? String(v) : "THB")}
            />
          </div>
        </div>

        <div
          className="mt-3"
          role="group"
          aria-labelledby="set-price-date-label"
        >
          <span
            id="set-price-date-label"
            className="block text-sm font-semibold text-gray-700 mb-2"
          >
            Effective date
          </span>
          <DatePicker value={effectiveDate} onChange={setEffectiveDate} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Lot value
            </p>
            <p className="text-[11px] text-gray-400">
              {validPrice ? priceNum.toFixed(2) : "0.00"} × {weightKg.toFixed(2)} kg
            </p>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {total.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            <span className="text-xs font-semibold text-gray-500 ml-1">
              {currency}
            </span>
          </p>
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
            {saving ? "Saving..." : "Save price"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default SetPriceModal;
