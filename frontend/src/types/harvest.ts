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
  remainingWeightKg?: number;
  farmPlotLocation: string;
  harvestDate: string;
  status: "Ready for Processing" | "Complete";
  cropYearId?: string;
  createdAt?: string;
  updatedAt?: string;
}
