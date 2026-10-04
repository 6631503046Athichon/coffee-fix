import React, { useEffect, useState } from 'react'
import { useDataContext } from '../../../hooks/useDataContext'
import { useToast } from '../../../contexts/ToastContext'
import type { AppData, GreenBeanLot, ParchmentLot } from '../../../types'
import { getParchmentWithdrawals } from '../../../services/lots/parchmentLotService'
import { formatGreenBeanId, formatParchmentId } from '../../../utils/formatDisplayId'
import VoidWithdrawalModal from '../modals/VoidWithdrawalModal'
import type { VoidWithdrawalOutcome } from '../modals/VoidWithdrawalModal'
import EditWithdrawalModal from '../modals/EditWithdrawalModal'
import type { EditWithdrawalOutcome } from '../modals/EditWithdrawalModal'
import {
  applyGreenBeanVoid,
  applyGreenBeanWithdrawalEdit,
  applyParchmentVoid,
  applyParchmentWithdrawalEdit,
  isStaleWithdrawalError,
  roasterIdForVoid,
} from './withdrawalCorrections'
import type { WithdrawalCorrectionTarget } from './withdrawalCorrections'

const kg = (value: number) => `${(Number(value) || 0).toFixed(2)} kg`

/**
 * The roaster a Roasting Stock withdrawal filled, by name (see
 * roasterIdForVoid: the backend refuses the void when there is no telling).
 */
const roasterNameFor = (data: AppData, target: WithdrawalCorrectionTarget): string | undefined => {
  if (target.kind !== 'greenBean') return undefined
  const roasterId = roasterIdForVoid(
    target.withdrawal,
    data.roasterInventory.filter((i) => i.greenBeanLotId === target.lot.id),
  )
  return roasterId ? data.users.find((u) => u.id === roasterId)?.name : undefined
}

/** The green bean lots a Hull & Grade made, when they record it (since 005). */
const gradedLotsFor = (data: AppData, target: WithdrawalCorrectionTarget): GreenBeanLot[] | undefined => {
  if (target.kind !== 'parchment' || target.withdrawal.withdrawalType !== 'HullAndGrade') return undefined
  const made = data.greenBeanLots.filter((g) => g.parchmentWithdrawalId === target.withdrawal.id)
  return made.length > 0 ? made : undefined
}

/**
 * Void and Edit for the withdrawal lists (D7). `openVoid` / `openEdit` open
 * the popups for a row; render `modals` outside any <form>. A void or edit is
 * merged into the app data from the backend's reply (lot kg and status, its
 * history, the roaster stock row, the green bean lots a voided Hull & Grade
 * removed), so lists showing the stored lots update without a reload. A
 * refusal that means the page is out of date reloads it.
 */
export const useWithdrawalCorrections = () => {
  const { data, setData, refreshData } = useDataContext()
  const { addToast } = useToast()
  const [voiding, setVoiding] = useState<WithdrawalCorrectionTarget | null>(null)
  const [editing, setEditing] = useState<WithdrawalCorrectionTarget | null>(null)

  const handleError = (message: string, error: unknown) => {
    addToast({ type: 'error', message })
    if (isStaleWithdrawalError(error)) void refreshData()
  }

  const handleVoided = (target: WithdrawalCorrectionTarget, outcome: VoidWithdrawalOutcome) => {
    const lotId = target.lot.id
    let message: string
    if (outcome.kind === 'greenBean') {
      const { result } = outcome
      setData((prev) => applyGreenBeanVoid(prev, lotId, result))
      const roaster = result.roasterInventoryItem
        ? data.users.find((u) => u.id === result.roasterInventoryItem?.roasterId)?.name
        : undefined
      message =
        `Withdrawal voided: ${kg(target.withdrawal.amountKg)} are back on ${formatGreenBeanId(result.greenBeanLot)}` +
        (result.roasterInventoryItem ? ` and off ${roaster ? `the stock of ${roaster}` : "the roaster's stock"}.` : '.')
    } else {
      const { result } = outcome
      setData((prev) => applyParchmentVoid(prev, lotId, result))
      const removed = result.removedGreenBeanLots.length
      message =
        `Withdrawal voided: ${kg(target.withdrawal.amountKg)} of parchment are back on ${formatParchmentId(target.lot as ParchmentLot)}` +
        (removed > 0 ? `, and the ${removed} green bean lot${removed === 1 ? '' : 's'} it made ${removed === 1 ? 'was' : 'were'} removed.` : '.')
    }
    setVoiding(null)
    addToast({ type: 'success', message })
  }

  const handleEdited = (target: WithdrawalCorrectionTarget, outcome: EditWithdrawalOutcome) => {
    const lotId = target.lot.id
    if (outcome.kind === 'greenBean') {
      setData((prev) => applyGreenBeanWithdrawalEdit(prev, lotId, outcome.withdrawal))
    } else {
      setData((prev) => applyParchmentWithdrawalEdit(prev, lotId, outcome.withdrawal))
    }
    setEditing(null)
    addToast({ type: 'success', message: 'Sale updated.' })
  }

  const modals = (
    <>
      {voiding && (
        <VoidWithdrawalModal
          target={voiding}
          roasterName={roasterNameFor(data, voiding)}
          gradedLots={gradedLotsFor(data, voiding)}
          onClose={() => setVoiding(null)}
          onVoided={(outcome) => handleVoided(voiding, outcome)}
          onError={handleError}
        />
      )}
      {editing && (
        <EditWithdrawalModal
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={(outcome) => handleEdited(editing, outcome)}
          onError={handleError}
        />
      )}
    </>
  )

  return { openVoid: setVoiding, openEdit: setEditing, modals }
}

export type ParchmentHistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Loads a parchment lot's withdrawals while its popup is open and keeps them
 * on the stored lot (bulk-load does not carry them), so Void and Edit merge
 * into the same place. Loads again if a page reload drops them. `retry`
 * tries again after a failed load.
 */
export const useParchmentWithdrawalHistory = (
  lot: ParchmentLot | null,
): { status: ParchmentHistoryStatus; retry: () => void } => {
  const { data, setData } = useDataContext()
  // The lot whose load failed; cleared by retry.
  const [failedLotId, setFailedLotId] = useState<string | null>(null)
  const lotId = lot?.id
  const stored = lotId ? data.parchmentLots.find((p) => p.id === lotId) : undefined
  const missing = Boolean(lot) && !stored?.withdrawalHistory
  const failed = Boolean(lotId) && failedLotId === lotId

  useEffect(() => {
    if (!lot || !missing || failed) return
    let cancelled = false
    getParchmentWithdrawals(lot)
      .then((history) => {
        if (cancelled) return
        if (!history) {
          setFailedLotId(lot.id)
          return
        }
        setData((prev) => ({
          ...prev,
          parchmentLots: prev.parchmentLots.map((p) =>
            p.id === lot.id ? { ...p, withdrawalHistory: history } : p,
          ),
        }))
      })
      .catch(() => {
        if (!cancelled) setFailedLotId(lot.id)
      })
    return () => {
      cancelled = true
    }
    // The lot object changes on every merge; its id and whether its history
    // is loaded are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotId, missing, failed])

  const status: ParchmentHistoryStatus = !lot
    ? 'idle'
    : !missing
      ? 'ready'
      : failed
        ? 'error'
        : 'loading'
  return { status, retry: () => setFailedLotId(null) }
}
