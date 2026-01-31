import React from 'react';
import { RefreshCw, X } from 'lucide-react';

interface RestoredDataBannerProps {
  /** Whether data was restored */
  show: boolean;
  /** Called when user clicks "Clear" */
  onClear: () => void;
  /** Custom message (optional) */
  message?: string;
}

/**
 * Banner to show when form data was restored from localStorage
 */
const RestoredDataBanner: React.FC<RestoredDataBannerProps> = ({
  show,
  onClear,
  message = 'ข้อมูลที่กรอกก่อนหน้านี้ถูกกู้คืนแล้ว',
}) => {
  if (!show) return null;

  return (
    <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-blue-600" />
        <span className="text-sm text-blue-800">{message}</span>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors px-2 py-1 rounded-lg hover:bg-blue-100"
      >
        <X className="h-3 w-3" />
        <span>ล้างข้อมูล</span>
      </button>
    </div>
  );
};

export default RestoredDataBanner;
