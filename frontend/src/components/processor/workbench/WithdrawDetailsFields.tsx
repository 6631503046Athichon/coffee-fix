import React, { useId, useMemo } from 'react'
import { Pencil, Plus, Send } from 'lucide-react'
import Select from '../../common/Select'
import type { Customer } from '../../../types'
import {
  WITHDRAW_CURRENCIES,
  withdrawCustomerOptions,
  pickWithdrawCustomer,
} from './withdrawDetails'
import type { WithdrawDetails, WithdrawalType } from './withdrawDetails'

interface WithdrawDetailsFieldsProps {
  /** Sale and Roasting Stock have fields; the other types render nothing. */
  type: WithdrawalType
  details: WithdrawDetails
  /** Receives an updater, so a useState setter can be passed straight in. */
  onChange: (update: (details: WithdrawDetails) => WithdrawDetails) => void
  customers: Customer[]
  /** Target roaster options, see withdrawRoasterOptions. */
  roasters: { value: string; label: string }[]
  /** "+ New customer": the page opens its CreateCustomerModal. */
  onNewCustomer: () => void
  /** "Edit" next to the picked customer: opens the customer edit popup. */
  onEditCustomer?: () => void
  /** Extra classes on the tinted block, e.g. its margin. */
  className?: string
}

/**
 * The Withdraw Stock fields that depend on the withdrawal type: customer,
 * delivery address and price per kg for a Sale, the target roaster for
 * Roasting Stock. Validate with withdrawDetailsError and send with
 * buildWithdrawDetailsPayload.
 */
const WithdrawDetailsFields: React.FC<WithdrawDetailsFieldsProps> = ({
  type,
  details,
  onChange,
  customers,
  roasters,
  onNewCustomer,
  onEditCustomer,
  className = '',
}) => {
  const id = useId()
  const customerLabelId = `${id}-customer-label`
  const addressId = `${id}-delivery-address`
  const priceId = `${id}-sale-price`
  const roasterLabelId = `${id}-roaster-label`
  const customerOptions = useMemo(
    () => withdrawCustomerOptions(customers, details.customerId),
    [customers, details.customerId],
  )
  const set = (patch: Partial<WithdrawDetails>) =>
    onChange((current) => ({ ...current, ...patch }))
  const pickedCustomer = details.customerId
    ? customers.find((c) => c.id === details.customerId)
    : undefined

  if (type === 'Sale') {
    return (
      <div
        className={`p-4 bg-blue-50/70 rounded-xl border border-blue-200 space-y-3 ${className}`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div role="group" aria-labelledby={customerLabelId} className="min-w-0">
            <div className="flex items-center justify-between gap-2 h-5 mb-1.5">
              <span
                id={customerLabelId}
                className="text-xs font-semibold text-gray-600"
              >
                Customer
              </span>
              <div className="flex items-center gap-3">
                {pickedCustomer && onEditCustomer && (
                  <button
                    type="button"
                    onClick={onEditCustomer}
                    aria-label={`Edit customer ${pickedCustomer.name}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={onNewCustomer}
                  className={
                    customers.length === 0
                      ? 'inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700'
                      : 'inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700'
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  New customer
                </button>
              </div>
            </div>
            <Select
              value={details.customerId || null}
              onChange={(v) => {
                const customerId = v ? String(v) : ''
                onChange((current) =>
                  pickWithdrawCustomer(
                    current,
                    customers.find((c) => c.id === customerId),
                    customers,
                  ),
                )
              }}
              options={customerOptions}
              placeholder={
                customers.length === 0 ? 'No customers yet' : 'Select customer...'
              }
              disabled={customers.length === 0}
              colorTheme="blue"
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor={addressId}
              className="flex items-center h-5 text-xs font-semibold text-gray-600 mb-1.5"
            >
              Delivery Address
            </label>
            <input
              id={addressId}
              type="text"
              value={details.deliveryAddress}
              onChange={(e) => set({ deliveryAddress: e.target.value })}
              placeholder="123 Main St, City"
              className="block w-full min-w-0 h-[46px] border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor={priceId}
            className="block text-xs font-semibold text-gray-600 mb-1.5"
          >
            Price per kg
          </label>
          <div className="flex gap-2">
            <input
              id={priceId}
              type="number"
              step="0.01"
              value={details.salePrice}
              onChange={(e) => set({ salePrice: e.target.value })}
              placeholder="0.00"
              className="flex-1 block w-full min-w-0 border border-gray-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            <Select
              value={details.currency}
              onChange={(v) => set({ currency: v as string })}
              options={WITHDRAW_CURRENCIES}
              className="w-24 shrink-0"
              colorTheme="blue"
            />
          </div>
        </div>
      </div>
    )
  }

  if (type === 'Roasting Stock') {
    return (
      <div
        role="group"
        aria-labelledby={roasterLabelId}
        className={`p-4 bg-orange-50/70 rounded-xl border border-orange-200 ${className}`}
      >
        <label
          id={roasterLabelId}
          className="block text-xs font-semibold text-gray-600 mb-1.5"
        >
          Target Roaster <span className="text-red-500">*</span>
        </label>
        <Select
          value={details.targetRoasterId}
          onChange={(v) => set({ targetRoasterId: v as string })}
          options={roasters}
          placeholder="Select Roaster..."
          colorTheme="blue"
        />
        <div className="flex items-center gap-1.5 mt-2">
          <Send className="h-3 w-3 text-orange-500" />
          <p className="text-[11px] text-orange-600">
            Stock will be pushed to the roaster&apos;s inventory automatically
          </p>
        </div>
      </div>
    )
  }

  return null
}

export default WithdrawDetailsFields
