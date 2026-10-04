// Which green-bean lots a user may act on. The backend lets only a lot's
// creator, or an Admin / super admin, withdraw from it or price it
// (requireOwnership on POST /green-bean-lots/:id/withdrawals and PUT
// /green-bean-lots/:id). Each user is sent only their own share of the lots
// ("each their own", 2026-10-05): a Processor their own, a Roaster the ones
// they bought, hold or roasted plus the shelf of claimable lots, a user with
// several roles the union of those, an Admin every lot. So a lot in the data
// can still be someone else's (a shelf lot, the source of a roast); these
// decide which lots get the action buttons and which feed the Parchment
// page's stock.

import { GreenBeanSourceType, UserRole } from '../../../types'
import type { GreenBeanLot, User } from '../../../types'

type Viewer = Pick<User, 'id' | 'roles' | 'isSuperAdmin'>
type Lot = Pick<GreenBeanLot, 'createdById' | 'sourceType'>

/** Admin or super admin: allowed to act on anyone's lot. */
export const isAdminViewer = (user: Viewer): boolean =>
  Boolean(user.isSuperAdmin) || (user.roles ?? []).includes(UserRole.Admin)

const ownsLot = (user: Viewer, lot: Lot): boolean =>
  Boolean(lot.createdById) && lot.createdById === user.id

/**
 * The user may withdraw from and price this one lot: they created it, or they
 * are an Admin. A lot with no recorded creator is Admin-only, as on the
 * backend.
 */
export const canManageGreenBeanLot = (user: Viewer, lot: Lot): boolean =>
  isAdminViewer(user) || ownsLot(user, lot)

/**
 * The lot belongs in the Parchment page's green-bean stock, whose Withdraw
 * draws lot after lot (oldest first) without naming them. So it holds only
 * lots the user may draw from: their own, or for an Admin every lot except
 * another user's External lot. Those are green beans a roaster bought, which
 * the roaster draws on; an Admin's bucket withdrawal would drain them
 * without anyone choosing that lot.
 */
export const isInProcessorStock = (user: Viewer, lot: Lot): boolean => {
  if (ownsLot(user, lot)) return true
  if (!isAdminViewer(user)) return false
  return lot.sourceType !== GreenBeanSourceType.External
}
