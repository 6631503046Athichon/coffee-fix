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

      {hideHeader && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f0dfca] bg-[#fff8ed] px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#b87948]">
              Sourcing shelf
            </p>
            <p className="mt-1 text-sm font-bold text-[#7f4b24]">Purchased coffee lots</p>
          </div>
          <Button
            variant="success"
            size="sm"
            icon={<PlusCircle className="h-3.5 w-3.5" />}
            onClick={onAddExternal}
            className="shrink-0 bg-[#d87832] hover:bg-[#bd5d1e]"
          >
            Add lot
          </Button>
        </div>
      )}

      <div className="bg-[#fffaf4] p-4 sm:p-5">
        {lots.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <Package className="mb-3 h-9 w-9 text-[#d7b99b]" />
            <p className="text-sm font-bold text-[#80664d]">No purchased lots yet</p>
            <p className="mt-1 text-xs text-[#a98c73]">
              Add an external lot when new coffee arrives.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {lots.map((lot) => (
              <article
                key={lot.id}
                className="rounded-2xl border border-[#f0dfca] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#e2a36e] hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-[#7f4b24]">{toRoaId(lot.id)}</p>
                    <p className="mt-1 text-xs font-medium text-[#a98c73]">Purchased source lot</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openWithPos(lot.id, e.currentTarget)
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#f0dfca] text-[#a87950] transition-colors hover:bg-[#fff1df]"
                    title="View Details"
                  >
                    <Package className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#fff1df] px-2.5 py-1 text-xs font-bold text-[#9b5d2d]">
                    {lot.grade || 'Unclassified'}
                  </span>
                  <span className="rounded-full bg-[#f7f1eb] px-2.5 py-1 text-xs font-medium text-[#80664d]">
                    {lot.process || 'Process not set'}
                  </span>
                  <span className="ml-auto text-lg font-bold text-[#7f4b24]">
                    {toFixed2(lot.currentWeightKg)}{' '}
                    <span className="text-xs font-semibold text-[#a98c73]">kg</span>
                  </span>
                </div>
                <Button
                  variant="success"
                  size="sm"
                  fullWidth
                  disabled={loadingLotId === lot.id}
                  onClick={() => onRoast(lot)}
                  className="mt-3 bg-[#d87832] hover:bg-[#bd5d1e]"
                >
                  {loadingLotId === lot.id ? 'Loading…' : 'Start roast'}
                </Button>
              </article>
            ))}
          </div>
        )}
        {openPopover && activeLot && (
          <div
            className="fixed z-[9999] w-56 rounded-xl border border-[#f0dfca] bg-white shadow-2xl"
            style={{ top: popoverPos.top, left: popoverPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-[#f4eee7] px-4 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wide text-[#80664d]">
                Lot details
              </span>
              <button
                onClick={() => setOpenPopover(null)}
                className="text-gray-400 transition-colors hover:text-gray-700"
                aria-label="Close details"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[#a98c73]">Variety</span>
                <span className="text-xs font-semibold text-[#49382c]">
                  {activeLot.variety || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[#a98c73]">Process</span>
                <span className="text-xs font-semibold text-[#49382c]">
                  {activeLot.process || '—'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ExternalLotsTable
