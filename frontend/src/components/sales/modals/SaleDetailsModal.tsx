import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2, Pencil, Printer, Trash2, X } from 'lucide-react'
import { UserRole } from '../../../types'
import type { SaleOrder, SaleOrderStatus } from '../../../types'
import Modal from '../../common/Modal'
import { useDataContext } from '../../../hooks/useDataContext'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import {
  applySaleChange,
  deleteSaleOrder,
  updateSaleOrder,
} from '../../../services/sales/saleOrderService'
import SaleReceipt from '../SaleReceipt'
import {
  GreenBeansTag,
  RoastLevelTag,
  SALE_STATUSES,
  SaleStatusChip,
  describeBean,
  describeLine,
  formatKg,
  formatMoney,
  formatSaleDate,
  releaseSummary,
  saleCustomerName,
} from '../saleDisplay'

export interface SaleDetailsModalProps {
  order: SaleOrder | null
  initialMode?: 'view' | 'confirm-delete'
  onClose: () => void
  onEdit: (order: SaleOrder) => void
}

type Mode = 'view' | 'confirm-cancel' | 'confirm-delete'

const STALE_SALE = /changed or removed by someone else/
const SALE_NOT_FOUND = /^Sale not found$/
const PRINT_ROOT_ID = 'sale-print-root'
const PRINT_BODY_CLASS = 'printing-sale-receipt'

const CUSTOMER_TYPE_CLASSES: Record<string, string> = {
  Roaster: 'bg-amber-50 text-amber-700',
  Distributor: 'bg-blue-50 text-blue-700',
  Retailer: 'bg-green-50 text-green-700',
  Other: 'bg-gray-100 text-gray-700',
}

const STATUS_CHIP_ON: Record<SaleOrderStatus, string> = {
  Draft: 'border-gray-400 bg-gray-100 text-gray-800',
  Confirmed: 'border-blue-600 bg-blue-50 text-blue-700',
  Delivered: 'border-green-600 bg-green-50 text-green-700',
  Cancelled: 'border-red-500 bg-red-50 text-red-700',
}

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const capitalize = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text)

const SaleDetailsModal: React.FC<SaleDetailsModalProps> = ({ order, ...props }) =>
  order ? <SaleDetailsDialog order={order} {...props} /> : null

const SaleDetailsDialog: React.FC<Omit<SaleDetailsModalProps, 'order'> & { order: SaleOrder }> = ({
  order,
  initialMode = 'view',
  onClose,
  onEdit,
}) => {
  const { setData, refreshData } = useDataContext()
  const { currentUser } = useAuth()
  const { addToast } = useToast()
  const isAdmin =
    !!currentUser && (!!currentUser.isSuperAdmin || currentUser.roles.includes(UserRole.Admin))

  const [mode, setMode] = useState<Mode>(initialMode)
  const [busy, setBusy] = useState<'status' | 'delete' | null>(null)
  const [error, setError] = useState('')

  // While this popup is open the receipt sits in #sale-print-root (a direct
  // child of body) and the body class switches the print rules in
  // styles.css on, so printing — the button or Ctrl+P — prints the receipt.
  const [printRoot] = useState(() => {
    const existing = document.getElementById(PRINT_ROOT_ID)
    if (existing) return existing
    const el = document.createElement('div')
    el.id = PRINT_ROOT_ID
    return el
  })
  useEffect(() => {
    if (printRoot.parentElement !== document.body) document.body.appendChild(printRoot)
    document.body.classList.add(PRINT_BODY_CLASS)
    return () => {
      printRoot.remove()
      document.body.classList.remove(PRINT_BODY_CLASS)
    }
  }, [printRoot])

  const close = () => {
    if (!busy) onClose()
  }

  const handleError = (err: unknown) => {
    const message = err instanceof Error ? err.message : ''
    if (SALE_NOT_FOUND.test(message)) {
      setData((prev) => applySaleChange(prev, { removeId: order.id }))
      void refreshData()
      onClose()
      return true
    }
    if (STALE_SALE.test(message)) {
      void refreshData()
      addToast({ type: 'warning', message })
      onClose()
      return true
    }
    setError(message || 'Something went wrong. Please try again.')
    return false
  }

  const changeStatus = async (status: SaleOrderStatus, confirmed = false) => {
    if (busy || status === order.status) return
    if (status === 'Cancelled' && !confirmed) {
      setError('')
      setMode('confirm-cancel')
      return
    }
    setBusy('status')
    setError('')
    try {
      const result = await updateSaleOrder(order.id, { status, expectedUpdatedAt: order.updatedAt })
      setData((prev) =>
        applySaleChange(prev, {
          upsert: result.saleOrder,
          affectedRoastBatches: result.affectedRoastBatches,
          affectedInventoryItems: result.affectedInventoryItems,
        }),
      )
      setMode('view')
      setBusy(null)
    } catch (err) {
      if (!handleError(err)) setBusy(null)
    }
  }

  const handleDelete = async () => {
    if (busy) return
    setBusy('delete')
    setError('')
    try {
      const result = await deleteSaleOrder(order.id, order.updatedAt)
      setData((prev) =>
        applySaleChange(prev, {
          removeId: order.id,
          affectedRoastBatches: result.affectedRoastBatches,
          affectedInventoryItems: result.affectedInventoryItems,
        }),
      )
      addToast({ type: 'success', message: `Sale ${order.orderNumber} deleted` })
      onClose()
    } catch (err) {
      if (!handleError(err)) setBusy(null)
    }
  }

  const titleId = 'sale-details-title'
  const release = releaseSummary(order)
  const deliveredWarning =
    order.status === 'Delivered'
      ? 'This sale is marked Delivered — only cancel it if the coffee came back.'
      : ''
  const invoiceText =
    order.invoiceCount > 0
      ? `Its ${order.invoiceCount} invoice${order.invoiceCount === 1 ? ' is' : 's are'} deleted too.`
      : ''
  const customerType = order.customer?.type

  return (
    <>
      {createPortal(<SaleReceipt order={order} />, printRoot)}
      <Modal
        isOpen
        onClose={close}
        maxWidth="2xl"
        showCloseButton={false}
        ariaLabelledBy={titleId}
        className="!p-5 !rounded-xl"
        mobileFullScreen
      >
        <div className="flex flex-col max-sm:min-h-[calc(100dvh-2rem)]">
          {/* Header */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="text-lg font-semibold text-gray-900">
                  Sale {order.orderNumber}
                </h2>
                <SaleStatusChip status={order.status} />
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {formatSaleDate(order.orderDate)}
                {isAdmin && order.creatorName ? ` · Recorded by ${order.creatorName}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-3 text-sm">
            {/* Sold to */}
            <div className="rounded-lg border border-gray-200 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Sold to
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900">{saleCustomerName(order)}</span>
                {customerType && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      CUSTOMER_TYPE_CLASSES[customerType] ?? CUSTOMER_TYPE_CLASSES.Other
                    }`}
                  >
                    {customerType}
                  </span>
                )}
              </div>
              {order.customerPhone && <p className="text-gray-600">{order.customerPhone}</p>}
              {order.customerAddress && (
                <p className="whitespace-pre-line text-gray-600">{order.customerAddress}</p>
              )}
            </div>

            {/* Status */}
            <div>
              <p id="sale-status-label" className="mb-1 text-xs font-semibold text-gray-600">
                Status
              </p>
              <div role="group" aria-labelledby="sale-status-label" className="flex flex-wrap gap-1.5">
                {SALE_STATUSES.map((status) => {
                  const on = status === order.status
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={on}
                      disabled={!!busy}
                      onClick={() => changeStatus(status)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        on
                          ? STATUS_CHIP_ON[status]
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {status}
                    </button>
                  )
                })}
                {busy === 'status' && <Loader2 className="h-4 w-4 animate-spin self-center text-blue-600" />}
              </div>
            </div>

            {/* Lines */}
            <div className="rounded-lg border border-gray-200">
              <ul className="divide-y divide-gray-100">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      {item.roast ? (
                        <>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-gray-900">{item.roast.label}</span>
                            <span className="text-xs text-gray-500">
                              {formatSaleDate(item.roast.roastDate)}
                            </span>
                            <RoastLevelTag level={item.roast.roastLevel} />
                          </div>
                          <p className="text-gray-600">{describeBean(item) || 'Roasted coffee'}</p>
                        </>
                      ) : item.green ? (
                        <>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-gray-900">{item.green.label}</span>
                            <GreenBeansTag />
                            {item.green.greenBeanLotDisplayId && (
                              <span className="text-xs text-gray-500">
                                {item.green.greenBeanLotDisplayId}
                              </span>
                            )}
                          </div>
                          <p className="text-gray-600">{describeBean(item) || 'Green beans'}</p>
                        </>
                      ) : (
                        <p className="text-gray-700">{describeLine(item)}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right tabular-nums">
                      <p className="text-xs text-gray-500">
                        {formatKg(item.quantity)} kg × {money(item.pricePerKg)}
                      </p>
                      <p className="font-semibold text-gray-900">{money(item.subtotal)}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-3 py-2">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="text-base font-bold tabular-nums text-gray-900">
                  {formatMoney(order.totalAmount, order.currency)}
                </span>
              </div>
            </div>

            {order.notes && (
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-600">Notes</p>
                <p className="whitespace-pre-line rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700">
                  {order.notes}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 mt-4 border-t border-gray-200 bg-white pt-3 shadow-[0_1.25rem_0_0_#fff]">
            {error && (
              <p
                role="alert"
                className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
              >
                {error}
              </p>
            )}

            {mode === 'confirm-cancel' ? (
              <div
                role="alertdialog"
                aria-labelledby="cancel-sale-title"
                className="rounded-lg border border-amber-200 bg-amber-50 p-3"
              >
                <p id="cancel-sale-title" className="flex items-center gap-2 font-semibold text-amber-900">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  Cancel sale {order.orderNumber}?
                </p>
                {release && <p className="mt-1 text-sm text-amber-800">{capitalize(release)}.</p>}
                {deliveredWarning && <p className="mt-1 text-sm text-amber-800">{deliveredWarning}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('view')}
                    disabled={!!busy}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Keep sale
                  </button>
                  <button
                    type="button"
                    onClick={() => changeStatus('Cancelled', true)}
                    disabled={!!busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {busy === 'status' && <Loader2 className="h-4 w-4 animate-spin" />}
                    Cancel sale
                  </button>
                </div>
              </div>
            ) : mode === 'confirm-delete' ? (
              <div
                role="alertdialog"
                aria-labelledby="delete-sale-title"
                className="rounded-lg border border-red-200 bg-red-50 p-3"
              >
                <p id="delete-sale-title" className="flex items-center gap-2 font-semibold text-red-800">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  Delete sale {order.orderNumber}?
                </p>
                <p className="mt-1 text-sm text-red-700">
                  {order.status === 'Cancelled'
                    ? 'Nothing goes back to stock because the sale is cancelled.'
                    : release
                      ? `${capitalize(release)}.`
                      : 'Nothing goes back to stock.'}
                </p>
                {deliveredWarning && <p className="mt-1 text-sm text-red-700">{deliveredWarning}</p>}
                {invoiceText && <p className="mt-1 text-sm text-red-700">{invoiceText}</p>}
                <p className="mt-1 text-sm text-red-700">This cannot be undone.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError('')
                      setMode('view')
                    }}
                    disabled={!!busy}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Keep sale
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={!!busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {busy === 'delete' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete sale
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Printer className="h-4 w-4" />
                  Print receipt
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError('')
                      setMode('confirm-delete')
                    }}
                    disabled={!!busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(order)}
                    disabled={!!busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}

export default SaleDetailsModal
