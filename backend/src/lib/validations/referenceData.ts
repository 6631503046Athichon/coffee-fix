import { z } from 'zod';
import { nonEmptyStringSchema } from './common';

// ============================================
// Process Type Schemas
// ============================================

const colorSchemeSchema = z.object({
  primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'รูปแบบสีไม่ถูกต้อง (ต้องเป็น HEX เช่น #FF5733)'),
  secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'รูปแบบสีไม่ถูกต้อง').optional(),
  text: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'รูปแบบสีไม่ถูกต้อง').optional(),
});

export const createProcessTypeSchema = z.object({
  name: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ชื่อประเภทการแปรรูปต้องไม่เกิน 100 ตัวอักษร')
  ),
  description: z.string().max(500, 'คำอธิบายต้องไม่เกิน 500 ตัวอักษร').optional().nullable(),
  colorScheme: colorSchemeSchema,
  isActive: z.boolean().optional().default(true),
});

export const updateProcessTypeSchema = z.object({
  name: z.string().max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  colorScheme: colorSchemeSchema.optional(),
  isActive: z.boolean().optional(),
});

// ============================================
// Coffee Variety Schemas
// ============================================

export const createCoffeeVarietySchema = z.object({
  name: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ชื่อสายพันธุ์ต้องไม่เกิน 100 ตัวอักษร')
  ),
  species: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ชื่อสปีชีส์ต้องไม่เกิน 100 ตัวอักษร')
  ),
  origin: z.string().max(100, 'แหล่งกำเนิดต้องไม่เกิน 100 ตัวอักษร').optional().nullable(),
  description: z.string().max(1000, 'คำอธิบายต้องไม่เกิน 1000 ตัวอักษร').optional().nullable(),
  characteristics: z.string().max(500, 'ลักษณะเด่นต้องไม่เกิน 500 ตัวอักษร').optional().nullable(),
  altitude: z.string().max(50, 'ระดับความสูงต้องไม่เกิน 50 ตัวอักษร').optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const updateCoffeeVarietySchema = z.object({
  name: z.string().max(100).optional(),
  species: z.string().max(100).optional(),
  origin: z.string().max(100).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  characteristics: z.string().max(500).optional().nullable(),
  altitude: z.string().max(50).optional().nullable(),
  isActive: z.boolean().optional(),
});

// ============================================
// Query Schemas
// ============================================

export const processTypeQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z.string().transform((val) => val === 'true').optional(),
});

export const coffeeVarietyQuerySchema = z.object({
  search: z.string().optional(),
  species: z.string().optional(),
  isActive: z.string().transform((val) => val === 'true').optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateProcessTypeInput = z.infer<typeof createProcessTypeSchema>;
export type UpdateProcessTypeInput = z.infer<typeof updateProcessTypeSchema>;
export type CreateCoffeeVarietyInput = z.infer<typeof createCoffeeVarietySchema>;
export type UpdateCoffeeVarietyInput = z.infer<typeof updateCoffeeVarietySchema>;
