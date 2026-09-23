import React from 'react'
import type { RoastSaleSummary, SaleOrder, SaleOrderItem, SaleOrderStatus } from '../../types'

// Shared labels and formatting for the sales log, the sale popups and the receipt.

export const SALE_STATUSES: SaleOrderStatus[] = ['Draft', 'Confirmed', 'Delivered', 'Cancelled']

export const SALE_CURRENCIES = ['THB', 'USD', 'EUR', 'JPY', 'CNY']

export const MAX_SALE_LINES = 30

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
export const describeBean = (item: SaleOrderItem): string =>
  [item.lotGrade, item.roast?.variety, item.roast?.process].filter(Boolean).join(' ')

/** Grade, variety and process of a roast that can be sold. */
export const describeRoastOption = (roast: RoastSaleSummary): string =>
  [roast.grade, roast.variety, roast.process].filter(Boolean).join(' ')

/** One line of a sale in a single string (lists, search, legacy lines). */
export const describeLine = (item: SaleOrderItem): string => {
  const roast = item.roast
  if (roast) {
    return [roast.label, describeBean(item), roast.roastLevel ?? 'No level', `${formatKg(item.quantity)} kg`]
      .filter(Boolean)
      .join(' · ')
  }
  return `${item.lotGrade} (green) · ${formatKg(item.quantity)} kg`
}

/**
 * What goes back to stock when the sale is cancelled or deleted:
 * '2.5 kg back to RB-0421, 1 kg back to RB-0107'. Empty for a cancelled sale.
 */
export const releaseSummary = (order: SaleOrder): string => {
  if (order.status === 'Cancelled') return ''
  return order.items
    .filter((item) => item.roastBatchId)
    .map((item) => `${formatKg(item.quantity)} kg back to ${item.roast?.label ?? 'its roast'}`)
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
