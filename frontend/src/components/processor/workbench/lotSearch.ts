// What the Workbench search boxes match, and the source columns its CSV
// exports write: one place, so a lot is found by the same farmer, variety
// or source lot the export lists for it.

import type {
  GreenBeanLot,
  HarvestLot,
  ParchmentLot,
  ProcessingBatch,
} from '../../../types'
import {
  formatGreenBeanId,
  formatHarvestLotId,
  formatParchmentId,
  formatProcessingBatchId,
} from '../../../utils/formatDisplayId'
import { formatParchmentStatus } from './constants'

type Text = string | null | undefined

/**
 * True when `search` (trimmed, any case) is part of one of `fields`. An empty
 * search matches everything.
 */
export const matchesLotSearch = (search: string, fields: Text[]): boolean => {
  const query = search.trim().toLowerCase()
  if (!query) return true
  return fields.some((field) => !!field && field.toLowerCase().includes(query))
}

/** A parchment lot's source lot, farmer or supplier, and variety. */
export const parchmentLotFacts = (
  p: ParchmentLot,
  harvest: HarvestLot | undefined,
) => ({
  sourceLot: harvest
    ? formatHarvestLotId(harvest)
    : p.externalSource
      ? `External ${p.externalSource.code}`.trim()
      : '',
  farmer:
    harvest?.farmerName ??
    p.externalSource?.supplierName ??
    p.externalSource?.origin ??
    '',
  variety: harvest?.cherryVariety ?? p.externalSource?.variety ?? '',
})

/** A green bean lot's source lot, farmer or supplier, variety and process. */
export const greenBeanLotFacts = (
  g: GreenBeanLot,
  parchment: ParchmentLot | undefined,
  harvest: HarvestLot | undefined,
) => ({
  sourceLot: parchment
    ? formatParchmentId(parchment)
    : g.sourceType === 'External'
      ? 'External'
      : '',
  farmer:
    harvest?.farmerName ??
    g.externalSource?.producerName ??
    g.externalSource?.originName ??
    parchment?.externalSource?.supplierName ??
    '',
  variety:
    g.externalSource?.variety ??
    harvest?.cherryVariety ??
    parchment?.externalSource?.variety ??
    '',
  process: parchment?.processType ?? g.externalSource?.processType ?? '',
})

/** Cherry lot search: lot id, farmer, farm, variety and plot. */
export const harvestLotSearchFields = (lot: HarvestLot): Text[] => [
  formatHarvestLotId(lot),
  lot.farmerName,
  lot.farm?.farmName ?? lot.farm?.name,
  lot.cherryVariety,
  lot.farmPlotLocation,
]

/**
 * Parchment lot search: lot id, batch id, source cherry lot, farmer or
 * supplier, variety, process and status.
 */
export const parchmentSearchFields = (
  p: ParchmentLot,
  harvest: HarvestLot | undefined,
  batch: ProcessingBatch | undefined,
): Text[] => {
  const facts = parchmentLotFacts(p, harvest)
  return [
    formatParchmentId(p),
    p.processingBatchId
      ? formatProcessingBatchId(batch ?? { id: p.processingBatchId })
      : '',
    facts.sourceLot,
    facts.farmer,
    facts.variety,
    p.processType,
    p.status,
    formatParchmentStatus(p.status),
  ]
}

/**
 * Green bean lot search: lot id, source parchment and cherry lot, farmer or
 * supplier, variety, process and grade.
 */
export const greenBeanSearchFields = (
  g: GreenBeanLot,
  parchment: ParchmentLot | undefined,
  harvest: HarvestLot | undefined,
): Text[] => {
  const facts = greenBeanLotFacts(g, parchment, harvest)
  return [
    formatGreenBeanId(g),
    facts.sourceLot,
    harvest ? formatHarvestLotId(harvest) : '',
    facts.farmer,
    facts.variety,
    facts.process,
    g.parchmentProcessType,
    g.grade,
  ]
}
