import type { AuthenticatedUser } from '@/lib/middleware'
import { isAdminUser } from '@/lib/saleOrders'

// A bought-in (External) parchment lot's externalSource records who imported
// it as `importedBy`, a user id. It decides who reads the lot (lib/farmAccess
// chainScope: the importing processor and Admin), but it is a user id, so the
// parchment-lots list and by-id reads hand it back only to Admin (super admin
// included) and to the importer. Every other reader (a roaster reading the
// parchment behind their green beans, a cupper) gets the supplier details
// without it.

type WithExternalSource = { externalSource?: unknown }

/** `lot` as `user` may read it: without externalSource.importedBy unless Admin or the importer. */
export function withoutImporterFor<L extends WithExternalSource>(user: AuthenticatedUser, lot: L): L {
  if (isAdminUser(user)) return lot
  const source = lot.externalSource
  if (!source || typeof source !== 'object' || Array.isArray(source)) return lot
  const fields = source as Record<string, unknown>
  if (!('importedBy' in fields) || fields.importedBy === user.id) return lot
  const { importedBy: _importer, ...rest } = fields
  return { ...lot, externalSource: rest }
}
