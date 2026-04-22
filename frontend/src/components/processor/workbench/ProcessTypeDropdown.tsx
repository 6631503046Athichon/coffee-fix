import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface ProcessTypeOption {
  value: string
  label: string
}

interface ProcessTypeDropdownProps {
  value: string
  onChange: (value: string) => void
  processTypes: ProcessTypeOption[]
}

/**
 * Custom dropdown for selecting a processing method (Washed / Natural / Honey / ...).
 * Falls back to the first available option when `value` doesn't match and shows a
 * disabled placeholder when the option list is empty.
 */
export const ProcessTypeDropdown: React.FC<ProcessTypeDropdownProps> = ({
  value,
  onChange,
  processTypes,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const options = processTypes || []

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption =
    options.find((opt) => opt.value === value) ||
    options[0] || { value: '', label: 'No process types available' }
  const hasOptions = options.length > 0

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => hasOptions && setIsOpen(!isOpen)}
        disabled={!hasOptions}
        className={`w-full border border-gray-300 rounded-xl px-4 py-3 text-base font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-gray-400 flex items-center justify-between gap-2 shadow-sm ${
          !hasOptions ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <span className="text-gray-900">{selectedOption.label}</span>
        <ChevronDown
          className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && hasOptions && (
        <div className="absolute z-20 mt-3 left-0 right-0 bg-white border border-gray-300 rounded-xl shadow-2xl overflow-hidden">
          <div className="py-2">
            {options.length === 0 ? (
              <div className="px-5 py-3 text-sm text-gray-500 text-center">
                No active process types available
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
                  className={`w-full text-left px-5 py-3 transition-all text-base font-medium ${
                    option.value === value
                      ? 'bg-gray-100 text-gray-900 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
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

export default ProcessTypeDropdown
