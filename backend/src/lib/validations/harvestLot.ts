import { z } from 'zod';
import {
  uuidSchema,
  nonEmptyStringSchema,
  positiveWeightSchema,
  pastDateSchema,
  harvestLotStatusSchema,
} from './common';

// ============================================
// Harvest Lot Schemas
// ============================================

export const createHarvestLotSchema = z.object({
  farmerName: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ชื่อเกษตรกรต้องไม่เกิน 100 ตัวอักษร')
  ),
  cherryVariety: nonEmptyStringSchema.pipe(
    z.string().max(100, 'สายพันธุ์ต้องไม่เกิน 100 ตัวอักษร')
  ),
  weightKg: positiveWeightSchema,
  farmPlotLocation: nonEmptyStringSchema.pipe(
    z.string().max(200, 'ตำแหน่งแปลงต้องไม่เกิน 200 ตัวอักษร')
  ),
  harvestDate: pastDateSchema,
  farmId: uuidSchema.optional().nullable(),
  cropYearId: uuidSchema.optional().nullable(),
  status: harvestLotStatusSchema.optional().default('ReadyForProcessing'),
});

export const updateHarvestLotSchema = z.object({
  farmerName: nonEmptyStringSchema.pipe(
    z.string().max(100)
  ).optional(),
  cherryVariety: z.string().max(100).optional(),
  weightKg: positiveWeightSchema.optional(),
  farmPlotLocation: z.string().max(200).optional(),
  harvestDate: pastDateSchema.optional(),
  farmId: uuidSchema.optional().nullable(),
  cropYearId: uuidSchema.optional().nullable(),
  status: harvestLotStatusSchema.optional(),
});

// ============================================
// Harvest Lot Query Schema
// ============================================

export const harvestLotQuerySchema = z.object({
  search: z.string().optional(),
  status: harvestLotStatusSchema.optional(),
  farmId: uuidSchema.optional(),
  cropYearId: uuidSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateHarvestLotInput = z.infer<typeof createHarvestLotSchema>;
export type UpdateHarvestLotInput = z.infer<typeof updateHarvestLotSchema>;
