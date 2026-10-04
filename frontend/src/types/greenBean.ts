export enum GreenBeanSourceType {
  Internal = "Internal",
  External = "External",
}

/** One withdrawal from a green-bean lot, as the backend lists it (newest first). */
export interface GreenBeanWithdrawalRecord {
  /** The backend row id, which Void and Edit need. Older fixtures leave it out. */
  id?: string;
  amountKg: number;
  withdrawalType: "Sale" | "Roasting Stock" | "Sample" | "Export" | "Other";
  // Legacy field / additional description. Withheld with the sale (see
  // saleDetailsHidden) on someone else's lot: it can name the customer.
  purpose?: string;
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
  /** The roaster whose stock a Roasting Stock withdrawal filled. Owner and Admin only. */
  targetRoasterId?: string | null;
  /** ISO timestamp the row was recorded at (a void checks an older push against it). */
  createdAt?: string;
  // Set by the backend when the viewer does not own the lot: the sale
  // columns above were withheld, so there is no invoice to show.
  saleDetailsHidden?: boolean;
  /**
   * When the withdrawal was voided (D7): its kg went back to the lot and it
   * no longer counts, but the row stays in the history. Everyone sees it.
   */
  voidedAt?: string | null;
  /** Who voided it. */
  voidedById?: string | null;
  /** Why, as typed. Withheld with the sale on someone else's lot. */
  voidReason?: string | null;
}

export interface GreenBeanLot {
  id: string;
  displayId?: string;
  sourceType: GreenBeanSourceType;
  parchmentLotId?: string;
  /** Who created the lot. Only they, or an Admin, may withdraw from it or price it. */
  createdById?: string;
  /** Process type of the parchment lot it was hulled from, as bulk-load nests it. */
  parchmentProcessType?: string;
  /**
   * The Hull & Grade (parchment withdrawal) that made the lot. Recorded since
   * prisma/sql/005; voiding that Hull & Grade deletes the lot.
   */
  parchmentWithdrawalId?: string;
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
  withdrawalHistory?: GreenBeanWithdrawalRecord[];
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
