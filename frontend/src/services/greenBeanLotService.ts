import { GreenBeanLot, RoasterInventoryItem } from "../types";
import { api } from "./api";
import { handleApiErrorWithFallback } from "../utils/errorHandler";

export interface CreateGreenBeanLotInput {
  sourceType: "Internal" | "External";
  parchmentLotId?: string;
  grade: string;
  initialWeightKg: number;
  currentWeightKg?: number;
  availabilityStatus?: string;
  pricePerKg?: number;
  currency?: string;
  processorScore?: number;
  externalSource?: {
    originName?: string;
    producerName?: string;
    variety?: string;
    processType?: string;
    purchaseDate?: string;
    pricePerKg?: number;
    currency?: string;
    supplierNotes?: string;
    tasteNote?: string;
  };
}

/**
 * Create a new green bean lot
 */
export const createGreenBeanLot = async (
  input: CreateGreenBeanLotInput,
): Promise<GreenBeanLot> => {
  const response = await api.post<{ greenBeanLot: any }>(
    "/green-bean-lots",
    input,
  );
  return transformGreenBeanLotFromBackend(response.greenBeanLot);
};

/**
 * Delete a green bean lot
 */
export const deleteGreenBeanLot = async (id: string): Promise<void> => {
  await api.delete(`/green-bean-lots/${id}`);
};

/**
 * Update green bean lot processor score
 */
export type CuppingDetailUpdate = Partial<Pick<
  GreenBeanLot,
  | "cuppingFragrance"
  | "cuppingFlavor"
  | "cuppingAftertaste"
  | "cuppingAcidity"
  | "cuppingBody"
  | "cuppingBalance"
  | "cuppingOverall"
  | "cuppingUniformity"
  | "cuppingCleanCup"
  | "cuppingSweetness"
>>;

export const updateGreenBeanLotScore = async (
  id: string,
  processorScore: number,
  cuppingDetails?: CuppingDetailUpdate,
): Promise<GreenBeanLot> => {
  const response = await api.patch<{ greenBeanLot: any }>(
    `/green-bean-lots/${id}`,
    { processorScore, ...(cuppingDetails || {}) },
  );
  return transformGreenBeanLotFromBackend(response.greenBeanLot);
};

/**
 * Update green bean lot availability status
 */
export const updateGreenBeanLotAvailability = async (
  id: string,
  availabilityStatus: "Available" | "Withdrawn",
): Promise<GreenBeanLot> => {
  const response = await api.put<{ greenBeanLot: any }>(
    `/green-bean-lots/${id}`,
    { availabilityStatus },
  );
  return transformGreenBeanLotFromBackend(response.greenBeanLot);
};

/**
 * Fetch all green bean lots, optionally filtered by sourceType, availabilityStatus, or parchmentLotId
 */
export const getAllGreenBeanLots = async (
  sourceType?: string,
  availabilityStatus?: string,
  parchmentLotId?: string,
): Promise<GreenBeanLot[]> => {
  try {
    const params: Record<string, string> = {};
    if (sourceType) params.sourceType = sourceType;
    if (availabilityStatus) params.availabilityStatus = availabilityStatus;
    if (parchmentLotId) params.parchmentLotId = parchmentLotId;

    const response = await api.get<{ greenBeanLots: any[] }>(
      "/green-bean-lots",
      Object.keys(params).length > 0 ? params : undefined,
    );
    return response.greenBeanLots.map(transformGreenBeanLotFromBackend);
  } catch (error) {
    return handleApiErrorWithFallback<GreenBeanLot[]>(error, {
      operation: "fetch green bean lots",
      fallbackValue: [],
    });
  }
};

/**
 * Transform green bean lot data from backend format to frontend format
 */
export function transformGreenBeanLotFromBackend(backendLot: any): GreenBeanLot {
  const withdrawalHistory = (backendLot.withdrawalHistory || []).map((w: any) => ({
    ...w,
    withdrawalType: WITHDRAWAL_TYPE_FROM_API[w.withdrawalType] || w.withdrawalType,
    date: w.date ? new Date(w.date).toISOString().substring(0, 10) : w.date,
  }));

  return {
    id: backendLot.id,
    displayId: backendLot.displayId || undefined,
    sourceType: backendLot.sourceType || "Internal",
    parchmentLotId: backendLot.parchmentLotId,
    externalSource: backendLot.externalSource,
    grade: backendLot.grade,
    initialWeightKg: backendLot.initialWeightKg,
    currentWeightKg: backendLot.currentWeightKg,
    availabilityStatus: backendLot.availabilityStatus,
    cuppingScores: backendLot.cuppingScores || [],
    withdrawalHistory,
    publicTraceId: backendLot.publicTraceId,
    qrGeneratedAt: backendLot.qrGeneratedAt,
    processorScore: backendLot.processorScore,
    cuppingFragrance: backendLot.cuppingFragrance,
    cuppingFlavor: backendLot.cuppingFlavor,
    cuppingAftertaste: backendLot.cuppingAftertaste,
    cuppingAcidity: backendLot.cuppingAcidity,
    cuppingBody: backendLot.cuppingBody,
    cuppingBalance: backendLot.cuppingBalance,
    cuppingOverall: backendLot.cuppingOverall,
    cuppingUniformity: backendLot.cuppingUniformity,
    cuppingCleanCup: backendLot.cuppingCleanCup,
    cuppingSweetness: backendLot.cuppingSweetness,
    pricePerKg: backendLot.pricePerKg,
    currency: backendLot.currency,
    createdAt: backendLot.createdAt
      ? new Date(backendLot.createdAt).toISOString()
      : undefined,
  };
}

export interface CreateWithdrawalInput {
  amountKg: number;
  withdrawalType: string;
  purpose: string;
  notes?: string;
  salePrice?: number;
  currency?: string;
  customerName?: string;
  invoiceNumber?: string;
  deliveryAddress?: string;
  targetRoasterId?: string;
}

// Map frontend display values → Prisma enum values
const WITHDRAWAL_TYPE_TO_API: Record<string, string> = {
  'Roasting Stock': 'RoastingStock',
};

// Map Prisma enum values → frontend display values
const WITHDRAWAL_TYPE_FROM_API: Record<string, string> = {
  'RoastingStock': 'Roasting Stock',
};

/**
 * Create a withdrawal for a green bean lot.
 * If withdrawalType is "Roasting Stock", also returns the created/updated RoasterInventoryItem.
 */
export const createWithdrawal = async (
  lotId: string,
  input: CreateWithdrawalInput,
): Promise<{ greenBeanLot: GreenBeanLot; roasterInventoryItem?: RoasterInventoryItem }> => {
  const apiInput = {
    ...input,
    withdrawalType: WITHDRAWAL_TYPE_TO_API[input.withdrawalType] || input.withdrawalType,
  };
  const response = await api.post<{ greenBeanLot: any; roasterInventoryItem?: any }>(
    `/green-bean-lots/${lotId}/withdrawals`,
    apiInput,
  );
  return {
    greenBeanLot: transformGreenBeanLotFromBackend(response.greenBeanLot),
    roasterInventoryItem: response.roasterInventoryItem
      ? {
          id: response.roasterInventoryItem.id,
          roasterId: response.roasterInventoryItem.roasterId,
          greenBeanLotId: response.roasterInventoryItem.greenBeanLotId,
          claimedWeightKg: response.roasterInventoryItem.claimedWeightKg,
          remainingWeightKg: response.roasterInventoryItem.remainingWeightKg,
        }
      : undefined,
  };
};

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
