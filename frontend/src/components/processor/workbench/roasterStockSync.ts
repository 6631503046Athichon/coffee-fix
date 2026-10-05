// The app data after a green bean withdrawal saved from the workbench.
//
// A withdrawal with a target roaster (Roast) fills that roaster's stock row,
// and the backend answers with the bare RoasterInventoryItem row: no nested
// greenBeanLot. The roaster's stock cards read grade, score, variety, process
// and the GBL id from the stored inventory row itself (transformInventoryItem
// fills them from bulk-load's nested lot), so storing the bare row showed
// "GRADE —" until the next refresh, even on a card that had its grade
// before. The row is stored here with those fields filled from the lot the
// app already holds.

import type { AppData, GreenBeanLot, RoasterInventoryItem } from '../../../types'

// The withdrawal type as the backend stores it (transformInventoryItem keeps
// the raw value, e.g. "RoastingStock").
const WITHDRAWAL_TYPE_TO_API: Record<string, string> = {
  'Roasting Stock': 'RoastingStock',
}

/**
 * The roaster stock row with what the roaster screens read about its lot:
 * from the lot, its parchment and cherry lot in `prev`, else from the row
 * as already stored.
 */
export const enrichRoasterInventoryItem = (
  prev: AppData,
  item: RoasterInventoryItem,
  withdrawalType?: string,
): RoasterInventoryItem => {
  const stored = prev.roasterInventory.find((inv) => inv.id === item.id)
  const lot = prev.greenBeanLots.find((g) => g.id === item.greenBeanLotId)
  const parchment = lot?.parchmentLotId
    ? prev.parchmentLots.find((p) => p.id === lot.parchmentLotId)
    : undefined
  const harvest = parchment?.harvestLotId
    ? prev.harvestLots.find((h) => h.id === parchment.harvestLotId)
    : undefined
  return {
    ...stored,
    ...item,
    createdAt: item.createdAt ?? stored?.createdAt,
    greenBeanDisplayId: lot?.displayId ?? stored?.greenBeanDisplayId,
    grade: lot?.grade || stored?.grade,
    processorScore: lot?.processorScore ?? stored?.processorScore,
    variety: harvest?.cherryVariety || stored?.variety,
    process: parchment?.processType || lot?.parchmentProcessType || stored?.process,
    withdrawalType: withdrawalType
      ? (WITHDRAWAL_TYPE_TO_API[withdrawalType] ?? withdrawalType)
      : stored?.withdrawalType,
  }
}

/**
 * Merge a saved withdrawal into the app data: the lot's kg, status and
 * history as the backend returned them, and the roaster stock row it filled
 * (added, or updated in place) with its lot's details.
 */
export const applyGreenBeanWithdrawal = (
  prev: AppData,
  savedLot: GreenBeanLot,
  roasterInventoryItem: RoasterInventoryItem | undefined | null,
  withdrawalType?: string,
): AppData => {
  const greenBeanLots = prev.greenBeanLots.map((g) =>
    g.id === savedLot.id
      ? {
          ...g,
          currentWeightKg: savedLot.currentWeightKg,
          availabilityStatus: savedLot.availabilityStatus,
          withdrawalHistory: savedLot.withdrawalHistory,
        }
      : g,
  )
  if (!roasterInventoryItem) return { ...prev, greenBeanLots }

  const item = enrichRoasterInventoryItem(prev, roasterInventoryItem, withdrawalType)
  const exists = prev.roasterInventory.some((inv) => inv.id === item.id)
  return {
    ...prev,
    greenBeanLots,
    roasterInventory: exists
      ? prev.roasterInventory.map((inv) => (inv.id === item.id ? item : inv))
      : [...prev.roasterInventory, item],
  }
}
