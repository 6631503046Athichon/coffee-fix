export enum ProcessingBatchStatus {
  ToProcess = "To Process",
  Drying = "Drying",
  Completed = "Completed",
}

export interface DryingLogEntry {
  date: string;
  moistureContent: number;
  ambientTemp: number;
  relativeHumidity: number;
}

export interface ProcessingBatch {
  id: string;
  displayId?: string;
  harvestLotId: string;
  /** Who recorded it. Only they, or an Admin, may edit or delete it (and its parchment). */
  createdById?: string;
  status: ProcessingBatchStatus;
  processType: string;
  /** Optional special instructions/notes for the chosen process, e.g., "ferment 24h" */
  processNotes?: string;
  cropYearId?: string; // Link to crop year
  parchmentWeightKg?: number;
  moistureContent?: number;
  baggingDate?: string;
  dryingStartDate?: string;
  dryingEndDate?: string;
  dryingLog?: DryingLogEntry[];
  createdAt?: string;
}
