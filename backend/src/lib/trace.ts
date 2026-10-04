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
//   - processingBatch.processNotes: the processor's internal free-text notes
// externalSource is a JSON column, so it is read whole and trimmed to the
// keys the page shows in serializePublicTrace below.
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

/**
 * The keys of a bought-in lot's externalSource the public page shows. The
 * rest is the buyer's own record: the price paid and its currency, supplier
 * notes and names, certificate numbers. Listed rather than stripped, so a key
 * added to the form later stays private until it is added here on purpose.
 */
export const PUBLIC_EXTERNAL_SOURCE_KEYS = [
  'originName',
  'producerName',
  'variety',
  'processType',
  'purchaseDate',
  'tasteNote',
] as const

/** externalSource with only the public keys, or null when it is not an object. */
export function publicExternalSource(source: Prisma.JsonValue | null): Prisma.JsonObject | null {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null
  const all = source as Prisma.JsonObject
  const shown: Prisma.JsonObject = {}
  for (const key of PUBLIC_EXTERNAL_SOURCE_KEYS) {
    if (all[key] !== undefined) shown[key] = all[key]
  }
  return shown
}

// traceId is the lot's public id, or null for a lot that has not been
// published yet (only the staff preview can return null).
export function serializePublicTrace(lot: PublicTraceLot, traceId: string | null) {
  return {
    lot: {
      id: lot.id,
      grade: lot.grade,
      sourceType: lot.sourceType,
      externalSource: publicExternalSource(lot.externalSource),
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
