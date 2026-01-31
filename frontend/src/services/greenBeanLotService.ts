import { GreenBeanLot } from '../types';
import { api } from './api';
import { handleApiErrorWithFallback } from '../utils/errorHandler';

export interface CreateGreenBeanLotInput {
  sourceType: 'Internal' | 'External';
  parchmentLotId?: string;
  grade: string;
  initialWeightKg: number;
  currentWeightKg?: number;
  availabilityStatus?: string;
  pricePerKg?: number;
  currency?: string;
  externalSource?: {
    originName?: string;
    variety?: string;
    processType?: string;
    purchaseDate?: string;
    pricePerKg?: number;
    currency?: string;
    supplierNotes?: string;
  };
}

/**
 * Create a new green bean lot
 */
export const createGreenBeanLot = async (input: CreateGreenBeanLotInput): Promise<GreenBeanLot> => {
  const response = await api.post<{ greenBeanLot: any }>('/green-bean-lots', input);
  return transformGreenBeanLotFromBackend(response.greenBeanLot);
};

/**
 * Delete a green bean lot
 */
export const deleteGreenBeanLot = async (id: string): Promise<void> => {
  await api.delete(`/green-bean-lots/${id}`);
};

/**
 * Fetch all green bean lots, optionally filtered by sourceType, availabilityStatus, or parchmentLotId
 */
export const getAllGreenBeanLots = async (
  sourceType?: string,
  availabilityStatus?: string,
  parchmentLotId?: string
): Promise<GreenBeanLot[]> => {
  try {
    const params: Record<string, string> = {};
    if (sourceType) params.sourceType = sourceType;
    if (availabilityStatus) params.availabilityStatus = availabilityStatus;
    if (parchmentLotId) params.parchmentLotId = parchmentLotId;

    const response = await api.get<{ greenBeanLots: any[] }>(
      '/green-bean-lots',
      Object.keys(params).length > 0 ? params : undefined
    );
    return response.greenBeanLots.map(transformGreenBeanLotFromBackend);
  } catch (error) {
    return handleApiErrorWithFallback<GreenBeanLot[]>(error, {
      operation: 'fetch green bean lots',
      fallbackValue: [],
    });
  }
};

/**
 * Transform green bean lot data from backend format to frontend format
 */
function transformGreenBeanLotFromBackend(backendLot: any): GreenBeanLot {
  return {
    id: backendLot.id,
    sourceType: backendLot.sourceType || 'Internal',
    parchmentLotId: backendLot.parchmentLotId,
    externalSource: backendLot.externalSource,
    grade: backendLot.grade,
    initialWeightKg: backendLot.initialWeightKg,
    currentWeightKg: backendLot.currentWeightKg,
    availabilityStatus: backendLot.availabilityStatus,
    cuppingScores: backendLot.cuppingScores || [],
    withdrawalHistory: backendLot.withdrawalHistory || [],
    publicTraceId: backendLot.publicTraceId,
    qrGeneratedAt: backendLot.qrGeneratedAt,
  };
}

// ============================================
// QR Code & Traceability Functions
// ============================================

export interface GeneratePublicIdResponse {
  publicTraceId: string;
  publicUrl: string;
  greenBeanLot: {
    id: string;
    publicTraceId: string;
    qrGeneratedAt: string;
  };
}

/**
 * Generate a public trace ID for a green bean lot
 */
export const generatePublicTraceId = async (lotId: string): Promise<GeneratePublicIdResponse> => {
  const response = await api.post<GeneratePublicIdResponse>(
    `/green-bean-lots/${lotId}/generate-public-id`
  );
  return response;
};

/**
 * Get QR code URL for a green bean lot (backend generation)
 */
export const getQRCodeUrl = (
  lotId: string,
  format: 'png' | 'svg' = 'png',
  size: number = 200
): string => {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  return `${baseUrl}/green-bean-lots/${lotId}/qr?format=${format}&size=${size}`;
};

/**
 * Build the public trace URL for a lot
 */
export const getPublicTraceUrl = (publicTraceId: string): string => {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return `${baseUrl}/trace/${publicTraceId}`;
};

export interface PublicTraceData {
  lot: {
    id: string;
    grade: string;
    sourceType: string;
    currentWeightKg: number;
    availabilityStatus: string;
    externalSource?: any;
    cuppingScores: any[];
    parchmentLot?: any;
    roastBatches: any[];
  };
  traceId: string;
}

/**
 * Fetch public traceability data (no auth required)
 */
export const getPublicTraceData = async (publicId: string): Promise<PublicTraceData> => {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  const response = await fetch(`${baseUrl}/trace/${publicId}`);

  if (!response.ok) {
    throw new Error('Lot not found');
  }

  return response.json();
};

/**
 * Generate QR code as data URL using qrcode library (frontend generation)
 */
export const generateQRDataUrl = async (
  url: string,
  options: { size?: number; margin?: number } = {}
): Promise<string> => {
  const QRCode = await import('qrcode');
  return QRCode.toDataURL(url, {
    width: options.size || 200,
    margin: options.margin || 1
  });
};

/**
 * Generate QR code as SVG string
 */
export const generateQRSvg = async (
  url: string,
  options: { size?: number; margin?: number } = {}
): Promise<string> => {
  const QRCode = await import('qrcode');
  return QRCode.toString(url, {
    type: 'svg',
    width: options.size || 200,
    margin: options.margin || 1
  });
};
