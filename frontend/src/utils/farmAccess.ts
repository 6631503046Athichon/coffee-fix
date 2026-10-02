import { Farm, GAPLogEntry, HarvestLot, User, UserRole } from '../types';

// Who may do what with a farm and its lots, by user id rather than display
// name (a renamed user or a farm that changed owner must not lose anything).
// Mirrors the backend (lib/farmAccess.ts, api/harvest-lots/[id]):
// - Admins and super admins can do everything.
// - A farm's owner edits and deletes the farm; a harvest lot's owner (the
//   farm's owner) edits and deletes the lot.
// - Collaborators (farmhands) record soil, weather and GAP data on a shared
//   farm, but cannot edit or delete the farm, its lots, or its soil and
//   weather records, and delete only the GAP logs they recorded.

type Viewer = Pick<User, 'id' | 'roles' | 'isSuperAdmin'> | null | undefined;
type FarmMembers = Pick<Farm, 'ownerUserId' | 'collaborators'> | null | undefined;

export const isAdminUser = (user: Viewer): boolean =>
  !!user && (!!user.isSuperAdmin || (user.roles ?? []).includes(UserRole.Admin));

export const ownsFarm = (user: Viewer, farm: FarmMembers): boolean =>
  !!user && !!farm && !!farm.ownerUserId && farm.ownerUserId === user.id;

export const collaboratesOnFarm = (user: Viewer, farm: FarmMembers): boolean =>
  !!user && !!farm && (farm.collaborators ?? []).some(c => c.userId === user.id);

/** Owner or collaborator. */
export const isFarmMember = (user: Viewer, farm: FarmMembers): boolean =>
  ownsFarm(user, farm) || collaboratesOnFarm(user, farm);

/** Edit or delete the farm, or delete its soil and weather records: the owner or an Admin. */
export const canManageFarm = (user: Viewer, farm: FarmMembers): boolean =>
  isAdminUser(user) || ownsFarm(user, farm);

/** Ids of the farms the user owns. */
export const ownedFarmIds = (user: Viewer, farms: Farm[]): Set<string> =>
  new Set(farms.filter(farm => ownsFarm(user, farm)).map(farm => farm.id));

/**
 * The user's own harvest lots: those on a farm they own, which is what the
 * backend lists for a farmer. The backend keeps a lot's owner (createdById)
 * equal to its farm's owner on create, on a farm change and when an Admin
 * gives the farm to someone else, so the farm decides. For a user with a
 * staff role as well, who is sent every lot, this keeps the farmer pages to
 * their own.
 */
export const ownHarvestLots = (user: Viewer, lots: HarvestLot[], farms: Farm[]): HarvestLot[] => {
  const farmIds = ownedFarmIds(user, farms);
  return lots.filter(lot => !!lot.farmId && farmIds.has(lot.farmId));
};

/**
 * Whose a harvest lot is, as the backend decides it (api/harvest-lots/[id]):
 * the user it was recorded for, or for an older lot without one, its farm's
 * owner.
 */
export const harvestLotOwnerId = (
  lot: Pick<HarvestLot, 'farmId' | 'createdById'>,
  farms: Farm[],
): string | undefined =>
  lot.createdById || (lot.farmId ? farms.find(farm => farm.id === lot.farmId)?.ownerUserId : undefined) || undefined;

/** Edit or delete a harvest lot: an Admin, or the lot's owner (harvestLotOwnerId). */
export const canManageHarvestLot = (
  user: Viewer,
  lot: Pick<HarvestLot, 'farmId' | 'createdById'>,
  farms: Farm[],
): boolean => {
  if (isAdminUser(user)) return true;
  if (!user) return false;
  const ownerId = harvestLotOwnerId(lot, farms);
  return !!ownerId && ownerId === user.id;
};

/**
 * Delete a GAP log, or move it to another farm (api/gap-logs/[id]): an
 * Admin, the farm's owner, or whoever recorded it while still a member of
 * the farm. Other collaborators may edit it in place. A log with no farm is
 * its recorder's.
 */
export const canRemoveGapLog = (
  user: Viewer,
  log: Pick<GAPLogEntry, 'farmId' | 'createdBy'>,
  farms: Farm[],
): boolean => {
  if (isAdminUser(user)) return true;
  if (!user) return false;
  const isRecorder = !!log.createdBy && log.createdBy === user.id;
  if (!log.farmId) return isRecorder;
  const farm = farms.find(f => f.id === log.farmId);
  return ownsFarm(user, farm) || (isRecorder && isFarmMember(user, farm));
};
