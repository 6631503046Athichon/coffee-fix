import React from 'react';
import { BookText, Flame, ChevronLeft, ChevronRight, Calendar, Scale, TrendingDown } from 'lucide-react';
import { RoastBatch } from '../../types';
import { toFixed2 } from '../../utils/formatters';
import { formatGreenBeanId } from '../../utils/formatDisplayId';

const RoastLogPanel: React.FC<{
  roasts: RoastBatch[];
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  onPageChange?: (page: number) => void;
}> = ({ roasts, page, totalPages, onPrev, onNext, onPageChange }) => {
  if (roasts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <BookText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Roast Log</h3>
              <p className="text-sm text-gray-500">Your roasting history</p>
            </div>
          </div>
        </div>
        <div className="text-center py-12 px-6">
          <div className="relative w-24 h-24 mx-auto mb-5">
            {/* Decorative background circles */}
            <div className="absolute inset-0 bg-gradient-to-br from-amber-100 to-orange-100 rounded-full opacity-60"></div>
            <div className="absolute inset-2 bg-gradient-to-br from-amber-50 to-orange-50 rounded-full"></div>
            {/* Icon container */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                <Flame className="h-7 w-7 text-white" />
              </div>
            </div>
          </div>
          <h4 className="text-lg font-semibold text-gray-800 mb-2">Ready to Roast?</h4>
          <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
            Your roasting journey starts here. Complete a roast batch to see your history and track your progress.
          </p>
          <div className="mt-5 flex items-center justify-center gap-4 text-xs text-gray-400">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>Track dates</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5" />
              <span>Monitor yields</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" />
              <span>Analyze trends</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
            <BookText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Roast Log</h3>
            <p className="text-sm text-gray-500">Your roasting history</p>
          </div>
        </div>
      </div>

      {/* Roast Cards */}
      <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
        {roasts.map((roast) => (
          <div
            key={roast.id}
            className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition-all"
          >
            {/* Top Row */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                {/* Date and Lot */}
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Calendar className="h-3.5 w-3.5" />
                    <span className="font-medium">{roast.roastDate}</span>
                  </div>
                  <span className="text-gray-300">|</span>
                  <span className="text-sm font-mono font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                    {(roast as any).formattedLotId ?? formatGreenBeanId({ id: roast.greenBeanLotId, displayId: (roast as any).greenBeanDisplayId })}
                  </span>
                  {roast.roastLevel && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700">
                      {roast.roastLevel}
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Scale className="h-4 w-4 text-gray-400" />
                    <span className="font-semibold text-gray-900">{toFixed2(roast.batchSizeKg)} kg</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="h-4 w-4 text-orange-500" />
                    <span className="font-semibold text-orange-600">
                      {typeof roast.yieldPercentage === 'number'
                        ? `${roast.yieldPercentage.toFixed(1)}%`
                        : `${roast.yieldPercentage}%`}
                      <span className="text-gray-500 font-normal ml-1">yield</span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="w-9 h-9 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Flame className="h-5 w-5 text-orange-500" />
              </div>
            </div>

            {/* Notes */}
            {roast.roastProfileNotes && (
              <div className="mb-3 bg-gray-50 rounded-md p-3 border-l-2 border-gray-300">
                <p className="text-sm text-gray-600 leading-relaxed">{roast.roastProfileNotes}</p>
              </div>
            )}

            {/* Flavor Tags */}
            {roast.flavorNotes && (
              <div className="flex flex-wrap gap-1.5">
                {roast.flavorNotes
                  .split(',')
                  .map((note) => note.trim())
                  .filter(Boolean)
                  .map((note, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded border border-amber-200"
                    >
                      {note}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <div className="flex justify-center items-center gap-1">
            <button
              onClick={onPrev}
              disabled={page === 1}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-white rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {(() => {
              const TOTAL_SLOTS = 7;
              const tp = totalPages;
              const cp = page;
              let slots: (number | 'ellipsis')[] = [];
              if (tp <= TOTAL_SLOTS) {
                slots = Array.from({ length: tp }, (_, i) => i + 1);
              } else if (cp <= 4) {
                slots = [1, 2, 3, 4, 5, 'ellipsis', tp];
              } else if (cp >= tp - 3) {
                slots = [1, 'ellipsis', tp - 4, tp - 3, tp - 2, tp - 1, tp];
              } else {
                slots = [1, 'ellipsis', cp - 1, cp, cp + 1, 'ellipsis', tp];
              }
              return slots.map((slot, idx) => (
                slot === 'ellipsis' ? (
                  <span key={`e-${idx}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">...</span>
                ) : (
                  <button key={slot} onClick={() => onPageChange ? onPageChange(slot) : (slot < page ? onPrev() : onNext())} className={`w-8 h-8 text-sm font-medium rounded-md transition-colors flex items-center justify-center ${cp === slot ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-white'}`}>{slot}</button>
                )
              ));
            })()}
            <button
              onClick={onNext}
              disabled={page === totalPages}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-white rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoastLogPanel;
