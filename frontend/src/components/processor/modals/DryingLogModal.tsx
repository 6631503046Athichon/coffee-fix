import React, { useMemo, useState } from "react";
import { AlertTriangle, Pencil, Trash2, Wind } from "lucide-react";
import type { DryingLogEntry, ParchmentLot, ProcessingBatch } from "../../../types";
import Modal from "../../common/Modal";
import Button from "../../common/Button";
import DatePicker from "../../common/DatePicker";
import {
  addDryingLog,
  deleteDryingLog,
  sortDryingLog,
  updateDryingLog,
  type DryingLogInput,
} from "../../../services/processing/processingBatchService";
import {
  formatParchmentId,
  formatProcessingBatchId,
} from "../../../utils/formatDisplayId";
import { formatDate } from "../../../utils/formatters";
import { todayDateOnly } from "../../../utils/dateOnly";
import { correctionErrorMessage } from "../workbench/lotCorrections";

const PERMISSION_MESSAGE =
  "Only the processor who recorded this batch, or an admin, can change its drying log.";

type NumberField = "moistureContent" | "ambientTemp" | "relativeHumidity";
type Field = "date" | NumberField;
type FormState = Record<Field, string>;
export type DryingLogFieldErrors = Partial<Record<Field, string>>;

// The same limits the backend checks (lib/dryingLogs.ts).
const NUMBER_FIELDS: {
  key: NumberField;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: string;
  message: string;
}[] = [
  {
    key: "moistureContent",
    label: "Moisture",
    unit: "%",
    min: 0,
    max: 100,
    step: "0.1",
    message: "Enter a moisture between 0 and 100%.",
  },
  {
    key: "ambientTemp",
    label: "Temp",
    unit: "°C",
    min: -20,
    max: 60,
    step: "0.1",
    message: "Enter a temperature between -20 and 60 °C.",
  },
  {
    key: "relativeHumidity",
    label: "Humidity",
    unit: "%",
    min: 0,
    max: 100,
    step: "1",
    message: "Enter a humidity between 0 and 100%.",
  },
];

const emptyForm = (): FormState => ({
  date: todayDateOnly(),
  moistureContent: "",
  ambientTemp: "",
  relativeHumidity: "",
});

const formOf = (log: DryingLogEntry): FormState => ({
  date: log.date,
  moistureContent: String(log.moistureContent),
  ambientTemp: String(log.ambientTemp),
  relativeHumidity: String(log.relativeHumidity),
});

/**
 * What is wrong with a typed reading: a date that is missing or after
 * `today`, or a number that is missing or out of range.
 */
export const dryingLogFormErrors = (
  form: FormState,
  today: string = todayDateOnly(),
): DryingLogFieldErrors => {
  const errors: DryingLogFieldErrors = {};
  if (!form.date) errors.date = "Pick the reading date.";
  else if (form.date > today) errors.date = "The reading date cannot be in the future.";
  for (const field of NUMBER_FIELDS) {
    const text = form[field.key].trim();
    const value = Number(text);
    if (!text || !Number.isFinite(value) || value < field.min || value > field.max) {
      errors[field.key] = field.message;
    }
  }
  return errors;
};

const formatReading = (value: number, unit: string) =>
  Number.isFinite(value) ? `${value}${unit === "%" ? "%" : ` ${unit}`}` : "-";

export interface DryingLogModalProps {
  batch: ProcessingBatch;
  /** The parchment lot the popup was opened from, named in its header. */
  parchmentLot?: ParchmentLot;
  /** The batch's processor or an Admin: add, edit and delete readings. */
  canEdit: boolean;
  onClose: () => void;
  /** The batch's readings after each saved change, oldest first. */
  onLogsChange: (batchId: string, logs: DryingLogEntry[]) => void;
  /** Called with the message whenever saving fails (e.g. to raise a toast). */
  onError?: (message: string) => void;
}

/**
 * The batch's drying readings (date, coffee moisture, air temperature and
 * humidity). They feed the drying curve in Quality Insights and the averages
 * on the public trace page. The batch's processor, or an Admin, adds,
 * corrects and deletes them here; anyone else sees the list only.
 */
const DryingLogModal: React.FC<DryingLogModalProps> = ({
  batch,
  parchmentLot,
  canEdit,
  onClose,
  onLogsChange,
  onError,
}) => {
  // The stored readings: each save goes back through onLogsChange, so a
  // refresh that brings in someone else's change shows here too.
  const logs = useMemo(
    () => sortDryingLog(batch.dryingLog ?? []),
    [batch.dryingLog],
  );
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<DryingLogFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  const setField = (field: Field, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setFieldErrors({});
  };

  const commit = (next: DryingLogEntry[]) => {
    onLogsChange(batch.id, sortDryingLog(next));
  };

  const fail = (err: unknown, fallback: string) => {
    const message = correctionErrorMessage(err, PERMISSION_MESSAGE, fallback);
    setError(message);
    onError?.(message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !canEdit) return;
    const nextErrors = dryingLogFormErrors(form);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const reading: DryingLogInput = {
      date: form.date,
      moistureContent: Number(form.moistureContent),
      ambientTemp: Number(form.ambientTemp),
      relativeHumidity: Number(form.relativeHumidity),
    };
    const original = editingId ? logs.find((l) => l.id === editingId) : undefined;
    if (editingId && !original) {
      // Deleted meanwhile (the list was refreshed): never re-add it as new.
      resetForm();
      setError("That reading is no longer in the log.");
      return;
    }
    // An edit sends only what changed.
    const changes: Partial<DryingLogInput> = {};
    if (original) {
      if (reading.date !== original.date) changes.date = reading.date;
      for (const field of NUMBER_FIELDS) {
        if (reading[field.key] !== original[field.key]) {
          changes[field.key] = reading[field.key];
        }
      }
      if (Object.keys(changes).length === 0) {
        resetForm();
        return;
      }
    }

    setError(null);
    setBusy("save");
    try {
      if (original?.id) {
        const saved = await updateDryingLog(batch.id, original.id, changes);
        commit(logs.map((l) => (l.id === original.id ? saved : l)));
      } else {
        const saved = await addDryingLog(batch.id, reading);
        commit([...logs, saved]);
      }
      resetForm();
    } catch (err: unknown) {
      fail(err, "Could not save the reading. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (logId: string) => {
    if (busy || !canEdit) return;
    setError(null);
    setBusy("delete");
    try {
      await deleteDryingLog(batch.id, logId);
      commit(logs.filter((l) => l.id !== logId));
      setConfirmDeleteId(null);
      if (editingId === logId) resetForm();
    } catch (err: unknown) {
      fail(err, "Could not delete the reading. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (log: DryingLogEntry) => {
    if (!log.id) return;
    setEditingId(log.id);
    setConfirmDeleteId(null);
    setForm(formOf(log));
    setFieldErrors({});
    setError(null);
  };

  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      maxWidth="lg"
      showCloseButton={false}
      ariaLabelledBy="drying-log-title"
      className="!p-5 sm:!p-6 !rounded-2xl"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-blue-600 rounded-lg flex-shrink-0">
          <Wind className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2
            id="drying-log-title"
            className="text-lg font-bold text-gray-900 leading-tight"
          >
            Drying log
          </h2>
          <p className="text-xs text-gray-500 truncate">
            Batch {formatProcessingBatchId(batch)}
            {parchmentLot && ` · ${formatParchmentId(parchmentLot)}`}
          </p>
        </div>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Readings draw the drying curve in Quality Insights and the drying
        averages on the public trace page.
      </p>

      {/* The readings, oldest first */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        {logs.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-gray-400">
            No readings yet.
          </p>
        ) : (
          <div className="max-h-60 overflow-y-auto">
            <table className="w-full text-xs" data-testid="drying-log-table">
              <thead className="bg-gray-50 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-2 py-2 text-left">Date</th>
                  <th scope="col" className="px-2 py-2 text-right">Moisture</th>
                  <th scope="col" className="px-2 py-2 text-right">Temp</th>
                  <th scope="col" className="px-2 py-2 text-right">Humidity</th>
                  {canEdit && (
                    <th scope="col" className="px-2 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log, index) => {
                  const rowKey = log.id ?? `${log.date}-${index}`;
                  const label = formatDate(log.date, "short");
                  if (canEdit && log.id && confirmDeleteId === log.id) {
                    return (
                      <tr key={rowKey}>
                        <td colSpan={5} className="p-2">
                          <div
                            role="alertdialog"
                            aria-labelledby={`delete-reading-${log.id}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5"
                          >
                            <p
                              id={`delete-reading-${log.id}`}
                              className="flex items-center gap-1.5 font-semibold text-red-800"
                            >
                              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                              Delete the reading of {label}?
                            </p>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                disabled={busy !== null}
                                className="rounded-md border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                Keep
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(log.id as string)}
                                disabled={busy !== null}
                                className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                              >
                                {busy === "delete" ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={rowKey}
                      className={editingId && editingId === log.id ? "bg-blue-50" : undefined}
                    >
                      <td className="px-2 py-1.5 whitespace-nowrap font-medium text-gray-900">
                        {label}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-900">
                        {formatReading(log.moistureContent, "%")}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-600">
                        {formatReading(log.ambientTemp, "°C")}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-600">
                        {formatReading(log.relativeHumidity, "%")}
                      </td>
                      {canEdit && (
                        <td className="px-1 py-1 text-right whitespace-nowrap">
                          {log.id && (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(log)}
                                disabled={busy !== null}
                                className="p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                                title="Edit reading"
                                aria-label={`Edit the reading of ${label}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteId(log.id as string);
                                  setError(null);
                                }}
                                disabled={busy !== null}
                                className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                                title="Delete reading"
                                aria-label={`Delete the reading of ${label}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canEdit && (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
          aria-label={editingId ? "Edit reading" : "Add reading"}
        >
          <p className="mb-2 text-xs font-semibold text-gray-700">
            {editingId ? "Edit reading" : "Add a reading"}
          </p>
          {/* The date gets a row of its own: the picker shows the month in
              full ("5 September 2026"). */}
          <div className="sm:w-1/2">
            <DatePicker
              value={form.date}
              onChange={(value) => setField("date", value)}
              label="Date"
            />
            {fieldErrors.date && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.date}</p>
            )}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {NUMBER_FIELDS.map((field) => (
              <div key={field.key} className="min-w-0">
                <label
                  htmlFor={`drying-log-${field.key}`}
                  className="block text-xs font-semibold text-gray-700 mb-1 truncate"
                >
                  {field.label} ({field.unit})
                </label>
                <input
                  id={`drying-log-${field.key}`}
                  type="number"
                  inputMode="decimal"
                  step={field.step}
                  min={field.min}
                  max={field.max}
                  value={form[field.key]}
                  onChange={(e) => setField(field.key, e.target.value)}
                  aria-invalid={Boolean(fieldErrors[field.key])}
                  className={`w-full rounded-lg border bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 ${
                    fieldErrors[field.key]
                      ? "border-red-300 focus:ring-red-500"
                      : "border-gray-300 focus:ring-blue-500"
                  }`}
                />
                {fieldErrors[field.key] && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors[field.key]}</p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            {editingId && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={resetForm}
                disabled={busy !== null}
              >
                Cancel edit
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={busy === "save"}
              disabled={busy !== null}
            >
              {editingId ? "Save reading" : "Add reading"}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={busy !== null}
        >
          Close
        </Button>
      </div>
    </Modal>
  );
};

export default DryingLogModal;
