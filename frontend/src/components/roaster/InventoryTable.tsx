import React from 'react';
import { Flame, PlusCircle } from 'lucide-react';
import { Button } from '../common/Button';
import { RoasterInventoryItem } from '../../types';
import { toFixed2 } from '../../utils/formatters';

export type InventoryDisplayItem = RoasterInventoryItem & {
  variety: string;
  process: string;
};

interface InventoryTableProps {
  items: InventoryDisplayItem[];
  onLogRoast: (item: InventoryDisplayItem) => void;
}

const InventoryTable: React.FC<InventoryTableProps> = ({ items, onLogRoast }) => {
  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-100">
      <div className="p-5 border-b border-gray-200">
        <h3 className="text-xl font-bold flex items-center text-gray-900">
          <div className="p-2 bg-orange-100 rounded-lg mr-3">
            <Flame className="h-5 w-5 text-orange-600" />
          </div>
          My Green Bean Inventory
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider w-1/4">Lot</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider w-1/3">Info</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider w-1/5">Remaining</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider w-1/5">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((item) => (
              <tr key={item.id} className="bg-white hover:bg-gray-50 transition-colors duration-150">
                <td className="px-4 py-4">
                  <span className="text-sm font-bold text-gray-900 truncate block" title={item.greenBeanLotId}>{item.greenBeanLotId.substring(0, 8)}...</span>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm truncate">
                    <span className="text-gray-700 font-medium">{item.variety}</span>
                    <span className="text-gray-500 mx-1">/</span>
                    <span className="text-gray-600">{item.process}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-gray-700 font-semibold">{toFixed2(item.remainingWeightKg)} kg</span>
                </td>
                <td className="px-4 py-4">
                  <Button
                    variant="success"
                    size="sm"
                    icon={<PlusCircle className="h-4 w-4" />}
                    onClick={() => onLogRoast(item)}
                  >
                    Log Roast
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InventoryTable;
