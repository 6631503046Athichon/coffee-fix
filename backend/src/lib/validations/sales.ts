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
// Sale Order Item Schema
// ============================================

const saleOrderItemSchema = z.object({
  greenBeanLotId: uuidSchema,
  lotGrade: nonEmptyStringSchema.pipe(z.string().max(50)),
  quantity: positiveWeightSchema,
  pricePerKg: positiveNumberSchema,
  subtotal: positiveNumberSchema,
});

// ============================================
// Sale Order Schemas
// ============================================

export const createSaleOrderSchema = z.object({
  customerId: uuidSchema,
  customerName: nonEmptyStringSchema.pipe(
    z.string().max(200, 'Customer name must be 200 characters or fewer')
  ).optional(),
  orderDate: dateStringSchema.optional(),
  status: saleOrderStatusSchema.optional().default('Draft'),
  totalAmount: positiveNumberSchema.optional(),
  currency: currencySchema.optional(),
  notes: z.string().trim().max(1000, 'Notes must be 1000 characters or fewer').optional().nullable(),
  items: z.array(saleOrderItemSchema).min(1, 'At least one sale order item is required'),
});

export const updateSaleOrderSchema = z.object({
  customerId: uuidSchema.optional(),
  customerName: z.string().max(200).optional(),
  orderDate: dateStringSchema.optional(),
  status: saleOrderStatusSchema.optional(),
  totalAmount: positiveNumberSchema.optional(),
  currency: currencySchema.optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(saleOrderItemSchema).optional(),
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
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
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
