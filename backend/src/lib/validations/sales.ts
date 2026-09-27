import { z } from 'zod';
import {
  uuidSchema,
  nonEmptyStringSchema,
  positiveNumberSchema,
  nonNegativeNumberSchema,
  positiveWeightSchema,
  dateStringSchema,
  optionalEmailSchema,
  phoneSchema,
  currencySchema,
  customerTypeSchema,
  saleOrderStatusSchema,
  invoiceStatusSchema,
} from './common';
import { parseStrictDateOnly } from '../utils';

// ============================================
// Customer Schemas
// ============================================

export const createCustomerSchema = z.object({
  name: nonEmptyStringSchema.pipe(
    z.string().max(200, 'Customer name must be 200 characters or fewer')
  ),
  type: customerTypeSchema,
  contactEmail: optionalEmailSchema,
  contactPhone: phoneSchema,
  address: z.string().trim().max(500, 'Address must be 500 characters or fewer').optional().nullable(),
  notes: z.string().trim().max(1000, 'Notes must be 1000 characters or fewer').optional().nullable(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

// ============================================
// Sale Order Schemas (roasted coffee from roast batches, green beans from roaster stock)
// ============================================

// A plain calendar date. parseStrictDateOnly lives in lib/utils, which has no
// imports of its own; it only runs inside the refine callback, at parse time.
// zod 4 still runs the refine after the regex fails, so it must cope with any
// string: parseStrictDateOnly('') is null. The regex aborts so a malformed
// value reports only the format message.
export const saleDateOnlySchema = z.string({ message: 'Sale date must be a date like 2026-09-23' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Sale date must be a date like 2026-09-23', abort: true })
  .refine((v) => {
    const date = parseStrictDateOnly(v);
    return date != null && !Number.isNaN(date.getTime());
  }, 'Sale date must be a valid date');

const SALE_LINE_SOURCE_MESSAGE = 'Choose roasted coffee or green beans';

// A line sells kg of one roast (roastBatchId) or of one stock row
// (roasterInventoryId), never both. An explicit null counts as absent, so a
// line sent back the way the API returned it still parses.
const saleLineSchema = z.object({
  roastBatchId: z.string({ message: SALE_LINE_SOURCE_MESSAGE }).uuid(SALE_LINE_SOURCE_MESSAGE).nullish(),
  roasterInventoryId: z.string({ message: SALE_LINE_SOURCE_MESSAGE }).uuid(SALE_LINE_SOURCE_MESSAGE).nullish(),
  quantity: z.number({ message: 'Enter the kg sold' })
    .min(0.001, 'Quantity must be at least 0.001 kg')
    .max(100000, 'Quantity must be 100000 kg or less'),
  pricePerKg: z.number({ message: 'Enter a price per kg' })
    .min(0, 'Price per kg cannot be negative')
    .max(1000000, 'Price per kg is too large'),
}).superRefine((line, ctx) => {
  if (!line.roastBatchId && !line.roasterInventoryId) {
    ctx.addIssue({ code: 'custom', message: SALE_LINE_SOURCE_MESSAGE });
  } else if (line.roastBatchId && line.roasterInventoryId) {
    ctx.addIssue({ code: 'custom', message: 'A line is either roasted coffee or green beans, not both' });
  }
});

/** True when no id appears twice (absent ids are ignored). */
const unique = (ids: (string | null | undefined)[]) => {
  const set = ids.filter((id): id is string => !!id);
  return new Set(set).size === set.length;
};

const saleLinesSchema = z.array(saleLineSchema, { message: 'Add at least one line to the sale' })
  .min(1, 'Add at least one line to the sale')
  .max(30, 'A sale can have at most 30 lines')
  .refine((lines) => unique(lines.map((line) => line.roastBatchId)), 'Each roast can appear only once in a sale')
  .refine(
    (lines) => unique(lines.map((line) => line.roasterInventoryId)),
    'Each green bean lot can appear only once in a sale'
  );

const saleNotesSchema = z.string({ message: 'Notes must be text' })
  .trim()
  .max(1000, 'Notes must be 1000 characters or fewer')
  .optional()
  .nullable();

const saleCurrencySchema = z.enum(['THB', 'USD', 'EUR', 'JPY', 'CNY'], {
  message: 'Currency must be THB, USD, EUR, JPY or CNY',
});

// Unknown keys (subtotal, totalAmount, customerName, greenBeanLotId, lotGrade)
// are stripped: the server prices every line and copies the lot and grade
// from the roast or the stock row.
export const createSaleOrderSchema = z.object({
  customerId: z.string({ message: 'Choose a customer' }).uuid('Choose a customer'),
  // The roaster the sale is recorded for; only an Admin may name someone
  // else (the route checks the role). Absent or null = the caller.
  sellerId: z.string({ message: 'Choose a roaster to sell for' })
    .uuid('Choose a roaster to sell for')
    .nullish(),
  orderDate: saleDateOnlySchema.optional(), // default: today in Bangkok
  // Default 'Confirmed'; the UI never sends it.
  status: z.enum(['Draft', 'Confirmed', 'Delivered'], {
    message: 'A new sale must be Draft, Confirmed or Delivered',
  }).optional(),
  currency: saleCurrencySchema.optional(), // default 'THB'
  notes: saleNotesSchema,
  items: saleLinesSchema,
});

// No sellerId: a sale's owner never changes, so a sellerId sent here is
// stripped like any other unknown key.
export const updateSaleOrderSchema = z.object({
  customerId: z.string({ message: 'Choose a customer' }).uuid('Choose a customer').optional(),
  orderDate: saleDateOnlySchema.optional(),
  status: z.enum(['Draft', 'Confirmed', 'Delivered', 'Cancelled'], {
    message: 'Status must be Draft, Confirmed, Delivered or Cancelled',
  }).optional(),
  currency: saleCurrencySchema.optional(),
  notes: saleNotesSchema,
  // Present = replaces ALL lines.
  items: saleLinesSchema.optional(),
  // updatedAt the client's copy was loaded from; a stale edit is refused.
  expectedUpdatedAt: z.string().datetime('Invalid expectedUpdatedAt').optional(),
});

// ============================================
// Invoice Item Schema
// ============================================

const invoiceItemSchema = z.object({
  greenBeanLotId: uuidSchema,
  lotGrade: nonEmptyStringSchema.pipe(z.string().max(50)),
  quantity: positiveWeightSchema,
  pricePerKg: positiveNumberSchema,
  subtotal: positiveNumberSchema,
});

// ============================================
// Invoice Schemas
// ============================================

export const createInvoiceSchema = z.object({
  saleOrderId: uuidSchema,
  issueDate: dateStringSchema.optional(),
  dueDate: dateStringSchema.optional().nullable(),
  status: invoiceStatusSchema.optional().default('Draft'),
  subtotal: positiveNumberSchema.optional(),
  tax: nonNegativeNumberSchema.optional().nullable(),
  totalAmount: positiveNumberSchema.optional(),
  currency: currencySchema.optional(),
  notes: z.string().trim().max(1000, 'Notes must be 1000 characters or fewer').optional().nullable(),
  items: z.array(invoiceItemSchema).optional(),
});

export const updateInvoiceSchema = z.object({
  issueDate: dateStringSchema.optional(),
  dueDate: dateStringSchema.optional().nullable(),
  status: invoiceStatusSchema.optional(),
  subtotal: positiveNumberSchema.optional(),
  tax: nonNegativeNumberSchema.optional().nullable(),
  totalAmount: positiveNumberSchema.optional(),
  currency: currencySchema.optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(invoiceItemSchema).optional(),
});

// ============================================
// Query Schemas
// ============================================

export const customerQuerySchema = z.object({
  search: z.string().optional(),
  type: customerTypeSchema.optional(),
});

export const saleOrderQuerySchema = z.object({
  search: z.string().optional(),
  customerId: uuidSchema.optional(),
  status: saleOrderStatusSchema.optional(),
  startDate: saleDateOnlySchema.optional(),
  endDate: saleDateOnlySchema.optional(),
});

export const invoiceQuerySchema = z.object({
  search: z.string().optional(),
  saleOrderId: uuidSchema.optional(),
  status: invoiceStatusSchema.optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateSaleOrderInput = z.infer<typeof createSaleOrderSchema>;
export type UpdateSaleOrderInput = z.infer<typeof updateSaleOrderSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
