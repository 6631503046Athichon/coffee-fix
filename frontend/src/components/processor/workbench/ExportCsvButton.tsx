import React from 'react'
import { Download } from 'lucide-react'

interface ExportCsvButtonProps {
  onClick: () => void
  /** How many rows the export would hold; nothing to export disables it. */
  count: number
  /** Shorter label for the narrow workflow columns. */
  compact?: boolean
  className?: string
}

/** The workbench's secondary-button look, used in each stock section header. */
const ExportCsvButton: React.FC<ExportCsvButtonProps> = ({
  onClick,
  count,
  compact = false,
  className = '',
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={count === 0}
    aria-label="Export CSV"
    title={
      count === 0
        ? 'Nothing matches the current search and filters'
        : `Export ${count} matching ${count === 1 ? 'lot' : 'lots'} as CSV`
    }
    className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white ${className}`}
  >
    <Download size={14} />
    {compact ? 'CSV' : 'Export CSV'}
  </button>
)

export default ExportCsvButton
