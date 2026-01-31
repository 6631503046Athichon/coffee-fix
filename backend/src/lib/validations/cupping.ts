import { z } from 'zod';
import {
  uuidSchema,
  nonEmptyStringSchema,
  dateStringSchema,
  cuppingSessionTypeSchema,
  cuppingSessionStatusSchema,
  userRoleSchema,
  nonNegativeNumberSchema,
} from './common';

// ============================================
// Cupping Score Range
// ============================================

const cuppingScoreSchema = z.number()
  .min(0, 'คะแนนต้องไม่ต่ำกว่า 0')
  .max(10, 'คะแนนต้องไม่เกิน 10');

const totalScoreSchema = z.number()
  .min(0, 'คะแนนรวมต้องไม่ต่ำกว่า 0')
  .max(100, 'คะแนนรวมต้องไม่เกิน 100');

// ============================================
// Cupping Session Schemas
// ============================================

export const createCuppingSessionSchema = z.object({
  name: nonEmptyStringSchema.pipe(
    z.string().max(200, 'ชื่อ session ต้องไม่เกิน 200 ตัวอักษร')
  ),
  date: dateStringSchema.optional(),
  type: cuppingSessionTypeSchema,
  status: cuppingSessionStatusSchema.optional().default('Setup'),
});

export const updateCuppingSessionSchema = z.object({
  name: z.string().max(200).optional(),
  date: dateStringSchema.optional(),
  type: cuppingSessionTypeSchema.optional(),
  status: cuppingSessionStatusSchema.optional(),
  finalResults: z.record(z.unknown()).optional().nullable(),
});

// ============================================
// Cupping Sample Schemas
// ============================================

const submitterInfoSchema = z.object({
  name: z.string().optional(),
  organization: z.string().optional(),
});

const originInfoSchema = z.object({
  country: z.string().optional(),
  region: z.string().optional(),
  farm: z.string().optional(),
  altitude: z.string().optional(),
  variety: z.string().optional(),
});

const lotInfoSchema = z.object({
  lotId: z.string().optional(),
  processType: z.string().optional(),
  harvestDate: z.string().optional(),
  grade: z.string().optional(),
});

export const createCuppingSampleSchema = z.object({
  blindCode: nonEmptyStringSchema.pipe(
    z.string().max(50, 'รหัสตัวอย่างต้องไม่เกิน 50 ตัวอักษร')
  ),
  greenBeanLotId: uuidSchema.optional().nullable(),
  submitterInfo: submitterInfoSchema.optional().default({}),
  originInfo: originInfoSchema.optional().default({}),
  lotInfo: lotInfoSchema.optional().default({}),
});

export const updateCuppingSampleSchema = createCuppingSampleSchema.partial();

// ============================================
// Cupping Judge Schemas
// ============================================

export const addJudgeSchema = z.object({
  judgeId: uuidSchema,
  judgeName: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ชื่อ judge ต้องไม่เกิน 100 ตัวอักษร')
  ),
  judgeRole: userRoleSchema,
});

// ============================================
// Judge Score Schemas
// ============================================

const scoresObjectSchema = z.object({
  fragrance: cuppingScoreSchema.optional(),
  flavor: cuppingScoreSchema.optional(),
  aftertaste: cuppingScoreSchema.optional(),
  acidity: cuppingScoreSchema.optional(),
  body: cuppingScoreSchema.optional(),
  balance: cuppingScoreSchema.optional(),
  uniformity: cuppingScoreSchema.optional(),
  cleanCup: cuppingScoreSchema.optional(),
  sweetness: cuppingScoreSchema.optional(),
  overall: cuppingScoreSchema.optional(),
  defects: z.number().min(0).optional(),
});

export const submitScoreSchema = z.object({
  sampleId: uuidSchema,
  scores: scoresObjectSchema,
  notes: z.string().max(1000, 'หมายเหตุต้องไม่เกิน 1000 ตัวอักษร').optional().default(''),
  totalScore: totalScoreSchema,
});

export const updateScoreSchema = z.object({
  scores: scoresObjectSchema.optional(),
  notes: z.string().max(1000).optional(),
  totalScore: totalScoreSchema.optional(),
});

// ============================================
// Cupping Session Query Schema
// ============================================

export const cuppingSessionQuerySchema = z.object({
  search: z.string().optional(),
  type: cuppingSessionTypeSchema.optional(),
  status: cuppingSessionStatusSchema.optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateCuppingSessionInput = z.infer<typeof createCuppingSessionSchema>;
export type UpdateCuppingSessionInput = z.infer<typeof updateCuppingSessionSchema>;
export type CreateCuppingSampleInput = z.infer<typeof createCuppingSampleSchema>;
export type AddJudgeInput = z.infer<typeof addJudgeSchema>;
export type SubmitScoreInput = z.infer<typeof submitScoreSchema>;
