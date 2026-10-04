import { ParchmentLot, ProcessingBatch, ProcessingBatchStatus } from '../../types';
import { api } from '../api';
import { transformParchmentLotFromBackend } from '../lots/parchmentLotService';

// Status mapping constants
const STATUS_TO_BACKEND: Record<ProcessingBatchStatus, string> = {
  [ProcessingBatchStatus.ToProcess]: 'ToProcess',
  [ProcessingBatchStatus.Drying]: 'Drying',
  [ProcessingBatchStatus.Completed]: 'Completed',
};

const STATUS_FROM_BACKEND: Record<string, ProcessingBatchStatus> = {
  'ToProcess': ProcessingBatchStatus.ToProcess,
  'Drying': ProcessingBatchStatus.Drying,
  'Completed': ProcessingBatchStatus.Completed,
};

/**
 * Fetch all processing batches, optionally filtered by harvestLotId or status
 */
export const getAllProcessingBatches = async (
  harvestLotId?: string,
  status?: string
): Promise<ProcessingBatch[]> => {
  try {
    const params: Record<string, string> = {};
    if (harvestLotId) params.harvestLotId = harvestLotId;
    if (status) params.status = status;

    const response = await api.get<{ processingBatches: any[] }>(
      '/processing-batches',
      Object.keys(params).length > 0 ? params : undefined
    );
    return response.processingBatches.map(transformProcessingBatchFromBackend);
  } catch (error) {
    console.error('Failed to fetch processing batches:', error);
    return [];
  }
};

/**
 * Create a new processing batch
 */
export const addProcessingBatch = async (
  batchData: Partial<ProcessingBatch>
): Promise<ProcessingBatch> => {
  const response = await api.post<{ processingBatch: any; message: string }>(
    '/processing-batches',
    {
      harvestLotId: batchData.harvestLotId,
      status: batchData.status ? STATUS_TO_BACKEND[batchData.status] : 'ToProcess',
      processType: batchData.processType,
      processNotes: batchData.processNotes || null,
      cropYearId: batchData.cropYearId || null,
      parchmentWeightKg: batchData.parchmentWeightKg ?? null,
      moistureContent: batchData.moistureContent ?? null,
      dryingStartDate: batchData.dryingStartDate || null,
      dryingEndDate: batchData.dryingEndDate || null,
      baggingDate: batchData.baggingDate || null,
    }
  );
  return transformProcessingBatchFromBackend(response.processingBatch);
};

/**
 * The batch fields the edit popup can correct. An empty string clears notes
 * or a date; a field left out is not sent and stays as it is.
 */
export type ProcessingBatchUpdate = Partial<Pick<
  ProcessingBatch,
  | 'status'
  | 'processType'
  | 'processNotes'
  | 'cropYearId'
  | 'parchmentWeightKg'
  | 'moistureContent'
  | 'baggingDate'
  | 'dryingStartDate'
  | 'dryingEndDate'
>>;

export interface UpdatedProcessingBatch {
  processingBatch: ProcessingBatch;
  /** The batch's parchment lots as saved: weight, moisture and process type follow the batch. */
  parchmentLots: ParchmentLot[];
}

/**
 * Update an existing processing batch. Only the fields given are sent, so a
 * partial edit never clears the others.
 */
export const updateProcessingBatch = async (
  batchId: string,
  changes: ProcessingBatchUpdate
): Promise<UpdatedProcessingBatch> => {
  const payload: Record<string, unknown> = {};
  if (changes.status !== undefined) payload.status = STATUS_TO_BACKEND[changes.status];
  if (changes.processType !== undefined) payload.processType = changes.processType;
  if (changes.processNotes !== undefined) payload.processNotes = changes.processNotes || null;
  if (changes.cropYearId !== undefined) payload.cropYearId = changes.cropYearId || null;
  if (changes.parchmentWeightKg !== undefined) payload.parchmentWeightKg = changes.parchmentWeightKg;
  if (changes.moistureContent !== undefined) payload.moistureContent = changes.moistureContent;
  for (const key of ['baggingDate', 'dryingStartDate', 'dryingEndDate'] as const) {
    if (changes[key] !== undefined) payload[key] = changes[key] || null;
  }
  const response = await api.put<{ processingBatch: any }>(
    `/processing-batches/${batchId}`,
    payload
  );
  return {
    processingBatch: transformProcessingBatchFromBackend(response.processingBatch),
    parchmentLots: (response.processingBatch?.parchmentLots ?? []).map(
      transformParchmentLotFromBackend
    ),
  };
};

/**
 * Add a drying log entry to a processing batch
 */
export const addDryingLog = async (
  batchId: string,
  logData: {
    date: string;
    moistureContent: number;
    ambientTemp: number;
    relativeHumidity: number;
  },
): Promise<any> => {
  const response = await api.post<{ dryingLog: any; message: string }>(
    `/processing-batches/${batchId}/drying-logs`,
    logData,
  );
  return response.dryingLog;
};

export interface DeletedProcessingBatch {
  /** The cherry lot went back to Ready for processing. */
  harvestLotReleased: boolean;
  /** Its untouched parchment output, deleted with it. */
  parchmentLotsDeleted: number;
}

/**
 * Delete a processing batch. The backend takes its parchment output with it
 * only while nothing was drawn from it; otherwise it answers 409 with the
 * counts and deletes nothing.
 */
export const deleteProcessingBatch = async (batchId: string): Promise<DeletedProcessingBatch> => {
  const response = await api.delete<Partial<DeletedProcessingBatch>>(`/processing-batches/${batchId}`);
  return {
    harvestLotReleased: Boolean(response?.harvestLotReleased),
    parchmentLotsDeleted: response?.parchmentLotsDeleted ?? 0,
  };
};

/**
 * Transform processing batch data from backend format to frontend format
 */
export function transformProcessingBatchFromBackend(backendBatch: any): ProcessingBatch {
  return {
    id: backendBatch.id,
    displayId: backendBatch.displayId || undefined,
    harvestLotId: backendBatch.harvestLotId,
    createdById: backendBatch.createdById || undefined,
    status: STATUS_FROM_BACKEND[backendBatch.status] || backendBatch.status,
    processType: backendBatch.processType,
    processNotes: backendBatch.processNotes || undefined,
    cropYearId: backendBatch.cropYearId || undefined,
    parchmentWeightKg: backendBatch.parchmentWeightKg ?? undefined,
    moistureContent: backendBatch.moistureContent ?? undefined,
    baggingDate: backendBatch.baggingDate ? new Date(backendBatch.baggingDate).toISOString().split('T')[0] : undefined,
    dryingStartDate: backendBatch.dryingStartDate ? new Date(backendBatch.dryingStartDate).toISOString().split('T')[0] : undefined,
    dryingEndDate: backendBatch.dryingEndDate ? new Date(backendBatch.dryingEndDate).toISOString().split('T')[0] : undefined,
    createdAt: backendBatch.createdAt
      ? new Date(backendBatch.createdAt).toISOString()
      : undefined,
    dryingLog: backendBatch.dryingLogs?.map((log: any) => ({
      date: typeof log.date === 'string' ? log.date.split('T')[0] : new Date(log.date).toISOString().split('T')[0],
      moistureContent: log.moistureContent,
      ambientTemp: log.ambientTemp,
      relativeHumidity: log.relativeHumidity,
    })) || [],
  };
}
