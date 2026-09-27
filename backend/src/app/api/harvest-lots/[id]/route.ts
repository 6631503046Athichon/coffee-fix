import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, handleApiError } from '@/lib/middleware'
import type { AuthenticatedUser } from '@/lib/middleware'
import { parseDateOnly, parseStrictDateOnly, parseStrictNumber, safeParseFloat } from '@/lib/utils'
import { serializeHarvestLot } from '@/lib/harvestLot'
import {
  PROCESSOR_EDITABLE_HARVEST_LOT_FIELDS,
  processorUpdateHarvestLotSchema,
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

// What the ownership and processor checks need to know about a lot.
const harvestLotAccessSelect = {
  createdById: true,
  status: true,
  _count: { select: { processingBatches: true, parchmentLots: true } },
} satisfies Prisma.HarvestLotSelect

type HarvestLotAccess = Prisma.HarvestLotGetPayload<{ select: typeof harvestLotAccessSelect }>

// True when the user reaches this lot only as a Processor. Owners, Admins and
// super admins keep the unrestricted path, exactly as requireOwnership lets
// them through.
function actsAsProcessor(user: AuthenticatedUser, ownerId: string | null): boolean {
  if (user.isSuperAdmin || user.roles.includes('Admin')) return false
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

// The Processor workbench only offers edit and delete on lots it lists as
// Ready, and its list can be stale. It sends ?ifUnprocessed=1 so that owners
// and Admins using it get the same "only while unprocessed" write as a
// Processor, instead of editing or cascade-deleting a lot processed since the
// list loaded. Without the flag their behaviour is unchanged.
function wantsUnprocessedGuard(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get('ifUnprocessed') === '1'
}

// A conditional write matched nothing: the lot was removed or processed since
// it was read.
async function lotChangedResponse(id: string, processedError: string) {
  const stillThere = await prisma.harvestLot.findUnique({ where: { id }, select: { id: true } })
  if (!stillThere) {
    return NextResponse.json({ error: 'Harvest lot not found' }, { status: 404 })
  }
  return NextResponse.json({ error: processedError }, { status: 409 })
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

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
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

  // Numbers may arrive as strings from a form. A value that is present but not
  // a plain number is an error, never "not provided".
  const weightKg = body.weightKg
  const parsed = processorUpdateHarvestLotSchema.safeParse({
    cherryVariety: body.cherryVariety,
    weightKg:
      weightKg === undefined || weightKg === null || typeof weightKg === 'number'
        ? weightKg
        : parseStrictNumber(weightKg) ?? NaN,
    farmPlotLocation: body.farmPlotLocation,
    harvestDate: body.harvestDate,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid harvest lot data' },
      { status: 400 }
    )
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

  const harvestLot = await prisma.harvestLot.findUnique({
    where: { id },
    include: harvestLotResponseInclude,
  })
  if (!harvestLot) {
    return NextResponse.json({ error: 'Harvest lot not found' }, { status: 404 })
  }
  return NextResponse.json({ harvestLot: serializeHarvestLot(harvestLot) })
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

    // SECURITY: Farmers can only read harvest lots from their own farms.
    if (user.roles.includes('Farmer') && !user.roles.includes('Admin')) {
      requireOwnership(user, harvestLot.farm?.ownerId, ['Admin'])
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

    // A Processor may correct an unprocessed lot they do not own.
    if (actsAsProcessor(user, harvestLot.createdById)) {
      return await processorUpdate(request, id, harvestLot)
    }

    // SECURITY: Check ownership - only the creator (Farmer) or Admin can update
    requireOwnership(user, harvestLot.createdById, ['Admin'])

    const guarded = wantsUnprocessedGuard(request)
    if (guarded && !isUnprocessed(harvestLot)) {
      return NextResponse.json({ error: GUARDED_EDIT_ERROR }, { status: 409 })
    }

    const body = await request.json()
    const { farmerName, cherryVariety, weightKg, farmPlotLocation, harvestDate, status, cropYearId, farmId } = body

    // Use the unchecked input so we can assign scalar FKs (cropYearId, farmId)
    // directly without needing a nested `connect`; the "many" form also suits
    // the guarded updateMany below.
    const updateData: Prisma.HarvestLotUncheckedUpdateManyInput = {}
    if (farmerName !== undefined) updateData.farmerName = farmerName
    if (cherryVariety !== undefined) updateData.cherryVariety = cherryVariety
    if (weightKg !== undefined) {
      const weight = safeParseFloat(weightKg)
      if (weight !== null) updateData.weightKg = weight
    }
    if (farmPlotLocation !== undefined) updateData.farmPlotLocation = farmPlotLocation
    if (harvestDate !== undefined) {
      const parsed = parseDateOnly(harvestDate)
      if (parsed === null || Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'Invalid harvestDate value' },
          { status: 400 }
        )
      }
      updateData.harvestDate = parsed
    }
    if (status !== undefined) updateData.status = status
    if (cropYearId !== undefined) updateData.cropYearId = cropYearId
    if (farmId !== undefined) updateData.farmId = farmId

    if (guarded) {
      const updated = await prisma.harvestLot.updateMany({ where: unprocessedLotWhere(id), data: updateData })
      if (updated.count === 0) {
        return await lotChangedResponse(id, GUARDED_EDIT_ERROR)
      }
      const guardedLot = await prisma.harvestLot.findUnique({
        where: { id },
        include: harvestLotResponseInclude,
      })
      if (!guardedLot) {
        return NextResponse.json({ error: 'Harvest lot not found' }, { status: 404 })
      }
      return NextResponse.json({ harvestLot: serializeHarvestLot(guardedLot) })
    }

    const updatedHarvestLot = await prisma.harvestLot.update({
      where: { id },
      data: updateData,
      include: harvestLotResponseInclude,
    })

    return NextResponse.json({ harvestLot: serializeHarvestLot(updatedHarvestLot) })
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

    // A Processor may delete an unprocessed lot they do not own.
    if (actsAsProcessor(user, harvestLot.createdById)) {
      return await deleteIfUnprocessed(id, harvestLot, LOT_PROCESSED_DELETE_ERROR)
    }

    // SECURITY: Check ownership - only the creator (Farmer) or Admin can delete
    requireOwnership(user, harvestLot.createdById, ['Admin'])

    if (wantsUnprocessedGuard(request)) {
      return await deleteIfUnprocessed(id, harvestLot, GUARDED_DELETE_ERROR)
    }

    await prisma.harvestLot.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Harvest lot deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
