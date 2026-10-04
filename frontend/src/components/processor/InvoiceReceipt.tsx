import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { GreenBeanLot } from '../../types';
import { FileText, Link2, Printer, X } from 'lucide-react';
import { generatePublicTraceId, generateQRDataUrl, getPublicTraceUrl } from '../../services/lots/greenBeanLotService';
import { formatGreenBeanId } from '../../utils/formatDisplayId';
import { toDateOnly, todayDateOnly } from '../../utils/dateOnly';

interface InvoiceReceiptProps {
  visible: boolean;
  onClose: () => void;
  lot: GreenBeanLot;
  entry: NonNullable<GreenBeanLot['withdrawalHistory']>[number];
  /**
   * The viewer may create the lot's public trace link: the lot's creator or
   * an Admin, as POST /green-bean-lots/:id/generate-public-id requires.
   */
  canGeneratePublicLink?: boolean;
  /** Called with the new public trace id once the viewer has created it. */
  onPublicTraceIdGenerated?: (publicTraceId: string) => void;
}

const InvoiceReceipt: React.FC<InvoiceReceiptProps> = ({
  visible,
  onClose,
  lot,
  entry,
  canGeneratePublicLink = false,
  onPublicTraceIdGenerated,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  // A public id created from this invoice, kept for the lot it was made for.
  const [generated, setGenerated] = useState<{ lotId: string; publicTraceId: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const generatingRef = useRef(false);

  const publicTraceId =
    lot.publicTraceId || (generated?.lotId === lot.id ? generated.publicTraceId : '');

  // The customer scans this, so it must be the PUBLIC trace page. The
  // internal #/traceability/<lotId> page is behind a login. With no public
  // id yet there is no QR: publishing the lot is the owner's explicit choice.
  const traceabilityUrl = useMemo(
    () => (publicTraceId ? getPublicTraceUrl(publicTraceId) : ''),
    [publicTraceId]
  );

  useEffect(() => {
    setQrDataUrl('');
    if (!traceabilityUrl) return;
    let canceled = false;
    (async () => {
      try {
        const url = await generateQRDataUrl(traceabilityUrl, { margin: 1, size: 256 });
        if (!canceled) setQrDataUrl(url);
      } catch {
        // ignore QR errors
      }
    })();
    return () => { canceled = true; };
  }, [traceabilityUrl]);

  const handleCreatePublicLink = async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      // No regenerate flag: if this copy of the lot is stale and the lot is
      // already public, the server hands back the existing id unchanged.
      const result = await generatePublicTraceId(lot.id);
      setGenerated({ lotId: lot.id, publicTraceId: result.publicTraceId });
      onPublicTraceIdGenerated?.(result.publicTraceId);
    } catch (err: unknown) {
      setGenerateError(err instanceof Error && err.message ? err.message : 'Could not create the public trace link.');
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  };

  if (!visible) return null;

  const currency = entry.currency || 'THB';
  const pricePerKg = entry.salePrice || 0;
  const qtyKg = entry.amountKg || 0;
  const total = entry.totalAmount != null ? entry.totalAmount : (qtyKg * pricePerKg);
  const invoiceNumber = entry.invoiceNumber || 'INV-DRAFT';
  const issueDate = toDateOnly(entry.date) || todayDateOnly();

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-hidden border border-gray-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 bg-emerald-600 rounded-xl flex-shrink-0">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-extrabold text-gray-900">Invoice</h2>
              <p className="text-sm text-gray-600 truncate" title={invoiceNumber}>{invoiceNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              aria-label="Print"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Print</span>
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
            {traceabilityUrl ? (
              <div className="p-4 rounded-xl border border-gray-200" data-testid="invoice-trace-qr">
                <p className="text-sm font-semibold text-gray-700 mb-2">Scan for Traceability</p>
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Traceability QR" className="w-40 h-40" />
                ) : (
                  <div className="w-40 h-40 bg-gray-100 animate-pulse rounded" />
                )}
                <p className="text-xs text-gray-500 mt-2 break-all">{traceabilityUrl}</p>
              </div>
            ) : canGeneratePublicLink ? (
              // On screen only: nothing about the link is printed until it exists.
              <div className="p-4 rounded-xl border border-dashed border-gray-300 print:hidden" data-testid="invoice-trace-create">
                <p className="text-sm font-semibold text-gray-700 mb-1">Scan for Traceability</p>
                <p className="text-xs text-gray-500 mb-3">
                  This lot has no public trace page yet. Creating the link makes the lot's trace page viewable by anyone who has it.
                </p>
                <button
                  type="button"
                  onClick={handleCreatePublicLink}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {isGenerating ? 'Creating link...' : 'Create public trace link'}
                </button>
                {generateError && (
                  <p className="text-xs text-red-600 mt-2" role="alert">{generateError}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500 print:hidden" data-testid="invoice-trace-unavailable">
                No public trace link for this lot yet, so no QR code is shown. The lot's owner or an Admin can create one.
              </p>
            )}
            <div className="p-4 rounded-xl border border-gray-200">
              <p className="text-sm font-semibold text-gray-700 mb-2">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{entry.notes || entry.purpose || '—'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default InvoiceReceipt;
