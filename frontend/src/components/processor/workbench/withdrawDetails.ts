// The per-type details of a green-bean Withdraw Stock: who a Sale goes to and
// at what price, or which roaster a Roasting Stock withdrawal is pushed to.
// Shared by the Processor Workbench (one lot) and the Parchment page (a
// process type + grade bucket drawn FIFO across several lots), so both ask
// for the same fields, refuse the same input and send the same payload.

import { UserRole } from '../../../types'
import type { Customer, User } from '../../../types'
import type { CreateWithdrawalInput } from '../../../services/lots/greenBeanLotService'

export type WithdrawalType =
  | 'Sale'
  | 'Roasting Stock'
  | 'Sample'
  | 'Export'
  | 'Other'

/** What the Sale and Roasting Stock fields hold, as typed. */
export interface WithdrawDetails {
  /** Price per kg as typed; empty means no price. */
  salePrice: string
  currency: string
  /** The picked customer's id; empty means no customer. */
  customerId: string
  customerName: string
  deliveryAddress: string
  targetRoasterId: string
}

export const EMPTY_WITHDRAW_DETAILS: WithdrawDetails = {
  salePrice: '',
  currency: 'THB',
  customerId: '',
  customerName: '',
  deliveryAddress: '',
  targetRoasterId: '',
}

export const WITHDRAW_CURRENCIES = ['THB', 'USD', 'EUR']

export const ROASTER_REQUIRED_MESSAGE =
  'กรุณาเลือก Roaster ที่ต้องการส่ง stock ให้'

export type WithdrawDetailsPayload = Pick<
  CreateWithdrawalInput,
  'salePrice' | 'currency' | 'customerName' | 'deliveryAddress' | 'targetRoasterId'
>

/**
 * Why the details cannot be sent yet, or null. A Roasting Stock withdrawal
 * needs its roaster (the backend refuses one without). A Sale's customer and
 * price stay optional, and a typed price is sent as typed, the same as the
 * Workbench always has.
 */
export const withdrawDetailsError = (
  type: WithdrawalType,
  details: WithdrawDetails,
): string | null => {
  if (type === 'Roasting Stock' && !details.targetRoasterId) {
    return ROASTER_REQUIRED_MESSAGE
  }
  return null
}

/**
 * The fields a withdrawal of `type` adds to the createWithdrawal payload:
 * price, currency, customer and address for a Sale, the roaster for Roasting
 * Stock, nothing for the other types.
 */
export const buildWithdrawDetailsPayload = (
  type: WithdrawalType,
  details: WithdrawDetails,
): WithdrawDetailsPayload => ({
  ...(type === 'Sale' && {
    salePrice: details.salePrice ? parseFloat(details.salePrice) : undefined,
    currency: details.currency,
    customerName: details.customerName || undefined,
    deliveryAddress: details.deliveryAddress || undefined,
  }),
  ...(type === 'Roasting Stock' && {
    targetRoasterId: details.targetRoasterId,
  }),
})

/**
 * The sale value of `amountKg` at the typed price, or null unless this is a
 * Sale with both an amount and a price above 0.
 */
export const withdrawSaleTotal = (
  type: WithdrawalType,
  amountKg: number,
  details: WithdrawDetails,
): number | null => {
  if (type !== 'Sale') return null
  const price = parseFloat(details.salePrice) || 0
  return price > 0 && amountKg > 0 ? amountKg * price : null
}

/** "1,234.50 THB" */
export const formatWithdrawTotal = (total: number, currency: string): string =>
  `${total.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`

/**
 * Customer picker options, by name. The customer is optional, so once one is
 * picked the list also offers "No customer" to take it back.
 */
export const withdrawCustomerOptions = (
  customers: Customer[],
  customerId: string,
): { value: string; label: string }[] => {
  const options = [...customers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((customer) => ({
      value: customer.id,
      label: `${customer.name} (${customer.type})`,
    }))
  return customerId ? [{ value: '', label: 'No customer' }, ...options] : options
}

/**
 * Picking a customer fills the name and the delivery address (still
 * editable). An address the previous pick filled in is dropped when the new
 * customer has none; one typed by hand is kept.
 */
export const pickWithdrawCustomer = (
  details: WithdrawDetails,
  customer: Customer | undefined,
  customers: Customer[],
): WithdrawDetails => {
  const previous = customers.find((c) => c.id === details.customerId)
  const current = details.deliveryAddress
  let deliveryAddress = current
  if (customer?.address) deliveryAddress = customer.address
  else if (previous?.address && current === previous.address) deliveryAddress = ''
  return {
    ...details,
    customerId: customer?.id ?? '',
    customerName: customer?.name ?? '',
    deliveryAddress,
  }
}

/** The customer list with `customer` added at the top, or replaced in place. */
export const upsertCustomer = (
  customers: Customer[],
  customer: Customer,
): Customer[] =>
  customers.some((c) => c.id === customer.id)
    ? customers.map((c) => (c.id === customer.id ? customer : c))
    : [customer, ...customers]

/**
 * Target roaster options: every active user with the Roaster role, by name.
 * An Admin's user list also holds deactivated accounts, and stock pushed to
 * one of those would be stranded in an inventory nobody can open.
 */
export const withdrawRoasterOptions = (
  users: User[],
): { value: string; label: string }[] =>
  users
    .filter((u) => u.roles?.includes(UserRole.Roaster) && u.isActive !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((u) => ({ value: u.id, label: u.name }))
