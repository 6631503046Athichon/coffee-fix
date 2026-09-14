// Shared constants and pure helpers extracted from ProcessorWorkbench.
// Kept framework-free so they can be unit-tested and reused without React.

import type { ParchmentLot, GreenBeanLot, CropYear, HarvestLot, ProcessingBatch } from '../../../types'

export type ViewMode = 'kanban' | 'table'
export type SortDirection = 'asc' | 'desc'
export type ParchmentSortKeys = keyof ParchmentLot | 'id'
export type GreenBeanSortKeys = keyof GreenBeanLot | 'id' | 'qcScore'

// Default number of rows per page for parchment + green-bean tables.
// Bumped from 3 → 5 to match the harvest/completed panels so the operator
// sees a consistent five-rows-then-paginate rhythm across the whole
// workbench.
export const ITEMS_PER_PAGE = 5
export const MAX_VISIBLE_PAGES = 5
export const NEW_TAG_DAYS = 3

/**
 * Returns true when `dateString` is a parseable date within the last NEW_TAG_DAYS days.
 * Used by the workbench to attach a "NEW" tag to freshly created batches.
 */
export const isRecentItem = (dateString?: string | null): boolean => {
  if (!dateString) return false
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false
  const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= NEW_TAG_DAYS
}

/** Human-readable label for an internal ParchmentLot status code. */
export const formatParchmentStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    AwaitingHulling: 'Awaiting Hulling',
    Hulled: 'Hulled',
  }
  return statusMap[status] || status
}

/**
 * Returns the id of the CropYear whose date range covers today, or an empty
 * string if no year matches. Used to pre-select the current year in dropdowns
 * and chip groups, and to flag the "Current" badge inside CropYearChips.
 */
export const findCurrentCropYearId = (years: CropYear[]): string => {
  const today = new Date()
  const match = years.find((y) => {
    const start = new Date(y.startDate)
    const end = new Date(y.endDate)
    return today >= start && today <= end
  })
  return match?.id ?? ''
}

/**
 * Cherry weight to display for a harvest lot in the processor views, and the
 * client-side ceiling for the parchment figure typed into Record Process.
 *
 * Always use the original input weight. Old partial balances are not input
 * quantities for a second process; an existing batch consumes the whole lot.
 */
export const getHarvestLotCherryWeight = (
  lot: Pick<HarvestLot, 'weightKg' | 'remainingWeightKg'>,
): number => {
  const w = lot.weightKg
  return Number.isFinite(w) ? Math.max(0, w) : 0
}

export const getReadyHarvestLots = (
  lots: HarvestLot[],
  batches: Pick<ProcessingBatch, 'harvestLotId'>[],
): HarvestLot[] => {
  const processedIds = new Set(batches.map(batch => batch.harvestLotId))
  return lots.filter(lot =>
    lot.status === 'Ready for Processing' && !processedIds.has(lot.id),
  )
}
