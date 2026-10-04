import { GreenBeanLot, ParchmentLot, ParchmentWithdrawalRecord } from "../../types";
import { api, API_BASE_URL } from "../api";
import { transformGreenBeanLotFromBackend } from "./greenBeanLotService";
import type { WithdrawalSaleEdit } from "./greenBeanLotService";

/**
 * Fetch all parchment lots, optionally filtered by processingBatchId, status, or processType
 */
export const getAllParchmentLots = async (
  processingBatchId?: string,
  status?: string,
  processType?: string,
): Promise<ParchmentLot[]> => {
  try {
    const params: Record<string, string> = {};
    if (processingBatchId) params.processingBatchId = processingBatchId;
    if (status) params.status = status;
    if (processType) params.processType = processType;

    const response = await api.get<{ parchmentLots: any[] }>(
      "/parchment-lots",
      Object.keys(params).length > 0 ? params : undefined,
    );
    return response.parchmentLots.map(transformParchmentLotFromBackend);
  } catch (error) {
    console.error("Failed to fetch parchment lots:", error);
    return [];
  }
};

/**
 * Create a new parchment lot
 */
export const createParchmentLot = async (data: {
  processingBatchId: string;
  harvestLotId: string;
  initialWeightKg: number;
  moistureContent: number;
  processType: string;
  status?: string;
}): Promise<ParchmentLot> => {
  const response = await api.post<{ parchmentLot: any; message: string }>(
    "/parchment-lots",
    data,
  );
  return transformParchmentLotFromBackend(response.parchmentLot);
};

/**
 * What a parchment correction may change. The weight is the lot's whole
 * weight (initialWeightKg): the kg left and the status follow from it and
 * from what was already withdrawn or hulled, so they are never sent.
 */
export interface ParchmentLotCorrection {
  initialWeightKg?: number;
  moistureContent?: number;
}

/**
 * Correct a parchment lot's weight or moisture. For a batch's only lot the
 * backend keeps the batch in step.
 */
export const updateParchmentLot = async (
  id: string,
  updates: ParchmentLotCorrection,
): Promise<ParchmentLot> => {
  const response = await api.patch<{ parchmentLot: any }>(
    `/parchment-lots/${id}`,
    updates,
  );
  return transformParchmentLotFromBackend(response.parchmentLot);
};

/**
 * Delete a parchment lot. Refused (409, with the counts) once anything was
 * withdrawn or hulled from it.
 */
export const deleteParchmentLot = async (id: string): Promise<void> => {
  await api.delete(`/parchment-lots/${id}`);
};

/**
 * Create a parchment withdrawal
 */
export interface CreateParchmentWithdrawalInput {
  amountKg: number;
  withdrawalType: string;
  purpose: string;
  notes?: string;
  // Sale fields
  salePrice?: number;
  currency?: string;
  customerName?: string;
  deliveryAddress?: string;
  // RoastingStock fields
  targetRoasterId?: string;
  roastProfileNotes?: string;
  cuppingScore?: number;
  // HullAndGrade fields
  totalGreenBeanWeight?: number;
  gradedLots?: { grade: string; weight: number; price?: number; score?: number }[];
}

export interface CreateParchmentWithdrawalResult {
  parchmentLot: ParchmentLot;
  /** The lots a Hull & Grade created, price included; empty otherwise. */
  greenBeanLots: GreenBeanLot[];
}

export const createParchmentWithdrawal = async (
  lotId: string,
  data: CreateParchmentWithdrawalInput,
): Promise<CreateParchmentWithdrawalResult> => {
  const response = await api.post<{
    parchmentLot: any;
    greenBeanLots?: Parameters<typeof transformGreenBeanLotFromBackend>[0][];
    message: string;
  }>(`/parchment-lots/${lotId}/withdrawals`, data);
  return {
    parchmentLot: transformParchmentLotFromBackend(response.parchmentLot),
    greenBeanLots: (response.greenBeanLots ?? []).map(
      transformGreenBeanLotFromBackend,
    ),
  };
};

/**
 * Import parchment lots from Excel file
 */
export interface ExcelImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  parchmentLots: ParchmentLot[];
}

export const importParchmentFromExcel = async (
  file: File,
): Promise<ExcelImportResult> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/parchment-lots/import-excel`, {
    method: "POST",
    credentials: "include", // httpOnly auth cookie
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Import failed");
  }

  const data = await response.json();
  return {
    imported: data.imported,
    skipped: data.skipped,
    errors: data.errors || [],
    parchmentLots: (data.parchmentLots || []).map(
      transformParchmentLotFromBackend,
    ),
  };
};

/**
 * One parchment withdrawal row from the backend. Every list of them carries
 * voidedAt / voidedById; the sale, purpose and void reason only for the lot's
 * owner and Admin (see the backend's withdrawalPrivacy).
 */
export function transformParchmentWithdrawalFromBackend(w: any): ParchmentWithdrawalRecord {
  return {
    id: w.id,
    amountKg: w.amountKg,
    withdrawalType: w.withdrawalType,
    purpose: w.purpose,
    notes: w.notes || undefined,
    date: w.date ? new Date(w.date).toISOString() : new Date().toISOString(),
    withdrawnBy: w.withdrawnBy || undefined,
    withdrawnByName: w.withdrawnByName || undefined,
    salePrice: w.salePrice || undefined,
    currency: w.currency || undefined,
    customerName: w.customerName || undefined,
    deliveryAddress: w.deliveryAddress || undefined,
    invoiceNumber: w.invoiceNumber || undefined,
    totalAmount: w.totalAmount || undefined,
    targetRoasterId: w.targetRoasterId || undefined,
    roastProfileNotes: w.roastProfileNotes || undefined,
    cuppingScore: w.cuppingScore || undefined,
    // Purpose and sale withheld: the viewer does not own the lot.
    saleDetailsHidden: w.saleDetailsHidden || undefined,
    voidedAt: w.voidedAt ? new Date(w.voidedAt).toISOString() : undefined,
    voidedById: w.voidedById || undefined,
    voidReason: w.voidReason || undefined,
  };
}

/**
 * The parchment lot's withdrawals as the backend shows them to this user, or
 * null when the lot could not be found. bulk-load does not carry them, and
 * GET /parchment-lots/:id has no history, so they come from the list route:
 * by the lot's batch, or (a lot with no batch, e.g. an Excel import) by its
 * process type, up to the route's 200 newest lots.
 */
export const getParchmentWithdrawals = async (
  lot: Pick<ParchmentLot, "id" | "processingBatchId" | "processType">,
): Promise<ParchmentWithdrawalRecord[] | null> => {
  const params: Record<string, string> = lot.processingBatchId
    ? { processingBatchId: lot.processingBatchId }
    : { processType: lot.processType, limit: "200" };
  const response = await api.get<{ parchmentLots: any[] }>("/parchment-lots", params);
  const found = (response.parchmentLots ?? []).find((p) => p.id === lot.id);
  if (!found) return null;
  return (found.withdrawalHistory ?? []).map(transformParchmentWithdrawalFromBackend);
};

/**
 * Correct a parchment withdrawal's customer, address, price, currency or
 * invoice number (D7). Owner (the batch's creator) and Admin only; a void
 * withdrawal is refused (409).
 */
export const updateParchmentWithdrawal = async (
  lotId: string,
  withdrawalId: string,
  changes: WithdrawalSaleEdit,
): Promise<ParchmentWithdrawalRecord> => {
  const response = await api.patch<{ withdrawal: any }>(
    `/parchment-lots/${lotId}/withdrawals/${withdrawalId}`,
    changes,
  );
  return transformParchmentWithdrawalFromBackend(response.withdrawal);
};

/** A green bean lot a voided Hull & Grade made, which the backend deleted. */
export interface RemovedGreenBeanLot {
  id: string;
  displayId: string | null;
  grade: string;
  initialWeightKg: number;
}

export interface VoidParchmentWithdrawalResult {
  /** The lot with its kg back, its status and its whole history. */
  parchmentLot: ParchmentLot;
  withdrawal: ParchmentWithdrawalRecord;
  /** For a Hull & Grade: the green bean lots it made, now deleted. */
  removedGreenBeanLots: RemovedGreenBeanLot[];
}

/**
 * Void a wrong parchment withdrawal (D7). In one transaction the backend puts
 * its kg back on the lot (Awaiting Hulling again if it emptied it) and keeps
 * the row, marked void. Voiding a Hull & Grade also deletes the green bean
 * lots it made, and is refused (409) once any of them was used.
 */
export const voidParchmentWithdrawal = async (
  lotId: string,
  withdrawalId: string,
  reason?: string,
): Promise<VoidParchmentWithdrawalResult> => {
  const trimmed = reason?.trim();
  const response = await api.post<{
    parchmentLot: any;
    withdrawal: any;
    removedGreenBeanLots?: RemovedGreenBeanLot[];
  }>(
    `/parchment-lots/${lotId}/withdrawals/${withdrawalId}/void`,
    trimmed ? { reason: trimmed } : {},
  );
  return {
    parchmentLot: transformParchmentLotFromBackend(response.parchmentLot),
    withdrawal: transformParchmentWithdrawalFromBackend(response.withdrawal),
    removedGreenBeanLots: response.removedGreenBeanLots ?? [],
  };
};

/**
 * Transform parchment lot data from backend format to frontend format
 */
export function transformParchmentLotFromBackend(backendLot: any): ParchmentLot {
  return {
    id: backendLot.id,
    displayId: backendLot.displayId || undefined,
    processingBatchId: backendLot.processingBatchId || undefined,
    harvestLotId: backendLot.harvestLotId || undefined,
    sourceType: backendLot.sourceType || 'Internal',
    externalSource: backendLot.externalSource || undefined,
    initialWeightKg: backendLot.initialWeightKg,
    currentWeightKg: backendLot.currentWeightKg,
    moistureContent: backendLot.moistureContent,
    processType: backendLot.processType,
    status: backendLot.status,
    physicalTestResults: backendLot.physicalTestResults || undefined,
    withdrawalHistory: backendLot.withdrawalHistory
      ? backendLot.withdrawalHistory.map(transformParchmentWithdrawalFromBackend)
      : undefined,
    createdAt: backendLot.createdAt
      ? new Date(backendLot.createdAt).toISOString()
      : undefined,
  };
}
