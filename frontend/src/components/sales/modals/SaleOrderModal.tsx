import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react'
import { UserRole } from '../../../types'
import type {
  Customer,
  GreenStockSummary,
  RoastSaleSummary,
  SaleOrder,
  SellableGreenLot,
  SellableRoast,
  User,
} from '../../../types'
import Modal from '../../common/Modal'
import Select from '../../common/Select'
import DatePicker from '../../common/DatePicker'
import CreateCustomerModal from './CreateCustomerModal'
import { useDataContext } from '../../../hooks/useDataContext'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import {
  applySaleChange,
  createSaleOrder,
  getSellableGreenLots,
  getSellableRoasts,
  updateSaleOrder,
} from '../../../services/sales/saleOrderService'
import type { SaleLineInput } from '../../../services/sales/saleOrderService'
import { getAllUsersOrThrow } from '../../../services/auth/userService'
import { toRoaId } from '../../../utils/formatters'
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
  /**
   * New sale only (ignored when `order` is set): start with a green-bean line
   * for this stock row, with these kg filled in (rounded down to the gram, as
   * the server rounds the kg it lists as free).
   */
  initialGreenLine?: { roasterInventoryId: string; kg?: number }
  /**
   * New sale only (ignored when `order` is set): the roaster whose stock it
   * sells and who owns the sale. An Admin passes another roaster's id to sell
   * for them; left out, an Admin picks the roaster in the form ("Sell for").
   */
  sellerId?: string
  onClose: () => void
  /** Called after the sale is saved and merged into the app data, before the popup closes. */
  onSaved?: (saleOrder: SaleOrder) => void
}

export type SaleOrderFormProps = Omit<SaleOrderModalProps, 'isOpen'> & {
  /**
   * Inside the Start roast popup: no dialog or title of its own, roaster
   * colours, and a footer sized for that popup's padding (p-8, p-4 on phones).
   */
  embedded?: boolean
}

type SourceKind = 'roast' | 'green'

interface LineDraft {
  key: string
  /** '' (nothing chosen yet), 'roast:<roast batch id>' or 'green:<stock row id>'. */
  source: string
  kg: string
  price: string
  /** The price came from an earlier sale (or is empty), so picking another item or currency may replace it. */
  priceAuto: boolean
}

type SourceOption =
  | { kind: 'roast'; key: string; roast: RoastSaleSummary }
  | { kind: 'green'; key: string; green: GreenStockSummary }

// Each list loads on its own: when one fails the other still sells, and a
// line of the kind that failed waits for Retry.
type SellableState =
  | { status: 'loading' }
  | {
      status: 'done'
      roasts: SellableRoast[] | null
      greenLots: SellableGreenLot[] | null
      missingWeightCount: number
      roastsError: string
      greenError: string
    }

const STALE_SALE = /changed or removed by someone else/
const SALE_NOT_FOUND = /^Sale not found$/
const KG_EPSILON = 1e-6
// The server's limits for one sale line (lib/validations/sales.ts).
const MIN_LINE_KG = 0.001
const MAX_LINE_KG = 100000
const MAX_PRICE_PER_KG = 1000000

const sourceKey = (kind: SourceKind, id: string): string => `${kind}:${id}`

const parseSourceKey = (key: string): { kind: SourceKind; id: string } | null => {
  const at = key.indexOf(':')
  const kind = key.slice(0, at)
  const id = key.slice(at + 1)
  return at > 0 && id && (kind === 'roast' || kind === 'green') ? { kind, id } : null
}

let lineCounter = 0
const newLine = (): LineDraft => ({
  key: `line-${++lineCounter}`,
  source: '',
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
// Down to the gram, the way the server lists free kg (floor3 in lib/saleOrders.ts).
const floor3 = (v: number) => Math.floor(v * 1000 + KG_EPSILON) / 1000

const errorText = (err: unknown): string => (err instanceof Error ? err.message : '')

/**
 * Price per kg of the newest earlier line in this currency (sales are newest
 * first). A roast takes the same roast, else a roasted line of the same green
 * lot; green beans take the same stock row, else a line of the same green lot
 * that was not roasted.
 */
const priceFrom = (
  saleOrders: SaleOrder[],
  key: string,
  lotId: string | undefined,
  currency: string,
): string => {
  const source = parseSourceKey(key)
  if (!source) return ''
  let byLot: number | undefined
  for (const sale of saleOrders) {
    if (sale.currency !== currency) continue
    for (const item of sale.items) {
      if (source.kind === 'roast') {
        if (item.roastBatchId === source.id) return String(item.pricePerKg)
        if (byLot === undefined && lotId && item.roastBatchId && item.greenBeanLotId === lotId) {
          byLot = item.pricePerKg
        }
      } else {
        if (item.roasterInventoryId === source.id) return String(item.pricePerKg)
        if (byLot === undefined && lotId && !item.roastBatchId && item.greenBeanLotId === lotId) {
          byLot = item.pricePerKg
        }
      }
    }
  }
  return byLot === undefined ? '' : String(byLot)
}

/**
 * The seller's own earlier sales first. An Admin also sees other roasters'
 * sales; those give the price only when the seller's have none.
 */
const earlierPrice = (
  saleOrders: SaleOrder[],
  key: string,
  lotId: string | undefined,
  currency: string,
  sellerId: string,
): string =>
  priceFrom(saleOrders.filter((sale) => sale.createdBy === sellerId), key, lotId, currency) ||
  priceFrom(saleOrders.filter((sale) => sale.createdBy !== sellerId), key, lotId, currency)

const TONES = {
  default: {
    primary: 'bg-blue-600 hover:bg-blue-700',
    link: 'text-blue-600 hover:text-blue-700',
    soft: 'hover:bg-blue-50',
    focus: 'focus:border-blue-500 focus:ring-blue-500',
    select: 'blue',
    spinner: 'text-blue-600',
  },
  roaster: {
    primary: 'bg-[#2e6848] hover:bg-[#24553a]',
    link: 'text-[#2e6848] hover:text-[#1c4932]',
    soft: 'hover:bg-[#e9f2ec]',
    focus: 'focus:border-[#2e6848] focus:ring-[#2e6848]',
    select: 'emerald',
    spinner: 'text-[#2e6848]',
  },
} as const

type Tone = (typeof TONES)[keyof typeof TONES]

const inputClass = (hasError: boolean, tone: Tone) =>
  `block w-full rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 ${
    hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : `border-gray-300 ${tone.focus}`
  }`

const SaleOrderModal: React.FC<SaleOrderModalProps> = ({ isOpen, ...props }) =>
  isOpen ? <SaleOrderForm {...props} /> : null

// Mounted only while open, so every open starts from a fresh form.
export const SaleOrderForm: React.FC<SaleOrderFormProps> = ({
  order,
  initialCustomerId,
  initialGreenLine,
  sellerId: sellerIdProp,
  onClose,
  onSaved,
  embedded = false,
}) => {
  const { data, setData, refreshData, setIsEditing } = useDataContext()
  const { currentUser } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const tone = embedded ? TONES.roaster : TONES.default

  const isAdmin =
    !!currentUser && (!!currentUser.isSuperAdmin || currentUser.roles.includes(UserRole.Admin))
  const isLegacy =
    !!order && order.items.some((item) => !item.roastBatchId && !item.roasterInventoryId)
  const titleId = 'sale-order-modal-title'
  // The stock row a new sale starts with (Start roast → Sell).
  const initialGreenId = order ? undefined : initialGreenLine?.roasterInventoryId
  const initialGreenLotId = initialGreenId
    ? data.roasterInventory.find((row) => row.id === initialGreenId)?.greenBeanLotId
    : undefined

  // Pause the app's auto-refresh while the form is open.
  useEffect(() => {
    setIsEditing(true)
    return () => setIsEditing(false)
  }, [setIsEditing])

  // The Start roast popup can be closed (Escape, X) while its sale is saving;
  // a failure after that has no form left to show it in.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

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

  // The seller: whose roasts and stock the lines come from, and who owns the
  // sale. An edit keeps its owner; an Admin recording a new sale with no
  // seller handed over picks the roaster first ("Sell for").
  const pickSeller = isAdmin && !order && !sellerIdProp
  const [pickedSellerId, setPickedSellerId] = useState('')
  const sellerId = order
    ? order.createdBy
    : (sellerIdProp ?? (pickedSellerId || currentUser?.id || ''))
  const waitingForSeller = pickSeller && !pickedSellerId
  const sellingForOther = !!currentUser && sellerId !== currentUser.id

  // A new sale starts in the currency of the seller's last sale.
  const lastCurrencyOf = (id: string): string => {
    const lastOwn = data.saleOrders.find((o) => !id || o.createdBy === id)
    return lastOwn && SALE_CURRENCIES.includes(lastOwn.currency) ? lastOwn.currency : 'THB'
  }
  const [currency, setCurrency] = useState(() => (order ? order.currency : lastCurrencyOf(sellerId)))
  // Picked by hand: a later "Sell for" choice leaves it alone.
  const [currencyTouched, setCurrencyTouched] = useState(false)
  const [lines, setLines] = useState<LineDraft[]>(() => {
    if (order) {
      return isLegacy
        ? [newLine()]
        : order.items.map((item) => ({
            key: item.id,
            source: item.roastBatchId
              ? sourceKey('roast', item.roastBatchId)
              : item.roasterInventoryId
                ? sourceKey('green', item.roasterInventoryId)
                : '',
            kg: formatKg(item.quantity),
            price: String(item.pricePerKg),
            priceAuto: false,
          }))
    }
    if (initialGreenLine) {
      const key = sourceKey('green', initialGreenLine.roasterInventoryId)
      const lotId = data.roasterInventory.find(
        (row) => row.id === initialGreenLine.roasterInventoryId,
      )?.greenBeanLotId
      // Rounded down: a claim of 12.3456 kg leaves 12.345 kg free to sell, and
      // 12.346 would be over the limit as soon as the form opens.
      const kg = floor3(initialGreenLine.kg ?? 0)
      return [
        {
          ...newLine(),
          source: key,
          kg: kg > 0 ? formatKg(kg) : '',
          price: earlierPrice(data.saleOrders, key, lotId, currency, sellerId),
          priceAuto: true,
        },
      ]
    }
    return [newLine()]
  })
  const [notes, setNotes] = useState(order?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // An Admin selling for (or editing the sale of) another roaster picks from
  // that roaster's roasts and stock.
  const roasterId = isAdmin && sellingForOther ? sellerId : undefined
  const [reloadKey, setReloadKey] = useState(0)
  const [sellable, setSellable] = useState<SellableState>({ status: 'loading' })
  // The stock row handed over by Start roast was not in the loaded list.
  const [initialGreenGone, setInitialGreenGone] = useState(false)
  useEffect(() => {
    // Nothing to list until the Admin has picked whose stock it is.
    if (waitingForSeller) return
    let cancelled = false
    void Promise.allSettled([getSellableRoasts(roasterId), getSellableGreenLots(roasterId)]).then(
      ([roastsResult, greenResult]) => {
        if (cancelled) return
        const roasts = roastsResult.status === 'fulfilled' ? roastsResult.value : null
        const greenLots =
          greenResult.status === 'fulfilled' && Array.isArray(greenResult.value)
            ? greenResult.value
            : null
        setSellable({
          status: 'done',
          roasts: roasts ? roasts.roasts : null,
          missingWeightCount: roasts ? roasts.missingWeightCount : 0,
          roastsError: roastsResult.status === 'rejected' ? errorText(roastsResult.reason) : '',
          greenLots,
          greenError: greenResult.status === 'rejected' ? errorText(greenResult.reason) : '',
        })
        // The stock row handed over by Start roast has nothing left to sell
        // (or is gone): drop it so the line asks for a choice. Kept when the
        // green list failed, since then nobody knows.
        if (initialGreenId && greenLots && !greenLots.some((g) => g.id === initialGreenId)) {
          const key = sourceKey('green', initialGreenId)
          setLines((prev) => prev.map((line) => (line.source === key ? { ...line, source: '' } : line)))
          setInitialGreenGone(true)
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [roasterId, reloadKey, initialGreenId, waitingForSeller])

  const retryLoad = () => {
    setSellable({ status: 'loading' })
    setReloadKey((k) => k + 1)
  }

  // "Sell for" lists the Admin first ("Me", for stock they claimed or roasts
  // they logged themselves), then every user with the Roaster role. An
  // Admin's app data holds all users; when it has none yet, ask the server.
  const needUsers = pickSeller && data.users.length === 0
  const [fetchedUsers, setFetchedUsers] = useState<User[] | null>(null)
  const [usersFailed, setUsersFailed] = useState(false)
  const [usersReloadKey, setUsersReloadKey] = useState(0)
  useEffect(() => {
    if (!needUsers) return
    let cancelled = false
    getAllUsersOrThrow().then(
      (users) => {
        if (!cancelled) setFetchedUsers(users)
      },
      () => {
        if (!cancelled) setUsersFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [needUsers, usersReloadKey])
  const usersLoading = needUsers && fetchedUsers === null && !usersFailed
  const retryUsers = () => {
    setUsersFailed(false)
    setUsersReloadKey((k) => k + 1)
  }
  const sellerOptions = useMemo(() => {
    const roasters = (data.users.length > 0 ? data.users : (fetchedUsers ?? []))
      .filter((u) => u.id !== currentUser?.id && u.roles?.includes(UserRole.Roaster))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      .map((u) => ({
        value: u.id,
        label: u.isActive === false ? `${u.name} (inactive)` : u.name,
      }))
    return currentUser
      ? [{ value: currentUser.id, label: `Me (${currentUser.name})` }, ...roasters]
      : roasters
  }, [data.users, fetchedUsers, currentUser])

  // Another seller means other stock: start the lines over and load theirs.
  const chooseSeller = (id: string) => {
    if (!id || id === pickedSellerId) return
    setPickedSellerId(id)
    if (!currencyTouched) setCurrency(lastCurrencyOf(id))
    setLines([newLine()])
    setInitialGreenGone(false)
    setError('')
    setSellable({ status: 'loading' })
  }

  // "+ New customer": true only while its popup is up, so a save that lands
  // after it was closed adds the customer to the list without picking it.
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const newCustomerPendingRef = useRef(false)
  const openNewCustomer = () => {
    newCustomerPendingRef.current = true
    setShowNewCustomer(true)
  }
  const closeNewCustomer = () => {
    newCustomerPendingRef.current = false
    setShowNewCustomer(false)
  }
  const onCustomerCreated = (customer: Customer) => {
    setData((prev) => ({
      ...prev,
      customers: prev.customers.some((c) => c.id === customer.id)
        ? prev.customers.map((c) => (c.id === customer.id ? customer : c))
        : [customer, ...prev.customers],
    }))
    if (newCustomerPendingRef.current) setCustomerId(customer.id)
  }

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
  const noCustomers = customerOptions.length === 0

  const roastsLoaded = sellable.status === 'done' && sellable.roasts !== null
  const greenLoaded = sellable.status === 'done' && sellable.greenLots !== null
  const kindLoaded = (kind: SourceKind) => (kind === 'roast' ? roastsLoaded : greenLoaded)

  // kg this sale already holds per roast or stock row; it counts towards what a line may take.
  const ownReserved = useMemo(() => {
    const held = new Map<string, number>()
    if (order && order.status !== 'Cancelled') {
      for (const item of order.items) {
        const key = item.roastBatchId
          ? sourceKey('roast', item.roastBatchId)
          : item.roasterInventoryId
            ? sourceKey('green', item.roasterInventoryId)
            : ''
        if (key) held.set(key, round3((held.get(key) ?? 0) + item.quantity))
      }
    }
    return held
  }, [order])

  // Sellable roasts, then sellable green lots (freshest numbers), then this
  // sale's own roasts and stock rows that are no longer listed.
  const lineSources = lines.map((line) => line.source).join('|')
  const sourceOptions = useMemo(() => {
    const list: SourceOption[] = []
    const seen = new Set<string>()
    const add = (option: SourceOption) => {
      if (seen.has(option.key)) return
      seen.add(option.key)
      list.push(option)
    }
    if (sellable.status === 'done') {
      for (const roast of sellable.roasts ?? []) {
        add({ kind: 'roast', key: sourceKey('roast', roast.id), roast })
      }
      for (const green of sellable.greenLots ?? []) {
        add({ kind: 'green', key: sourceKey('green', green.id), green })
      }
    }
    for (const item of order?.items ?? []) {
      if (item.roastBatchId && item.roast) {
        add({ kind: 'roast', key: sourceKey('roast', item.roastBatchId), roast: item.roast })
      } else if (item.roasterInventoryId && item.green) {
        add({ kind: 'green', key: sourceKey('green', item.roasterInventoryId), green: item.green })
      }
    }
    // A stock row handed over by Start roast while the green list failed:
    // named from the app data so the line still shows what it sells.
    if (sellable.status === 'done' && !sellable.greenLots) {
      for (const key of lineSources.split('|')) {
        const source = parseSourceKey(key)
        if (source?.kind !== 'green' || seen.has(key)) continue
        const row = data.roasterInventory.find((r) => r.id === source.id)
        if (!row) continue
        add({
          kind: 'green',
          key,
          green: {
            id: row.id,
            label: toRoaId(row.greenBeanLotId),
            greenBeanLotId: row.greenBeanLotId,
            greenBeanLotDisplayId: row.greenBeanDisplayId,
            grade: row.grade,
            variety: row.variety,
            process: row.process,
            availableKg: row.remainingWeightKg,
          },
        })
      }
    }
    return list
  }, [sellable, order, lineSources, data.roasterInventory])
  const optionByKey = useMemo(
    () => new Map(sourceOptions.map((option) => [option.key, option])),
    [sourceOptions],
  )
  // Free kg per roast or stock row, from the loaded lists only. One missing
  // from them has nothing left (the server lists every one with any kg free);
  // the copy inside this sale (item.roast / item.green) came with the sale
  // list and goes stale as soon as another sale takes from the same stock, so
  // it only labels the option. The lines are shown only once a list has loaded.
  const freeKgByKey = useMemo(() => {
    const free = new Map<string, number>()
    if (sellable.status === 'done') {
      for (const roast of sellable.roasts ?? []) free.set(sourceKey('roast', roast.id), roast.availableKg)
      for (const green of sellable.greenLots ?? []) free.set(sourceKey('green', green.id), green.availableKg)
    }
    return free
  }, [sellable])

  const maxKgFor = (key: string): number =>
    round3((freeKgByKey.get(key) ?? 0) + (ownReserved.get(key) ?? 0))
  // A cancelled sale holds no stock, so its lines are not limited.
  const limitKg = !order || order.status !== 'Cancelled'

  const optionName = (option: SourceOption): string =>
    option.kind === 'roast'
      ? `Roasted · ${[
          option.roast.label,
          formatSaleDate(option.roast.roastDate),
          describeRoastOption(option.roast),
          option.roast.roastLevel ?? 'No level',
        ]
          .filter(Boolean)
          .join(' · ')}`
      : [
          'Green beans',
          option.green.label,
          option.green.greenBeanLotDisplayId,
          describeRoastOption(option.green),
        ]
          .filter(Boolean)
          .join(' · ')

  // The kg left only when its list loaded; otherwise nobody knows.
  const optionLabel = (option: SourceOption): string =>
    kindLoaded(option.kind)
      ? `${optionName(option)} — ${formatKg(maxKgFor(option.key))} kg left`
      : optionName(option)

  const lotIdFor = (key: string): string | undefined => {
    const option = optionByKey.get(key)
    if (option) return option.kind === 'roast' ? option.roast.greenBeanLotId : option.green.greenBeanLotId
    const source = parseSourceKey(key)
    return source?.kind === 'green'
      ? data.roasterInventory.find((row) => row.id === source.id)?.greenBeanLotId
      : undefined
  }

  const prefillPrice = (key: string, cur: string): string =>
    earlierPrice(data.saleOrders, key, lotIdFor(key), cur, sellerId)

  const updateLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  const chooseSource = (key: string, source: string) =>
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line
        const replacePrice = line.priceAuto || line.price.trim() === ''
        return replacePrice
          ? { ...line, source, price: prefillPrice(source, currency), priceAuto: true }
          : { ...line, source }
      }),
    )

  const chooseCurrency = (next: string) => {
    setCurrency(next)
    setCurrencyTouched(true)
    setLines((prev) =>
      prev.map((line) =>
        line.source && (line.priceAuto || line.price.trim() === '')
          ? { ...line, price: prefillPrice(line.source, next), priceAuto: true }
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
  const sellerError = waitingForSeller ? 'Choose a roaster to sell for' : ''
  // Whose stock the messages talk about.
  const whose = sellingForOther ? "the roaster's" : 'your'

  const lineChecks = lines.map((line, index) => {
    // Rounded the way the server records them (kg to the gram, price to 2
    // decimals), so the checks, the subtotals and the payload all match the
    // amounts the sale is saved with.
    const rawKg = parseDecimal(line.kg)
    const rawPrice = parseDecimal(line.price)
    const kg = Number.isFinite(rawKg) ? round3(rawKg) : rawKg
    const price = Number.isFinite(rawPrice) ? round2(rawPrice) : rawPrice
    const source = parseSourceKey(line.source)
    const option = optionByKey.get(line.source)
    // Its list failed to load, so the kg left are unknown until Retry.
    const unloaded = !!source && !kindLoaded(source.kind)
    const max = source ? maxKgFor(line.source) : 0
    const label = option
      ? option.kind === 'roast'
        ? option.roast.label
        : option.green.label
      : source?.kind === 'green'
        ? 'these green beans'
        : 'this roast'
    const duplicate =
      !!source && lines.some((l, i) => i < index && l.source === line.source)
    const overMax =
      limitKg && !!source && !unloaded && Number.isFinite(kg) && kg > max + KG_EPSILON
    return {
      kg,
      price,
      unloaded,
      source: !source
        ? 'Choose roasted coffee or green beans'
        : unloaded
          ? `Press Retry to load ${whose} ${source.kind === 'green' ? 'green beans' : 'roasted coffee'}`
          : duplicate
            ? source.kind === 'green'
              ? 'These green beans are already on another line'
              : 'This roast is already on another line'
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

  const bothFailed = sellable.status === 'done' && !roastsLoaded && !greenLoaded
  const nothingToSell =
    !isLegacy && roastsLoaded && greenLoaded && sourceOptions.length === 0
  const linesReady = isLegacy || (sellable.status === 'done' && !bothFailed && !nothingToSell)
  const linesInvalid =
    !isLegacy && lineChecks.some((c) => c.source || c.kgError || c.priceError)
  const blocked =
    !!sellerError || !!dateError || !!customerError || !linesReady || linesInvalid

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
      : lines.map((line, i): SaleLineInput => {
          const source = parseSourceKey(line.source)
          const amounts = { quantity: lineChecks[i].kg, pricePerKg: lineChecks[i].price }
          return source?.kind === 'green'
            ? { roasterInventoryId: source.id, ...amounts }
            : { roastBatchId: source?.id ?? '', ...amounts }
        })
    const base = { customerId, orderDate, currency, notes: notes.trim() || null }
    try {
      const result = order
        ? await updateSaleOrder(order.id, {
            ...base,
            ...(items ? { items } : {}),
            expectedUpdatedAt: order.updatedAt,
          })
        : await createSaleOrder({
            ...base,
            items: items ?? [],
            // Only an Admin sells for another roaster; the server checks it.
            ...(sellingForOther ? { sellerId } : {}),
          })
      setData((prev) =>
        applySaleChange(prev, {
          upsert: result.saleOrder,
          affectedRoastBatches: result.affectedRoastBatches,
          affectedInventoryItems: result.affectedInventoryItems,
        }),
      )
      addToast({
        type: 'success',
        message: `Sale ${result.saleOrder.orderNumber} ${order ? 'updated' : 'recorded'}`,
      })
      onSaved?.(result.saleOrder)
      onClose()
    } catch (err: unknown) {
      const message = errorText(err)
      if (STALE_SALE.test(message) || SALE_NOT_FOUND.test(message)) {
        await refreshData()
        addToast({ type: 'warning', message })
        onClose()
        return
      }
      if (!mountedRef.current) {
        addToast({ type: 'error', message: message || 'Could not save the sale.' })
        return
      }
      setError(message || 'Could not save the sale. Please try again.')
      setSaving(false)
    }
  }

  // ---- render -----------------------------------------------------------

  const fieldLabel = 'block text-xs font-semibold text-gray-600 mb-1'
  const missingWeightCount = sellable.status === 'done' ? sellable.missingWeightCount : 0
  const partialFailure =
    sellable.status === 'done' && !bothFailed && (!roastsLoaded || !greenLoaded)

  const retryButton = (
    <button
      type="button"
      onClick={retryLoad}
      className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
    >
      Retry
    </button>
  )

  const form = (
    // On phones the popup is a full-screen sheet: the form fills it so the
    // footer sits at the bottom even when the form is short.
    <form
      onSubmit={handleSubmit}
      noValidate
      className={embedded ? 'flex flex-1 flex-col' : 'flex flex-col max-sm:min-h-[calc(100dvh-2rem)]'}
    >
      {!embedded && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {order ? `Edit sale ${order.orderNumber}` : 'Sell coffee'}
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
      )}

      <div className="flex-1 space-y-3">
        {/* Admin, new sale: the roaster it is recorded for. The sale is theirs
            and every line comes from their stock. */}
        {pickSeller && (
          <div role="group" aria-labelledby="sale-seller-label">
            <span id="sale-seller-label" className={fieldLabel}>
              Sell for
            </span>
            <Select
              options={sellerOptions}
              value={pickedSellerId || null}
              onChange={(v) => chooseSeller(v ? String(v) : '')}
              placeholder={usersLoading ? 'Loading roasters…' : 'Choose a roaster'}
              disabled={usersLoading}
              colorTheme={tone.select}
            />
            {usersFailed && (
              <div
                role="alert"
                className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700"
              >
                <span>Couldn&apos;t load the roasters.</span>
                <button
                  type="button"
                  onClick={retryUsers}
                  className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  Retry
                </button>
              </div>
            )}
            {submitted && sellerError && <p className="mt-1 text-xs text-red-600">{sellerError}</p>}
          </div>
        )}

        {/* Customer. The New customer button sits outside the group, so the
            group holds only the picker and its error. */}
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span id="sale-customer-label" className="text-xs font-semibold text-gray-600">
              Customer
            </span>
            <button
              type="button"
              onClick={openNewCustomer}
              className={
                noCustomers
                  ? `inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-white ${tone.primary}`
                  : `inline-flex items-center gap-1 text-xs font-semibold ${tone.link}`
              }
            >
              <Plus className="h-3.5 w-3.5" />
              New customer
            </button>
          </div>
          <div role="group" aria-labelledby="sale-customer-label">
            <Select
              options={customerOptions}
              value={customerId || null}
              onChange={(v) => setCustomerId(v ? String(v) : '')}
              placeholder={noCustomers ? 'No customers yet' : 'Choose a customer'}
              disabled={noCustomers}
              colorTheme={tone.select}
            />
            {submitted && customerError && (
              <p className="mt-1 text-xs text-red-600">{customerError}</p>
            )}
          </div>
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
              colorTheme={tone.select}
            />
          </div>
        </div>

        {/* Lines */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className={fieldLabel}>Coffee</span>
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
          ) : waitingForSeller ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500">
              Choose who you are selling for to see their roasted coffee and green beans.
            </p>
          ) : sellable.status === 'loading' ? (
            <p className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-500">
              <Loader2 className={`h-4 w-4 animate-spin ${tone.spinner}`} />
              Loading {whose} stock…
            </p>
          ) : bothFailed ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              <span>
                Couldn&apos;t load {whose} stock. {sellable.roastsError || sellable.greenError}
              </span>
              {retryButton}
            </div>
          ) : nothingToSell ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
              <p>
                {sellingForOther
                  ? 'This roaster has nothing left to sell: no roasted coffee with a roasted weight and no green beans in stock.'
                  : embedded
                    ? 'Nothing left to sell. Log a roast with its roasted weight, or claim green beans into your stock.'
                    : 'Nothing left to sell. Log a roast with its roasted weight, or claim green beans into your stock, in the Roaster Workbench.'}
              </p>
              {!embedded && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate('/roaster')
                  }}
                  className={`mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${tone.primary}`}
                >
                  Go to Roaster Workbench
                </button>
              )}
            </div>
          ) : (
            <>
              {partialFailure && (
                <div
                  role="alert"
                  className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700"
                >
                  <span>
                    {roastsLoaded
                      ? `Couldn't load ${whose} green beans.`
                      : `Couldn't load ${whose} roasted coffee.`}
                  </span>
                  {retryButton}
                </div>
              )}
              {initialGreenGone && lines.every((line) => !line.source) && (
                <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                  {initialGreenLotId ? toRoaId(initialGreenLotId) : 'That lot'} has no green beans
                  left to sell. Choose another item.
                </p>
              )}
              <ol className="space-y-2">
                {lines.map((line, index) => {
                  const check = lineChecks[index]
                  const kgId = `${line.key}-kg`
                  const priceId = `${line.key}-price`
                  const showKgError = check.overMax || (submitted && !!check.kgError)
                  const lineOptions = sourceOptions.map((option) => ({
                    value: option.key,
                    label: optionLabel(option),
                    disabled: lines.some(
                      (other) => other.key !== line.key && other.source === option.key,
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
                          aria-label={`Item for line ${index + 1}`}
                        >
                          <Select
                            options={lineOptions}
                            value={line.source || null}
                            onChange={(v) => chooseSource(line.key, v ? String(v) : '')}
                            placeholder="Choose roasted coffee or green beans"
                            colorTheme={tone.select}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                          disabled={lines.length === 1}
                          aria-label={`Remove line ${index + 1}`}
                          className="mt-1.5 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {(check.unloaded || submitted) && check.source && (
                        <p className="mt-1 text-xs text-red-600">{check.source}</p>
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
                            className={inputClass(showKgError, tone)}
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
                            className={inputClass(submitted && !!check.priceError, tone)}
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
                className={`mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${tone.link} ${tone.soft}`}
              >
                <Plus className="h-3.5 w-3.5" />
                Add line
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
            className={`block w-full resize-none rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 ${tone.focus}`}
          />
        </div>
      </div>

      <div
        className={
          embedded
            ? 'sticky -bottom-8 z-10 -mx-8 -mb-8 mt-6 rounded-b-3xl border-t border-[#e8ece8] bg-white px-8 py-4 max-sm:-bottom-4 max-sm:-mx-4 max-sm:-mb-4 max-sm:px-4 max-sm:rounded-none'
            : 'sticky bottom-0 mt-4 border-t border-gray-200 bg-white pt-3 shadow-[0_1.25rem_0_0_#fff]'
        }
      >
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
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${tone.primary}`}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {order ? 'Save changes' : 'Record sale'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )

  // Outside the <form>: React bubbles a submit through portals, so a New
  // customer form inside it would also submit the sale.
  const customerModal = (
    <CreateCustomerModal
      isOpen={showNewCustomer}
      onClose={closeNewCustomer}
      onCustomerCreated={onCustomerCreated}
    />
  )

  if (embedded) {
    return (
      <>
        {form}
        {customerModal}
      </>
    )
  }

  return (
    <>
      <Modal
        isOpen
        onClose={close}
        maxWidth="2xl"
        showCloseButton={false}
        ariaLabelledBy={titleId}
        className="!p-5 !rounded-xl"
        mobileFullScreen
      >
        {form}
      </Modal>
      {customerModal}
    </>
  )
}

export default SaleOrderModal
