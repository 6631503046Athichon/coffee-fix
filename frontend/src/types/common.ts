import type { User } from './user';
import type { Farm } from './farm';
import type { HarvestLot } from './harvest';
import type { ProcessingBatch } from './processing';
import type { ParchmentLot } from './parchment';
import type { GreenBeanLot, PricingHistory } from './greenBean';
import type { CuppingSession } from './cupping';
import type { GAPLogEntry, ActivityType } from './gap';
import type { ProcessType, CropYear } from './reference';
import type { SoilAnalysis } from './soil';
import type { RoasterInventoryItem, RoastBatch } from './roaster';
import type { WeatherRecord } from './weather';
import type { Customer, SaleOrder, Invoice } from './sales';

export interface PlatformInsight {
  topPerformingVariety: { variety: string; avgScore: number };
  topPerformingProcess: { process: string; avgScore: number };
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
