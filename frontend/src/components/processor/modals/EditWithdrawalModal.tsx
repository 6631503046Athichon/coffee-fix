import React, { useId, useState } from "react";
import { Pencil } from "lucide-react";
import type {
  GreenBeanWithdrawalRecord,
  ParchmentWithdrawalRecord,
} from "../../../types";
import Modal from "../../common/Modal";
import Input from "../../common/Input";
import Button from "../../common/Button";
import { useDataContext } from "../../../hooks/useDataContext";
import { updateGreenBeanWithdrawal } from "../../../services/lots/greenBeanLotService";
import { updateParchmentWithdrawal } from "../../../services/lots/parchmentLotService";
import {
  formatGreenBeanId,
  formatParchmentId,
} from "../../../utils/formatDisplayId";
import { formatDateDisplay } from "../../../utils/formatters";
import WithdrawDetailsFields from "../workbench/WithdrawDetailsFields";
import { useWithdrawDetails } from "../workbench/useWithdrawDetails";
import { formatWithdrawTotal } from "../workbench/withdrawDetails";
import { correctionErrorMessage } from "../workbench/lotCorrections";
import {
  WITHDRAWAL_TEXT_LIMITS,
  saleDetailsFromWithdrawal,
  withdrawalSaleChanges,
  type WithdrawalCorrectionTarget,
} from "../workbench/withdrawalCorrections";

const PERMISSION_MESSAGE =
  "Only the owner of this lot, or an admin, can edit its withdrawals.";

export type EditWithdrawalOutcome =
  | { kind: "greenBean"; withdrawal: GreenBeanWithdrawalRecord }
  | { kind: "parchment"; withdrawal: ParchmentWithdrawalRecord };

export interface EditWithdrawalModalProps {
  /** A Sale withdrawal the user may manage (see canEditWithdrawalSale). */
  target: WithdrawalCorrectionTarget;
  onClose: () => void;
  onSaved: (outcome: EditWithdrawalOutcome) => void;
  /** Called with the message (and the error) whenever saving fails. */
  onError?: (message: string, error: unknown) => void;
}

/**
 * Edits a recorded Sale's paperwork in place (D7): the customer (with the
 * Withdraw Stock customer picker), delivery address, price per kg, currency
 * and invoice number. Only what changed is sent, and the backend works out
 * the total from the kg and the new price. The kg and the type are fixed: a
 * wrong one is voided and recorded again.
 */
const EditWithdrawalModal: React.FC<EditWithdrawalModalProps> = ({
  target,
  onClose,
  onSaved,
  onError,
}) => {
  const id = useId();
  const titleId = `${id}-title`;
  const { data } = useDataContext();
  const { withdrawal, lot } = target;
  // The Withdraw Stock Sale fields, with their "+ New customer" and "Edit"
  // customer popups.
  const withdrawDetails = useWithdrawDetails();
  const { details, setDetails } = withdrawDetails;
  const [invoiceNumber, setInvoiceNumber] = useState(
    withdrawal.invoiceNumber ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The fields open on the recorded sale: filled in once, during the first
  // render (React re-renders straight away, before anything is shown).
  // Later customer edits flow through the hook.
  const [ready, setReady] = useState(false);
  if (!ready) {
    setReady(true);
    setDetails(saleDetailsFromWithdrawal(withdrawal, data.customers));
  }

  const lotLabel =
    target.kind === "greenBean"
      ? formatGreenBeanId(target.lot)
      : formatParchmentId(target.lot);
  const price = Number(details.salePrice);
  const total =
    details.salePrice.trim() !== "" && Number.isFinite(price) && price > 0
      ? Math.round(withdrawal.amountKg * price * 100) / 100
      : null;
  // A name on the sale that no customer in the list has (renamed, removed).
  const unlistedCustomer =
    ready && !details.customerId && details.customerName.trim() !== ""
      ? details.customerName
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !withdrawal.id) return;
    const checked = withdrawalSaleChanges(withdrawal, {
      customerName: details.customerName,
      deliveryAddress: details.deliveryAddress,
      salePrice: details.salePrice,
      currency: details.currency,
      invoiceNumber,
    });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    if (Object.keys(checked.changes).length === 0) {
      onClose();
      return;
    }

    setError(null);
    setSaving(true);
    try {
      if (target.kind === "greenBean") {
        const updated = await updateGreenBeanWithdrawal(
          lot.id,
          withdrawal.id,
          checked.changes,
        );
        onSaved({ kind: "greenBean", withdrawal: updated });
      } else {
        const updated = await updateParchmentWithdrawal(
          lot.id,
          withdrawal.id,
          checked.changes,
        );
        onSaved({ kind: "parchment", withdrawal: updated });
      }
    } catch (err: unknown) {
      const message = correctionErrorMessage(
        err,
        PERMISSION_MESSAGE,
        "Could not save the sale. Please try again.",
      );
      setError(message);
      onError?.(message, err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        isOpen
        onClose={saving ? () => {} : onClose}
        maxWidth="lg"
        showCloseButton={false}
        ariaLabelledBy={titleId}
        className="!p-6 !rounded-2xl"
      >
        <form onSubmit={handleSubmit} noValidate>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-600 rounded-lg flex-shrink-0">
              <Pencil className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-lg font-bold text-gray-900 leading-tight"
              >
                Edit sale
              </h2>
              <p className="text-xs text-gray-500">
                To change the kg, void it and record it again.
              </p>
            </div>
          </div>

          <dl className="mb-4 grid grid-cols-3 gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Lot
              </dt>
              <dd className="font-semibold text-gray-900 truncate">{lotLabel}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Amount
              </dt>
              <dd className="font-semibold text-gray-900">
                {(Number(withdrawal.amountKg) || 0).toFixed(2)} kg
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Date
              </dt>
              <dd className="font-semibold text-gray-900 truncate">
                {formatDateDisplay(withdrawal.date, undefined, "-")}
              </dd>
            </div>
          </dl>

          {ready && (
            <WithdrawDetailsFields
              type="Sale"
              {...withdrawDetails.fieldsProps}
            />
          )}
          {unlistedCustomer && (
            <p className="mt-2 text-xs text-gray-600" data-testid="unlisted-customer">
              On record: <span className="font-semibold">{unlistedCustomer}</span>,
              who is not in the customer list. Pick a customer to replace the
              name, or{" "}
              <button
                type="button"
                onClick={() =>
                  setDetails((current) => ({ ...current, customerName: "" }))
                }
                className="font-semibold text-blue-600 hover:text-blue-700"
              >
                remove it
              </button>
              .
            </p>
          )}

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <Input
              id={`${id}-invoice`}
              label="Invoice number"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              maxLength={WITHDRAWAL_TEXT_LIMITS.invoiceNumber}
              placeholder="INV-2026-001"
              fullWidth
            />
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Total
              </p>
              <p className="text-sm font-bold text-gray-900" data-testid="edit-sale-total">
                {total !== null
                  ? formatWithdrawTotal(total, details.currency || "THB")
                  : "No price"}
              </p>
            </div>
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
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={saving || !withdrawal.id}
            >
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>
      {/* Outside the <form>: React bubbles a submit through portals, so
          saving a customer there would also save the sale. */}
      {withdrawDetails.newCustomerModal}
    </>
  );
};

export default EditWithdrawalModal;
