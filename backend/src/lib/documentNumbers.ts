import prisma from './prisma'
import { reserveSequence } from './documentSequence'
import { businessYear } from './utils'
import type { SaleTx } from './saleOrders'

/** The app's client, or the client a `prisma.$transaction` callback gets. */
type NumberDb = typeof prisma | SaleTx

const DEFAULT_PAD_LENGTH = 4

function parseSequenceNumber(value: string, prefix: string, year: number): number {
  const expectedPrefix = `${prefix}-${year}-`
  if (!value.startsWith(expectedPrefix)) {
    return 0
  }

  const suffix = value.slice(expectedPrefix.length)
  const parsed = Number.parseInt(suffix, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatSequenceNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(DEFAULT_PAD_LENGTH, '0')}`
}

// The numbers come from the persistent counter (lib/documentSequence), so a
// deleted order's or invoice's number is never handed out again. The latest
// number in the table is the floor the counter never goes below, so it
// carries on from existing data. orderNumber / invoiceNumber stay @unique:
// the callers retry on P2002 and get a fresh number.
//
// Pass the transaction client as `db` and take the number first thing in the
// transaction that creates the record: a sale or invoice that fails then
// gives its number back instead of leaving a gap.
//
// The year defaults to the Thai year (businessYear): on the UTC server
// new Date().getFullYear() is still last year on 1 January until 07:00.

export async function getNextSaleOrderNumber(
  year = businessYear(),
  db: NumberDb = prisma,
): Promise<string> {
  const prefix = 'ORD'
  const latestOrder = await db.saleOrder.findFirst({
    where: {
      orderNumber: {
        startsWith: `${prefix}-${year}-`,
      },
    },
    select: {
      orderNumber: true,
    },
    orderBy: {
      orderNumber: 'desc',
    },
  })

  const floor = parseSequenceNumber(latestOrder?.orderNumber ?? '', prefix, year)
  const nextSequence = await reserveSequence(`${prefix}-${year}`, floor, 1, db)
  return formatSequenceNumber(prefix, year, nextSequence)
}

export async function getNextInvoiceNumber(
  year = businessYear(),
  db: NumberDb = prisma,
): Promise<string> {
  const prefix = 'INV'
  const latestInvoice = await db.invoice.findFirst({
    where: {
      invoiceNumber: {
        startsWith: `${prefix}-${year}-`,
      },
    },
    select: {
      invoiceNumber: true,
    },
    orderBy: {
      invoiceNumber: 'desc',
    },
  })

  const floor = parseSequenceNumber(latestInvoice?.invoiceNumber ?? '', prefix, year)
  const nextSequence = await reserveSequence(`${prefix}-${year}`, floor, 1, db)
  return formatSequenceNumber(prefix, year, nextSequence)
}

export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}
