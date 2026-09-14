import type { HarvestLot, Prisma } from '@prisma/client'

// A batch consumes its source lot, including batches created by the former
// partial-deduction flow. Read the relation here, not the paginated batch list.
export function serializeHarvestLot<T extends Pick<HarvestLot, 'weightKg' | 'status'> & {
  _count: { processingBatches: number }
}>(lot: T) {
  const { _count, ...fields } = lot
  const consumed = lot.status === 'Complete' || _count.processingBatches > 0
  return {
    ...fields,
    status: consumed ? 'Complete' as const : 'ReadyForProcessing' as const,
    remainingWeightKg: consumed ? 0 : lot.weightKg,
  }
}

export function harvestLotStatusFilter(status: string): Prisma.HarvestLotWhereInput {
  if (status === 'ReadyForProcessing') {
    return { status: 'ReadyForProcessing', processingBatches: { none: {} } }
  }
  return { OR: [{ status: 'Complete' }, { processingBatches: { some: {} } }] }
}
