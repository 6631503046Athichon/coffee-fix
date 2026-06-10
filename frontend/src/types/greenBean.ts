export enum GreenBeanSourceType {
  Internal = "Internal",
  External = "External",
}

export interface GreenBeanLot {
  id: string;
  displayId?: string;
  sourceType: GreenBeanSourceType;
  parchmentLotId?: string;
  /** External source details when sourceType is External */
  externalSource?: {
    originName: string; // Producer/Farm or Supplier
    variety: string; // Declared variety
    processType: string; // Washed/Natural/Honey...
    purchaseDate: string; // ISO date
    pricePerKg: number;
    currency: string; // e.g., THB, USD
    supplierNotes?: string;
    producerName?: string; // Optional: producer name if different from origin/supplier
    score?: number; // Optional: declared score at purchase time
    tasteNote?: string; // Optional: declared taste note at purchase time
  };
  grade: string;
  initialWeightKg: number;
  currentWeightKg: number;
  availabilityStatus: "Available" | "Withdrawn";
  cuppingScores: { sessionId: string; score: number }[];
  processorScore?: number; // Score assigned by processor during hulling and grading
  cuppingFragrance?: number;
  cuppingFlavor?: number;
  cuppingAftertaste?: number;
  cuppingAcidity?: number;
  cuppingBody?: number;
  cuppingBalance?: number;
  cuppingOverall?: number;
  cuppingUniformity?: number;
  cuppingCleanCup?: number;
  cuppingSweetness?: number;
  withdrawalHistory?: {
    amountKg: number;
    withdrawalType: "Sale" | "Roasting Stock" | "Sample" | "Export" | "Other";
    purpose: string; // Legacy field / additional description
    notes?: string; // Admin-editable notes
    date: string;
    withdrawnBy?: string; // User ID who performed withdrawal
    withdrawnByName?: string; // User name for display
    salePrice?: number; // Only for Sale type
    currency?: string; // Only for Sale type (e.g., 'THB', 'USD')
    customerName?: string; // Only for Sale type
    invoiceNumber?: string; // Auto-generated for Sale type (e.g., "INV-2025-001")
    deliveryAddress?: string; // Optional delivery address for Sale type
    totalAmount?: number; // Calculated: amountKg * salePrice
  }[];
  pricePerKg?: number;
  currency?: string;
  priceSetDate?: string;
  priceSetBy?: string;
  // QR Code & Traceability
  publicTraceId?: string;
  qrGeneratedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PricingHistory {
  id: string;
  greenBeanLotId: string;
  pricePerKg: number;
  currency: string;
  effectiveDate: string;
  setBy: string;
  notes?: string;
}
