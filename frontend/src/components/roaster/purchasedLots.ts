import { GreenBeanSourceType } from '../../types'
import type { GreenBeanLot, RoasterInventoryItem } from '../../types'
import { api } from '../../services/api'
import { transformGreenBeanLotFromBackend } from '../../services/lots/greenBeanLotService'
import { todayDateOnly } from '../../utils/dateOnly'

// The Roaster Workbench's purchased (External) lots: the Add / Edit lot form,
// what an edit sends, and the words the lot cards and details show.

/** The Add / Edit purchased lot form, as typed. */
export interface PurchasedLotForm {
  originName: string
  producerName: string
  variety: string
  processType: string
  /** YYYY-MM-DD */
  purchaseDate: string
  /** Price per kg as typed; empty means no price. */
  pricePerKg: string
  currency: string
  /** The lot's whole weight as typed (its initial weight). */
  initialWeightKg: string
  grade: string
  supplierNotes: string
  tasteNote: string
}

export const emptyPurchasedLotForm = (): PurchasedLotForm => ({
  originName: '',
  producerName: '',
  variety: '',
  processType: '',
  purchaseDate: todayDateOnly(),
  pricePerKg: '',
  currency: 'THB',
  initialWeightKg: '',
  grade: 'Grade A',
  supplierNotes: '',
  tasteNote: '',
})

/** The form filled with a purchased lot, for its Edit. */
export const purchasedLotForm = (lot: GreenBeanLot): PurchasedLotForm => {
  const source = lot.externalSource
  // The lot's own price wins: it is the one sales and costs read. A price of
  // 0 is how the Add form saves "no price".
  const price = lot.pricePerKg ?? (source?.pricePerKg || undefined)
  return {
    originName: source?.originName ?? '',
    producerName: source?.producerName ?? '',
    variety: source?.variety ?? '',
    processType: source?.processType ?? '',
    // The date picker and the server take YYYY-MM-DD.
    purchaseDate: /^\d{4}-\d{2}-\d{2}/.test(source?.purchaseDate ?? '')
      ? source!.purchaseDate.slice(0, 10)
      : todayDateOnly(),
    pricePerKg: price != null && price > 0 ? String(price) : '',
    currency: source?.currency || lot.currency || 'THB',
    initialWeightKg: String(lot.initialWeightKg),
    grade: lot.grade || 'Grade A',
    supplierNotes: source?.supplierNotes ?? '',
    tasteNote: source?.tasteNote ?? '',
  }
}

/** Kg of the lot already claimed into stock or sold. Never negative. */
export const purchasedLotUsedKg = (
  lot: Pick<GreenBeanLot, 'initialWeightKg' | 'currentWeightKg'>,
) => Math.max(0, Math.round((lot.initialWeightKg - lot.currentWeightKg) * 1e6) / 1e6)

/** What PUT /green-bean-lots/:id takes for a purchased lot. */
export interface PurchasedLotUpdate {
  grade: string
  /** Only when the weight changed; the kg left moves with it on the server. */
  initialWeightKg?: number
  /** A new price (with its currency), or null to take the price away. */
  pricePerKg?: number | null
  currency?: string
  externalSource: {
    originName: string
    producerName: string | null
    variety: string
    processType: string
    purchaseDate: string
    pricePerKg: number
    currency: string
    tasteNote: string | null
    supplierNotes: string | null
  }
}

/**
 * The form checked against the lot: an error to show, or the update to send.
 * The weight may not go below what was already claimed or sold.
 */
export const purchasedLotUpdate = (
  lot: GreenBeanLot,
  form: PurchasedLotForm,
): { error: string } | { update: PurchasedLotUpdate } => {
  if (!form.originName.trim() || !form.variety.trim() || !form.processType.trim()) {
    return { error: 'Please fill origin, variety, and process type' }
  }
  const weight = Number(form.initialWeightKg.trim().replace(',', '.'))
  if (!form.initialWeightKg.trim() || !Number.isFinite(weight) || weight <= 0) {
    return { error: 'Weight must be > 0' }
  }
  const usedKg = purchasedLotUsedKg(lot)
  if (weight < usedKg - 1e-6) {
    return {
      error: `${usedKg.toFixed(2)} kg of this lot was already claimed or sold, so its weight cannot go below ${usedKg.toFixed(2)} kg`,
    }
  }
  const priceText = form.pricePerKg.trim().replace(',', '.')
  const price = priceText === '' ? 0 : Number(priceText)
  if (!Number.isFinite(price) || price < 0) {
    return { error: 'Enter a valid price' }
  }

  const update: PurchasedLotUpdate = {
    grade: form.grade.trim() || 'Grade A',
    externalSource: {
      originName: form.originName.trim(),
      producerName: form.producerName.trim() || null,
      variety: form.variety.trim(),
      processType: form.processType.trim(),
      purchaseDate: form.purchaseDate,
      pricePerKg: price,
      currency: form.currency,
      tasteNote: form.tasteNote.trim() || null,
      supplierNotes: form.supplierNotes.trim() || null,
    },
  }
  if (Math.abs(weight - lot.initialWeightKg) > 1e-9) update.initialWeightKg = weight
  if (price > 0) {
    // A new price leaves a pricing-history row on the server, so only a change is sent.
    if (price !== lot.pricePerKg) {
      update.pricePerKg = price
      update.currency = form.currency
    }
  } else if (lot.pricePerKg != null) {
    update.pricePerKg = null
  }
  return { update }
}

/** Saves a purchased lot's edit (owner or Admin; the server checks). */
export const updatePurchasedLot = async (
  id: string,
  update: PurchasedLotUpdate,
): Promise<GreenBeanLot> => {
  const response = await api.put<{
    greenBeanLot: Parameters<typeof transformGreenBeanLotFromBackend>[0]
  }>(`/green-bean-lots/${id}`, update)
  return transformGreenBeanLotFromBackend(response.greenBeanLot)
}

/**
 * The lot in the app's data with the saved edit: only the fields an edit
 * changes, so its withdrawals and cupping scores stay as loaded.
 */
export const withSavedEdit = (lot: GreenBeanLot, saved: GreenBeanLot): GreenBeanLot => ({
  ...lot,
  externalSource: saved.externalSource,
  grade: saved.grade,
  initialWeightKg: saved.initialWeightKg,
  currentWeightKg: saved.currentWeightKg,
  availabilityStatus: saved.availabilityStatus,
  pricePerKg: saved.pricePerKg,
  currency: saved.currency,
  priceSetDate: saved.priceSetDate,
  priceSetBy: saved.priceSetBy,
})

/** The options with the saved value first when the list does not have it. */
export const withSavedOption = (options: string[], saved: string): string[] =>
  saved && !options.includes(saved) ? [saved, ...options] : options

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "1 Sep 2026" for 2026-09-01; anything else as it is. */
export const formatPurchaseDate = (value?: string): string => {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return m >= 1 && m <= 12 && d ? `${d} ${MONTHS[m - 1]} ${y}` : value
}

/** How a stock row of a purchased lot came in: bought, not sent by a processor. */
export const PURCHASED_STOCK = 'Purchased'

/**
 * A stock row of a purchased (External) lot with what its lot says. The
 * server fills variety and process from processing only, and a bought-in lot
 * has no withdrawal to name how it came in, so its details showed dashes.
 */
export const withPurchasedLotDetails = (
  item: RoasterInventoryItem,
  lots: GreenBeanLot[],
): RoasterInventoryItem => {
  if (item.variety && item.process && item.withdrawalType) return item
  const lot = lots.find((l) => l.id === item.greenBeanLotId)
  if (lot?.sourceType !== GreenBeanSourceType.External) return item
  const source = lot.externalSource
  return {
    ...item,
    variety: item.variety || source?.variety || undefined,
    process: item.process || source?.processType || undefined,
    withdrawalType: item.withdrawalType || PURCHASED_STOCK,
  }
}

/**
 * How a roaster's stock row came to them, in words: the backend's
 * withdrawal type (RoastingStock) or its display form (Roasting Stock).
 */
export const stockSourceLabel = (type?: string | null): string => {
  if (!type) return '—'
  switch (type.replace(/[\s_&-]+/g, '').toLowerCase()) {
    case 'roastingstock':
      return 'Sent for roasting'
    case 'sale':
      return 'Sold'
    case 'sample':
      return 'Sample'
    case 'export':
      return 'Export'
    case 'other':
      return 'Other'
    case 'hullandgrade':
      return 'Hull & Grade'
    case 'purchased':
      return 'Bought in'
    default: {
      // An enum this list does not know yet: "SomeType" reads "Some type".
      const words = type
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .trim()
      return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
    }
  }
}
