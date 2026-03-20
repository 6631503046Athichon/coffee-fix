import { ParchmentLot } from "../types";
import { api } from "./api";

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
 * Update a parchment lot
 */
export const updateParchmentLot = async (
  id: string,
  updates: Partial<ParchmentLot>,
): Promise<ParchmentLot> => {
  const response = await api.patch<{ parchmentLot: any }>(
    `/parchment-lots/${id}`,
    updates,
  );
  return transformParchmentLotFromBackend(response.parchmentLot);
};

/**
 * Delete a parchment lot
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

export const createParchmentWithdrawal = async (
  lotId: string,
  data: CreateParchmentWithdrawalInput,
): Promise<ParchmentLot> => {
  const response = await api.post<{ parchmentLot: any; message: string }>(
    `/parchment-lots/${lotId}/withdrawals`,
    data,
  );
  return transformParchmentLotFromBackend(response.parchmentLot);
};

/**
 * Combined Record Process + Hull & Grade
 */
export interface ProcessAndHullInput {
  harvestLotId: string;
  processType: string;
  processNotes?: string;
  cropYearId?: string;
  parchmentWeightKg: number;
  moistureContent: number;
  dryingStartDate: string;
  dryingEndDate: string;
  gradedLots: { grade: string; weight: number; price?: number; score?: number }[];
}

export const processAndHull = async (
  data: ProcessAndHullInput,
): Promise<{ processingBatch: any; parchmentLot: ParchmentLot; greenBeanLots: any[] }> => {
  const response = await api.post<{
    processingBatch: any;
    parchmentLot: any;
    greenBeanLots: any[];
    message: string;
  }>("/parchment-lots/process-and-hull", data);
  return {
    processingBatch: response.processingBatch,
    parchmentLot: transformParchmentLotFromBackend(response.parchmentLot),
    greenBeanLots: response.greenBeanLots,
  };
};

/**
 * Transform parchment lot data from backend format to frontend format
 */
export function transformParchmentLotFromBackend(backendLot: any): ParchmentLot {
  return {
    id: backendLot.id,
    displayId: backendLot.displayId || undefined,
    processingBatchId: backendLot.processingBatchId,
    harvestLotId: backendLot.harvestLotId,
    initialWeightKg: backendLot.initialWeightKg,
    currentWeightKg: backendLot.currentWeightKg,
    moistureContent: backendLot.moistureContent,
    processType: backendLot.processType,
    status: backendLot.status,
    physicalTestResults: backendLot.physicalTestResults || undefined,
    withdrawalHistory: backendLot.withdrawalHistory
      ? backendLot.withdrawalHistory.map((w: any) => ({
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
          totalAmount: w.totalAmount || undefined,
          targetRoasterId: w.targetRoasterId || undefined,
          roastProfileNotes: w.roastProfileNotes || undefined,
          cuppingScore: w.cuppingScore || undefined,
        }))
      : undefined,
    createdAt: backendLot.createdAt
      ? new Date(backendLot.createdAt).toISOString()
      : undefined,
  };
}
