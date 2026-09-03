import React, { useState, useMemo, useCallback } from 'react'
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
  GradeDropdown,
} from './workbench'
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

const PROCESS_TYPES = ['Honey', 'Natural', 'Washed'] as const

const GRADE_OPTIONS = [
  'Grade A',
  'Grade B',
  'Grade C',
  'Peaberry',
  'Screen 18',
  'Screen 17',
  'Screen 16',
  'Screen 15',
] as const

type WithdrawalType = 'Sale' | 'Sample' | 'Export' | 'Roasting Stock' | 'Other'

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
  void currentUser
  const { data, refreshData } = useDataContext()
  const { addToast } = useToast()

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
  const [gradeRows, setGradeRows] = useState<
    { rowKey: string; grade: string; weight: string }[]
  >(() => [{ rowKey: newRowId(), grade: 'Grade A', weight: '' }])
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

  // ── History modal state ────────────────────────────────────────
  // View-only modal showing the full provenance of a green-bean bucket:
  // each source GBL → its parchment lot → the originating harvest lot
  // (and farmer). Lets the operator answer "where did these beans come
  // from?" without leaving the page.
  const [historyBucket, setHistoryBucket] = useState<Bucket | null>(null)

  // Per-process-type collapse state — shared by Section 2 (Parchment) and
  // Section 3 (Green Bean) so both behave identically: chevron toggles a
  // process-type group's body, and the same key (e.g. "Honey") collapses
  // it across both sections at once.
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set())
  const toggleType = useCallback((t: string) => {
    setCollapsedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }, [])

  // ── Derived data ────────────────────────────────────────────────

  // Section 1: harvest lots ready for processing
  const readyHarvestLots = useMemo(() => {
    return data.harvestLots
      .filter((lot) => {
        const remaining =
          typeof lot.remainingWeightKg === 'number'
            ? lot.remainingWeightKg
            : lot.weightKg ?? 0
        if (lot.status === 'Ready for Processing') return remaining > 0
        if (lot.status === 'Complete')
          return typeof lot.remainingWeightKg === 'number'
            ? lot.remainingWeightKg > 0
            : false
        return false
      })
      .sort((a, b) => {
        const ac = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bc = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return bc - ac
      })
  }, [data.harvestLots])

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
  const greenBeanBuckets = useMemo<Bucket[]>(() => {
    const map = new Map<string, Bucket>()
    for (const gbl of data.greenBeanLots) {
      if (gbl.availabilityStatus !== 'Available') continue
      if ((gbl.currentWeightKg ?? 0) <= 0) continue
      const parchment = gbl.parchmentLotId
        ? data.parchmentLots.find((p) => p.id === gbl.parchmentLotId)
        : undefined
      const processType =
        parchment?.processType ??
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
  }, [data.greenBeanLots, data.parchmentLots])

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
      (s, l) => s + (l.remainingWeightKg ?? l.weightKg ?? 0),
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
      processType: 'Honey',
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
    setGradeRows([{ rowKey: newRowId(), grade: 'Grade A', weight: '' }])
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
    if (!processLot) return

    // ── Stage 1 validation: process info ──────────────────────────
    const weight = parseFloat(processForm.parchmentWeightKg)
    const moisture = parseFloat(processForm.moistureContent)
    if (isNaN(weight) || weight <= 0) {
      setProcessError('Parchment weight must be greater than 0.')
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
    const rows = gradeRows.filter((r) => r.grade && r.weight)
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
      const w = parseFloat(r.weight)
      if (isNaN(w) || w <= 0) {
        setProcessError(`Weight for ${r.grade} must be greater than 0.`)
        return
      }
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

      // Find the parchment lot just created by this batch
      const newParchmentLots = await getAllParchmentLots(batch.id)
      const newParchment = newParchmentLots[0]
      if (!newParchment) {
        throw new Error(
          'Parchment lot was not created. Please refresh and try again.',
        )
      }

      // Stage 2: hull-and-grade the parchment → green-bean lots
      await createParchmentWithdrawal(newParchment.id, {
        amountKg: newParchment.currentWeightKg,
        withdrawalType: 'HullAndGrade',
        purpose: 'Hull and grade',
        totalGreenBeanWeight: totalGreen,
        gradedLots: rows.map((r) => ({
          grade: r.grade,
          weight: parseFloat(r.weight),
        })),
      })

      addToast({
        type: 'success',
        message: `Processed and graded ${fmt(totalGreen)} kg of green beans.`,
      })
      await refreshData()
      setProcessLot(null)
    } catch (e: any) {
      setProcessError(e?.message || 'Failed to process and grade.')
    } finally {
      setProcessSubmitting(false)
    }
  }

  const openWithdraw = (b: Bucket) => {
    setWithdrawBucket(b)
    setWithdrawForm({ amount: '', type: 'Sale', purpose: '' })
    setWithdrawError(null)
  }

  const submitWithdraw = async () => {
    if (!withdrawBucket) return
    const amt = parseFloat(withdrawForm.amount)
    if (isNaN(amt) || amt <= 0) {
      setWithdrawError('Amount must be greater than 0.')
      return
    }
    if (amt > withdrawBucket.totalWeight + 0.01) {
      setWithdrawError(
        `Amount exceeds available ${withdrawBucket.totalWeight.toFixed(2)} kg.`,
      )
      return
    }
    if (!withdrawForm.purpose.trim()) {
      setWithdrawError('Purpose is required.')
      return
    }

    setWithdrawSubmitting(true)
    let drawn = 0
    let remaining = amt
    try {
      for (const gbl of withdrawBucket.sources) {
        if (remaining <= 0) break
        const take = Math.min(remaining, gbl.currentWeightKg ?? 0)
        if (take <= 0) continue
        await createGBLWithdrawal(gbl.id, {
          amountKg: take,
          withdrawalType: withdrawForm.type,
          purpose: withdrawForm.purpose,
        })
        drawn += take
        remaining -= take
      }
      addToast({
        type: 'success',
        message: `Withdrew ${drawn.toFixed(2)} kg of ${withdrawBucket.processType} · ${withdrawBucket.grade}.`,
      })
      await refreshData()
      setWithdrawBucket(null)
    } catch (e: any) {
      setWithdrawError(
        e?.message ||
          `Withdrew ${drawn.toFixed(2)} of ${amt.toFixed(2)} kg before failure.`,
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
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label="Cherry"
          value={totals.cherry}
          unit="kg"
          accent="red"
          icon={Leaf}
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
          accent="emerald"
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
        accent="red"
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
            {readyHarvestLots.map((lot) => {
              const remaining = lot.remainingWeightKg ?? lot.weightKg ?? 0
              return (
                <tr key={lot.id} className="hover:bg-red-50/40 transition-colors">
                  <Td className="font-semibold text-gray-900">
                      {formatHarvestLotId(lot)}
                  </Td>
                  <Td>{lot.farmerName}</Td>
                  <Td className="text-gray-600">{lot.cherryVariety}</Td>
                  <Td align="right" className="font-semibold">
                    {fmt(remaining)} kg
                  </Td>
                  <Td align="right">
                    <ActionButton
                      onClick={() => openProcess(lot)}
                      accent="red"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Process &amp; Grade
                    </ActionButton>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
        accent="emerald"
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
                  onClick={() => toggleType(`g:${type}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                    <ProcessTypePill type={type} />
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
                        className="group bg-white border border-gray-200 border-l-4 border-l-emerald-500 rounded-xl p-4 hover:shadow-md hover:border-l-emerald-600 hover:-translate-y-0.5 transition-all flex flex-col"
                      >
                        {/* Header — Grade label + Process pill */}
                        <div className="flex items-center justify-between mb-3 gap-2">
                          <h3 className="text-sm font-bold text-gray-900 truncate">
                            {b.grade}
                          </h3>
                          <ProcessTypePill type={b.processType} />
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
                            className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-colors flex-shrink-0"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Withdraw button — fades to full colour on card hover */}
                        <button
                          type="button"
                          onClick={() => openWithdraw(b)}
                          className="mt-auto w-full inline-flex items-center justify-center gap-1.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
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
        const cherryAvail =
          processLot.remainingWeightKg ?? processLot.weightKg ?? 0
        const parchKg = parseFloat(processForm.parchmentWeightKg) || 0
        const remainKg = Math.max(0, cherryAvail - parchKg)
        const usedPct =
          cherryAvail > 0 ? Math.min(100, (parchKg / cherryAvail) * 100) : 0

        const totalGreen = gradeRows.reduce(
          (s, r) => s + (parseFloat(r.weight) || 0),
          0,
        )
        const yieldPct = parchKg > 0 ? (totalGreen / parchKg) * 100 : 0
        const overflow = parchKg > 0 && totalGreen > parchKg + 0.01

        return (
          <Modal
            title="Process & Grade"
            subtitle={`Lot ${formatHarvestLotId(processLot)}`}
            onClose={() => setProcessLot(null)}
            accent="red"
            icon={Play}
            context={[
              { label: 'Variety', value: processLot.cherryVariety || '—' },
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
                tone="red"
                state="active"
              />
              <PipelineConnector active tone="red" />
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
                tone="emerald"
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
              tone="red"
            />

            <Field label="Process Type">
              <div className="grid grid-cols-3 gap-2">
                {PROCESS_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setProcessForm((f) => ({ ...f, processType: t }))
                    }
                    className={`px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                      processForm.processType === t
                        ? 'bg-red-600 text-white border-red-600 shadow-lg'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-red-400 hover:bg-red-50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            {data.cropYears.length > 0 && (
              <Field label="Crop Year">
                <CropYearChips
                  years={data.cropYears}
                  value={processForm.cropYearId}
                  onChange={(v) =>
                    setProcessForm((f) => ({ ...f, cropYearId: v }))
                  }
                  accent="red"
                />
              </Field>
            )}

            {/* Cherry weight bar — green progress shows how much cherry is
                being consumed by this process. */}
            <div className="rounded-xl p-3 border bg-gray-50 border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Cherry Weight Available
                </span>
                <span className="text-sm font-bold text-gray-800">
                  {fmt(cherryAvail)} kg
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-green-500"
                  style={{ width: `${100 - usedPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">
                    Used
                  </span>
                  <span className="text-xs font-semibold text-gray-700">
                    {fmt(parchKg)} kg
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">
                    Remaining
                  </span>
                  <span className="text-xs font-semibold text-green-600">
                    {fmt(remainKg)} kg
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Parchment Weight (kg)" icon={Scale}>
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

            <div className="space-y-2">
              {gradeRows.map((row, i) => {
                const usedGrades = gradeRows
                  .map((r) => r.grade)
                  .filter(Boolean)
                return (
                  <div
                    key={row.rowKey}
                    className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-2 py-2"
                  >
                    <span className="flex-shrink-0 w-7 h-7 bg-amber-600 text-white rounded-md flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
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
                    <input
                      type="number"
                      step="0.1"
                      value={row.weight}
                      onChange={(e) => {
                        const next = [...gradeRows]
                        next[i] = { ...next[i], weight: e.target.value }
                        setGradeRows(next)
                      }}
                      placeholder="kg"
                      className="w-28 h-[46px] border border-gray-300 rounded-xl px-4 text-base font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all bg-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setGradeRows(gradeRows.filter((_, j) => j !== i))
                      }
                      disabled={gradeRows.length === 1}
                      className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() =>
                setGradeRows([...gradeRows, { rowKey: newRowId(), grade: '', weight: '' }])
              }
              disabled={gradeRows.length >= GRADE_OPTIONS.length}
              className="w-full py-2.5 border border-dashed border-amber-300 rounded-xl text-sm font-bold text-amber-700 hover:bg-amber-50 hover:border-amber-400 disabled:opacity-30 inline-flex items-center justify-center gap-1.5 transition-all"
            >
              <Plus className="h-3.5 w-3.5" /> Add grade
            </button>

            {/* Total + yield summary */}
            <div
              className={`rounded-xl border px-3 py-3 transition-colors ${
                overflow
                  ? 'bg-red-50 border-red-300'
                  : totalGreen > 0
                    ? 'bg-green-50 border-green-300'
                    : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                  Total green bean
                </span>
                {totalGreen > 0 && !overflow && (
                  <Check className="h-4 w-4 text-green-600" />
                )}
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
              {overflow && (
                <p className="text-[11px] text-red-700 mt-1.5 font-semibold">
                  Total exceeds parchment weight ({fmt(parchKg)} kg)
                </p>
              )}
            </div>

            <ModalFooter
              onCancel={() => setProcessLot(null)}
              onSubmit={submitProcess}
              submitLabel={
                processSubmitting ? 'Processing...' : 'Save & Grade'
              }
              submitDisabled={processSubmitting || overflow}
              accent="red"
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
        return (
          <Modal
            title="Withdraw Stock"
            subtitle={`${withdrawBucket.processType} · ${withdrawBucket.grade}`}
            onClose={() => setWithdrawBucket(null)}
            accent="indigoSolid"
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
                      : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
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
                  className="block w-full h-[46px] border border-gray-300 rounded-xl px-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
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
                <div className="text-[10px] text-gray-400">
                  drawn FIFO from {withdrawBucket.sources.length} lot
                  {withdrawBucket.sources.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            <ModalFooter
              onCancel={() => setWithdrawBucket(null)}
              onSubmit={submitWithdraw}
              submitLabel={withdrawSubmitting ? 'Withdrawing...' : 'Save'}
              submitDisabled={withdrawSubmitting || isOver}
              accent="indigoSolid"
            />
          </Modal>
        )
      })()}

      {/* ── History Modal — full provenance of a green-bean bucket ──
          Shows each source GBL, the parchment lot it was hulled from,
          and the originating harvest lot + farmer. View-only. */}
      {historyBucket && (
        <Modal
          title="Source History"
          subtitle={`${historyBucket.processType} · ${historyBucket.grade}`}
          onClose={() => setHistoryBucket(null)}
          accent="emerald"
          icon={History}
          context={[
            {
              label: 'Total',
              value: `${fmt(historyBucket.totalWeight)} kg`,
            },
            {
              label: 'Sources',
              value: `${historyBucket.sources.length}`,
            },
          ]}
        >
          <div className="space-y-3">
            {historyBucket.sources.map((gbl) => {
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
                    <span className="text-sm font-extrabold text-emerald-600 flex-shrink-0">
                      {fmt(gbl.currentWeightKg ?? 0)} kg
                    </span>
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
                              <div className="w-6 h-6 rounded-md bg-red-100 text-red-700 flex items-center justify-center flex-shrink-0">
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
                          {gbl.withdrawalHistory.map((w, i) => (
                            <div
                              // No backend id on these immutable records;
                              // compose a content-stable key. Sort order
                              // is fixed once written.
                              key={`${gbl.id}-${w.date}-${w.withdrawalType}-${w.amountKg}-${i}`}
                              className="text-[11px] flex items-center justify-between text-gray-600"
                            >
                              <span className="truncate">
                                <span className="font-semibold">
                                  {w.withdrawalType}
                                </span>
                                {w.purpose && ` · ${w.purpose}`}
                              </span>
                              <span className="text-gray-500 flex-shrink-0 ml-2">
                                {fmt(w.amountKg)} kg
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )
            })}
            {historyBucket.sources.length === 0 && (
              <div className="text-center py-8 text-sm text-gray-400 italic">
                No sources recorded.
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Subcomponents — kept inline because the file's intentionally
// self-contained: one page = one file, no scattered helpers.
// ─────────────────────────────────────────────────────────────────────

type Accent = 'red' | 'amber' | 'emerald' | 'gray' | 'indigoSolid'

// Solid Tailwind classes per accent. Inlined as full strings so Tailwind's
// JIT picks them up (no template-literal class names that the scanner can't
// see).
// Per-stage palette — Cherry/Parchment/Green-Bean each get their own colour
// so the operator visually distinguishes which stage of the pipeline a
// section/button/modal belongs to. The Workbench Record-Process modal
// uses a blue→indigo gradient on its icon block, but for this page each
// stage's modal mirrors the colour of the button that opened it (Process
// → red, Hull → amber, Withdraw → emerald) which makes the open→edit
// flow feel continuous.
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
  red: {
    leftBorder: 'border-l-red-500',
    headerBg: 'bg-red-50',
    headerText: 'text-red-900',
    headerLabel: 'text-red-700',
    valueText: 'text-red-700',
    button: 'bg-red-600',
    buttonHover: 'hover:bg-red-700',
    iconBlock: 'bg-gradient-to-br from-red-500 to-red-700',
    iconRing: 'focus:ring-red-500',
  },
  amber: {
    leftBorder: 'border-l-amber-500',
    headerBg: 'bg-amber-50',
    headerText: 'text-amber-900',
    headerLabel: 'text-amber-700',
    valueText: 'text-amber-700',
    button: 'bg-amber-600',
    buttonHover: 'hover:bg-amber-700',
    iconBlock: 'bg-gradient-to-br from-amber-500 to-orange-600',
    iconRing: 'focus:ring-amber-500',
  },
  emerald: {
    leftBorder: 'border-l-emerald-500',
    headerBg: 'bg-emerald-50',
    headerText: 'text-emerald-900',
    headerLabel: 'text-emerald-700',
    valueText: 'text-emerald-700',
    button: 'bg-emerald-600',
    buttonHover: 'hover:bg-emerald-700',
    iconBlock: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    iconRing: 'focus:ring-emerald-500',
  },
  gray: {
    leftBorder: 'border-l-gray-400',
    headerBg: 'bg-gray-50',
    headerText: 'text-gray-900',
    headerLabel: 'text-gray-600',
    valueText: 'text-gray-900',
    button: 'bg-gray-900',
    buttonHover: 'hover:bg-gray-800',
    iconBlock: 'bg-gradient-to-br from-gray-700 to-gray-900',
    iconRing: 'focus:ring-gray-500',
  },
  // Workbench-style — solid indigo (no gradient) icon block + indigo Save
  // button. Used for the Withdraw Stock modal so it mirrors the look of
  // the Workbench's per-GBL Withdraw flow.
  indigoSolid: {
    leftBorder: 'border-l-indigo-500',
    headerBg: 'bg-indigo-50',
    headerText: 'text-indigo-900',
    headerLabel: 'text-indigo-700',
    valueText: 'text-indigo-700',
    button: 'bg-indigo-600',
    buttonHover: 'hover:bg-indigo-700',
    iconBlock: 'bg-indigo-600',
    iconRing: 'focus:ring-indigo-500',
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

// Process-type pill — solid coloured background + border so each process
// (Honey/Natural/Washed) is visually distinguishable at a glance without
// needing the operator to read the label closely.
const PROCESS_PILL: Record<string, string> = {
  Honey: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Natural: 'bg-orange-100 text-orange-800 border-orange-200',
  Washed: 'bg-sky-100 text-sky-800 border-sky-200',
}

const ProcessTypePill: React.FC<{ type: string }> = ({ type }) => (
  <span
    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
      PROCESS_PILL[type] ||
      'bg-violet-100 text-violet-800 border-violet-200'
    }`}
  >
    {type}
  </span>
)

// Per-tone palette for the modal pipeline indicator. Active = filled,
// pending = outlined-grey. Keeps the indicator readable without competing
// with the form's primary colours.
const PIPELINE_TONE: Record<
  'red' | 'amber' | 'emerald',
  { bg: string; ring: string; text: string }
> = {
  red: {
    bg: 'bg-red-500',
    ring: 'ring-red-200',
    text: 'text-red-700',
  },
  amber: {
    bg: 'bg-amber-500',
    ring: 'ring-amber-200',
    text: 'text-amber-700',
  },
  emerald: {
    bg: 'bg-emerald-500',
    ring: 'ring-emerald-200',
    text: 'text-emerald-700',
  },
}

const PipelineNode: React.FC<{
  label: string
  icon: IconType
  tone: 'red' | 'amber' | 'emerald'
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
// pipeline visually blends red → amber → emerald instead of jumping from
// red straight to emerald (which clashed with the cherry-stage theme).
const PipelineConnector: React.FC<{
  active?: boolean
  tone?: 'red' | 'amber' | 'emerald'
}> = ({ active, tone = 'emerald' }) => {
  const activeBg =
    tone === 'red'
      ? 'bg-red-400'
      : tone === 'amber'
        ? 'bg-amber-400'
        : 'bg-emerald-400'
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
  'red' | 'amber',
  { bg: string; border: string; text: string; badge: string }
> = {
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-900',
    badge: 'bg-red-600 text-white',
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
  tone: 'red' | 'amber'
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
}> = ({
  title,
  subtitle,
  onClose,
  children,
  accent = 'gray',
  icon: Icon,
  context,
  size = 'md',
}) => {
  const a = ACCENT[accent]
  // Default 'md' = max-w-2xl matches the Workbench modal width so the modal
  // fills more of the viewport (the user complained the previous max-w-lg
  // looked half-empty on desktop). 'lg' bumps to max-w-4xl for richer
  // forms (e.g. Hull & Grade with many grade rows).
  const widthClass = size === 'lg' ? 'max-w-4xl' : 'max-w-2xl'
  return (
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
            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
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

const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2">
    <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
    <p className="text-xs text-red-800 font-medium">{message}</p>
  </div>
)

const ModalFooter: React.FC<{
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
  submitDisabled?: boolean
  accent?: Accent
}> = ({ onCancel, onSubmit, submitLabel, submitDisabled, accent = 'gray' }) => {
  const a = ACCENT[accent]
  return (
    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 -mx-6 px-6 -mb-5 pb-4 bg-gray-50">
      <button
        type="button"
        onClick={onCancel}
        disabled={submitDisabled}
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
