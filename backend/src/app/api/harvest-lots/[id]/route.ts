import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, handleApiError } from '@/lib/middleware'
import type { AuthenticatedUser } from '@/lib/middleware'
import { parseStrictDateOnly, parseStrictNumber } from '@/lib/utils'
import { serializeHarvestLot } from '@/lib/harvestLot'
import { isFarmerOnly } from '@/lib/farmAccess'
import {
  PROCESSOR_EDITABLE_HARVEST_LOT_FIELDS,
  processorUpdateHarvestLotSchema,
  updateHarvestLotSchema,
} from '@/lib/validations/harvestLot'

// Processors may correct or remove a farmer's cherry lot, but only until it is
// processed: once a batch or parchment lot draws on it, the lot is part of the
// traceability chain and only its owner or an Admin may change it.
const LOT_PROCESSED_EDIT_ERROR =
  'This cherry lot has already been processed, so a processor can no longer edit it'
const LOT_PROCESSED_DELETE_ERROR =
  'This cherry lot has already been processed, so a processor can no longer delete it'
// The same refusal for an owner or Admin who asked for the guard (below).
const GUARDED_EDIT_ERROR = 'This cherry lot has already been processed, so it was not changed'
const GUARDED_DELETE_ERROR = 'This cherry lot has already been processed, so it was not deleted'
// Once a batch or parchment lot draws on a lot, its weight and status are part
// of the traceability record: its owner can no longer change them, and only an
// Admin may correct the weight. Nobody sets it back to Ready while something
// draws on it (it could then be processed twice); deleting its last batch does
// that. A lot only marked Complete by hand is not locked. Its other details
// stay editable.
const PROCESSED_LOCK_ERROR = 'This lot has already been processed, so its weight and status are locked'
const PROCESSED_STATUS_ERROR =
  'This lot has a processing batch or parchment lot, so its status stays Complete'
// Deleting a processed lot cascades away its batches, drying logs, parchment
// lots, physical tests and parchment withdrawals (sales included), and leaves
// its green-bean lots without a source. Only an Admin may do that, and only by
// asking for it with ?cascade=1 after seeing what will be lost.
const PROCESSED_DELETE_ERROR = 'This lot has already been processed'
const CASCADE_ADMIN_ONLY_ERROR =
  'Only an Admin can delete a processed lot together with everything linked to it'
// The counts the Admin confirmed (?expect=) no longer match what is linked.
const DEPENDENTS_CHANGED_ERROR =
  'What is linked to this lot has changed since you looked, so it was not deleted'
const FARM_REQUIRED_ERROR = 'A harvest lot must stay on a farm'
const PROCESSOR_EDITABLE_FIELD_SET: ReadonlySet<string> = new Set(PROCESSOR_EDITABLE_HARVEST_LOT_FIELDS)

const harvestLotResponseInclude = {
  _count: { select: { processingBatches: true } },
  farm: {
    select: {
      id: true,
      farmName: true,
      location: true,
    },
  },
  cropYear: {
    select: {
      id: true,
      year: true,
    },
  },
} satisfies Prisma.HarvestLotInclude

// What the ownership, processor and edit checks need to know about a lot.
const harvestLotAccessSelect = {
  createdById: true,
  farmId: true,
  weightKg: true,
  status: true,
  farm: { select: { ownerId: true } },
  _count: { select: { processingBatches: true, parchmentLots: true } },
} satisfies Prisma.HarvestLotSelect

type HarvestLotAccess = Prisma.HarvestLotGetPayload<{ select: typeof harvestLotAccessSelect }>

// The lot's owner: the farmer it was recorded for, or else its farm's owner.
// Lots recorded before createdById was stored only have the farm.
function lotOwnerId(lot: HarvestLotAccess): string | null {
  return lot.createdById ?? lot.farm?.ownerId ?? null
}

function isAdmin(user: AuthenticatedUser): boolean {
  return user.isSuperAdmin || user.roles.includes('Admin')
}

// True when the user reaches this lot only as a Processor. Owners, Admins and
// super admins keep the owner path, exactly as requireOwnership lets them
// through.
function actsAsProcessor(user: AuthenticatedUser, ownerId: string | null): boolean {
  if (isAdmin(user)) return false
  if (ownerId && user.id === ownerId) return false
  return user.roles.includes('Processor')
}

function isUnprocessed(lot: HarvestLotAccess): boolean {
  return (
    lot.status === 'ReadyForProcessing' &&
    lot._count.processingBatches === 0 &&
    lot._count.parchmentLots === 0
  )
}

// The same rule as isUnprocessed, as a write condition. Creating a batch first
// claims the lot (status -> Complete), so a write that races it matches no row
// instead of editing, or cascading away, a lot that is now in use.
function unprocessedLotWhere(id: string): Prisma.HarvestLotWhereInput {
  return {
    id,
    status: 'ReadyForProcessing',
    processingBatches: { none: {} },
    parchmentLots: { none: {} },
  }
}

// The owner path's "processed": a batch or parchment lot draws on the lot. A
// lot marked Complete by hand with nothing drawing on it can be set back to
// Ready, re-weighed or deleted by its owner.
function hasDependents(lot: HarvestLotAccess): boolean {
  return lot._count.processingBatches > 0 || lot._count.parchmentLots > 0
}

// A write that must still find the lot as it was read: the same status and
// nothing drawing on it. For a Ready lot this is unprocessedLotWhere. A lot
// marked Complete by hand cannot be claimed by a batch (that needs Ready).
function unchangedLotWhere(id: string, lot: HarvestLotAccess): Prisma.HarvestLotWhereInput {
  return { ...unprocessedLotWhere(id), status: lot.status }
}

// The dependents as one string, to compare with the counts an Admin confirmed.
function dependentsKey(dependents: Awaited<ReturnType<typeof countDependents>>): string {
  return [
    dependents.processingBatches,
    dependents.parchmentLots,
    dependents.greenBeanLots,
    dependents.withdrawals,
  ].join(',')
}

// The Processor workbench only offers edit and delete on lots it lists as
// Ready, and its list can be stale. It sends ?ifUnprocessed=1 so that owners
// and Admins using it get the same "only while unprocessed" write as a
// Processor, instead of editing or cascade-deleting a lot processed since the
// list loaded. Without the flag they get the owner rules: a processed lot
// keeps its other details editable, and deleting it takes an Admin's
// ?cascade=1.
function wantsUnprocessedGuard(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get('ifUnprocessed') === '1'
}

async function lotExists(id: string): Promise<boolean> {
  const stillThere = await prisma.harvestLot.findUnique({ where: { id }, select: { id: true } })
  return stillThere !== null
}

// A conditional write matched nothing: the lot was removed or processed since
// it was read.
async function lotChangedResponse(id: string, processedError: string) {
  if (!(await lotExists(id))) {
    return NextResponse.json({ error: 'Harvest lot not found' }, { status: 404 })
  }
  return NextResponse.json({ error: processedError }, { status: 409 })
}

// The lot as every successful PUT returns it.
async function lotResponse(id: string) {
  const harvestLot = await prisma.harvestLot.findUnique({
    where: { id },
    include: harvestLotResponseInclude,
  })
  if (!harvestLot) {
    return NextResponse.json({ error: 'Harvest lot not found' }, { status: 404 })
  }
  return NextResponse.json({ harvestLot: serializeHarvestLot(harvestLot) })
}

// What deleting a processed lot would take with it, so an Admin can decide.
// Parchment lots hang off the lot directly or through one of its batches.
// Green-bean lots are not deleted, but lose their parchment source.
async function countDependents(id: string) {
  const parchmentWhere: Prisma.ParchmentLotWhereInput = {
    OR: [{ harvestLotId: id }, { processingBatch: { harvestLotId: id } }],
  }
  const [processingBatches, parchmentLots, greenBeanLots, withdrawals] = await Promise.all([
    prisma.processingBatch.count({ where: { harvestLotId: id } }),
    prisma.parchmentLot.count({ where: parchmentWhere }),
    prisma.greenBeanLot.count({ where: { parchmentLot: parchmentWhere } }),
    prisma.parchmentWithdrawal.count({ where: { parchmentLot: parchmentWhere } }),
  ])
  return { processingBatches, parchmentLots, greenBeanLots, withdrawals }
}

// The body as a plain JSON object, or null when it is not one.
async function readJsonObject(request: NextRequest): Promise<Record<string, unknown> | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  return body as Record<string, unknown>
}

// Numbers may arrive as strings from a form. A value that is present but not
// a plain number is an error, never "not provided".
function weightInput(value: unknown): unknown {
  if (value === undefined || value === null || typeof value === 'number') return value
  return parseStrictNumber(value) ?? NaN
}

function firstIssueResponse(error: { issues: Array<{ message: string }> }) {
  return NextResponse.json(
    { error: error.issues[0]?.message || 'Invalid harvest lot data' },
    { status: 400 }
  )
}

// Delete only while the lot is unprocessed. Batches and parchment lots cascade
// on delete, so the delete itself re-checks the rule.
async function deleteIfUnprocessed(id: string, lot: HarvestLotAccess, processedError: string) {
  if (!isUnprocessed(lot)) {
    return NextResponse.json({ error: processedError }, { status: 409 })
  }
  const deleted = await prisma.harvestLot.deleteMany({ where: unprocessedLotWhere(id) })
  if (deleted.count === 0) {
    return lotChangedResponse(id, processedError)
  }
  return NextResponse.json({ message: 'Harvest lot deleted successfully' })
}

// PUT for a Processor who does not own the lot: only the cherry details, and
// only while the lot is unprocessed.
async function processorUpdate(request: NextRequest, id: string, lot: HarvestLotAccess) {
  if (!isUnprocessed(lot)) {
    return NextResponse.json({ error: LOT_PROCESSED_EDIT_ERROR }, { status: 409 })
  }

  const body = await readJsonObject(request)
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Sending a field at all counts as trying to change it.
  const lockedFields = Object.keys(body).filter(
    (key) => body[key] !== undefined && !PROCESSOR_EDITABLE_FIELD_SET.has(key)
  )
  if (lockedFields.length > 0) {
    return NextResponse.json(
      {
        error: `Processors can only change ${PROCESSOR_EDITABLE_HARVEST_LOT_FIELDS.join(', ')}. Not allowed: ${lockedFields.join(', ')}`,
      },
      { status: 403 }
    )
  }

  const parsed = processorUpdateHarvestLotSchema.safeParse({
    cherryVariety: body.cherryVariety,
    weightKg: weightInput(body.weightKg),
    farmPlotLocation: body.farmPlotLocation,
    harvestDate: body.harvestDate,
  })
  if (!parsed.success) {
    return firstIssueResponse(parsed.error)
  }
  const input = parsed.data

  const data: Prisma.HarvestLotUpdateManyMutationInput = {}
  if (input.cherryVariety !== undefined) data.cherryVariety = input.cherryVariety
  if (input.weightKg !== undefined) data.weightKg = input.weightKg
  if (input.farmPlotLocation !== undefined) data.farmPlotLocation = input.farmPlotLocation
  if (input.harvestDate !== undefined) {
    // The schema already rejected dates parseStrictDateOnly cannot read.
    data.harvestDate = parseStrictDateOnly(input.harvestDate) as Date
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: `Nothing to update. Send any of ${PROCESSOR_EDITABLE_HARVEST_LOT_FIELDS.join(', ')}` },
      { status: 400 }
    )
  }

  const updated = await prisma.harvestLot.updateMany({ where: unprocessedLotWhere(id), data })
  if (updated.count === 0) {
    return lotChangedResponse(id, LOT_PROCESSED_EDIT_ERROR)
  }
  return lotResponse(id)
}

// PUT for the lot's owner or an Admin. Only the keys the body sends are
// written, so a partial edit never blanks the rest of the lot.
async function ownerUpdate(
  request: NextRequest,
  user: AuthenticatedUser,
  id: string,
  lot: HarvestLotAccess,
  guarded: boolean
) {
  const body = await readJsonObject(request)
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = updateHarvestLotSchema.safeParse(
    'weightKg' in body ? { ...body, weightKg: weightInput(body.weightKg) } : body
  )
  if (!parsed.success) {
    return firstIssueResponse(parsed.error)
  }
  const input = parsed.data

  // A lot without a farm has no owner but Admin and drops out of the farmer's
  // own lists, so its farm can be changed but never cleared.
  const farmId = input.farmId
  if (farmId === null || (farmId !== undefined && farmId.trim() === '')) {
    return NextResponse.json({ error: FARM_REQUIRED_ERROR }, { status: 400 })
  }

  const data: Prisma.HarvestLotUncheckedUpdateManyInput = {}
  const admin = isAdmin(user)

  // Weight and status are locked once something draws on the lot (see
  // PROCESSED_LOCK_ERROR). Sending the value it already has is not a change:
  // an edit form sends every field. Complete is still written onto a
  // processed lot whose stored status says Ready, which the app already reads
  // as Complete.
  const processed = hasDependents(lot)
  if (input.weightKg !== undefined && !(processed && input.weightKg === lot.weightKg)) {
    data.weightKg = input.weightKg
  }
  if (input.status !== undefined && !(processed && input.status === 'Complete' && lot.status === 'Complete')) {
    data.status = input.status
  }
  if (processed && data.status === 'ReadyForProcessing') {
    return NextResponse.json(
      { error: admin ? PROCESSED_STATUS_ERROR : PROCESSED_LOCK_ERROR },
      { status: 409 }
    )
  }
  if (processed && data.weightKg !== undefined && !admin) {
    return NextResponse.json({ error: PROCESSED_LOCK_ERROR }, { status: 409 })
  }

  if (input.farmerName !== undefined) data.farmerName = input.farmerName
  if (input.cherryVariety !== undefined) data.cherryVariety = input.cherryVariety
  if (input.farmPlotLocation !== undefined) data.farmPlotLocation = input.farmPlotLocation
  if (input.harvestDate !== undefined) {
    // The schema already rejected dates parseStrictDateOnly cannot read.
    data.harvestDate = parseStrictDateOnly(input.harvestDate) as Date
  }

  if (input.cropYearId !== undefined) {
    // An empty choice from a form clears the crop year.
    const cropYearId = input.cropYearId?.trim() || null
    if (cropYearId) {
      const cropYear = await prisma.cropYear.findUnique({
        where: { id: cropYearId },
        select: { id: true },
      })
      if (!cropYear) {
        return NextResponse.json({ error: 'Crop year not found' }, { status: 400 })
      }
    }
    data.cropYearId = cropYearId
  }

  if (farmId !== undefined && farmId !== lot.farmId) {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      select: { ownerId: true },
    })
    if (!farm) {
      return NextResponse.json({ error: 'Farm not found' }, { status: 404 })
    }
    // SECURITY: a lot may only move to a farm the caller owns (Admins: any).
    requireOwnership(user, farm.ownerId, ['Admin'])
    data.farmId = farmId
    // The lot belongs to its farm's owner, as when it is recorded.
    data.createdById = farm.ownerId
  }

  if (Object.keys(data).length === 0) {
    // Nothing changes, e.g. an edit form saved as it was.
    return lotResponse(id)
  }

  // On a lot nothing draws on yet, a write to weight or status must still find
  // it that way: creating a batch claims the lot first, so a write that races
  // it matches no row. (The guard already required an unprocessed lot.)
  if (guarded || (!processed && (data.weightKg !== undefined || data.status !== undefined))) {
    const updated = await prisma.harvestLot.updateMany({ where: unchangedLotWhere(id, lot), data })
    if (updated.count === 0) {
      return lotChangedResponse(id, guarded || admin ? GUARDED_EDIT_ERROR : PROCESSED_LOCK_ERROR)
    }
    return lotResponse(id)
  }

  const updatedHarvestLot = await prisma.harvestLot.update({
    where: { id },
    data,
    include: harvestLotResponseInclude,
  })
  return NextResponse.json({ harvestLot: serializeHarvestLot(updatedHarvestLot) })
}

// GET /api/harvest-lots/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)

    const harvestLot = await prisma.harvestLot.findUnique({
      where: { id },
      include: {
        farm: {
          select: {
            id: true,
            farmName: true,
            location: true,
            ownerId: true,
          },
        },
        cropYear: {
          select: {
            id: true,
            year: true,
          },
        },
        processingBatches: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!harvestLot) {
      return NextResponse.json(
        { error: 'Harvest lot not found' },
        { status: 404 }
      )
    }

    // SECURITY: Farmers can only read their own harvest lots (the same owner
    // as for edit and delete: createdById, or else the farm's owner). A
    // Farmer who also holds a staff role reads any lot, as that role does (D8).
    if (isFarmerOnly(user)) {
      requireOwnership(user, harvestLot.createdById ?? harvestLot.farm?.ownerId, ['Admin'])
    }

    const { farm, ...restHarvestLot } = serializeHarvestLot({
      ...harvestLot,
      _count: { processingBatches: harvestLot.processingBatches.length },
    })
    const safeFarm = farm
      ? { id: farm.id, farmName: farm.farmName, location: farm.location }
      : null
    return NextResponse.json({ harvestLot: { ...restHarvestLot, farm: safeFarm } })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/harvest-lots/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)

    // Get the harvest lot to check ownership
    const harvestLot = await prisma.harvestLot.findUnique({
      where: { id },
      select: harvestLotAccessSelect
    })

    if (!harvestLot) {
      return NextResponse.json(
        { error: 'Harvest lot not found' },
        { status: 404 }
      )
    }

    const ownerId = lotOwnerId(harvestLot)

    // A Processor may correct an unprocessed lot they do not own.
    if (actsAsProcessor(user, ownerId)) {
      return await processorUpdate(request, id, harvestLot)
    }

    // SECURITY: only the lot's owner or an Admin can update it
    requireOwnership(user, ownerId, ['Admin'])

    const guarded = wantsUnprocessedGuard(request)
    if (guarded && !isUnprocessed(harvestLot)) {
      return NextResponse.json({ error: GUARDED_EDIT_ERROR }, { status: 409 })
    }

    return await ownerUpdate(request, user, id, harvestLot, guarded)
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/harvest-lots/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)

    // Get the harvest lot to check ownership
    const harvestLot = await prisma.harvestLot.findUnique({
      where: { id },
      select: harvestLotAccessSelect
    })

    if (!harvestLot) {
      return NextResponse.json(
        { error: 'Harvest lot not found' },
        { status: 404 }
      )
    }

    const ownerId = lotOwnerId(harvestLot)

    // A Processor may delete an unprocessed lot they do not own.
    if (actsAsProcessor(user, ownerId)) {
      return await deleteIfUnprocessed(id, harvestLot, LOT_PROCESSED_DELETE_ERROR)
    }

    // SECURITY: only the lot's owner or an Admin can delete it
    requireOwnership(user, ownerId, ['Admin'])

    if (wantsUnprocessedGuard(request)) {
      return await deleteIfUnprocessed(id, harvestLot, GUARDED_DELETE_ERROR)
    }

    // Nothing draws on it (a lot marked Complete by hand included): delete
    // just the lot, and only if that is still so.
    if (!hasDependents(harvestLot)) {
      const deleted = await prisma.harvestLot.deleteMany({ where: unchangedLotWhere(id, harvestLot) })
      if (deleted.count > 0) {
        return NextResponse.json({ message: 'Harvest lot deleted successfully' })
      }
      if (!(await lotExists(id))) {
        return NextResponse.json({ error: 'Harvest lot not found' }, { status: 404 })
      }
      // Processed since it was read: handled as a processed lot below.
    }

    if (request.nextUrl.searchParams.get('cascade') === '1') {
      if (!isAdmin(user)) {
        return NextResponse.json({ error: CASCADE_ADMIN_ONLY_ERROR }, { status: 403 })
      }
      // The Admin saw the dependents and chose to delete the whole chain. When
      // the counts they saw come along (?expect=batches,parchment,green,
      // withdrawals), anything linked since then sends the new counts back
      // instead of deleting what they did not see.
      const expected = request.nextUrl.searchParams.get('expect')
      if (expected !== null) {
        const dependents = await countDependents(id)
        if (dependentsKey(dependents) !== expected) {
          return NextResponse.json({ error: DEPENDENTS_CHANGED_ERROR, dependents }, { status: 409 })
        }
      }
      await prisma.harvestLot.delete({ where: { id } })
      return NextResponse.json({ message: 'Harvest lot deleted successfully' })
    }

    return NextResponse.json(
      { error: PROCESSED_DELETE_ERROR, dependents: await countDependents(id) },
      { status: 409 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
