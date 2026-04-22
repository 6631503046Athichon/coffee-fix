// Shared constants and pure helpers extracted from ProcessorWorkbench.
// Kept framework-free so they can be unit-tested and reused without React.

import type { ParchmentLot, GreenBeanLot } from '../../../types'

export type ViewMode = 'kanban' | 'table'
export type SortDirection = 'asc' | 'desc'
export type ParchmentSortKeys = keyof ParchmentLot | 'id'
export type GreenBeanSortKeys = keyof GreenBeanLot | 'id' | 'qcScore'

export const ITEMS_PER_PAGE = 3
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
