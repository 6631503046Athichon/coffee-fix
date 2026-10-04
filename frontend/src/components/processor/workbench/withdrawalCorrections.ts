// Correcting a recorded withdrawal (owner decision D7). A wrong withdrawal is
// voided: in one backend transaction its kg go back to the lot (and off the
// roaster stock a Roasting Stock push filled; a Hull & Grade's green bean lots
// are deleted), and the row stays in the history marked void. Only a Sale's
// paperwork is edited in place: customer, delivery address, price, currency
// and invoice number. Both are the lot owner's tools, plus Admin.
//
// A voided row stays visible (struck through, with a "Voided" tag and its
// reason) but no longer counts: every total of withdrawn kg skips it.

import type {
  AppData,
  Customer,
  GreenBeanLot,
  GreenBeanWithdrawalRecord,
  ParchmentLot,
  ParchmentWithdrawalRecord,
  RoasterInventoryItem,
} from '../../../types'
import type {
  VoidGreenBeanWithdrawalResult,
  WithdrawalSaleEdit,
} from '../../../services/lots/greenBeanLotService'
import type { VoidParchmentWithdrawalResult } from '../../../services/lots/parchmentLotService'
import { GreenBeanSourceType } from '../../../types'
import { ApiError } from '../../../services/apiError'
import { EMPTY_WITHDRAW_DETAILS } from './withdrawDetails'
import type { WithdrawDetails } from './withdrawDetails'

type Row = {
  id?: string
  amountKg: number
  withdrawalType: string
  voidedAt?: string | null
  saleDetailsHidden?: boolean
}

/** A withdrawal on a green-bean or a parchment lot, as the popups take it. */
export type WithdrawalCorrectionTarget =
  | { kind: 'greenBean'; lot: GreenBeanLot; withdrawal: GreenBeanWithdrawalRecord }
  | { kind: 'parchment'; lot: ParchmentLot; withdrawal: ParchmentWithdrawalRecord }

/** Same limit as the backend (lib/withdrawalVoid VOID_REASON_MAX). */
export const VOID_REASON_MAX = 500

/** Same limits as the backend's withdrawal schemas. */
export const WITHDRAWAL_TEXT_LIMITS = {
  customerName: 200,
  deliveryAddress: 500,
  invoiceNumber: 50,
} as const

/** Any withdrawal row, green-bean or parchment. */
type Voidable = { amountKg: number; voidedAt?: string | null }

export const isVoidedWithdrawal = (w: Voidable): boolean => Boolean(w.voidedAt)

/** The withdrawals that still count: every one that is not void. */
export const activeWithdrawals = <W extends Voidable>(list: W[] | undefined): W[] =>
  (list ?? []).filter((w) => !isVoidedWithdrawal(w))

/** Kg withdrawn by the rows that still count, to the milligram. */
export const withdrawnKgTotal = (list: Voidable[] | undefined): number =>
  Math.round(
    activeWithdrawals(list).reduce((sum, w) => sum + (Number(w.amountKg) || 0), 0) * 1e6,
  ) / 1e6

/**
 * Void is offered to whoever may manage the lot (owner or Admin, see
 * canManageGreenBeanLot / canManageParchmentLot) on a row with a backend id
 * that is not void yet.
 */
export const canVoidWithdrawal = (canManageLot: boolean, w: Row): boolean =>
  canManageLot && Boolean(w.id) && !isVoidedWithdrawal(w)

/**
 * Edit is for a Sale's paperwork, on the same rows as Void. Not on a row the
 * backend sent without its sale (saleDetailsHidden): the fields would open
 * empty and saving would wipe them.
 */
export const canEditWithdrawalSale = (canManageLot: boolean, w: Row): boolean =>
  canVoidWithdrawal(canManageLot, w) && w.withdrawalType === 'Sale' && !w.saleDetailsHidden

/**
 * A push makes or fills the roaster's stock row in the transaction that
 * records it, which the backend gives at most this long (SALE_TX_OPTIONS).
 */
const PUSH_ROW_SLACK_MS = 15_000

/**
 * The roaster whose stock a Roasting Stock withdrawal filled, the way the
 * backend void finds it: the one the withdrawal records (since
 * prisma/sql/005), or for an older one the lot's only roaster stock row, as
 * long as that row was there by the time of the push. Undefined when there
 * is no telling; the void is then refused.
 */
export const roasterIdForVoid = (
  withdrawal: Pick<GreenBeanWithdrawalRecord, 'withdrawalType' | 'targetRoasterId' | 'createdAt'>,
  lotStock: Pick<RoasterInventoryItem, 'roasterId' | 'createdAt'>[],
): string | undefined => {
  if (withdrawal.withdrawalType !== 'Roasting Stock') return undefined
  if (withdrawal.targetRoasterId) return withdrawal.targetRoasterId
  if (lotStock.length !== 1) return undefined
  const [row] = lotStock
  const startedAfterPush =
    row.createdAt && withdrawal.createdAt
      ? Date.parse(row.createdAt) > Date.parse(withdrawal.createdAt) + PUSH_ROW_SLACK_MS
      : false
  return startedAfterPush ? undefined : row.roasterId
}

/**
 * Whether a Hull & Grade made the green bean lot: linked to it since
 * prisma/sql/005, or before that an Internal lot of a parchment lot. Such a
 * lot holds that hull's parchment kg, so it goes by voiding the Hull & Grade
 * (which puts the parchment back); the backend refuses deleting it alone.
 */
export const madeByHullAndGrade = (
  lot: Pick<GreenBeanLot, 'sourceType' | 'parchmentLotId' | 'parchmentWithdrawalId'>,
): boolean =>
  Boolean(lot.parchmentWithdrawalId) ||
  (lot.sourceType === GreenBeanSourceType.Internal && Boolean(lot.parchmentLotId))

/** "Hull & Grade" for the backend's HullAndGrade, and so on. */
export const withdrawalTypeLabel = (type: string): string => {
  switch (type) {
    case 'HullAndGrade':
      return 'Hull & Grade'
    case 'RoastingStock':
      return 'Roasting Stock'
    default:
      return type
  }
}

/** The Sale fields as typed in the edit popup. */
export interface WithdrawalSaleForm {
  customerName: string
  deliveryAddress: string
  /** Price per kg as typed; empty clears it. */
  salePrice: string
  currency: string
  invoiceNumber: string
}

type SaleRow = {
  customerName?: string | null
  deliveryAddress?: string | null
  salePrice?: number | null
  currency?: string | null
  invoiceNumber?: string | null
}

const text = (value: string | null | undefined) => (value ?? '').trim()

/**
 * The Withdraw Stock Sale fields filled from a recorded sale, for the edit
 * popup. The row stores the customer's name, not the record, so the picker
 * starts on the customer of that name; a name no customer has any more stays
 * as the name, unpicked.
 */
export const saleDetailsFromWithdrawal = (
  row: SaleRow,
  customers: Customer[],
): WithdrawDetails => {
  const name = text(row.customerName)
  const match = name
    ? customers.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
    : undefined
  return {
    ...EMPTY_WITHDRAW_DETAILS,
    customerId: match?.id ?? '',
    customerName: name,
    deliveryAddress: row.deliveryAddress ?? '',
    salePrice: row.salePrice != null ? String(row.salePrice) : '',
    currency: row.currency || EMPTY_WITHDRAW_DETAILS.currency,
  }
}

/**
 * The PATCH body for what changed between the stored row and the form, or
 * why it cannot be sent. An emptied field is sent as null, which clears it;
 * an untouched one is left out. Nothing changed gives an empty object.
 *
 * Only a changed field is checked: an older sale may hold a value the rules
 * now refuse (a price of 0 or with 3 decimals, an over-long name), and that
 * must not block correcting its other fields.
 */
export const withdrawalSaleChanges = (
  row: SaleRow,
  form: WithdrawalSaleForm,
): { ok: true; changes: WithdrawalSaleEdit } | { ok: false; error: string } => {
  const changes: WithdrawalSaleEdit = {}

  const fields = [
    ['customerName', 'Customer name'],
    ['deliveryAddress', 'Delivery address'],
    ['invoiceNumber', 'Invoice number'],
  ] as const
  for (const [key, label] of fields) {
    const typed = text(form[key])
    if (typed === text(row[key])) continue
    if (typed.length > WITHDRAWAL_TEXT_LIMITS[key]) {
      return { ok: false, error: `${label} can be at most ${WITHDRAWAL_TEXT_LIMITS[key]} characters.` }
    }
    changes[key] = typed || null
  }

  const priceText = form.salePrice.trim()
  const price: number | null = priceText === '' ? null : Number(priceText)
  const storedPrice = row.salePrice ?? null
  const priceChanged =
    price === null
      ? storedPrice !== null
      : storedPrice === null || !(Math.abs(storedPrice - price) <= 1e-9)
  if (priceChanged && price !== null) {
    if (!Number.isFinite(price) || price <= 0) {
      return { ok: false, error: 'Enter a price per kg above 0, or leave it empty.' }
    }
    if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) {
      return { ok: false, error: 'The price per kg can have at most 2 decimals.' }
    }
  }
  if (priceChanged) changes.salePrice = price

  // A row with no currency shows (and was priced in) THB.
  const currency = form.currency || 'THB'
  if (currency !== (row.currency || 'THB') || (priceChanged && price !== null && !row.currency)) {
    changes.currency = currency
  }

  return { ok: true, changes }
}

/** The withdrawal list with `updated` merged over the row with its id. */
export const replaceWithdrawal = <W extends { id?: string }>(
  list: W[] | undefined,
  updated: W,
): W[] | undefined =>
  list?.map((w) => (updated.id && w.id === updated.id ? { ...w, ...updated } : w))

/**
 * The app data after a green-bean void: the lot's kg, status and history as
 * the backend returned them, and the roaster stock row it took the kg off.
 */
export const applyGreenBeanVoid = (
  prev: AppData,
  lotId: string,
  result: VoidGreenBeanWithdrawalResult,
): AppData => {
  const saved = result.greenBeanLot
  const item = result.roasterInventoryItem
  return {
    ...prev,
    greenBeanLots: prev.greenBeanLots.map((g) =>
      g.id === lotId
        ? {
            ...g,
            currentWeightKg: saved.currentWeightKg,
            availabilityStatus: saved.availabilityStatus,
            withdrawalHistory: saved.withdrawalHistory?.length
              ? saved.withdrawalHistory
              : replaceWithdrawal(g.withdrawalHistory, result.withdrawal),
          }
        : g,
    ),
    roasterInventory: item
      ? prev.roasterInventory.map((inv) =>
          inv.id === item.id
            ? {
                ...inv,
                claimedWeightKg: item.claimedWeightKg,
                remainingWeightKg: item.remainingWeightKg,
              }
            : inv,
        )
      : prev.roasterInventory,
  }
}

/**
 * The app data after a parchment void: the lot's kg, status and history as
 * the backend returned them, without the green bean lots a voided Hull &
 * Grade made (the backend deleted them).
 */
export const applyParchmentVoid = (
  prev: AppData,
  lotId: string,
  result: VoidParchmentWithdrawalResult,
): AppData => {
  const saved = result.parchmentLot
  const removed = new Set(result.removedGreenBeanLots.map((l) => l.id))
  return {
    ...prev,
    parchmentLots: prev.parchmentLots.map((p) =>
      p.id === lotId
        ? {
            ...p,
            currentWeightKg: saved.currentWeightKg,
            status: saved.status,
            withdrawalHistory:
              saved.withdrawalHistory ?? replaceWithdrawal(p.withdrawalHistory, result.withdrawal),
          }
        : p,
    ),
    greenBeanLots: removed.size
      ? prev.greenBeanLots.filter((g) => !removed.has(g.id))
      : prev.greenBeanLots,
  }
}

/** The app data with an edited green-bean withdrawal swapped in. */
export const applyGreenBeanWithdrawalEdit = (
  prev: AppData,
  lotId: string,
  withdrawal: GreenBeanWithdrawalRecord,
): AppData => ({
  ...prev,
  greenBeanLots: prev.greenBeanLots.map((g) =>
    g.id === lotId
      ? { ...g, withdrawalHistory: replaceWithdrawal(g.withdrawalHistory, withdrawal) }
      : g,
  ),
})

/** The app data with an edited parchment withdrawal swapped in. */
export const applyParchmentWithdrawalEdit = (
  prev: AppData,
  lotId: string,
  withdrawal: ParchmentWithdrawalRecord,
): AppData => ({
  ...prev,
  parchmentLots: prev.parchmentLots.map((p) =>
    p.id === lotId
      ? { ...p, withdrawalHistory: replaceWithdrawal(p.withdrawalHistory, withdrawal) }
      : p,
  ),
})

/**
 * A refusal that means the page is out of date: the withdrawal or lot is gone
 * (404), or someone voided it first. The page reloads so it shows that.
 */
export const isStaleWithdrawalError = (err: unknown): boolean =>
  err instanceof ApiError
    ? err.status === 404 || (err.status === 409 && /already void|void withdrawal cannot/i.test(err.message))
    : false
