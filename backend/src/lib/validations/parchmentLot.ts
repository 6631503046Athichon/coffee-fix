import { z } from 'zod';
import {
  uuidSchema,
  nonEmptyStringSchema,
  positiveWeightSchema,
  moistureContentSchema,
  parchmentLotStatusSchema,
  nonNegativeNumberSchema,
} from './common';

// ============================================
// Parchment Lot Schemas
// ============================================

export const createParchmentLotSchema = z.object({
  processingBatchId: uuidSchema,
  harvestLotId: uuidSchema,
  initialWeightKg: positiveWeightSchema,
  currentWeightKg: positiveWeightSchema.optional(),
  moistureContent: moistureContentSchema,
  processType: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ประเภทการแปรรูปต้องไม่เกิน 100 ตัวอักษร')
  ),
  status: parchmentLotStatusSchema.optional().default('AwaitingHulling'),
});

export const updateParchmentLotSchema = z.object({
  currentWeightKg: positiveWeightSchema.optional(),
  moistureContent: moistureContentSchema.optional(),
  processType: z.string().max(100).optional(),
  status: parchmentLotStatusSchema.optional(),
});

// ============================================
// Physical Test Results Schema
// ============================================

export const createPhysicalTestResultsSchema = z.object({
  parchmentLotId: uuidSchema,
  sampleWeightGrams: positiveWeightSchema,
  greenBeanWeightGrams: positiveWeightSchema,
  greenBeanMoisture: moistureContentSchema,
  waterActivity: z.number()
    .min(0, 'Water activity ต้องอยู่ระหว่าง 0 ถึง 1')
    .max(1, 'Water activity ต้องอยู่ระหว่าง 0 ถึง 1'),
  density: positiveWeightSchema,
  defectCount: z.number().int().min(0, 'จำนวน defect ต้องไม่ต่ำกว่า 0'),
  notes: z.string().max(1000).optional().nullable(),
});

export const updatePhysicalTestResultsSchema = createPhysicalTestResultsSchema.partial().omit({
  parchmentLotId: true,
});

// ============================================
// Parchment Lot Query Schema
// ============================================

export const parchmentLotQuerySchema = z.object({
  search: z.string().optional(),
  status: parchmentLotStatusSchema.optional(),
  processingBatchId: uuidSchema.optional(),
  harvestLotId: uuidSchema.optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateParchmentLotInput = z.infer<typeof createParchmentLotSchema>;
export type UpdateParchmentLotInput = z.infer<typeof updateParchmentLotSchema>;
export type CreatePhysicalTestResultsInput = z.infer<typeof createPhysicalTestResultsSchema>;
