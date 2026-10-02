import { z } from 'zod';
import {
  uuidSchema,
  nonEmptyStringSchema,
  positiveWeightSchema,
  pastDateSchema,
  harvestLotStatusSchema,
} from './common';
import { parseStrictDateOnly } from '../utils';

// ============================================
// Harvest Lot Schemas
// ============================================

export const createHarvestLotSchema = z.object({
  farmerName: nonEmptyStringSchema.pipe(
    z.string().max(100, 'ชื่อเกษตรกรต้องไม่เกิน 100 ตัวอักษร')
  ),
  cherryVariety: nonEmptyStringSchema.pipe(
    z.string().max(100, 'สายพันธุ์ต้องไม่เกิน 100 ตัวอักษร')
  ),
  weightKg: positiveWeightSchema,
  farmPlotLocation: nonEmptyStringSchema.pipe(
    z.string().max(200, 'ตำแหน่งแปลงต้องไม่เกิน 200 ตัวอักษร')
  ),
  harvestDate: pastDateSchema,
  farmId: uuidSchema.optional().nullable(),
  cropYearId: uuidSchema.optional().nullable(),
  status: harvestLotStatusSchema.optional().default('ReadyForProcessing'),
});

// ============================================
// Cherry details, shared by the owner and processor edits
// ============================================

// A calendar date (2026-09-23) or an ISO datetime. parseStrictDateOnly only
// runs inside the refine callbacks, at parse time; the regex aborts first so
// free text like "March 3" never reaches the Date constructor.
const HARVEST_DATE_FORMAT = 'Harvest date must be a date like 2026-09-23';
const harvestDateEditSchema = z.string({ message: HARVEST_DATE_FORMAT })
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, { message: HARVEST_DATE_FORMAT, abort: true })
  .refine((v) => {
    const date = parseStrictDateOnly(v);
    return date != null && !Number.isNaN(date.getTime());
  }, { message: 'Harvest date must be a valid date', abort: true })
  .refine((v) => {
    // A day of slack covers clients ahead of the server's timezone.
    const date = parseStrictDateOnly(v);
    return date != null && date.getTime() <= Date.now() + 24 * 60 * 60 * 1000;
  }, 'Harvest date cannot be in the future');

const cherryVarietyEditSchema = z.string({ message: 'Cherry variety must be text' })
  .trim()
  .min(1, 'Cherry variety cannot be empty')
  .max(100, 'Cherry variety must be 100 characters or fewer');

// zod 4 numbers reject NaN and Infinity, so this is "finite and > 0".
const weightEditSchema = z.number({ message: 'Weight must be a number greater than 0' })
  .positive('Weight must be greater than 0');

const plotLocationEditSchema = z.string({ message: 'Plot location must be text' })
  .trim()
  .min(1, 'Plot location cannot be empty')
  .max(200, 'Plot location must be 200 characters or fewer');

// ============================================
// Processor correction of an unprocessed cherry lot
// ============================================

// A Processor may correct only what is measured on the cherry itself. The
// farmer's name, the farm, the crop year and the lot's status stay with the
// owning farmer and Admin.
export const PROCESSOR_EDITABLE_HARVEST_LOT_FIELDS = [
  'cherryVariety',
  'weightKg',
  'farmPlotLocation',
  'harvestDate',
] as const;

export const processorUpdateHarvestLotSchema = z.object({
  cherryVariety: cherryVarietyEditSchema.optional(),
  weightKg: weightEditSchema.optional(),
  farmPlotLocation: plotLocationEditSchema.optional(),
  harvestDate: harvestDateEditSchema.optional(),
});

// ============================================
// Owner (or Admin) edit of a harvest lot
// ============================================

// Every field is optional and the route applies only the keys the body sends,
// so a partial edit never blanks the rest. A key that is sent must hold the
// right type: there is no "empty means unchanged". Unknown keys are dropped.
// farmId and cropYearId are checked against the database by the route, which
// also answers a cleared farm with its own message and locks weightKg and
// status once the lot is processed.
export const updateHarvestLotSchema = z.object({
  farmerName: z.string({ message: 'Farmer name must be text' })
    .trim()
    .min(1, 'Farmer name cannot be empty')
    .max(100, 'Farmer name must be 100 characters or fewer')
    .optional(),
  cherryVariety: cherryVarietyEditSchema.optional(),
  weightKg: weightEditSchema.optional(),
  farmPlotLocation: plotLocationEditSchema.optional(),
  harvestDate: harvestDateEditSchema.optional(),
  status: z.enum(['ReadyForProcessing', 'Complete'], {
    message: 'Status must be ReadyForProcessing or Complete',
  }).optional(),
  cropYearId: z.string({ message: 'Crop year must be a crop year id or null' })
    .nullable()
    .optional(),
  farmId: z.string({ message: 'Farm must be a farm id' })
    .nullable()
    .optional(),
});

// ============================================
// Harvest Lot Query Schema
// ============================================

export const harvestLotQuerySchema = z.object({
  search: z.string().optional(),
  status: harvestLotStatusSchema.optional(),
  farmId: uuidSchema.optional(),
  cropYearId: uuidSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateHarvestLotInput = z.infer<typeof createHarvestLotSchema>;
export type UpdateHarvestLotInput = z.infer<typeof updateHarvestLotSchema>;
export type ProcessorUpdateHarvestLotInput = z.infer<typeof processorUpdateHarvestLotSchema>;
