// Which processing batches and parchment lots a user may edit or delete. The
// backend lets only the batch's creator, or an Admin / super admin, change a
// batch (requireOwnership on PUT/DELETE /processing-batches/:id), and a
// parchment lot belongs to its batch's creator (parchmentLot ->
// processingBatch.createdById). Green-bean lots use canManageGreenBeanLot.

import type { ParchmentLot, ProcessingBatch, User } from '../../../types'
import { isAdminViewer } from './stockAccess'

type Viewer = Pick<User, 'id' | 'roles' | 'isSuperAdmin'>

/**
 * The user may edit or delete this batch: they recorded it, or they are an
 * Admin. A batch with no recorded creator, or one not loaded, is Admin-only,
 * as on the backend.
 */
export const canManageProcessingBatch = (
  user: Viewer,
  batch: Pick<ProcessingBatch, 'createdById'> | undefined,
): boolean =>
  isAdminViewer(user) ||
  (Boolean(batch?.createdById) && batch?.createdById === user.id)

/**
 * The user may edit or delete this parchment lot: its batch is theirs, or
 * they are an Admin. External parchment has no batch, so it is Admin-only.
 */
export const canManageParchmentLot = (
  user: Viewer,
  lot: Pick<ParchmentLot, 'processingBatchId'>,
  batch: Pick<ProcessingBatch, 'id' | 'createdById'> | undefined,
): boolean => {
  if (isAdminViewer(user)) return true
  if (!lot.processingBatchId || batch?.id !== lot.processingBatchId) return false
  return canManageProcessingBatch(user, batch)
}
