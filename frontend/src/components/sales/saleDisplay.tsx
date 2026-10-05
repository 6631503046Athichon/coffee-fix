import React from 'react'
import type { SaleOrder, SaleOrderItem, SaleOrderStatus } from '../../types'

// Shared labels and formatting for the sales log, the sale popups and the receipt.

export const SALE_STATUSES: SaleOrderStatus[] = ['Draft', 'Confirmed', 'Delivered', 'Cancelled']

export const SALE_CURRENCIES = ['THB', 'USD', 'EUR', 'JPY', 'CNY']

export const MAX_SALE_LINES = 30

// The sales pages' one look, used by the Sales log, Customers and the sale and
// customer popups (and so by the roaster's Sell popup): 11px uppercase labels,
// 42px fields with a 1px border (like common/Select inside a text-sm wrapper),
// 40px buttons whose labels never wrap, and 32px icon-only row actions.
export const LABEL_TEXT = 'text-[11px] font-semibold uppercase tracking-wider text-gray-500'
export const FIELD_LABEL = `mb-1.5 block ${LABEL_TEXT}`
/** A text field. The caller adds the border colour and the focus colour. */
export const FIELD =
  'block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2'
export const BLUE_FOCUS = 'focus:border-blue-500 focus:ring-blue-500'
/** common/DatePicker's field, drawn like the Selects next to it. */
export const dateTrigger = (focus: string): string =>
  'rounded-lg border border-gray-300 px-3 py-2.5 shadow-sm hover:bg-gray-50 focus:ring-2 ' + focus
export const BTN_SHAPE =
  'inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50'
export const OUTLINE_BTN = `${BTN_SHAPE} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`
export const PRIMARY_BTN = `${BTN_SHAPE} bg-blue-600 text-white hover:bg-blue-700`
export const DANGER_BTN = `${BTN_SHAPE} bg-red-600 text-white hover:bg-red-700`
export const ICON_BTN =
  'inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-blue-600'
export const ICON_BTN_DANGER =
  'inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600'

/** The left stripe of a sale card or row says its status at a glance. */
export const SALE_STATUS_STRIPE: Record<SaleOrderStatus, string> = {
  Draft: 'border-l-gray-300',
  Confirmed: 'border-l-blue-500',
  Delivered: 'border-l-green-500',
  Cancelled: 'border-l-red-300',
}

const STATUS_CHIP_CLASSES: Record<SaleOrderStatus, string> = {
  Draft: 'bg-gray-100 text-gray-700',
  Confirmed: 'bg-blue-50 text-blue-700',
  Delivered: 'bg-green-50 text-green-700',
  Cancelled: 'bg-red-50 text-red-700',
}

export const SaleStatusChip: React.FC<{ status: SaleOrderStatus; className?: string }> = ({
  status,
  className = '',
}) => (
  <span
    className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
      STATUS_CHIP_CLASSES[status] ?? STATUS_CHIP_CLASSES.Draft
    } ${className}`}
  >
    {status}
  </span>
)

export const RoastLevelTag: React.FC<{ level?: string | null }> = ({ level }) =>
  level ? (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
      {level}
    </span>
  ) : (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
      No level
    </span>
  )

/** Marks a sale line of green beans sold straight from the roaster's stock. */
export const GreenBeansTag: React.FC = () => (
  <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
    Green beans
  </span>
)

/** kg with at most 3 decimals and no trailing zeros: 2.5, 0.125, 3. */
export const formatKg = (kg: number): string => String(+kg.toFixed(3))

export const formatMoney = (amount: number, currency: string): string =>
  `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-09-23' -> '23 Sep 2026' (the app UI is English; spelled out so every browser agrees). */
export const formatSaleDate = (ymd?: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '')
  if (!match) return ymd ?? ''
  const month = MONTHS[Number(match[2]) - 1]
  return month ? `${Number(match[3])} ${month} ${match[1]}` : (ymd ?? '')
}

/** Today as YYYY-MM-DD in the viewer's own time zone. */
export const todayLocal = (): string => new Date().toLocaleDateString('en-CA')

export const round2 = (v: number): number => Math.round(v * 100) / 100

/** The sale's own customer snapshot comes first; the live record is only a fallback. */
export const saleCustomerName = (order: SaleOrder): string =>
  order.customerName || order.customer?.name || ''

/** Grade (snapshot at sale time), variety and process of a sale line. */
export const describeBean = (item: SaleOrderItem): string => {
  const source = item.roast ?? item.green
  return [item.lotGrade, source?.variety, source?.process].filter(Boolean).join(' ')
}

/** Grade, variety and process of a roast or green lot that can be sold. */
export const describeRoastOption = (lot: { grade?: string; variety?: string; process?: string }): string =>
  [lot.grade, lot.variety, lot.process].filter(Boolean).join(' ')

/** One line of a sale in a single string (lists, search, legacy lines). */
export const describeLine = (item: SaleOrderItem): string => {
  const roast = item.roast
  if (roast) {
    return [roast.label, describeBean(item), roast.roastLevel ?? 'No level', `${formatKg(item.quantity)} kg`]
      .filter(Boolean)
      .join(' · ')
  }
  const green = item.green
  if (green) {
    return ['Green beans', green.label, green.greenBeanLotDisplayId, describeBean(item), `${formatKg(item.quantity)} kg`]
      .filter(Boolean)
      .join(' · ')
  }
  return `${item.lotGrade} (green) · ${formatKg(item.quantity)} kg`
}

/** What a sale line sold: roasted coffee, green beans from stock, or a line from before roast sales. */
export const lineKind = (item: SaleOrderItem): 'Roasted' | 'Green beans' | 'Green beans (older sale)' =>
  item.roastBatchId ? 'Roasted' : item.roasterInventoryId ? 'Green beans' : 'Green beans (older sale)'

/**
 * What goes back to stock when the sale is cancelled or deleted:
 * '2.5 kg back to RB-0421, 5 kg of green beans back to ROA-4412'. Empty for a
 * cancelled sale.
 */
export const releaseSummary = (order: SaleOrder): string => {
  if (order.status === 'Cancelled') return ''
  return order.items
    .flatMap((item) =>
      item.roastBatchId
        ? [`${formatKg(item.quantity)} kg back to ${item.roast?.label ?? 'its roast'}`]
        : item.roasterInventoryId
          ? [`${formatKg(item.quantity)} kg of green beans back to ${item.green?.label ?? 'your stock'}`]
          : [],
    )
    .join(', ')
}

/** '45,600.00 THB · 120.00 USD' — each currency in the order it first appears. */
export const totalsByCurrency = (orders: SaleOrder[]): string => {
  const totals = new Map<string, number>()
  for (const order of orders) {
    totals.set(order.currency, (totals.get(order.currency) ?? 0) + order.totalAmount)
  }
  return Array.from(totals, ([currency, amount]) => formatMoney(round2(amount), currency)).join(' · ')
}
