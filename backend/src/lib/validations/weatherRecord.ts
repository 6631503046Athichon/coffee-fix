import { z } from 'zod';
import {
  uuidSchema,
  nonEmptyStringSchema,
  dateStringSchema,
  temperatureSchema,
  percentageSchema,
  nonNegativeNumberSchema,
  weatherSourceSchema,
} from './common';

// ============================================
// Weather Record Schemas
// ============================================

export const createWeatherRecordSchema = z.object({
  farmId: uuidSchema,
  farmPlotLocation: nonEmptyStringSchema.pipe(
    z.string().max(200, 'ตำแหน่งแปลงต้องไม่เกิน 200 ตัวอักษร')
  ),
  recordDate: dateStringSchema,
  temperatureMin: temperatureSchema,
  temperatureMax: temperatureSchema,
  temperatureAvg: temperatureSchema,
  rainfall: nonNegativeNumberSchema,
  humidity: percentageSchema,
  source: weatherSourceSchema.optional().default('Manual'),
  notes: z.string().max(1000, 'หมายเหตุต้องไม่เกิน 1000 ตัวอักษร').optional().nullable(),
}).refine((data) => data.temperatureMin <= data.temperatureMax, {
  message: 'อุณหภูมิต่ำสุดต้องน้อยกว่าหรือเท่ากับอุณหภูมิสูงสุด',
  path: ['temperatureMin'],
}).refine((data) => {
  return data.temperatureAvg >= data.temperatureMin && data.temperatureAvg <= data.temperatureMax;
}, {
  message: 'อุณหภูมิเฉลี่ยต้องอยู่ระหว่างอุณหภูมิต่ำสุดและสูงสุด',
  path: ['temperatureAvg'],
});

export const updateWeatherRecordSchema = z.object({
  farmPlotLocation: z.string().max(200).optional(),
  recordDate: dateStringSchema.optional(),
  temperatureMin: temperatureSchema.optional(),
  temperatureMax: temperatureSchema.optional(),
  temperatureAvg: temperatureSchema.optional(),
  rainfall: nonNegativeNumberSchema.optional(),
  humidity: percentageSchema.optional(),
  source: weatherSourceSchema.optional(),
  notes: z.string().max(1000).optional().nullable(),
});

// ============================================
// Weather Record Query Schema
// ============================================

export const weatherRecordQuerySchema = z.object({
  search: z.string().optional(),
  farmId: uuidSchema.optional(),
  source: weatherSourceSchema.optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateWeatherRecordInput = z.infer<typeof createWeatherRecordSchema>;
export type UpdateWeatherRecordInput = z.infer<typeof updateWeatherRecordSchema>;
