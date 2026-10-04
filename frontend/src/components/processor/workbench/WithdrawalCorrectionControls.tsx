import React from 'react'
import { Ban, Pencil } from 'lucide-react'
import { formatDateDisplay } from '../../../utils/formatters'

// The bits every withdrawal list shares for D7 corrections: the "Voided" tag,
// the line saying when, by whom and why, and the Edit (Sale) / Void buttons.

/** Small red tag next to a voided row's type. */
export const VoidedTag: React.FC = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-50 text-red-700 border border-red-200">
    <Ban className="h-3 w-3" />
    Voided
  </span>
)

interface VoidedNoteProps {
  voidedAt?: string | null
  /** Who voided it, by name, when the page knows them. */
  voidedByName?: string
  /** Absent on someone else's lot: the backend withholds it with the sale. */
  voidReason?: string | null
  className?: string
}

/** "Voided 4 Oct 2026 by Somchai: Wrong lot picked" */
export const VoidedNote: React.FC<VoidedNoteProps> = ({
  voidedAt,
  voidedByName,
  voidReason,
  className = '',
}) => (
  <p className={`text-[11px] text-red-700 ${className}`} data-testid="voided-note">
    Voided
    {voidedAt ? ` ${formatDateDisplay(voidedAt)}` : ''}
    {voidedByName ? ` by ${voidedByName}` : ''}
    {voidReason ? (
      <>
        : <span className="italic">{voidReason}</span>
      </>
    ) : (
      ''
    )}
  </p>
)

interface WithdrawalRowActionsProps {
  /** Edit is shown when this is set (a Sale the user may manage). */
  onEdit?: () => void
  /** Void is shown when this is set (a row the user may manage, not void). */
  onVoid?: () => void
  /** 'card' for the Workbench history cards, 'compact' for one-line rows. */
  variant?: 'card' | 'compact'
}

/** The Edit and Void buttons of one withdrawal row. Renders nothing without either. */
export const WithdrawalRowActions: React.FC<WithdrawalRowActionsProps> = ({
  onEdit,
  onVoid,
  variant = 'card',
}) => {
  if (!onEdit && !onVoid) return null
  if (variant === 'compact') {
    return (
      <span className="inline-flex items-center gap-1 flex-shrink-0">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit sale"
            title="Edit sale: customer, price, invoice number"
            className="p-1 rounded-md border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
        {onVoid && (
          <button
            type="button"
            onClick={onVoid}
            aria-label="Void withdrawal"
            title="Void: put the kg back in stock"
            className="p-1 rounded-md border border-red-200 text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
          >
            <Ban className="h-3 w-3" />
          </button>
        )}
      </span>
    )
  }
  return (
    <>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit sale"
          title="Edit sale: customer, price, invoice number"
          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 transition-all"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      )}
      {onVoid && (
        <button
          type="button"
          onClick={onVoid}
          aria-label="Void withdrawal"
          title="Void: put the kg back in stock"
          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-red-600 bg-white hover:bg-red-50 border border-red-200 transition-all"
        >
          <Ban className="h-3.5 w-3.5" />
          Void
        </button>
      )}
    </>
  )
}
