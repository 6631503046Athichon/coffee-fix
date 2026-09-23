import { Prisma } from '@prisma/client'

// The traceability story of one green bean lot, as the public page shows it.
// Shared by the public trace/[publicId] route and the staff-only
// green-bean-lots/[id]/trace-preview route, so a preview shows exactly what
// customers will see once the lot is published.
//
// SECURITY: the public route serves this without auth. Never add sensitive
// fields here — they would never be read out of the DB in the first place:
//   - currentWeightKg / availabilityStatus: business inventory data
//   - farmerName / farm.ownerNames: PII
export const publicTraceSelect = {
  id: true,
  grade: true,
  sourceType: true,
  externalSource: true,
  cuppingFragrance: true,
  cuppingFlavor: true,
  cuppingAftertaste: true,
  cuppingAcidity: true,
  cuppingBody: true,
  cuppingBalance: true,
  cuppingOverall: true,
  cuppingUniformity: true,
  cuppingCleanCup: true,
  cuppingSweetness: true,
  parchmentLot: {
    select: {
      id: true,
      processType: true,
      moistureContent: true,
      createdAt: true,
      processingBatch: {
        select: {
          id: true,
          processType: true,
          processNotes: true,
          baggingDate: true,
          dryingStartDate: true,
          dryingEndDate: true,
          harvestLot: {
            select: {
              id: true,
              cherryVariety: true,
              harvestDate: true,
              farm: {
                select: {
                  id: true,
                  farmName: true,
                  location: true,
                  altitude: true,
                  varieties: true,
                  googleMapsUrl: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
          },
          // Listed column by column so a new DryingLogEntry column never
          // becomes public on its own.
          dryingLogs: {
            select: {
              id: true,
              processingBatchId: true,
              date: true,
              moistureContent: true,
              ambientTemp: true,
              relativeHumidity: true,
              createdAt: true,
            },
            orderBy: { date: 'asc' },
          },
        },
      },
      harvestLot: {
        select: {
          id: true,
          cherryVariety: true,
          harvestDate: true,
          farmPlotLocation: true,
        },
      },
    },
  },
  roastBatches: {
    select: {
      id: true,
      roastDate: true,
      roastLevel: true,
      roastProfileNotes: true,
      flavorNotes: true,
      batchSizeKg: true,
      yieldPercentage: true,
      roaster: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { roastDate: 'desc' },
  },
} satisfies Prisma.GreenBeanLotSelect

export type PublicTraceLot = Prisma.GreenBeanLotGetPayload<{ select: typeof publicTraceSelect }>

// traceId is the lot's public id, or null for a lot that has not been
// published yet (only the staff preview can return null).
export function serializePublicTrace(lot: PublicTraceLot, traceId: string | null) {
  return {
    lot: {
      id: lot.id,
      grade: lot.grade,
      sourceType: lot.sourceType,
      externalSource: lot.externalSource,
      cuppingFragrance: lot.cuppingFragrance,
      cuppingFlavor: lot.cuppingFlavor,
      cuppingAftertaste: lot.cuppingAftertaste,
      cuppingAcidity: lot.cuppingAcidity,
      cuppingBody: lot.cuppingBody,
      cuppingBalance: lot.cuppingBalance,
      cuppingOverall: lot.cuppingOverall,
      cuppingUniformity: lot.cuppingUniformity,
      cuppingCleanCup: lot.cuppingCleanCup,
      cuppingSweetness: lot.cuppingSweetness,
      parchmentLot: lot.parchmentLot,
      roastBatches: lot.roastBatches,
    },
    traceId,
  }
}
