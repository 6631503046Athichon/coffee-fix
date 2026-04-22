import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface GradeDropdownProps {
  value: string
  onChange: (value: string) => void
  index: number
  usedGrades?: string[]
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

/**
 * Dropdown for picking a coffee grade. Filters out grades that are already
 * used by sibling rows, but keeps the current row's own value visible.
 */
export const GradeDropdown: React.FC<GradeDropdownProps> = ({
  value,
  onChange,
  usedGrades = [],
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 transition-all hover:border-gray-300 flex items-center justify-between gap-2"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {selectedOption ? selectedOption.label : 'Select Grade'}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-2 left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
          <div className="py-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`w-full text-left px-4 py-2.5 transition-all text-sm font-medium ${
                  value === option.value
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default GradeDropdown
