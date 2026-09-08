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
  const visibleWeight = lots.reduce((total, lot) => total + lot.remainingWeightKg, 0)

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

        {hideHeader && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ebe5] bg-[#f7fbf7] px-5 py-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7f9184]">
                Ready to roast
              </p>
              <p className="mt-1 text-sm font-bold text-[#294936]">Your internal inventory</p>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-lg font-bold text-[#2e6848]">{lots.length}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8b9a90]">
                  lots shown
                </p>
              </div>
              <div className="border-l border-[#dfe9df] pl-4">
                <p className="text-lg font-bold text-[#2e6848]">{toFixed2(visibleWeight)} kg</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8b9a90]">
                  available
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-[#f7fbf7] p-4 sm:p-5">
          {lots.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
              <Package className="mb-3 h-9 w-9 text-[#a8b8ac]" />
              <p className="text-sm font-bold text-[#55635a]">No internal stock ready</p>
              <p className="mt-1 text-xs text-[#8b9a90]">Withdraw green beans to start roasting.</p>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {lots.map((lot) => (
                <article
                  key={lot.id}
                  className="rounded-2xl border border-[#dfe9df] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#9cb8a6] hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-bold text-[#294936]">
                        {toRoaId(lot.id)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-[#8b9a90]">
                        Internal roasting stock
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openWithPos(lot.id, e.currentTarget)
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#dfe9df] text-[#557262] transition-colors hover:bg-[#e6f0e8]"
                      title="View Details"
                    >
                      <ClipboardList className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#f7fbf7] p-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#8b9a90]">
                        Grade
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#55635a]">
                        {lot.grade || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#8b9a90]">
                        Score
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#456d55]">
                        {lot.processorScore != null ? lot.processorScore.toFixed(2) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#8b9a90]">
                        Available
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#294936]">
                        {toFixed2(lot.remainingWeightKg)} kg
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="success"
                    size="sm"
                    fullWidth
                    className="mt-3 bg-[#d87832] hover:bg-[#bd5d1e]"
                    onClick={() => onLogRoast(lot)}
                  >
                    Start roast
                  </Button>
                </article>
              ))}
            </div>
          )}
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
