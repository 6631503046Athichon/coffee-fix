import type { AuthenticatedUser } from '@/lib/middleware'
import { isAdminUser } from '@/lib/saleOrders'

// Withdrawal rows carry the sale behind them: the customer's name and
// delivery address, the price, the total, the invoice number, and the roaster
// the kg went to. Lots themselves are readable by every role (Cuppers,
// HeadJudges, every Roaster, farmers on their own lots), so each route that
// returns a lot with its withdrawal history runs it through here first.
//
// Only the lot's owner and Admin (or super admin) see the full rows. That is
// the same rule as who may record a withdrawal on the lot:
//   - green-bean lot: greenBeanLot.createdById
//   - parchment lot:  parchmentLot -> processingBatch.createdById (a lot with
//                     no batch, e.g. an Excel import, is Admin-only)
// Everyone else gets the history without the sale: type, kg, date and who
// recorded it, with `saleDetailsHidden: true` so the client knows the sale
// columns were withheld rather than never entered (and offers no invoice).
// The free-text `purpose` is withheld with the sale: people type customer
// names and order numbers into it. Whether a row is void (voidedAt, and who
// voided it) is public, so everyone's history and kg add up the same way;
// the free-text `voidReason` is withheld like `purpose`.

/**
 * Columns anyone who can open the lot may read. Listed rather than stripped,
 * so a column added to the withdrawal tables later stays private until it is
 * added here on purpose. `cuppingScore` (parchment RoastingStock rows) stays
 * as it was: cupping fields are hands-off and it is not sale data.
 */
export const PUBLIC_WITHDRAWAL_FIELDS = [
  'id',
  'greenBeanLotId',
  'parchmentLotId',
  'withdrawalType',
  'amountKg',
  'date',
  'createdAt',
  'withdrawnBy',
  'withdrawnByName',
  'withdrawnByUser',
  'cuppingScore',
  'voidedAt',
  'voidedById',
] as const

/** Whether `user` may read the sale details on a lot owned by `ownerId`. */
export function canSeeWithdrawalSales(
  user: AuthenticatedUser,
  ownerId: string | null | undefined,
): boolean {
  return isAdminUser(user) || (!!ownerId && ownerId === user.id)
}

/** The withdrawal row without its sale details, marked as such. */
export function publicWithdrawal<W extends object>(row: W): Partial<W> & { saleDetailsHidden: true } {
  const source = row as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of PUBLIC_WITHDRAWAL_FIELDS) {
    if (key in source) out[key] = source[key]
  }
  out.saleDetailsHidden = true
  return out as Partial<W> & { saleDetailsHidden: true }
}

type WithWithdrawals = { withdrawalHistory?: object[] | null }

/** A shallow copy of the lot with its withdrawals stripped of the sale. */
function withoutSales<L extends WithWithdrawals>(lot: L): L {
  if (!Array.isArray(lot.withdrawalHistory)) return { ...lot }
  return { ...lot, withdrawalHistory: lot.withdrawalHistory.map(publicWithdrawal) }
}

type GreenBeanLotShape = WithWithdrawals & {
  createdById?: string | null
  roasterInventory?: { roasterId: string }[] | null
  roastBatches?: { roasterId: string }[] | null
}

/**
 * A green-bean lot as `user` may see it. Non-owners also lose the other
 * roasters' stock rows and roasts (who took the lot, how many kg each has
 * used, and their roast profiles) but keep their own.
 */
export function greenBeanLotForViewer<L extends GreenBeanLotShape>(user: AuthenticatedUser, lot: L): L {
  if (canSeeWithdrawalSales(user, lot.createdById)) return lot
  const shaped = withoutSales(lot)
  if (Array.isArray(lot.roasterInventory)) {
    shaped.roasterInventory = lot.roasterInventory.filter(item => item.roasterId === user.id)
  }
  if (Array.isArray(lot.roastBatches)) {
    shaped.roastBatches = lot.roastBatches.filter(batch => batch.roasterId === user.id)
  }
  return shaped
}

type ParchmentLotShape = WithWithdrawals & {
  processingBatch?: { createdById?: string | null } | null
}

/**
 * A parchment lot as `user` may see it. The route must load
 * `processingBatch.createdById`, or only Admin sees the sale details.
 */
export function parchmentLotForViewer<L extends ParchmentLotShape>(user: AuthenticatedUser, lot: L): L {
  if (canSeeWithdrawalSales(user, lot.processingBatch?.createdById)) return lot
  return withoutSales(lot)
}
