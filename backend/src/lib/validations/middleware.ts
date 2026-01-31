import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';

export interface ValidationSuccess<T> {
  success: true;
  data: T;
}

export interface ValidationFailure {
  success: false;
  error: NextResponse;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Validates request body against a Zod schema
 * Returns typed data if valid, or a formatted error response
 */
export async function validateBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<ValidationResult<T>> {
  try {
    const body = await req.json();
    const data = schema.parse(body);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: NextResponse.json(
          {
            error: 'Validation Error',
            message: 'ข้อมูลไม่ถูกต้อง',
            details: error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
              code: e.code,
            })),
          },
          { status: 400 }
        ),
      };
    }

    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: NextResponse.json(
          {
            error: 'Invalid JSON',
            message: 'รูปแบบ JSON ไม่ถูกต้อง',
          },
          { status: 400 }
        ),
      };
    }

    throw error;
  }
}

/**
 * Validates query parameters against a Zod schema
 */
export function validateQuery<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): ValidationResult<T> {
  try {
    const searchParams = req.nextUrl.searchParams;
    const queryObject: Record<string, string | string[]> = {};

    searchParams.forEach((value, key) => {
      const existing = queryObject[key];
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          queryObject[key] = [existing, value];
        }
      } else {
        queryObject[key] = value;
      }
    });

    const data = schema.parse(queryObject);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: NextResponse.json(
          {
            error: 'Validation Error',
            message: 'พารามิเตอร์ไม่ถูกต้อง',
            details: error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
              code: e.code,
            })),
          },
          { status: 400 }
        ),
      };
    }
    throw error;
  }
}

/**
 * Validates path parameters (like ID)
 */
export function validateParams<T>(
  params: Record<string, string>,
  schema: ZodSchema<T>
): ValidationResult<T> {
  try {
    const data = schema.parse(params);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: NextResponse.json(
          {
            error: 'Validation Error',
            message: 'พารามิเตอร์ไม่ถูกต้อง',
            details: error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
              code: e.code,
            })),
          },
          { status: 400 }
        ),
      };
    }
    throw error;
  }
}
