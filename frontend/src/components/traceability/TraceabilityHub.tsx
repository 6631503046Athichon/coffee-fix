import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDataContext } from '@/hooks/useDataContext'
import { useGradeNames } from '@/hooks/useGradeOptions'
import Select from '@/components/common/Select';
import { useAuth } from '@/contexts/AuthContext';
import { Search, ExternalLink, CheckCircle, Archive, AlertCircle, ChevronLeft, ChevronRight, QrCode, Star } from 'lucide-react';
import { UserRole, GreenBeanLot } from '@/types';
import { formatGreenBeanId } from '@/utils/formatDisplayId'
import { toRoaId } from '@/utils/formatters'
import { isAdminUser } from '@/utils/farmAccess';
import { canManageGreenBeanLot } from '@/components/processor/workbench/stockAccess';
import { QRCodeModal } from '@/components/traceability/modals/QRCodeModal';

const PAGE_SIZE = 10
const NEW_TAG_HOURS = 24

const isRecentLot = (dateString?: string | null): boolean => {
  if (!dateString) return false
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false
  const diffHours = (Date.now() - date.getTime()) / (1000 * 60 * 60)
  return diffHours >= 0 && diffHours <= NEW_TAG_HOURS
}

// What a row without a process or variety shows, and the filter option for it.
const UNKNOWN = 'Unknown'

/**
 * Filter dropdown values: 'All', then the distinct values present, in
 * `order` when given (values not in it after, alphabetically). UNKNOWN goes
 * last so a placeholder never sits between real values; it is only offered
 * when some row has no value.
 */
const filterOptions = (values: (string | undefined)[], order: string[] = []): string[] => {
  const rank = new Map(order.map((name, i) => [name, i]))
  const distinct = Array.from(new Set(values.filter((v): v is string => Boolean(v))))
  distinct.sort((a, b) => {
    if (a === UNKNOWN || b === UNKNOWN) return a === UNKNOWN ? 1 : -1
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER
    return ra !== rb ? ra - rb : a.localeCompare(b)
  })
  return ['All', ...distinct]
}

interface EnrichedLot extends GreenBeanLot {
  /** The lot number the Processor Workbench uses too (GBL-2026-7). */
  lotLabel: string
  processType: string
  variety: string
  finalScore: string | number
}

const TraceabilityHub: React.FC = () => {
  const { data, refreshData } = useDataContext()
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [varietyFilter, setVarietyFilter] = useState('All')
  const [processFilter, setProcessFilter] = useState('All')
  const [gradeFilter, setGradeFilter] = useState('All')

  // Modal states
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [selectedLotForQR, setSelectedLotForQR] = useState<EnrichedLot | null>(null)

  // Check if user has access. A super admin counts as an Admin whatever
  // roles the account lists (isAdminUser), as the sidebar and the route do.
  useEffect(() => {
    if (currentUser) {
      const hasAccess =
        isAdminUser(currentUser) || !!currentUser.roles?.includes(UserRole.Processor)
      if (!hasAccess) {
        navigate('/farmer-dashboard')
      }
    }
  }, [currentUser, navigate])

  const enrichedLots = useMemo(() => {
    if (!data?.greenBeanLots || !Array.isArray(data.greenBeanLots)) {
      return []
    }

    try {
      return data.greenBeanLots
        .map((gbl) => {
          if (!gbl) return null

          const parchmentLot = data.parchmentLots?.find((p) => p?.id === gbl.parchmentLotId)
          const processingBatch = data.processingBatches?.find(
            (b) => b?.id === parchmentLot?.processingBatchId,
          )
          const harvestLot = data.harvestLots?.find((h) => h?.id === parchmentLot?.harvestLotId)

          let finalScore: string | number = 'N/A'
          const scoreInfo = gbl.cuppingScores?.[0]
          if (scoreInfo) {
            try {
              const session = data.cuppingSessions?.find((s) => s?.id === scoreInfo.sessionId)
              const sample = session?.samples?.find((s) => s?.greenBeanLotId === gbl.id)
              if (session && sample && session.finalResults && session.finalResults[sample.id]) {
                finalScore = session.finalResults[sample.id].totalScore.toFixed(2)
              } else if (scoreInfo.score != null) {
                finalScore = scoreInfo.score.toFixed(2)
              }
            } catch (error) {
              console.error('Error processing cupping score:', error)
              if (scoreInfo.score != null) {
                finalScore = scoreInfo.score.toFixed(2)
              }
            }
          }

          return {
            ...gbl,
            lotLabel: formatGreenBeanId(gbl),
            // A roaster's shelf lot comes without its batch (out of their
            // scope); its parchment lot carries the process too. A bought-in
            // lot has them on its external source, as its public page shows.
            processType:
              processingBatch?.processType ||
              parchmentLot?.processType ||
              gbl.parchmentProcessType ||
              gbl.externalSource?.processType ||
              UNKNOWN,
            variety: harvestLot?.cherryVariety || gbl.externalSource?.variety || UNKNOWN,
            finalScore,
          } as EnrichedLot
        })
        .filter(Boolean) as EnrichedLot[]
    } catch (error) {
      console.error('Error enriching lots:', error)
      return []
    }
  }, [
    data?.greenBeanLots,
    data?.parchmentLots,
    data?.processingBatches,
    data?.harvestLots,
    data?.cuppingSessions,
  ])

  const filteredLots = useMemo(() => {
    if (!enrichedLots || enrichedLots.length === 0) {
      return []
    }

    try {
      const searchLower = searchTerm.toLowerCase()
      return enrichedLots
        .filter((lot) => {
          if (!lot) return false
          const matchesVariety = varietyFilter === 'All' || lot.variety === varietyFilter
          const matchesProcess = processFilter === 'All' || lot.processType === processFilter
          const matchesGrade = gradeFilter === 'All' || lot.grade === gradeFilter
          // The ROA id is never shown here, but invoices and the roaster's
          // stock rows still name the lot that way, so it stays searchable.
          return (
            ((lot.id?.toLowerCase() || '').includes(searchLower) ||
              lot.lotLabel.toLowerCase().includes(searchLower) ||
              (lot.id ? toRoaId(lot.id).toLowerCase().includes(searchLower) : false) ||
              (lot.publicTraceId?.toLowerCase() || '').includes(searchLower) ||
              (lot.grade?.toLowerCase() || '').includes(searchLower) ||
              (lot.processType?.toLowerCase() || '').includes(searchLower) ||
              (lot.variety?.toLowerCase() || '').includes(searchLower)) &&
            matchesVariety &&
            matchesProcess &&
            matchesGrade
          )
        })
        .sort((a, b) => {
          const aDate = a?.createdAt ? new Date(a.createdAt).getTime() : 0
          const bDate = b?.createdAt ? new Date(b.createdAt).getTime() : 0
          if (aDate !== bDate) {
            return bDate - aDate
          }
          const aId = a?.id || ''
          const bId = b?.id || ''
          return bId.localeCompare(aId)
        })
    } catch (error) {
      console.error('Error filtering lots:', error)
      return []
    }
  }, [enrichedLots, searchTerm, varietyFilter, processFilter, gradeFilter])

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, varietyFilter, processFilter, gradeFilter])

  const varietyOptions = useMemo(
    () => filterOptions(enrichedLots.map((lot) => lot?.variety)),
    [enrichedLots],
  )

  const processOptions = useMemo(
    () => filterOptions(enrichedLots.map((lot) => lot?.processType)),
    [enrichedLots],
  )

  // Grades follow the admin-managed order, like every other grade dropdown.
  const gradeOrder = useGradeNames({ includeInactive: true })
  const gradeOptions = useMemo(
    () => filterOptions(enrichedLots.map((lot) => lot?.grade), gradeOrder),
    [enrichedLots, gradeOrder],
  )

  // Pagination logic
  const totalPages = Math.ceil(filteredLots.length / PAGE_SIZE)
  const paginatedLots = filteredLots.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Publishing a lot (generating its public id) and previewing it before it
  // is public are for the lot's creator or an Admin: the backend refuses
  // anyone else (403). Others get a lot's QR only once it is published.
  const canPublishLot = (lot: GreenBeanLot) =>
    !!currentUser && canManageGreenBeanLot(currentUser, lot)

  // QR Modal handlers
  const openQRModal = (lot: EnrichedLot) => {
    setSelectedLotForQR(lot)
    setQrModalOpen(true)
  }

  const handlePublicIdGenerated = (publicTraceId: string) => {
    if (refreshData) {
      refreshData()
    }
  }

  // Show error if data processing failed
  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-red-800 mb-1">
                Error Loading Traceability Data
              </h3>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <h1 className="text-3xl font-bold text-gray-900">Traceability Curation Hub</h1>
        <p className="text-gray-600 mt-2">
          Manage and view public traceability pages for green bean lots.
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 space-y-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search by Lot ID, variety, process, or grade..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-all"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Variety
            </label>
            <Select
              options={varietyOptions}
              value={varietyFilter}
              onChange={(v) => setVarietyFilter(String(v ?? 'All'))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Process
            </label>
            <Select
              options={processOptions}
              value={processFilter}
              onChange={(v) => setProcessFilter(String(v ?? 'All'))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Grade
            </label>
            <Select
              options={gradeOptions}
              value={gradeFilter}
              onChange={(v) => setGradeFilter(String(v ?? 'All'))}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow-lg rounded-2xl overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Lot ID
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Variety
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Process
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Grade
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  QR
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {paginatedLots.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Search className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-medium text-gray-500">
                      {enrichedLots.length === 0
                        ? 'No green bean lots available. Process some batches to create traceability records.'
                        : 'No lots match your search criteria.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedLots.map((lot) => {
                  if (!lot || !lot.id) return null
                  const hasPublicId = !!lot.publicTraceId
                  const canPublish = canPublishLot(lot)
                  const displayScore =
                    lot.processorScore != null ? lot.processorScore.toFixed(1) : lot.finalScore
                  const isNew = isRecentLot(lot.createdAt)

                  return (
                    <tr key={lot.id} className="hover:bg-gray-50 transition-colors duration-200">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-mono font-semibold text-gray-900"
                            title={lot.id}
                          >
                            {lot.lotLabel}
                          </span>
                          {isNew && (
                            <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 border border-rose-200">
                              new
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-700">{lot.variety || UNKNOWN}</span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {lot.processType || UNKNOWN}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-700">{lot.grade || UNKNOWN}</span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {lot.processorScore != null && lot.processorScore >= 80 && (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          )}
                          <span className="text-sm font-bold text-indigo-600">{displayScore}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                            lot.availabilityStatus === 'Available'
                              ? 'bg-green-100 text-green-700 border-green-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}
                        >
                          {lot.availabilityStatus === 'Available' ? (
                            <CheckCircle className="h-3.5 w-3.5" />
                          ) : (
                            <Archive className="h-3.5 w-3.5" />
                          )}
                          {lot.availabilityStatus || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {hasPublicId || canPublish ? (
                          <button
                            onClick={() => openQRModal(lot)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                              hasPublicId
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200'
                                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                            }`}
                            title={hasPublicId ? 'View/Download QR' : 'Generate QR'}
                          >
                            <QrCode className="h-3.5 w-3.5" />
                            {hasPublicId ? 'QR' : 'Generate'}
                          </button>
                        ) : (
                          <span
                            className="text-sm text-gray-400"
                            title="Not published yet. Only the lot's processor or an Admin can publish it."
                          >
                            -
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {hasPublicId || canPublish ? (
                          <Link
                            to={
                              hasPublicId ? `/trace/${lot.publicTraceId}` : `/traceability/${lot.id}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-bold text-sm transition-colors duration-200 hover:underline"
                          >
                            View <ExternalLink className="h-4 w-4" />
                          </Link>
                        ) : (
                          <span
                            className="text-sm text-gray-400"
                            title="Not published yet. Only the lot's processor or an Admin can preview it."
                          >
                            -
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center px-4 py-3 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {(() => {
                const TOTAL_SLOTS = 7
                const tp = totalPages
                const cp = currentPage
                let slots: (number | 'ellipsis')[] = []
                if (tp <= TOTAL_SLOTS) {
                  slots = Array.from({ length: tp }, (_, i) => i + 1)
                } else if (cp <= 4) {
                  slots = [1, 2, 3, 4, 5, 'ellipsis', tp]
                } else if (cp >= tp - 3) {
                  slots = [1, 'ellipsis', tp - 4, tp - 3, tp - 2, tp - 1, tp]
                } else {
                  slots = [1, 'ellipsis', cp - 1, cp, cp + 1, 'ellipsis', tp]
                }
                return slots.map((slot, idx) =>
                  slot === 'ellipsis' ? (
                    <span
                      key={`e-${idx}`}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 text-xs"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={slot}
                      onClick={() => setCurrentPage(slot)}
                      className={`w-8 h-8 text-xs font-medium rounded-md transition-colors flex items-center justify-center ${cp === slot ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      {slot}
                    </button>
                  ),
                )
              })()}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {selectedLotForQR && (
        <QRCodeModal
          isOpen={qrModalOpen}
          onClose={() => {
            setQrModalOpen(false)
            setSelectedLotForQR(null)
          }}
          lotId={selectedLotForQR.id}
          lotLabel={selectedLotForQR.lotLabel}
          publicTraceId={selectedLotForQR.publicTraceId}
          onPublicIdGenerated={handlePublicIdGenerated}
          canGenerate={canPublishLot(selectedLotForQR)}
        />
      )}
    </div>
  )
}

export default TraceabilityHub
