import React from 'react';
import { Package, PlusCircle } from 'lucide-react';
import { Button } from '../common/Button';
import type { ExternalDisplayLot } from '../../types/displayTypes';
import { toFixed2 } from '../../utils/formatters';

interface ExternalLotsTableProps {
  lots: ExternalDisplayLot[];
  onClaim: (lot: ExternalDisplayLot) => void;
  onAddExternal: () => void;
}

const ExternalLotsTable: React.FC<ExternalLotsTableProps> = ({ lots, onClaim, onAddExternal }) => {
  return (
    <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
      <div className="p-6 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xl font-bold flex items-center text-gray-900">
          <div className="p-2 bg-green-100 rounded-lg mr-3">
            <Package className="h-5 w-5 text-green-600" />
          </div>
          Purchased (External) Lots
        </h3>
        <Button
          variant="success"
          size="sm"
          icon={<PlusCircle className="h-4 w-4" />}
          onClick={onAddExternal}
        >
          Add External Lot
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Lot</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Info</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Grade</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Available</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {lots.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-6 text-center text-sm text-gray-500">No external lots available</td>
              </tr>
            ) : (
              lots.map((lot) => (
                <tr key={lot.id} className="bg-white hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-bold text-gray-900">{lot.id}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm">
                      <span className="text-gray-700 font-medium">{lot.displayInfo}</span>
                      {lot.displayPrice && (
                        <div className="text-xs text-gray-500 mt-0.5">Price: {lot.displayPrice}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500">{lot.gradeDisplay}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-700 font-semibold">{toFixed2(lot.currentWeightKg)} kg</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
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

export default ExternalLotsTable;
