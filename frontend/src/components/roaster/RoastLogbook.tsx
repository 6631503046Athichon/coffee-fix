import React, { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ClipboardList,
  Coffee,
  Download,
  Filter,
  Flame,
  Scale,
  TrendingDown,
} from 'lucide-react'
import DatePicker from '../common/DatePicker'
import Select from '../common/Select'
import { useDataContext } from '../../hooks/useDataContext'
import { RoastLevel, User, UserRole } from '../../types'
import { toFixed2, toRoastBatchId } from '../../utils/formatters'
import RoastDetailsModal from './RoastDetailsModal'

interface RoastLogbookProps {
  currentUser: User
}

const RoastLogbook: React.FC<RoastLogbookProps> = ({ currentUser }) => {
  const { data } = useDataContext()
  const [dateFilter, setDateFilter] = useState('')
  const [processFilter, setProcessFilter] = useState('All process types')
  const [varietyFilter, setVarietyFilter] = useState('All varieties')
  const [gradeFilter, setGradeFilter] = useState('All grades')
  const [levelFilter, setLevelFilter] = useState('All levels')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [selectedRoastId, setSelectedRoastId] = useState<string | null>(null)

  const isAdmin = currentUser.roles?.includes(UserRole.Admin)

  const records = useMemo(() => {
    return data.roastBatches
      .filter((roast) => isAdmin || roast.roasterId === currentUser.id)
      .map((roast, index) => {
        const lot = data.greenBeanLots.find(
          (greenBeanLot) => greenBeanLot.id === roast.greenBeanLotId,
        )
        const inventory = data.roasterInventory.find(
          (item) =>
            item.id === roast.roasterInventoryId || item.greenBeanLotId === roast.greenBeanLotId,
        )
        const parchmentLot = lot?.parchmentLotId
          ? data.parchmentLots.find((parchment) => parchment.id === lot.parchmentLotId)
          : undefined
        const harvestLot = parchmentLot?.harvestLotId
          ? data.harvestLots.find((harvest) => harvest.id === parchmentLot.harvestLotId)
          : undefined
        const process =
          lot?.externalSource?.processType ||
          inventory?.process ||
          parchmentLot?.processType ||
          'Not set'
        const variety =
          lot?.externalSource?.variety ||
          inventory?.variety ||
          harvestLot?.cherryVariety ||
          'Not set'
        const grade = lot?.grade || inventory?.grade || 'Not set'

        return {
          ...roast,
          process,
          variety,
          grade,
          sourceIndex: index,
        }
      })
      .filter((roast) => {
        const matchesDate = !dateFilter || roast.roastDate === dateFilter
        const matchesProcess =
          processFilter === 'All process types' || roast.process === processFilter
        const matchesVariety = varietyFilter === 'All varieties' || roast.variety === varietyFilter
        const matchesGrade = gradeFilter === 'All grades' || roast.grade === gradeFilter
        const matchesLevel = levelFilter === 'All levels' || roast.roastLevel === levelFilter
        return matchesDate && matchesProcess && matchesVariety && matchesGrade && matchesLevel
      })
      .sort(
        (a, b) =>
          new Date(b.roastDate).getTime() - new Date(a.roastDate).getTime() ||
          a.sourceIndex - b.sourceIndex,
      )
  }, [
    currentUser.id,
    data.greenBeanLots,
    data.harvestLots,
    data.parchmentLots,
    data.roasterInventory,
    data.roastBatches,
    dateFilter,
    gradeFilter,
    isAdmin,
    levelFilter,
    processFilter,
    varietyFilter,
  ])

  const filterOptions = useMemo(() => {
    const processes = new Set<string>()
    const varieties = new Set<string>()
    const grades = new Set<string>()

    data.roastBatches
      .filter((roast) => isAdmin || roast.roasterId === currentUser.id)
      .forEach((roast) => {
        const lot = data.greenBeanLots.find(
          (greenBeanLot) => greenBeanLot.id === roast.greenBeanLotId,
        )
        const inventory = data.roasterInventory.find(
          (item) =>
            item.id === roast.roasterInventoryId || item.greenBeanLotId === roast.greenBeanLotId,
        )
        const parchmentLot = lot?.parchmentLotId
          ? data.parchmentLots.find((parchment) => parchment.id === lot.parchmentLotId)
          : undefined
        const harvestLot = parchmentLot?.harvestLotId
          ? data.harvestLots.find((harvest) => harvest.id === parchmentLot.harvestLotId)
          : undefined

        processes.add(
          lot?.externalSource?.processType ||
            inventory?.process ||
            parchmentLot?.processType ||
            'Not set',
        )
        varieties.add(
          lot?.externalSource?.variety ||
            inventory?.variety ||
            harvestLot?.cherryVariety ||
            'Not set',
        )
        grades.add(lot?.grade || inventory?.grade || 'Not set')
      })

    return {
      processes: Array.from(processes).sort(),
      varieties: Array.from(varieties).sort(),
      grades: Array.from(grades).sort(),
    }
  }, [
    currentUser.id,
    data.greenBeanLots,
    data.harvestLots,
    data.parchmentLots,
    data.roasterInventory,
    data.roastBatches,
    isAdmin,
  ])

  const totalBatchKg = records.reduce((total, roast) => total + roast.batchSizeKg, 0)
  const totalOutputKg = records.reduce((total, roast) => total + (roast.roastedWeightKg || 0), 0)
  const averageYield = records.length
    ? records.reduce((total, roast) => total + roast.yieldPercentage, 0) / records.length
    : 0
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize))
  const paginatedRecords = records.slice((page - 1) * pageSize, page * pageSize)

  // The open roast, with the source labels the details dialog expects.
  const selectedRecord = selectedRoastId
    ? records.find((roast) => roast.id === selectedRoastId)
    : undefined
  const selectedRoast = selectedRecord
    ? {
        ...selectedRecord,
        sourceVariety: selectedRecord.variety,
        sourceProcess: selectedRecord.process,
        sourceGrade: selectedRecord.grade,
      }
    : null

  useEffect(() => {
    setPage(1)
  }, [dateFilter, processFilter, varietyFilter, gradeFilter, levelFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const exportCsv = () => {
    const headers = [
      'Roast date',
      'Roast ID',
      'Variety',
      'Process',
      'Grade',
      'Roast level',
      'Input kg',
      'Output kg',
      'Yield %',
      'Weight loss %',
      'Roast notes',
      'Flavor notes',
    ]

    const escapeCell = (value: unknown) => {
      const text = String(value ?? '').replace(/^[=+\-@]/, "'$&")
      return `"${text.replace(/"/g, '""')}"`
    }

    const rows = records.map((roast) => [
      roast.roastDate,
      roast.displayId || toRoastBatchId(roast.id),
      roast.variety,
      roast.process,
      roast.grade,
      roast.roastLevel || 'Not set',
      toFixed2(roast.batchSizeKg),
      roast.roastedWeightKg != null ? toFixed2(roast.roastedWeightKg) : '',
      roast.yieldPercentage.toFixed(1),
      roast.weightLossPct != null ? roast.weightLossPct.toFixed(1) : '',
      roast.roastProfileNotes || '',
      roast.flavorNotes || '',
    ])

    const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `roast-logbook-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-full bg-[#f7f8f5] pb-8">
      <header className="mb-5 rounded-lg border border-[#e4e9e3] bg-gradient-to-br from-white via-white to-[#eef5ed] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[#d87832] shadow-sm shadow-orange-200">
              <ClipboardList className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="mb-2 text-3xl font-bold text-gray-900">Roast Logbook</h1>
              <p className="text-gray-600">
                Every batch, output, and roast decision in one place.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-xl border border-[#dfe9df] bg-[#f7faf7] px-3 py-2.5 text-sm text-[#6d7e72]">
              Records shown
              <span className="font-bold text-[#294936]">{records.length}</span>
            </span>
            <button
              type="button"
              onClick={exportCsv}
              disabled={records.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-[#dfe9df] bg-white px-3 py-2.5 text-sm font-bold text-[#2e6848] transition hover:bg-[#edf5ee] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#e2e8e1] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-[#829188]">
              Green batch
            </span>
            <Scale className="h-4 w-4 text-[#2e6848]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#294936]">{toFixed2(totalBatchKg)} kg</p>
        </div>
        <div className="rounded-2xl border border-[#e2e8e1] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-[#829188]">
              Roasted output
            </span>
            <Coffee className="h-4 w-4 text-[#d87832]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#d87832]">{toFixed2(totalOutputKg)} kg</p>
        </div>
        <div className="rounded-2xl border border-[#e2e8e1] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-[#829188]">
              Average yield
            </span>
            <TrendingDown className="h-4 w-4 text-[#49629a]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#49629a]">
            {averageYield ? `${averageYield.toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      {/* No overflow-hidden here: the date picker and dropdowns open over the table below. */}
      <section className="rounded-2xl border border-[#e2e8e1] bg-white shadow-sm">
        <div className="rounded-t-2xl border-b border-[#e6ebe5] bg-[#fbfcfa] p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#829188]" />
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#6d7e72]">
              Filter roasts
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="text-xs font-semibold text-[#6d7e72]">
              <span className="mb-1.5 block">Roast date</span>
              <DatePicker value={dateFilter} onChange={setDateFilter} placeholder="Any date" />
            </div>
            <div className="text-xs font-semibold text-[#6d7e72]">
              <span className="mb-1.5 block">Process type</span>
              <Select
                value={processFilter}
                onChange={(value) => setProcessFilter(String(value ?? 'All process types'))}
                options={['All process types', ...filterOptions.processes]}
                colorTheme="emerald"
                className="text-sm font-medium"
              />
            </div>
            <div className="text-xs font-semibold text-[#6d7e72]">
              <span className="mb-1.5 block">Variety</span>
              <Select
                value={varietyFilter}
                onChange={(value) => setVarietyFilter(String(value ?? 'All varieties'))}
                options={['All varieties', ...filterOptions.varieties]}
                colorTheme="emerald"
                className="text-sm font-medium"
              />
            </div>
            <div className="text-xs font-semibold text-[#6d7e72]">
              <span className="mb-1.5 block">Grade</span>
              <Select
                value={gradeFilter}
                onChange={(value) => setGradeFilter(String(value ?? 'All grades'))}
                options={['All grades', ...filterOptions.grades]}
                colorTheme="emerald"
                className="text-sm font-medium"
              />
            </div>
            <div className="text-xs font-semibold text-[#6d7e72]">
              <span className="mb-1.5 block">Roast level</span>
              <Select
                value={levelFilter}
                onChange={(value) => setLevelFilter(String(value ?? 'All levels'))}
                options={['All levels', RoastLevel.Light, RoastLevel.Medium, RoastLevel.Dark]}
                colorTheme="emerald"
                className="text-sm font-medium"
              />
            </div>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
            <Flame className="mb-3 h-9 w-9 text-[#d8a36d]" />
            <h2 className="text-base font-bold text-[#294936]">No roast records found</h2>
            <p className="mt-1 text-sm text-[#829188]">
              Try different filters or log your first roast batch.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left">
              <thead className="border-b border-[#e6ebe5] bg-[#f7faf7] text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d7e72]">
                <tr>
                  <th className="px-5 py-3">Roast date</th>
                  <th className="px-5 py-3">Roast ID</th>
                  <th className="px-5 py-3">Variety</th>
                  <th className="px-5 py-3">Process type</th>
                  <th className="px-5 py-3">Grade</th>
                  <th className="px-5 py-3">Profile</th>
                  <th className="px-5 py-3 text-right">Input</th>
                  <th className="px-5 py-3 text-right">Output</th>
                  <th className="px-5 py-3 text-right">Yield</th>
                  <th className="px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1ed]">
                {paginatedRecords.map((roast) => (
                  <tr
                    key={roast.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`View details of roast ${roast.displayId || toRoastBatchId(roast.id)}`}
                    onClick={() => setSelectedRoastId(roast.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedRoastId(roast.id)
                      }
                    }}
                    className="cursor-pointer bg-white outline-none transition-colors hover:bg-[#f7fbf7] focus-visible:bg-[#edf5ee]"
                  >
                    <td className="whitespace-nowrap px-5 py-4 align-top">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#294936]">
                        <CalendarDays className="h-4 w-4 text-[#829188]" />
                        {roast.roastDate}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="font-mono text-sm font-bold text-[#294936]">
                        {roast.displayId || toRoastBatchId(roast.id)}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="text-sm font-semibold text-[#294936]">{roast.variety}</p>
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[#55635a]">{roast.process}</td>
                    <td className="px-5 py-4 align-top text-sm text-[#55635a]">{roast.grade}</td>
                    <td className="px-5 py-4 align-top">
                      <span className="rounded-full bg-[#fff1df] px-2.5 py-1 text-xs font-semibold text-[#a85c1e]">
                        {roast.roastLevel || 'Not set'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right align-top text-sm font-bold text-[#294936]">
                      {toFixed2(roast.batchSizeKg)} kg
                    </td>
                    <td className="px-5 py-4 text-right align-top text-sm font-bold text-[#d87832]">
                      {roast.roastedWeightKg != null
                        ? `${toFixed2(roast.roastedWeightKg)} kg`
                        : '—'}
                    </td>
                    <td className="px-5 py-4 text-right align-top">
                      <p className="text-sm font-bold text-[#49629a]">
                        {roast.yieldPercentage.toFixed(1)}%
                      </p>
                      <p className="mt-1 text-xs text-[#9aa69e]">
                        {roast.weightLossPct != null
                          ? `${roast.weightLossPct.toFixed(1)}% loss`
                          : '—'}
                      </p>
                    </td>
                    <td className="max-w-[220px] px-5 py-4 align-top text-xs leading-relaxed text-[#718077]">
                      {roast.roastProfileNotes || 'No notes'}
                      {roast.flavorNotes && (
                        <p className="mt-2 font-semibold text-[#a85c1e]">{roast.flavorNotes}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {records.length > 0 && (
          <div className="flex items-center justify-between rounded-b-2xl border-t border-[#e6ebe5] bg-[#fbfcfa] px-5 py-3">
            <p className="text-xs font-semibold text-[#829188]">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                disabled={page === 1}
                className="rounded-lg border border-[#dfe9df] px-3 py-1.5 text-xs font-bold text-[#55635a] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-[#dfe9df] px-3 py-1.5 text-xs font-bold text-[#55635a] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      <RoastDetailsModal
        roast={selectedRoast}
        canManage={!!selectedRoast && (!!isAdmin || selectedRoast.roasterId === currentUser.id)}
        onClose={() => setSelectedRoastId(null)}
      />
    </div>
  )
}

export default RoastLogbook
