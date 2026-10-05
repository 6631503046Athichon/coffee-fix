import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Loader2, Pencil, Plus, Receipt, Search, Trash2, Users, X } from 'lucide-react'
import { UserRole } from '../../types'
import type { SaleOrder, SaleOrderStatus, User } from '../../types'
import { useDataContext } from '../../hooks/useDataContext'
import Select from '../common/Select'
import DatePicker from '../common/DatePicker'
import { csvDate, csvFilename, csvFixed, downloadCsv } from '../../utils/exportCSV'
import type { CsvCell } from '../../utils/exportCSV'
import { compareSalesNewestFirst } from '../../services/sales/saleOrderService'
import SaleOrderModal from './modals/SaleOrderModal'
import SaleDetailsModal from './modals/SaleDetailsModal'
import {
  BLUE_FOCUS,
  FIELD,
  FIELD_LABEL,
  ICON_BTN,
  ICON_BTN_DANGER,
  LABEL_TEXT,
  OUTLINE_BTN,
  PRIMARY_BTN,
  SALE_STATUSES,
  SALE_STATUS_STRIPE,
  SaleStatusChip,
  dateTrigger,
  describeLine,
  formatKg,
  formatMoney,
  formatSaleDate,
  lineKind,
  saleCustomerName,
  totalsByCurrency,
} from './saleDisplay'

type Panel =
  | { kind: 'create'; customerId?: string }
  | { kind: 'details'; orderId: string; mode?: 'view' | 'confirm-delete' }
  | { kind: 'edit'; orderId: string; from: 'row' | 'details' }
  | null

type StatusFilter = 'All' | SaleOrderStatus

const PAGE_SIZE = 20
const STATUS_FILTERS: StatusFilter[] = ['All', ...SALE_STATUSES]

const CSV_HEADERS = [
  'Sale #',
  'Date',
  'Status',
  'Customer',
  'Customer type',
  'Item',
  'Roast ID',
  'Roast date',
  'Roast level',
  'Green lot',
  'Grade',
  'Variety',
  'Process',
  'Kg',
  'Price per kg',
  'Line total',
  'Sale total',
  'Currency',
  'Notes',
]

const matchesSearch = (order: SaleOrder, query: string): boolean =>
  [
    order.orderNumber,
    saleCustomerName(order),
    order.notes,
    ...order.items.flatMap((item) => [
      item.roast?.label,
      item.lotGrade,
      item.roast?.variety,
      item.roast?.process,
      item.roast?.greenBeanLotDisplayId,
      item.green?.label,
      item.green?.variety,
      item.green?.process,
      item.green?.greenBeanLotDisplayId,
      item.roastBatchId ? undefined : 'green beans',
    ]),
  ].some((value) => !!value && value.toLowerCase().includes(query))

const itemsSummary = (order: SaleOrder): string[] => {
  const lines = order.items.slice(0, 2).map(describeLine)
  if (order.items.length > 2) lines.push(`+${order.items.length - 2} more`)
  return lines
}

// The status dot on each filter pill matches the stripe on the sale cards.
const STATUS_DOT: Record<SaleOrderStatus, string> = {
  Draft: 'bg-gray-400',
  Confirmed: 'bg-blue-500',
  Delivered: 'bg-green-500',
  Cancelled: 'bg-red-400',
}

const PAGER_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40'
const BOX = 'rounded-lg border border-gray-200 bg-white'

/** One summary figure, drawn like the KPI cards on the Parchment page. */
const SummaryTile: React.FC<{
  label: string
  stripe: string
  sub: string
  className?: string
  children: React.ReactNode
}> = ({ label, stripe, sub, className = '', children }) => (
  <div
    className={`min-w-0 rounded-md border border-gray-200 border-l-4 ${stripe} bg-white px-3 py-2.5 sm:px-4 sm:py-3 ${className}`}
  >
    <p className={LABEL_TEXT}>{label}</p>
    <div className="mt-1.5 font-bold leading-tight text-gray-900">{children}</div>
    <p className="mt-1 text-[10px] text-gray-400">{sub}</p>
  </div>
)

/** The edit and delete icons on a sale row or card; neither opens the row itself. */
const RowActions: React.FC<{
  orderNumber: string
  onEdit: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
}> = ({ orderNumber, onEdit, onDelete }) => (
  <div className="flex flex-shrink-0 items-center">
    <button
      type="button"
      onClick={onEdit}
      title="Edit sale"
      aria-label={`Edit sale ${orderNumber}`}
      className={ICON_BTN}
    >
      <Pencil className="h-4 w-4" />
    </button>
    <button
      type="button"
      onClick={onDelete}
      title="Delete sale"
      aria-label={`Delete sale ${orderNumber}`}
      className={ICON_BTN_DANGER}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  </div>
)

interface SalesLogProps {
  currentUser: User
}

const SalesLog: React.FC<SalesLogProps> = ({ currentUser }) => {
  const { data, saleOrdersStatus = 'ok', refreshData } = useDataContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = !!currentUser.isSuperAdmin || currentUser.roles.includes(UserRole.Admin)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState<StatusFilter>('All')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [panel, setPanel] = useState<Panel>(null)

  // The customer filter lives in the URL (?customer=<id>) so the customer
  // list can link straight to one customer's sales.
  const customerId = searchParams.get('customer') ?? ''
  const setCustomerId = (id: string) => {
    setPage(1)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('customer', id)
        else next.delete('customer')
        return next
      },
      { replace: true },
    )
  }

  // ?sale=<id> opens that sale's details once it is in the loaded list.
  const [deepLinkSaleId, setDeepLinkSaleId] = useState(() => searchParams.get('sale'))
  if (deepLinkSaleId) {
    if (data.saleOrders.some((o) => o.id === deepLinkSaleId)) {
      setDeepLinkSaleId(null)
      setPanel({ kind: 'details', orderId: deepLinkSaleId })
    } else if (saleOrdersStatus !== 'loading') {
      setDeepLinkSaleId(null)
    }
  }
  useEffect(() => {
    if (deepLinkSaleId || !searchParams.has('sale')) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('sale')
        return next
      },
      { replace: true },
    )
  }, [deepLinkSaleId, searchParams, setSearchParams])

  // Popups follow the live sale; if it is gone (deleted here or elsewhere), close.
  const panelOrder =
    panel && panel.kind !== 'create'
      ? (data.saleOrders.find((o) => o.id === panel.orderId) ?? null)
      : null
  if (panel && panel.kind !== 'create' && !panelOrder) {
    setPanel(null)
  }

  const customersById = useMemo(
    () => new Map(data.customers.map((c) => [c.id, c])),
    [data.customers],
  )

  const customerNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const order of data.saleOrders) {
      if (!names.has(order.customerId)) {
        names.set(order.customerId, customersById.get(order.customerId)?.name ?? saleCustomerName(order))
      }
    }
    if (customerId && !names.has(customerId)) {
      names.set(customerId, customersById.get(customerId)?.name ?? 'Unknown customer')
    }
    return names
  }, [data.saleOrders, customersById, customerId])

  const customerOptions = useMemo(
    () => [
      { value: '', label: 'All customers' },
      ...Array.from(customerNames, ([value, label]) => ({ value, label })).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    ],
    [customerNames],
  )
  const selectedCustomerName = customerId ? (customerNames.get(customerId) ?? '') : ''

  const sortedSales = useMemo(
    () => [...data.saleOrders].sort(compareSalesNewestFirst),
    [data.saleOrders],
  )

  const query = search.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      sortedSales.filter((order) => {
        if (from && order.orderDate < from) return false
        if (to && order.orderDate > to) return false
        if (customerId && order.customerId !== customerId) return false
        if (status !== 'All' && order.status !== status) return false
        if (query && !matchesSearch(order, query)) return false
        return true
      }),
    [sortedSales, from, to, customerId, status, query],
  )

  const counted = filtered.filter((o) => o.status !== 'Cancelled')
  const kgSold = counted.reduce(
    (sum, o) => sum + o.items.reduce((s, item) => s + item.quantity, 0),
    0,
  )
  // Green beans (lines not sold from a roast) are counted apart from roasted coffee.
  const greenKgSold = counted.reduce(
    (sum, o) => sum + o.items.reduce((s, item) => (item.roastBatchId ? s : s + item.quantity), 0),
    0,
  )
  const anyGreenCounted = counted.some((o) => o.items.some((item) => !item.roastBatchId))

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const filtersActive = !!(from || to || customerId || status !== 'All' || query)

  // From after To: swap them so the range still means what was meant.
  const changeFrom = (value: string) => {
    setPage(1)
    if (value && to && value > to) {
      setFrom(to)
      setTo(value)
    } else {
      setFrom(value)
    }
  }
  const changeTo = (value: string) => {
    setPage(1)
    if (value && from && value < from) {
      setTo(from)
      setFrom(value)
    } else {
      setTo(value)
    }
  }
  const changeStatus = (value: StatusFilter) => {
    setPage(1)
    setStatus(value)
  }
  const changeSearch = (value: string) => {
    setPage(1)
    setSearch(value)
  }
  const clearFilters = () => {
    setFrom('')
    setTo('')
    setStatus('All')
    setSearch('')
    setCustomerId('')
  }

  // Every filtered sale on every page, one row per sale line. With none,
  // downloadCsv says there is nothing to export.
  const handleExport = () => {
    const headers = isAdmin ? [...CSV_HEADERS, 'Roaster'] : CSV_HEADERS
    const rows: CsvCell[][] = []
    for (const order of filtered) {
      const sale: CsvCell[] = [
        order.orderNumber,
        csvDate(order.orderDate),
        order.status,
        saleCustomerName(order),
        order.customer?.type ?? '',
      ]
      const tail = (first: boolean): CsvCell[] => [
        first ? csvFixed(order.totalAmount, 2) : '',
        order.currency,
        order.notes ?? '',
        ...(isAdmin ? [order.creatorName ?? ''] : []),
      ]
      if (order.items.length === 0) {
        rows.push([...sale, ...Array<CsvCell>(11).fill(''), ...tail(true)])
        continue
      }
      order.items.forEach((item, index) => {
        const source = item.roast ?? item.green
        rows.push([
          ...sale,
          lineKind(item),
          item.roast?.label ?? '',
          csvDate(item.roast?.roastDate),
          item.roast?.roastLevel ?? '',
          item.roast?.greenBeanLotDisplayId ?? item.green?.greenBeanLotDisplayId ?? item.green?.label ?? '',
          item.lotGrade,
          source?.variety ?? '',
          source?.process ?? '',
          csvFixed(item.quantity, 3),
          csvFixed(item.pricePerKg, 2),
          csvFixed(item.subtotal, 2),
          ...tail(index === 0),
        ])
      })
    }
    const filename = csvFilename('sales', [
      from && `from-${from}`,
      to && `to-${to}`,
      selectedCustomerName || false,
      status !== 'All' && status,
      search.trim() && `search-${search.trim()}`,
    ])
    downloadCsv(filename, headers, rows)
  }

  const openDetails = (orderId: string) => setPanel({ kind: 'details', orderId })
  const rowKeyDown = (e: React.KeyboardEvent, orderId: string) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openDetails(orderId)
    }
  }
  const editRow = (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation()
    setPanel({ kind: 'edit', orderId, from: 'row' })
  }
  const deleteRow = (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation()
    setPanel({ kind: 'details', orderId, mode: 'confirm-delete' })
  }
  // Closing the sale form without saving goes back to where it was opened
  // from; after a save onSaved has already switched to the sale's details.
  const closeEditor = () =>
    setPanel((p) =>
      p?.kind === 'edit' && p.from === 'details'
        ? { kind: 'details', orderId: p.orderId }
        : p?.kind === 'details'
          ? p
          : null,
    )
  const showSaved = (saved: SaleOrder) => setPanel({ kind: 'details', orderId: saved.id })

  const onlyCustomerFilter = !!customerId && !from && !to && status === 'All' && !query

  // One customer and nothing else picked (as when the customer list's Sales
  // button opens the log) comes first, so a roaster with no sales at all still
  // gets the 'Sell to {name}' shortcut for that customer.
  const renderEmpty = () => {
    if (onlyCustomerFilter) {
      return (
        <div className="px-4 py-10 text-center">
          <p className="font-semibold text-gray-800">No sales for {selectedCustomerName} yet</p>
          <button
            type="button"
            onClick={() => setPanel({ kind: 'create', customerId })}
            className={`${PRIMARY_BTN} mt-3 max-w-full`}
            title={`Sell to ${selectedCustomerName}`}
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">Sell to {selectedCustomerName}</span>
          </button>
        </div>
      )
    }
    if (data.saleOrders.length === 0) {
      return (
        <div className="px-4 py-10 text-center">
          <Receipt className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 font-semibold text-gray-800">No sales yet</p>
          <p className="text-sm text-gray-500">Record a sale of roasted coffee or green beans to a customer.</p>
          <button
            type="button"
            onClick={() => setPanel({ kind: 'create', customerId: customerId || undefined })}
            className={`${PRIMARY_BTN} mt-3`}
          >
            <Plus className="h-4 w-4" />
            New sale
          </button>
        </div>
      )
    }
    return (
      <div className="px-4 py-10 text-center">
        <p className="font-semibold text-gray-800">No sales match these filters</p>
        <button type="button" onClick={clearFilters} className={`${OUTLINE_BTN} mt-3`}>
          Clear filters
        </button>
      </div>
    )
  }

  const noRowsYet = data.saleOrders.length === 0

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex-shrink-0 rounded-lg bg-blue-600 p-2">
              <Receipt className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Sales</h1>
              <p className="mt-0.5 text-xs text-gray-500">Coffee you have sold</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/customers')}
              className={`${OUTLINE_BTN} flex-1 sm:flex-none`}
            >
              <Users className="h-4 w-4" />
              Customers
            </button>
            <button type="button" onClick={handleExport} className={`${OUTLINE_BTN} flex-1 sm:flex-none`}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            {/* When the log is narrowed to one customer, a new sale starts with that customer. */}
            <button
              type="button"
              onClick={() => setPanel({ kind: 'create', customerId: customerId || undefined })}
              className={`${PRIMARY_BTN} flex-1 sm:flex-none`}
            >
              <Plus className="h-4 w-4" />
              New sale
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={`${BOX} p-3`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div role="group" aria-labelledby="sales-from-label" className="min-w-0">
            <span id="sales-from-label" className={FIELD_LABEL}>
              From
            </span>
            <DatePicker
              value={from}
              onChange={changeFrom}
              placeholder="Any date"
              triggerClassName={dateTrigger(BLUE_FOCUS)}
            />
          </div>
          <div role="group" aria-labelledby="sales-to-label" className="min-w-0">
            <span id="sales-to-label" className={FIELD_LABEL}>
              To
            </span>
            <DatePicker
              value={to}
              onChange={changeTo}
              placeholder="Any date"
              triggerClassName={dateTrigger(BLUE_FOCUS)}
            />
          </div>
          <div role="group" aria-labelledby="sales-customer-label" className="min-w-0 text-sm">
            <span id="sales-customer-label" className={FIELD_LABEL}>
              Customer
            </span>
            <Select
              options={customerOptions}
              value={customerId}
              onChange={(v) => setCustomerId(v ? String(v) : '')}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="sales-search" className={FIELD_LABEL}>
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="sales-search"
                type="search"
                value={search}
                onChange={(e) => changeSearch(e.target.value)}
                placeholder="Sale #, customer, roast, grade…"
                className={`${FIELD} border-gray-300 pl-9 ${BLUE_FOCUS}`}
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((value) => {
              const on = status === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => changeStatus(value)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    on
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {value !== 'All' && (
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-white' : STATUS_DOT[value]}`}
                    />
                  )}
                  {value}
                </button>
              )
            })}
          </div>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Totals (cancelled sales left out) */}
      {!noRowsYet && (
        <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryTile
            label="Sales"
            stripe="border-l-blue-500"
            sub={filtersActive ? 'Matching the filters' : 'All sales'}
          >
            <span className="text-2xl/tight tabular-nums" data-testid="totals-count">
              {counted.length}
            </span>
          </SummaryTile>
          <SummaryTile
            label="Kg sold"
            stripe="border-l-amber-500"
            sub={anyGreenCounted ? 'Green beans are counted apart' : 'Roasted coffee'}
          >
            {/* Green beans are not added to roasted coffee: they are counted
                apart, one line each (read out as "6 roasted · 5 green"). */}
            <span data-testid="totals-kg">
              {anyGreenCounted ? (
                <>
                  <span className="block">
                    <span className="text-xl/tight tabular-nums">{formatKg(kgSold - greenKgSold)}</span>
                    <span className="text-sm font-medium text-gray-400"> roasted</span>
                  </span>
                  <span className="sr-only"> · </span>
                  <span className="block">
                    <span className="text-xl/tight tabular-nums">{formatKg(greenKgSold)}</span>
                    <span className="text-sm font-medium text-gray-400"> green</span>
                  </span>
                </>
              ) : (
                <span className="text-2xl/tight tabular-nums">{formatKg(kgSold)}</span>
              )}
            </span>
            {!anyGreenCounted && <span className="text-sm font-medium text-gray-400"> kg</span>}
          </SummaryTile>
          <SummaryTile
            label="Total"
            stripe="border-l-green-500"
            sub="Cancelled sales are not counted"
            className="col-span-2"
          >
            <span className="break-words text-xl/tight tabular-nums sm:text-2xl/tight" data-testid="totals-money">
              {totalsByCurrency(counted) || '—'}
            </span>
          </SummaryTile>
        </section>
      )}

      {/* List */}
      {noRowsYet && saleOrdersStatus === 'loading' ? (
        <div className={`${BOX} flex items-center justify-center gap-2 px-4 py-10 text-sm text-gray-500`}>
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          Loading sales…
        </div>
      ) : noRowsYet && saleOrdersStatus === 'failed' ? (
        <div className={`${BOX} px-4 py-10 text-center`}>
          <p className="font-semibold text-gray-800">Couldn&apos;t load sales</p>
          <button type="button" onClick={() => void refreshData()} className={`${OUTLINE_BTN} mt-3`}>
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className={BOX}>{renderEmpty()}</div>
      ) : (
        <>
          {/* Wide screens (xl, 1280px+): table. Date and status sit with the
              sale number so the items keep room to read. */}
          <div className={`${BOX} hidden overflow-hidden xl:block`}>
            <div className="overflow-x-auto">
              <table aria-label="Sales" className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="border-l-4 border-l-transparent px-3 py-2">Sale</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Items</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageRows.map((order) => {
                    const cancelled = order.status === 'Cancelled'
                    return (
                      <tr
                        key={order.id}
                        tabIndex={0}
                        onClick={() => openDetails(order.id)}
                        onKeyDown={(e) => rowKeyDown(e, order.id)}
                        aria-label={`Sale ${order.orderNumber}`}
                        className={`cursor-pointer align-top hover:bg-gray-50 focus:bg-blue-50 focus:outline-none ${
                          cancelled ? 'text-gray-400' : 'text-gray-800'
                        }`}
                      >
                        {/* The status shows as the row's left stripe, as on the cards. */}
                        <td
                          className={`whitespace-nowrap border-l-4 px-3 py-2.5 ${
                            SALE_STATUS_STRIPE[order.status] ?? SALE_STATUS_STRIPE.Draft
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${cancelled ? '' : 'text-gray-900'}`}>
                              {order.orderNumber}
                            </span>
                            <SaleStatusChip status={order.status} />
                          </div>
                          <p className="mt-0.5 text-xs text-gray-500">{formatSaleDate(order.orderDate)}</p>
                        </td>
                        <td className="min-w-[8rem] px-3 py-2.5">
                          <p className="font-medium">{saleCustomerName(order)}</p>
                          {isAdmin && order.creatorName && (
                            <p className="text-xs text-gray-500">by {order.creatorName}</p>
                          )}
                        </td>
                        <td className="min-w-[13rem] px-3 py-2.5 text-[13px] leading-snug">
                          {itemsSummary(order).map((line, i) => (
                            <p key={i} className={cancelled ? '' : 'text-gray-600'}>
                              {line}
                            </p>
                          ))}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${
                            cancelled ? 'line-through' : 'text-gray-900'
                          }`}
                        >
                          {formatMoney(order.totalAmount, order.currency)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right">
                          <div className="inline-flex">
                            <RowActions
                              orderNumber={order.orderNumber}
                              onEdit={(e) => editRow(e, order.id)}
                              onDelete={(e) => deleteRow(e, order.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Below xl (phones, tablets, 1024px laptops): cards with the status
              as the left stripe, like the cards on the Workbench. */}
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:hidden" aria-label="Sales">
            {pageRows.map((order) => {
              const cancelled = order.status === 'Cancelled'
              const customer = saleCustomerName(order)
              return (
                <li
                  key={order.id}
                  tabIndex={0}
                  onClick={() => openDetails(order.id)}
                  onKeyDown={(e) => rowKeyDown(e, order.id)}
                  aria-label={`Sale ${order.orderNumber}, ${customer}, ${formatMoney(order.totalAmount, order.currency)}`}
                  className={`min-w-0 cursor-pointer rounded-lg border border-gray-200 border-l-4 bg-white p-3 text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    SALE_STATUS_STRIPE[order.status] ?? SALE_STATUS_STRIPE.Draft
                  } ${cancelled ? 'text-gray-400' : 'text-gray-800'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                      <span
                        className={`truncate font-semibold ${cancelled ? '' : 'text-gray-900'}`}
                        title={order.orderNumber}
                      >
                        {order.orderNumber}
                      </span>
                      <SaleStatusChip status={order.status} />
                    </div>
                    <div className="-mr-1.5 -mt-1">
                      <RowActions
                        orderNumber={order.orderNumber}
                        onEdit={(e) => editRow(e, order.id)}
                        onDelete={(e) => deleteRow(e, order.id)}
                      />
                    </div>
                  </div>
                  <p className="mt-1 truncate font-medium" title={customer}>
                    {customer}
                    {isAdmin && order.creatorName && (
                      <span className="text-xs font-normal text-gray-500"> · by {order.creatorName}</span>
                    )}
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {itemsSummary(order).map((line, i) => (
                      <p key={i} className={`truncate text-xs ${cancelled ? '' : 'text-gray-500'}`} title={line}>
                        {line}
                      </p>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                    <span className="flex-shrink-0 text-xs text-gray-500">{formatSaleDate(order.orderDate)}</span>
                    <span
                      className={`truncate font-bold tabular-nums ${cancelled ? 'line-through' : 'text-gray-900'}`}
                    >
                      {formatMoney(order.totalAmount, order.currency)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>

          {pageCount > 1 && (
            <div className={`${BOX} flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-600`}>
              <span className="tabular-nums">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of{' '}
                {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  className={PAGER_BUTTON}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 tabular-nums">
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === pageCount}
                  aria-label="Next page"
                  className={PAGER_BUTTON}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {panel?.kind === 'create' && (
        <SaleOrderModal
          isOpen
          initialCustomerId={panel.customerId}
          onClose={closeEditor}
          onSaved={showSaved}
        />
      )}
      {panel?.kind === 'edit' && panelOrder && (
        <SaleOrderModal
          key={panelOrder.id}
          isOpen
          order={panelOrder}
          onClose={closeEditor}
          onSaved={showSaved}
        />
      )}
      {panel?.kind === 'details' && panelOrder && (
        <SaleDetailsModal
          key={panelOrder.id}
          order={panelOrder}
          initialMode={panel.mode}
          onClose={() => setPanel(null)}
          onEdit={(o) => setPanel({ kind: 'edit', orderId: o.id, from: 'details' })}
        />
      )}
    </div>
  )
}

export default SalesLog
