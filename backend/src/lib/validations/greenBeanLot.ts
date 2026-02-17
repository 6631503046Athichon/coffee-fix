import { z } from 'zod';
import {
  uuidSchema,
  nonEmptyStringSchema,
  positiveWeightSchema,
  positiveNumberSchema,
  greenBeanSourceTypeSchema,
  greenBeanAvailabilityStatusSchema,
  withdrawalTypeSchema,
  currencySchema,
  dateStringSchema,
} from './common';

// ============================================
// Green Bean Lot Schemas
// ============================================

const gradeSchema = z.string()
  .min(1, 'กรุณาระบุเกรด')
  .max(50, 'เกรดต้องไม่เกิน 50 ตัวอักษร');

const externalSourceSchema = z.object({
  // Frontend field names
  originName: z.string().optional(),
  producerName: z.string().optional(),
  variety: z.string().optional(),
  processType: z.string().optional(),
  purchaseDate: z.string().optional(),
  tasteNote: z.string().optional(),
  supplierNotes: z.string().optional(),
  // Legacy/alternative field names (kept for backward compat)
  supplierName: z.string().optional(),
  origin: z.string().optional(),
  importDate: dateStringSchema.optional(),
  certificateNumber: z.string().optional(),
  notes: z.string().optional(),
  // Pricing (can be stored in externalSource as well)
  pricePerKg: z.number().optional(),
  currency: z.string().optional(),
}).optional().nullable();

export const createGreenBeanLotSchema = z.object({
  sourceType: greenBeanSourceTypeSchema,
  parchmentLotId: uuidSchema.optional().nullable(),
  grade: gradeSchema,
  initialWeightKg: positiveWeightSchema,
  currentWeightKg: positiveWeightSchema.optional(),
  availabilityStatus: greenBeanAvailabilityStatusSchema.optional().default('Available'),
  pricePerKg: positiveNumberSchema.optional().nullable(),
  currency: currencySchema.optional().nullable(),
  externalSource: externalSourceSchema,
}).refine((data) => {
  if (data.sourceType === 'Internal' && !data.parchmentLotId) {
    return false;
  }
  return true;
}, {
  message: 'ต้องระบุ Parchment Lot ID สำหรับแหล่งภายใน',
  path: ['parchmentLotId'],
}).refine((data) => {
  if (data.sourceType === 'External' && !data.externalSource) {
    return false;
  }
  return true;
}, {
  message: 'ต้องระบุข้อมูลแหล่งภายนอก',
  path: ['externalSource'],
});

export const updateGreenBeanLotSchema = z.object({
  grade: gradeSchema.optional(),
  currentWeightKg: positiveWeightSchema.optional(),
  availabilityStatus: greenBeanAvailabilityStatusSchema.optional(),
  pricePerKg: positiveNumberSchema.optional().nullable(),
  currency: currencySchema.optional().nullable(),
  externalSource: externalSourceSchema,
});

// ============================================
// Green Bean Withdrawal Schema
// ============================================

export const createWithdrawalSchema = z.object({
  amountKg: positiveWeightSchema,
  withdrawalType: withdrawalTypeSchema,
  purpose: nonEmptyStringSchema.pipe(
    z.string().max(200, 'วัตถุประสงค์ต้องไม่เกิน 200 ตัวอักษร')
  ),
  notes: z.string().max(500).optional().nullable(),
  date: dateStringSchema.optional(),
  salePrice: positiveNumberSchema.optional().nullable(),
  currency: currencySchema.optional().nullable(),
  customerName: z.string().max(100).optional().nullable(),
  invoiceNumber: z.string().max(50).optional().nullable(),
  deliveryAddress: z.string().max(500).optional().nullable(),
  // For Roasting Stock withdrawals: target roaster to push inventory to
  targetRoasterId: uuidSchema.optional().nullable(),
});

// ============================================
// Pricing Schema
// ============================================

export const setPriceSchema = z.object({
  pricePerKg: positiveNumberSchema,
  currency: currencySchema,
  notes: z.string().max(500).optional().nullable(),
});

// ============================================
// Green Bean Lot Query Schema
// ============================================

export const greenBeanLotQuerySchema = z.object({
  search: z.string().optional(),
  sourceType: greenBeanSourceTypeSchema.optional(),
  availabilityStatus: greenBeanAvailabilityStatusSchema.optional(),
  parchmentLotId: uuidSchema.optional(),
  grade: z.string().optional(),
  minWeight: z.string().transform(Number).pipe(z.number().positive()).optional(),
  maxWeight: z.string().transform(Number).pipe(z.number().positive()).optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateGreenBeanLotInput = z.infer<typeof createGreenBeanLotSchema>;
export type UpdateGreenBeanLotInput = z.infer<typeof updateGreenBeanLotSchema>;
export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;
export type SetPriceInput = z.infer<typeof setPriceSchema>;
