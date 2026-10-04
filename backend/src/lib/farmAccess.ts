import type { Prisma, UserRole } from '@prisma/client'
import prisma from '@/lib/prisma'
import type { AuthenticatedUser } from '@/lib/middleware'
import { isAdminUser } from '@/lib/saleOrders'

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

// Multi-role accounts (D8): a user may hold Farmer and a staff role at once,
// e.g. a farmer who also runs the wet mill. The staff role's screens work
// across every farm (Processors process any farmer's cherry, Roasters buy
// from any lot, HeadJudges and Cuppers score any lot's samples, Admins do
// everything), so being a Farmer as well never narrows them. The farmer-only
// rules (own farms' lots and lot chain, nobody else's lot by id) protect
// accounts with no staff role. Soil, weather and GAP are not farmer rules:
// every non-Admin sees those only on farms they belong to (above).

/**
 * Every role except Farmer. Listed rather than derived, so a role added to
 * the enum later is not staff until someone decides it is (a test fails until
 * the new role is placed on one side).
 */
export const STAFF_ROLES = [
  'Processor',
  'Roaster',
  'HeadJudge',
  'Cupper',
  'Admin',
] as const satisfies readonly UserRole[]

const STAFF_ROLE_SET: ReadonlySet<string> = new Set(STAFF_ROLES)

type RoleHolder = Pick<AuthenticatedUser, 'roles' | 'isSuperAdmin'>

/** Holds a staff role; a super admin always counts, whatever their roles. */
export function hasStaffRole(user: RoleHolder): boolean {
  return !!user.isSuperAdmin || user.roles.some(role => STAFF_ROLE_SET.has(role))
}

/** A Farmer with no staff role: the only user the farmer scoping applies to. */
export function isFarmerOnly(user: RoleHolder): boolean {
  return user.roles.includes('Farmer') && !hasStaffRole(user)
}
