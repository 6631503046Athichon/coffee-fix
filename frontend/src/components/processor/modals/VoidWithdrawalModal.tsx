import React, { useId, useState } from "react";
import { Ban } from "lucide-react";
import type { GreenBeanLot } from "../../../types";
import Modal from "../../common/Modal";
import Button from "../../common/Button";
import {
  voidGreenBeanWithdrawal,
  type VoidGreenBeanWithdrawalResult,
} from "../../../services/lots/greenBeanLotService";
import {
  voidParchmentWithdrawal,
  type VoidParchmentWithdrawalResult,
} from "../../../services/lots/parchmentLotService";
import {
  formatGreenBeanId,
  formatParchmentId,
} from "../../../utils/formatDisplayId";
import { formatDateDisplay } from "../../../utils/formatters";
import { correctionErrorMessage } from "../workbench/lotCorrections";
import {
  VOID_REASON_MAX,
  withdrawalTypeLabel,
  type WithdrawalCorrectionTarget,
} from "../workbench/withdrawalCorrections";

const PERMISSION_MESSAGE =
  "Only the owner of this lot, or an admin, can void its withdrawals.";

const kg = (value: number) => `${(Number(value) || 0).toFixed(2)} kg`;

export type VoidWithdrawalOutcome =
  | { kind: "greenBean"; result: VoidGreenBeanWithdrawalResult }
  | { kind: "parchment"; result: VoidParchmentWithdrawalResult };

export interface VoidWithdrawalModalProps {
  target: WithdrawalCorrectionTarget;
  /** The roaster a Roasting Stock withdrawal filled, by name, when known. */
  roasterName?: string;
  /** The green bean lots a Hull & Grade made, when the page knows them. */
  gradedLots?: GreenBeanLot[];
  onClose: () => void;
  onVoided: (outcome: VoidWithdrawalOutcome) => void;
  /** Called with the message (and the error) whenever the void fails. */
  onError?: (message: string, error: unknown) => void;
}

/**
 * What voiding this withdrawal does, line by line, so the confirm popup says
 * exactly which stock goes back where before anything is sent.
 */
export const voidWithdrawalEffects = (
  target: WithdrawalCorrectionTarget,
  roasterName?: string,
  gradedLots?: GreenBeanLot[],
): string[] => {
  const { withdrawal } = target;
  const lines: string[] = [];
  if (target.kind === "greenBean") {
    const { lot } = target;
    const reopens =
      lot.currentWeightKg <= 1e-6 && lot.availabilityStatus === "Withdrawn";
    lines.push(
      `${kg(withdrawal.amountKg)} go back to green bean lot ${formatGreenBeanId(lot)}` +
        (reopens ? ", which becomes Available again." : "."),
    );
    if (withdrawal.withdrawalType === "Roasting Stock") {
      lines.push(
        `The same ${kg(withdrawal.amountKg)} are taken back off ${roasterName ? `the stock of ${roasterName}` : "the roaster's stock"}. ` +
          "If the roaster already roasted or sold them, the void is refused and nothing changes.",
      );
    }
  } else {
    const { lot } = target;
    const reopens = lot.currentWeightKg <= 1e-6 && lot.status === "Hulled";
    lines.push(
      `${kg(withdrawal.amountKg)} of parchment go back to lot ${formatParchmentId(lot)}` +
        (reopens ? ", which goes back to Awaiting Hulling." : "."),
    );
    if (withdrawal.withdrawalType === "HullAndGrade") {
      const made = (gradedLots ?? [])
        .map((g) => `${formatGreenBeanId(g)} (${g.grade}, ${kg(g.initialWeightKg)})`)
        .join(", ");
      lines.push(
        (made
          ? `The green bean lots this Hull & Grade made are deleted: ${made}.`
          : "The green bean lots this Hull & Grade made are deleted.") +
          " If any of them was already withdrawn, sent to a roaster, roasted, sold, cupped, re-weighed or given a trace QR, the void is refused and nothing changes.",
      );
    }
  }
  if (withdrawal.withdrawalType === "Sale") {
    lines.push("The sale stops counting, and its invoice is no longer offered.");
  }
  lines.push(
    "The row stays in the history, marked Voided. A void cannot be undone: to put it right, record the withdrawal again.",
  );
  return lines;
};

/**
 * Confirm popup for voiding a wrong withdrawal (D7), with an optional reason.
 * The backend does the whole void in one transaction, or refuses it (409)
 * with the reason, which is shown here.
 */
const VoidWithdrawalModal: React.FC<VoidWithdrawalModalProps> = ({
  target,
  roasterName,
  gradedLots,
  onClose,
  onVoided,
  onError,
}) => {
  const id = useId();
  const titleId = `${id}-title`;
  const reasonId = `${id}-reason`;
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { withdrawal, lot } = target;
  const lotLabel =
    target.kind === "greenBean"
      ? formatGreenBeanId(target.lot)
      : formatParchmentId(target.lot);
  const effects = voidWithdrawalEffects(target, roasterName, gradedLots);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !withdrawal.id) return;
    setError(null);
    setSaving(true);
    try {
      if (target.kind === "greenBean") {
        const result = await voidGreenBeanWithdrawal(lot.id, withdrawal.id, reason);
        onVoided({ kind: "greenBean", result });
      } else {
        const result = await voidParchmentWithdrawal(lot.id, withdrawal.id, reason);
        onVoided({ kind: "parchment", result });
      }
    } catch (err: unknown) {
      const message = correctionErrorMessage(
        err,
        PERMISSION_MESSAGE,
        "Could not void the withdrawal. Please try again.",
      );
      setError(message);
      onError?.(message, err);
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
      ariaLabelledBy={titleId}
      className="!p-6 !rounded-2xl"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-600 rounded-lg flex-shrink-0">
            <Ban className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-lg font-bold text-gray-900 leading-tight"
            >
              Void withdrawal
            </h2>
            <p className="text-xs text-gray-500 truncate">Lot {lotLabel}</p>
          </div>
        </div>

        <dl className="mb-4 grid grid-cols-3 gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Type
            </dt>
            <dd className="font-semibold text-gray-900 truncate">
              {withdrawalTypeLabel(withdrawal.withdrawalType)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Amount
            </dt>
            <dd className="font-semibold text-gray-900">{kg(withdrawal.amountKg)}</dd>
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

        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">
            What happens
          </p>
          <ul
            className="list-disc pl-4 space-y-1 text-xs text-amber-900"
            data-testid="void-withdrawal-effects"
          >
            {effects.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <label
          htmlFor={reasonId}
          className="block text-sm font-semibold text-gray-700 mb-2"
        >
          Reason <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={VOID_REASON_MAX}
          rows={2}
          placeholder="e.g. Wrong lot picked"
          className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
        />
        <p className="mt-1 text-right text-[10px] text-gray-400">
          {reason.length}/{VOID_REASON_MAX}
        </p>

        {error && (
          <p
            role="alert"
            className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
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
            variant="danger"
            loading={saving}
            disabled={saving || !withdrawal.id}
          >
            {saving ? "Voiding..." : "Void withdrawal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default VoidWithdrawalModal;
