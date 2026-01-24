import React from 'react';
import { ProcessingBatch } from '../../../types';
import { CheckCircle, Package, Coffee, Activity, Calendar } from 'lucide-react';

export interface CompleteBatchModalProps {
  batch: ProcessingBatch;
}

const CompleteBatchModal: React.FC<CompleteBatchModalProps> = ({ batch }) => {
  const duration = batch.dryingStartDate && batch.dryingEndDate
    ? `${Math.max(1, Math.round((new Date(batch.dryingEndDate).getTime() - new Date(batch.dryingStartDate).getTime()) / (1000 * 3600 * 24)))} days`
    : 'N/A';

  return (
    <>
      {/* Modal Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="p-4 bg-green-100 rounded-xl shadow-md">
          <CheckCircle className="h-10 w-10 text-green-600" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Complete Processing Batch</h2>
          <p className="text-base text-gray-600 mt-1">Batch #{batch.id.substring(0, 8).toUpperCase()}</p>
        </div>
      </div>

      {/* Batch Summary Card */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 mb-6 border border-blue-200 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <Package className="h-4 w-4 text-blue-600" />
          Batch Summary
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Harvest Lot</p>
            <p className="text-xl font-bold text-gray-900">#{batch.harvestLotId.substring(0, 8).toUpperCase()}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Process Type</p>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-3 w-3 rounded-full ${
                batch.processType === 'Washed' ? 'bg-blue-500' :
                batch.processType === 'Natural' ? 'bg-amber-500' :
                'bg-yellow-500'
              }`}></span>
              <span className="text-xl font-bold text-gray-900">{batch.processType}</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Current Status</p>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full border bg-yellow-50 text-yellow-700 border-yellow-200">
              <Activity className="h-3 w-3" />
              {batch.status}
            </span>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Drying Duration</p>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-lg font-semibold text-gray-700">{duration}</span>
            </div>
          </div>
        </div>

        {batch.processNotes && (
          <div className="mt-4 pt-4 border-t border-blue-200">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Process Notes</p>
            <p className="text-sm text-gray-700 italic">"{batch.processNotes}"</p>
          </div>
        )}
      </div>

      {/* Confirmation Message */}
      <div className="bg-green-50 rounded-xl p-5 mb-6 border border-green-200">
        <div className="flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Ready to Complete?</p>
            <p className="text-xs text-gray-700">
              Completing this batch will mark it as finished and ready for the next stage (hulling & grading).
              Make sure all drying processes have been completed before proceeding.
            </p>
          </div>
        </div>
      </div>

      {/* Optional Completion Notes */}
      <div className="mb-6">
        <label htmlFor="completionNotes" className="block text-sm font-semibold text-gray-700 mb-2">
          Completion Notes (Optional)
        </label>
        <textarea
          id="completionNotes"
          name="completionNotes"
          rows={3}
          placeholder="e.g., Final moisture check passed, ready for hulling, exceptional quality..."
          className="w-full border border-gray-300 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 shadow-sm transition-all resize-none"
        />
        <p className="mt-1 text-xs text-gray-500">Add any final observations or quality notes about this batch.</p>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-start gap-2">
          <Coffee className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-700">
            <span className="font-semibold">Next Steps:</span> After completing this batch, the parchment coffee will be available for hulling and grading in the Parchment Stock section.
          </p>
        </div>
      </div>
    </>
  );
};

export default CompleteBatchModal;
