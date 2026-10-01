import React, { useMemo } from 'react'
import { Check } from 'lucide-react'
import type { ProcessType } from '../../../types'
import {
  PROCESS_TYPE_COLORS,
  processTypeChoices,
  processTypeKey,
  type ProcessTypeHue,
} from './processTypeColors'

interface ProcessTypeChipProps {
  name: string
  hue: ProcessTypeHue
  selected: boolean
  /** Without onClick the chip is a static preview (a span, not a button). */
  onClick?: () => void
  title?: string
}

/**
 * One process-type chip: a light tint with a colour dot, or, when selected,
 * a solid fill with white text and a check. Shared by the picker below and
 * the admin colour preview, so both always look the same.
 */
export const ProcessTypeChip: React.FC<ProcessTypeChipProps> = ({ name, hue, selected, onClick, title }) => {
  const colors = PROCESS_TYPE_COLORS[hue]
  // Only a button gets the hover tint; a static preview must not look clickable.
  const className = `flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${colors.focusRing} ${
    selected ? colors.chipSelected : onClick ? `${colors.chip} ${colors.chipHover}` : colors.chip
  }`
  const content = (
    <>
      {/* One fixed slot for the dot or the check, so the label never moves. */}
      <span
        data-testid="process-type-chip-icon"
        className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        {selected ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
        )}
      </span>
      <span className="min-w-0 break-words">{name}</span>
    </>
  )

  if (!onClick) {
    return (
      <span className={className} title={title} data-selected={selected}>
        {content}
      </span>
    )
  }
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} title={title} className={className}>
      {content}
    </button>
  )
}

interface ProcessTypeChipsProps {
  /** The stored process-type name; sent back unchanged when picked. */
  value: string
  onChange: (name: string) => void
  /** The admin-managed list (data.processTypes). */
  processTypes: readonly ProcessType[] | null | undefined
  /** Accessible name of the chip group. */
  label?: string
}

/**
 * Process-type picker: one chip per active admin process type, in that
 * type's colour, 2 per row on a phone and 3 from `sm` up. An unselected chip
 * is a light tint with a colour dot; the selected chip is filled with a check.
 * The current value stays listed even when it is inactive or unknown.
 */
export const ProcessTypeChips: React.FC<ProcessTypeChipsProps> = ({
  value,
  onChange,
  processTypes,
  label = 'Process type',
}) => {
  const choices = useMemo(
    () => processTypeChoices(processTypes, value),
    [processTypes, value],
  )
  const selectedKey = processTypeKey(value)

  if (choices.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500">
        No active process types. An admin can add one under Process Types.
      </p>
    )
  }

  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {choices.map((choice) => (
        <ProcessTypeChip
          key={processTypeKey(choice.name)}
          name={choice.name}
          hue={choice.hue}
          selected={processTypeKey(choice.name) === selectedKey}
          onClick={() => onChange(choice.name)}
          title={choice.inactive ? `${choice.name} (no longer offered, kept for this record)` : undefined}
        />
      ))}
    </div>
  )
}

export default ProcessTypeChips
