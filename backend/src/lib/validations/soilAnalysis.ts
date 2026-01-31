import { z } from 'zod';
import {
  uuidSchema,
  nonEmptyStringSchema,
  dateStringSchema,
  pHSchema,
  nonNegativeNumberSchema,
  urlSchema,
  userRoleSchema,
} from './common';

// ============================================
// Nutrient Schema (reusable)
// ============================================

const nutrientSchema = nonNegativeNumberSchema;

// ============================================
// Soil Analysis Schemas
// ============================================

export const createSoilAnalysisSchema = z.object({
  farmId: uuidSchema,
  farmPlotLocation: nonEmptyStringSchema.pipe(
    z.string().max(200, 'ตำแหน่งแปลงต้องไม่เกิน 200 ตัวอักษร')
  ),
  testDate: dateStringSchema,
  labName: z.string().max(200, 'ชื่อห้องปฏิบัติการต้องไม่เกิน 200 ตัวอักษร').optional().nullable(),
  certificateNumber: z.string().max(100, 'เลขใบรับรองต้องไม่เกิน 100 ตัวอักษร').optional().nullable(),

  // Required nutrients
  pH: pHSchema,
  phosphorus: nutrientSchema,
  potassium: nutrientSchema,
  nitrogen: nutrientSchema,
  calcium: nutrientSchema,
  magnesium: nutrientSchema,

  // Optional nutrients
  organicMatter: nutrientSchema.optional().nullable(),
  sulfur: nutrientSchema.optional().nullable(),
  zinc: nutrientSchema.optional().nullable(),
  iron: nutrientSchema.optional().nullable(),
  manganese: nutrientSchema.optional().nullable(),
  copper: nutrientSchema.optional().nullable(),
  boron: nutrientSchema.optional().nullable(),

  notes: z.string().max(1000, 'หมายเหตุต้องไม่เกิน 1000 ตัวอักษร').optional().nullable(),
  recommendations: z.string().max(2000, 'คำแนะนำต้องไม่เกิน 2000 ตัวอักษร').optional().nullable(),
  attachmentUrl: urlSchema,

  // Audit fields
  createdByRole: userRoleSchema,
});

export const updateSoilAnalysisSchema = z.object({
  farmPlotLocation: z.string().max(200).optional(),
  testDate: dateStringSchema.optional(),
  labName: z.string().max(200).optional().nullable(),
  certificateNumber: z.string().max(100).optional().nullable(),

  pH: pHSchema.optional(),
  phosphorus: nutrientSchema.optional(),
  potassium: nutrientSchema.optional(),
  nitrogen: nutrientSchema.optional(),
  calcium: nutrientSchema.optional(),
  magnesium: nutrientSchema.optional(),

  organicMatter: nutrientSchema.optional().nullable(),
  sulfur: nutrientSchema.optional().nullable(),
  zinc: nutrientSchema.optional().nullable(),
  iron: nutrientSchema.optional().nullable(),
  manganese: nutrientSchema.optional().nullable(),
  copper: nutrientSchema.optional().nullable(),
  boron: nutrientSchema.optional().nullable(),

  notes: z.string().max(1000).optional().nullable(),
  recommendations: z.string().max(2000).optional().nullable(),
  attachmentUrl: urlSchema,
});

// ============================================
// Soil Analysis Query Schema
// ============================================

export const soilAnalysisQuerySchema = z.object({
  search: z.string().optional(),
  farmId: uuidSchema.optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateSoilAnalysisInput = z.infer<typeof createSoilAnalysisSchema>;
export type UpdateSoilAnalysisInput = z.infer<typeof updateSoilAnalysisSchema>;
