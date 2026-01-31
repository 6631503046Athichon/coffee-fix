import { z } from 'zod';
import {
  uuidSchema,
  emailSchema,
  optionalEmailSchema,
  nonEmptyStringSchema,
  userRoleSchema,
} from './common';

// ============================================
// Password Validation
// ============================================

export const passwordSchema = z.string()
  .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
  .regex(/[A-Z]/, 'รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว')
  .regex(/[a-z]/, 'รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว')
  .regex(/[0-9]/, 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว');

export const simplePasswordSchema = z.string()
  .min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');

export const usernameSchema = z.string()
  .min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร')
  .max(50, 'ชื่อผู้ใช้ต้องไม่เกิน 50 ตัวอักษร')
  .regex(/^[a-zA-Z0-9_-]+$/, 'ชื่อผู้ใช้ต้องประกอบด้วยตัวอักษร ตัวเลข _ หรือ - เท่านั้น')
  .transform((val) => val.toLowerCase());

// ============================================
// User Schemas
// ============================================

export const createUserSchema = z.object({
  name: nonEmptyStringSchema.pipe(z.string().max(100, 'ชื่อต้องไม่เกิน 100 ตัวอักษร')),
  email: optionalEmailSchema,
  username: usernameSchema.optional().nullable(),
  password: simplePasswordSchema.optional(),
  roles: z.array(userRoleSchema).min(1, 'ต้องเลือกบทบาทอย่างน้อย 1 บทบาท'),
  isActive: z.boolean().optional().default(true),
  isSuperAdmin: z.boolean().optional().default(false),
});

export const updateUserSchema = z.object({
  name: nonEmptyStringSchema.pipe(z.string().max(100)).optional(),
  email: optionalEmailSchema,
  username: usernameSchema.optional().nullable(),
  roles: z.array(userRoleSchema).min(1, 'ต้องเลือกบทบาทอย่างน้อย 1 บทบาท').optional(),
  isActive: z.boolean().optional(),
  isSuperAdmin: z.boolean().optional(),
});

export const loginSchema = z.object({
  email: z.string().min(1, 'กรุณากรอกอีเมลหรือชื่อผู้ใช้'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

export const registerSchema = z.object({
  name: nonEmptyStringSchema.pipe(z.string().max(100, 'ชื่อต้องไม่เกิน 100 ตัวอักษร')),
  email: emailSchema,
  username: usernameSchema,
  password: simplePasswordSchema,
  roles: z.array(userRoleSchema).min(1, 'ต้องเลือกบทบาทอย่างน้อย 1 บทบาท'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'กรุณายืนยันรหัสผ่าน'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'รหัสผ่านไม่ตรงกัน',
  path: ['confirmPassword'],
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token ไม่ถูกต้อง'),
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'กรุณายืนยันรหัสผ่าน'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'รหัสผ่านไม่ตรงกัน',
  path: ['confirmPassword'],
});

export const firstLoginUpdateSchema = z.object({
  username: usernameSchema.optional(),
  email: emailSchema.optional(),
  newPassword: simplePasswordSchema.optional(),
});

export const transferOwnershipSchema = z.object({
  fromUserId: uuidSchema,
  toUserId: uuidSchema,
}).refine((data) => data.fromUserId !== data.toUserId, {
  message: 'ผู้โอนและผู้รับโอนต้องเป็นคนละคนกัน',
  path: ['toUserId'],
});

// ============================================
// User Query Schema
// ============================================

export const userQuerySchema = z.object({
  search: z.string().optional(),
  role: userRoleSchema.optional(),
  isActive: z.string().transform((val) => val === 'true').optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type FirstLoginUpdateInput = z.infer<typeof firstLoginUpdateSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
