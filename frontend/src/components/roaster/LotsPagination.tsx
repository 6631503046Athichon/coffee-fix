import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface LotsPaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  /** Matches the shelf it sits under: green for internal stock, warm for purchased lots. */
  tone?: 'green' | 'warm'
}

const TONES = {
  green: {
    strip: 'border-[#e6ebe5] bg-[#f8fbf8]',
    arrow: 'text-gray-500 hover:bg-white hover:text-gray-700',
    page: 'text-gray-600 hover:bg-white',
    current: 'bg-indigo-600 text-white',
    ellipsis: 'text-gray-400',
  },
  warm: {
    strip: 'border-[#f0dfca] bg-[#fff8ed]',
    arrow: 'text-[#a87950] hover:bg-white hover:text-[#7f4b24]',
    page: 'text-[#80664d] hover:bg-white',
    current: 'bg-[#d87832] text-white',
    ellipsis: 'text-[#c4a688]',
  },
}

const TOTAL_SLOTS = 7

/** Page numbers with gaps once there are too many to show, as 1 … 5 6 7 … 12. */
const slotsFor = (currentPage: number, totalPages: number): (number | 'ellipsis')[] => {
  if (totalPages <= TOTAL_SLOTS) return Array.from({ length: totalPages }, (_, i) => i + 1)
  if (currentPage <= 4) return [1, 2, 3, 4, 5, 'ellipsis', totalPages]
  if (currentPage >= totalPages - 3) {
    return [
      1,
      'ellipsis',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ]
  }
  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages]
}

const cell = 'flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors'

/** Shared footer for the workbench lot shelves, so both tabs page the same way. */
const LotsPagination: React.FC<LotsPaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  tone = 'green',
}) => {
  const styles = TONES[tone]
  return (
    <div className={`border-t px-4 py-3 ${styles.strip}`}>
      <nav aria-label="Lot pages" className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className={`${cell} ${styles.arrow} disabled:cursor-not-allowed disabled:opacity-30`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {slotsFor(currentPage, totalPages).map((slot, index) =>
          slot === 'ellipsis' ? (
            <span key={`gap-${index}`} className={`${cell} ${styles.ellipsis}`}>
              …
            </span>
          ) : (
            <button
              key={slot}
              type="button"
              onClick={() => onPageChange(slot)}
              aria-label={`Page ${slot}`}
              aria-current={currentPage === slot ? 'page' : undefined}
              className={`${cell} font-medium ${currentPage === slot ? styles.current : styles.page}`}
            >
              {slot}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          className={`${cell} ${styles.arrow} disabled:cursor-not-allowed disabled:opacity-30`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  )
}

export default LotsPagination
