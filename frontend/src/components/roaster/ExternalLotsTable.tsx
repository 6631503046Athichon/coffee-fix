import React from 'react';
import { Package, PlusCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../common/Button';
import type { ExternalDisplayLot } from '../../types/displayTypes';
import { toFixed2 } from '../../utils/formatters';

interface ExternalLotsTableProps {
  lots: ExternalDisplayLot[];
  onClaim: (lot: ExternalDisplayLot) => void;
  onAddExternal: () => void;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  hideHeader?: boolean;
}

const ExternalLotsTable: React.FC<ExternalLotsTableProps> = ({ lots, onClaim, onAddExternal, currentPage = 1, totalPages = 1, onPageChange, hideHeader = false }) => {
  return (
    <div className={hideHeader ? '' : 'bg-white rounded-xl border border-gray-200 overflow-hidden'}>
      {/* Header */}
      {!hideHeader && (
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Package className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Purchased Lots</h3>
              <p className="text-sm text-gray-500">External green bean inventory</p>
            </div>
          </div>
          <Button
            variant="success"
            size="sm"
            icon={<PlusCircle className="h-4 w-4" />}
            onClick={onAddExternal}
          >
            Add Lot
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-800">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Lot ID</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Details</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Grade</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Available</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-200 uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lots.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <Package className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 font-medium">No external lots available</p>
                    <p className="text-xs text-gray-400 mt-1">Add a new lot to get started</p>
                  </div>
                </td>
              </tr>
            ) : (
              lots.map((lot, index) => (
                <tr
                  key={lot.id}
                  className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                >
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-100 text-sm font-mono font-semibold text-gray-900" title={lot.id}>
                      #{lot.id.substring(0, 6).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-sm font-medium text-gray-900">{lot.displayInfo}</div>
                    {lot.displayPrice && (
                      <div className="text-xs text-gray-500 mt-1">{lot.displayPrice}/kg</div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-50 text-sm font-medium text-amber-700 border border-amber-200">
                      {lot.gradeDisplay}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm font-semibold text-gray-900">{toFixed2(lot.currentWeightKg)}</span>
                    <span className="text-sm text-gray-500 ml-1">kg</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onClaim(lot)}
                    >
                      Claim
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer with count or Pagination */}
      {lots.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
          {totalPages > 1 && onPageChange ? (
            <div className="flex justify-center items-center gap-1">
              <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-white rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {(() => {
                const TOTAL_SLOTS = 7;
                const tp = totalPages;
                const cp = currentPage;
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
                    <button key={slot} onClick={() => onPageChange(slot)} className={`w-8 h-8 text-sm font-medium rounded-md transition-colors flex items-center justify-center ${cp === slot ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-white'}`}>{slot}</button>
                  )
                ));
              })()}
              <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-white rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              Showing <span className="font-medium text-gray-700">{lots.length}</span> lot{lots.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ExternalLotsTable;
