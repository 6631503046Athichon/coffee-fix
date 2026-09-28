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
 * State for a Withdraw Stock popup's Sale / Roasting Stock fields, plus its
 * "+ New customer" popup. Spread `fieldsProps` onto <WithdrawDetailsFields>
 * and render `newCustomerModal` outside any <form>: React bubbles a submit
 * through portals, so inside one saving a customer would also submit the
 * withdrawal. Customers come from, and new ones are added to, the app data;
 * roasters are the users with the Roaster role.
 */
export const useWithdrawDetails = () => {
  const { data, setData } = useDataContext()
  const customers = data.customers
  const [details, setDetails] = useState<WithdrawDetails>(EMPTY_WITHDRAW_DETAILS)
  const [showNewCustomer, setShowNewCustomer] = useState(false)
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
    },
    newCustomerModal: (
      <CreateCustomerModal
        isOpen={showNewCustomer}
        onClose={closeNewCustomer}
        onCustomerCreated={handleCustomerCreated}
      />
    ),
  }
}
