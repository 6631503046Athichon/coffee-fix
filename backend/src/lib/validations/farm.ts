import { z } from 'zod';
import {
  uuidSchema,
  nonEmptyStringSchema,
  latitudeSchema,
  longitudeSchema,
  positiveNumberSchema,
  stringArraySchema,
  urlSchema,
} from './common';

// ============================================
// Farm Schemas
// ============================================

export const createFarmSchema = z.object({
  farmName: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ชื่อสวนต้องไม่เกิน 100 ตัวอักษร')
  ),
  location: nonEmptyStringSchema.pipe(
    z.string().max(500, 'ที่ตั้งต้องไม่เกิน 500 ตัวอักษร')
  ),
  latitude: latitudeSchema.optional().nullable(),
  longitude: longitudeSchema.optional().nullable(),
  altitude: z.string().max(50).optional().nullable(),
  googleMapsUrl: urlSchema,
  sizeHectares: positiveNumberSchema.optional().nullable(),
  varieties: stringArraySchema.optional().default([]),
  ownerNames: stringArraySchema.optional().default([]),
  caretakerNames: stringArraySchema.optional().default([]),
  caretakerName: z.string().max(100).optional().nullable(),
  ownerId: uuidSchema.optional(),
});

export const updateFarmSchema = z.object({
  farmName: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ชื่อสวนต้องไม่เกิน 100 ตัวอักษร')
  ).optional(),
  location: z.string().max(500).optional(),
  latitude: latitudeSchema.optional().nullable(),
  longitude: longitudeSchema.optional().nullable(),
  altitude: z.string().max(50).optional().nullable(),
  googleMapsUrl: urlSchema,
  sizeHectares: positiveNumberSchema.optional().nullable(),
  varieties: stringArraySchema.optional(),
  ownerNames: stringArraySchema.optional(),
  caretakerNames: stringArraySchema.optional(),
  caretakerName: z.string().max(100).optional().nullable(),
  ownerId: uuidSchema.optional(),
  archived: z.boolean().optional(),
});

// ============================================
// Farm Query Schema
// ============================================

export const farmQuerySchema = z.object({
  search: z.string().optional(),
  ownerId: uuidSchema.optional(),
  archived: z.string().transform((val) => val === 'true').optional(),
  includeArchived: z.string().transform((val) => val === 'true').optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateFarmInput = z.infer<typeof createFarmSchema>;
export type UpdateFarmInput = z.infer<typeof updateFarmSchema>;
