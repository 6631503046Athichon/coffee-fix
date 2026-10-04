import React, { useMemo, useRef, useState } from 'react'
import CreateCustomerModal from '../../sales/modals/CreateCustomerModal'
import { useDataContext } from '../../../hooks/useDataContext'
import type { Customer } from '../../../types'
import {
  EMPTY_WITHDRAW_DETAILS,
  pickWithdrawCustomer,
  upsertCustomer,
  withdrawRoasterOptions,
} from './withdrawDetails'
import type { WithdrawDetails } from './withdrawDetails'

/**
 * The fields after the picked customer was edited: its new name, and its new
 * address when the delivery address was still the one the old record filled
 * in. An address typed by hand is kept. Details for another customer are
 * returned unchanged.
 */
export const applyEditedWithdrawCustomer = (
  details: WithdrawDetails,
  customer: Customer,
  customers: Customer[],
): WithdrawDetails => {
  if (details.customerId !== customer.id) return details
  const previousAddress = customers.find((c) => c.id === customer.id)?.address ?? ''
  return {
    ...details,
    customerName: customer.name,
    deliveryAddress:
      details.deliveryAddress === previousAddress
        ? customer.address ?? ''
        : details.deliveryAddress,
  }
}

/**
 * State for a Withdraw Stock popup's Sale / Roasting Stock fields, plus its
 * "+ New customer" and "Edit" customer popups. Spread `fieldsProps` onto
 * <WithdrawDetailsFields> and render `newCustomerModal` (both popups) outside
 * any <form>: React bubbles a submit through portals, so inside one saving a
 * customer would also submit the withdrawal. Customers come from, and new or
 * edited ones are saved to, the app data; roasters are the users with the
 * Roaster role.
 */
export const useWithdrawDetails = () => {
  const { data, setData } = useDataContext()
  const customers = data.customers
  const [details, setDetails] = useState<WithdrawDetails>(EMPTY_WITHDRAW_DETAILS)
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  // The customer record open in the Edit popup, as it was when opened.
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  // True only while the "+ New customer" popup of the current withdrawal is
  // up. A save that finishes after it was closed still adds the customer to
  // the list but must not pick it on whatever withdrawal is open by then.
  const newCustomerPendingRef = useRef(false)

  const openNewCustomer = () => {
    newCustomerPendingRef.current = true
    setShowNewCustomer(true)
  }
  const closeNewCustomer = () => {
    newCustomerPendingRef.current = false
    setShowNewCustomer(false)
  }

  const openEditCustomer = () => {
    const customer = customers.find((c) => c.id === details.customerId)
    if (customer) setEditingCustomer(customer)
  }
  const closeEditCustomer = () => setEditingCustomer(null)

  /** Clear the fields for the next withdrawal: no customer, price or roaster. */
  const reset = () => {
    setDetails(EMPTY_WITHDRAW_DETAILS)
    newCustomerPendingRef.current = false
  }

  // Add the saved customer to the app data so the picker lists it, then pick it.
  const handleCustomerCreated = (customer: Customer) => {
    setData((prev) => ({
      ...prev,
      customers: upsertCustomer(prev.customers, customer),
    }))
    if (newCustomerPendingRef.current) {
      setDetails((current) => pickWithdrawCustomer(current, customer, customers))
    }
  }

  // Replace the record in the app data, and refresh the picked customer's
  // name (and auto-filled address) on the withdrawal being entered.
  const handleCustomerEdited = (customer: Customer) => {
    setData((prev) => ({
      ...prev,
      customers: upsertCustomer(prev.customers, customer),
    }))
    setDetails((current) => applyEditedWithdrawCustomer(current, customer, customers))
  }

  const roasters = useMemo(() => withdrawRoasterOptions(data.users), [data.users])

  return {
    details,
    setDetails,
    reset,
    fieldsProps: {
      details,
      onChange: setDetails,
      customers,
      roasters,
      onNewCustomer: openNewCustomer,
      onEditCustomer: openEditCustomer,
    },
    newCustomerModal: (
      <>
        <CreateCustomerModal
          isOpen={showNewCustomer}
          onClose={closeNewCustomer}
          onCustomerCreated={handleCustomerCreated}
        />
        <CreateCustomerModal
          isOpen={editingCustomer !== null}
          onClose={closeEditCustomer}
          onCustomerCreated={handleCustomerEdited}
          editCustomer={editingCustomer}
        />
      </>
    ),
  }
}
