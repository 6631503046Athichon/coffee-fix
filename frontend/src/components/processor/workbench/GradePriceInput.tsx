import React, { useId } from 'react'
import { gradePriceError, gradePriceLabel } from './gradePrice'

type PriceAccent = 'green' | 'amber'

interface GradePriceInputProps {
  value: string
  onChange: (value: string) => void
  /** 1-based row number; names the input "Price per kg in THB (optional), row 1". */
  row: number
  accent?: PriceAccent
  /** `md` matches the 46px-tall inputs of the Process & Grade popup. */
  size?: 'sm' | 'md'
}

const FOCUS_CLASSES: Record<PriceAccent, string> = {
  green: 'focus:ring-green-500 focus:border-green-500',
  amber: 'focus:ring-amber-500 focus:border-amber-500',
}

/**
 * Optional THB price per kg for one grade-split row. A text input with a
 * decimal keypad (a number input would silently blank out "abc"), an
 * "Optional" placeholder (0 is refused, so no "0.00"), a "THB" suffix, and
 * the row's own error underneath.
 */
const GradePriceInput: React.FC<GradePriceInputProps> = ({
  value,
  onChange,
  row,
  accent = 'green',
  size = 'sm',
}) => {
  const errorId = useId()
  const error = gradePriceError(value)
  const shape =
    size === 'md'
      ? 'h-[46px] rounded-xl pl-4 text-base font-bold'
      : 'py-2 rounded-lg pl-3 text-sm font-semibold'
  const state = error
    ? 'border-red-400 bg-red-50 focus:ring-red-500 focus:border-red-500'
    : `border-gray-300 bg-white ${FOCUS_CLASSES[accent]}`

  return (
    <div className="min-w-0">
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="Optional"
          aria-label={gradePriceLabel(row)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`block w-full border ${shape} pr-11 text-gray-800 focus:outline-none focus:ring-1 transition-all ${state}`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[11px] font-semibold text-gray-400">
          THB
        </span>
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-[11px] font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

export default GradePriceInput
