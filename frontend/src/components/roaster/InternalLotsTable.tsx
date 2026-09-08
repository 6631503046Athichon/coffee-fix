import React, { useState, useEffect, useCallback } from 'react'
import { Package, ChevronLeft, ChevronRight, ClipboardList, X } from 'lucide-react'
import { Button } from '../common/Button'
import { RoasterInventoryItem } from '../../types'
import { toFixed2, toRoaId } from '../../utils/formatters'

// WithdrawalLotItem is just RoasterInventoryItem — all enriched fields (grade, processorScore,
// variety, process, greenBeanDisplayId) are now populated directly by transformInventoryItem.
export type WithdrawalLotItem = RoasterInventoryItem

interface InternalLotsTableProps {
  lots: WithdrawalLotItem[]
  onLogRoast: (lot: WithdrawalLotItem) => void
  currentPage?: number
  totalPages?: number
  onPageChange?: (page: number) => void
  hideHeader?: boolean
}

interface PopoverPos {
  top: number
  left: number
}

const InternalLotsTable: React.FC<InternalLotsTableProps> = ({
  lots,
  onLogRoast,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  hideHeader = false,
}) => {
  const [openPopover, setOpenPopover] = useState<string | null>(null)
  const [popoverPos, setPopoverPos] = useState<PopoverPos>({ top: 0, left: 0 })

  const openWithPos = useCallback(
    (id: string, btn: HTMLButtonElement) => {
      if (openPopover === id) {
        setOpenPopover(null)
        return
      }
      const rect = btn.getBoundingClientRect()
      setPopoverPos({ top: rect.top + window.scrollY - 8, left: rect.left + window.scrollX })
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
    <>
      <div
        className={
          hideHeader ? '' : 'overflow-hidden rounded-2xl border border-[#e2e8e1] bg-white shadow-sm'
        }
      >
        {/* Header */}
        {!hideHeader && (
          <div className="border-b border-[#e6ebe5] bg-[#f8fbf8] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dcebe1]">
                <Package className="h-5 w-5 text-[#2e6848]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#20352b]">Internal Lots</h3>
                <p className="text-sm text-[#7b8a80]">Withdrawn green beans ready to roast</p>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed font-sans">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[24%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[#dfe9df] bg-[#f3f8f3] text-left">
                <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d7e72]">
                  ID
                </th>
                <th className="px-5 py-3 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d7e72]">
                  Details
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d7e72]">
                  Grade
                </th>
                <th className="px-5 py-3 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d7e72]">
                  Score
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d7e72]">
                  Available
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d7e72]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                        <Package className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm text-gray-500 font-medium">
                        No withdrawal lots available
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Withdraw green bean stock to start roasting
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                lots.map((lot) => (
                  <tr
                    key={lot.id}
                    className="border-b border-[#edf1ed] bg-white transition-colors last:border-0 hover:bg-[#f4faf4]"
                  >
                    {/* ID */}
                    <td className="px-5 py-4 text-left align-middle">
                      <span className="block whitespace-nowrap text-sm font-semibold text-[#294936]">
                        {toRoaId(lot.id)}
                      </span>
                    </td>
                    {/* Details (icon only, centered) */}
                    <td className="px-5 py-4 text-center align-middle">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openWithPos(lot.id, e.currentTarget)
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#dfe9df] text-[#557262] transition-colors hover:border-[#9cb8a6] hover:bg-[#e6f0e8]"
                        title="View Details"
                      >
                        <ClipboardList className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </td>
                    {/* Grade */}
                    <td className="px-5 py-4 text-left align-middle">
                      <span className="whitespace-nowrap text-sm font-medium text-[#55635a]">
                        {lot.grade || '—'}
                      </span>
                    </td>
                    {/* Score */}
                    <td className="px-5 py-4 text-center align-middle">
                      <div className="inline-flex items-center justify-center align-middle">
                        <span className="text-sm font-bold text-[#456d55]">
                          {lot.processorScore != null ? lot.processorScore.toFixed(2) : '—'}
                        </span>
                      </div>
                    </td>
                    {/* Available (normal cell, no bg) */}
                    <td className="px-5 py-4 text-right align-middle">
                      <div className="ml-auto flex items-center justify-end gap-1">
                        <span className="text-sm font-bold text-[#294936]">
                          {toFixed2(lot.remainingWeightKg)}
                        </span>
                        <span className="text-xs text-[#87928a]">kg</span>
                      </div>
                    </td>
                    {/* Action */}
                    <td className="px-5 py-4 text-right align-middle">
                      <div className="flex justify-end">
                        <Button
                          variant="success"
                          size="sm"
                          className="min-w-[100px] justify-center bg-[#d87832] hover:bg-[#bd5d1e]"
                          onClick={() => onLogRoast(lot)}
                        >
                          Roast
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {lots.length > 0 && totalPages > 1 && onPageChange && (
          <div className="border-t border-[#e6ebe5] bg-[#f8fbf8] px-4 py-3">
            <div className="flex justify-center items-center gap-1">
              <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-white rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                      className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={slot}
                      onClick={() => onPageChange(slot)}
                      className={`w-8 h-8 text-sm font-medium rounded-md transition-colors flex items-center justify-center ${cp === slot ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-white'}`}
                    >
                      {slot}
                    </button>
                  ),
                )
              })()}
              <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-white rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fixed-position popup — rendered outside overflow containers */}
      {openPopover && activeLot && (
        <div
          className="fixed z-[9999] w-60 bg-white border border-gray-200 rounded-xl shadow-2xl"
          style={{ top: popoverPos.top - 176, left: popoverPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 gap-4">
            <div className="flex items-center gap-4">
              <ClipboardList className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-normal text-gray-700 uppercase tracking-wide">
                Lot Details
              </span>
            </div>
            <button
              onClick={() => setOpenPopover(null)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div className="flex justify-between items-center gap-4">
              <span className="text-xs text-gray-500">Variety</span>
              <span className="text-xs font-normal text-gray-800">{activeLot.variety || '—'}</span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-xs text-gray-500">Process</span>
              <span className="text-xs font-normal text-gray-800">{activeLot.process || '—'}</span>
            </div>
            <div className="border-t border-gray-100 pt-2 space-y-4">
              <div className="flex justify-between items-center gap-4">
                <span className="text-xs text-gray-500">Source GBL</span>
                <span className="text-xs font-mono font-normal text-gray-800">
                  {activeLot.greenBeanDisplayId || '—'}
                </span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-xs text-gray-500">Withdrawal Type</span>
                <span className="text-xs font-normal text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                  {activeLot.withdrawalType || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default InternalLotsTable
