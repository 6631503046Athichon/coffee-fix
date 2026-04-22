import React, { useMemo } from 'react'
import type { CropYear } from '../../../types'

interface CropYearChipsProps {
  years: CropYear[]
  value: string
  onChange: (value: string) => void
}

/**
 * Renders a grid of crop-year chips and highlights the year whose date range
 * includes today with a "Current" badge.
 */
export const CropYearChips: React.FC<CropYearChipsProps> = ({ years, value, onChange }) => {
  const currentYearId = useMemo(() => {
    const today = new Date()
    return (
      years.find((y) => {
        const start = new Date(y.startDate)
        const end = new Date(y.endDate)
        return today >= start && today <= end
      })?.id || ''
    )
  }, [years])

  const baseChipClass =
    'relative flex items-center justify-center py-3 px-4 rounded-xl border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer'
  const selectedClass = 'bg-blue-600 text-white border-blue-600 shadow-lg'
  const unselectedClass =
    'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:bg-blue-50'

  return (
    <div className="grid grid-cols-3 gap-3">
      {years.map((year) => {
        const isSelected = value === year.id
        const isCurrent = year.id === currentYearId

        return (
          <button
            key={year.id}
            type="button"
            onClick={() => onChange(year.id)}
            className={`${baseChipClass} ${isSelected ? selectedClass : unselectedClass}`}
            title={year.description || year.year}
          >
            {isCurrent && (
              <span
                className={`absolute -top-2 -right-2 px-2 py-0.5 text-[10px] font-bold rounded-full shadow-sm ${
                  isSelected ? 'bg-white text-blue-600' : 'bg-blue-500 text-white'
                }`}
              >
                Current
              </span>
            )}
            <span className="text-sm font-semibold">{year.year}</span>
          </button>
        )
      })}
    </div>
  )
}

export default CropYearChips
