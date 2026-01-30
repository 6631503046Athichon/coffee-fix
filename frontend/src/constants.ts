import { AppData } from "./types";

export const MOCK_DATA: AppData = {
  users: [],
  farms: [],
  harvestLots: [],
  processingBatches: [],
  parchmentLots: [],
  greenBeanLots: [],
  cuppingSessions: [],
  gapLogs: [],
  activityTypes: [
    {
      id: "AT001",
      name: "Fertilizer",
      description: "Application of fertilizers and nutrients",
      createdDate: "2025-01-01",
      isActive: true,
    },
    {
      id: "AT002",
      name: "Pest Management",
      description: "Pest control and management activities",
      createdDate: "2025-01-01",
      isActive: true,
    },
    {
      id: "AT003",
      name: "Water Management",
      description: "Irrigation and water management",
      createdDate: "2025-01-01",
      isActive: true,
    },
    {
      id: "AT004",
      name: "Pruning",
      description: "Tree pruning and maintenance",
      createdDate: "2025-01-01",
      isActive: true,
    },
    {
      id: "AT005",
      name: "Soil Management",
      description: "Soil preparation and management",
      createdDate: "2025-01-01",
      isActive: true,
    },
  ],
  processTypes: [
    {
      id: "PT001",
      name: "Washed",
      description:
        "Washed process - cherries are pulped and fermented to remove mucilage before drying",
      colorScheme: {
        borderColor: "border-l-blue-500",
        iconBg: "bg-blue-100",
        iconColor: "text-blue-600",
        badgeColor: "bg-blue-100 text-blue-700 border-blue-200",
      },
      createdDate: "2025-01-01",
      isActive: true,
    },
    {
      id: "PT002",
      name: "Natural",
      description:
        "Natural process - cherries are dried whole with the fruit intact",
      colorScheme: {
        borderColor: "border-l-amber-500",
        iconBg: "bg-amber-100",
        iconColor: "text-amber-600",
        badgeColor: "bg-amber-100 text-amber-700 border-amber-200",
      },
      createdDate: "2025-01-01",
      isActive: true,
    },
    {
      id: "PT003",
      name: "Honey",
      description:
        "Honey process - cherries are pulped but some or all mucilage is left on during drying",
      colorScheme: {
        borderColor: "border-l-yellow-500",
        iconBg: "bg-yellow-100",
        iconColor: "text-yellow-600",
        badgeColor: "bg-yellow-100 text-yellow-700 border-yellow-200",
      },
      createdDate: "2025-01-01",
      isActive: true,
    },
  ],
  soilAnalyses: [],
  roasterInventory: [],
  roastBatches: [],
  cropYears: [
    {
      id: "CY2024",
      year: "2024/2025",
      startDate: "2024-10-01",
      endDate: "2025-09-30",
      description: "Current crop year",
    },
    {
      id: "CY2023",
      year: "2023/2024",
      startDate: "2023-10-01",
      endDate: "2024-09-30",
      description: "Previous crop year",
    },
    {
      id: "CY2025",
      year: "2025/2026",
      startDate: "2025-10-01",
      endDate: "2026-09-30",
      description: "Next crop year",
    },
  ],
  weatherRecords: [],
  pricingHistory: [],
  customers: [],
  saleOrders: [],
  invoices: [],
};
