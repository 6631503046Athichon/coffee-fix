import React from 'react';
import { BookText, Flame } from 'lucide-react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { RoastBatch } from '../../types';
import { toFixed2 } from '../../utils/formatters';

const RoastLogPanel: React.FC<{
  roasts: RoastBatch[];
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}> = ({ roasts, page, totalPages, onPrev, onNext }) => {
  const pageSize = 5;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, roasts.length);

  if (roasts.length === 0) {
    return (
      <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-100">
        <div className="p-5 border-b border-gray-200">
          <h3 className="text-xl font-bold flex items-center text-gray-900">
            <div className="p-2 bg-indigo-100 rounded-lg mr-3">
              <BookText className="h-5 w-5 text-indigo-600" />
            </div>
            My Roast Log
          </h3>
        </div>
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-200 mb-4">
            <BookText className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No roasts logged yet</p>
          <p className="text-sm text-gray-400 mt-1">Start roasting to see your log here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-100">
      <div className="p-5 border-b border-gray-200">
        <h3 className="text-xl font-bold flex items-center text-gray-900">
          <div className="p-2 bg-indigo-100 rounded-lg mr-3">
            <BookText className="h-5 w-5 text-indigo-600" />
          </div>
          My Roast Log
        </h3>
      </div>
      <div className="overflow-y-auto max-h-[70vh] bg-gray-50 p-4">
        <div className="space-y-3">
          {roasts.map((roast) => (
            <div key={roast.id} className="bg-white rounded-xl p-4 border border-gray-200 hover:border-orange-300 hover:shadow-lg transition-all duration-200 group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {roast.roastDate}
                    </span>
                    <span className="text-sm font-bold text-gray-900">Lot {roast.greenBeanLotId}</span>
                    {roast.roastLevel && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
                        {roast.roastLevel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="default" size="md" className="font-semibold">
                      <span className="font-bold text-gray-900">{toFixed2(roast.batchSizeKg)}</span>&nbsp;kg
                    </Badge>
                    <Badge variant="orange" size="md" className="font-semibold border border-orange-200">
                      {typeof roast.yieldPercentage === 'number'
                        ? `${roast.yieldPercentage.toFixed(1)}% yield`
                        : `${roast.yieldPercentage}% yield`}
                    </Badge>
                  </div>
                </div>
                <div className="p-2 bg-orange-50 rounded-lg group-hover:bg-orange-100 transition-colors">
                  <Flame className="h-5 w-5 text-orange-600" />
                </div>
              </div>

              {roast.roastProfileNotes && (
                <div className="mb-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-sm text-gray-700 italic leading-relaxed">"{roast.roastProfileNotes}"</p>
                </div>
              )}

              {roast.flavorNotes && (
                <div className="flex flex-wrap gap-1.5">
                  {roast.flavorNotes
                    .split(',')
                    .map((note) => note.trim())
                    .filter(Boolean)
                    .map((note, index) => (
                      <span key={index} className="inline-flex items-center px-2.5 py-1 bg-yellow-50 text-yellow-800 text-xs font-semibold rounded-md border border-yellow-200">
                        {note}
                      </span>
                    ))}
                </div>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-gray-500">{`Showing ${start}–${end} of ${roasts.length}`}</div>
            <div className="space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onPrev}
                disabled={page === 1}
                className="text-xs"
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onNext}
                disabled={page === totalPages}
                className="text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoastLogPanel;
