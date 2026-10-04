import type { NextRequest } from 'next/server'
import { currencySchema } from '@/lib/validations/common'
import { WEIGHT_EPSILON, formatKgText, round2 } from '@/lib/saleOrders'
import { parseStrictNumber } from '@/lib/utils'

// Correcting a recorded withdrawal (owner decision D7), shared by the green
// bean and parchment routes:
//   POST  /api/<lots>/:id/withdrawals/:withdrawalId/void
//   PATCH /api/<lots>/:id/withdrawals/:withdrawalId
// The kg, type, lot and roaster are stock that moved, so they never change in
// place: a wrong withdrawal is voided (its kg go back in one transaction and
// the row stays, marked void) and recorded again. Only the sale paperwork
// (customer, address, price, currency, invoice number) is edited in place.
// Both are the lot owner's tools, like recording the withdrawal, plus Admin
// and super admin.

/** Kilograms to the milligram, which is how the withdrawal routes store them. */
export const round6 = (v: number) => Math.round(v * 1e6) / 1e6

/** A refusal raised inside a void or edit transaction, so it rolls it back. */
export class WithdrawalChangeError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 409,
  ) {
    super(message)
    this.name = 'WithdrawalChangeError'
  }
}

export const WITHDRAWAL_NOT_FOUND_MESSAGE = 'Withdrawal not found'
export const ALREADY_VOID_MESSAGE = 'This withdrawal is already void.'
export const VOID_NOT_EDITABLE_MESSAGE = 'A void withdrawal cannot be edited.'
export const BODY_NOT_OBJECT_MESSAGE = 'Request body must be a JSON object'
export const VOID_REASON_MAX = 500

/**
 * The request body as a plain JSON object: `{}` when there is no body (a void
 * needs none), null when it is anything else (bad JSON, an array, a string).
 */
export async function readJsonObjectBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  let text: string
  try {
    text = await request.text()
  } catch {
    return null
  }
  if (!text.trim()) return {}
  try {
    const body: unknown = JSON.parse(text)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null
    return body as Record<string, unknown>
  } catch {
    return null
  }
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/** `{ reason? }`: why the withdrawal is void, trimmed, or null. */
export function parseVoidBody(body: Record<string, unknown>): Parsed<string | null> {
  const extra = Object.keys(body).filter(key => key !== 'reason')
  if (extra.length > 0) {
    return { ok: false, error: `A void takes only a reason (got: ${extra.join(', ')})` }
  }
  const { reason } = body
  if (reason === undefined || reason === null) return { ok: true, value: null }
  if (typeof reason !== 'string') return { ok: false, error: 'Reason must be text' }
  const trimmed = reason.trim()
  if (trimmed.length > VOID_REASON_MAX) {
    return { ok: false, error: `Reason must be at most ${VOID_REASON_MAX} characters` }
  }
  return { ok: true, value: trimmed || null }
}

/** The only columns PATCH may change. Everything else is fixed: void and record again. */
export const EDITABLE_WITHDRAWAL_FIELDS = [
  'customerName',
  'deliveryAddress',
  'salePrice',
  'currency',
  'invoiceNumber',
] as const

export type WithdrawalEdit = {
  customerName?: string | null
  deliveryAddress?: string | null
  salePrice?: number | null
  currency?: string | null
  invoiceNumber?: string | null
}

// Same limits as the withdrawal schemas in lib/validations.
const TEXT_LIMITS = { customerName: 200, deliveryAddress: 500, invoiceNumber: 50 } as const

/**
 * The PATCH body as the columns it changes. null or an empty string clears a
 * field. Unknown keys are refused, not dropped, so a client that tries to fix
 * the kg this way learns that it has to void instead.
 */
export function parseWithdrawalEdit(body: Record<string, unknown>): Parsed<WithdrawalEdit> {
  const editable: readonly string[] = EDITABLE_WITHDRAWAL_FIELDS
  const extra = Object.keys(body).filter(key => !editable.includes(key))
  if (extra.length > 0) {
    return {
      ok: false,
      error:
        `Only ${EDITABLE_WITHDRAWAL_FIELDS.join(', ')} can be changed on a withdrawal (got: ${extra.join(', ')}). ` +
        'To change the kg, type or roaster, void it and record it again.',
    }
  }
  if (Object.keys(body).length === 0) return { ok: false, error: 'Nothing to change' }

  const edit: WithdrawalEdit = {}
  for (const key of ['customerName', 'deliveryAddress', 'invoiceNumber'] as const) {
    if (!(key in body)) continue
    const value = body[key]
    if (value === null || value === '') {
      edit[key] = null
      continue
    }
    if (typeof value !== 'string') return { ok: false, error: `${key} must be text` }
    const trimmed = value.trim()
    if (trimmed.length > TEXT_LIMITS[key]) {
      return { ok: false, error: `${key} must be at most ${TEXT_LIMITS[key]} characters` }
    }
    edit[key] = trimmed || null
  }

  if ('salePrice' in body) {
    const value = body.salePrice
    if (value === null || value === '') {
      edit.salePrice = null
    } else {
      // "150abc", true and [150] are refused, as in the Hull & Grade price.
      const price = parseStrictNumber(value)
      if (price === null || price <= 0) {
        return { ok: false, error: 'Sale price must be a number greater than 0' }
      }
      if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) {
        return { ok: false, error: 'Sale price must have at most 2 decimals' }
      }
      edit.salePrice = price
    }
  }

  if ('currency' in body) {
    const value = body.currency
    if (value === null || value === '') {
      edit.currency = null
    } else {
      const currency = currencySchema.safeParse(typeof value === 'string' ? value.trim().toUpperCase() : value)
      if (!currency.success) {
        return { ok: false, error: `Currency must be one of ${currencySchema.options.join(', ')}` }
      }
      edit.currency = currency.data
    }
  }

  return { ok: true, value: edit }
}

/**
 * The columns to write for `edit` on `row`. Only a Sale carries a price, and
 * its total is the server's: the withdrawn kg (fixed) times the new price,
 * to the satang. A cleared price clears the total.
 */
export function withdrawalEditData(
  row: { withdrawalType: string; amountKg: number },
  edit: WithdrawalEdit,
): Parsed<WithdrawalEdit & { totalAmount?: number | null }> {
  const pricing = 'salePrice' in edit || 'currency' in edit
  if (pricing && row.withdrawalType !== 'Sale') {
    return { ok: false, error: 'Only a Sale has a price and currency' }
  }
  if (edit.salePrice === undefined) return { ok: true, value: { ...edit } }
  return {
    ok: true,
    value: {
      ...edit,
      totalAmount: edit.salePrice === null ? null : round2(row.amountKg * edit.salePrice),
    },
  }
}

/**
 * Why kg cannot go back on a lot: it would end up above the weight it started
 * with, which means its weight was already put right by hand.
 */
export function lotOverfillMessage(initialKg: number, currentKg: number, kg: number): string {
  return (
    `The lot started with ${formatKgText(initialKg)} kg and holds ${formatKgText(currentKg)} kg, ` +
    `so putting back ${formatKgText(kg)} kg would take it above its starting weight. ` +
    'Its weight may already have been corrected by hand; fix the weight first.'
  )
}

/** Whether `currentKg + kg` would lift a lot that is within its initial weight above it. */
export function wouldOverfill(initialKg: number, currentKg: number, kg: number): boolean {
  return currentKg <= initialKg + WEIGHT_EPSILON && currentKg + kg > initialKg + WEIGHT_EPSILON
}
