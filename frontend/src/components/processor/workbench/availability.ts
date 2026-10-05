// How the workbench names a green bean lot's availabilityStatus. The stored
// values stay "Available" / "Withdrawn", but "Withdrawn" is also the word for
// real withdrawals (kg taken out), so the switch reads "On sale" / "Hidden":
// a hidden lot keeps its kg, it just cannot be withdrawn or claimed by a
// roaster until it is put back on sale. A lot with no kg left says
// "Depleted", as the status filter does: nobody hid it.

import type { GreenBeanLot } from '../../../types'

type Lot = Pick<GreenBeanLot, 'availabilityStatus' | 'currentWeightKg'>

export const ON_SALE_LABEL = 'On sale'
export const HIDDEN_LABEL = 'Hidden'
export const DEPLETED_LABEL = 'Depleted'

export const isOnSale = (lot: Lot): boolean => lot.availabilityStatus === 'Available'

const hasStock = (lot: Lot): boolean => (lot.currentWeightKg ?? 0) > 0

/** "On sale", "Hidden" or, with no kg left, "Depleted". */
export const availabilityLabel = (lot: Lot): string =>
  !hasStock(lot) ? DEPLETED_LABEL : isOnSale(lot) ? ON_SALE_LABEL : HIDDEN_LABEL

/** The switch's tooltip: what a click does. */
export const availabilityToggleTitle = (lot: Lot): string =>
  !hasStock(lot)
    ? 'No kg left to put on sale'
    : isOnSale(lot)
      ? 'Hide this lot from sale'
      : 'Put this lot back on sale'

/**
 * Hiding a lot that still has kg asks first; putting one back on sale
 * does not.
 */
export const hideNeedsConfirm = (lot: Lot): boolean => isOnSale(lot) && hasStock(lot)

/** Why Withdraw is off on a lot that is not on sale (undefined when it is on). */
export const withdrawBlockedTitle = (lot: Lot): string | undefined =>
  isOnSale(lot)
    ? undefined
    : hasStock(lot)
      ? 'Hidden from sale: put the lot back on sale to withdraw'
      : 'No kg left to withdraw'
