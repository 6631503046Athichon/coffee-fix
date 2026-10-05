import type { AuthenticatedUser } from '@/lib/middleware'
import { isAdminUser } from '@/lib/saleOrders'

// A bought-in (External) parchment lot's externalSource records who imported
// it as `importedBy`, a user id. It decides who reads the lot (lib/farmAccess
// chainScope: the importing processor and Admin), but it is a user id, so the
// parchment reads (the parchment-lots list and by id, bulk-load, and the
// parchment nested in green-bean-lots, roaster-inventory and an invoice's
// lines) hand it back only to Admin (super admin included) and to the
// importer. Every other reader (a roaster reading the parchment behind their
// green beans or invoice, a cupper) gets the supplier details without it.
// Sale orders, roasts, the sellable lists and the public trace never hand the
// parchment's externalSource back (lib/saleOrders lotFacts, lib/trace). The
// cupping-sessions by-id read still nests it whole: cupping is left as it is
// until the owner asks for it.

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

type WithParchmentLot = { parchmentLot?: WithExternalSource | null }

/**
 * A green bean lot with its nested parchment lot shaped by withoutImporterFor,
 * for the reads that hand the parchment behind a green bean lot (green-bean-lots
 * list and by id, roaster-inventory, bulk-load's roaster stock, an invoice's
 * lines).
 */
export function withParchmentImporterFor<L extends WithParchmentLot>(user: AuthenticatedUser, lot: L): L {
  const parchmentLot = lot.parchmentLot
  if (!parchmentLot) return lot
  const readable = withoutImporterFor(user, parchmentLot)
  return readable === parchmentLot ? lot : { ...lot, parchmentLot: readable }
}

type WithGreenBeanLot = { greenBeanLot?: WithParchmentLot | null }

/** A roaster stock row whose green bean lot's parchment is shaped by withoutImporterFor. */
export function stockRowWithoutImporterFor<R extends WithGreenBeanLot>(user: AuthenticatedUser, row: R): R {
  const greenBeanLot = row.greenBeanLot
  if (!greenBeanLot) return row
  const readable = withParchmentImporterFor(user, greenBeanLot)
  return readable === greenBeanLot ? row : { ...row, greenBeanLot: readable }
}
