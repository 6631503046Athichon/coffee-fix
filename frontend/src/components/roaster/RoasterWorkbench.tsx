import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import DatePicker from '../common/DatePicker'
import Select from '../common/Select'
import { Modal } from '../common/Modal'
import { Button } from '../common/Button'
import { PageHeader } from '../common/PageHeader'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDataContext } from '../../hooks/useDataContext'
import { useGradeNames } from '../../hooks/useGradeOptions'
import {
  User,
  GreenBeanLot,
  RoasterInventoryItem,
  RoastLevel,
  GreenBeanSourceType,
  UserRole,
} from '../../types'
import { Package, Flame, Coffee, Loader2, ArrowRight, X } from 'lucide-react'
import ExternalLotsTable from './ExternalLotsTable'
import InternalLotsTable from './InternalLotsTable'
import RoastLogPanel from './RoastLogPanel'
import { FLAVOR_GROUPS } from './flavorGroups'
import { toFixed2, clamp, toRoaId, toRoastBatchId } from '../../utils/formatters'
import { claimGreenBeanLot, createRoastBatch } from '../../services/roaster/roasterService'
import { createGreenBeanLot } from '../../services/lots/greenBeanLotService'
import { formatGreenBeanId } from '../../utils/formatDisplayId'
import { useToast } from '../../contexts/ToastContext'

interface RoasterWorkbenchProps {
  currentUser: User
}

// Common coffee varieties for selection (mirrors Farmer form)
const COFFEE_VARIETIES = [
  'Gesha',
  'Caturra',
  'Bourbon',
  'Typica',
  'SL28',
  'SL34',
  'Pacamara',
  'Catuai',
  'Mundo Novo',
  'Maragogype',
  'Kent',
  'Blue Mountain',
  'Ethiopian Heirloom',
  'Java',
  'Tekisic',
]

const COMMON_PROCESS_TYPES = ['Washed', 'Natural', 'Honey', 'Anaerobic', 'Wet-Hulled']

const parseWeightInput = (value: string): number => {
  const normalized = value.trim().replace(',', '.')
  return normalized === '' ? 0 : Number(normalized)
}

// Removed local CustomDropdown in favor of shared Select component

const RoasterWorkbench: React.FC<RoasterWorkbenchProps> = ({ currentUser }) => {
  const { data, setData } = useDataContext()
  const gradeNames = useGradeNames()
  const location = useLocation()
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false)
  const [isAddLotModalOpen, setIsAddLotModalOpen] = useState(false)
  const [isLogRoastModalOpen, setIsLogRoastModalOpen] = useState(false)
  const [isRoastingLotId, setIsRoastingLotId] = useState<string | null>(null)
  const [isSubmittingRoast, setIsSubmittingRoast] = useState(false)
  const [selectedExternalLot, setSelectedExternalLot] = useState<
    (GreenBeanLot & { variety: string; process: string }) | null
  >(null)
  const [selectedLot, setSelectedLot] = useState<
    (GreenBeanLot & { variety: string; process: string; finalScore?: string | number }) | null
  >(null)
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<
    (RoasterInventoryItem & { variety: string; process: string }) | null
  >(null)
  const [claimAmount, setClaimAmount] = useState('')
  const [roastForm, setRoastForm] = useState({ batchSize: '', roastedWeight: '', notes: '' })
  const [roastLevel, setRoastLevel] = useState<RoastLevel>(RoastLevel.Medium)
  const [selectedAromaCategories, setSelectedAromaCategories] = useState<string[]>(['Sweet'])
  const [selectedFlavorTags, setSelectedFlavorTags] = useState<string[]>([])
  const availableLotsRef = useRef<HTMLButtonElement>(null)
  const internalLotsRef = useRef<HTMLButtonElement>(null)
  const [lotsTab, setLotsTab] = useState<'internal' | 'external'>('internal')
  const roastLogRef = useRef<HTMLDivElement>(null)

  // Add External Lot form state
  const [isAddingLot, setIsAddingLot] = useState(false)
  const [newLotForm, setNewLotForm] = useState({
    originName: '',
    producerName: '',
    variety: '',
    processType: '',
    purchaseDate: new Date().toISOString().substring(0, 10),
    pricePerKg: '',
    currency: 'THB',
    initialWeightKg: '',
    grade: 'Grade A',
    supplierNotes: '',
    tasteNote: '',
  })

  const isAdmin = currentUser.roles?.includes(UserRole.Admin)

  const processTypeOptions = useMemo(() => {
    const configuredTypes = data.processTypes
      .filter((processType) => processType.isActive)
      .map((processType) => processType.name)
    return configuredTypes.length > 0 ? configuredTypes : COMMON_PROCESS_TYPES
  }, [data.processTypes])

  const getFinalScore = useCallback(
    (gbl: GreenBeanLot) => {
      let finalScore: string | number = 'N/A'
      const scoreInfo = gbl.cuppingScores[0]
      if (scoreInfo) {
        const session = data.cuppingSessions.find((s) => s.id === scoreInfo.sessionId)
        const sample = session?.samples.find((s) => s.greenBeanLotId === gbl.id)
        if (session && sample && session.finalResults && session.finalResults[sample.id]) {
          // Return as number; string formatting happens at render time
          finalScore = session.finalResults[sample.id].totalScore
        } else if (scoreInfo.score) {
          finalScore = scoreInfo.score
        }
      }
      return finalScore
    },
    [data.cuppingSessions],
  )

  // Map a lot to display fields
  const mapLotForDisplay = useCallback(
    (gbl: GreenBeanLot) => {
      if (gbl.sourceType === GreenBeanSourceType.External && gbl.externalSource) {
        const variety = gbl.externalSource.variety || 'N/A'
        const process = gbl.externalSource.processType || 'N/A'
        // No score shown for external lots in table
        // External: do not show grade in Info; show grade in its own column (or '-' if missing)
        const displayInfo = `${variety} / ${process}`
        const priceNumber = gbl.externalSource.pricePerKg
        const priceCurrency = gbl.externalSource.currency || gbl.currency || 'THB'
        const displayPrice =
          typeof priceNumber === 'number' && !isNaN(priceNumber)
            ? `${priceNumber.toFixed(2)} ${priceCurrency}`
            : undefined
        return {
          ...gbl,
          variety,
          process,
          // finalScore intentionally omitted for external table rendering
          displayInfo,
          displayPrice,
          gradeDisplay: gbl.grade || '—',
        } as GreenBeanLot & {
          variety: string
          process: string
          displayInfo: string
          displayPrice?: string
          gradeDisplay: string
        }
      }
      const parchmentLot = data.parchmentLots.find((p) => p.id === gbl.parchmentLotId)
      const harvestLot = data.harvestLots.find((h) => h.id === parchmentLot?.harvestLotId)
      const variety = harvestLot?.cherryVariety || 'N/A'
      const process = parchmentLot?.processType || 'N/A'
      const finalScore = getFinalScore(gbl)
      const displayScore = typeof finalScore === 'number' ? finalScore.toFixed(2) : '—'
      const displayInfo = `${variety} / ${process}`
      return {
        ...gbl,
        variety,
        process,
        finalScore,
        displayScore,
        displayInfo,
        gradeDisplay: gbl.grade || '—',
      } as GreenBeanLot & {
        variety: string
        process: string
        finalScore: string | number
        displayScore: string
        displayInfo: string
        gradeDisplay: string
      }
    },
    [data.parchmentLots, data.harvestLots, getFinalScore],
  )

  // Split into External and Internal lists (sorted by ID descending - newest first)
  const availableExternalLots = useMemo(
    () =>
      data.greenBeanLots
        .filter(
          (lot) =>
            lot.availabilityStatus === 'Available' &&
            lot.currentWeightKg > 0 &&
            lot.sourceType === GreenBeanSourceType.External,
        )
        .map(mapLotForDisplay)
        .sort((a, b) => b.id.localeCompare(a.id)),
    [data.greenBeanLots, mapLotForDisplay],
  )

  const availableInternalLots = useMemo(
    () =>
      data.greenBeanLots
        .filter(
          (lot) =>
            lot.availabilityStatus === 'Available' &&
            lot.currentWeightKg > 0 &&
            lot.sourceType === GreenBeanSourceType.Internal,
        )
        .map(mapLotForDisplay)
        .sort((a, b) => b.id.localeCompare(a.id)),
    [data.greenBeanLots, mapLotForDisplay],
  )

  const myInventory = useMemo(
    () =>
      data.roasterInventory
        .filter((item) => {
          if (item.remainingWeightKg <= 0.01) return false
          // Admins see all inventory; roasters see only their own
          return isAdmin || item.roasterId === currentUser.id
        })
        .sort((a, b) => b.id.localeCompare(a.id)),
    [data.roasterInventory, currentUser.id, isAdmin],
  )

  const myRoasts = useMemo(() => {
    const sortedRoasts = data.roastBatches
      .filter((roast) => roast.roasterId === currentUser.id)
      .sort((a, b) => new Date(b.roastDate).getTime() - new Date(a.roastDate).getTime())

    return sortedRoasts
      .map((roast) => {
        const gbl = data.greenBeanLots.find((lot) => lot.id === roast.greenBeanLotId)
        const inventory = data.roasterInventory.find(
          (item) =>
            item.id === roast.roasterInventoryId || item.greenBeanLotId === roast.greenBeanLotId,
        )
        const parchment = gbl?.parchmentLotId
          ? data.parchmentLots.find((item) => item.id === gbl.parchmentLotId)
          : undefined
        const harvest = parchment?.harvestLotId
          ? data.harvestLots.find((item) => item.id === parchment.harvestLotId)
          : undefined
        const formattedLotId = toRoaId(roast.greenBeanLotId)
        return {
          ...roast,
          greenBeanDisplayId: gbl?.displayId,
          formattedLotId,
          sourceVariety:
            gbl?.externalSource?.variety || inventory?.variety || harvest?.cherryVariety,
          sourceProcess:
            gbl?.externalSource?.processType || inventory?.process || parchment?.processType,
          sourceGrade: gbl?.grade || inventory?.grade,
        }
      })
      .map((roast, index) => ({
        ...roast,
        displayId: toRoastBatchId(roast.id),
      }))
  }, [
    data.roastBatches,
    data.greenBeanLots,
    data.parchmentLots,
    data.harvestLots,
    data.roasterInventory,
    currentUser.id,
  ])
  // Pagination for Roast Log
  const [page, setPage] = useState(1)
  const pageSize = 5
  const totalPages = Math.max(1, Math.ceil(myRoasts.length / pageSize))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [totalPages, page])
  const pagedRoasts = useMemo(
    () => myRoasts.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [myRoasts, page],
  )

  // Pagination for Inventory (withdrawal lots)
  const [inventoryPage, setInventoryPage] = useState(1)
  const inventoryPageSize = 6
  const inventoryTotalPages = Math.max(1, Math.ceil(myInventory.length / inventoryPageSize))
  useEffect(() => {
    if (inventoryPage > inventoryTotalPages) setInventoryPage(inventoryTotalPages)
  }, [inventoryTotalPages, inventoryPage])
  const pagedInventory = useMemo(
    () =>
      myInventory.slice(
        (inventoryPage - 1) * inventoryPageSize,
        (inventoryPage - 1) * inventoryPageSize + inventoryPageSize,
      ),
    [myInventory, inventoryPage],
  )

  // Pagination for External Lots
  const [externalPage, setExternalPage] = useState(1)
  const externalPageSize = 6
  const externalTotalPages = Math.max(1, Math.ceil(availableExternalLots.length / externalPageSize))
  useEffect(() => {
    if (externalPage > externalTotalPages) setExternalPage(externalTotalPages)
  }, [externalTotalPages, externalPage])
  const pagedExternalLots = useMemo(
    () =>
      availableExternalLots.slice(
        (externalPage - 1) * externalPageSize,
        (externalPage - 1) * externalPageSize + externalPageSize,
      ),
    [availableExternalLots, externalPage],
  )

  const openClaimModal = (
    lot: GreenBeanLot & { variety: string; process: string; finalScore?: string | number },
  ) => {
    setSelectedLot(lot)
    setClaimAmount('')
    setIsClaimModalOpen(true)
  }

  const openLogRoastModal = (
    inventoryItem: RoasterInventoryItem & { variety: string; process: string },
  ) => {
    setSelectedInventoryItem(inventoryItem)
    setRoastForm({ batchSize: '', roastedWeight: '', notes: '' })
    setRoastLevel(RoastLevel.Medium)

    const existing = (
      data.roastBatches
        .filter((r) => r.roasterId === currentUser.id && r.roasterInventoryId === inventoryItem.id)
        .at(-1)?.flavorNotes || ''
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    setSelectedFlavorTags(existing)
    setSelectedAromaCategories(['Sweet'])
    setIsLogRoastModalOpen(true)
  }

  const handleExternalRoast = (lot: GreenBeanLot & { variety: string; process: string }) => {
    // Open form instantly — no API call yet. We claim only the batch amount on submit.
    setSelectedExternalLot(lot)
    setSelectedInventoryItem(null)
    setRoastForm({ batchSize: '', roastedWeight: '', notes: '' })
    setRoastLevel(RoastLevel.Medium)
    setSelectedFlavorTags([])
    setSelectedAromaCategories(['Sweet'])
    setIsLogRoastModalOpen(true)
  }

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(claimAmount)
    if (!selectedLot || !amount || amount <= 0 || amount > selectedLot.currentWeightKg) {
      addToast({ type: 'error', message: 'จำนวนที่ Claim ไม่ถูกต้อง' })
      return
    }
    try {
      const { inventoryItem } = await claimGreenBeanLot(selectedLot.id, amount)
      setData((prev) => ({
        ...prev,
        roasterInventory: [...prev.roasterInventory, inventoryItem],
      }))
      addToast({ type: 'success', message: `Claim ${amount} kg สำเร็จ!` })
      setIsClaimModalOpen(false)
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถ Claim lot ได้',
      })
    }
  }

  const closeLogRoastModal = () => {
    setIsLogRoastModalOpen(false)
    setSelectedExternalLot(null)
    setIsSubmittingRoast(false)
  }

  const handleLogRoastSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const batchRaw = parseWeightInput(roastForm.batchSize)
    const roastedRaw = parseWeightInput(roastForm.roastedWeight)

    // ── External lot path: claim only the batch amount, then roast ──
    if (selectedExternalLot && !selectedInventoryItem) {
      if (isSubmittingRoast) return
      if (!batchRaw || batchRaw <= 0) {
        addToast({ type: 'error', message: 'กรุณากรอก Batch Size ที่ถูกต้อง' })
        return
      }
      if (!roastedRaw || roastedRaw <= 0) {
        addToast({ type: 'error', message: 'กรุณากรอก Roasted Weight ที่ถูกต้อง' })
        return
      }
      if (batchRaw > selectedExternalLot.currentWeightKg) {
        addToast({ type: 'error', message: 'Batch เกิน น้ำหนักที่มี' })
        return
      }
      if (roastedRaw > batchRaw) {
        addToast({ type: 'error', message: 'Roasted Weight ต้องไม่เกิน Batch Size' })
        return
      }

      const batch = toFixed2(clamp(batchRaw, 0.01, selectedExternalLot.currentWeightKg))
      const roasted = toFixed2(clamp(roastedRaw, 0.01, batch))
      const yieldPct = toFixed2((roasted / batch) * 100)
      const weightLossPct = toFixed2(100 - yieldPct)

      try {
        setIsSubmittingRoast(true)
        setIsRoastingLotId(selectedExternalLot.id)
        // 1. Claim exactly the batch amount from the lot
        const { inventoryItem, updatedSourceLot } = await claimGreenBeanLot(
          selectedExternalLot.id,
          batch,
        )
        // 2. Create roast batch against that inventory item
        const { roastBatch, updatedInventory } = await createRoastBatch({
          roasterInventoryId: inventoryItem.id,
          greenBeanLotId: selectedExternalLot.id,
          batchSizeKg: batch,
          yieldPercentage: yieldPct,
          roastedWeightKg: roasted,
          weightLossPct,
          roastLevel: roastLevel,
          roastProfileNotes: roastForm.notes?.trim() || 'No notes',
          flavorNotes: selectedFlavorTags.join(', ') || undefined,
        })
        setData((prev) => ({
          ...prev,
          roastBatches: [
            { ...roastBatch, formattedLotId: toRoaId(selectedExternalLot.id) } as any,
            ...prev.roastBatches,
          ],
          roasterInventory: (() => {
            const finalRemaining = updatedInventory.remainingWeightKg
            const exists = prev.roasterInventory.find((i) => i.id === inventoryItem.id)
            if (exists)
              return prev.roasterInventory.map((i) =>
                i.id === inventoryItem.id ? { ...i, remainingWeightKg: finalRemaining } : i,
              )
            return [
              ...prev.roasterInventory,
              { ...inventoryItem, remainingWeightKg: finalRemaining },
            ]
          })(),
          greenBeanLots: prev.greenBeanLots.map((l) =>
            updatedSourceLot && l.id === updatedSourceLot.id
              ? {
                  ...l,
                  currentWeightKg: updatedSourceLot.currentWeightKg,
                  availabilityStatus: updatedSourceLot.availabilityStatus,
                }
              : l,
          ),
        }))
        setPage(1)
        addToast({ type: 'success', message: `บันทึก Roast Batch ${batch} kg สำเร็จ!` })
        setIsLogRoastModalOpen(false)
        setSelectedExternalLot(null)
      } catch (err: any) {
        addToast({ type: 'error', message: err?.message || 'ไม่สามารถบันทึก Roast Batch ได้' })
      } finally {
        setIsSubmittingRoast(false)
        setIsRoastingLotId(null)
      }
      return
    }

    // ── Normal inventory path ──
    if (!selectedInventoryItem) return
    if (isSubmittingRoast) return

    if (!batchRaw || batchRaw <= 0) {
      addToast({ type: 'error', message: 'กรุณากรอก Batch Size ที่ถูกต้อง' })
      return
    }
    if (!roastedRaw || roastedRaw <= 0) {
      addToast({ type: 'error', message: 'กรุณากรอก Roasted Weight ที่ถูกต้อง' })
      return
    }
    if (batchRaw > selectedInventoryItem.remainingWeightKg) {
      addToast({ type: 'error', message: 'Batch เกิน inventory ที่มี' })
      return
    }
    if (roastedRaw > batchRaw) {
      addToast({ type: 'error', message: 'Roasted Weight ต้องไม่เกิน Batch Size' })
      return
    }

    const batch = toFixed2(clamp(batchRaw, 0.01, selectedInventoryItem.remainingWeightKg))
    const roasted = toFixed2(clamp(roastedRaw, 0.01, batch))
    const yieldPct = toFixed2((roasted / batch) * 100)
    const weightLossPct = toFixed2(100 - yieldPct)

    try {
      setIsSubmittingRoast(true)
      const { roastBatch, updatedInventory } = await createRoastBatch({
        roasterInventoryId: selectedInventoryItem.id,
        greenBeanLotId: selectedInventoryItem.greenBeanLotId,
        batchSizeKg: batch,
        yieldPercentage: yieldPct,
        roastedWeightKg: roasted,
        weightLossPct,
        roastLevel: roastLevel,
        roastProfileNotes: roastForm.notes?.trim() || 'No notes',
        flavorNotes: selectedFlavorTags.join(', ') || undefined,
      })
      setData((prev) => ({
        ...prev,
        roastBatches: [roastBatch, ...prev.roastBatches],
        roasterInventory: prev.roasterInventory.map((item) =>
          item.id === updatedInventory.id
            ? { ...item, remainingWeightKg: updatedInventory.remainingWeightKg }
            : item,
        ),
      }))
      setPage(1)
      addToast({ type: 'success', message: `บันทึก Roast Batch ${batch} kg สำเร็จ!` })
      setIsLogRoastModalOpen(false)
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถบันทึก Roast Batch ได้',
      })
    } finally {
      setIsSubmittingRoast(false)
    }
  }

  const handleQuickClaim = () => {
    const anyAvailable = [...availableExternalLots, ...availableInternalLots]
    if (anyAvailable.length === 0) {
      addToast({ type: 'warning', message: 'No green bean lots are available to claim right now.' })
      return
    }
    const pick =
      availableExternalLots.length > 0 ? availableExternalLots[0] : availableInternalLots[0]
    const targetRef = availableExternalLots.length > 0 ? availableLotsRef : internalLotsRef
    targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    openClaimModal(pick)
  }

  const handleQuickLogRoast = () => {
    if (myInventory.length === 0) {
      addToast({
        type: 'warning',
        message: 'You do not have inventory to log a roast. Claim a lot first.',
      })
      return
    }
    openLogRoastModal(myInventory[0] as RoasterInventoryItem & { variety: string; process: string })
  }

  const scrollToRoastLog = () => {
    roastLogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const quickActionHandlers = useRef({
    claim: handleQuickClaim,
    logRoast: handleQuickLogRoast,
    viewLog: scrollToRoastLog,
  })
  quickActionHandlers.current = {
    claim: handleQuickClaim,
    logRoast: handleQuickLogRoast,
    viewLog: scrollToRoastLog,
  }

  useEffect(() => {
    const state = location.state as { quickAction?: 'claim' | 'logRoast' | 'viewLog' } | null
    if (!state?.quickAction) return
    const action = quickActionHandlers.current[state.quickAction]
    if (action) action()
    navigate(location.pathname, { replace: true })
  }, [location, navigate])

  return (
    <div className="min-h-full bg-[#f7f8f5] pb-8">
      {/* Header Section */}
      <PageHeader
        title="Roaster's Workbench"
        description="Your daily view of available green beans, roasting stock, and batch history."
        icon={
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#d87832] shadow-sm shadow-orange-200">
            <Coffee className="h-7 w-7 text-white" />
          </div>
        }
        className="mb-5 border-[#e4e9e3] bg-gradient-to-br from-white via-white to-[#eef5ed] p-6 shadow-sm"
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dfe9df] bg-[#edf5ee] px-5 py-3.5">
        <div>
          <p className="text-sm font-bold text-[#294936]">Today's roasting desk</p>
          <p className="text-xs text-[#66806d]">
            Choose a lot below to move from green bean to roast log.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/roast-logbook')}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#2e6848] transition-colors hover:text-[#1c4932]"
        >
          View roast history <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3 lg:items-stretch">
        <div className="space-y-6 lg:col-span-2">
          {/* Green Bean Lots - Tabbed View */}
          <div className="overflow-hidden rounded-2xl border border-[#e2e8e1] bg-white shadow-sm">
            {/* Tab Header */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[#e6ebe5] bg-[#fafcf9] p-2">
              <button
                ref={internalLotsRef}
                onClick={() => setLotsTab('internal')}
                className={`min-w-[150px] flex-1 px-6 py-3 text-sm font-semibold transition-colors ${
                  lotsTab === 'internal'
                    ? 'rounded-xl bg-white text-[#2e6848] shadow-sm ring-1 ring-[#d5e2d7]'
                    : 'rounded-xl text-gray-500 hover:bg-white/70 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Package className="h-4 w-4" />
                  Internal Lots
                  <span className="ml-1 rounded-full bg-[#e9f2ec] px-2 py-0.5 text-xs text-[#2e6848]">
                    {myInventory.length}
                  </span>
                </div>
              </button>
              <button
                ref={availableLotsRef}
                onClick={() => setLotsTab('external')}
                className={`min-w-[150px] flex-1 px-6 py-3 text-sm font-semibold transition-colors ${
                  lotsTab === 'external'
                    ? 'rounded-xl bg-white text-[#2e6848] shadow-sm ring-1 ring-[#d5e2d7]'
                    : 'rounded-xl text-gray-500 hover:bg-white/70 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Package className="h-4 w-4" />
                  Purchased Lots
                  <span className="ml-1 rounded-full bg-[#e9f2ec] px-2 py-0.5 text-xs text-[#2e6848]">
                    {availableExternalLots.length}
                  </span>
                </div>
              </button>
            </div>

            {/* Tab Content */}
            {/* Grows with its cards (six per page, two columns) so nothing is
                cut off behind an inner scrollbar; the floor keeps a short or
                empty tab from collapsing the panel. */}
            <div className="min-h-[460px] bg-white">
              {lotsTab === 'internal' ? (
                <InternalLotsTable
                  lots={pagedInventory}
                  totalLots={myInventory.length}
                  totalWeightKg={myInventory.reduce((sum, lot) => sum + lot.remainingWeightKg, 0)}
                  onLogRoast={(lot) => openLogRoastModal(lot as any)}
                  currentPage={inventoryPage}
                  totalPages={inventoryTotalPages}
                  onPageChange={setInventoryPage}
                  hideHeader
                />
              ) : (
                <ExternalLotsTable
                  lots={pagedExternalLots as any}
                  onRoast={(lot) => handleExternalRoast(lot as any)}
                  onAddExternal={() => setIsAddLotModalOpen(true)}
                  currentPage={externalPage}
                  totalPages={externalTotalPages}
                  onPageChange={setExternalPage}
                  loadingLotId={isRoastingLotId}
                  hideHeader
                />
              )}
            </div>
          </div>
        </div>

        {/* Roast Log */}
        <div ref={roastLogRef} className="lg:relative">
          <RoastLogPanel
            roasts={pagedRoasts}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            onPageChange={(newPage) => setPage(newPage)}
            canManageRoast={(roast) => !!isAdmin || roast.roasterId === currentUser.id}
          />
        </div>
      </div>

      {/* Modals */}
      <Modal
        isOpen={isClaimModalOpen && !!selectedLot}
        onClose={() => setIsClaimModalOpen(false)}
        maxWidth="5xl"
      >
        {selectedLot && (
          <form onSubmit={handleClaimSubmit}>
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl shadow-sm">
                <Package className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Claim Stock</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Transfer green beans to your inventory
                </p>
              </div>
            </div>

            {/* Lot Details Card */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <span
                  className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white text-sm font-mono font-bold text-gray-900 shadow-sm border border-gray-200"
                  title={selectedLot.id}
                >
                  {formatGreenBeanId(selectedLot)}
                </span>
                <span
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full ${
                    selectedLot.finalScore !== 'N/A' && Number(selectedLot.finalScore) >= 85
                      ? 'bg-purple-100 text-purple-800'
                      : selectedLot.finalScore !== 'N/A' && Number(selectedLot.finalScore) >= 80
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  Score: {selectedLot.finalScore}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Variety
                  </p>
                  <p className="text-base font-bold text-gray-900">
                    {selectedLot.variety || 'N/A'}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Process
                  </p>
                  <p className="text-base font-bold text-gray-900">
                    {selectedLot.process || 'N/A'}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Grade
                  </p>
                  <p className="text-base font-bold text-gray-900">{selectedLot.grade || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Available Stock Display */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-green-800 mb-1">Available Stock</p>
                  <p className="text-4xl font-bold text-green-700">
                    {toFixed2(selectedLot.currentWeightKg)}{' '}
                    <span className="text-2xl font-medium">kg</span>
                  </p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <Coffee className="h-8 w-8 text-green-600" />
                </div>
              </div>
            </div>

            {/* Claim Amount Input */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-2">Amount to Claim</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max={selectedLot.currentWeightKg}
                  value={claimAmount}
                  onChange={(e) => setClaimAmount(e.target.value)}
                  required
                  className="w-full text-2xl font-bold text-gray-900 border-2 border-gray-200 rounded-xl px-5 py-4 pr-16 focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none transition-all"
                  placeholder="0.00"
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-lg font-semibold text-gray-400">
                  kg
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Enter the amount you want to transfer to your roasting inventory
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setIsClaimModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="success"
                size="lg"
                icon={<Package className="h-5 w-5" />}
              >
                Claim Stock
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={isLogRoastModalOpen && (!!selectedInventoryItem || !!selectedExternalLot)}
        onClose={closeLogRoastModal}
        maxWidth="2xl"
        showCloseButton={false}
        // Fixed height: picking flavors makes the content longer, and a dialog that is
        // centred and sized by its content would grow up and down under the cursor.
        className="h-[min(90vh,860px)]"
      >
        {(selectedInventoryItem || selectedExternalLot) &&
          (() => {
            const lotId = selectedInventoryItem?.greenBeanLotId ?? selectedExternalLot!.id
            const availableKg =
              selectedInventoryItem?.remainingWeightKg ?? selectedExternalLot!.currentWeightKg
            const batchValue = parseWeightInput(roastForm.batchSize)
            const roastedValue = parseWeightInput(roastForm.roastedWeight)
            const yieldPercentage =
              batchValue > 0 && roastedValue > 0 ? (roastedValue / batchValue) * 100 : 0
            const lossPercentage = yieldPercentage > 0 ? 100 - yieldPercentage : 0
            const remainingAfterRoast = Math.max(0, availableKg - (batchValue || 0))
            const weightInput =
              'block w-full rounded-xl border border-[#d6dfd7] bg-white py-3 pl-4 pr-12 text-xl font-bold text-[#294936] outline-none transition-all duration-200 placeholder:font-semibold placeholder:text-[#b3beb6] focus:border-[#d87832] focus:ring-4 focus:ring-orange-100'
            return (
              <form
                onSubmit={handleLogRoastSubmit}
                className="flex min-h-[calc(min(90vh,860px)_-_4rem)] flex-col text-[#263b31]"
              >
                {/* Header: pinned, only the fields between it and the footer scroll. */}
                <div className="sticky -top-8 z-10 -mx-8 -mt-8 mb-5 flex items-start justify-between gap-4 rounded-t-3xl bg-white px-8 pb-4 pt-8">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#d87832] shadow-sm shadow-orange-200">
                      <Flame className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                        Log a new roast
                      </h2>
                      <p className="mt-0.5 text-sm text-[#66756b]">
                        Lot{' '}
                        <span className="font-mono font-bold text-[#294936]">{toRoaId(lotId)}</span>{' '}
                        ·{' '}
                        <span className="font-semibold text-[#2e6848]">
                          {toFixed2(availableKg)} kg
                        </span>{' '}
                        available
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeLogRoastModal}
                    aria-label="Close"
                    title="Close"
                    className="-mr-2 -mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-[#718077] transition-colors hover:bg-[#f1f5f1] hover:text-[#294936]"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 space-y-6">
                  {/* 1. Weights */}
                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-base font-bold text-[#294936]">1. Batch weights</h3>
                      <button
                        type="button"
                        onClick={() =>
                          setRoastForm({
                            ...roastForm,
                            batchSize: toFixed2(availableKg).toString(),
                          })
                        }
                        className="rounded-lg border border-[#f0d3b8] bg-[#fff8ed] px-3 py-1.5 text-xs font-bold text-[#b45f22] transition-colors hover:bg-[#fff1df]"
                      >
                        Use all {toFixed2(availableKg)} kg
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="roast-batch-size"
                          className="mb-2 block text-sm font-semibold text-[#46564b]"
                        >
                          Green beans in
                        </label>
                        <div className="relative">
                          <input
                            id="roast-batch-size"
                            type="number"
                            min={0.01}
                            step="any"
                            required
                            max={availableKg}
                            value={roastForm.batchSize}
                            onChange={(e) =>
                              setRoastForm({ ...roastForm, batchSize: e.target.value })
                            }
                            onInvalid={(e) =>
                              (e.currentTarget as HTMLInputElement).setCustomValidity(
                                `Batch size must be between 0.01 and ${availableKg.toFixed(2)} kg`,
                              )
                            }
                            onInput={(e) =>
                              (e.currentTarget as HTMLInputElement).setCustomValidity('')
                            }
                            className={weightInput}
                            placeholder="0.00"
                          />
                          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#829188]">
                            kg
                          </span>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="roast-roasted-weight"
                          className="mb-2 block text-sm font-semibold text-[#46564b]"
                        >
                          Roasted beans out
                        </label>
                        <div className="relative">
                          <input
                            id="roast-roasted-weight"
                            type="number"
                            min={0.01}
                            step="any"
                            required
                            max={parseWeightInput(roastForm.batchSize) || undefined}
                            value={roastForm.roastedWeight}
                            onChange={(e) =>
                              setRoastForm({ ...roastForm, roastedWeight: e.target.value })
                            }
                            onInvalid={(e) =>
                              (e.currentTarget as HTMLInputElement).setCustomValidity(
                                parseWeightInput(roastForm.batchSize)
                                  ? `Roasted weight cannot exceed batch size (${parseWeightInput(roastForm.batchSize).toFixed(2)} kg)`
                                  : 'Please enter batch size first',
                              )
                            }
                            onInput={(e) =>
                              (e.currentTarget as HTMLInputElement).setCustomValidity('')
                            }
                            className={weightInput}
                            placeholder="0.00"
                          />
                          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#829188]">
                            kg
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* One live summary instead of three separate readouts */}
                    <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl border border-[#e2e8e1] bg-[#f7faf7]">
                      <div className="border-r border-[#e2e8e1] px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#829188]">
                          Yield
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-[#2e6848]">
                          {yieldPercentage ? `${yieldPercentage.toFixed(1)}%` : '—'}
                        </p>
                      </div>
                      <div className="border-r border-[#e2e8e1] px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#829188]">
                          Weight loss
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-[#d87832]">
                          {lossPercentage ? `${lossPercentage.toFixed(1)}%` : '—'}
                        </p>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#829188]">
                          Left in stock
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-[#294936]">
                          {toFixed2(remainingAfterRoast)}{' '}
                          <span className="text-xs font-semibold text-[#829188]">kg</span>
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* 2. Level */}
                  <section>
                    <h3 className="mb-3 text-base font-bold text-[#294936]">2. Roast level</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {[RoastLevel.Light, RoastLevel.Medium, RoastLevel.Dark].map((level) => (
                        <button
                          key={level}
                          type="button"
                          aria-pressed={roastLevel === level}
                          onClick={() => setRoastLevel(level)}
                          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition-all ${roastLevel === level ? 'border-[#d87832] bg-[#fff1df] text-[#b45f22] shadow-sm' : 'border-[#e2e8e1] bg-white text-[#718077] hover:border-[#b8cabe]'}`}
                        >
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${level === RoastLevel.Light ? 'bg-[#d5a455]' : level === RoastLevel.Medium ? 'bg-[#9b633b]' : 'bg-[#3d302b]'}`}
                          />
                          {level}
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* 3. Notes */}
                  <section>
                    <h3 className="mb-3 text-base font-bold text-[#294936]">
                      3. Notes and flavors{' '}
                      <span className="text-sm font-normal text-[#9aa69e]">(optional)</span>
                    </h3>
                    <label
                      htmlFor="roast-notes"
                      className="mb-2 block text-sm font-semibold text-[#46564b]"
                    >
                      Roast notes
                    </label>
                    <textarea
                      id="roast-notes"
                      rows={2}
                      value={roastForm.notes}
                      onChange={(e) => setRoastForm({ ...roastForm, notes: e.target.value })}
                      onInput={(e) => {
                        const el = e.currentTarget
                        el.style.height = 'auto'
                        el.style.height = el.scrollHeight + 'px'
                      }}
                      className="block max-h-40 w-full resize-none overflow-y-auto rounded-xl border border-[#d6dfd7] bg-white px-4 py-3 text-sm text-[#294936] outline-none transition-all duration-200 focus:border-[#d87832] focus:ring-4 focus:ring-orange-100"
                      placeholder="e.g., First crack at 9:30. Dropped at 11:15."
                    />

                    <p className="mb-2 mt-5 text-sm font-semibold text-[#46564b]">
                      Flavor notes{' '}
                      <span className="font-normal text-[#9aa69e]">— tap to add or remove</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(FLAVOR_GROUPS).map((category) => {
                        const isSelected = selectedAromaCategories.includes(category)
                        return (
                          <button
                            key={category}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() =>
                              setSelectedAromaCategories((prev) =>
                                isSelected
                                  ? prev.filter((item) => item !== category)
                                  : [...prev, category],
                              )
                            }
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${isSelected ? 'border-[#2e6848] bg-[#e9f2ec] text-[#2e6848]' : 'border-[#dfe9df] bg-white text-[#718077] hover:border-[#9cb8a6]'}`}
                          >
                            {category}
                          </button>
                        )
                      })}
                    </div>

                    {selectedAromaCategories.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-[#e2e8e1] bg-[#f7fbf7] p-3">
                        {selectedAromaCategories
                          .flatMap((category) => FLAVOR_GROUPS[category])
                          .map((note) => {
                            const isSelected = selectedFlavorTags.includes(note)
                            return (
                              <button
                                key={note}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() =>
                                  setSelectedFlavorTags((prev) =>
                                    isSelected
                                      ? prev.filter((item) => item !== note)
                                      : [...prev, note],
                                  )
                                }
                                className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${isSelected ? 'border-[#d87832] bg-[#fff1df] font-bold text-[#b45f22]' : 'border-transparent bg-white text-[#718077] hover:border-[#e2e8e1]'}`}
                              >
                                {note}
                              </button>
                            )
                          })}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-xl bg-[#f7faf7] px-3 py-3 text-xs text-[#829188]">
                        Choose a flavor group above to see its notes.
                      </p>
                    )}

                    {/* Always rendered: the first tag fills a row that is already there. */}
                    <div className="mt-3 flex min-h-[30px] flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[#829188]">Selected:</span>
                      {selectedFlavorTags.length === 0 && (
                        <span className="text-xs text-[#a2ada5]">none yet</span>
                      )}
                      {selectedFlavorTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1.5 rounded-full border border-yellow-200 bg-yellow-100 py-1 pl-3 pr-1.5 text-xs font-semibold text-yellow-800"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedFlavorTags((prev) => prev.filter((t) => t !== tag))
                            }
                            className="flex h-5 w-5 items-center justify-center rounded-full text-yellow-700 hover:bg-yellow-200 hover:text-yellow-900"
                            aria-label={`Remove ${tag}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </section>
                </div>

                {/* Always in reach: the footer sticks to the bottom of the dialog while it scrolls. */}
                <div className="sticky -bottom-8 z-10 -mx-8 -mb-8 mt-6 flex items-center justify-between gap-3 rounded-b-3xl border-t border-[#e8ece8] bg-white px-8 py-4">
                  <p className="hidden text-sm text-[#66756b] sm:block">
                    {batchValue && roastedValue
                      ? `${toFixed2(batchValue)} kg in → ${toFixed2(roastedValue)} kg out · ${roastLevel}`
                      : 'Enter both weights to log this roast.'}
                  </p>
                  <div className="flex flex-1 gap-3 sm:flex-none">
                    <Button type="button" variant="secondary" onClick={closeLogRoastModal}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      disabled={isSubmittingRoast}
                      icon={
                        isSubmittingRoast ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Flame className="h-4 w-4" />
                        )
                      }
                      className="flex-1 !bg-[#d87832] hover:!bg-[#bd5d1e] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                    >
                      {isSubmittingRoast ? 'Saving…' : 'Log Roast'}
                    </Button>
                  </div>
                </div>
              </form>
            )
          })()}
      </Modal>

      <Modal isOpen={isAddLotModalOpen} onClose={() => setIsAddLotModalOpen(false)} maxWidth="5xl">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const initial = parseFloat(newLotForm.initialWeightKg)
            const price = parseFloat(newLotForm.pricePerKg)
            if (!newLotForm.originName || !newLotForm.variety || !newLotForm.processType) {
              addToast({ type: 'error', message: 'Please fill origin, variety, and process type' })
              return
            }
            if (!initial || initial <= 0) {
              addToast({ type: 'error', message: 'Initial weight must be > 0' })
              return
            }
            if (newLotForm.pricePerKg !== '' && isNaN(price)) {
              addToast({ type: 'error', message: 'Enter a valid price' })
              return
            }

            try {
              if (isAddingLot) return
              setIsAddingLot(true)
              const lot = await createGreenBeanLot({
                sourceType: 'External',
                grade: newLotForm.grade || 'Grade A',
                initialWeightKg: initial,
                pricePerKg: isNaN(price) ? undefined : price,
                currency: newLotForm.currency,
                externalSource: {
                  originName: newLotForm.originName,
                  producerName: newLotForm.producerName || undefined,
                  variety: newLotForm.variety,
                  processType: newLotForm.processType,
                  purchaseDate: newLotForm.purchaseDate,
                  pricePerKg: isNaN(price) ? 0 : price,
                  currency: newLotForm.currency,
                  tasteNote: newLotForm.tasteNote || undefined,
                  supplierNotes: newLotForm.supplierNotes || undefined,
                },
              })
              setData((prev) => ({ ...prev, greenBeanLots: [lot, ...prev.greenBeanLots] }))
              addToast({ type: 'success', message: `เพิ่ม External Lot สำเร็จ!` })
              setIsAddLotModalOpen(false)
              setNewLotForm({
                originName: '',
                producerName: '',
                variety: '',
                processType: '',
                purchaseDate: new Date().toISOString().substring(0, 10),
                pricePerKg: '',
                currency: 'THB',
                initialWeightKg: '',
                grade: 'Grade A',
                supplierNotes: '',
                tasteNote: '',
              })
            } catch (err: unknown) {
              addToast({
                type: 'error',
                message: err instanceof Error ? err.message : 'ไม่สามารถเพิ่ม Lot ได้',
              })
            } finally {
              setIsAddingLot(false)
            }
          }}
        >
          <div className="mb-5 flex items-center gap-3 border-b border-[#e8ece8] pb-5">
            <div className="p-3 bg-green-100 rounded-xl">
              <Package className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[#20352b]">
                Add External Green Bean Lot
              </h2>
              <p className="mt-0.5 text-sm text-[#7b8a80]">Record externally purchased stock</p>
            </div>
          </div>

          {/* Top summary – only for purchase modal */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {newLotForm.originName.trim() && (
                <div>
                  <span className="font-semibold text-gray-900">Origin name:</span>{' '}
                  <span className="text-gray-700">{newLotForm.originName}</span>
                </div>
              )}
              {newLotForm.variety.trim() && (
                <div>
                  <span className="font-semibold text-gray-900">Variety:</span>{' '}
                  <span className="text-gray-700">{newLotForm.variety}</span>
                </div>
              )}
              {newLotForm.processType.trim() && (
                <div>
                  <span className="font-semibold text-gray-900">Process name:</span>{' '}
                  <span className="text-gray-700">{newLotForm.processType}</span>
                </div>
              )}
              {newLotForm.producerName.trim() && (
                <div>
                  <span className="font-semibold text-gray-900">Producer:</span>{' '}
                  <span className="text-gray-700">{newLotForm.producerName}</span>
                </div>
              )}
              {newLotForm.tasteNote.trim() && (
                <div>
                  <span className="font-semibold text-gray-900">Taste note:</span>{' '}
                  <span className="text-gray-700">{newLotForm.tasteNote}</span>
                </div>
              )}
              {newLotForm.pricePerKg.trim() && (
                <div className="md:col-span-2">
                  <span className="font-semibold text-gray-900">Price:</span>{' '}
                  <span className="text-gray-700">
                    {`${parseFloat(newLotForm.pricePerKg).toFixed(2)} ${newLotForm.currency}`}
                  </span>
                </div>
              )}
              {!newLotForm.originName.trim() &&
                !newLotForm.variety.trim() &&
                !newLotForm.processType.trim() &&
                !newLotForm.producerName.trim() &&
                !newLotForm.tasteNote.trim() &&
                !newLotForm.pricePerKg.trim() && (
                  <div className="md:col-span-2 text-gray-500">No details entered yet.</div>
                )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Origin / Supplier
              </label>
              <input
                className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3"
                value={newLotForm.originName}
                onChange={(e) => setNewLotForm({ ...newLotForm, originName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Producer</label>
              <input
                className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3"
                value={newLotForm.producerName}
                onChange={(e) => setNewLotForm({ ...newLotForm, producerName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Variety</label>
              <Select
                value={newLotForm.variety}
                onChange={(v) => setNewLotForm({ ...newLotForm, variety: (v as string) || '' })}
                options={COFFEE_VARIETIES}
                placeholder="Select variety..."
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">
                Process Type <span className="text-[#d87832]">*</span>
              </label>
              <Select
                value={newLotForm.processType}
                onChange={(v) => setNewLotForm({ ...newLotForm, processType: (v as string) || '' })}
                options={processTypeOptions}
                placeholder="Select process type..."
                colorTheme="emerald"
              />
              <p className="mt-1.5 text-xs text-gray-500">Choose how this lot was processed.</p>
            </div>
            <div>
              <DatePicker
                value={newLotForm.purchaseDate}
                onChange={(d) => setNewLotForm({ ...newLotForm, purchaseDate: d })}
                label="Purchase Date"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Initial Weight (kg)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3"
                value={newLotForm.initialWeightKg}
                onChange={(e) => setNewLotForm({ ...newLotForm, initialWeightKg: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Grade</label>
              <Select
                value={newLotForm.grade}
                onChange={(v) => setNewLotForm({ ...newLotForm, grade: (v as string) || '' })}
                options={gradeNames}
                placeholder="Select grade..."
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Price/kg (THB)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3"
                value={newLotForm.pricePerKg}
                onChange={(e) => setNewLotForm({ ...newLotForm, pricePerKg: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Total Price (THB)
              </label>
              <input
                type="text"
                readOnly
                className="block w-full border-2 border-gray-200 bg-gray-50 rounded-xl py-2.5 px-3 font-semibold text-green-700"
                value={
                  newLotForm.pricePerKg && newLotForm.initialWeightKg
                    ? (
                        parseFloat(newLotForm.pricePerKg) * parseFloat(newLotForm.initialWeightKg)
                      ).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '0.00'
                }
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Taste Note (optional)
              </label>
              <input
                className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3"
                value={newLotForm.tasteNote}
                onChange={(e) => setNewLotForm({ ...newLotForm, tasteNote: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">Supplier Notes</label>
              <textarea
                rows={2}
                className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3 resize-none overflow-hidden"
                value={newLotForm.supplierNotes}
                onChange={(e) => setNewLotForm({ ...newLotForm, supplierNotes: e.target.value })}
                onInput={(e) => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = el.scrollHeight + 'px'
                }}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsAddLotModalOpen(false)}
              disabled={isAddingLot}
            >
              Cancel
            </Button>
            <Button type="submit" variant="success" disabled={isAddingLot}>
              {isAddingLot ? 'Adding...' : 'Add Lot'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default RoasterWorkbench
