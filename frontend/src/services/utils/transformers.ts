/**
 * Utility functions for transforming data between backend and frontend formats
 */

// Farm transformations
export const transformFarmFromBackend = (farm: any) => ({
  id: farm.id,
  name: farm.farmName || undefined,
  location: farm.location,
  farmerName: farm.owner?.name || '',
  ownerName: farm.owner?.name || undefined,
  latitude: farm.latitude || undefined,
  longitude: farm.longitude || undefined,
  altitudeMeters: farm.altitude || undefined,
  sizeHectares: farm.sizeHectares || undefined,
  varieties: farm.varieties || [],
  caretakerName: farm.caretakerName || undefined,
  createdAt: farm.createdAt,
  updatedAt: farm.updatedAt,
  archived: farm.archived || false,
  archivedAt: farm.archivedAt || undefined,
  ownerUserId: farm.ownerId,
});

export const transformFarmToBackend = (farmData: any) => ({
  farmName: farmData.name || '',
  location: farmData.location || '',
  latitude: farmData.latitude?.toString() || null,
  longitude: farmData.longitude?.toString() || null,
  altitude: farmData.altitudeMeters?.toString() || null,
  sizeHectares: farmData.sizeHectares?.toString() || null,
  varieties: farmData.varieties || [],
  caretakerName: farmData.caretakerName || null,
  archived: farmData.archived || false,
});

// Soil Analysis transformations
export const transformSoilAnalysisFromBackend = (analysis: any) => ({
  id: analysis.id,
  farmId: analysis.farmId,
  farmPlotLocation: analysis.farmPlotLocation,
  testDate: analysis.testDate,
  labName: analysis.labName || undefined,
  certificateNumber: analysis.certificateNumber || undefined,
  pH: analysis.pH,
  phosphorus: analysis.phosphorus,
  potassium: analysis.potassium,
  nitrogen: analysis.nitrogen,
  calcium: analysis.calcium,
  magnesium: analysis.magnesium,
  organicMatter: analysis.organicMatter || undefined,
  sulfur: analysis.sulfur || undefined,
  zinc: analysis.zinc || undefined,
  iron: analysis.iron || undefined,
  manganese: analysis.manganese || undefined,
  copper: analysis.copper || undefined,
  boron: analysis.boron || undefined,
  notes: analysis.notes || undefined,
  recommendations: analysis.recommendations || undefined,
  attachmentUrl: analysis.attachmentUrl || undefined,
  createdAt: analysis.createdAt,
  updatedAt: analysis.updatedAt,
});

export const transformSoilAnalysisToBackend = (analysisData: any) => ({
  farmId: analysisData.farmId,
  farmPlotLocation: analysisData.farmPlotLocation || '',
  testDate: analysisData.testDate,
  labName: analysisData.labName || null,
  certificateNumber: analysisData.certificateNumber || null,
  pH: analysisData.pH?.toString() || '0',
  phosphorus: analysisData.phosphorus?.toString() || '0',
  potassium: analysisData.potassium?.toString() || '0',
  nitrogen: analysisData.nitrogen?.toString() || '0',
  calcium: analysisData.calcium?.toString() || '0',
  magnesium: analysisData.magnesium?.toString() || '0',
  organicMatter: analysisData.organicMatter?.toString() || null,
  sulfur: analysisData.sulfur?.toString() || null,
  zinc: analysisData.zinc?.toString() || null,
  iron: analysisData.iron?.toString() || null,
  manganese: analysisData.manganese?.toString() || null,
  copper: analysisData.copper?.toString() || null,
  boron: analysisData.boron?.toString() || null,
  notes: analysisData.notes || null,
  recommendations: analysisData.recommendations || null,
  attachmentUrl: analysisData.attachmentUrl || null,
});

// Weather Record transformations
export const transformWeatherRecordFromBackend = (record: any) => ({
  id: record.id,
  farmId: record.farmId,
  farmPlotLocation: record.farmPlotLocation,
  recordDate: record.recordDate,
  temperatureMin: record.temperatureMin,
  temperatureMax: record.temperatureMax,
  temperatureAvg: record.temperatureAvg,
  rainfall: record.rainfall,
  humidity: record.humidity,
  source: record.source || 'Manual',
  notes: record.notes || undefined,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export const transformWeatherRecordToBackend = (recordData: any) => ({
  farmId: recordData.farmId,
  farmPlotLocation: recordData.farmPlotLocation || '',
  recordDate: recordData.recordDate,
  temperatureMin: recordData.temperatureMin?.toString() || '0',
  temperatureMax: recordData.temperatureMax?.toString() || '0',
  temperatureAvg: recordData.temperatureAvg?.toString() || '0',
  rainfall: recordData.rainfall?.toString() || '0',
  humidity: recordData.humidity?.toString() || '0',
  source: recordData.source || 'Manual',
  notes: recordData.notes || null,
});

// GAP Log transformations
export const transformGAPLogFromBackend = (log: any) => ({
  id: log.id,
  farmId: log.farmId || undefined,
  farmPlotLocation: log.farmPlotLocation,
  activityType: log.activityTypeName || log.activityType?.name || '',
  date: log.date,
  productUsed: log.productUsed,
  quantity: log.quantity,
  notes: log.notes || undefined,
  createdAt: log.createdAt,
  updatedAt: log.updatedAt,
});

// Harvest Lot transformations
const HARVEST_STATUS_MAP = {
  ReadyForProcessing: 'Ready for Processing',
  Processing: 'Processing',
} as const;

const HARVEST_STATUS_REVERSE_MAP = {
  'Ready for Processing': 'ReadyForProcessing',
  'Processing': 'Processing',
} as const;

export const transformHarvestLotFromBackend = (lot: any) => ({
  id: lot.id,
  farmId: lot.farmId || undefined,
  farmerName: lot.farmerName,
  cherryVariety: lot.cherryVariety,
  weightKg: lot.weightKg,
  farmPlotLocation: lot.farmPlotLocation,
  harvestDate: lot.harvestDate,
  status: (HARVEST_STATUS_MAP[lot.status as keyof typeof HARVEST_STATUS_MAP] || lot.status) as 'Ready for Processing' | 'Processing',
  cropYearId: lot.cropYearId || undefined,
  createdAt: lot.createdAt,
  updatedAt: lot.updatedAt,
});

export const transformHarvestLotToBackend = (lotData: any) => ({
  farmerName: lotData.farmerName || '',
  cherryVariety: lotData.cherryVariety || '',
  weightKg: lotData.weightKg?.toString() || '0',
  farmPlotLocation: lotData.farmPlotLocation || '',
  harvestDate: lotData.harvestDate,
  status: (HARVEST_STATUS_REVERSE_MAP[lotData.status as keyof typeof HARVEST_STATUS_REVERSE_MAP] || lotData.status) || 'ReadyForProcessing',
  cropYearId: (lotData.cropYearId && lotData.cropYearId.trim() !== '') ? lotData.cropYearId : null,
  farmId: lotData.farmId || null,
});

