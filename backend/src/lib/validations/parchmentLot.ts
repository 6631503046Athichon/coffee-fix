import { z } from 'zod';
import {
  uuidSchema,
  nonEmptyStringSchema,
  positiveWeightSchema,
  moistureContentSchema,
  parchmentLotStatusSchema,
  nonNegativeNumberSchema,
  positiveNumberSchema,
  parchmentWithdrawalTypeSchema,
  currencySchema,
  dateStringSchema,
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
// Parchment Withdrawal Schema
// ============================================

export const createParchmentWithdrawalSchema = z.object({
  amountKg: positiveWeightSchema,
  withdrawalType: parchmentWithdrawalTypeSchema,
  purpose: nonEmptyStringSchema.pipe(
    z.string().max(200, 'วัตถุประสงค์ต้องไม่เกิน 200 ตัวอักษร')
  ),
  notes: z.string().max(500).optional().nullable(),
  // Sale fields
  salePrice: positiveNumberSchema.optional().nullable(),
  currency: currencySchema.optional().nullable(),
  customerName: z.string().max(100).optional().nullable(),
  deliveryAddress: z.string().max(500).optional().nullable(),
  // RoastingStock fields
  targetRoasterId: uuidSchema.optional().nullable(),
  roastProfileNotes: z.string().max(1000).optional().nullable(),
  cuppingScore: z.number().min(0).max(100).optional().nullable(),
  // HullAndGrade fields
  totalGreenBeanWeight: positiveWeightSchema.optional().nullable(),
  gradedLots: z.array(z.object({
    grade: z.string().min(1).max(50),
    weight: positiveWeightSchema,
    price: positiveNumberSchema.optional().nullable(),
    score: z.number().min(0).max(100).optional().nullable(),
  })).optional().nullable(),
});

// ============================================
// Process and Hull Schema
// ============================================

export const processAndHullSchema = z.object({
  harvestLotId: uuidSchema,
  processType: nonEmptyStringSchema.pipe(
    z.string().max(100)
  ),
  processNotes: z.string().max(1000).optional().nullable(),
  cropYearId: uuidSchema.optional().nullable(),
  parchmentWeightKg: positiveWeightSchema,
  moistureContent: moistureContentSchema,
  dryingStartDate: dateStringSchema,
  dryingEndDate: dateStringSchema,
  gradedLots: z.array(z.object({
    grade: z.string().min(1).max(50),
    weight: positiveWeightSchema,
    price: positiveNumberSchema.optional().nullable(),
    score: z.number().min(0).max(100).optional().nullable(),
  })).min(1, 'ต้องมีอย่างน้อย 1 เกรด'),
});

// ============================================
// Type Exports
// ============================================

export type CreateParchmentLotInput = z.infer<typeof createParchmentLotSchema>;
export type UpdateParchmentLotInput = z.infer<typeof updateParchmentLotSchema>;
export type CreatePhysicalTestResultsInput = z.infer<typeof createPhysicalTestResultsSchema>;
export type CreateParchmentWithdrawalInput = z.infer<typeof createParchmentWithdrawalSchema>;
export type ProcessAndHullInput = z.infer<typeof processAndHullSchema>;
