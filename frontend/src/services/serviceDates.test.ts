import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { getAllProcessTypes } from './processing/processTypeService'
import { getAllActivityTypes } from './reference/activityTypeService'
import { getAllInvoices } from './sales/invoiceService'
import { getAllPricingHistory } from './sales/pricingHistoryService'
import { transformHarvestLotFromBackend } from './utils/transformers'

// Dates from the backend become the Thai calendar day. Read at 02:30 on
// 5 Oct in Thailand, the moment is still 4 Oct in UTC (19:30Z): slicing the
// ISO string showed the 4th.
const LATE_NIGHT = '2026-10-04T19:30:00.000Z'

const originalTZ = process.env.TZ
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

describe('reference types createdDate', () => {
  it('is the Thai day the process type was created', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      processTypes: [{ id: 'pt-1', name: 'Washed', isActive: true, createdAt: LATE_NIGHT }],
    })
    const [type] = await getAllProcessTypes()
    expect(type.createdDate).toBe('2026-10-05')
  })

  it('is the Thai day the activity type was created', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      activityTypes: [{ id: 'at-1', name: 'Pruning', isActive: true, createdAt: LATE_NIGHT }],
    })
    const [type] = await getAllActivityTypes()
    expect(type.createdDate).toBe('2026-10-05')
  })

  it("falls back to the viewer's today, not the UTC day", async () => {
    process.env.TZ = 'Asia/Bangkok'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(LATE_NIGHT))
    vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ processTypes: [{ id: 'pt-1', name: 'Washed', isActive: true }] })
      .mockResolvedValueOnce({ activityTypes: [{ id: 'at-1', name: 'Pruning', isActive: true }] })
    expect((await getAllProcessTypes())[0].createdDate).toBe('2026-10-05')
    expect((await getAllActivityTypes())[0].createdDate).toBe('2026-10-05')
  })
})

describe('sales paperwork dates', () => {
  it('invoice issue and due dates are Thai days', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      invoices: [
        { id: 'inv-1', invoiceNumber: 'INV-1', saleOrderId: 's-1', issueDate: LATE_NIGHT, dueDate: '2026-11-04T19:30:00.000Z', status: 'Draft', items: [], subtotal: 0, totalAmount: 0 },
        { id: 'inv-2', invoiceNumber: 'INV-2', saleOrderId: 's-1', issueDate: '2026-10-05T12:00:00.000Z', dueDate: null, status: 'Draft', items: [], subtotal: 0, totalAmount: 0 },
      ],
    })
    const [first, second] = await getAllInvoices()
    expect(first.issueDate).toBe('2026-10-05')
    expect(first.dueDate).toBe('2026-11-05')
    expect(second.issueDate).toBe('2026-10-05')
    expect(second.dueDate).toBeUndefined()
  })

  it('a price change takes effect on its Thai day', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      pricingHistory: [{ id: 'ph-1', greenBeanLotId: 'gbl-1', pricePerKg: 400, currency: 'THB', effectiveDate: LATE_NIGHT }],
    })
    const [entry] = await getAllPricingHistory('gbl-1')
    expect(entry.effectiveDate).toBe('2026-10-05')
  })
})

describe('transformHarvestLotFromBackend harvestDate', () => {
  it('is the Thai day, and blank when missing', () => {
    expect(transformHarvestLotFromBackend({ id: 'hl-1', harvestDate: LATE_NIGHT }).harvestDate).toBe('2026-10-05')
    expect(transformHarvestLotFromBackend({ id: 'hl-1', harvestDate: '2026-10-05T12:00:00.000Z' }).harvestDate).toBe('2026-10-05')
    expect(transformHarvestLotFromBackend({ id: 'hl-1', harvestDate: null }).harvestDate).toBe('')
  })
})
