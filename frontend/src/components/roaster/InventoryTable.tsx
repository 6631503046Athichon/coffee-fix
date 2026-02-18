import React from 'react';
import { Flame, PlusCircle, Archive, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../common/Button';
import { RoasterInventoryItem } from '../../types';
import { toFixed2 } from '../../utils/formatters';

export type InventoryDisplayItem = RoasterInventoryItem & {
  variety: string;
  process: string;
  lotId?: string;
  score?: string;
  grade?: string;
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
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Inventory ID</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Lot ID</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Variety</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Score</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Grade</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wide">Remaining</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-200 uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
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
                    <span className="text-sm font-medium text-gray-900">
                      {item.inventoryId || 'N/A'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm font-medium text-gray-900">
                      {item.lotId || `#${item.greenBeanLotId.substring(0, 6).toUpperCase()}`}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">{item.variety}</span>
                      <span className="text-gray-400 mx-1">/</span>
                      <span className="text-gray-600">{item.process}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-sm font-semibold ${item.score && item.score !== '—' ? 'text-indigo-600' : 'text-gray-400'}`}>
                      {item.score || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-xs font-semibold text-amber-700 border border-amber-200">
                      {item.grade || '—'}
                    </span>
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
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
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
        </div>
      )}
    </div>
  );
};

export default InventoryTable;
