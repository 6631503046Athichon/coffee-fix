import React from 'react'
import { Download } from 'lucide-react'

interface ExportCsvButtonProps {
  onClick: () => void
  /** How many rows the export would hold, for the tooltip. */
  count: number
  /** Shorter label for the narrow workflow columns. */
  compact?: boolean
  className?: string
}

/**
 * The workbench's secondary-button look, used in each stock section header.
 * It stays enabled with nothing to export, like every Export CSV in the app:
 * the click then says so (downloadCsv's "Nothing to export" toast).
 */
const ExportCsvButton: React.FC<ExportCsvButtonProps> = ({
  onClick,
  count,
  compact = false,
  className = '',
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Export CSV"
    title={
      count === 0
        ? 'Nothing matches the current search and filters'
        : `Export ${count} matching ${count === 1 ? 'lot' : 'lots'} as CSV`
    }
    className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 transition-colors ${className}`}
  >
    <Download size={14} />
    {compact ? 'CSV' : 'Export CSV'}
  </button>
)

export default ExportCsvButton
