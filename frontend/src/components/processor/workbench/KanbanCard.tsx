import React from 'react'
import type { ProcessingBatch } from '../../../types'
import { formatProcessingBatchId } from '../../../utils/formatDisplayId'
import { isRecentItem } from './constants'

interface KanbanCardProps {
  batch: ProcessingBatch
}

/**
 * Compact card used inside a Kanban column. Colours its left border by process type
 * and attaches a "NEW" badge for recently created or recently completed batches.
 */
export const KanbanCard: React.FC<KanbanCardProps> = ({ batch }) => {
  const processColors = {
    Washed: { border: 'border-l-sky-500', badge: 'bg-sky-50 text-sky-700' },
    Natural: {
      border: 'border-l-amber-500',
      badge: 'bg-amber-50 text-amber-700',
    },
    Honey: {
      border: 'border-l-yellow-500',
      badge: 'bg-yellow-50 text-yellow-700',
    },
  }
  const colors =
    processColors[batch.processType as keyof typeof processColors] || processColors['Washed']
  const isNewBatch = isRecentItem(
    batch.createdAt ?? batch.dryingEndDate ?? batch.baggingDate,
  )

  return (
    <div
      className={`bg-white border-l-4 ${colors.border} rounded-lg p-3 border border-gray-200 hover:shadow-md transition-all duration-200 mb-2`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">
            {formatProcessingBatchId(batch)}
          </p>
          {isNewBatch && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
              NEW
            </span>
          )}
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}
        >
          {batch.processType}
        </span>
      </div>

      <div className="text-xs space-y-1.5 text-gray-500">
        <div className="flex justify-between">
          <span>Weight</span>
          <span className="font-medium text-gray-900">
            {batch.parchmentWeightKg ? `${batch.parchmentWeightKg} kg` : '-'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Moisture</span>
          <span className="font-medium text-gray-900">
            {batch.moistureContent ? `${batch.moistureContent}%` : '-'}
          </span>
        </div>
        {batch.processNotes && (
          <div className="flex justify-between">
            <span>Notes</span>
            <span
              className="font-medium text-gray-700 truncate max-w-[100px]"
              title={batch.processNotes}
            >
              {batch.processNotes.substring(0, 15)}...
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default KanbanCard
