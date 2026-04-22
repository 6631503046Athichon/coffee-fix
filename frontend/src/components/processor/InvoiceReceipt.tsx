import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import QRCode from 'qrcode';
import { GreenBeanLot } from '../../types';
import { FileText, Printer, X } from 'lucide-react';
import { getPublicTraceUrl } from '../../services/greenBeanLotService';
import { formatGreenBeanId } from '../../utils/formatDisplayId';

interface InvoiceReceiptProps {
  visible: boolean;
  onClose: () => void;
  lot: GreenBeanLot;
  entry: NonNullable<GreenBeanLot['withdrawalHistory']>[number];
}

const InvoiceReceipt: React.FC<InvoiceReceiptProps> = ({ visible, onClose, lot, entry }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const traceabilityUrl = useMemo(() => {
    if (lot.publicTraceId) {
      return getPublicTraceUrl(lot.publicTraceId);
    }

    try {
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      return `${base}/traceability/${lot.id}`;
    } catch {
      return `/traceability/${lot.id}`;
    }
  }, [lot.id, lot.publicTraceId]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const url = await QRCode.toDataURL(traceabilityUrl, { margin: 1, width: 256 });
        if (!canceled) setQrDataUrl(url);
      } catch {
        // ignore QR errors
      }
    })();
    return () => { canceled = true; };
  }, [traceabilityUrl]);

  if (!visible) return null;

  const currency = entry.currency || 'THB';
  const pricePerKg = entry.salePrice || 0;
  const qtyKg = entry.amountKg || 0;
  const total = entry.totalAmount != null ? entry.totalAmount : (qtyKg * pricePerKg);
  const invoiceNumber = entry.invoiceNumber || 'INV-DRAFT';
  const issueDate = entry.date || new Date().toISOString().substring(0, 10);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-hidden border border-gray-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-600 rounded-xl">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-gray-900">Invoice</h2>
              <p className="text-sm text-gray-600">{invoiceNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100 border border-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 overflow-auto">
          {/* Invoice meta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Invoice Number</p>
              <p className="text-lg font-bold text-gray-900">{invoiceNumber}</p>
              <p className="text-sm text-gray-500 mt-4">Issue Date</p>
              <p className="text-lg font-semibold text-gray-900">{issueDate}</p>
            </div>
            <div className="space-y-1 md:text-right">
              <p className="text-sm text-gray-500">Bill To</p>
              <p className="text-lg font-bold text-gray-900">{entry.customerName || 'Customer'}</p>
              {entry.deliveryAddress && (
                <p className="text-sm text-gray-700 whitespace-pre-line">{entry.deliveryAddress}</p>
              )}
            </div>
          </div>

          {/* Line item */}
          <div className="overflow-hidden rounded-xl border border-gray-200 mb-8">
            <div className="overflow-x-auto">
              <table className="min-w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left text-xs font-bold uppercase tracking-wider text-gray-600 px-4 py-3">Description</th>
                  <th className="text-right text-xs font-bold uppercase tracking-wider text-gray-600 px-4 py-3">Qty (kg)</th>
                  <th className="text-right text-xs font-bold uppercase tracking-wider text-gray-600 px-4 py-3">Price/kg</th>
                  <th className="text-right text-xs font-bold uppercase tracking-wider text-gray-600 px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-gray-900">Green Bean Lot {formatGreenBeanId(lot)}</div>
                    <div className="text-sm text-gray-600">Grade: {lot.grade}{lot.sourceType === 'External' && lot.externalSource ? ` - ${lot.externalSource.processType}` : ''}</div>
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-gray-900">{qtyKg.toFixed(2)}</td>
                  <td className="px-4 py-4 text-right text-gray-900">{pricePerKg.toFixed(2)} {currency}</td>
                  <td className="px-4 py-4 text-right font-bold text-gray-900">{total.toFixed(2)} {currency}</td>
                </tr>
              </tbody>
              </table>
            </div>
          </div>

          {/* QR and notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="p-4 rounded-xl border border-gray-200">
              <p className="text-sm font-semibold text-gray-700 mb-2">Scan for Traceability</p>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Traceability QR" className="w-40 h-40" />
              ) : (
                <div className="w-40 h-40 bg-gray-100 animate-pulse rounded" />
              )}
              <p className="text-xs text-gray-500 mt-2 break-all">{traceabilityUrl}</p>
            </div>
            <div className="p-4 rounded-xl border border-gray-200">
              <p className="text-sm font-semibold text-gray-700 mb-2">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{entry.notes || entry.purpose || '-'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default InvoiceReceipt;
