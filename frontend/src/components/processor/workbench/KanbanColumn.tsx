import React from 'react'
import { PackageCheck } from 'lucide-react'
import type { ProcessingBatch } from '../../../types'
import KanbanCard from './KanbanCard'

interface KanbanColumnProps {
  title: string
  batches: ProcessingBatch[]
  icon: React.ReactNode
  color: string
}

const COLUMN_STYLES: Record<string, { iconBg: string; iconColor: string; countColor: string }> = {
  'border-amber-400': {
    iconBg: 'bg-amber-500',
    iconColor: 'text-white',
    countColor: 'text-amber-600',
  },
  'border-blue-400': {
    iconBg: 'bg-blue-500',
    iconColor: 'text-white',
    countColor: 'text-blue-600',
  },
  'border-green-400': {
    iconBg: 'bg-green-500',
    iconColor: 'text-white',
    countColor: 'text-green-600',
  },
}

/**
 * Kanban lane that holds the workbench batches for a single stage. Renders an
 * empty-state illustration when no batches are present.
 */
export const KanbanColumn: React.FC<KanbanColumnProps> = ({ title, batches, icon, color }) => {
  const styles = COLUMN_STYLES[color] || COLUMN_STYLES['border-amber-400']

  return (
    <div className="bg-white rounded-2xl p-4 w-full flex flex-col border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-10 h-10 ${styles.iconBg} rounded-xl flex items-center justify-center shadow-md`}
          >
            <span className={styles.iconColor}>{icon}</span>
          </div>
          <div>
            <h3 className="font-semibold text-base text-gray-900">{title}</h3>
            <p className={`text-sm ${styles.countColor}`}>
              {batches.length} {batches.length === 1 ? 'batch' : 'batches'}
            </p>
          </div>
        </div>
      </div>
      <div
        className="flex-grow overflow-y-auto pr-2 custom-scrollbar"
        style={{ maxHeight: '500px' }}
      >
        {batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors">
            <PackageCheck className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium text-gray-500">No completed batches yet</p>
          </div>
        ) : (
          batches.map((batch) => <KanbanCard key={batch.id} batch={batch} />)
        )}
      </div>
    </div>
  )
}

export default KanbanColumn
