import { ProcessingBatch, ProcessingBatchStatus } from '../types';
import { api } from './api';

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
      parchmentWeightKg: batchData.parchmentWeightKg || null,
      moistureContent: batchData.moistureContent || null,
      dryingStartDate: batchData.dryingStartDate || null,
      dryingEndDate: batchData.dryingEndDate || null,
      baggingDate: batchData.baggingDate || null,
    }
  );
  return transformProcessingBatchFromBackend(response.processingBatch);
};

/**
 * Update an existing processing batch
 */
export const updateProcessingBatch = async (
  batchId: string,
  batchData: Partial<ProcessingBatch>
): Promise<ProcessingBatch> => {
  const response = await api.put<{ processingBatch: any }>(
    `/processing-batches/${batchId}`,
    {
      status: batchData.status ? STATUS_TO_BACKEND[batchData.status] : undefined,
      processType: batchData.processType,
      processNotes: batchData.processNotes || null,
      cropYearId: batchData.cropYearId || null,
      parchmentWeightKg: batchData.parchmentWeightKg || null,
      moistureContent: batchData.moistureContent || null,
      baggingDate: batchData.baggingDate || null,
      dryingStartDate: batchData.dryingStartDate || null,
      dryingEndDate: batchData.dryingEndDate || null,
    }
  );
  return transformProcessingBatchFromBackend(response.processingBatch);
};

/**
 * Delete a processing batch
 */
export const deleteProcessingBatch = async (batchId: string): Promise<void> => {
  await api.delete(`/processing-batches/${batchId}`);
};

/**
 * Transform processing batch data from backend format to frontend format
 */
function transformProcessingBatchFromBackend(backendBatch: any): ProcessingBatch {
  return {
    id: backendBatch.id,
    displayId: backendBatch.displayId || undefined,
    harvestLotId: backendBatch.harvestLotId,
    status: STATUS_FROM_BACKEND[backendBatch.status] || backendBatch.status,
    processType: backendBatch.processType,
    processNotes: backendBatch.processNotes || undefined,
    cropYearId: backendBatch.cropYearId || undefined,
    parchmentWeightKg: backendBatch.parchmentWeightKg || undefined,
    moistureContent: backendBatch.moistureContent || undefined,
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
