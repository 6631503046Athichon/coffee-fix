import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

const TOTAL_SLOTS = 7

/**
 * Pager with collapsed "..." segments. Defined outside its consuming component so
 * React.memo identity is stable across parent re-renders.
 */
export const Pagination = React.memo(
  ({ currentPage, totalPages, onPageChange }: PaginationProps) => {
    if (totalPages <= 1) return null

    const getSlots = (): (number | 'ellipsis')[] => {
      if (totalPages <= TOTAL_SLOTS) {
        return Array.from({ length: TOTAL_SLOTS }, (_, i) =>
          i < totalPages ? i + 1 : 0,
        ).filter((n) => n > 0) as number[]
      }

      const slots: (number | 'ellipsis')[] = []

      if (currentPage <= 4) {
        slots.push(1, 2, 3, 4, 5, 'ellipsis', totalPages)
      } else if (currentPage >= totalPages - 3) {
        slots.push(
          1,
          'ellipsis',
          totalPages - 4,
          totalPages - 3,
          totalPages - 2,
          totalPages - 1,
          totalPages,
        )
      } else {
        slots.push(
          1,
          'ellipsis',
          currentPage - 1,
          currentPage,
          currentPage + 1,
          'ellipsis',
          totalPages,
        )
      }

      return slots
    }

    const slots = getSlots()

    return (
      <div className="flex justify-center items-center px-4 py-2 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {slots.map((slot, index) =>
            slot === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="w-8 h-8 flex items-center justify-center text-gray-400 text-xs"
              >
                ...
              </span>
            ) : (
              <button
                key={slot}
                onClick={() => onPageChange(slot)}
                className={`w-8 h-8 text-xs font-medium rounded-md transition-colors flex items-center justify-center ${
                  currentPage === slot
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {slot}
              </button>
            ),
          )}

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  },
)

Pagination.displayName = 'Pagination'

export default Pagination
