import { z } from 'zod';
import { dateStringSchema, nonEmptyStringSchema } from './common';

// ============================================
// Crop Year Schemas
// ============================================

export const createCropYearSchema = z.object({
  year: nonEmptyStringSchema.pipe(
    z.string().regex(/^\d{4}(-\d{4})?$/, 'รูปแบบปีไม่ถูกต้อง (เช่น 2024 หรือ 2024-2025)')
  ),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  description: z.string().max(500, 'คำอธิบายต้องไม่เกิน 500 ตัวอักษร').optional().nullable(),
}).refine((data) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return end > start;
}, {
  message: 'วันสิ้นสุดต้องมากกว่าวันเริ่มต้น',
  path: ['endDate'],
});

export const updateCropYearSchema = z.object({
  year: z.string().regex(/^\d{4}(-\d{4})?$/, 'รูปแบบปีไม่ถูกต้อง').optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  description: z.string().max(500).optional().nullable(),
});

// ============================================
// Type Exports
// ============================================

export type CreateCropYearInput = z.infer<typeof createCropYearSchema>;
export type UpdateCropYearInput = z.infer<typeof updateCropYearSchema>;
