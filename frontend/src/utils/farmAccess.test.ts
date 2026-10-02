import { describe, expect, it } from 'vitest'
import { UserRole } from '../types'
import type { Farm, GAPLogEntry, HarvestLot, User } from '../types'
import {
  canManageFarm,
  canManageHarvestLot,
  canRemoveGapLog,
  harvestLotOwnerId,
  isFarmMember,
  ownHarvestLots,
} from './farmAccess'

// The frontend's copy of the backend's farm rules (lib/farmAccess.ts,
// api/farms/[id], api/harvest-lots/[id], api/gap-logs/[id]), by user id only.

const owner: User = { id: 'u-owner', name: 'Somchai', roles: [UserRole.Farmer] }
const farmhand: User = { id: 'u-hand', name: 'Malee', roles: [UserRole.Farmer] }
const stranger: User = { id: 'u-other', name: 'Somchai', roles: [UserRole.Farmer] }
const admin: User = { id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }
const superAdmin: User = { id: 'u-super', name: 'Root', roles: [], isSuperAdmin: true }

const farm: Farm = {
  id: 'farm-1', name: 'Doi Farm', location: 'Chiang Rai', farmerName: 'Somchai', ownerUserId: 'u-owner',
  collaborators: [{ id: 'c-1', farmId: 'farm-1', userId: 'u-hand' }],
}
const farms = [farm]

const lot = (overrides: Partial<HarvestLot> = {}): HarvestLot => ({
  id: 'hl-1', farmId: 'farm-1', farmerName: 'Somchai', cherryVariety: 'Catimor', weightKg: 100,
  farmPlotLocation: 'Chiang Rai', harvestDate: '2026-09-01', status: 'Ready for Processing',
  ...overrides,
})

const gapLog = (overrides: Partial<GAPLogEntry> = {}): GAPLogEntry => ({
  id: 'g-1', farmId: 'farm-1', farmPlotLocation: 'Doi Farm', activityType: 'Fertilizing',
  date: '2026-09-10', productUsed: 'Compost', quantity: '20 kg',
  ...overrides,
})

describe('farm', () => {
  it('owner and collaborators are members; only the owner and Admins manage the farm', () => {
    expect(isFarmMember(owner, farm)).toBe(true)
    expect(isFarmMember(farmhand, farm)).toBe(true)
    expect(isFarmMember(stranger, farm)).toBe(false)

    expect(canManageFarm(owner, farm)).toBe(true)
    expect(canManageFarm(admin, farm)).toBe(true)
    expect(canManageFarm(superAdmin, farm)).toBe(true)
    expect(canManageFarm(farmhand, farm)).toBe(false)
    expect(canManageFarm(stranger, farm)).toBe(false)
    expect(canManageFarm(null, farm)).toBe(false)
  })
})

describe('harvest lots', () => {
  it('a lot is its createdById\'s, or for an older lot without one, its farm owner\'s', () => {
    expect(harvestLotOwnerId(lot({ createdById: 'u-owner' }), farms)).toBe('u-owner')
    expect(harvestLotOwnerId(lot({ createdById: 'u-other' }), farms)).toBe('u-other')
    expect(harvestLotOwnerId(lot(), farms)).toBe('u-owner')
    expect(harvestLotOwnerId(lot({ farmId: undefined }), farms)).toBeUndefined()
  })

  it('its owner edits and deletes it, whatever name is on it', () => {
    const renamed = { ...owner, name: 'Somchai Jaidee' }
    expect(canManageHarvestLot(renamed, lot({ createdById: 'u-owner' }), farms)).toBe(true)
    expect(canManageHarvestLot(renamed, lot(), farms)).toBe(true)
  })

  it('a lot recorded for someone else is not the farm owner\'s to edit, nor a same-named user\'s', () => {
    expect(canManageHarvestLot(owner, lot({ createdById: 'u-other' }), farms)).toBe(false)
    expect(canManageHarvestLot(stranger, lot(), farms)).toBe(false)
    expect(canManageHarvestLot(farmhand, lot(), farms)).toBe(false)
    expect(canManageHarvestLot(null, lot(), farms)).toBe(false)
  })

  it('an Admin or super admin manages any lot, a lot with no farm or owner included', () => {
    expect(canManageHarvestLot(admin, lot({ createdById: 'u-other' }), farms)).toBe(true)
    expect(canManageHarvestLot(superAdmin, lot({ farmId: undefined }), farms)).toBe(true)
    expect(canManageHarvestLot(owner, lot({ farmId: undefined }), farms)).toBe(false)
  })

  it('the farmer pages list the lots on the user\'s own farms, not a shared farm\'s', () => {
    const elsewhere = lot({ id: 'hl-2', farmId: 'farm-9' })
    expect(ownHarvestLots(owner, [lot(), elsewhere], farms).map(l => l.id)).toEqual(['hl-1'])
    expect(ownHarvestLots(farmhand, [lot(), elsewhere], farms)).toEqual([])
  })
})

describe('GAP logs', () => {
  it('the farm owner, an Admin, or the member who recorded it may delete or move a log', () => {
    expect(canRemoveGapLog(owner, gapLog({ createdBy: 'u-hand' }), farms)).toBe(true)
    expect(canRemoveGapLog(admin, gapLog({ createdBy: 'u-owner' }), farms)).toBe(true)
    expect(canRemoveGapLog(superAdmin, gapLog(), farms)).toBe(true)
    expect(canRemoveGapLog(farmhand, gapLog({ createdBy: 'u-hand' }), farms)).toBe(true)
  })

  it('another collaborator may not, nor a recorder who is no longer on the farm', () => {
    expect(canRemoveGapLog(farmhand, gapLog({ createdBy: 'u-owner' }), farms)).toBe(false)
    expect(canRemoveGapLog(farmhand, gapLog(), farms)).toBe(false)
    expect(canRemoveGapLog(stranger, gapLog({ createdBy: 'u-other' }), farms)).toBe(false)
  })

  it('a log with no farm is its recorder\'s', () => {
    expect(canRemoveGapLog(stranger, gapLog({ farmId: undefined, createdBy: 'u-other' }), farms)).toBe(true)
    expect(canRemoveGapLog(owner, gapLog({ farmId: undefined, createdBy: 'u-other' }), farms)).toBe(false)
  })
})
