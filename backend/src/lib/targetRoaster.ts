import prisma from '@/lib/prisma'

// A withdrawal that names a target roaster pushes stock to that account: a
// green bean withdrawal adds the kg to their RoasterInventoryItem, and a
// parchment withdrawal records them on the withdrawal row. The target must be
// someone who can open the Roaster pages, so an unknown id, a deactivated
// account or a user without the Roaster role is refused instead of stranding
// the kg where nobody can use it.

export const INVALID_TARGET_ROASTER_MESSAGE =
  'Target roaster must be an active user with the Roaster role'

/** Whether `id` names an existing, active user with the Roaster role. */
export async function isActiveRoaster(id: unknown): Promise<boolean> {
  if (typeof id !== 'string' || !id) return false
  const target = await prisma.user.findUnique({
    where: { id },
    select: { roles: true, isActive: true },
  })
  return !!target && target.isActive && target.roles.includes('Roaster')
}
