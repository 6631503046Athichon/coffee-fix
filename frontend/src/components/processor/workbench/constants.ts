// Shared constants and pure helpers extracted from ProcessorWorkbench.
// Kept framework-free so they can be unit-tested and reused without React.

import type { ParchmentLot, GreenBeanLot, CropYear, HarvestLot, ProcessingBatch } from '../../../types'
import { toDateOnly } from '../../../utils/dateOnly'

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
 *
 * Compares Thai calendar days, both ends inclusive, as the backend rolls the
 * years over (lib/cropYears). The stored bounds are midnight UTC (1 October,
 * 30 September), so comparing the current moment against them left a day
 * with no current year: from 07:00 on 30 September to 07:00 on 1 October in
 * Bangkok, and new batches and lots were filed with no crop year.
 */
export const findCurrentCropYearId = (years: CropYear[], now: Date = new Date()): string => {
  const today = toDateOnly(now)
  const match = years.find((y) => {
    const start = toDateOnly(y.startDate)
    const end = toDateOnly(y.endDate)
    return !!start && !!end && start <= today && today <= end
  })
  return match?.id ?? ''
}

/**
 * The crop years Record Process (Workbench) and Process & Grade (Parchment
 * page) offer, newest first: the current season and the one either side of
 * it, so both popups show the same choices. The season turns on 1 October,
 * on the Thai calendar day like findCurrentCropYearId. `keepIds` are always
 * kept: pass the lot's own crop year (not the year now picked), so a lot
 * filed under an older year keeps that chip after another one is picked and
 * can be switched back, plus the picked one. When no year carries a
 * "YYYY/YYYY" label in the window, every year is offered rather than none.
 */
export const selectableCropYears = (
  years: CropYear[],
  keepIds: string | null | undefined | (string | null | undefined)[] = [],
  now: Date = new Date(),
): CropYear[] => {
  const kept = new Set((Array.isArray(keepIds) ? keepIds : [keepIds]).filter(Boolean))
  const [year, month] = toDateOnly(now).split('-').map(Number)
  const active = month >= 10 ? year : year - 1
  const labels = new Set([
    `${active - 1}/${active}`,
    `${active}/${active + 1}`,
    `${active + 1}/${active + 2}`,
  ])
  const inWindow = years.filter((y) => labels.has(y.year) || kept.has(y.id))
  const offered = inWindow.some((y) => labels.has(y.year)) ? inWindow : years
  return [...offered].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  )
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
