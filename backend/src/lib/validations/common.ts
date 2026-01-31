import { z } from 'zod';

// ============================================
// Common ID Validators
// ============================================

export const uuidSchema = z.string().uuid('รหัสไม่ถูกต้อง (UUID format)');

export const idParamSchema = z.object({
  id: uuidSchema,
});

// ============================================
// Date Validators
// ============================================

export const dateStringSchema = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'รูปแบบวันที่ไม่ถูกต้อง' }
);

export const pastDateSchema = z.string().refine(
  (val) => {
    const date = new Date(val);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return !isNaN(date.getTime()) && date <= today;
  },
  { message: 'วันที่ต้องไม่เกินวันนี้' }
);

export const futureDateSchema = z.string().refine(
  (val) => {
    const date = new Date(val);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return !isNaN(date.getTime()) && date >= today;
  },
  { message: 'วันที่ต้องเป็นวันนี้หรืออนาคต' }
);

// ============================================
// Number Validators
// ============================================

export const positiveNumberSchema = z.number().positive('ค่าต้องมากกว่า 0');

export const nonNegativeNumberSchema = z.number().min(0, 'ค่าต้องไม่ต่ำกว่า 0');

export const percentageSchema = z.number()
  .min(0, 'ค่าต้องไม่ต่ำกว่า 0%')
  .max(100, 'ค่าต้องไม่เกิน 100%');

export const moistureContentSchema = z.number()
  .min(0, 'ความชื้นต้องไม่ต่ำกว่า 0%')
  .max(100, 'ความชื้นต้องไม่เกิน 100%');

export const positiveWeightSchema = z.number()
  .positive('น้ำหนักต้องมากกว่า 0');

export const latitudeSchema = z.number()
  .min(-90, 'ละติจูดต้องอยู่ระหว่าง -90 ถึง 90')
  .max(90, 'ละติจูดต้องอยู่ระหว่าง -90 ถึง 90');

export const longitudeSchema = z.number()
  .min(-180, 'ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180')
  .max(180, 'ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180');

export const pHSchema = z.number()
  .min(0, 'ค่า pH ต้องอยู่ระหว่าง 0 ถึง 14')
  .max(14, 'ค่า pH ต้องอยู่ระหว่าง 0 ถึง 14');

export const temperatureSchema = z.number()
  .min(-50, 'อุณหภูมิต้องอยู่ระหว่าง -50 ถึง 60 องศา')
  .max(60, 'อุณหภูมิต้องอยู่ระหว่าง -50 ถึง 60 องศา');

// ============================================
// String Validators
// ============================================

export const nonEmptyStringSchema = z.string()
  .min(1, 'กรุณากรอกข้อมูล')
  .transform((val) => val.trim());

export const emailSchema = z.string()
  .email('รูปแบบอีเมลไม่ถูกต้อง')
  .transform((val) => val.toLowerCase().trim());

export const optionalEmailSchema = z.string()
  .email('รูปแบบอีเมลไม่ถูกต้อง')
  .transform((val) => val.toLowerCase().trim())
  .optional()
  .nullable();

export const phoneSchema = z.string()
  .regex(/^[0-9+\-\s()]{8,20}$/, 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง')
  .optional()
  .nullable();

export const urlSchema = z.string()
  .url('รูปแบบ URL ไม่ถูกต้อง')
  .optional()
  .nullable();

// ============================================
// Array Validators
// ============================================

export const stringArraySchema = z.array(z.string())
  .transform((arr) => arr.map((s) => s.trim()).filter(Boolean));

export const nonEmptyArraySchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.array(schema).min(1, 'ต้องมีอย่างน้อย 1 รายการ');

// ============================================
// Enum Validators (from Prisma schema)
// ============================================

export const userRoleSchema = z.enum([
  'Farmer',
  'Processor',
  'Roaster',
  'HeadJudge',
  'Cupper',
  'Admin',
], { errorMap: () => ({ message: 'บทบาทไม่ถูกต้อง' }) });

export const processingBatchStatusSchema = z.enum([
  'ToProcess',
  'Drying',
  'Completed',
], { errorMap: () => ({ message: 'สถานะไม่ถูกต้อง' }) });

export const harvestLotStatusSchema = z.enum([
  'ReadyForProcessing',
  'Processing',
], { errorMap: () => ({ message: 'สถานะไม่ถูกต้อง' }) });

export const parchmentLotStatusSchema = z.enum([
  'AwaitingHulling',
  'Hulled',
], { errorMap: () => ({ message: 'สถานะไม่ถูกต้อง' }) });

export const greenBeanSourceTypeSchema = z.enum([
  'Internal',
  'External',
], { errorMap: () => ({ message: 'ประเภทแหล่งที่มาไม่ถูกต้อง' }) });

export const greenBeanAvailabilityStatusSchema = z.enum([
  'Available',
  'Withdrawn',
], { errorMap: () => ({ message: 'สถานะไม่ถูกต้อง' }) });

export const withdrawalTypeSchema = z.enum([
  'Sale',
  'RoastingStock',
  'Sample',
  'Export',
  'Other',
], { errorMap: () => ({ message: 'ประเภทการถอนไม่ถูกต้อง' }) });

export const cuppingSessionTypeSchema = z.enum([
  'QC',
  'Competition',
], { errorMap: () => ({ message: 'ประเภท session ไม่ถูกต้อง' }) });

export const cuppingSessionStatusSchema = z.enum([
  'Setup',
  'Scoring',
  'Adjudication',
  'Finalized',
], { errorMap: () => ({ message: 'สถานะไม่ถูกต้อง' }) });

export const saleOrderStatusSchema = z.enum([
  'Draft',
  'Confirmed',
  'Delivered',
  'Cancelled',
], { errorMap: () => ({ message: 'สถานะไม่ถูกต้อง' }) });

export const invoiceStatusSchema = z.enum([
  'Draft',
  'Sent',
  'Paid',
  'Overdue',
], { errorMap: () => ({ message: 'สถานะไม่ถูกต้อง' }) });

export const customerTypeSchema = z.enum([
  'Roaster',
  'Distributor',
  'Retailer',
  'Other',
], { errorMap: () => ({ message: 'ประเภทลูกค้าไม่ถูกต้อง' }) });

export const weatherSourceSchema = z.enum([
  'Manual',
  'API',
], { errorMap: () => ({ message: 'แหล่งข้อมูลไม่ถูกต้อง' }) });

export const roastLevelSchema = z.enum([
  'Light',
  'Medium',
  'Dark',
], { errorMap: () => ({ message: 'ระดับการคั่วไม่ถูกต้อง' }) });

// ============================================
// Currency Schema
// ============================================

export const currencySchema = z.enum([
  'THB',
  'USD',
  'EUR',
  'JPY',
  'CNY',
], { errorMap: () => ({ message: 'สกุลเงินไม่ถูกต้อง' }) });

// ============================================
// Pagination Schema
// ============================================

export const paginationQuerySchema = z.object({
  page: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
  limit: z.string().transform(Number).pipe(z.number().int().positive().max(100)).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// ============================================
// Search Query Schema
// ============================================

export const searchQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
}).merge(paginationQuerySchema);
