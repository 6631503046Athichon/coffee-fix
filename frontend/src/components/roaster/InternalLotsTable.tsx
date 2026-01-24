import React from 'react';
import { Package } from 'lucide-react';
import { Button } from '../common/Button';
import type { InternalDisplayLot } from '../../types/displayTypes';
import { toFixed2 } from '../../utils/formatters';

interface InternalLotsTableProps {
  lots: InternalDisplayLot[];
  onClaim: (lot: InternalDisplayLot) => void;
}

const InternalLotsTable: React.FC<InternalLotsTableProps> = ({ lots, onClaim }) => {
  return (
    <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
      <div className="p-6 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xl font-bold flex items-center text-gray-900">
          <div className="p-2 bg-blue-100 rounded-lg mr-3">
            <Package className="h-5 w-5 text-blue-600" />
          </div>
          Internal Lots
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider w-1/5">Lot</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider w-1/4">Info</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider w-1/8">Score</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider w-1/8">Grade</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider w-1/8">Available</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider w-1/8">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {lots.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">No internal lots available</td>
              </tr>
            ) : (
              lots.map((lot) => (
                <tr key={lot.id} className="bg-white hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4">
                    <span className="text-sm font-bold text-gray-900 truncate block" title={lot.id}>{lot.id.substring(0, 8)}...</span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-sm truncate">
                      <span className="text-gray-700 font-medium">{lot.displayInfo}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm font-bold text-blue-600">{lot.displayScore}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm font-semibold text-gray-700">{lot.gradeDisplay}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-gray-700 font-semibold">{toFixed2(lot.currentWeightKg)} kg</span>
                  </td>
                  <td className="px-4 py-4">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onClaim(lot)}
                    >
                      Claim Stock
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InternalLotsTable;
