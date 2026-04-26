import React, { useMemo } from 'react'
import type { CropYear } from '../../../types'
import { findCurrentCropYearId } from './constants'

type ChipAccent = 'blue' | 'red' | 'amber' | 'emerald'

interface CropYearChipsProps {
  years: CropYear[]
  value: string
  onChange: (value: string) => void
  /**
   * Colour theme for the chips. Defaults to `blue` to match the existing
   * Workbench look. Pass a different accent when the surrounding modal /
   * section uses its own stage colour (e.g. `red` for the cherry-stage
   * Process & Grade modal in ParchmentTab).
   */
  accent?: ChipAccent
}

const ACCENT_CLASSES: Record<
  ChipAccent,
  {
    ring: string
    selectedBg: string
    selectedBorder: string
    unselectedHoverBorder: string
    unselectedHoverBg: string
    badgeBg: string
    badgeText: string
  }
> = {
  blue: {
    ring: 'focus:ring-blue-500',
    selectedBg: 'bg-blue-600',
    selectedBorder: 'border-blue-600',
    unselectedHoverBorder: 'hover:border-blue-400',
    unselectedHoverBg: 'hover:bg-blue-50',
    badgeBg: 'bg-blue-500',
    badgeText: 'text-blue-600',
  },
  red: {
    ring: 'focus:ring-red-500',
    selectedBg: 'bg-red-600',
    selectedBorder: 'border-red-600',
    unselectedHoverBorder: 'hover:border-red-400',
    unselectedHoverBg: 'hover:bg-red-50',
    badgeBg: 'bg-red-500',
    badgeText: 'text-red-600',
  },
  amber: {
    ring: 'focus:ring-amber-500',
    selectedBg: 'bg-amber-600',
    selectedBorder: 'border-amber-600',
    unselectedHoverBorder: 'hover:border-amber-400',
    unselectedHoverBg: 'hover:bg-amber-50',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-amber-600',
  },
  emerald: {
    ring: 'focus:ring-emerald-500',
    selectedBg: 'bg-emerald-600',
    selectedBorder: 'border-emerald-600',
    unselectedHoverBorder: 'hover:border-emerald-400',
    unselectedHoverBg: 'hover:bg-emerald-50',
    badgeBg: 'bg-emerald-500',
    badgeText: 'text-emerald-600',
  },
}

/**
 * Renders a grid of crop-year chips and highlights the year whose date range
 * includes today with a "Current" badge.
 */
export const CropYearChips: React.FC<CropYearChipsProps> = ({
  years,
  value,
  onChange,
  accent = 'blue',
}) => {
  const currentYearId = useMemo(() => findCurrentCropYearId(years), [years])
  const a = ACCENT_CLASSES[accent]

  const baseChipClass = `relative flex items-center justify-center py-3 px-4 rounded-xl border-2 transition-all duration-200 focus:outline-none focus:ring-2 ${a.ring} focus:ring-offset-2 cursor-pointer`
  const selectedClass = `${a.selectedBg} text-white ${a.selectedBorder} shadow-lg`
  const unselectedClass = `bg-white text-gray-700 border-gray-200 ${a.unselectedHoverBorder} ${a.unselectedHoverBg}`

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
                  isSelected
                    ? `bg-white ${a.badgeText}`
                    : `${a.badgeBg} text-white`
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
