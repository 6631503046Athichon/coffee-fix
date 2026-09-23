import React, { useEffect, useState } from 'react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../constants'
import { DataContext } from '../hooks/useDataContext'
import type { SaleOrdersStatus } from '../hooks/useDataContext'
import { RoastLevel, UserRole } from '../types'
import type {
  AppData,
  Customer,
  RoastSaleSummary,
  SaleOrder,
  SaleOrderItem,
  SellableRoast,
  User,
} from '../types'

// Test data and a stateful DataContext for the sales screens.

export const roasterUser: User = { id: 'user-roaster', name: 'Bean Roasters', roles: [UserRole.Roaster] }
export const adminUser: User = { id: 'user-admin', name: 'Admin', roles: [UserRole.Admin] }

export const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'cust-1',
  name: 'Cafe Aroma',
  type: 'Retailer',
  contactPhone: '081 234 5678',
  address: '1 Nimman Rd, Chiang Mai',
  ...over,
})

export const roast = (over: Partial<RoastSaleSummary> = {}): RoastSaleSummary => ({
  id: 'rb-1',
  label: 'RB-0421',
  roastDate: '2026-09-10',
  roastLevel: RoastLevel.Medium,
  roastedWeightKg: 10,
  soldWeightKg: 2,
  availableKg: 8,
  greenBeanLotId: 'gbl-1',
  greenBeanLotDisplayId: 'GBL-2026-7',
  grade: 'Grade A',
  variety: 'Typica',
  process: 'Washed',
  ...over,
})

export const sellable = (over: Partial<SellableRoast> = {}): SellableRoast => ({
  ...roast(),
  roasterId: roasterUser.id,
  ...over,
})

export const saleItem = (over: Partial<SaleOrderItem> = {}): SaleOrderItem => {
  const r = over.roast === undefined && !('roast' in over) ? roast() : over.roast
  const quantity = over.quantity ?? 2
  const pricePerKg = over.pricePerKg ?? 500
  return {
    id: 'item-1',
    roastBatchId: r?.id,
    greenBeanLotId: r?.greenBeanLotId ?? 'gbl-1',
    lotGrade: 'Grade A',
    quantity,
    pricePerKg,
    subtotal: Math.round(quantity * pricePerKg * 100) / 100,
    roast: r,
    ...over,
  }
}

export const sale = (over: Partial<SaleOrder> = {}): SaleOrder => {
  const items = over.items ?? [saleItem()]
  return {
    id: 'sale-1',
    orderNumber: 'ORD-2026-0001',
    customerId: 'cust-1',
    customerName: 'Cafe Aroma',
    customerPhone: '081 234 5678',
    customerAddress: '1 Nimman Rd, Chiang Mai',
    customer: { id: 'cust-1', name: 'Cafe Aroma', type: 'Retailer' },
    orderDate: '2026-09-20',
    status: 'Confirmed',
    items,
    totalAmount: Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100,
    currency: 'THB',
    createdBy: roasterUser.id,
    creatorName: roasterUser.name,
    invoiceCount: 0,
    createdAt: '2026-09-20T03:00:00.000Z',
    updatedAt: '2026-09-20T03:00:00.000Z',
    ...over,
  }
}

export const appData = (over: Partial<AppData> = {}): AppData => ({ ...INITIAL_APP_DATA, ...over })

export interface TestDataHandle {
  current: AppData
}

/**
 * A real DataContext provider backed by state, so setData calls made by the
 * component under test re-render it; `dataRef.current` always holds the
 * latest data for assertions.
 */
export function TestDataProvider({
  initial,
  dataRef,
  refreshData = async () => {},
  setIsEditing = vi.fn(),
  saleOrdersStatus = 'ok',
  children,
}: {
  initial: AppData
  dataRef?: TestDataHandle
  refreshData?: () => Promise<void>
  setIsEditing?: (editing: boolean) => void
  saleOrdersStatus?: SaleOrdersStatus
  children: React.ReactNode
}) {
  const [data, setData] = useState(initial)
  useEffect(() => {
    if (dataRef) dataRef.current = data
  }, [dataRef, data])
  return (
    <DataContext.Provider
      value={{ data, setData, refreshData, setIsEditing, isEditing: false, saleOrdersStatus }}
    >
      {children}
    </DataContext.Provider>
  )
}
