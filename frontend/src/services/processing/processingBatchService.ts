import { DryingLogEntry, GreenBeanLot, ParchmentLot, ProcessingBatch, ProcessingBatchStatus } from '../../types';
import { api } from '../api';
import { toDateOnly } from '../../utils/dateOnly';
import { transformParchmentLotFromBackend } from '../lots/parchmentLotService';
import { transformGreenBeanLotFromBackend } from '../lots/greenBeanLotService';

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

// The body POST /processing-batches takes for a new batch.
const newBatchBody = (batchData: Partial<ProcessingBatch>) => ({
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
});

/**
 * Create a new processing batch
 */
export const addProcessingBatch = async (
  batchData: Partial<ProcessingBatch>
): Promise<ProcessingBatch> => {
  const response = await api.post<{ processingBatch: any; message: string }>(
    '/processing-batches',
    newBatchBody(batchData)
  );
  return transformProcessingBatchFromBackend(response.processingBatch);
};

/** The grades a one-step Process & Grade hulls the whole parchment into. */
export interface ProcessAndGradeInput {
  totalGreenBeanWeight: number;
  gradedLots: { grade: string; weight: number; price?: number }[];
}

export interface ProcessAndGradeResult {
  processingBatch: ProcessingBatch;
  /** The batch's parchment lot, hulled whole (0 kg left). */
  parchmentLot: ParchmentLot;
  /** One lot per grade, price included. */
  greenBeanLots: GreenBeanLot[];
}

/**
 * Thrown by processAndGradeBatch when the batch came back without its
 * grading (no parchment lot or no green bean lots): the batch is saved, so
 * the popup must close and the page reload rather than invite a second save.
 */
export const BATCH_NOT_GRADED_MESSAGE =
  'The batch was saved but not graded. Grade it from Parchment Stock.';

/**
 * The Parchment page's one-step Process & Grade: a Completed batch, its
 * parchment lot and the Hull & Grade into green bean lots, in one call the
 * backend writes in one transaction, so a failed grading leaves nothing
 * behind and the cherry lot stays ready to process.
 */
export const processAndGradeBatch = async (
  batchData: Partial<ProcessingBatch>,
  hullAndGrade: ProcessAndGradeInput
): Promise<ProcessAndGradeResult> => {
  const response = await api.post<{
    processingBatch: any;
    parchmentLot: any;
    greenBeanLots: Parameters<typeof transformGreenBeanLotFromBackend>[0][];
    message: string;
  }>('/processing-batches', {
    ...newBatchBody({ ...batchData, status: ProcessingBatchStatus.Completed }),
    hullAndGrade,
  });
  // An older backend (or one that skipped hullAndGrade) answers with the
  // batch alone; say so instead of crashing on the missing parchment lot.
  if (!response?.parchmentLot || !Array.isArray(response.greenBeanLots)) {
    throw new Error(BATCH_NOT_GRADED_MESSAGE);
  }
  return {
    processingBatch: transformProcessingBatchFromBackend(response.processingBatch),
    parchmentLot: transformParchmentLotFromBackend(response.parchmentLot),
    greenBeanLots: response.greenBeanLots.map(transformGreenBeanLotFromBackend),
  };
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

/** One drying reading as the Drying log popup sends it (date as YYYY-MM-DD). */
export type DryingLogInput = Omit<DryingLogEntry, 'id'>;

/** A stored reading as the app keeps it: YYYY-MM-DD date, with its id. */
export const transformDryingLogFromBackend = (log: any): DryingLogEntry => ({
  id: log.id,
  date: toDateOnly(log.date),
  moistureContent: log.moistureContent,
  ambientTemp: log.ambientTemp,
  relativeHumidity: log.relativeHumidity,
});

/** Oldest reading first, the order the drying curve is drawn in. */
export const sortDryingLog = (logs: DryingLogEntry[]): DryingLogEntry[] =>
  [...logs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/**
 * Add a drying log entry to a processing batch (its processor or an Admin).
 */
export const addDryingLog = async (
  batchId: string,
  logData: DryingLogInput,
): Promise<DryingLogEntry> => {
  const response = await api.post<{ dryingLog: any; message: string }>(
    `/processing-batches/${batchId}/drying-logs`,
    logData,
  );
  return transformDryingLogFromBackend(response.dryingLog);
};

/** Correct a stored drying reading; only the fields given are sent. */
export const updateDryingLog = async (
  batchId: string,
  logId: string,
  changes: Partial<DryingLogInput>,
): Promise<DryingLogEntry> => {
  const response = await api.put<{ dryingLog: any; message: string }>(
    `/processing-batches/${batchId}/drying-logs/${logId}`,
    changes,
  );
  return transformDryingLogFromBackend(response.dryingLog);
};

/** Remove a stored drying reading. */
export const deleteDryingLog = async (batchId: string, logId: string): Promise<void> => {
  await api.delete(`/processing-batches/${batchId}/drying-logs/${logId}`);
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
    baggingDate: toDateOnly(backendBatch.baggingDate) || undefined,
    dryingStartDate: toDateOnly(backendBatch.dryingStartDate) || undefined,
    dryingEndDate: toDateOnly(backendBatch.dryingEndDate) || undefined,
    createdAt: backendBatch.createdAt
      ? new Date(backendBatch.createdAt).toISOString()
      : undefined,
    dryingLog: sortDryingLog(
      (backendBatch.dryingLogs ?? []).map(transformDryingLogFromBackend),
    ),
  };
}
