import { z } from 'zod';
import {
  uuidSchema,
  positiveWeightSchema,
  percentageSchema,
  dateStringSchema,
  roastLevelSchema,
} from './common';

// ============================================
// Roaster Inventory Schemas
// ============================================

export const claimInventorySchema = z.object({
  greenBeanLotId: uuidSchema,
  claimedWeightKg: positiveWeightSchema,
});

export const updateInventorySchema = z.object({
  remainingWeightKg: positiveWeightSchema.optional(),
});

// ============================================
// Roast Batch Schemas
// ============================================

export const createRoastBatchSchema = z.object({
  roasterInventoryId: uuidSchema,
  greenBeanLotId: uuidSchema,
  roastDate: dateStringSchema.optional(),
  batchSizeKg: positiveWeightSchema,
  yieldPercentage: percentageSchema,
  roastedWeightKg: positiveWeightSchema.optional().nullable(),
  weightLossPct: percentageSchema.optional().nullable(),
  roastLevel: roastLevelSchema.optional().nullable(),
  roastProfileNotes: z.string().max(2000, 'โปรไฟล์การคั่วต้องไม่เกิน 2000 ตัวอักษร').optional().default(''),
  flavorNotes: z.string().max(1000, 'หมายเหตุรสชาติต้องไม่เกิน 1000 ตัวอักษร').optional().nullable(),
});

export const updateRoastBatchSchema = z.object({
  roastDate: dateStringSchema.optional(),
  batchSizeKg: positiveWeightSchema.optional(),
  yieldPercentage: percentageSchema.optional(),
  roastedWeightKg: positiveWeightSchema.optional().nullable(),
  weightLossPct: percentageSchema.optional().nullable(),
  roastLevel: roastLevelSchema.optional().nullable(),
  roastProfileNotes: z.string().max(2000).optional(),
  flavorNotes: z.string().max(1000).optional().nullable(),
});

// ============================================
// Roast Batch Query Schema
// ============================================

export const roastBatchQuerySchema = z.object({
  search: z.string().optional(),
  roasterId: uuidSchema.optional(),
  greenBeanLotId: uuidSchema.optional(),
  roastLevel: roastLevelSchema.optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

export const roasterInventoryQuerySchema = z.object({
  search: z.string().optional(),
  roasterId: uuidSchema.optional(),
  greenBeanLotId: uuidSchema.optional(),
  hasRemaining: z.string().transform((val) => val === 'true').optional(),
});

// ============================================
// Type Exports
// ============================================

export type ClaimInventoryInput = z.infer<typeof claimInventorySchema>;
export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;
export type CreateRoastBatchInput = z.infer<typeof createRoastBatchSchema>;
export type UpdateRoastBatchInput = z.infer<typeof updateRoastBatchSchema>;
