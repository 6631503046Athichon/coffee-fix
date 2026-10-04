import { describe, expect, it } from 'vitest'
import { UserRole } from '../../../types'
import { canManageParchmentLot, canManageProcessingBatch } from './recordAccess'

// F24: the backend lets only a batch's creator, or an Admin / super admin,
// edit or delete it, and a parchment lot belongs to its batch's creator.
// These decide which batches and parchment lots get the Edit and Delete
// buttons.

const processor = { id: 'p-1', roles: [UserRole.Processor] }
const otherProcessor = { id: 'p-2', roles: [UserRole.Processor] }
const admin = { id: 'a-1', roles: [UserRole.Admin] }
const superAdmin = { id: 's-1', roles: [UserRole.Processor], isSuperAdmin: true }

const batch = { id: 'pb-1', createdById: 'p-1' }
const internalLot = { processingBatchId: 'pb-1' }
const externalLot = { processingBatchId: undefined }

describe('canManageProcessingBatch', () => {
  it('lets the processor who recorded the batch manage it', () => {
    expect(canManageProcessingBatch(processor, batch)).toBe(true)
  })

  it('refuses another processor, a batch with no recorded creator and one not loaded', () => {
    expect(canManageProcessingBatch(otherProcessor, batch)).toBe(false)
    expect(canManageProcessingBatch(processor, { createdById: undefined })).toBe(false)
    expect(canManageProcessingBatch(processor, undefined)).toBe(false)
  })

  it('lets an Admin and a super admin manage every batch', () => {
    for (const user of [admin, superAdmin]) {
      expect(canManageProcessingBatch(user, batch)).toBe(true)
      expect(canManageProcessingBatch(user, undefined)).toBe(true)
    }
  })
})

describe('canManageParchmentLot', () => {
  it('follows the batch: its creator manages its parchment, another processor does not', () => {
    expect(canManageParchmentLot(processor, internalLot, batch)).toBe(true)
    expect(canManageParchmentLot(otherProcessor, internalLot, batch)).toBe(false)
  })

  it('never takes ownership from a batch the lot does not belong to', () => {
    expect(canManageParchmentLot(processor, { processingBatchId: 'pb-9' }, batch)).toBe(false)
    expect(canManageParchmentLot(processor, internalLot, undefined)).toBe(false)
  })

  it('keeps external parchment (no batch) Admin-only, as the backend does', () => {
    expect(canManageParchmentLot(processor, externalLot, undefined)).toBe(false)
    expect(canManageParchmentLot(admin, externalLot, undefined)).toBe(true)
    expect(canManageParchmentLot(superAdmin, externalLot, undefined)).toBe(true)
  })
})
