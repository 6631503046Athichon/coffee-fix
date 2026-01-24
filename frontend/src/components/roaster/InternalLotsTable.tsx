import React from 'react';
import { Package, Star } from 'lucide-react';
import { Button } from '../common/Button';
import type { InternalDisplayLot } from '../../types/displayTypes';
import { toFixed2 } from '../../utils/formatters';

interface InternalLotsTableProps {
  lots: InternalDisplayLot[];
  onClaim: (lot: InternalDisplayLot) => void;
}

const InternalLotsTable: React.FC<InternalLotsTableProps> = ({ lots, onClaim }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Internal Lots</h3>
            <p className="text-sm text-gray-500">Farm-processed green beans</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-800">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Lot ID</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Details</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Score</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Grade</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Available</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-200 uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lots.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <Package className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 font-medium">No internal lots available</p>
                    <p className="text-xs text-gray-400 mt-1">Process parchment lots to create green beans</p>
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
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <Star className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-bold text-blue-600">{lot.displayScore}</span>
                    </div>
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

      {/* Footer with count */}
      {lots.length > 0 && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Showing <span className="font-medium text-gray-700">{lots.length}</span> lot{lots.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
};

export default InternalLotsTable;
