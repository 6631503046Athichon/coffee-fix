import { GreenBeanLot, GreenBeanWithdrawalRecord, RoasterInventoryItem } from "../../types";
import { api } from "../api";
import { API_BASE_URL } from "../apiBaseUrl";
import { handleApiErrorWithFallback } from "../../utils/errorHandler";
import { toDateOnly } from "../../utils/dateOnly";

// Backend-shaped payloads. Fields are intentionally typed loose because the
// backend can evolve independently; the runtime transformer below maps these
// into the strict frontend `GreenBeanLot` shape.
interface BackendGreenBeanLot {
  id: string;
  displayId?: string | null;
  sourceType?: string;
  parchmentLotId?: string | null;
  createdById?: string | null;
  parchmentWithdrawalId?: string | null;
  // bulk-load nests the source parchment lot (with its batch).
  parchmentLot?: {
    processType?: string | null;
    processingBatch?: { processType?: string | null } | null;
  } | null;
  externalSource?: unknown;
  grade: string;
  initialWeightKg: number;
  currentWeightKg: number;
  availabilityStatus?: string;
  cuppingScores?: unknown[];
  withdrawalHistory?: BackendWithdrawal[];
  publicTraceId?: string | null;
  qrGeneratedAt?: string | null;
  processorScore?: number | null;
  cuppingFragrance?: number | null;
  cuppingFlavor?: number | null;
  cuppingAftertaste?: number | null;
  cuppingAcidity?: number | null;
  cuppingBody?: number | null;
  cuppingBalance?: number | null;
  cuppingOverall?: number | null;
  cuppingUniformity?: number | null;
  cuppingCleanCup?: number | null;
  cuppingSweetness?: number | null;
  qcNotes?: string | null;
  pricePerKg?: number | null;
  currency?: string | null;
  priceSetDate?: string | null;
  priceSetBy?: string | null;
  createdAt?: string | null;
}

interface BackendWithdrawal {
  id?: string;
  amountKg: number;
  withdrawalType: string;
  // Absent when saleDetailsHidden: the backend withholds it with the sale.
  purpose?: string;
  notes?: string;
  date: string;
  withdrawnBy?: string;
  withdrawnByName?: string;
  salePrice?: number;
  currency?: string;
  customerName?: string;
  invoiceNumber?: string;
  deliveryAddress?: string;
  totalAmount?: number;
  targetRoasterId?: string | null;
  saleDetailsHidden?: boolean;
  // Public; voidReason is withheld with the sale (see withdrawalPrivacy).
  voidedAt?: string | null;
  voidedById?: string | null;
  voidReason?: string | null;
}

interface BackendRoasterInventoryItem {
  id: string;
  roasterId: string;
  greenBeanLotId: string;
  claimedWeightKg: number;
  remainingWeightKg: number;
}

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
  const response = await api.post<{ greenBeanLot: BackendGreenBeanLot }>(
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
  /**
   * The QC Score popup's "Tasting Notes & Comments". Sent trimmed; empty
   * clears the saved notes. Left out, the saved notes stay as they are.
   */
  qcNotes?: string,
): Promise<GreenBeanLot> => {
  const response = await api.patch<{ greenBeanLot: BackendGreenBeanLot }>(
    `/green-bean-lots/${id}`,
    {
      processorScore,
      ...(cuppingDetails || {}),
      ...(qcNotes !== undefined && { qcNotes: qcNotes.trim() || null }),
    },
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
  const response = await api.put<{ greenBeanLot: BackendGreenBeanLot }>(
    `/green-bean-lots/${id}`,
    { availabilityStatus },
  );
  return transformGreenBeanLotFromBackend(response.greenBeanLot);
};

export interface UpdateGreenBeanLotPriceInput {
  pricePerKg: number;
  currency: string;
  /** YYYY-MM-DD; the backend defaults to now when omitted */
  priceSetDate?: string;
}

/**
 * Set a green bean lot's price. The backend stamps who set it and writes a
 * pricing-history row in the same transaction.
 */
export const updateGreenBeanLotPrice = async (
  id: string,
  input: UpdateGreenBeanLotPriceInput,
): Promise<GreenBeanLot> => {
  const response = await api.put<{ greenBeanLot: BackendGreenBeanLot }>(
    `/green-bean-lots/${id}`,
    input,
  );
  return transformGreenBeanLotFromBackend(response.greenBeanLot);
};

/**
 * What a green-bean correction may change. The weight is the lot's whole
 * weight (initialWeightKg): the kg left follows from it and from what was
 * already withdrawn, sent to a roaster or sold, so it is never sent.
 */
export interface GreenBeanLotCorrection {
  grade?: string;
  initialWeightKg?: number;
}

/**
 * Correct a green bean lot's grade or weight. The backend refuses (409) a
 * weight below what already went out of the lot.
 */
export const updateGreenBeanLotDetails = async (
  id: string,
  changes: GreenBeanLotCorrection,
): Promise<GreenBeanLot> => {
  const response = await api.put<{ greenBeanLot: BackendGreenBeanLot }>(
    `/green-bean-lots/${id}`,
    changes,
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

    const response = await api.get<{ greenBeanLots: BackendGreenBeanLot[] }>(
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
export function transformGreenBeanLotFromBackend(backendLot: BackendGreenBeanLot): GreenBeanLot {
  const withdrawalHistory = (backendLot.withdrawalHistory || []).map(
    transformGreenBeanWithdrawalFromBackend,
  );

  return {
    id: backendLot.id,
    displayId: backendLot.displayId || undefined,
    sourceType: (backendLot.sourceType || "Internal") as GreenBeanLot['sourceType'],
    parchmentLotId: backendLot.parchmentLotId || undefined,
    createdById: backendLot.createdById || undefined,
    parchmentWithdrawalId: backendLot.parchmentWithdrawalId || undefined,
    // Groups the lot by process type even when its parchment lot is not in
    // the loaded parchment list.
    parchmentProcessType:
      backendLot.parchmentLot?.processType ||
      backendLot.parchmentLot?.processingBatch?.processType ||
      undefined,
    externalSource: backendLot.externalSource as GreenBeanLot['externalSource'],
    grade: backendLot.grade,
    initialWeightKg: backendLot.initialWeightKg,
    currentWeightKg: backendLot.currentWeightKg,
    availabilityStatus: (backendLot.availabilityStatus || 'Available') as GreenBeanLot['availabilityStatus'],
    cuppingScores: (backendLot.cuppingScores || []) as GreenBeanLot['cuppingScores'],
    withdrawalHistory,
    publicTraceId: backendLot.publicTraceId ?? undefined,
    qrGeneratedAt: backendLot.qrGeneratedAt ?? undefined,
    processorScore: backendLot.processorScore ?? undefined,
    cuppingFragrance: backendLot.cuppingFragrance ?? undefined,
    cuppingFlavor: backendLot.cuppingFlavor ?? undefined,
    cuppingAftertaste: backendLot.cuppingAftertaste ?? undefined,
    cuppingAcidity: backendLot.cuppingAcidity ?? undefined,
    cuppingBody: backendLot.cuppingBody ?? undefined,
    cuppingBalance: backendLot.cuppingBalance ?? undefined,
    cuppingOverall: backendLot.cuppingOverall ?? undefined,
    cuppingUniformity: backendLot.cuppingUniformity ?? undefined,
    cuppingCleanCup: backendLot.cuppingCleanCup ?? undefined,
    cuppingSweetness: backendLot.cuppingSweetness ?? undefined,
    qcNotes: backendLot.qcNotes ?? undefined,
    pricePerKg: backendLot.pricePerKg ?? undefined,
    currency: backendLot.currency ?? undefined,
    priceSetDate: toDateOnly(backendLot.priceSetDate) || undefined,
    priceSetBy: backendLot.priceSetBy ?? undefined,
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

/** One withdrawal row as the frontend shows it: display type, YYYY-MM-DD date. */
export function transformGreenBeanWithdrawalFromBackend(
  w: BackendWithdrawal,
): GreenBeanWithdrawalRecord {
  return {
    ...w,
    withdrawalType: WITHDRAWAL_TYPE_FROM_API[w.withdrawalType] || w.withdrawalType,
    date: toDateOnly(w.date) || w.date,
  } as unknown as GreenBeanWithdrawalRecord;
}

/**
 * What a withdrawal's in-place edit may change (D7): the sale paperwork only.
 * null or an empty string clears a field. The kg, type and roaster never
 * change in place: a wrong withdrawal is voided and recorded again. Only a
 * Sale takes a price or currency; the backend works out the total.
 */
export interface WithdrawalSaleEdit {
  customerName?: string | null;
  deliveryAddress?: string | null;
  salePrice?: number | null;
  currency?: string | null;
  invoiceNumber?: string | null;
}

/**
 * Correct a green-bean withdrawal's customer, address, price, currency or
 * invoice number. Owner and Admin only; a void withdrawal is refused (409).
 */
export const updateGreenBeanWithdrawal = async (
  lotId: string,
  withdrawalId: string,
  changes: WithdrawalSaleEdit,
): Promise<GreenBeanWithdrawalRecord> => {
  const response = await api.patch<{ withdrawal: BackendWithdrawal }>(
    `/green-bean-lots/${lotId}/withdrawals/${withdrawalId}`,
    changes,
  );
  return transformGreenBeanWithdrawalFromBackend(response.withdrawal);
};

export interface VoidGreenBeanWithdrawalResult {
  /** The lot with its kg back and its whole history (the void marked). */
  greenBeanLot: GreenBeanLot;
  withdrawal: GreenBeanWithdrawalRecord;
  /** The roaster stock row the kg were taken back off, or null. */
  roasterInventoryItem: RoasterInventoryItem | null;
  /**
   * True when that row was left holding nothing (0 kg, no roast or sale) and
   * the backend removed it: roasterInventoryItem is then its last state.
   */
  roasterInventoryItemRemoved?: boolean;
}

/**
 * Void a wrong green-bean withdrawal (D7). In one transaction the backend puts
 * its kg back on the lot, takes them back off the roaster stock a Roasting
 * Stock push filled (409 when the roaster already used them), and keeps the
 * row in the history, marked void. A blank reason is sent as none.
 */
export const voidGreenBeanWithdrawal = async (
  lotId: string,
  withdrawalId: string,
  reason?: string,
): Promise<VoidGreenBeanWithdrawalResult> => {
  const trimmed = reason?.trim();
  const response = await api.post<{
    greenBeanLot: BackendGreenBeanLot;
    withdrawal: BackendWithdrawal;
    roasterInventoryItem?: BackendRoasterInventoryItem | null;
    roasterInventoryItemRemoved?: boolean;
  }>(
    `/green-bean-lots/${lotId}/withdrawals/${withdrawalId}/void`,
    trimmed ? { reason: trimmed } : {},
  );
  const item = response.roasterInventoryItem;
  return {
    greenBeanLot: transformGreenBeanLotFromBackend(response.greenBeanLot),
    withdrawal: transformGreenBeanWithdrawalFromBackend(response.withdrawal),
    roasterInventoryItem: item
      ? {
          id: item.id,
          roasterId: item.roasterId,
          greenBeanLotId: item.greenBeanLotId,
          claimedWeightKg: item.claimedWeightKg,
          remainingWeightKg: item.remainingWeightKg,
        }
      : null,
    roasterInventoryItemRemoved: response.roasterInventoryItemRemoved === true,
  };
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
  const response = await api.post<{ greenBeanLot: BackendGreenBeanLot; roasterInventoryItem?: BackendRoasterInventoryItem }>(
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
 * Get a green bean lot's public trace ID, creating it if the lot has none.
 * A lot that already has one gets it back unchanged (printed QR codes keep
 * working). Pass `regenerate` only for an explicit "Regenerate": it replaces
 * the id and invalidates every QR code printed with the old one.
 */
export const generatePublicTraceId = async (
  lotId: string,
  regenerate = false
): Promise<GeneratePublicIdResponse> => {
  const response = await api.post<GeneratePublicIdResponse>(
    `/green-bean-lots/${lotId}/generate-public-id`,
    regenerate ? { regenerate: true } : undefined
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
  return `${API_BASE_URL}/green-bean-lots/${lotId}/qr?format=${format}&size=${size}`;
};

const getFrontendBaseUrl = (): string => {
  if (typeof window === 'undefined') return '';
  const appPath = window.location.pathname === '/'
    ? ''
    : window.location.pathname.replace(/\/$/, '');
  return `${window.location.origin}${appPath}`;
};

/**
 * Build the public trace URL for a lot
 */
export const getPublicTraceUrl = (publicTraceId: string): string => {
  return `${getFrontendBaseUrl()}/#/trace/${publicTraceId}`;
};

export const getTraceabilityLotUrl = (lotId: string): string => {
  return `${getFrontendBaseUrl()}/#/traceability/${lotId}`;
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
    cuppingFragrance?: number;
    cuppingFlavor?: number;
    cuppingAftertaste?: number;
    cuppingAcidity?: number;
    cuppingBody?: number;
    cuppingBalance?: number;
    cuppingOverall?: number;
    cuppingUniformity?: number;
    cuppingCleanCup?: number;
    cuppingSweetness?: number;
    qcNotes?: string;
    parchmentLot?: any;
    roastBatches: any[];
  };
  // The lot's public id; null in a staff preview of a lot not yet published.
  traceId: string | null;
}

/**
 * Fetch a lot's traceability story for staff (auth required). Same data the
 * public page shows, and it works before the lot has a public id.
 */
export const getTracePreviewData = async (lotId: string): Promise<PublicTraceData> => {
  return api.get<PublicTraceData>(`/green-bean-lots/${lotId}/trace-preview`);
};

/**
 * Fetch public traceability data (no auth required)
 */
export const getPublicTraceData = async (publicId: string): Promise<PublicTraceData> => {
  const response = await fetch(`${API_BASE_URL}/trace/${publicId}`);

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
