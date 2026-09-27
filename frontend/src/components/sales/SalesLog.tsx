import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Loader2, Pencil, Plus, Receipt, Search, Trash2, Users } from 'lucide-react'
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
  SALE_STATUSES,
  SaleStatusChip,
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

const outlineButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'
const primaryButton =
  'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700'
const rowEditButton =
  'inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50'
const rowDeleteButton =
  'inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50'

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

  // Every filtered sale on every page, one row per sale line.
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
            className={`${primaryButton} mt-3`}
          >
            <Plus className="h-4 w-4" />
            Sell to {selectedCustomerName}
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
            className={`${primaryButton} mt-3`}
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
        <button type="button" onClick={clearFilters} className={`${outlineButton} mt-3`}>
          Clear filters
        </button>
      </div>
    )
  }

  const noRowsYet = data.saleOrders.length === 0

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-600 p-2">
              <Receipt className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Sales</h1>
              <p className="text-sm text-gray-500">Coffee you have sold</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/customers')} className={outlineButton}>
              <Users className="h-4 w-4" />
              Customers
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={filtered.length === 0}
              className={outlineButton}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            {/* When the log is narrowed to one customer, a new sale starts with that customer. */}
            <button
              type="button"
              onClick={() => setPanel({ kind: 'create', customerId: customerId || undefined })}
              className={primaryButton}
            >
              <Plus className="h-4 w-4" />
              New sale
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div role="group" aria-labelledby="sales-from-label">
            <span id="sales-from-label" className="mb-1 block text-xs font-semibold text-gray-600">
              From
            </span>
            <DatePicker value={from} onChange={changeFrom} placeholder="Any date" />
          </div>
          <div role="group" aria-labelledby="sales-to-label">
            <span id="sales-to-label" className="mb-1 block text-xs font-semibold text-gray-600">
              To
            </span>
            <DatePicker value={to} onChange={changeTo} placeholder="Any date" />
          </div>
          <div role="group" aria-labelledby="sales-customer-label">
            <span id="sales-customer-label" className="mb-1 block text-xs font-semibold text-gray-600">
              Customer
            </span>
            <Select
              options={customerOptions}
              value={customerId}
              onChange={(v) => setCustomerId(v ? String(v) : '')}
            />
          </div>
          <div>
            <label htmlFor="sales-search" className="mb-1 block text-xs font-semibold text-gray-600">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="sales-search"
                type="search"
                value={search}
                onChange={(e) => changeSearch(e.target.value)}
                placeholder="Sale #, customer, roast, grade…"
                className="block w-full rounded-lg border border-gray-300 py-2.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => changeStatus(value)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  status === value
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto text-xs font-semibold text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Totals (cancelled sales left out) */}
      {!noRowsYet && (
        <div
          aria-label="Totals"
          className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          <span>
            <span className="text-gray-500">Sales</span>{' '}
            <span className="font-semibold text-gray-900" data-testid="totals-count">
              {counted.length}
            </span>
          </span>
          <span>
            <span className="text-gray-500">Kg sold</span>{' '}
            <span className="font-semibold text-gray-900" data-testid="totals-kg">
              {anyGreenCounted
                ? `${formatKg(kgSold - greenKgSold)} roasted · ${formatKg(greenKgSold)} green`
                : formatKg(kgSold)}
            </span>
          </span>
          <span>
            <span className="text-gray-500">Total</span>{' '}
            <span className="font-semibold text-gray-900" data-testid="totals-money">
              {totalsByCurrency(counted) || '—'}
            </span>
          </span>
          <span className="text-xs text-gray-400 sm:ml-auto">Cancelled sales are not counted</span>
        </div>
      )}

      {/* List */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {noRowsYet && saleOrdersStatus === 'loading' ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            Loading sales…
          </div>
        ) : noRowsYet && saleOrdersStatus === 'failed' ? (
          <div className="px-4 py-10 text-center">
            <p className="font-semibold text-gray-800">Couldn&apos;t load sales</p>
            <button type="button" onClick={() => void refreshData()} className={`${outlineButton} mt-3`}>
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          renderEmpty()
        ) : (
          <>
            {/* Wide screens (xl, 1280px+): table. Date and status sit with the
                sale number so the items keep room to read. */}
            <div className="hidden overflow-x-auto xl:block">
              <table aria-label="Sales" className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Sale</th>
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
                        <td className="whitespace-nowrap px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{order.orderNumber}</span>
                            <SaleStatusChip status={order.status} />
                          </div>
                          <p className="text-xs text-gray-500">{formatSaleDate(order.orderDate)}</p>
                        </td>
                        <td className="min-w-[8rem] px-3 py-2">
                          <p>{saleCustomerName(order)}</p>
                          {isAdmin && order.creatorName && (
                            <p className="text-xs text-gray-500">by {order.creatorName}</p>
                          )}
                        </td>
                        <td className="min-w-[13rem] px-3 py-2 text-[13px] leading-snug">
                          {itemsSummary(order).map((line, i) => (
                            <p key={i} className={cancelled ? '' : 'text-gray-600'}>
                              {line}
                            </p>
                          ))}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                          {formatMoney(order.totalAmount, order.currency)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <div className="inline-flex gap-1.5">
                            <button type="button" onClick={(e) => editRow(e, order.id)} className={rowEditButton}>
                              <Pencil className="h-3 w-3" />
                              Edit
                            </button>
                            <button type="button" onClick={(e) => deleteRow(e, order.id)} className={rowDeleteButton}>
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Below xl (phones, tablets, 1024px laptops): compact rows */}
            <ul className="divide-y divide-gray-100 xl:hidden" aria-label="Sales">
              {pageRows.map((order) => {
                const cancelled = order.status === 'Cancelled'
                return (
                  <li
                    key={order.id}
                    tabIndex={0}
                    onClick={() => openDetails(order.id)}
                    onKeyDown={(e) => rowKeyDown(e, order.id)}
                    className={`flex cursor-pointer flex-col gap-1.5 px-3 py-2.5 text-sm hover:bg-gray-50 focus:bg-blue-50 focus:outline-none sm:flex-row sm:items-start sm:justify-between sm:gap-4 ${
                      cancelled ? 'text-gray-400' : 'text-gray-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">{order.orderNumber}</span>
                        <SaleStatusChip status={order.status} />
                        <span className="text-xs text-gray-500">{formatSaleDate(order.orderDate)}</span>
                      </div>
                      <p className={cancelled ? '' : 'text-gray-700'}>
                        {saleCustomerName(order)}
                        {isAdmin && order.creatorName && (
                          <span className="text-xs text-gray-500"> · by {order.creatorName}</span>
                        )}
                      </p>
                      <div className="mt-0.5">
                        {itemsSummary(order).map((line, i) => (
                          <p key={i} className={`text-xs ${cancelled ? '' : 'text-gray-600'}`}>
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end">
                      <span className="font-semibold tabular-nums">
                        {formatMoney(order.totalAmount, order.currency)}
                      </span>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={(e) => editRow(e, order.id)} className={rowEditButton}>
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                        <button type="button" onClick={(e) => deleteRow(e, order.id)} className={rowDeleteButton}>
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 text-sm text-gray-600">
                <span>
                  {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of{' '}
                  {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                    className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-2">
                    Page {currentPage} of {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage === pageCount}
                    aria-label="Next page"
                    className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

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
