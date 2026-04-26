import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

type DropdownAccent = 'gray' | 'amber' | 'red' | 'emerald' | 'blue'

interface GradeDropdownProps {
  value: string
  onChange: (value: string) => void
  index?: number
  usedGrades?: string[]
  /**
   * Colour theme for the dropdown. Defaults to `gray` (neutral, matches the
   * Workbench look). Pass a different accent when the dropdown sits inside
   * a stage-themed container (e.g. `amber` for the Grade Splits section in
   * the Process & Grade modal).
   */
  accent?: DropdownAccent
  size?: 'sm' | 'md'
}

const ALL_GRADE_OPTIONS = [
  { value: 'Grade A', label: 'Grade A' },
  { value: 'Grade B', label: 'Grade B' },
  { value: 'Grade C', label: 'Grade C' },
  { value: 'Peaberry', label: 'Peaberry' },
  { value: 'Screen 18', label: 'Screen 18' },
  { value: 'Screen 17', label: 'Screen 17' },
  { value: 'Screen 16', label: 'Screen 16' },
  { value: 'Screen 15', label: 'Screen 15' },
]

const ACCENT_CLASSES: Record<
  DropdownAccent,
  {
    triggerHoverBorder: string
    triggerFocus: string
    optionHoverBg: string
    optionSelectedBg: string
    optionSelectedText: string
  }
> = {
  gray: {
    triggerHoverBorder: 'hover:border-gray-300',
    triggerFocus: 'focus:ring-gray-300 focus:border-gray-300',
    optionHoverBg: 'hover:bg-gray-50',
    optionSelectedBg: 'bg-gray-100',
    optionSelectedText: 'text-gray-900',
  },
  amber: {
    triggerHoverBorder: 'hover:border-amber-400',
    triggerFocus: 'focus:ring-amber-400 focus:border-amber-400',
    optionHoverBg: 'hover:bg-amber-50',
    optionSelectedBg: 'bg-amber-100',
    optionSelectedText: 'text-amber-800',
  },
  red: {
    triggerHoverBorder: 'hover:border-red-400',
    triggerFocus: 'focus:ring-red-400 focus:border-red-400',
    optionHoverBg: 'hover:bg-red-50',
    optionSelectedBg: 'bg-red-100',
    optionSelectedText: 'text-red-800',
  },
  emerald: {
    triggerHoverBorder: 'hover:border-emerald-400',
    triggerFocus: 'focus:ring-emerald-400 focus:border-emerald-400',
    optionHoverBg: 'hover:bg-emerald-50',
    optionSelectedBg: 'bg-emerald-100',
    optionSelectedText: 'text-emerald-800',
  },
  blue: {
    triggerHoverBorder: 'hover:border-blue-400',
    triggerFocus: 'focus:ring-blue-400 focus:border-blue-400',
    optionHoverBg: 'hover:bg-blue-50',
    optionSelectedBg: 'bg-blue-100',
    optionSelectedText: 'text-blue-800',
  },
}

/**
 * Dropdown for picking a coffee grade. Filters out grades that are already
 * used by sibling rows, but keeps the current row's own value visible.
 */
export const GradeDropdown: React.FC<GradeDropdownProps> = ({
  value,
  onChange,
  usedGrades = [],
  accent = 'gray',
  size = 'sm',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const a = ACCENT_CLASSES[accent]

  const options = ALL_GRADE_OPTIONS.filter(
    (opt) => !usedGrades.includes(opt.value) || opt.value === value,
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = ALL_GRADE_OPTIONS.find((opt) => opt.value === value)
  const triggerHeight = size === 'md' ? 'h-[46px]' : 'py-2'
  const triggerPad = size === 'md' ? 'px-4' : 'px-3'
  const triggerText = size === 'md' ? 'text-sm' : 'text-sm'

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full border border-gray-200 rounded-xl ${triggerPad} ${triggerHeight} ${triggerText} font-medium bg-white focus:outline-none focus:ring-2 ${a.triggerFocus} transition-all ${a.triggerHoverBorder} flex items-center justify-between gap-2 shadow-sm`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {selectedOption ? selectedOption.label : 'Select grade'}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-2 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
          <div className="py-1">
            {options.length === 0 ? (
              <div className="px-4 py-3 text-xs text-gray-400 text-center italic">
                All grades already used
              </div>
            ) : (
              options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={`w-full text-left px-4 py-2.5 transition-all text-sm font-medium ${
                    value === option.value
                      ? `${a.optionSelectedBg} ${a.optionSelectedText} font-semibold`
                      : `text-gray-700 ${a.optionHoverBg}`
                  }`}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default GradeDropdown
