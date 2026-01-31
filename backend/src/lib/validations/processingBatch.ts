import { z } from 'zod';
import {
  uuidSchema,
  nonEmptyStringSchema,
  positiveWeightSchema,
  moistureContentSchema,
  dateStringSchema,
  processingBatchStatusSchema,
  temperatureSchema,
  percentageSchema,
} from './common';

// ============================================
// Processing Batch Schemas
// ============================================

export const createProcessingBatchSchema = z.object({
  harvestLotId: uuidSchema,
  processType: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ประเภทการแปรรูปต้องไม่เกิน 100 ตัวอักษร')
  ),
  processNotes: z.string().max(1000, 'หมายเหตุต้องไม่เกิน 1000 ตัวอักษร').optional().nullable(),
  cropYearId: uuidSchema.optional().nullable(),
  status: processingBatchStatusSchema.optional().default('ToProcess'),
});

export const updateProcessingBatchSchema = z.object({
  processType: z.string().max(100).optional(),
  processNotes: z.string().max(1000).optional().nullable(),
  cropYearId: uuidSchema.optional().nullable(),
  status: processingBatchStatusSchema.optional(),
  parchmentWeightKg: positiveWeightSchema.optional().nullable(),
  moistureContent: moistureContentSchema.optional().nullable(),
  baggingDate: dateStringSchema.optional().nullable(),
  dryingStartDate: dateStringSchema.optional().nullable(),
  dryingEndDate: dateStringSchema.optional().nullable(),
});

// ============================================
// Drying Log Entry Schema
// ============================================

export const createDryingLogSchema = z.object({
  date: dateStringSchema,
  moistureContent: moistureContentSchema,
  ambientTemp: temperatureSchema,
  relativeHumidity: percentageSchema,
});

export const createMultipleDryingLogsSchema = z.object({
  logs: z.array(createDryingLogSchema).min(1, 'ต้องมีรายการบันทึกอย่างน้อย 1 รายการ'),
});

// ============================================
// Processing Batch Query Schema
// ============================================

export const processingBatchQuerySchema = z.object({
  search: z.string().optional(),
  status: processingBatchStatusSchema.optional(),
  harvestLotId: uuidSchema.optional(),
  cropYearId: uuidSchema.optional(),
  processType: z.string().optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateProcessingBatchInput = z.infer<typeof createProcessingBatchSchema>;
export type UpdateProcessingBatchInput = z.infer<typeof updateProcessingBatchSchema>;
export type CreateDryingLogInput = z.infer<typeof createDryingLogSchema>;
