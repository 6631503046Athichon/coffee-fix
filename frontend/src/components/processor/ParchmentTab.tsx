import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Coffee,
  Box,
  Play,
  Package,
  X,
  AlertCircle,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Leaf,
  Sprout,
  Scale,
  Droplet,
  Calendar,
  FileText,
  Check,
  Minus,
  DollarSign,
  Flame,
  Beaker,
  Globe,
  MoreHorizontal,
  ArrowRight,
  Save,
  History,
  ArrowDown,
} from 'lucide-react'
import {
  HarvestLot,
  ParchmentLot,
  ProcessingBatchStatus,
  User,
} from '../../types'
import { useDataContext } from '../../hooks/useDataContext'
import { useGradeNames } from '../../hooks/useGradeOptions'
import { useToggleScrollAnchor } from '../../hooks/useToggleScrollAnchor'
import { useToast } from '../../contexts/ToastContext'
import { addProcessingBatch } from '../../services/processing/processingBatchService'
import {
  createParchmentWithdrawal,
  getAllParchmentLots,
} from '../../services/lots/parchmentLotService'
import { createWithdrawal as createGBLWithdrawal } from '../../services/lots/greenBeanLotService'
import DatePicker from '../common/DatePicker'
import {
  CropYearChips,
  findCurrentCropYearId,
  getHarvestLotCherryWeight,
  getReadyHarvestLots,
  GradeDropdown,
  GradePriceInput,
  GradeSplitValue,
  ModalPortal,
  Pagination,
  ProcessTypeChips,
  ProcessTypePill,
  // Shape of the process-type pills here (shared with the admin colour
  // preview); the colour is the one the admin gave the type.
  PARCHMENT_PILL_SHAPE,
  defaultProcessTypeName,
  processTypeColors,
  hasGradePriceError,
  parseGradePrice,
  WithdrawDetailsFields,
  useWithdrawDetails,
  withdrawDetailsError,
  buildWithdrawDetailsPayload,
  withdrawSaleTotal,
  formatWithdrawTotal,
} from './workbench'
import type { WithdrawalType } from './workbench'
import { canManageGreenBeanLot, isInProcessorStock } from './workbench/stockAccess'
import { useWithdrawalCorrections } from './workbench/useWithdrawalCorrections'
import {
  VoidedNote,
  VoidedTag,
  WithdrawalRowActions,
} from './workbench/WithdrawalCorrectionControls'
import {
  canEditWithdrawalSale,
  canVoidWithdrawal,
  isVoidedWithdrawal,
} from './workbench/withdrawalCorrections'
import {
  formatGreenBeanId,
  formatHarvestLotId,
  formatParchmentId,
} from '../../utils/formatDisplayId'

// ─────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────

interface ParchmentTabProps {
  currentUser: User
}

/**
 * Why a Process & Grade split cannot be saved yet, or null. A row with
 * neither a weight nor a price is an unused spare and is skipped; any other
 * row must have a grade and a weight above 0, because leaving it out would
 * drop the kg or price typed on it while the whole parchment is used up.
 */
const gradeSplitRowProblem = (
  rows: { grade: string; weight: string; price: string }[],
): string | null => {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.weight.trim() === '' && r.price.trim() === '') continue
    if (!r.grade) return `Pick a grade for row ${i + 1}.`
    const w = parseFloat(r.weight)
    if (isNaN(w) || w <= 0) {
      return `Enter a weight above 0 for row ${i + 1} (${r.grade}).`
    }
  }
  return null
}

// A new Process & Grade starts on Honey when the admin list offers it.
const PREFERRED_PROCESS_TYPE = 'Honey'

// Withdrawal-type config mirrors the Workbench Withdraw Stock modal:
// each option is an icon-card with its own active colour. Order is
// Sale → Roast → Sample → Export → Other.
const WITHDRAWAL_TYPE_CONFIG: {
  value: WithdrawalType
  label: string
  icon: React.ComponentType<{ className?: string }>
  active: string // active classes (bg + border + text + ring)
}[] = [
  {
    value: 'Sale',
    label: 'Sale',
    icon: DollarSign,
    active:
      'bg-blue-50 border-blue-400 text-blue-700 ring-2 ring-blue-200 shadow-sm',
  },
  {
    value: 'Roasting Stock',
    label: 'Roast',
    icon: Flame,
    active:
      'bg-orange-50 border-orange-400 text-orange-700 ring-2 ring-orange-200 shadow-sm',
  },
  {
    value: 'Sample',
    label: 'Sample',
    icon: Beaker,
    active:
      'bg-purple-50 border-purple-400 text-purple-700 ring-2 ring-purple-200 shadow-sm',
  },
  {
    value: 'Export',
    label: 'Export',
    icon: Globe,
    active:
      'bg-emerald-50 border-emerald-400 text-emerald-700 ring-2 ring-emerald-200 shadow-sm',
  },
  {
    value: 'Other',
    label: 'Other',
    icon: MoreHorizontal,
    active:
      'bg-gray-100 border-gray-400 text-gray-700 ring-2 ring-gray-200 shadow-sm',
  },
]

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

const ParchmentTab: React.FC<ParchmentTabProps> = ({ currentUser }) => {
  const { data, setData, refreshData } = useDataContext()
  // One row per grade, so the admin-managed grade list caps the rows.
  const gradeNames = useGradeNames()
  const { addToast } = useToast()

  // Cherry Lots table paging
  const [cherryPage, setCherryPage] = useState(1)

  // ── Combined Process & Grade modal state ────────────────────────
  // One modal does both stages: create the parchment lot, then
  // immediately hull-and-grade it into green-bean lots. The cherry → green
  // bean flow happens in a single Save action.
  const [processLot, setProcessLot] = useState<HarvestLot | null>(null)
  const [processForm, setProcessForm] = useState({
    processType: 'Honey',
    cropYearId: '',
    parchmentWeightKg: '',
    moistureContent: '',
    dryingStartDate: '',
    dryingEndDate: '',
    notes: '',
  })
  // Stable row id helper for editor lists. Using array index as a React
  // key here loses input focus when rows are removed/reordered.
  const newRowId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `row-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  // `price` is the optional THB price per kg for that grade's new lot.
  const [gradeRows, setGradeRows] = useState<
    { rowKey: string; grade: string; weight: string; price: string }[]
  >(() => [{ rowKey: newRowId(), grade: 'Grade A', weight: '', price: '' }])
  const [processError, setProcessError] = useState<string | null>(null)
  const [processSubmitting, setProcessSubmitting] = useState(false)

  // ── Withdraw modal state ────────────────────────────────────────
  type Bucket = {
    processType: string
    grade: string
    totalWeight: number
    sources: typeof data.greenBeanLots
  }
  const [withdrawBucket, setWithdrawBucket] = useState<Bucket | null>(null)
  const [withdrawForm, setWithdrawForm] = useState({
    amount: '',
    type: 'Sale' as WithdrawalType,
    purpose: '',
  })
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false)
  // Sale customer/price/address and the Roasting Stock roaster: the same
  // fields, checks and payload as the Workbench's Withdraw Stock.
  const withdrawDetails = useWithdrawDetails()

  // ── History modal state ────────────────────────────────────────
  // View-only modal showing the full provenance of a green-bean bucket:
  // each source GBL → its parchment lot → the originating harvest lot
  // (and farmer). Lets the operator answer "where did these beans come
  // from?" without leaving the page.
  const [historyBucket, setHistoryBucket] = useState<Bucket | null>(null)
  // The bucket's lots as stored now, so a void or a sale edit made from the
  // popup (merged into the app data) shows straight away.
  const historySources = useMemo(
    () =>
      historyBucket
        ? historyBucket.sources.map(
            (s) => data.greenBeanLots.find((g) => g.id === s.id) ?? s,
          )
        : [],
    [historyBucket, data.greenBeanLots],
  )
  // Void and Edit on the lots' withdrawals (D7), for each lot's owner or Admin.
  const withdrawalCorrections = useWithdrawalCorrections()

  // Per-process-type collapse state — shared by Section 2 (Parchment) and
  // Section 3 (Green Bean) so both behave identically: chevron toggles a
  // process-type group's body, and the same key (e.g. "Honey") collapses
  // it across both sections at once.
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set())
  const { remember: rememberGroupHeader, spacerRef: groupSpacerRef } =
    useToggleScrollAnchor(collapsedTypes)
  const toggleType = useCallback((t: string, header: HTMLElement) => {
    rememberGroupHeader(header)
    setCollapsedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }, [rememberGroupHeader])

  // ── Derived data ────────────────────────────────────────────────

  // Section 1: harvest lots ready for processing
  // Whole-lot semantics: a cherry lot is either Ready (listed here) or
  // Complete (consumed by a processing batch and gone from this list).
  const readyHarvestLots = useMemo(() => {
    return getReadyHarvestLots(data.harvestLots, data.processingBatches)
      .sort((a, b) => {
        const ac = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bc = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return bc - ac
      })
  }, [data.harvestLots, data.processingBatches])

  // The table paged at ten rows. Left unpaged it grew without limit, unlike
  // every other lot table in the app.
  const CHERRY_PAGE_SIZE = 10
  const cherryTotalPages = Math.max(
    1,
    Math.ceil(readyHarvestLots.length / CHERRY_PAGE_SIZE),
  )
  // Clamped rather than corrected by an effect: processing the last lot on the
  // final page shortens the list, and an unclamped page would render empty for
  // a frame before any effect could pull it back.
  const cherrySafePage = Math.min(cherryPage, cherryTotalPages)
  const pagedHarvestLots = useMemo(
    () =>
      readyHarvestLots.slice(
        (cherrySafePage - 1) * CHERRY_PAGE_SIZE,
        cherrySafePage * CHERRY_PAGE_SIZE,
      ),
    [readyHarvestLots, cherrySafePage],
  )

  // Section 2: parchment lots awaiting hulling, grouped by process type
  const parchmentByType = useMemo(() => {
    const map = new Map<string, ParchmentLot[]>()
    for (const lot of data.parchmentLots) {
      if (lot.status !== 'AwaitingHulling') continue
      if ((lot.currentWeightKg ?? 0) <= 0) continue
      const key = lot.processType || 'Unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(lot)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ac = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bc = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return bc - ac
      })
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [data.parchmentLots])

  // Section 3: green-bean buckets — one row per (processType, grade) with
  // summed weight + FIFO-sorted sources for the withdraw flow.
  // Only lots this user may draw from (see isInProcessorStock): a bucket's
  // Withdraw takes from its lots without naming them, so another
  // processor's lot would refuse it (403) on every retry, and an Admin would
  // silently drain a roaster's purchased lot. The KPI total follows.
  const greenBeanBuckets = useMemo<Bucket[]>(() => {
    const map = new Map<string, Bucket>()
    for (const gbl of data.greenBeanLots) {
      if (gbl.availabilityStatus !== 'Available') continue
      if ((gbl.currentWeightKg ?? 0) <= 0) continue
      if (!isInProcessorStock(currentUser, gbl)) continue
      const parchment = gbl.parchmentLotId
        ? data.parchmentLots.find((p) => p.id === gbl.parchmentLotId)
        : undefined
      // The parchment lot nested in the lot covers one that is not in the
      // loaded parchment list, so the lot does not fall into "Unknown".
      const processType =
        parchment?.processType ??
        gbl.parchmentProcessType ??
        (typeof gbl.externalSource === 'object' && gbl.externalSource
          ? (gbl.externalSource as { processType?: string }).processType
          : undefined) ??
        'Unknown'
      const grade = gbl.grade || 'Ungraded'
      const key = `${processType}::${grade}`
      const bucket =
        map.get(key) ??
        ({
          processType,
          grade,
          totalWeight: 0,
          sources: [],
        } as Bucket)
      bucket.totalWeight += gbl.currentWeightKg ?? 0
      bucket.sources = [...bucket.sources, gbl]
      map.set(key, bucket)
    }
    return Array.from(map.values()).map((b) => ({
      ...b,
      sources: [...b.sources].sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime(),
      ),
    }))
  }, [data.greenBeanLots, data.parchmentLots, currentUser])

  const greenBeanByType = useMemo(() => {
    const byType = new Map<string, Bucket[]>()
    for (const b of greenBeanBuckets) {
      if (!byType.has(b.processType)) byType.set(b.processType, [])
      byType.get(b.processType)!.push(b)
    }
    for (const arr of byType.values()) {
      arr.sort((a, b) => a.grade.localeCompare(b.grade))
    }
    return Array.from(byType.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [greenBeanBuckets])

  // ── KPI totals ──────────────────────────────────────────────────
  const totals = useMemo(() => {
    const cherry = readyHarvestLots.reduce(
      (s, l) => s + getHarvestLotCherryWeight(l),
      0,
    )
    const parchment = data.parchmentLots
      .filter((p) => p.status === 'AwaitingHulling')
      .reduce((s, p) => s + (p.currentWeightKg ?? 0), 0)
    const greenBean = greenBeanBuckets.reduce((s, b) => s + b.totalWeight, 0)
    return { cherry, parchment, greenBean }
  }, [readyHarvestLots, data.parchmentLots, greenBeanBuckets])

  // ── Handlers ────────────────────────────────────────────────────

  const openProcess = (lot: HarvestLot) => {
    setProcessLot(lot)
    setProcessForm({
      processType: defaultProcessTypeName(
        data.processTypes,
        PREFERRED_PROCESS_TYPE,
      ),
      // Default to harvest lot's crop year if it has one, else the current
      // crop year — saves the operator from picking it manually.
      cropYearId:
        lot.cropYearId || findCurrentCropYearId(data.cropYears) || '',
      parchmentWeightKg: '',
      moistureContent: '',
      dryingStartDate: '',
      dryingEndDate: '',
      notes: '',
    })
    setGradeRows([
      { rowKey: newRowId(), grade: 'Grade A', weight: '', price: '' },
    ])
    setProcessError(null)
  }

  // Combined Process & Grade submit:
  //   1. Create the processing batch with status=Completed → server-side
  //      transaction creates the parchment lot atomically.
  //   2. Look up the just-created parchment lot by batch id. We hit the
  //      API directly instead of waiting for refreshData() because the
  //      DataContext is closure-captured and won't reflect updates inside
  //      this function.
  //   3. Create a HullAndGrade withdrawal on that parchment lot — server
  //      consumes the parchment and creates green-bean lots per grade.
  //   4. Refresh the UI so the new green-bean buckets appear in the
  //      Inventory section below.
  const submitProcess = async () => {
    if (!processLot || processSubmitting) return

    // ── Stage 1 validation: process info ──────────────────────────
    if (!processForm.processType.trim()) {
      setProcessError('Pick a process type.')
      return
    }
    const weight = parseFloat(processForm.parchmentWeightKg)
    const moisture = parseFloat(processForm.moistureContent)
    if (isNaN(weight) || weight <= 0) {
      setProcessError('Parchment weight must be greater than 0.')
      return
    }
    // Sanity check only: the whole cherry lot is consumed regardless of this
    // figure, but parchment can never weigh more than the cherry it came
    // from. Same sentence as the server-side check.
    const cherryWeightKg = getHarvestLotCherryWeight(processLot)
    if (weight > cherryWeightKg) {
      setProcessError(
        `Parchment weight (${weight.toFixed(2)} kg) cannot exceed the cherry lot weight (${cherryWeightKg.toFixed(2)} kg).`,
      )
      return
    }
    if (isNaN(moisture) || moisture < 0 || moisture > 100) {
      setProcessError('Moisture must be between 0 and 100.')
      return
    }
    if (
      processForm.dryingStartDate &&
      processForm.dryingEndDate &&
      new Date(processForm.dryingEndDate) <
        new Date(processForm.dryingStartDate)
    ) {
      setProcessError('Drying end must not be before drying start.')
      return
    }

    // ── Stage 2 validation: grade splits ─────────────────────────
    // Refuse a half-filled row instead of silently leaving it (and the
    // kg or price on it) out; only rows with nothing typed are skipped.
    const rowProblem = gradeSplitRowProblem(gradeRows)
    if (rowProblem) {
      setProcessError(rowProblem)
      return
    }
    const rows = gradeRows.filter(
      (r) => r.weight.trim() !== '' || r.price.trim() !== '',
    )
    if (rows.length === 0) {
      setProcessError('Add at least one grade split for the green beans.')
      return
    }
    const seen = new Set<string>()
    for (const r of rows) {
      if (seen.has(r.grade)) {
        setProcessError(`Duplicate grade: ${r.grade}.`)
        return
      }
      seen.add(r.grade)
    }
    // The price is optional, but one that is typed must be valid.
    if (hasGradePriceError(gradeRows)) {
      setProcessError(
        'Fix the price per kg: leave it empty or enter a number above 0 with at most 2 decimals.',
      )
      return
    }
    const totalGreen = rows.reduce(
      (s, r) => s + (parseFloat(r.weight) || 0),
      0,
    )
    if (totalGreen > weight + 0.01) {
      setProcessError(
        `Green-bean total ${totalGreen.toFixed(2)} kg exceeds parchment ${weight.toFixed(2)} kg.`,
      )
      return
    }

    setProcessSubmitting(true)
    let batchCreated = false
    try {
      // Stage 1: create batch + parchment lot
      const batch = await addProcessingBatch({
        harvestLotId: processLot.id,
        status: ProcessingBatchStatus.Completed,
        processType: processForm.processType,
        processNotes: processForm.notes || undefined,
        cropYearId: processForm.cropYearId || undefined,
        parchmentWeightKg: weight,
        moistureContent: moisture,
        dryingStartDate: processForm.dryingStartDate || undefined,
        dryingEndDate: processForm.dryingEndDate || undefined,
      })

      batchCreated = true
      setData((prev) => ({
        ...prev,
        harvestLots: prev.harvestLots.map((lot) => lot.id === batch.harvestLotId
          ? { ...lot, status: 'Complete', remainingWeightKg: 0 }
          : lot),
        processingBatches: [...prev.processingBatches.filter((item) => item.id !== batch.id), batch],
      }))

      // Find the parchment lot just created by this batch
      const newParchmentLots = await getAllParchmentLots(batch.id)
      const newParchment = newParchmentLots[0]
      if (!newParchment) {
        throw new Error(
          'Parchment lot was not created. Please refresh and try again.',
        )
      }

      // Stage 2: hull-and-grade the parchment → green-bean lots
      const { parchmentLot: hulledParchment, greenBeanLots: newGreenBeanLots } =
        await createParchmentWithdrawal(newParchment.id, {
          amountKg: newParchment.currentWeightKg,
          withdrawalType: 'HullAndGrade',
          purpose: 'Hull and grade',
          totalGreenBeanWeight: totalGreen,
          gradedLots: rows.map((r) => {
            const price = parseGradePrice(r.price)
            return {
              grade: r.grade,
              weight: parseFloat(r.weight),
              ...(price !== undefined && { price }),
            }
          }),
        })

      // Show the new green-bean lots (price included) straight away, with
      // their parchment lot so they group under the right process type,
      // even if the reload below fails.
      setData((prev) => ({
        ...prev,
        parchmentLots: [
          ...prev.parchmentLots.filter((p) => p.id !== hulledParchment.id),
          hulledParchment,
        ],
        greenBeanLots: [
          ...prev.greenBeanLots.filter(
            (g) => !newGreenBeanLots.some((n) => n.id === g.id),
          ),
          ...newGreenBeanLots,
        ],
      }))

      addToast({
        type: 'success',
        message: `Processed and graded ${fmt(totalGreen)} kg of green beans.`,
      })
      // The new lots are already on screen; close before the reload so a
      // slow refresh cannot hold the popup open.
      setProcessLot(null)
      await refreshData()
    } catch (e: any) {
      if (batchCreated) {
        // The cherry lot is consumed even when the later grading step fails.
        setProcessLot(null)
        addToast({
          type: 'error',
          message: 'Parchment was recorded for the whole lot. Grading failed; continue from Parchment Stock.',
        })
        await refreshData()
      } else {
        setProcessError(e?.message || 'Failed to process and grade.')
      }
    } finally {
      setProcessSubmitting(false)
    }
  }

  const openWithdraw = (b: Bucket) => {
    setWithdrawBucket(b)
    setWithdrawForm({ amount: '', type: 'Sale', purpose: '' })
    setWithdrawError(null)
    // A cancelled Sale must not carry its customer or price to the next bucket.
    withdrawDetails.reset()
  }

  const submitWithdraw = async () => {
    if (!withdrawBucket) return
    const bucket = withdrawBucket
    const amt = parseFloat(withdrawForm.amount)
    if (isNaN(amt) || amt <= 0) {
      setWithdrawError('Amount must be greater than 0.')
      return
    }
    if (amt > bucket.totalWeight + 0.01) {
      setWithdrawError(
        `Amount exceeds available ${bucket.totalWeight.toFixed(2)} kg.`,
      )
      return
    }
    // Checked before the first lot is drawn, so a refused Sale or Roast
    // leaves every lot untouched.
    const detailsError = withdrawDetailsError(
      withdrawForm.type,
      withdrawDetails.details,
    )
    if (detailsError) {
      setWithdrawError(detailsError)
      return
    }
    // Purpose is optional, as in the Workbench: left empty it is the type.
    const purpose = withdrawForm.purpose.trim() || withdrawForm.type
    // Every per-lot withdrawal carries the same sale / roaster fields, so each
    // lot's record names the customer and price, or pushes to the roaster.
    const details = buildWithdrawDetailsPayload(
      withdrawForm.type,
      withdrawDetails.details,
    )

    setWithdrawSubmitting(true)
    setWithdrawError(null)
    const taken = new Map<string, number>()
    let remaining = amt
    try {
      for (const gbl of bucket.sources) {
        if (remaining <= 0) break
        const take = Math.min(remaining, gbl.currentWeightKg ?? 0)
        if (take <= 0) continue
        await createGBLWithdrawal(gbl.id, {
          amountKg: take,
          withdrawalType: withdrawForm.type,
          purpose,
          ...details,
        })
        taken.set(gbl.id, take)
        // Kept at the backend's 6-decimal precision: plain float subtraction
        // (49.1 - 30.2 - 18.9 = 3.6e-15) would leave a crumb above 0 and send
        // one more, near-zero withdrawal carrying the Sale or roaster fields.
        remaining = Math.round((remaining - take) * 1e6) / 1e6
      }
    } catch (e: any) {
      const drawn = amt - remaining
      const reason = e?.message || 'Withdrawal failed.'
      if (drawn <= 0) {
        setWithdrawError(reason)
      } else {
        // The earlier lots are already drawn and stay drawn. Take them out of
        // this popup and leave only the rest to withdraw, so Save again
        // carries on from the lot that failed instead of repeating them.
        const left = parseFloat(remaining.toFixed(3))
        setWithdrawBucket({
          ...bucket,
          totalWeight: Math.max(0, bucket.totalWeight - drawn),
          sources: bucket.sources
            .map((g) => ({
              ...g,
              currentWeightKg:
                (g.currentWeightKg ?? 0) - (taken.get(g.id) ?? 0),
            }))
            .filter((g) => g.currentWeightKg > 0),
        })
        setWithdrawForm((f) => ({ ...f, amount: String(left) }))
        setWithdrawError(
          `Withdrew ${drawn.toFixed(2)} of ${amt.toFixed(2)} kg. The other ${left.toFixed(2)} kg were not withdrawn: ${reason}`,
        )
        void refreshData()
      }
      setWithdrawSubmitting(false)
      return
    }
    try {
      addToast({
        type: 'success',
        message: `Withdrew ${(amt - remaining).toFixed(2)} kg of ${bucket.processType} · ${bucket.grade}.`,
      })
      await refreshData()
      setWithdrawBucket(null)
    } catch (e) {
      setWithdrawError(
        (e instanceof Error && e.message) ||
          'Withdrawn, but the page could not reload.',
      )
    } finally {
      setWithdrawSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Parchment Stock</h1>
        <p className="text-sm text-gray-500 mt-1">
          One-step flow — process cherries straight to graded green beans, then
          withdraw from the inventory below.
        </p>
      </div>

      {/* KPI strip — each card uses its stage's accent colour + icon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Cherry"
          value={totals.cherry}
          unit="kg"
          accent="green"
          icon={Sprout}
          sub={`${readyHarvestLots.length} lot${readyHarvestLots.length !== 1 ? 's' : ''} ready`}
        />
        <KpiCard
          label="Parchment"
          value={totals.parchment}
          unit="kg"
          accent="amber"
          icon={Box}
          sub={`${parchmentByType.reduce((s, [, l]) => s + l.length, 0)} lot${parchmentByType.reduce((s, [, l]) => s + l.length, 0) !== 1 ? 's' : ''}`}
        />
        <KpiCard
          label="Green Bean"
          value={totals.greenBean}
          unit="kg"
          accent="teal"
          icon={Coffee}
          sub={`${greenBeanBuckets.length} grade${greenBeanBuckets.length !== 1 ? 's' : ''}`}
        />
      </div>

      {/* ─── Section 1: Incoming Harvest ───
          Single-stage entry point. Clicking "Process & Grade" on a row
          opens the combined modal that creates parchment + hulls + grades
          in one save, taking cherries straight to the Green Bean
          Inventory below. The intermediate parchment-in-stock list is
          intentionally hidden — for legacy parchments, use the
          Processor Workbench page. */}
      <Section
        title="Cherry Lots"
        count={readyHarvestLots.length}
        countLabel="lot"
        empty={readyHarvestLots.length === 0}
        emptyText="No cherries waiting. Add a harvest lot first."
        accent="green"
        icon={Sprout}
      >
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <Th>Lot</Th>
              <Th>Farmer</Th>
              <Th>Variety</Th>
              <Th align="right">Weight</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pagedHarvestLots.map((lot) => {
              const cherryWeight = getHarvestLotCherryWeight(lot)
              return (
                <tr key={lot.id} className="hover:bg-green-50/40 transition-colors">
                  <Td className="font-semibold text-gray-900">
                      {formatHarvestLotId(lot)}
                  </Td>
                  <Td>{lot.farmerName}</Td>
                  <Td className="text-gray-600">{lot.cherryVariety}</Td>
                  <Td align="right" className="font-semibold">
                    {fmt(cherryWeight)} kg
                  </Td>
                  <Td align="right">
                    <ActionButton
                      onClick={() => openProcess(lot)}
                      accent="green"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Process &amp; Grade
                    </ActionButton>
                  </Td>
                </tr>
              )
            })}
            {/* Pad a short last page out to a full one. Reserving a pixel
                height instead means hard-coding a row height, which goes
                stale the moment the cell padding changes. */}
            {Array.from({
              length: CHERRY_PAGE_SIZE - pagedHarvestLots.length,
            }).map((_, i) => (
              <tr key={`pad-${i}`} aria-hidden="true">
                <td colSpan={5} className="px-4 py-2.5">
                  <span className="inline-block px-3 py-1.5 text-xs">&nbsp;</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Pagination draws its own full-width strip (and renders nothing
            for a single page), so it goes in bare — wrapping it in another
            centred, bordered row left the strip floating as a grey box. */}
        <Pagination
          currentPage={cherrySafePage}
          totalPages={cherryTotalPages}
          onPageChange={setCherryPage}
        />
      </Section>

      {/* ─── Section 2: Green bean inventory — square cards by type+grade ───
          Each (process type, grade) bucket renders as a square-ish card
          inside its process-type group. Grid expands 2/3/4 columns based
          on viewport. */}
      <Section
        title="Green bean inventory"
        count={greenBeanBuckets.length}
        countLabel="grade"
        empty={greenBeanByType.length === 0}
        emptyText="No green-bean stock yet. Hull a parchment lot to fill this section."
        accent="teal"
        icon={Coffee}
      >
        <div className="divide-y divide-gray-100">
          {greenBeanByType.map(([type, buckets]) => {
            const isCollapsed = collapsedTypes.has(`g:${type}`)
            const typeTotal = buckets.reduce((s, b) => s + b.totalWeight, 0)
            return (
              <div key={type}>
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={(e) => toggleType(`g:${type}`, e.currentTarget)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                    <ProcessTypePill
                      type={type}
                      processTypes={data.processTypes}
                      className={PARCHMENT_PILL_SHAPE}
                    />
                    <span className="text-xs text-gray-400">
                      · {buckets.length} grade
                      {buckets.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">
                    {fmt(typeTotal)} kg
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="px-3 pb-4 pt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {buckets.map((b) => (
                      <div
                        key={b.grade}
                        className={`group bg-white border border-gray-200 border-l-4 ${processTypeColors(data.processTypes, b.processType).accent} rounded-xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col`}
                      >
                        {/* Header — Grade label + Process pill */}
                        <div className="flex items-center justify-between mb-3 gap-2">
                          <h3 className="text-sm font-bold text-gray-900 truncate">
                            {b.grade}
                          </h3>
                          <ProcessTypePill
                            type={b.processType}
                            processTypes={data.processTypes}
                            className={PARCHMENT_PILL_SHAPE}
                          />
                        </div>

                        {/* Hero weight */}
                        <p className="text-2xl font-extrabold text-gray-900 leading-none">
                          {fmt(b.totalWeight)}
                          <span className="text-xs font-medium text-gray-400 ml-1.5">
                            kg
                          </span>
                        </p>

                        {/* Sources count (static) + small History icon button.
                            The text stays informational; the icon button is
                            the click target — cleaner than making the whole
                            row clickable. */}
                        <div className="mt-1.5 mb-4 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-gray-500">
                            from {b.sources.length} source
                            {b.sources.length !== 1 ? 's' : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => setHistoryBucket(b)}
                            title="View source history"
                            aria-label="View source history"
                            className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 transition-colors flex-shrink-0"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Withdraw button — fades to full colour on card hover */}
                        <button
                          type="button"
                          onClick={() => openWithdraw(b)}
                          className="mt-auto w-full inline-flex items-center justify-center gap-1.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                        >
                          <Package className="h-3.5 w-3.5" />
                          Withdraw
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── Combined Process & Grade Modal ─────────────────────────
          One modal walks the operator through the full Cherry → Parchment
          → Green Bean pipeline in two clearly-labelled stages. Saving
          fires both API calls back-to-back and the resulting green-bean
          buckets appear in the Inventory grid below. */}
      {processLot && (() => {
        const cherryWeight = getHarvestLotCherryWeight(processLot)
        const parchKg = parseFloat(processForm.parchmentWeightKg) || 0

        const totalGreen = gradeRows.reduce(
          (s, r) => s + (parseFloat(r.weight) || 0),
          0,
        )
        const yieldPct = parchKg > 0 ? (totalGreen / parchKg) * 100 : 0
        const overflow = parchKg > 0 && totalGreen > parchKg + 0.01
        const priceError = hasGradePriceError(gradeRows)
        const rowProblem = gradeSplitRowProblem(gradeRows)
        // Green only when Save & Grade would go through.
        const ready = totalGreen > 0 && !overflow && !priceError && !rowProblem

        return (
          <Modal
            title="Process & Grade"
            subtitle={`Lot ${formatHarvestLotId(processLot)}`}
            onClose={() => setProcessLot(null)}
            accent="green"
            icon={Play}
            context={[
              { label: 'Variety', value: processLot.cherryVariety || '—' },
              { label: 'Whole Lot Weight', value: `${fmt(cherryWeight)} kg` },
              { label: 'Farmer', value: processLot.farmerName || '—' },
            ]}
          >
            {processError && <ErrorBanner message={processError} />}

            {/* ── Pipeline indicator — visual flow Cherry → Parchment → Green Bean
                Connector colours follow the upstream node so the bar
                gradient matches the stage palette (red → amber → emerald)
                instead of all-emerald. */}
            <div className="flex items-center justify-center gap-2 -mt-1">
              <PipelineNode
                label="Cherry"
                icon={Sprout}
                tone="green"
                state="active"
              />
              <PipelineConnector active tone="green" />
              <PipelineNode
                label="Parchment"
                icon={Box}
                tone="amber"
                state={parchKg > 0 ? 'active' : 'pending'}
              />
              <PipelineConnector
                active={totalGreen > 0 && !overflow}
                tone="amber"
              />
              <PipelineNode
                label="Green Bean"
                icon={Coffee}
                tone="teal"
                state={
                  totalGreen > 0 && !overflow ? 'active' : 'pending'
                }
              />
            </div>

            {/* ───────── STAGE 1: Process info ───────── */}
            <StageHeader
              step={1}
              label="Process"
              subtitle="How was this cherry processed?"
              tone="green"
            />

            <Field label="Process Type">
              <ProcessTypeChips
                value={processForm.processType}
                onChange={(t) =>
                  setProcessForm((f) => ({ ...f, processType: t }))
                }
                processTypes={data.processTypes}
              />
            </Field>

            {data.cropYears.length > 0 && (
              <Field label="Crop Year">
                <CropYearChips
                  years={data.cropYears}
                  value={processForm.cropYearId}
                  onChange={(v) =>
                    setProcessForm((f) => ({ ...f, cropYearId: v }))
                  }
                  accent="green"
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Parchment Output (kg)" icon={Scale}>
                <input
                  type="number"
                  step="0.1"
                  value={processForm.parchmentWeightKg}
                  onChange={(e) =>
                    setProcessForm((f) => ({
                      ...f,
                      parchmentWeightKg: e.target.value,
                    }))
                  }
                  placeholder="e.g. 85.0"
                  className="block w-full h-[46px] border border-gray-300 rounded-xl px-4 text-lg font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-all"
                />
                <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
                  The whole cherry lot ({cherryWeight.toFixed(2)} kg) is used up and leaves the Cherry Lots list.
                </p>
              </Field>
              <Field label="Moisture (%)" icon={Droplet}>
                <input
                  type="number"
                  step="0.1"
                  value={processForm.moistureContent}
                  onChange={(e) =>
                    setProcessForm((f) => ({
                      ...f,
                      moistureContent: e.target.value,
                    }))
                  }
                  placeholder="e.g. 12.0"
                  className="block w-full h-[46px] border border-gray-300 rounded-xl px-4 text-lg font-bold text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Drying Start (optional)" icon={Calendar}>
                <DatePicker
                  value={processForm.dryingStartDate}
                  onChange={(v) =>
                    setProcessForm((f) => ({ ...f, dryingStartDate: v }))
                  }
                  label=""
                />
              </Field>
              <Field label="Drying End (optional)" icon={Calendar}>
                <DatePicker
                  value={processForm.dryingEndDate}
                  onChange={(v) =>
                    setProcessForm((f) => ({ ...f, dryingEndDate: v }))
                  }
                  label=""
                />
              </Field>
            </div>

            <Field label="Notes (optional)" icon={FileText}>
              <textarea
                rows={2}
                value={processForm.notes}
                onChange={(e) =>
                  setProcessForm((f) => ({ ...f, notes: e.target.value }))
                }
                className={inputClass}
                placeholder="e.g. Ferment 24h, raised-bed drying"
              />
            </Field>

            {/* ───────── STAGE 2: Grade splits ───────── */}
            <StageHeader
              step={2}
              label="Grade Splits"
              subtitle="Divide the parchment into graded green-bean lots"
              tone="amber"
            />

            {/* Column headers (phones label each field instead) */}
            <div className="hidden sm:grid grid-cols-[1.75rem_minmax(0,1fr)_7rem_9rem_2rem] gap-2 px-2 -mb-1">
              <span />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Grade
              </span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Weight (kg)
              </span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Price / kg{' '}
                <span className="normal-case font-semibold tracking-normal">
                  (optional)
                </span>
              </span>
              <span />
            </div>

            {/* # | Grade | Weight | Price / kg | delete. On phones:
                # | Grade | delete, then Weight | Price. */}
            <div className="space-y-2">
              {gradeRows.map((row, i) => {
                const usedGrades = gradeRows
                  .map((r) => r.grade)
                  .filter(Boolean)
                return (
                  <div
                    key={row.rowKey}
                    className="grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_2rem] sm:grid-cols-[1.75rem_minmax(0,1fr)_7rem_9rem_2rem] gap-2 items-start bg-amber-50 border border-amber-100 rounded-xl px-2 py-2"
                  >
                    <div className="col-start-1 row-start-1 h-[46px] flex items-center">
                      <span className="w-7 h-7 bg-amber-600 text-white rounded-md flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                    </div>
                    <div className="col-start-2 col-span-2 row-start-1 sm:col-span-1 min-w-0">
                      <GradeDropdown
                        value={row.grade}
                        onChange={(v) => {
                          const next = [...gradeRows]
                          next[i] = { ...next[i], grade: v }
                          setGradeRows(next)
                        }}
                        usedGrades={usedGrades}
                        accent="amber"
                        size="md"
                      />
                    </div>
                    <div className="col-start-1 col-span-2 row-start-2 sm:col-start-3 sm:col-span-1 sm:row-start-1 min-w-0">
                      <span className="sm:hidden block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                        Weight (kg)
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        value={row.weight}
                        onChange={(e) => {
                          const next = [...gradeRows]
                          next[i] = { ...next[i], weight: e.target.value }
                          setGradeRows(next)
                        }}
                        placeholder="0.00"
                        aria-label={`Weight (kg), row ${i + 1}`}
                        className="w-full h-[46px] border border-gray-300 rounded-xl px-4 text-base font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all bg-white"
                      />
                    </div>
                    <div className="col-start-3 col-span-2 row-start-2 sm:col-start-4 sm:col-span-1 sm:row-start-1 min-w-0">
                      <span className="sm:hidden block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                        Price / kg{' '}
                        <span className="normal-case font-semibold tracking-normal">
                          (optional)
                        </span>
                      </span>
                      <GradePriceInput
                        value={row.price}
                        onChange={(v) => {
                          const next = [...gradeRows]
                          next[i] = { ...next[i], price: v }
                          setGradeRows(next)
                        }}
                        row={i + 1}
                        accent="amber"
                        size="md"
                      />
                    </div>
                    <div className="col-start-4 row-start-1 sm:col-start-5 h-[46px] flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() =>
                          setGradeRows(gradeRows.filter((_, j) => j !== i))
                        }
                        disabled={gradeRows.length === 1}
                        aria-label={`Remove row ${i + 1}`}
                        className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() =>
                setGradeRows([
                  ...gradeRows,
                  { rowKey: newRowId(), grade: '', weight: '', price: '' },
                ])
              }
              disabled={gradeRows.length >= gradeNames.length}
              className="w-full py-2.5 border border-dashed border-amber-300 rounded-xl text-sm font-bold text-amber-700 hover:bg-amber-50 hover:border-amber-400 disabled:opacity-30 inline-flex items-center justify-center gap-1.5 transition-all"
            >
              <Plus className="h-3.5 w-3.5" /> Add grade
            </button>

            {/* Total + yield summary */}
            <div
              className={`rounded-xl border px-3 py-3 transition-colors ${
                overflow
                  ? 'bg-red-50 border-red-300'
                  : ready
                    ? 'bg-green-50 border-green-300'
                    : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                  Total green bean
                </span>
                {ready && <Check className="h-4 w-4 text-green-600" />}
                {overflow && <AlertCircle className="h-4 w-4 text-red-600" />}
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className={`text-2xl font-extrabold ${
                    overflow ? 'text-red-700' : 'text-green-600'
                  }`}
                >
                  {fmt(totalGreen)}
                </span>
                <span className="text-sm text-gray-500">kg</span>
                <span className="text-xs text-gray-500 ml-auto">
                  yield {yieldPct.toFixed(1)}%
                </span>
              </div>
              <GradeSplitValue rows={gradeRows} />
              {overflow && (
                <p className="text-[11px] text-red-700 mt-1.5 font-semibold">
                  Total exceeds parchment weight ({fmt(parchKg)} kg)
                </p>
              )}
              {!overflow && rowProblem && (
                <p className="text-[11px] text-red-700 mt-1.5 font-semibold">
                  {rowProblem}
                </p>
              )}
            </div>

            <ModalFooter
              onCancel={() => setProcessLot(null)}
              onSubmit={submitProcess}
              submitLabel={
                processSubmitting ? 'Processing...' : 'Save & Grade'
              }
              submitDisabled={
                processSubmitting || overflow || priceError || !!rowProblem
              }
              cancelDisabled={processSubmitting}
              accent="green"
            />
          </Modal>
        )
      })()}

      {/* ── Withdraw Modal — mirrors Workbench Withdraw Stock ────── */}
      {withdrawBucket && (() => {
        const amtNum = parseFloat(withdrawForm.amount) || 0
        const before = withdrawBucket.totalWeight
        const after = Math.max(0, before - amtNum)
        const remainPct = before > 0 ? Math.max(0, (after / before) * 100) : 0
        const isOver = amtNum > before + 0.01
        // The whole amount's value, although it is drawn over several lots.
        const saleTotal = withdrawSaleTotal(
          withdrawForm.type,
          amtNum,
          withdrawDetails.details,
        )
        return (
          <Modal
            title="Withdraw Stock"
            subtitle={`${withdrawBucket.processType} · ${withdrawBucket.grade}`}
            onClose={() => setWithdrawBucket(null)}
            // Closed mid-way, a later lot's failure would reopen it (or take
            // over another bucket's popup) with the rest of this withdrawal.
            closeDisabled={withdrawSubmitting}
            accent="blueSolid"
            icon={Minus}
            context={[
              {
                label: 'Stock',
                value: `${fmt(withdrawBucket.totalWeight)} kg`,
              },
              { label: 'Grade', value: withdrawBucket.grade },
            ]}
          >
            {withdrawError && <ErrorBanner message={withdrawError} />}

            {/* Withdrawal Type — icon-card grid */}
            <div className="mb-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                Withdrawal Type
              </label>
              <div className="grid grid-cols-5 gap-2">
                {WITHDRAWAL_TYPE_CONFIG.map((c) => {
                  const Icon = c.icon
                  const isActive = withdrawForm.type === c.value
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() =>
                        setWithdrawForm((f) => ({ ...f, type: c.value }))
                      }
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                        isActive
                          ? c.active
                          : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-[11px] font-semibold leading-tight">
                        {c.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Sale / Roasting Stock fields (shared with the Workbench) */}
            <WithdrawDetailsFields
              type={withdrawForm.type}
              {...withdrawDetails.fieldsProps}
            />

            {/* Amount + Purpose side-by-side (col-span 2 + 3) */}
            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Amount (kg){' '}
                  <span className="font-normal normal-case tracking-normal text-gray-400">
                    max {fmt(before)}
                  </span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  max={before}
                  required
                  value={withdrawForm.amount}
                  onChange={(e) =>
                    setWithdrawForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="0.0"
                  className={`block w-full h-[46px] border rounded-xl px-4 text-lg font-bold text-gray-800 focus:outline-none focus:ring-1 transition-all ${
                    isOver
                      ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
                      : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Purpose / Notes
                </label>
                <input
                  type="text"
                  value={withdrawForm.purpose}
                  onChange={(e) =>
                    setWithdrawForm((f) => ({ ...f, purpose: e.target.value }))
                  }
                  placeholder="e.g., Order #123, Sample roast..."
                  className="block w-full h-[46px] border border-gray-300 rounded-xl px-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Before → After preview */}
            <div
              className={`rounded-xl p-3 border transition-colors ${
                isOver ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="h-1.5 w-full bg-gray-200 rounded-full mb-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isOver ? 'bg-red-400' : 'bg-green-400'
                  }`}
                  style={{ width: `${remainPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-gray-400 text-[10px] uppercase tracking-wider">
                      Before
                    </span>
                    <p className="font-bold text-gray-600">
                      {fmt(before)} kg
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
                  <div>
                    <span className="text-gray-400 text-[10px] uppercase tracking-wider">
                      After
                    </span>
                    <p
                      className={`font-bold ${isOver ? 'text-red-600' : 'text-green-600'}`}
                    >
                      {fmt(after)} kg
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {saleTotal !== null && (
                    <>
                      <span className="text-gray-400 text-[10px] uppercase tracking-wider">
                        Total
                      </span>
                      <p className="font-bold text-blue-600">
                        {formatWithdrawTotal(
                          saleTotal,
                          withdrawDetails.details.currency,
                        )}
                      </p>
                    </>
                  )}
                  <p className="text-[10px] text-gray-400">
                    drawn FIFO from {withdrawBucket.sources.length} lot
                    {withdrawBucket.sources.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>

            <ModalFooter
              onCancel={() => setWithdrawBucket(null)}
              onSubmit={submitWithdraw}
              submitLabel={withdrawSubmitting ? 'Withdrawing...' : 'Save'}
              submitDisabled={withdrawSubmitting || isOver}
              accent="blueSolid"
            />
          </Modal>
        )
      })()}
      {/* "+ New customer" from the Sale fields; its overlay sits above the
          Withdraw Stock popup. */}
      {withdrawDetails.newCustomerModal}

      {/* ── History Modal — full provenance of a green-bean bucket ──
          Shows each source GBL, the parchment lot it was hulled from,
          and the originating harvest lot + farmer. Its withdrawals get
          Void and (a Sale) Edit for the lot's owner or Admin. */}
      {historyBucket && (
        <Modal
          title="Source History"
          subtitle={`${historyBucket.processType} · ${historyBucket.grade}`}
          onClose={() => setHistoryBucket(null)}
          accent="teal"
          icon={History}
          context={[
            {
              label: 'Total',
              value: `${fmt(
                historySources.reduce((sum, g) => sum + (g.currentWeightKg ?? 0), 0),
              )} kg`,
            },
            {
              label: 'Sources',
              value: `${historySources.length}`,
            },
          ]}
        >
          <div className="space-y-3">
            {historySources.map((gbl) => {
              const parchment = gbl.parchmentLotId
                ? data.parchmentLots.find(
                    (p) => p.id === gbl.parchmentLotId,
                  )
                : undefined
              const harvest = parchment?.harvestLotId
                ? data.harvestLots.find(
                    (h) => h.id === parchment.harvestLotId,
                  )
                : undefined
              const fmtDate = (s?: string) =>
                s ? new Date(s).toLocaleDateString() : '—'
              return (
                <div
                  key={gbl.id}
                  className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm"
                >
                  {/* Step 1 — the green-bean lot itself */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                        <Coffee className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {formatGreenBeanId(gbl)}
                        </p>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          Green Bean · {fmtDate(gbl.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-extrabold text-emerald-600">
                        {fmt(gbl.currentWeightKg ?? 0)} kg
                      </p>
                      <p className="text-[10px] font-semibold text-gray-500 leading-tight">
                        {gbl.pricePerKg
                          ? `${gbl.pricePerKg.toFixed(2)} ${gbl.currency || 'THB'}/kg`
                          : 'No price'}
                      </p>
                    </div>
                  </div>

                  {/* Step 2 — parchment ancestor */}
                  {parchment ? (
                    <div className="mt-2 ml-3 pl-4 border-l-2 border-dashed border-gray-200">
                      <div className="flex items-center gap-2 -ml-[22px]">
                        <ArrowDown className="h-3 w-3 text-gray-300" />
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                            <Box className="h-3 w-3" />
                          </div>
                          <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-700 truncate">
                                  {formatParchmentId(parchment)}
                              </p>
                              <p className="text-[10px] text-gray-400 leading-tight">
                                Parchment · {parchment.processType} ·{' '}
                                {parchment.moistureContent}% moisture
                              </p>
                            </div>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">
                              {fmtDate(parchment.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Step 3 — harvest ancestor */}
                      {harvest && (
                        <div className="mt-2 pl-4 border-l-2 border-dashed border-gray-200">
                          <div className="flex items-center gap-2 -ml-[22px]">
                            <ArrowDown className="h-3 w-3 text-gray-300" />
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="w-6 h-6 rounded-md bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0">
                                <Sprout className="h-3 w-3" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-gray-700 truncate">
                                    {formatHarvestLotId(harvest)}
                                </p>
                                <p className="text-[10px] text-gray-400 leading-tight">
                                  Cherry · {harvest.cherryVariety}
                                  {harvest.farmerName &&
                                    ` · Farmer: ${harvest.farmerName}`}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 ml-3 pl-4 border-l-2 border-dashed border-gray-200">
                      <p className="text-[11px] text-gray-400 italic -ml-2">
                        External / unknown source
                      </p>
                    </div>
                  )}

                  {/* Withdrawal history of this GBL, if any */}
                  {gbl.withdrawalHistory &&
                    gbl.withdrawalHistory.length > 0 && (
                      <div className="border-t border-gray-100 pt-2 mt-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                          Withdrawals ({gbl.withdrawalHistory.length})
                        </p>
                        <div className="space-y-1">
                          {gbl.withdrawalHistory.map((w, i) => {
                            // A voided row stays, struck through, with its
                            // reason; it no longer counts (D7).
                            const voided = isVoidedWithdrawal(w)
                            const managed = canManageGreenBeanLot(currentUser, gbl)
                            const target = {
                              kind: 'greenBean' as const,
                              lot: gbl,
                              withdrawal: w,
                            }
                            return (
                              <div
                                // Older records (and tests) may lack the
                                // backend id; then compose a content-stable
                                // key. Sort order is fixed once written.
                                key={w.id ?? `${gbl.id}-${w.date}-${w.withdrawalType}-${w.amountKg}-${i}`}
                                data-testid="source-withdrawal-row"
                                className={`text-[11px] ${voided ? 'text-gray-400' : 'text-gray-600'}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate">
                                    <span className="font-semibold">
                                      {w.withdrawalType}
                                    </span>
                                    {w.purpose && ` · ${w.purpose}`}
                                  </span>
                                  <span className="flex items-center gap-2 flex-shrink-0">
                                    {voided && <VoidedTag />}
                                    <span
                                      className={
                                        voided
                                          ? 'text-gray-400 line-through'
                                          : 'text-gray-500'
                                      }
                                    >
                                      {fmt(w.amountKg)} kg
                                    </span>
                                    <WithdrawalRowActions
                                      variant="compact"
                                      onEdit={
                                        canEditWithdrawalSale(managed, w)
                                          ? () => withdrawalCorrections.openEdit(target)
                                          : undefined
                                      }
                                      onVoid={
                                        canVoidWithdrawal(managed, w)
                                          ? () => withdrawalCorrections.openVoid(target)
                                          : undefined
                                      }
                                    />
                                  </span>
                                </div>
                                {voided && (
                                  <VoidedNote
                                    voidedAt={w.voidedAt}
                                    voidedByName={
                                      data.users.find((u) => u.id === w.voidedById)?.name
                                    }
                                    voidReason={w.voidReason}
                                  />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                </div>
              )
            })}
            {historySources.length === 0 && (
              <div className="text-center py-8 text-sm text-gray-400 italic">
                No sources recorded.
              </div>
            )}
          </div>
        </Modal>
      )}
      {/* Void / Edit a withdrawal, above the Source History popup. */}
      {withdrawalCorrections.modals}

      {/* Holds page height after a group collapses near the bottom; see
          useToggleScrollAnchor. Inline margin opts out of space-y-6. */}
      <div ref={groupSpacerRef} aria-hidden="true" style={{ marginTop: 0 }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Subcomponents — kept inline because the file's intentionally
// self-contained: one page = one file, no scattered helpers.
// ─────────────────────────────────────────────────────────────────────

type Accent = 'green' | 'amber' | 'teal' | 'gray' | 'blueSolid'

// Solid Tailwind classes per accent. Inlined as full strings so Tailwind's
// JIT picks them up (no template-literal class names that the scanner can't
// see).
// Per-stage palette, the same one the Processor Workbench uses so the two
// pages read as one system: Cherry = green, Parchment = amber, Green Bean
// = teal. Stage colour goes on borders, headers and icon blocks; the
// primary action buttons are all sky, as on the Workbench cards, so "the
// next step" looks the same wherever it appears.
const ACCENT: Record<
  Accent,
  {
    leftBorder: string
    headerBg: string
    headerText: string
    headerLabel: string
    valueText: string
    button: string
    buttonHover: string
    iconBlock: string
    iconRing: string
  }
> = {
  green: {
    leftBorder: 'border-l-green-500',
    headerBg: 'bg-green-50',
    headerText: 'text-green-900',
    headerLabel: 'text-green-700',
    valueText: 'text-green-700',
    button: 'bg-sky-600',
    buttonHover: 'hover:bg-sky-700',
    iconBlock: 'bg-green-600',
    iconRing: 'focus:ring-green-500',
  },
  amber: {
    leftBorder: 'border-l-amber-500',
    headerBg: 'bg-amber-50',
    headerText: 'text-amber-900',
    headerLabel: 'text-amber-700',
    valueText: 'text-amber-700',
    button: 'bg-sky-600',
    buttonHover: 'hover:bg-sky-700',
    iconBlock: 'bg-amber-500',
    iconRing: 'focus:ring-amber-500',
  },
  teal: {
    leftBorder: 'border-l-teal-500',
    headerBg: 'bg-teal-50',
    headerText: 'text-teal-900',
    headerLabel: 'text-teal-700',
    valueText: 'text-teal-700',
    button: 'bg-sky-600',
    buttonHover: 'hover:bg-sky-700',
    iconBlock: 'bg-teal-500',
    iconRing: 'focus:ring-teal-500',
  },
  gray: {
    leftBorder: 'border-l-gray-400',
    headerBg: 'bg-gray-50',
    headerText: 'text-gray-900',
    headerLabel: 'text-gray-600',
    valueText: 'text-gray-900',
    button: 'bg-gray-900',
    buttonHover: 'hover:bg-gray-800',
    iconBlock: 'bg-gray-900',
    iconRing: 'focus:ring-gray-500',
  },
  // Workbench-style: solid blue-600 (the primary colour, no gradient) icon
  // block + blue Save button. Used for the Withdraw Stock modal so it
  // mirrors the look of the Workbench's per-GBL Withdraw flow.
  blueSolid: {
    leftBorder: 'border-l-blue-500',
    headerBg: 'bg-blue-50',
    headerText: 'text-blue-900',
    headerLabel: 'text-blue-700',
    valueText: 'text-blue-700',
    button: 'bg-blue-600',
    buttonHover: 'hover:bg-blue-700',
    iconBlock: 'bg-blue-600',
    iconRing: 'focus:ring-blue-500',
  },
}

type IconType = React.ComponentType<{ className?: string }>

const KpiCard: React.FC<{
  label: string
  value: number
  unit: string
  accent?: Accent
  icon?: IconType
  sub?: string
}> = ({ label, value, unit, accent = 'gray', icon: Icon, sub }) => {
  const a = ACCENT[accent]
  return (
    <div
      className={`bg-white border border-gray-200 border-l-4 ${a.leftBorder} rounded-md px-4 py-3 flex items-center gap-3`}
    >
      {Icon && (
        <div
          className={`p-2.5 rounded-lg ${a.headerBg} ${a.headerLabel} flex-shrink-0`}
        >
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p
          className={`text-[11px] font-bold uppercase tracking-wider ${a.headerLabel}`}
        >
          {label}
        </p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5 leading-none">
          {fmt(value)}
          <span className="text-sm font-medium text-gray-400 ml-1">{unit}</span>
        </p>
        {sub && (
          <p className="text-[10px] text-gray-400 mt-1">{sub}</p>
        )}
      </div>
    </div>
  )
}

const Section: React.FC<{
  title: string
  count: number
  countLabel?: string
  empty: boolean
  emptyText: string
  children: React.ReactNode
  accent?: Accent
  icon?: IconType
}> = ({
  title,
  count,
  countLabel = 'lot',
  empty,
  emptyText,
  children,
  accent = 'gray',
  icon: Icon,
}) => {
  const a = ACCENT[accent]
  return (
    <section
      className={`bg-white border border-gray-200 border-l-4 ${a.leftBorder} rounded-md overflow-hidden`}
    >
      <header
        className={`px-4 py-3 border-b border-gray-200 flex items-center justify-between ${a.headerBg}`}
      >
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div
              className={`p-1.5 rounded-md bg-white ${a.headerLabel} border border-gray-200`}
            >
              <Icon className="h-4 w-4" />
            </div>
          )}
          <h2 className={`text-sm font-bold ${a.headerText}`}>{title}</h2>
        </div>
        <span className={`text-xs font-semibold ${a.headerLabel}`}>
          {count} {countLabel}
          {count !== 1 ? 's' : ''}
        </span>
      </header>
      {empty ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          {emptyText}
        </div>
      ) : (
        children
      )}
    </section>
  )
}

// Per-tone palette for the modal pipeline indicator. Active = filled,
// pending = outlined-grey. Keeps the indicator readable without competing
// with the form's primary colours.
const PIPELINE_TONE: Record<
  'green' | 'amber' | 'teal',
  { bg: string; ring: string; text: string }
> = {
  green: {
    bg: 'bg-green-500',
    ring: 'ring-green-200',
    text: 'text-green-700',
  },
  amber: {
    bg: 'bg-amber-500',
    ring: 'ring-amber-200',
    text: 'text-amber-700',
  },
  teal: {
    bg: 'bg-teal-500',
    ring: 'ring-teal-200',
    text: 'text-teal-700',
  },
}

const PipelineNode: React.FC<{
  label: string
  icon: IconType
  tone: 'green' | 'amber' | 'teal'
  state: 'active' | 'pending'
}> = ({ label, icon: Icon, tone, state }) => {
  const t = PIPELINE_TONE[tone]
  const isActive = state === 'active'
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
          isActive
            ? `${t.bg} text-white shadow-md ring-4 ${t.ring}`
            : 'bg-gray-100 text-gray-300 ring-1 ring-gray-200'
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span
        className={`text-[10px] font-bold uppercase tracking-wider ${
          isActive ? t.text : 'text-gray-400'
        }`}
      >
        {label}
      </span>
    </div>
  )
}

// Connector colour follows the upstream node's tone when active, so the
// pipeline visually blends green → amber → teal instead of jumping from
// green straight to teal.
const PipelineConnector: React.FC<{
  active?: boolean
  tone?: 'green' | 'amber' | 'teal'
}> = ({ active, tone = 'teal' }) => {
  const activeBg =
    tone === 'green'
      ? 'bg-green-400'
      : tone === 'amber'
        ? 'bg-amber-400'
        : 'bg-teal-400'
  return (
    <div
      className={`flex-1 max-w-16 h-0.5 rounded-full transition-colors ${
        active ? activeBg : 'bg-gray-200'
      }`}
    />
  )
}

// Tinted stage header — divides the modal into "Step 1" and "Step 2"
// blocks so a long combined form remains scannable.
const STAGE_TONE: Record<
  'green' | 'amber',
  { bg: string; border: string; text: string; badge: string }
> = {
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-900',
    badge: 'bg-green-600 text-white',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-900',
    badge: 'bg-amber-600 text-white',
  },
}

const StageHeader: React.FC<{
  step: number
  label: string
  subtitle?: string
  tone: 'green' | 'amber'
}> = ({ step, label, subtitle, tone }) => {
  const t = STAGE_TONE[tone]
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${t.bg} ${t.border}`}
    >
      <span
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold ${t.badge}`}
      >
        {step}
      </span>
      <div className="min-w-0">
        <p
          className={`text-sm font-bold leading-tight ${t.text}`}
        >
          {label}
        </p>
        {subtitle && (
          <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

const Th: React.FC<{
  children?: React.ReactNode
  align?: 'left' | 'right'
}> = ({ children, align = 'left' }) => (
  <th
    className={`px-4 py-2.5 text-${align} text-[11px] font-semibold uppercase tracking-wider text-gray-500`}
  >
    {children}
  </th>
)

const Td: React.FC<{
  children?: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}> = ({ children, align = 'left', className = '' }) => (
  <td className={`px-4 py-2.5 text-${align} ${className}`}>{children}</td>
)

const ActionButton: React.FC<{
  onClick: () => void
  children: React.ReactNode
  accent?: Accent
}> = ({ onClick, children, accent = 'gray' }) => {
  const a = ACCENT[accent]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${a.button} ${a.buttonHover} text-white rounded-md text-xs font-semibold transition-colors`}
    >
      {children}
    </button>
  )
}

const Modal: React.FC<{
  title: string
  subtitle: string
  onClose: () => void
  children: React.ReactNode
  accent?: Accent
  icon?: IconType
  context?: { label: string; value: string }[]
  size?: 'md' | 'lg'
  /** Disables the header X, e.g. while a save is still running. */
  closeDisabled?: boolean
}> = ({
  title,
  subtitle,
  onClose,
  children,
  accent = 'gray',
  icon: Icon,
  context,
  size = 'md',
  closeDisabled = false,
}) => {
  const a = ACCENT[accent]
  // Default 'md' = max-w-2xl matches the Workbench modal width so the modal
  // fills more of the viewport (the user complained the previous max-w-lg
  // looked half-empty on desktop). 'lg' bumps to max-w-4xl for richer
  // forms (e.g. Hull & Grade with many grade rows).
  const widthClass = size === 'lg' ? 'max-w-4xl' : 'max-w-2xl'
  // Portalled to <body> like the Workbench's modals: rendered in place, the
  // page's space-y-6 gave the fixed backdrop a 24px top margin, leaving an
  // undimmed strip across the top of the screen.
  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div
          className={`bg-white rounded-2xl shadow-2xl w-full ${widthClass} max-h-[92vh] overflow-hidden flex flex-col`}
        >
          <header className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {Icon && (
                <div
                  className={`p-2.5 ${a.iconBlock} rounded-xl shadow-md flex-shrink-0`}
                >
                  <Icon className="h-6 w-6 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-gray-900 leading-tight">
                  {title}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>
              </div>
            </div>

            {context && context.length > 0 && (
              <div className="hidden sm:flex items-center gap-3 text-right flex-shrink-0">
                {context.map((c, i) => (
                  <React.Fragment key={c.label}>
                    {i > 0 && <div className="w-px h-8 bg-gray-200" />}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        {c.label}
                      </p>
                      <p className="text-sm font-bold text-gray-800 leading-tight max-w-[160px] truncate">
                        {c.value}
                      </p>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={closeDisabled}
              aria-label="Close"
              className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 disabled:pointer-events-none flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            {children}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

const Field: React.FC<{
  label: string
  children: React.ReactNode
  icon?: IconType
}> = ({ label, children, icon: Icon }) => (
  <div>
    <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
      {Icon && <Icon className="h-3 w-3 text-gray-400" />}
      {label}
    </label>
    {children}
  </div>
)

const ErrorBanner: React.FC<{ message: string }> = ({ message }) => {
  const ref = useRef<HTMLDivElement>(null)
  // The banner sits at the top of a popup body that scrolls on a phone, so a
  // refused Save pressed at the bottom would otherwise show nothing.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [message])
  return (
    <div
      ref={ref}
      role="alert"
      className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2"
    >
      <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-red-800 font-medium">{message}</p>
    </div>
  )
}

const ModalFooter: React.FC<{
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
  submitDisabled?: boolean
  /** Defaults to `submitDisabled`; pass it when a form can be invalid but
   *  should still be cancellable. */
  cancelDisabled?: boolean
  accent?: Accent
}> = ({
  onCancel,
  onSubmit,
  submitLabel,
  submitDisabled,
  cancelDisabled = submitDisabled,
  accent = 'gray',
}) => {
  const a = ACCENT[accent]
  return (
    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 -mx-6 px-6 -mb-5 pb-4 bg-gray-50">
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelDisabled}
        className="px-6 py-2.5 border border-gray-300 bg-white rounded-xl shadow-sm text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 transition-all"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled}
        className={`px-6 py-2.5 ${a.button} ${a.buttonHover} text-white rounded-xl shadow-lg text-sm font-semibold disabled:opacity-50 transition-all inline-flex items-center gap-2`}
      >
        <Save className="h-4 w-4" />
        {submitLabel}
      </button>
    </div>
  )
}

const inputClass =
  'w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all'

const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 })

export default ParchmentTab
