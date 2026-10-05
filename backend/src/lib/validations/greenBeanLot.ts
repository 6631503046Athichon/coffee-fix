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
import { parseStrictNumber } from '../utils';

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
  // Admin only: the roaster a purchased (External) lot is bought for, who
  // then owns it (POST /api/green-bean-lots checks it).
  ownerId: uuidSchema.optional().nullable(),
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

// The sale fields of a withdrawal, shared with createParchmentWithdrawalSchema.
// The PATCH that corrects them afterwards (lib/withdrawalVoid) applies the
// same rules and messages.

const SALE_PRICE_MESSAGE = 'Sale price must be a number greater than 0';

/**
 * A Sale's price per kg: above 0 and to the satang (at most 2 decimals), as a
 * number or a plain numeric string ("180.25"). "150abc", true and [150] are
 * refused; empty or null means no price.
 */
export const withdrawalSalePriceSchema = z.preprocess(
  (value) => {
    if (value === '') return null;
    if (typeof value === 'string') return parseStrictNumber(value) ?? value;
    return value;
  },
  z.number({ message: SALE_PRICE_MESSAGE })
    .positive(SALE_PRICE_MESSAGE)
    .refine(
      (price) => Math.abs(price * 100 - Math.round(price * 100)) <= 1e-6,
      'Sale price must have at most 2 decimals'
    )
    .nullable()
);

/** A Sale's currency: one of currencySchema's, in any case; empty means none. */
export const withdrawalCurrencySchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed.toUpperCase();
  },
  z.enum(currencySchema.options, {
    message: `Currency must be one of ${currencySchema.options.join(', ')}`,
  }).nullable()
);

export const createWithdrawalSchema = z.object({
  amountKg: positiveWeightSchema,
  withdrawalType: withdrawalTypeSchema,
  purpose: nonEmptyStringSchema.pipe(
    z.string().max(200, 'วัตถุประสงค์ต้องไม่เกิน 200 ตัวอักษร')
  ),
  notes: z.string().max(500).optional().nullable(),
  date: dateStringSchema.optional(),
  salePrice: withdrawalSalePriceSchema.optional(),
  currency: withdrawalCurrencySchema.optional(),
  // The customer picked from the address book: as long as Customer.name
  // allows (createCustomerSchema in ./sales).
  customerName: z.string().max(200, 'Customer name must be 200 characters or fewer').optional().nullable(),
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
