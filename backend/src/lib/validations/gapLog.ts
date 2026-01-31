import { z } from 'zod';
import {
  uuidSchema,
  nonEmptyStringSchema,
  dateStringSchema,
} from './common';

// ============================================
// GAP Log Schemas
// ============================================

export const createGAPLogSchema = z.object({
  farmId: uuidSchema.optional().nullable(),
  farmPlotLocation: nonEmptyStringSchema.pipe(
    z.string().max(200, 'ตำแหน่งแปลงต้องไม่เกิน 200 ตัวอักษร')
  ),
  activityTypeId: uuidSchema,
  activityTypeName: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ชื่อกิจกรรมต้องไม่เกิน 100 ตัวอักษร')
  ),
  date: dateStringSchema,
  productUsed: nonEmptyStringSchema.pipe(
    z.string().max(200, 'ชื่อผลิตภัณฑ์ต้องไม่เกิน 200 ตัวอักษร')
  ),
  quantity: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ปริมาณต้องไม่เกิน 100 ตัวอักษร')
  ),
  notes: z.string().max(1000, 'หมายเหตุต้องไม่เกิน 1000 ตัวอักษร').optional().nullable(),
});

export const updateGAPLogSchema = z.object({
  farmId: uuidSchema.optional().nullable(),
  farmPlotLocation: z.string().max(200).optional(),
  activityTypeId: uuidSchema.optional(),
  activityTypeName: z.string().max(100).optional(),
  date: dateStringSchema.optional(),
  productUsed: z.string().max(200).optional(),
  quantity: z.string().max(100).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

// ============================================
// Activity Type Schemas
// ============================================

export const createActivityTypeSchema = z.object({
  name: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ชื่อประเภทกิจกรรมต้องไม่เกิน 100 ตัวอักษร')
  ),
  description: z.string().max(500, 'คำอธิบายต้องไม่เกิน 500 ตัวอักษร').optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const updateActivityTypeSchema = createActivityTypeSchema.partial();

// ============================================
// GAP Log Query Schema
// ============================================

export const gapLogQuerySchema = z.object({
  search: z.string().optional(),
  farmId: uuidSchema.optional(),
  activityTypeId: uuidSchema.optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateGAPLogInput = z.infer<typeof createGAPLogSchema>;
export type UpdateGAPLogInput = z.infer<typeof updateGAPLogSchema>;
export type CreateActivityTypeInput = z.infer<typeof createActivityTypeSchema>;
