import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Download, QrCode, CheckCircle, AlertCircle, Loader, Package } from 'lucide-react';
import { GreenBeanLot } from '../../types';
import { generatePublicTraceId, getPublicTraceUrl, generateQRDataUrl } from '../../services/greenBeanLotService';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { formatGreenBeanId } from '../../utils/formatDisplayId';

interface BulkQRGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLots: GreenBeanLot[];
  onLotsUpdated?: () => void;
}

interface LotQRStatus {
  lotId: string;
  grade: string;
  publicTraceId?: string;
  status: 'pending' | 'generating' | 'success' | 'error';
  error?: string;
  qrDataUrl?: string;
}

export const BulkQRGeneratorModal: React.FC<BulkQRGeneratorModalProps> = ({
  isOpen,
  onClose,
  selectedLots,
  onLotsUpdated
}) => {
  const [lotStatuses, setLotStatuses] = useState<Map<string, LotQRStatus>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const qrSize = 300;

  const generateAllQRCodes = async () => {
    setIsProcessing(true);

    // Initialize statuses
    const initialStatuses = new Map<string, LotQRStatus>();
    selectedLots.forEach(lot => {
      initialStatuses.set(lot.id, {
        lotId: lot.id,
        grade: lot.grade,
        publicTraceId: lot.publicTraceId,
        status: 'pending'
      });
    });
    setLotStatuses(initialStatuses);

    // Process each lot sequentially to avoid overwhelming the server
    for (const lot of selectedLots) {
      setLotStatuses(prev => {
        const updated = new Map(prev);
        const current = updated.get(lot.id)!;
        updated.set(lot.id, { ...current, status: 'generating' });
        return updated;
      });

      try {
        let publicTraceId = lot.publicTraceId;

        // Generate public ID if not exists
        if (!publicTraceId) {
          const result = await generatePublicTraceId(lot.id);
          publicTraceId = result.publicTraceId;
        }

        // Generate QR code
        const publicUrl = getPublicTraceUrl(publicTraceId);
        const qrDataUrl = await generateQRDataUrl(publicUrl, { size: qrSize, margin: 1 });

        setLotStatuses(prev => {
          const updated = new Map(prev);
          updated.set(lot.id, {
            lotId: lot.id,
            grade: lot.grade,
            publicTraceId,
            status: 'success',
            qrDataUrl
          });
          return updated;
        });
      } catch (error: any) {
        setLotStatuses(prev => {
          const updated = new Map(prev);
          updated.set(lot.id, {
            lotId: lot.id,
            grade: lot.grade,
            status: 'error',
            error: error.message || 'Failed to generate QR'
          });
          return updated;
        });
      }
    }

    setIsProcessing(false);
    if (onLotsUpdated) onLotsUpdated();
  };

  const downloadAsZip = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();

      lotStatuses.forEach((status) => {
        if (status.status === 'success' && status.qrDataUrl) {
          // Convert data URL to blob
          const base64Data = status.qrDataUrl.split(',')[1];
          const fileName = `qr-${status.grade}-${status.publicTraceId?.substring(0, 8)}.png`;
          zip.file(fileName, base64Data, { base64: true });
        }
      });

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `qr-codes-${new Date().toISOString().split('T')[0]}.zip`);
    } catch (error) {
      console.error('Failed to create ZIP:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const successCount = Array.from(lotStatuses.values()).filter(s => s.status === 'success').length;
  const errorCount = Array.from(lotStatuses.values()).filter(s => s.status === 'error').length;
  const pendingCount = Array.from(lotStatuses.values()).filter(s => s.status === 'pending' || s.status === 'generating').length;

  const handleClose = () => {
    if (!isProcessing) {
      setLotStatuses(new Map());
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Bulk QR Code Generator" maxWidth="2xl">
      <div className="space-y-6">
        {/* Summary */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Selected Lots</p>
                <p className="text-2xl font-bold text-gray-900">{selectedLots.length}</p>
              </div>
            </div>
            {lotStatuses.size > 0 && (
              <div className="flex gap-6">
                {successCount > 0 && (
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-lg font-bold">{successCount}</span>
                    </div>
                    <p className="text-xs text-gray-500">Success</p>
                  </div>
                )}
                {errorCount > 0 && (
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-lg font-bold">{errorCount}</span>
                    </div>
                    <p className="text-xs text-gray-500">Failed</p>
                  </div>
                )}
                {pendingCount > 0 && isProcessing && (
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-blue-600">
                      <Loader className="h-4 w-4 animate-spin" />
                      <span className="text-lg font-bold">{pendingCount}</span>
                    </div>
                    <p className="text-xs text-gray-500">Processing</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Lots List with Status */}
        <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-xl">
          <table className="min-w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Lot ID</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Grade</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Public ID</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {selectedLots.map(lot => {
                const status = lotStatuses.get(lot.id);
                return (
                  <tr key={lot.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 font-mono">
                      {formatGreenBeanId(lot)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{lot.grade}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {status?.publicTraceId
                        ? `${status.publicTraceId.substring(0, 8)}...`
                        : lot.publicTraceId
                          ? `${lot.publicTraceId.substring(0, 8)}...`
                          : <span className="text-gray-400">Not generated</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {!status && (
                        <span className="text-gray-400 text-sm">Waiting...</span>
                      )}
                      {status?.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 text-gray-500 text-sm">
                          <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                          Pending
                        </span>
                      )}
                      {status?.status === 'generating' && (
                        <span className="inline-flex items-center gap-1 text-blue-600 text-sm">
                          <Loader className="h-3 w-3 animate-spin" />
                          Generating...
                        </span>
                      )}
                      {status?.status === 'success' && (
                        <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle className="h-3 w-3" />
                          Done
                        </span>
                      )}
                      {status?.status === 'error' && (
                        <span className="inline-flex items-center gap-1 text-red-600 text-sm" title={status.error}>
                          <AlertCircle className="h-3 w-3" />
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Progress Bar */}
        {isProcessing && lotStatuses.size > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Progress</span>
              <span>{successCount + errorCount} / {selectedLots.length}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((successCount + errorCount) / selectedLots.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
          <Button variant="secondary" onClick={handleClose} disabled={isProcessing}>
            Close
          </Button>
          <div className="flex gap-3">
            {successCount > 0 && !isProcessing && (
              <Button
                variant="secondary"
                onClick={downloadAsZip}
                disabled={isDownloading}
                loading={isDownloading}
              >
                <Download className="h-4 w-4 mr-2" />
                Download ZIP ({successCount} files)
              </Button>
            )}
            <Button
              variant="primary"
              onClick={generateAllQRCodes}
              disabled={isProcessing || selectedLots.length === 0}
              loading={isProcessing}
            >
              <QrCode className="h-4 w-4 mr-2" />
              {lotStatuses.size > 0 ? 'Regenerate All' : 'Generate All QR Codes'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default BulkQRGeneratorModal;
