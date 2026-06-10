export interface PhysicalTestResults {
  sampleWeightGrams: number;
  greenBeanWeightGrams: number;
  greenBeanMoisture: number;
  waterActivity: number;
  density: number;
  defectCount: number;
  notes?: string;
}

export interface ParchmentWithdrawalRecord {
  id: string;
  amountKg: number;
  withdrawalType: "Sale" | "RoastingStock" | "HullAndGrade" | "Sample" | "Export" | "Other";
  purpose: string;
  notes?: string;
  date: string;
  withdrawnBy?: string;
  withdrawnByName?: string;
  salePrice?: number;
  currency?: string;
  customerName?: string;
  deliveryAddress?: string;
  totalAmount?: number;
  targetRoasterId?: string;
  roastProfileNotes?: string;
  cuppingScore?: number;
}

export enum ParchmentSourceType {
  Internal = "Internal",
  External = "External",
}

export interface ParchmentExternalSource {
  code: string;
  variety: string;
  origin: string;
  supplierName?: string;
  importDate: string;
  importedBy: string;
  fileName: string;
}

export interface ParchmentLot {
  id: string;
  displayId?: string;
  processingBatchId?: string;
  harvestLotId?: string;
  sourceType: ParchmentSourceType;
  externalSource?: ParchmentExternalSource;
  initialWeightKg: number;
  currentWeightKg: number;
  moistureContent: number;
  processType: string;
  status: "AwaitingHulling" | "Hulled";
  physicalTestResults?: PhysicalTestResults;
  withdrawalHistory?: ParchmentWithdrawalRecord[];
  createdAt?: string;
}
