import prisma from './prisma'

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

export async function getNextSaleOrderNumber(year = new Date().getFullYear()): Promise<string> {
  const prefix = 'ORD'
  const latestOrder = await prisma.saleOrder.findFirst({
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

  const nextSequence = parseSequenceNumber(latestOrder?.orderNumber ?? '', prefix, year) + 1
  return formatSequenceNumber(prefix, year, nextSequence)
}

export async function getNextInvoiceNumber(year = new Date().getFullYear()): Promise<string> {
  const prefix = 'INV'
  const latestInvoice = await prisma.invoice.findFirst({
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

  const nextSequence = parseSequenceNumber(latestInvoice?.invoiceNumber ?? '', prefix, year) + 1
  return formatSequenceNumber(prefix, year, nextSequence)
}

export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}
