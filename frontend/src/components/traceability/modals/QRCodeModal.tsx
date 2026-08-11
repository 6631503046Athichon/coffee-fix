import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../../common/Modal';
import { Button } from '../../common/Button';
import { Download, Printer, Copy, Check, QrCode, RefreshCw, Image } from 'lucide-react';
import { generatePublicTraceId, getPublicTraceUrl, generateQRDataUrl, generateQRSvg } from '../../../services/lots/greenBeanLotService';

const escapeHtml = (str: string) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  lotId: string;
  publicTraceId?: string | null;
  onPublicIdGenerated?: (publicTraceId: string) => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  onClose,
  lotId,
  publicTraceId,
  onPublicIdGenerated
}) => {
  const [size, setSize] = useState(200);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [svgContent, setSvgContent] = useState<string>('');
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPublicId, setCurrentPublicId] = useState(publicTraceId);
  const [error, setError] = useState<string | null>(null);

  const publicUrl = currentPublicId ? getPublicTraceUrl(currentPublicId) : '';

  // Generate QR code when publicId or size changes.
  // Debounce by 150ms so dragging the size slider doesn't spam the
  // (potentially synchronous-CPU-heavy) QR encoder on every pixel step.
  useEffect(() => {
    if (!currentPublicId) {
      setQrDataUrl('');
      setSvgContent('');
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setError(null);
      try {
        const dataUrl = await generateQRDataUrl(publicUrl, { size, margin: 1 });
        if (cancelled) return;
        setQrDataUrl(dataUrl);

        const svg = await generateQRSvg(publicUrl, { size, margin: 1 });
        if (cancelled) return;
        setSvgContent(svg);
      } catch (err: unknown) {
        if (cancelled) return;
        console.error('Error generating QR code:', err);
        setError('Failed to generate QR code');
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [currentPublicId, size, publicUrl]);

  // Sync with prop changes
  useEffect(() => {
    setCurrentPublicId(publicTraceId);
  }, [publicTraceId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setIsLinkCopied(false);
    }
  }, [isOpen]);

  // Auto-generate public ID when modal opens without one.
  // Use a ref (not the `isGenerating` state) to gate the call — the
  // state can be stale across two renders, leading to double-fire
  // when this effect re-runs before the setState commits.
  const inflightRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      inflightRef.current = false;
      return;
    }
    if (currentPublicId || inflightRef.current) return;
    inflightRef.current = true;
    handleGeneratePublicId().finally(() => {
      inflightRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleGeneratePublicId is a stable closure over modal props
  }, [isOpen, currentPublicId]);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup auto-close timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleGeneratePublicId = async (autoClose = false) => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generatePublicTraceId(lotId);
      setCurrentPublicId(result.publicTraceId);
      if (onPublicIdGenerated) {
        onPublicIdGenerated(result.publicTraceId);
      }
      if (autoClose) {
        closeTimerRef.current = setTimeout(() => onClose(), 1500);
      }
    } catch (err: unknown) {
      console.error('Failed to generate public ID:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate public ID');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPNG = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `qr-${currentPublicId}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  const handleDownloadSVG = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.download = `qr-${currentPublicId}.svg`;
      link.href = url;
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
    } catch (err: unknown) {
      console.error('Failed to copy:', err);
    }
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;
    const printWindow = window.open('', '', 'height=600,width=600');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head><title>QR Code - ${escapeHtml(lotId)}</title></head>
          <body style="text-align: center; margin-top: 50px; font-family: system-ui, sans-serif;">
            <img src="${escapeHtml(qrDataUrl)}" alt="QR Code" style="width: ${size}px; height: ${size}px;" />
            <p style="margin-top: 20px; font-size: 12px; color: #666; word-break: break-all; max-width: 400px; margin-left: auto; margin-right: auto;">${escapeHtml(publicUrl)}</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="QR Code" maxWidth="md">
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {!currentPublicId ? (
          <div className="text-center py-8">
            {isGenerating ? (
              <>
                <div className="h-16 w-16 mx-auto mb-4 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-gray-600">Generating QR Code...</p>
              </>
            ) : (
              <>
                <QrCode className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-600 mb-4">
                  Failed to generate. Try again.
                </p>
                <Button
                  variant="primary"
                  onClick={() => handleGeneratePublicId()}
                  disabled={isGenerating}
                  loading={isGenerating}
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  Generate Public ID
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* QR Code Display */}
            <div className="flex justify-center">
              <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Code"
                    style={{ width: size, height: size }}
                    className="rounded"
                  />
                ) : (
                  <div
                    className="bg-gray-100 animate-pulse rounded flex items-center justify-center"
                    style={{ width: size, height: size }}
                  >
                    <QrCode className="h-12 w-12 text-gray-300" />
                  </div>
                )}
              </div>
            </div>

            {/* Size Slider */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                QR Size: {size}px
              </label>
              <input
                type="range"
                min="100"
                max="400"
                step="50"
                value={size}
                onChange={(e) => setSize(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>100px</span>
                <span>200px</span>
                <span>300px</span>
                <span>400px</span>
              </div>
            </div>

            {/* URL Display */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Public URL</p>
              <p className="text-sm text-gray-900 break-all font-mono">{publicUrl}</p>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={handleDownloadPNG}>
                <Download className="h-4 w-4 mr-2" />
                Download PNG
              </Button>
              <Button variant="secondary" onClick={handleDownloadSVG}>
                <Image className="h-4 w-4 mr-2" />
                Download SVG
              </Button>
              <Button variant="secondary" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button
                variant={isLinkCopied ? 'primary' : 'secondary'}
                onClick={handleCopyLink}
              >
                {isLinkCopied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy URL
                  </>
                )}
              </Button>
            </div>

            {/* Regenerate Option */}
            <div className="border-t border-gray-200 pt-4">
              <Button
                variant="outline"
                onClick={() => handleGeneratePublicId(true)}
                disabled={isGenerating}
                loading={isGenerating}
                fullWidth
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate Public ID
              </Button>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Warning: Regenerating will invalidate the previous QR code
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default QRCodeModal;
