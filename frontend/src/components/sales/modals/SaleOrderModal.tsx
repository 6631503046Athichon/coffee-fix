import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react'
import { UserRole } from '../../../types'
import type { RoastSaleSummary, SaleOrder, SellableRoast } from '../../../types'
import Modal from '../../common/Modal'
import Select from '../../common/Select'
import DatePicker from '../../common/DatePicker'
import { useDataContext } from '../../../hooks/useDataContext'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import {
  applySaleChange,
  createSaleOrder,
  getSellableRoasts,
  updateSaleOrder,
} from '../../../services/sales/saleOrderService'
import type { SaleLineInput } from '../../../services/sales/saleOrderService'
import {
  MAX_SALE_LINES,
  SALE_CURRENCIES,
  describeLine,
  describeRoastOption,
  formatKg,
  formatMoney,
  formatSaleDate,
  round2,
  todayLocal,
} from '../saleDisplay'

export interface SaleOrderModalProps {
  isOpen: boolean
  /** Edit this sale; leave out to record a new one. */
  order?: SaleOrder | null
  initialCustomerId?: string
  onClose: () => void
  /** Called after the sale is saved and merged into the app data, before the popup closes. */
  onSaved?: (saleOrder: SaleOrder) => void
}

interface LineDraft {
  key: string
  roastBatchId: string
  kg: string
  price: string
  /** The price came from an earlier sale (or is empty), so picking another roast or currency may replace it. */
  priceAuto: boolean
}

type SellableState =
  | { status: 'loading' }
  | { status: 'ok'; roasts: SellableRoast[]; missingWeightCount: number }
  | { status: 'failed'; message: string }

const STALE_SALE = /changed or removed by someone else/
const SALE_NOT_FOUND = /^Sale not found$/
const KG_EPSILON = 1e-6
// The server's limits for one sale line (lib/validations/sales.ts).
const MIN_LINE_KG = 0.001
const MAX_LINE_KG = 100000
const MAX_PRICE_PER_KG = 1000000

let lineCounter = 0
const newLine = (): LineDraft => ({
  key: `line-${++lineCounter}`,
  roastBatchId: '',
  kg: '',
  price: '',
  priceAuto: true,
})

/** Plain decimal like '2.5' or '.75'; anything else is NaN. */
const parseDecimal = (text: string): number => {
  const trimmed = text.trim()
  return /^(\d+(\.\d*)?|\.\d+)$/.test(trimmed) ? Number(trimmed) : Number.NaN
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

const inputClass = (hasError: boolean) =>
  `block w-full rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
  }`

const SaleOrderModal: React.FC<SaleOrderModalProps> = ({ isOpen, ...props }) =>
  isOpen ? <SaleOrderForm {...props} /> : null

// Mounted only while open, so every open starts from a fresh form.
const SaleOrderForm: React.FC<Omit<SaleOrderModalProps, 'isOpen'>> = ({
  order,
  initialCustomerId,
  onClose,
  onSaved,
}) => {
  const { data, setData, refreshData, setIsEditing } = useDataContext()
  const { currentUser } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()

  const isAdmin =
    !!currentUser && (!!currentUser.isSuperAdmin || currentUser.roles.includes(UserRole.Admin))
  const isLegacy = !!order && order.items.some((item) => !item.roastBatchId)
  const titleId = 'sale-order-modal-title'

  // Pause the app's auto-refresh while the form is open.
  useEffect(() => {
    setIsEditing(true)
    return () => setIsEditing(false)
  }, [setIsEditing])

  // An admin editing a roaster's sale picks from that roaster's roasts.
  const roasterId = isAdmin && order ? order.createdBy : undefined
  const [reloadKey, setReloadKey] = useState(0)
  const [sellable, setSellable] = useState<SellableState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    getSellableRoasts(roasterId).then(
      (result) => {
        if (!cancelled) setSellable({ status: 'ok', ...result })
      },
      (err: unknown) => {
        if (!cancelled) {
          setSellable({ status: 'failed', message: err instanceof Error ? err.message : '' })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [roasterId, reloadKey])

  const retryLoad = () => {
    setSellable({ status: 'loading' })
    setReloadKey((k) => k + 1)
  }

  // Preselect the given customer only when the picker can show it, so the
  // popup never submits a customer the user cannot see.
  const [customerId, setCustomerId] = useState(
    () =>
      order?.customerId ??
      (initialCustomerId && data.customers.some((c) => c.id === initialCustomerId)
        ? initialCustomerId
        : ''),
  )
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? todayLocal())
  const [currency, setCurrency] = useState(() => {
    if (order) return order.currency
    const lastOwn = data.saleOrders.find((o) => !currentUser || o.createdBy === currentUser.id)
    return lastOwn && SALE_CURRENCIES.includes(lastOwn.currency) ? lastOwn.currency : 'THB'
  })
  const [lines, setLines] = useState<LineDraft[]>(() =>
    order && !isLegacy
      ? order.items.map((item) => ({
          key: item.id,
          roastBatchId: item.roastBatchId ?? '',
          kg: formatKg(item.quantity),
          price: String(item.pricePerKg),
          priceAuto: false,
        }))
      : [newLine()],
  )
  const [notes, setNotes] = useState(order?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const customerOptions = useMemo(() => {
    const options = [...data.customers]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ value: c.id, label: `${c.name} (${c.type})` }))
    // Keep the sale's own customer choosable even if the list has not caught up.
    if (order && !options.some((o) => o.value === order.customerId)) {
      options.unshift({ value: order.customerId, label: order.customerName })
    }
    return options
  }, [data.customers, order])

  // kg this sale already holds per roast; it counts towards what a line may take.
  const ownReserved = useMemo(() => {
    const held = new Map<string, number>()
    if (order && order.status !== 'Cancelled') {
      for (const item of order.items) {
        if (item.roastBatchId) {
          held.set(item.roastBatchId, round3((held.get(item.roastBatchId) ?? 0) + item.quantity))
        }
      }
    }
    return held
  }, [order])

  // Sellable roasts (freshest numbers), then this sale's own roasts that are sold out.
  const roastOptions = useMemo(() => {
    const list: RoastSaleSummary[] = sellable.status === 'ok' ? [...sellable.roasts] : []
    const seen = new Set(list.map((r) => r.id))
    for (const item of order?.items ?? []) {
      if (item.roastBatchId && item.roast && !seen.has(item.roastBatchId)) {
        list.push(item.roast)
        seen.add(item.roastBatchId)
      }
    }
    return list
  }, [sellable, order])
  const roastById = useMemo(() => new Map(roastOptions.map((r) => [r.id, r])), [roastOptions])
  // Free kg per roast, from the sellable list only. A roast missing from it
  // has nothing left (the server lists every roast with any kg free); the copy
  // inside this sale (item.roast) came with the sale list and goes stale as
  // soon as another sale takes from the same roast, so it only labels the
  // option. The lines are shown only once the list has loaded.
  const freeKgById = useMemo(
    () =>
      new Map(sellable.status === 'ok' ? sellable.roasts.map((r) => [r.id, r.availableKg]) : []),
    [sellable],
  )

  const maxKgFor = (roastBatchId: string): number =>
    round3((freeKgById.get(roastBatchId) ?? 0) + (ownReserved.get(roastBatchId) ?? 0))
  // A cancelled sale holds no stock, so its lines are not limited.
  const limitKg = !order || order.status !== 'Cancelled'

  const optionLabel = (roast: RoastSaleSummary) =>
    `${[roast.label, formatSaleDate(roast.roastDate), describeRoastOption(roast), roast.roastLevel ?? 'No level']
      .filter(Boolean)
      .join(' · ')} — ${formatKg(maxKgFor(roast.id))} kg left`

  // Price per kg of the newest earlier line in this currency: same roast first, then same green lot.
  const prefillPrice = (roastBatchId: string, cur: string): string => {
    const lotId = roastById.get(roastBatchId)?.greenBeanLotId
    let byLot: number | undefined
    for (const sale of data.saleOrders) {
      if (sale.currency !== cur) continue
      for (const item of sale.items) {
        if (item.roastBatchId === roastBatchId) return String(item.pricePerKg)
        if (byLot === undefined && lotId && item.greenBeanLotId === lotId) byLot = item.pricePerKg
      }
    }
    return byLot === undefined ? '' : String(byLot)
  }

  const updateLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  const chooseRoast = (key: string, roastBatchId: string) =>
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line
        const replacePrice = line.priceAuto || line.price.trim() === ''
        return replacePrice
          ? { ...line, roastBatchId, price: prefillPrice(roastBatchId, currency), priceAuto: true }
          : { ...line, roastBatchId }
      }),
    )

  const chooseCurrency = (next: string) => {
    setCurrency(next)
    setLines((prev) =>
      prev.map((line) =>
        line.roastBatchId && (line.priceAuto || line.price.trim() === '')
          ? { ...line, price: prefillPrice(line.roastBatchId, next), priceAuto: true }
          : line,
      ),
    )
  }

  // ---- validation -------------------------------------------------------

  const today = todayLocal()
  const dateError = !orderDate
    ? 'Choose a sale date'
    : orderDate > today
      ? 'Sale date cannot be in the future'
      : ''
  const customerError = customerId ? '' : 'Choose a customer'

  const lineChecks = lines.map((line, index) => {
    // Rounded the way the server records them (kg to the gram, price to 2
    // decimals), so the checks, the subtotals and the payload all match the
    // amounts the sale is saved with.
    const rawKg = parseDecimal(line.kg)
    const rawPrice = parseDecimal(line.price)
    const kg = Number.isFinite(rawKg) ? round3(rawKg) : rawKg
    const price = Number.isFinite(rawPrice) ? round2(rawPrice) : rawPrice
    const max = line.roastBatchId ? maxKgFor(line.roastBatchId) : 0
    const label = roastById.get(line.roastBatchId)?.label ?? 'this roast'
    const duplicate =
      !!line.roastBatchId && lines.some((l, i) => i < index && l.roastBatchId === line.roastBatchId)
    const overMax =
      limitKg && !!line.roastBatchId && Number.isFinite(kg) && kg > max + KG_EPSILON
    return {
      kg,
      price,
      roast: !line.roastBatchId
        ? 'Choose a roast'
        : duplicate
          ? 'This roast is already on another line'
          : '',
      kgError: overMax
        ? `Only ${formatKg(max)} kg of ${label} left`
        : !line.kg.trim()
          ? 'Enter the kg sold'
          : !Number.isFinite(kg) || rawKg <= 0
            ? 'Kg must be more than 0'
            : kg < MIN_LINE_KG
              ? 'Kg must be at least 0.001'
              : kg > MAX_LINE_KG
                ? 'Kg must be 100000 or less'
                : '',
      overMax,
      priceError: !line.price.trim()
        ? 'Enter a price per kg'
        : !Number.isFinite(price) || price < 0
          ? 'Price must be 0 or more'
          : price > MAX_PRICE_PER_KG
            ? 'Price per kg is too large'
            : '',
    }
  })

  const noRoastsAtAll = !isLegacy && sellable.status === 'ok' && roastOptions.length === 0
  const linesReady = isLegacy || (sellable.status === 'ok' && !noRoastsAtAll)
  const linesInvalid =
    !isLegacy && lineChecks.some((c) => c.roast || c.kgError || c.priceError)
  const blocked = !!dateError || !!customerError || !linesReady || linesInvalid

  const total = isLegacy
    ? order?.totalAmount ?? 0
    : round2(
        lineChecks.reduce(
          (sum, c) =>
            Number.isFinite(c.kg) && Number.isFinite(c.price) ? sum + round2(c.kg * c.price) : sum,
          0,
        ),
      )

  // ---- submit -----------------------------------------------------------

  const close = () => {
    if (!saving) onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSubmitted(true)
    if (blocked) return
    setSaving(true)
    setError('')
    const items: SaleLineInput[] | undefined = isLegacy
      ? undefined
      : lines.map((line, i) => ({
          roastBatchId: line.roastBatchId,
          quantity: lineChecks[i].kg,
          pricePerKg: lineChecks[i].price,
        }))
    const base = { customerId, orderDate, currency, notes: notes.trim() || null }
    try {
      const result = order
        ? await updateSaleOrder(order.id, {
            ...base,
            ...(items ? { items } : {}),
            expectedUpdatedAt: order.updatedAt,
          })
        : await createSaleOrder({ ...base, items: items ?? [] })
      setData((prev) =>
        applySaleChange(prev, {
          upsert: result.saleOrder,
          affectedRoastBatches: result.affectedRoastBatches,
        }),
      )
      addToast({
        type: 'success',
        message: `Sale ${result.saleOrder.orderNumber} ${order ? 'updated' : 'recorded'}`,
      })
      onSaved?.(result.saleOrder)
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      if (STALE_SALE.test(message) || SALE_NOT_FOUND.test(message)) {
        await refreshData()
        addToast({ type: 'warning', message })
        onClose()
        return
      }
      setError(message || 'Could not save the sale. Please try again.')
      setSaving(false)
    }
  }

  // ---- render -----------------------------------------------------------

  const fieldLabel = 'block text-xs font-semibold text-gray-600 mb-1'
  const missingWeightCount = sellable.status === 'ok' ? sellable.missingWeightCount : 0

  return (
    <Modal
      isOpen
      onClose={close}
      maxWidth="2xl"
      showCloseButton={false}
      ariaLabelledBy={titleId}
      className="!p-5 !rounded-xl"
      mobileFullScreen
    >
      {/* On phones the popup is a full-screen sheet: the form fills it so the
          footer sits at the bottom even when the form is short. */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col max-sm:min-h-[calc(100dvh-2rem)]"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {order ? `Edit sale ${order.orderNumber}` : 'Sell roasted coffee'}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3">
          {/* Customer */}
          <div role="group" aria-labelledby="sale-customer-label">
            <span id="sale-customer-label" className={fieldLabel}>
              Customer
            </span>
            {data.customers.length === 0 && !order ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-700">No customers yet</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate('/customers')
                  }}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Go to Customers
                </button>
              </div>
            ) : (
              <Select
                options={customerOptions}
                value={customerId || null}
                onChange={(v) => setCustomerId(v ? String(v) : '')}
                placeholder="Choose a customer"
              />
            )}
            {submitted && customerError && (
              <p className="mt-1 text-xs text-red-600">{customerError}</p>
            )}
          </div>

          {/* Date and currency */}
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <div role="group" aria-labelledby="sale-date-label">
              <span id="sale-date-label" className={fieldLabel}>
                Sale date
              </span>
              <DatePicker value={orderDate} onChange={setOrderDate} />
              {dateError && <p className="mt-1 text-xs text-red-600">{dateError}</p>}
            </div>
            <div role="group" aria-labelledby="sale-currency-label">
              <span id="sale-currency-label" className={fieldLabel}>
                Currency
              </span>
              <Select
                options={SALE_CURRENCIES}
                value={currency}
                onChange={(v) => chooseCurrency(v ? String(v) : 'THB')}
              />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className={fieldLabel}>Roasted coffee</span>
              {!isLegacy && linesReady && (
                <span className="text-xs text-gray-400">
                  {lines.length} / {MAX_SALE_LINES} lines
                </span>
              )}
            </div>

            {missingWeightCount > 0 && (
              <p className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  {missingWeightCount === 1
                    ? "1 older roast has no roasted weight and can't be sold until it is added in the Roast Logbook."
                    : `${missingWeightCount} older roasts have no roasted weight and can't be sold until it is added in the Roast Logbook.`}
                </span>
              </p>
            )}

            {isLegacy && order ? (
              <div className="rounded-lg border border-gray-200">
                <p className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Lines recorded before roast sales can&apos;t be edited.
                </p>
                <ul className="divide-y divide-gray-100 text-sm">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3 px-3 py-2">
                      <span className="text-gray-700">{describeLine(item)}</span>
                      <span className="whitespace-nowrap tabular-nums text-gray-900">
                        {formatMoney(item.subtotal, order.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : sellable.status === 'loading' ? (
              <p className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                Loading your roasts…
              </p>
            ) : sellable.status === 'failed' ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                <span>Couldn&apos;t load your roasts. {sellable.message}</span>
                <button
                  type="button"
                  onClick={retryLoad}
                  className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  Retry
                </button>
              </div>
            ) : noRoastsAtAll ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
                <p>
                  No roasted coffee left to sell. Log a roast with its roasted weight in the Roaster
                  Workbench.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate('/roaster')
                  }}
                  className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Go to Roaster Workbench
                </button>
              </div>
            ) : (
              <>
                <ol className="space-y-2">
                  {lines.map((line, index) => {
                    const check = lineChecks[index]
                    const kgId = `${line.key}-kg`
                    const priceId = `${line.key}-price`
                    const showKgError = check.overMax || (submitted && !!check.kgError)
                    const lineOptions = roastOptions.map((roast) => ({
                      value: roast.id,
                      label: optionLabel(roast),
                      disabled: lines.some(
                        (other) => other.key !== line.key && other.roastBatchId === roast.id,
                      ),
                    }))
                    const subtotal =
                      Number.isFinite(check.kg) && Number.isFinite(check.price)
                        ? round2(check.kg * check.price)
                        : 0
                    return (
                      <li key={line.key} className="rounded-lg border border-gray-200 p-2.5">
                        <div className="flex items-start gap-2">
                          <div
                            className="min-w-0 flex-1 text-sm"
                            role="group"
                            aria-label={`Roast for line ${index + 1}`}
                          >
                            <Select
                              options={lineOptions}
                              value={line.roastBatchId || null}
                              onChange={(v) => chooseRoast(line.key, v ? String(v) : '')}
                              placeholder="Choose a roast"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setLines((prev) => prev.filter((l) => l.key !== line.key))
                            }
                            disabled={lines.length === 1}
                            aria-label={`Remove line ${index + 1}`}
                            className="mt-1.5 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {submitted && check.roast && (
                          <p className="mt-1 text-xs text-red-600">{check.roast}</p>
                        )}
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <div>
                            <label htmlFor={kgId} className="mb-0.5 block text-xs text-gray-500">
                              Kg
                            </label>
                            <input
                              id={kgId}
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder="0.000"
                              value={line.kg}
                              onChange={(e) => updateLine(line.key, { kg: e.target.value })}
                              aria-invalid={showKgError}
                              className={inputClass(showKgError)}
                            />
                          </div>
                          <div>
                            <label htmlFor={priceId} className="mb-0.5 block text-xs text-gray-500">
                              Price / kg
                            </label>
                            <input
                              id={priceId}
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder="0.00"
                              value={line.price}
                              onChange={(e) =>
                                updateLine(line.key, { price: e.target.value, priceAuto: false })
                              }
                              aria-invalid={submitted && !!check.priceError}
                              className={inputClass(submitted && !!check.priceError)}
                            />
                          </div>
                          <div>
                            <span className="mb-0.5 block text-xs text-gray-500">Subtotal</span>
                            <p className="truncate py-1.5 text-right text-sm font-semibold tabular-nums text-gray-900">
                              {subtotal.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                          </div>
                        </div>
                        {showKgError && <p className="mt-1 text-xs text-red-600">{check.kgError}</p>}
                        {submitted && check.priceError && (
                          <p className="mt-1 text-xs text-red-600">{check.priceError}</p>
                        )}
                      </li>
                    )
                  })}
                </ol>
                <button
                  type="button"
                  onClick={() => setLines((prev) => [...prev, newLine()])}
                  disabled={lines.length >= MAX_SALE_LINES}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add roast
                </button>
              </>
            )}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="sale-notes" className={fieldLabel}>
              Notes
            </label>
            <textarea
              id="sale-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Delivery, payment or anything else about this sale"
              className="block w-full resize-none rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="sticky bottom-0 mt-4 border-t border-gray-200 bg-white pt-3 shadow-[0_1.25rem_0_0_#fff]">
          {error && (
            <p
              role="alert"
              className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
            >
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total</p>
              <p className="truncate text-base font-bold tabular-nums text-gray-900" data-testid="sale-total">
                {formatMoney(total, currency)}
              </p>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {order ? 'Save changes' : 'Record sale'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default SaleOrderModal
