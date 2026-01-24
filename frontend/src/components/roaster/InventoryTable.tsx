import React from 'react';
import { Flame, PlusCircle, Archive, ChevronLeft, ChevronRight } from 'lucide-react';
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
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

const InventoryTable: React.FC<InventoryTableProps> = ({ items, onLogRoast, currentPage = 1, totalPages = 1, onPageChange }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
            <Flame className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">My Inventory</h3>
            <p className="text-sm text-gray-500">Claimed green beans ready to roast</p>
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
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Remaining</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-200 uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <Archive className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 font-medium">No inventory yet</p>
                    <p className="text-xs text-gray-400 mt-1">Claim stock from available lots to build your inventory</p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr
                  key={item.id}
                  className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                >
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-100 text-sm font-mono font-medium text-gray-800" title={item.greenBeanLotId}>
                      {item.greenBeanLotId.length > 10 ? `${item.greenBeanLotId.substring(0, 10)}...` : item.greenBeanLotId}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">{item.variety}</span>
                      <span className="text-gray-400 mx-2">/</span>
                      <span className="text-gray-600">{item.process}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 max-w-[100px] h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 rounded-full"
                          style={{ width: `${Math.min(100, (item.remainingWeightKg / item.claimedWeightKg) * 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{toFixed2(item.remainingWeightKg)}</span>
                      <span className="text-sm text-gray-500">kg</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <div className="flex justify-center items-center px-4 py-3 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1.5 text-gray-600 hover:bg-gray-200 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-600">
              <span className="font-medium">{currentPage}</span> / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1.5 text-gray-600 hover:bg-gray-200 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryTable;
