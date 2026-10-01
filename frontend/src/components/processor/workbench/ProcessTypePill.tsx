import React from 'react'
import type { ProcessType } from '../../../types'
import { PROCESS_TYPE_COLORS, processTypeColors, type ProcessTypeHue } from './processTypeColors'

const DEFAULT_PILL_SHAPE =
  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap'

/** The small uppercase pill shape the Parchment page uses (also in the admin preview). */
export const PARCHMENT_PILL_SHAPE =
  'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border'

interface ProcessTypePillProps {
  /** The stored process-type name. */
  type: string | null | undefined
  /** The admin-managed list (data.processTypes) the colour is read from. */
  processTypes?: readonly ProcessType[] | null
  /** A colour to use instead of looking the type up by name (admin list, preview). */
  hue?: ProcessTypeHue
  /** Shape and type size; the colours always come from the process type. */
  className?: string
  /** Text for an empty value. */
  emptyLabel?: string
}

/** A process-type badge in the colour the admin gave that type (gray if none). */
export const ProcessTypePill: React.FC<ProcessTypePillProps> = ({
  type,
  processTypes,
  hue,
  className = DEFAULT_PILL_SHAPE,
  emptyLabel = '—',
}) => (
  <span className={`${className} ${(hue ? PROCESS_TYPE_COLORS[hue] : processTypeColors(processTypes, type)).pill}`}>
    {type || emptyLabel}
  </span>
)

/** A small dot in the process type's colour, to sit before plain text. */
export const ProcessTypeDot: React.FC<{
  type: string | null | undefined
  processTypes: readonly ProcessType[] | null | undefined
  className?: string
}> = ({ type, processTypes, className = 'h-2.5 w-2.5' }) => (
  <span
    aria-hidden="true"
    className={`inline-block flex-shrink-0 rounded-full ${className} ${processTypeColors(processTypes, type).dot}`}
  />
)

export default ProcessTypePill
