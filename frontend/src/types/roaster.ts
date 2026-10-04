export enum RoastLevel {
  Light = "Light",
  Medium = "Medium",
  Dark = "Dark",
}

export interface RoasterInventoryItem {
  id: string;
  roasterId: string;
  greenBeanLotId: string;
  claimedWeightKg: number;
  remainingWeightKg: number;
  /** ISO timestamp the stock row was started at. */
  createdAt?: string;
  // Enriched from nested greenBeanLot (populated by transformInventoryItem)
  greenBeanDisplayId?: string;
  grade?: string;
  processorScore?: number;
  variety?: string;
  process?: string;
  withdrawalType?: string;
}

export interface RoastBatch {
  id: string;
  displayId?: string;
  roasterId: string;
  roasterInventoryId: string;
  greenBeanLotId: string;
  roastDate: string;
  batchSizeKg: number;
  yieldPercentage: number;
  roastedWeightKg?: number;
  /** Roasted kg on sales that are not cancelled; roastedWeightKg - soldWeightKg is left to sell. */
  soldWeightKg?: number;
  weightLossPct?: number;
  roastLevel?: RoastLevel; // Optional for backward compatibility
  roastProfileNotes: string;
  flavorNotes?: string;
  /** ISO timestamp of the last change; sent back when editing so a stale form is refused. */
  updatedAt?: string;
}
