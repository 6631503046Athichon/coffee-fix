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
  roasterId: string;
  roasterInventoryId: string;
  greenBeanLotId: string;
  roastDate: string;
  batchSizeKg: number;
  yieldPercentage: number;
  roastedWeightKg?: number;
  weightLossPct?: number;
  roastLevel?: RoastLevel; // Optional for backward compatibility
  roastProfileNotes: string;
  flavorNotes?: string;
}
