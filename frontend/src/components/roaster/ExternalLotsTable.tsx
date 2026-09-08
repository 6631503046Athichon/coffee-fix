import React, { useState, useEffect, useCallback } from 'react'
import { Package, PlusCircle } from 'lucide-react'
import { Button } from '../common/Button'
import type { ExternalDisplayLot } from '../../types/displayTypes'
import { toFixed2, toRoaId } from '../../utils/formatters'

interface ExternalLotsTableProps {
  lots: ExternalDisplayLot[]
  onRoast: (lot: ExternalDisplayLot) => void
  onAddExternal: () => void
  currentPage?: number
  totalPages?: number
  onPageChange?: (page: number) => void
  hideHeader?: boolean
  loadingLotId?: string | null
}

const ExternalLotsTable: React.FC<ExternalLotsTableProps> = ({
  lots,
  onRoast,
  onAddExternal,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  hideHeader = false,
  loadingLotId,
}) => {
  const [openPopover, setOpenPopover] = useState<string | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const openWithPos = useCallback(
    (id: string, btn: HTMLButtonElement) => {
      if (openPopover === id) {
        setOpenPopover(null)
        return
      }
      const rect = btn.getBoundingClientRect()
      setPopoverPos({ top: rect.top + window.scrollY - 120, left: rect.left + window.scrollX })
      setOpenPopover(id)
    },
    [openPopover],
  )

  useEffect(() => {
    const close = () => setOpenPopover(null)
    if (openPopover) {
      document.addEventListener('click', close)
      window.addEventListener('scroll', close, true)
    }
    return () => {
      document.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [openPopover])

  const activeLot = lots.find((l) => l.id === openPopover)

  return (
    <div
      className={
        hideHeader ? '' : 'overflow-hidden rounded-2xl border border-[#e2e8e1] bg-white shadow-sm'
      }
    >
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between border-b border-[#e6ebe5] bg-[#f8fbf8] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dcebe1]">
              <Package className="h-5 w-5 text-[#2e6848]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#20352b]">Purchased Lots</h3>
              <p className="text-sm text-[#7b8a80]">External green bean inventory</p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] table-fixed font-sans">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[10%]" />
            <col className="w-[22%]" />
            <col className="w-[22%]" />
            <col className="w-[28%]" />
          </colgroup>
          <thead>
            <tr className="bg-[#263b31] text-left">
              <th className="bg-[#263b31] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[#c6d5ca]">
                ID
              </th>
              <th className="bg-[#263b31] px-4 py-3 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-[#c6d5ca]">
                Details
              </th>
              <th className="bg-[#263b31] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[#c6d5ca]">
                Grade
              </th>
              <th className="bg-[#263b31] px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-[#c6d5ca]">
                Available
              </th>
              <th className="bg-[#263b31] px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-[#c6d5ca]">
                <Button
                  variant="success"
                  size="sm"
                  icon={<PlusCircle className="h-3.5 w-3.5" />}
                  onClick={onAddExternal}
                  className="ml-auto min-w-[100px] justify-center bg-[#62a477] px-3 py-2 text-xs hover:bg-[#4f8b62]"
                >
                  Add lot
                </Button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lots.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <Package className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 font-medium">No external lots available</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Add new external green bean lots to start
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              lots.map((lot) => (
                <tr
                  key={lot.id}
                  className="transition-colors odd:bg-white even:bg-[#fafcf9] hover:bg-[#f1f8f2]"
                >
                  <td className="px-5 py-4 text-left font-mono text-sm font-semibold text-[#294936] whitespace-nowrap">
                    {toRoaId(lot.id)}
                  </td>
                  <td className="px-5 py-4 text-center align-middle">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openWithPos(lot.id, e.currentTarget)
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#557262] transition-colors hover:bg-[#e6f0e8]"
                      title="View Details"
                    >
                      <Package className="h-5 w-5 text-gray-400" />
                    </button>
                    {/* Popover for details */}
                    {openPopover && activeLot && (
                      <div
                        className="fixed z-[9999] w-56 bg-white border border-gray-200 rounded-xl shadow-2xl"
                        style={{ top: popoverPos.top, left: popoverPos.left }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 gap-4">
                          <div className="flex items-center gap-4">
                            <Package className="h-4 w-4 text-emerald-500" />
                            <span className="text-xs font-normal text-gray-700 uppercase tracking-wide">
                              Lot Details
                            </span>
                          </div>
                          <button
                            onClick={() => setOpenPopover(null)}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <span className="text-lg">×</span>
                          </button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-gray-500">Variety</span>
                            <span className="text-xs font-normal text-gray-800">
                              {activeLot.variety || '—'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-gray-500">Process</span>
                            <span className="text-xs font-normal text-gray-800">
                              {activeLot.process || '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-left align-middle">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-50 text-sm font-normal text-amber-700 border border-amber-200 whitespace-nowrap">
                      {lot.grade || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right align-middle text-black font-bold">
                    <div className="ml-auto flex max-w-[112px] items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e4ebe5]">
                        <div className="h-full w-full rounded-full bg-[#62a477]" />
                      </div>
                      <span className="text-sm font-bold text-[#294936]">
                        {toFixed2(lot.currentWeightKg)}
                      </span>
                      <span className="text-xs text-[#87928a]">kg</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right align-middle">
                    <div className="flex justify-end">
                      <Button
                        variant="success"
                        size="sm"
                        className="min-w-[100px] justify-center"
                        disabled={loadingLotId === lot.id}
                        onClick={() => onRoast(lot)}
                      >
                        {loadingLotId === lot.id ? 'Loading…' : 'Roast'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ExternalLotsTable
