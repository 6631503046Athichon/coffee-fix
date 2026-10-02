import { describe, expect, it } from 'vitest'
import { GreenBeanSourceType, UserRole } from '../../../types'
import { canManageGreenBeanLot, isInProcessorStock } from './stockAccess'

// F12: the backend lets only a lot's creator, or an Admin / super admin,
// withdraw from it or price it. These decide which lots get those buttons
// and which feed the Parchment page's first-in-first-out stock.

const processor = { id: 'p-1', roles: [UserRole.Processor] }
const roaster = { id: 'r-1', roles: [UserRole.Roaster] }
const admin = { id: 'a-1', roles: [UserRole.Admin] }
const superAdmin = { id: 's-1', roles: [UserRole.Processor], isSuperAdmin: true }
const processorRoaster = { id: 'pr-1', roles: [UserRole.Processor, UserRole.Roaster] }

const internal = (createdById?: string) => ({ createdById, sourceType: GreenBeanSourceType.Internal })
const external = (createdById?: string) => ({ createdById, sourceType: GreenBeanSourceType.External })

describe('canManageGreenBeanLot', () => {
  it('lets the creator manage their own lot, Internal or External', () => {
    expect(canManageGreenBeanLot(processor, internal('p-1'))).toBe(true)
    expect(canManageGreenBeanLot(roaster, external('r-1'))).toBe(true)
  })

  it('refuses another user\'s lot to a non-Admin, whatever their roles', () => {
    expect(canManageGreenBeanLot(processor, internal('p-2'))).toBe(false)
    expect(canManageGreenBeanLot(processor, external('r-1'))).toBe(false)
    expect(canManageGreenBeanLot(processorRoaster, internal('p-1'))).toBe(false)
  })

  it('treats a lot with no recorded creator as Admin-only, as the backend does', () => {
    expect(canManageGreenBeanLot(processor, internal(undefined))).toBe(false)
    expect(canManageGreenBeanLot({ id: '', roles: [UserRole.Processor] }, internal(''))).toBe(false)
    expect(canManageGreenBeanLot(admin, internal(undefined))).toBe(true)
  })

  it('lets an Admin and a super admin manage every lot', () => {
    for (const user of [admin, superAdmin]) {
      expect(canManageGreenBeanLot(user, internal('p-2'))).toBe(true)
      expect(canManageGreenBeanLot(user, external('r-1'))).toBe(true)
    }
  })
})

describe('isInProcessorStock', () => {
  it('holds a Processor\'s own lots only', () => {
    expect(isInProcessorStock(processor, internal('p-1'))).toBe(true)
    expect(isInProcessorStock(processor, internal('p-2'))).toBe(false)
    expect(isInProcessorStock(processor, internal(undefined))).toBe(false)
    expect(isInProcessorStock(processor, external('r-1'))).toBe(false)
  })

  it('holds every Internal lot for an Admin or super admin, but not a roaster\'s purchased External lot', () => {
    for (const user of [admin, superAdmin]) {
      expect(isInProcessorStock(user, internal('p-2'))).toBe(true)
      expect(isInProcessorStock(user, internal(undefined))).toBe(true)
      expect(isInProcessorStock(user, external('r-1'))).toBe(false)
    }
  })

  it('holds an External lot the Admin bought themselves', () => {
    expect(isInProcessorStock(admin, external('a-1'))).toBe(true)
  })
})
