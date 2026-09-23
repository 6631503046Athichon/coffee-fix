import type { Prisma, SaleOrderStatus } from '@prisma/client'
import type prisma from '@/lib/prisma'
import type { AuthenticatedUser } from '@/lib/middleware'
import type { ZodError } from 'zod'

// Shared by the sale-order routes and their tests. Type-only imports keep
// this file free of runtime dependencies, so a test can load it without
// mocking Prisma or the auth middleware.

/** The client handed to a `prisma.$transaction` callback (the extended client's, not Prisma.TransactionClient). */
export type SaleTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Stock figures carry binary noise (0.3 - 0.1 is 0.19999999999999998), so
// weight comparisons allow a hair of slack.
export const WEIGHT_EPSILON = 1e-6
export const DAY_MS = 24 * 60 * 60 * 1000
/** Money: 2 decimals. */
export const round2 = (v: number) => Math.round(v * 100) / 100
/** Kilograms: 3 decimals (to the gram). */
export const round3 = (v: number) => Math.round(v * 1000) / 1000
/**
 * Kilograms rounded DOWN to the gram (float noise forgiven). Used for the kg
 * left to sell, so the maximum offered is never more than the guarded UPDATE
 * accepts, even for a roasted weight logged with more than 3 decimals.
 */
export const floor3 = (v: number) => Math.floor(v * 1000 + WEIGHT_EPSILON) / 1000
export const SALE_TX_OPTIONS = { timeout: 15000 }
export const MAX_SALE_LINES = 30
export const MAX_ORDER_NUMBER_ATTEMPTS = 5
export const SALE_CHANGED_MESSAGE = 'This sale was changed or removed by someone else. Reload and try again.'
export const SALE_REF_GONE_MESSAGE = 'A customer or roast on this sale was just removed. Reload and try again.'
export const SALE_NOT_FOUND_MESSAGE = 'Sale not found'

export const isAdminUser = (u: AuthenticatedUser) => u.isSuperAdmin || u.roles.includes('Admin')
export const canSeeSales = (u: AuthenticatedUser) => isAdminUser(u) || u.roles.includes('Roaster')
export const isPrismaCode = (e: unknown, code: string) => (e as { code?: unknown } | null)?.code === code

/** Same algorithm as the frontend's toRoastBatchId, so labels match everywhere. */
export function roastBatchLabel(id: string): string {
  const num = parseInt(id.replace(/-/g, '').substring(0, 8), 16) % 10000
  return 'RB-' + num.toString().padStart(4, '0')
}

/** '2.5', '0.125' */
export const formatKgText = (kg: number) => String(round3(kg))

const nonBlank = (v: string | null | undefined): string | null => {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed ? trimmed : null
}

/** A non-blank string at `key` of a JSON object (not an array), trimmed; otherwise null. */
export function jsonText(v: Prisma.JsonValue | null | undefined, key: string): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const value = (v as Prisma.JsonObject)[key]
  return typeof value === 'string' ? nonBlank(value) : null
}

/** Kg still free to sell. A roast with no roasted weight has nothing to sell. */
export function availableKgOf(roastedWeightKg: number | null | undefined, soldWeightKg: number | null | undefined): number {
  if (roastedWeightKg == null) return 0
  return Math.max(0, floor3(roastedWeightKg - (soldWeightKg ?? 0)))
}

export const roastSummarySelect = {
  id: true,
  roasterId: true,
  roastDate: true,
  roastLevel: true,
  roastedWeightKg: true,
  soldWeightKg: true,
  greenBeanLotId: true,
  greenBeanLot: {
    select: {
      id: true,
      displayId: true,
      grade: true,
      externalSource: true,
      parchmentLot: {
        select: {
          processType: true,
          externalSource: true,
          harvestLot: { select: { cherryVariety: true } },
        },
      },
    },
  },
} satisfies Prisma.RoastBatchSelect

export const saleOrderInclude = {
  customer: {
    select: { id: true, name: true, type: true, contactEmail: true, contactPhone: true, address: true },
  },
  creator: { select: { id: true, name: true } },
  _count: { select: { invoices: true } },
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { roastBatch: { select: roastSummarySelect } },
  },
} satisfies Prisma.SaleOrderInclude

/** What the sale routes read from each roast before pricing a line. */
export const saleBatchSelect = {
  id: true,
  roasterId: true,
  roastedWeightKg: true,
  greenBeanLotId: true,
  greenBeanLot: { select: { grade: true } },
} satisfies Prisma.RoastBatchSelect

export type RoastSummaryRow = Prisma.RoastBatchGetPayload<{ select: typeof roastSummarySelect }>
export type SaleOrderRow = Prisma.SaleOrderGetPayload<{ include: typeof saleOrderInclude }>
export type SaleBatchRow = Prisma.RoastBatchGetPayload<{ select: typeof saleBatchSelect }>

export type RoastSummaryJson = {
  id: string
  label: string
  roastDate: string
  roastLevel: 'Light' | 'Medium' | 'Dark' | null
  roastedWeightKg: number | null
  soldWeightKg: number
  availableKg: number
  greenBeanLotId: string
  greenBeanLotDisplayId: string | null
  grade: string | null
  variety: string | null
  process: string | null
}

export type SaleOrderItemJson = {
  id: string
  roastBatchId: string | null
  greenBeanLotId: string
  lotGrade: string
  quantity: number
  pricePerKg: number
  subtotal: number
  roast: RoastSummaryJson | null
}

export type SaleOrderJson = {
  id: string
  orderNumber: string
  customerId: string
  customerName: string
  customerPhone: string | null
  customerAddress: string | null
  customer: {
    id: string
    name: string
    type: 'Roaster' | 'Distributor' | 'Retailer' | 'Other'
    contactEmail: string | null
    contactPhone: string | null
    address: string | null
  } | null
  orderDate: string
  status: SaleOrderStatus
  totalAmount: number
  currency: string
  notes: string | null
  createdBy: string
  creatorName: string | null
  invoiceCount: number
  createdAt: string
  updatedAt: string
  items: SaleOrderItemJson[]
}

export type AffectedRoastBatchJson = { id: string; soldWeightKg: number; availableKg: number }

export function serializeRoastSummary(b: RoastSummaryRow): RoastSummaryJson {
  const lot = b.greenBeanLot
  const parchment = lot?.parchmentLot ?? null
  return {
    id: b.id,
    label: roastBatchLabel(b.id),
    roastDate: b.roastDate.toISOString(),
    roastLevel: b.roastLevel ?? null,
    roastedWeightKg: b.roastedWeightKg ?? null,
    soldWeightKg: round3(b.soldWeightKg ?? 0),
    availableKg: availableKgOf(b.roastedWeightKg, b.soldWeightKg),
    greenBeanLotId: b.greenBeanLotId,
    greenBeanLotDisplayId: lot?.displayId ?? null,
    grade: nonBlank(lot?.grade),
    variety:
      jsonText(lot?.externalSource, 'variety') ||
      nonBlank(parchment?.harvestLot?.cherryVariety) ||
      jsonText(parchment?.externalSource, 'variety') ||
      null,
    process: jsonText(lot?.externalSource, 'processType') || nonBlank(parchment?.processType) || null,
  }
}

export function serializeSaleOrder(o: SaleOrderRow): SaleOrderJson {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    customerId: o.customerId,
    customerName: o.customerName,
    customerPhone: o.customerPhone ?? null,
    customerAddress: o.customerAddress ?? null,
    customer: o.customer
      ? {
          id: o.customer.id,
          name: o.customer.name,
          type: o.customer.type,
          contactEmail: o.customer.contactEmail ?? null,
          contactPhone: o.customer.contactPhone ?? null,
          address: o.customer.address ?? null,
        }
      : null,
    orderDate: o.orderDate.toISOString(),
    status: o.status,
    totalAmount: o.totalAmount,
    currency: o.currency,
    notes: o.notes ?? null,
    createdBy: o.createdBy,
    creatorName: o.creator?.name ?? null,
    invoiceCount: o._count?.invoices ?? 0,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    items: (o.items ?? []).map((item) => ({
      id: item.id,
      roastBatchId: item.roastBatchId ?? null,
      greenBeanLotId: item.greenBeanLotId,
      lotGrade: item.lotGrade,
      quantity: item.quantity,
      pricePerKg: item.pricePerKg,
      subtotal: item.subtotal,
      roast: item.roastBatch ? serializeRoastSummary(item.roastBatch) : null,
    })),
  }
}

/**
 * Kg each roast holds for a sale in `status`. A Cancelled sale holds nothing;
 * older green-bean lines (no roast) are skipped.
 */
export function reservationsByBatch(
  status: SaleOrderStatus,
  lines: { roastBatchId: string | null; quantity: number }[],
): Map<string, number> {
  const reserved = new Map<string, number>()
  if (status === 'Cancelled') return reserved
  for (const line of lines) {
    if (!line.roastBatchId) continue
    reserved.set(line.roastBatchId, (reserved.get(line.roastBatchId) ?? 0) + line.quantity)
  }
  for (const [id, kg] of reserved) reserved.set(id, round3(kg))
  return reserved
}

export type PricedSaleLine = {
  roastBatchId: string
  greenBeanLotId: string
  lotGrade: string
  quantity: number
  pricePerKg: number
  subtotal: number
}

/**
 * Server-side amounts. Client subtotals and totals are never read: every line
 * is priced here, and the green lot and grade come from the roast itself.
 */
export function priceLines(
  items: { roastBatchId: string; quantity: number; pricePerKg: number }[],
  batchById: Map<string, { id: string; greenBeanLotId: string; greenBeanLot: { grade: string } }>,
): { rows: PricedSaleLine[]; totalAmount: number } {
  const rows = items.map((item) => {
    const batch = batchById.get(item.roastBatchId)
    if (!batch) throw new Error(`Roast ${item.roastBatchId} was not loaded`)
    const quantity = round3(item.quantity)
    const pricePerKg = round2(item.pricePerKg)
    return {
      roastBatchId: batch.id,
      greenBeanLotId: batch.greenBeanLotId,
      lotGrade: (batch.greenBeanLot?.grade ?? '').slice(0, 50),
      quantity,
      pricePerKg,
      subtotal: round2(quantity * pricePerKg),
    }
  })
  const totalAmount = round2(rows.reduce((sum, row) => sum + row.subtotal, 0))
  return { rows, totalAmount }
}

/**
 * Checks the roasts loaded for a sale: all exist, all belong to `ownerId`, and
 * all have a roasted weight. Returns the error to send, or the roasts by id.
 */
export function checkSaleBatches(
  ids: string[],
  batches: SaleBatchRow[],
  ownerId: string,
  notOwnerMessage: string,
): { error: { status: number; message: string } } | { batchById: Map<string, SaleBatchRow> } {
  const batchById = new Map(batches.map((b) => [b.id, b]))
  if (ids.some((id) => !batchById.has(id))) {
    return {
      error: { status: 404, message: 'One of the roasts on this sale no longer exists. Reload and try again.' },
    }
  }
  if (batches.some((b) => b.roasterId !== ownerId)) {
    return { error: { status: 403, message: notOwnerMessage } }
  }
  const unweighed = ids.map((id) => batchById.get(id)!).find((b) => b.roastedWeightKg == null)
  if (unweighed) {
    return {
      error: {
        status: 409,
        message: `Roast ${roastBatchLabel(unweighed.id)} has no roasted weight yet. Add it in the Roast Logbook before selling it.`,
      },
    }
  }
  return { batchById }
}

export class StockError extends Error {
  constructor(public roastBatchId: string, public maxKg: number, public askedKg: number) {
    super(
      `Not enough roasted coffee left in ${roastBatchLabel(roastBatchId)}: at most ${formatKgText(maxKg)} kg can go on this sale, ${formatKgText(askedKg)} kg asked.`,
    )
    this.name = 'StockError'
  }
}

export class SaleChangedError extends Error {
  constructor() {
    super(SALE_CHANGED_MESSAGE)
    this.name = 'SaleChangedError'
  }
}

/**
 * Moves each roast's sold counter from what the sale held (`oldRes`) to what
 * it holds now (`newRes`), one guarded UPDATE per roast in id order (a fixed
 * order, so two sales can't deadlock). Under READ COMMITTED Postgres re-checks
 * the WHERE against the newest committed row, so two sales can never both
 * take the last kilos. Raw SQL on purpose: it never bumps RoastBatch.updatedAt,
 * so a sale doesn't make an open roast form stale.
 */
export async function applyReservationChange(
  tx: SaleTx,
  oldRes: Map<string, number>,
  newRes: Map<string, number>,
): Promise<AffectedRoastBatchJson[]> {
  const ids = Array.from(new Set([...oldRes.keys(), ...newRes.keys()])).sort()
  const deltas: [string, number][] = []
  for (const id of ids) {
    const d = round3((newRes.get(id) ?? 0) - (oldRes.get(id) ?? 0))
    if (Math.abs(d) > WEIGHT_EPSILON) deltas.push([id, d])
  }
  if (deltas.length === 0) return []

  for (const [id, d] of deltas) {
    if (d > 0) {
      const n = await tx.$executeRaw`
        UPDATE "RoastBatch"
        SET "soldWeightKg" = ROUND(("soldWeightKg" + ${d}::double precision)::numeric, 3)::double precision
        WHERE "id" = ${id}
          AND "roastedWeightKg" IS NOT NULL
          AND "soldWeightKg" + ${d}::double precision <= "roastedWeightKg" + ${WEIGHT_EPSILON}::double precision`
      if (n === 0) {
        const b = await tx.roastBatch.findUnique({
          where: { id },
          select: { roastedWeightKg: true, soldWeightKg: true },
        })
        const free = availableKgOf(b?.roastedWeightKg ?? 0, b?.soldWeightKg ?? 0)
        throw new StockError(id, round3(free + (oldRes.get(id) ?? 0)), newRes.get(id) ?? 0)
      }
    } else {
      await tx.$executeRaw`
        UPDATE "RoastBatch"
        SET "soldWeightKg" = GREATEST(0, ROUND(("soldWeightKg" - ${-d}::double precision)::numeric, 3))::double precision
        WHERE "id" = ${id}`
    }
  }

  const rows = await tx.roastBatch.findMany({
    where: { id: { in: deltas.map(([id]) => id) } },
    select: { id: true, roastedWeightKg: true, soldWeightKg: true },
  })
  return rows
    .map((row) => ({
      id: row.id,
      soldWeightKg: round3(row.soldWeightKg ?? 0),
      availableKg: availableKgOf(row.roastedWeightKg, row.soldWeightKg),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** First zod issue as a sentence; a line's issue is prefixed with its 1-based line number. */
export function firstIssueMessage(error: ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid sale data'
  const [head, index] = issue.path
  if (head === 'items' && typeof index === 'number') return `Line ${index + 1}: ${issue.message}`
  return issue.message
}

/** Parses a JSON object body; null when the body is not JSON or not an object. */
export async function readJsonObject(request: { json(): Promise<unknown> }): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null
    return body as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * The response for an error thrown by a sale write, or null when the route
 * should fall through to handleApiError.
 */
export function saleErrorResponse(
  error: unknown,
  refGoneMessage: string = SALE_REF_GONE_MESSAGE,
): { status: number; body: Record<string, unknown> } | null {
  if (error instanceof StockError) {
    return { status: 409, body: { error: error.message, roastBatchId: error.roastBatchId, maxKg: error.maxKg } }
  }
  if (error instanceof SaleChangedError) {
    return { status: 409, body: { error: SALE_CHANGED_MESSAGE } }
  }
  if (isPrismaCode(error, 'P2003')) {
    return { status: 409, body: { error: refGoneMessage } }
  }
  return null
}
