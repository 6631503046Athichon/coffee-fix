

export enum UserRole {
  Farmer = 'Farmer',
  Processor = 'Processor',
  Roaster = 'Roaster',
  HeadJudge = 'Head Judge',
  Cupper = 'Cupper',
  Admin = 'Admin',
}

export enum ProcessingBatchStatus {
  ToProcess = 'To Process',
  Drying = 'Drying',
  Completed = 'Completed',
}

// Deprecated: Use ActivityType interface instead
// Kept for backward compatibility
export enum GAPActivityType {
  Fertilizer = 'Fertilizer',
  PestManagement = 'Pest Management',
  WaterManagement = 'Water Management',
}

export interface ActivityType {
  id: string;
  name: string;
  description?: string;
  createdDate: string;
  isActive: boolean;
}

export interface ProcessType {
  id: string;
  name: string; // e.g., "Washed", "Natural", "Honey"
  description?: string;
  colorScheme: {
    borderColor: string; // e.g., "border-l-blue-500"
    iconBg: string; // e.g., "bg-blue-100"
    iconColor: string; // e.g., "text-blue-600"
    badgeColor: string; // e.g., "bg-blue-100 text-blue-700 border-blue-200"
  };
  createdDate: string;
  isActive: boolean;
}

export interface Farm {
  id: string;
  farmerName: string;
  location: string;
  latitude?: number;
  longitude?: number;
  /** Optional: the owner user id (farmer) who owns this farm */
  ownerUserId?: string;
}

export interface FarmRequest {
  id: string;
  farmName: string;
  location: string;
  altitude?: string;
  size?: string;
  latitude?: number; // GPS latitude coordinate
  longitude?: number; // GPS longitude coordinate
  ownerName: string; // Farmer who requested
  requesterId: string; // User ID of the farmer
  requestDate: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reason: string; // Why farmer is requesting this farm
  adminNotes?: string; // Admin comments during review
  reviewDate?: string;
  reviewedBy?: string; // Admin who reviewed
}

export interface HarvestLot {
  id: string;
  farmerName: string;
  cherryVariety: string;
  weightKg: number;
  farmPlotLocation: string;
  harvestDate: string;
  status: 'Ready for Processing' | 'Processing';
  cropYearId?: string;
}

export interface DryingLogEntry {
  date: string;
  moistureContent: number;
  ambientTemp: number;
  relativeHumidity: number;
}

export interface ProcessingBatch {
  id: string;
  harvestLotId: string;
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
}

export interface PhysicalTestResults {
    sampleWeightGrams: number;
    greenBeanWeightGrams: number;
    greenBeanMoisture: number;
    waterActivity: number;
    density: number;
    defectCount: number;
    notes?: string;
}

export interface ParchmentLot {
    id: string;
    processingBatchId: string;
    harvestLotId: string;
    initialWeightKg: number;
    currentWeightKg: number;
    moistureContent: number;
    processType: string;
    status: 'Awaiting Hulling' | 'Hulled';
    physicalTestResults?: PhysicalTestResults;
}

export enum GreenBeanSourceType {
    Internal = 'Internal',
    External = 'External'
}

export interface GreenBeanLot {
    id:string;
    sourceType: GreenBeanSourceType;
    parchmentLotId?: string;
  /** External source details when sourceType is External */
  externalSource?: {
    originName: string;      // Producer/Farm or Supplier
    variety: string;         // Declared variety
    processType: string;     // Washed/Natural/Honey...
    purchaseDate: string;    // ISO date
    pricePerKg: number;
    currency: string;        // e.g., THB, USD
    supplierNotes?: string;
    producerName?: string;   // Optional: producer name if different from origin/supplier
    score?: number;          // Optional: declared score at purchase time
    tasteNote?: string;      // Optional: declared taste note at purchase time
  };
    grade: string;
    initialWeightKg: number;
    currentWeightKg: number;
    availabilityStatus: 'Available' | 'Withdrawn';
    cuppingScores: { sessionId: string; score: number }[];
    withdrawalHistory?: {
        amountKg: number;
        withdrawalType: 'Sale' | 'Roasting Stock' | 'Sample' | 'Export' | 'Other';
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
}

export enum RoastLevel {
  Light = 'Light',
  Medium = 'Medium',
  Dark = 'Dark',
}

export enum CuppingSessionType {
    QC = 'Standard QC',
    Competition = 'Competition',
}

export interface CuppingSample {
    id: string;
    blindCode: string;
    greenBeanLotId?: string; // Optional for external samples
    submitterInfo: { name: string };
    originInfo: { farm: string };
    lotInfo: { process: string };
}

export interface JudgeScore {
    judgeId: string; // Corresponds to user ID
    judgeName: string;
    scores: { [attribute: string]: number };
    notes: string;
    totalScore: number;
}

export interface CuppingSession {
    id: string;
    name: string;
    date: string;
    type: CuppingSessionType;
    samples: CuppingSample[];
    judges: { id: string, name: string, role: UserRole.Cupper | UserRole.HeadJudge | UserRole.Processor }[];
    scores: { [sampleId: string]: JudgeScore[] };
    status: 'Setup' | 'Scoring' | 'Adjudication' | 'Finalized';
    finalResults?: {
        [sampleId: string]: {
            avgScores: { [attribute: string]: number };
            totalScore: number;
            finalNotes: string;
            rank?: number;
        }
    }
}

export interface User {
  id: string;
  name: string;
  email?: string;
  username?: string;
  roles: UserRole[]; // Changed to support multiple roles
  farmId?: string;
  /** Whether the account is active and can sign in */
  isActive?: boolean; // default true
  isSuperAdmin?: boolean;
  mustChangePassword?: boolean;
  mustChangeUsername?: boolean;
  mustChangeEmail?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
}

export interface GAPLogEntry {
  id: string;
  farmPlotLocation: string;
  activityType: string; // Activity type name (dynamic from ActivityType)
  date: string;
  productUsed: string;
  quantity: string;
  notes?: string;
}

export interface CropYear {
  id: string;
  year: string; // e.g., "2024/2025"
  startDate: string; // ISO date
  endDate: string; // ISO date
  description?: string;
}

export interface WeatherRecord {
  id: string;
  farmId: string;
  farmPlotLocation: string;
  recordDate: string; // ISO date
  temperatureMin: number; // Celsius
  temperatureMax: number; // Celsius
  temperatureAvg: number; // Celsius
  rainfall: number; // mm
  humidity: number; // percentage 0-100
  source: 'Manual' | 'API'; // How data was collected
  notes?: string;
  recordedBy?: string; // User ID
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

export interface Customer {
  id: string;
  name: string;
  type: 'Roaster' | 'Distributor' | 'Retailer' | 'Other';
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  notes?: string;
}

export interface SaleOrderItem {
  id: string;
  greenBeanLotId: string;
  lotGrade: string;
  quantity: number;
  pricePerKg: number;
  subtotal: number;
}

export interface SaleOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  orderDate: string;
  status: 'Draft' | 'Confirmed' | 'Delivered' | 'Cancelled';
  items: SaleOrderItem[];
  totalAmount: number;
  currency: string;
  notes?: string;
  createdBy: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  saleOrderId: string;
  issueDate: string;
  dueDate?: string;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue';
  items: SaleOrderItem[];
  subtotal: number;
  tax?: number;
  totalAmount: number;
  currency: string;
  notes?: string;
}

export interface SoilAnalysis {
  id: string;
  farmId: string;
  farmPlotLocation: string;
  testDate: string;
  labName?: string;
  certificateNumber?: string;

  // Core soil chemistry data (6 main nutrients)
  pH: number;
  phosphorus: number; // P (ppm or mg/kg)
  potassium: number; // K (ppm or mg/kg)
  nitrogen: number; // N (%)
  calcium: number; // Ca (ppm or mg/kg)
  magnesium: number; // Mg (ppm or mg/kg)

  // Optional additional nutrients
  organicMatter?: number; // OM (%)
  sulfur?: number; // S (ppm)
  zinc?: number; // Zn (ppm)
  iron?: number; // Fe (ppm)
  manganese?: number; // Mn (ppm)
  copper?: number; // Cu (ppm)
  boron?: number; // B (ppm)

  // Metadata
  notes?: string;
  recommendations?: string;
  createdBy: string;
  createdByRole: UserRole;
  attachmentUrl?: string;
}

export interface RoasterInventoryItem {
  id: string;
  roasterId: string;
  greenBeanLotId: string;
  claimedWeightKg: number;
  remainingWeightKg: number;
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

export interface PlatformInsight {
  topPerformingVariety: { variety: string; avgScore: number; };
  topPerformingProcess: { process: string; avgScore: number; };
  notableCorrelations: string[];
  overallSummary: string;
}

export interface ComprehensiveQualityReport {
    title: string;
    executiveSummary: string;
    topPerformingCoffees: Array<{
        lotId: string;
        variety: string;
        process: string;
        score: number;
        tastingNotes: string;
    }>;
    varietyAnalysis: {
        topVariety: string;
        averageScore: number;
        analysis: string;
    };
    processingAnalysis: {
        topProcess: string;
        averageScore: number;
        analysis: string;
    };
    keyTrends: string[];
    recommendations: {
        forFarmers: string;
        forProcessors: string;
        forRoasters: string;
    };
}

export interface AppData {
  users: User[];
  farms: Farm[];
  farmRequests: FarmRequest[];
  harvestLots: HarvestLot[];
  processingBatches: ProcessingBatch[];
  parchmentLots: ParchmentLot[];
  greenBeanLots: GreenBeanLot[];
  cuppingSessions: CuppingSession[];
  gapLogs: GAPLogEntry[];
  activityTypes: ActivityType[];
  processTypes: ProcessType[];
  soilAnalyses: SoilAnalysis[];
  roasterInventory: RoasterInventoryItem[];
  roastBatches: RoastBatch[];
  cropYears: CropYear[];
  weatherRecords: WeatherRecord[];
  pricingHistory: PricingHistory[];
  customers: Customer[];
  saleOrders: SaleOrder[];
  invoices: Invoice[];
}

// Updated for clarity to match SCA form structure
export const SCA_SENSORY_ATTRIBUTES = [
  'Fragrance/Aroma', 'Flavor', 'Aftertaste', 'Acidity', 'Body', 'Balance', 'Overall'
];

export const SCA_CUP_ATTRIBUTES = [
  'Uniformity', 'Clean Cup', 'Sweetness'
];

// Maintained for backward compatibility with other components
export const SCA_ATTRIBUTES = [
  'Fragrance/Aroma', 'Flavor', 'Aftertaste', 'Acidity', 
  'Body', 'Uniformity', 'Balance', 'Clean Cup', 
  'Sweetness', 'Overall'
];