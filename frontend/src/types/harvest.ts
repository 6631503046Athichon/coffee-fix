export interface HarvestLotFarmSummary {
  id: string;
  farmName?: string;
  name?: string;
  location?: string;
}

export interface HarvestLot {
  id: string;
  displayId?: string;
  farmId?: string;
  farm?: HarvestLotFarmSummary;
  farmerName: string;
  cherryVariety: string;
  weightKg: number;
  /** Compatibility field only. Use weightKg for cherry input; never subtract parchment output. */
  remainingWeightKg?: number;
  farmPlotLocation: string;
  harvestDate: string;
  status: "Ready for Processing" | "Complete";
  cropYearId?: string;
  /** The lot's owner (its farm's owner when it was recorded). Older lots have none: their farm's owner counts. */
  createdById?: string;
  createdAt?: string;
  updatedAt?: string;
}
