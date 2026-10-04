import type { Prisma, UserRole } from '@prisma/client'
import prisma from '@/lib/prisma'
import type { AuthenticatedUser } from '@/lib/middleware'
import { isAdminUser } from '@/lib/saleOrders'
import { harvestLotStatusFilter } from '@/lib/harvestLot'

// Who may see and record a farm's soil, weather and GAP data: Admins (super
// admins included), the farm's owner, and its collaborators (the farmhands the
// owner shared the farm with). Editing or deleting the farm itself stays with
// the owner and Admins.

/** Selects what isFarmMember needs: the owner, and this user's collaborator row if there is one. */
export const farmMemberSelect = (userId: string) => ({
  ownerId: true,
  collaborators: { where: { userId }, select: { userId: true } },
}) satisfies Prisma.FarmSelect

export interface FarmMembers {
  ownerId: string
  collaborators?: { userId: string }[]
}

/** The user owns the farm or collaborates on it. */
export function isFarmMember(user: AuthenticatedUser, farm: FarmMembers | null | undefined): boolean {
  if (!farm) return false
  return farm.ownerId === user.id || (farm.collaborators ?? []).some(c => c.userId === user.id)
}

/** An Admin, or a member of the farm. */
export function canUseFarm(user: AuthenticatedUser, farm: FarmMembers | null | undefined): boolean {
  return isAdminUser(user) || isFarmMember(user, farm)
}

/** Throws a 403 (via handleApiError) unless canUseFarm. */
export function requireFarmAccess(user: AuthenticatedUser, farm: FarmMembers | null | undefined): void {
  if (!canUseFarm(user, farm)) {
    throw new Error('Insufficient permissions')
  }
}

/** Ids of the farms the user owns or collaborates on. */
export async function memberFarmIds(user: AuthenticatedUser): Promise<string[]> {
  const farms = await prisma.farm.findMany({
    where: {
      OR: [
        { ownerId: user.id },
        { collaborators: { some: { userId: user.id } } },
      ],
    },
    select: { id: true },
  })
  return farms.map(f => f.id)
}

/**
 * The farmId filter for a list of soil, weather or GAP records.
 * - Admins: the requested farm, or no filter (undefined).
 * - Everyone else: only farms they own or collaborate on, and only the
 *   requested one when they ask for one, so a farm's panel and CSV never mix
 *   in rows from the user's other farms. No farms means no rows.
 * Throws a 403 when the requested farm is not one of theirs.
 */
export async function farmIdFilter(
  user: AuthenticatedUser,
  requestedFarmId: string | null
): Promise<string | { in: string[] } | undefined> {
  if (isAdminUser(user)) return requestedFarmId || undefined

  const farmIds = await memberFarmIds(user)
  if (!requestedFarmId) return { in: farmIds }
  if (!farmIds.includes(requestedFarmId)) {
    throw new Error('Insufficient permissions')
  }
  return requestedFarmId
}

// The lot chain: harvest lot -> processing batch -> parchment lot -> green
// bean lot, and each green lot's price history. Owner decision 2026-10-05,
// "each their own" (ของใครของมัน): only an Admin reads the whole chain.
// - Admin (Admin role or super admin): everything.
// - Farmer: the chain grown on farms they own or collaborate on, and the
//   harvest lots recorded for them (a lot with no farm is its recorder's).
//   Bought-in parchment and green beans come from no farm.
// - Processor: the batches they created, those batches' parchment and cherry
//   lots, the parchment they imported (externalSource.importedBy; other
//   bought-in parchment is Admin-only), and the green-bean lots they created
//   or hulled from their parchment, with those lots' price history. Cherry
//   still Ready for Processing is open to every processor: that is where they
//   pick up work.
// - Roaster: the green-bean lots they created (bought in), hold stock of or
//   roasted, and the shelf: Internal lots still Available with kg left.
//   Another user's bought-in (External) lot is never on it and cannot be
//   claimed. Parchment and cherry lots only as the source of those green
//   lots, to label them; no processing batches. Price history only of the
//   lots they created or hold stock of, not the shelf.
// - HeadJudge and Cupper: every lot, as before (cupping is hands-off).
// - Several roles: the union of each role's scope. No role: nothing.
// Lists filter with these clauses. A by-id read looks the record up through
// the same clause: missing is 404, there but out of scope is 403.
// A lot's withdrawal history follows the same split: every row on a lot the
// user owns or reads as a farmer or processor, but on a lot a roaster reads
// as stock, roast or shelf only the rows that put kg into their own stock
// (targetRoasterId), never another buyer's kg and dates. lib/withdrawalPrivacy
// then strips the sale from the rows of a lot the user does not own.

/** Roles that keep reading every lot (cupping is hands-off). */
const UNSCOPED_ROLES: ReadonlySet<string> = new Set<UserRole>(['HeadJudge', 'Cupper'])

/** A where clause no row matches. */
const NO_ROWS = { id: { in: [] as string[] } }

/** The roasters' shelf: Internal lots still Available with kg left. */
export const roasterShelfWhere = {
  availabilityStatus: 'Available',
  currentWeightKg: { gt: 0 },
  sourceType: 'Internal',
} satisfies Prisma.GreenBeanLotWhereInput

/**
 * Whether `user` may claim kg of `lot` for roaster stock: never another
 * user's bought-in (External) lot, unless an Admin does it.
 */
export function canClaimGreenBeanLot(
  user: AuthenticatedUser,
  lot: { sourceType: string; createdById: string | null }
): boolean {
  return isAdminUser(user) || lot.sourceType !== 'External' || lot.createdById === user.id
}

/** The fields of a processing batch canReadBatch looks at. */
export interface BatchOwnership {
  createdById?: string | null
  harvestLot?: { farmId?: string | null } | null
}

/** What a user chainScope limits may read of the lot chain. */
export interface ChainScope {
  harvestLotWhere: Prisma.HarvestLotWhereInput
  processingBatchWhere: Prisma.ProcessingBatchWhereInput
  parchmentLotWhere: Prisma.ParchmentLotWhereInput
  greenBeanLotWhere: Prisma.GreenBeanLotWhereInput
  pricingWhere: Prisma.PricingHistoryWhereInput
  /** The rows of a green-bean lot's withdrawalHistory the user may read. */
  greenWithdrawalWhere: Prisma.GreenBeanWithdrawalWhereInput
  /** The rows of a parchment lot's withdrawalHistory the user may read. */
  parchmentWithdrawalWhere: Prisma.ParchmentWithdrawalWhereInput
  /** processingBatchWhere's rule on a loaded batch (with its harvestLot.farmId). */
  canReadBatch: (batch: BatchOwnership) => boolean
}

/** A clause matching what any of `clauses` matches; no clauses match nothing. */
function anyOf<W>(clauses: W[]): W {
  const unique = [...new Map(clauses.map(clause => [JSON.stringify(clause), clause])).values()]
  if (unique.length === 0) return NO_ROWS as W
  if (unique.length === 1) return unique[0]
  return { OR: unique } as W
}

/**
 * The lot chain `user` may read, as Prisma where clauses per model, or null
 * when nothing limits them (Admins, super admins, HeadJudges and Cuppers).
 */
export async function chainScope(user: AuthenticatedUser): Promise<ChainScope | null> {
  if (isAdminUser(user) || user.roles.some(role => UNSCOPED_ROLES.has(role))) return null

  const me = user.id
  const harvest: Prisma.HarvestLotWhereInput[] = []
  const batches: Prisma.ProcessingBatchWhereInput[] = []
  const parchment: Prisma.ParchmentLotWhereInput[] = []
  const green: Prisma.GreenBeanLotWhereInput[] = []
  const priced: Prisma.GreenBeanLotWhereInput[] = []
  const greenWithdrawals: Prisma.GreenBeanWithdrawalWhereInput[] = []
  const parchmentWithdrawals: Prisma.ParchmentWithdrawalWhereInput[] = []

  const isFarmer = user.roles.includes('Farmer')
  const isProcessor = user.roles.includes('Processor')
  const farmIds = isFarmer ? await memberFarmIds(user) : []

  if (isFarmer) {
    harvest.push({ farmId: { in: farmIds } }, { createdById: me })
    batches.push(processingBatchesOnFarms(farmIds))
    parchment.push(parchmentLotsOnFarms(farmIds))
    green.push(greenBeanLotsOnFarms(farmIds))
    priced.push(greenBeanLotsOnFarms(farmIds))
    greenWithdrawals.push({ greenBeanLot: greenBeanLotsOnFarms(farmIds) })
    parchmentWithdrawals.push({ parchmentLot: parchmentLotsOnFarms(farmIds) })
  }

  if (isProcessor) {
    harvest.push(
      harvestLotStatusFilter('ReadyForProcessing'),
      { processingBatches: { some: { createdById: me } } },
    )
    batches.push({ createdById: me })
    const ownParchment: Prisma.ParchmentLotWhereInput[] = [
      { processingBatch: { createdById: me } },
      { processingBatchId: null, externalSource: { path: ['importedBy'], equals: me } },
    ]
    parchment.push(...ownParchment)
    const own: Prisma.GreenBeanLotWhereInput[] = [
      { createdById: me },
      { parchmentLot: { processingBatch: { createdById: me } } },
    ]
    green.push(...own)
    priced.push(...own)
    greenWithdrawals.push(...own.map(lot => ({ greenBeanLot: lot })))
    parchmentWithdrawals.push(...ownParchment.map(lot => ({ parchmentLot: lot })))
  }

  if (user.roles.includes('Roaster')) {
    const roasterGreen: Prisma.GreenBeanLotWhereInput[] = [
      { createdById: me },
      { roasterInventory: { some: { roasterId: me } } },
      { roastBatches: { some: { roasterId: me } } },
      roasterShelfWhere,
    ]
    const labelled = anyOf(roasterGreen)
    green.push(...roasterGreen)
    parchment.push({ greenBeanLots: { some: labelled } })
    harvest.push({ parchmentLots: { some: { greenBeanLots: { some: labelled } } } })
    priced.push({ createdById: me }, { roasterInventory: { some: { roasterId: me } } })
    // Every row on a lot they bought in; elsewhere only their own stock's.
    greenWithdrawals.push({ greenBeanLot: { createdById: me } }, { targetRoasterId: me })
    parchmentWithdrawals.push({ targetRoasterId: me })
  }

  return {
    harvestLotWhere: anyOf(harvest),
    processingBatchWhere: anyOf(batches),
    parchmentLotWhere: anyOf(parchment),
    greenBeanLotWhere: anyOf(green),
    pricingWhere: { greenBeanLot: anyOf(priced) },
    greenWithdrawalWhere: anyOf(greenWithdrawals),
    parchmentWithdrawalWhere: anyOf(parchmentWithdrawals),
    canReadBatch: batch =>
      (isProcessor && !!batch.createdById && batch.createdById === me) ||
      (!!batch.harvestLot?.farmId && farmIds.includes(batch.harvestLot.farmId)),
  }
}

/** A processing batch as the by-id routes load it under a lot made from it. */
export interface LabelledBatch {
  id: string
  displayId?: string | null
  processType: string
  harvestLot?: {
    id: string
    displayId?: string | null
    farmerName: string
    cherryVariety: string
    farm?: { id: string; farmName: string; location: string } | null
  } | null
}

/**
 * A processing batch cut down to what labels the lots made from it (process,
 * variety, farm), for a user who reads those lots but not the batch: a
 * roaster opening the source of their green beans.
 */
export function batchLabel(batch: LabelledBatch) {
  const lot = batch.harvestLot
  return {
    id: batch.id,
    displayId: batch.displayId ?? null,
    processType: batch.processType,
    harvestLot: lot
      ? {
          id: lot.id,
          displayId: lot.displayId ?? null,
          farmerName: lot.farmerName,
          cherryVariety: lot.cherryVariety,
          farm: lot.farm ? { id: lot.farm.id, farmName: lot.farm.farmName, location: lot.farm.location } : null,
        }
      : null,
  }
}

/** Processing batches on cherry from `farmIds`. */
export const processingBatchesOnFarms = (farmIds: string[]) =>
  ({ harvestLot: { farmId: { in: farmIds } } }) satisfies Prisma.ProcessingBatchWhereInput

/** Parchment lots from cherry grown on `farmIds`. */
export const parchmentLotsOnFarms = (farmIds: string[]) =>
  ({ harvestLot: { farmId: { in: farmIds } } }) satisfies Prisma.ParchmentLotWhereInput

/** Green-bean lots hulled from parchment grown on `farmIds`. */
export const greenBeanLotsOnFarms = (farmIds: string[]) =>
  ({ parchmentLot: parchmentLotsOnFarms(farmIds) }) satisfies Prisma.GreenBeanLotWhereInput

/**
 * Throws a 403 (via handleApiError) unless `found`: the by-id lookup through
 * the user's chainScope clause matched the record.
 */
export function requireInScope(found: unknown): void {
  if (!found) {
    throw new Error('Insufficient permissions')
  }
}
