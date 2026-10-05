import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GreenBeanSourceType, UserRole } from '../../types'
import type { AppData, GreenBeanLot, RoasterInventoryItem, User } from '../../types'
import { createGreenBeanLot, deleteGreenBeanLot } from '../../services/lots/greenBeanLotService'
import { TestDataProvider, adminUser, appData, roasterUser } from '../../test/salesFixtures'
import type { TestDataHandle } from '../../test/salesFixtures'
import { toRoaId } from '../../utils/formatters'
import RoasterWorkbench from './RoasterWorkbench'
import {
  newestPurchasedLotFirst,
  purchasedLotForm,
  purchasedLotUpdate,
  stockSourceLabel,
  updatePurchasedLot,
  usedUpLotDeletable,
} from './purchasedLots'

const { auth, addToast } = vi.hoisted(() => ({
  auth: { currentUser: null as User | null },
  addToast: vi.fn(),
}))

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
vi.mock('../../services/lots/greenBeanLotService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/lots/greenBeanLotService')>()),
  createGreenBeanLot: vi.fn(),
  deleteGreenBeanLot: vi.fn(),
}))
vi.mock('./purchasedLots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./purchasedLots')>()),
  updatePurchasedLot: vi.fn(),
}))

const LOT_X = '5f0c2d7e-1b2a-4c3d-8e4f-9a0b1c2d3e4f'
const LOT_A = 'a3bb189e-8bf9-4888-9912-ace4e6543002'
const otherRoaster: User = {
  id: 'user-roaster-2',
  name: 'Hill Roasters',
  roles: [UserRole.Roaster],
}

// The roaster bought 25 kg; 5 kg were already claimed into stock.
const purchasedLot = (over: Partial<GreenBeanLot> = {}): GreenBeanLot => ({
  id: LOT_X,
  displayId: 'GBL-2026-12',
  sourceType: GreenBeanSourceType.External,
  externalSource: {
    originName: 'Doi Chang',
    producerName: 'Ban Mai',
    variety: 'Bourbon',
    processType: 'Natural',
    purchaseDate: '2026-09-01',
    pricePerKg: 250,
    currency: 'THB',
    tasteNote: 'Berry',
    supplierNotes: 'Bag 3 of 5',
  },
  grade: 'Grade A',
  initialWeightKg: 25,
  currentWeightKg: 20,
  availabilityStatus: 'Available',
  cuppingScores: [],
  pricePerKg: 250,
  currency: 'THB',
  createdById: roasterUser.id,
  ...over,
})

const stock = (over: Partial<RoasterInventoryItem> = {}): RoasterInventoryItem => ({
  id: 'inv-1',
  roasterId: roasterUser.id,
  greenBeanLotId: LOT_A,
  claimedWeightKg: 20,
  remainingWeightKg: 12,
  greenBeanDisplayId: 'GBL-2026-9',
  grade: 'Grade A',
  variety: 'Typica',
  process: 'Washed',
  withdrawalType: 'RoastingStock',
  ...over,
})

const renderWorkbench = (data: AppData, user: User = roasterUser) => {
  auth.currentUser = user
  const handle: TestDataHandle = { current: data }
  render(
    <MemoryRouter initialEntries={['/roaster']}>
      <TestDataProvider initial={data} dataRef={handle}>
        <RoasterWorkbench currentUser={user} />
      </TestDataProvider>
    </MemoryRouter>,
  )
  return { handle }
}

const openPurchasedTab = () =>
  fireEvent.click(screen.getByRole('button', { name: /Purchased Lots/ }))

describe('purchased lot helpers', () => {
  it('fills the form from the lot and sends only what changed', () => {
    const lot = purchasedLot()
    const form = purchasedLotForm(lot)
    expect(form).toMatchObject({
      originName: 'Doi Chang',
      producerName: 'Ban Mai',
      variety: 'Bourbon',
      processType: 'Natural',
      purchaseDate: '2026-09-01',
      pricePerKg: '250',
      initialWeightKg: '25',
      grade: 'Grade A',
      tasteNote: 'Berry',
      supplierNotes: 'Bag 3 of 5',
    })

    const same = purchasedLotUpdate(lot, form)
    expect('update' in same && same.update).toMatchObject({ grade: 'Grade A' })
    expect('update' in same && 'initialWeightKg' in same.update).toBe(false)
    expect('update' in same && 'pricePerKg' in same.update).toBe(false)

    const changed = purchasedLotUpdate(lot, {
      ...form,
      producerName: ' ',
      initialWeightKg: '30',
      pricePerKg: '260',
    })
    expect('update' in changed && changed.update).toMatchObject({
      initialWeightKg: 30,
      pricePerKg: 260,
      currency: 'THB',
      externalSource: { producerName: null, pricePerKg: 260 },
    })

    // A blank price takes it off the lot.
    const cleared = purchasedLotUpdate(lot, { ...form, pricePerKg: '' })
    expect('update' in cleared && cleared.update).toMatchObject({
      pricePerKg: null,
      externalSource: { pricePerKg: 0 },
    })
  })

  it('refuses a weight below the kg already claimed or sold', () => {
    const lot = purchasedLot()
    expect(purchasedLotUpdate(lot, { ...purchasedLotForm(lot), initialWeightKg: '4' })).toEqual({
      error:
        '5.00 kg of this lot was already claimed or sold, so its weight cannot go below 5.00 kg',
    })
    expect(
      'update' in purchasedLotUpdate(lot, { ...purchasedLotForm(lot), initialWeightKg: '5' }),
    ).toBe(true)
  })

  it('lets a used-up lot be deleted only while nothing was taken from it', () => {
    expect(usedUpLotDeletable(purchasedLot({ currentWeightKg: 0 }))).toBe(false)
    expect(usedUpLotDeletable(purchasedLot({ currentWeightKg: 25 }))).toBe(true)
    expect(
      usedUpLotDeletable(
        purchasedLot({
          currentWeightKg: 25,
          withdrawalHistory: [{ id: 'w-1', voidedAt: null } as never],
        }),
      ),
    ).toBe(false)
    expect(
      usedUpLotDeletable(
        purchasedLot({
          currentWeightKg: 25,
          withdrawalHistory: [{ id: 'w-1', voidedAt: '2026-09-02T00:00:00Z' } as never],
        }),
      ),
    ).toBe(true)
  })

  it('puts the newest purchased lot first by date added, then by lot number, never by id', () => {
    const lot = (id: string, displayId: string, createdAt?: string) => ({ id, displayId, createdAt })
    const sorted = [
      lot('ffff', 'GBL-2026-9', '2026-09-01T00:00:00.000Z'),
      lot('0000', 'GBL-2026-30', '2026-09-20T00:00:00.000Z'),
      lot('aaaa', 'GBL-2026-12', '2026-09-01T00:00:00.000Z'),
      lot('bbbb', 'GBL-2025-99'),
    ].sort(newestPurchasedLotFirst)
    expect(sorted.map((l) => l.displayId)).toEqual(['GBL-2026-30', 'GBL-2026-12', 'GBL-2026-9', 'GBL-2025-99'])
  })

  it('names how a stock row came in words, never the enum', () => {
    expect(stockSourceLabel('RoastingStock')).toBe('Sent for roasting')
    expect(stockSourceLabel('Roasting Stock')).toBe('Sent for roasting')
    expect(stockSourceLabel('HullAndGrade')).toBe('Hull & Grade')
    expect(stockSourceLabel('Sale')).toBe('Sold')
    expect(stockSourceLabel('Purchased')).toBe('Bought in')
    expect(stockSourceLabel('SomeNewType')).toBe('Some new type')
    expect(stockSourceLabel(undefined)).toBe('—')
  })
})

describe('Roaster Workbench purchased lots', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the supplier details in a centred popup', () => {
    renderWorkbench(appData({ greenBeanLots: [purchasedLot()] }))
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: `View details of ${toRoaId(LOT_X)}` }))

    const details = screen.getByRole('dialog', { name: 'Lot details' })
    for (const text of [
      'Doi Chang',
      'Ban Mai',
      'Bourbon',
      'Natural',
      'Grade A',
      '1 Sep 2026',
      '250.00 THB',
      '20 of 25 kg',
      'Berry',
      'Bag 3 of 5',
    ]) {
      expect(within(details).getByText(text)).toBeInTheDocument()
    }
  })

  it('edits a purchased lot in the Add form, filled, and saves it', async () => {
    vi.mocked(updatePurchasedLot).mockImplementation(async (id, update) =>
      purchasedLot({
        id,
        grade: update.grade,
        initialWeightKg: update.initialWeightKg ?? 25,
        currentWeightKg: (update.initialWeightKg ?? 25) - 5,
        externalSource: {
          ...update.externalSource,
          producerName: undefined,
        } as unknown as GreenBeanLot['externalSource'],
      }),
    )
    const { handle } = renderWorkbench(appData({ greenBeanLots: [purchasedLot()] }))
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: `Edit ${toRoaId(LOT_X)}` }))

    const form = screen.getByRole('dialog')
    expect(within(form).getByText('Edit Purchased Lot')).toBeInTheDocument()
    expect(within(form).getByDisplayValue('Doi Chang')).toBeInTheDocument()
    expect(within(form).getByDisplayValue('Bag 3 of 5')).toBeInTheDocument()
    expect(
      within(form).getByText('5 kg already claimed or sold, so the weight cannot go below that.'),
    ).toBeInTheDocument()

    fireEvent.change(within(form).getByDisplayValue('Doi Chang'), {
      target: { value: 'Doi Chang Co-op' },
    })
    fireEvent.change(screen.getByLabelText(/Lot Weight \(kg\)/), { target: { value: '30' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updatePurchasedLot).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updatePurchasedLot).mock.calls[0][0]).toBe(LOT_X)
    expect(vi.mocked(updatePurchasedLot).mock.calls[0][1]).toMatchObject({
      initialWeightKg: 30,
      externalSource: { originName: 'Doi Chang Co-op', variety: 'Bourbon' },
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(handle.current.greenBeanLots[0]).toMatchObject({
      initialWeightKg: 30,
      currentWeightKg: 25,
    })
    expect(handle.current.greenBeanLots[0].externalSource?.originName).toBe('Doi Chang Co-op')
  })

  it('does not save a weight below what was already used', () => {
    renderWorkbench(appData({ greenBeanLots: [purchasedLot()] }))
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: `Edit ${toRoaId(LOT_X)}` }))
    fireEvent.change(screen.getByLabelText(/Lot Weight \(kg\)/), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(updatePurchasedLot).not.toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith({
      type: 'error',
      message:
        '5.00 kg of this lot was already claimed or sold, so its weight cannot go below 5.00 kg',
    })
  })

  it('deletes after a centred confirm, and shows the server refusal for a used lot', async () => {
    vi.mocked(deleteGreenBeanLot).mockRejectedValueOnce(
      new Error('This green bean lot already has 1 roaster stock record, so it was not deleted'),
    )
    const { handle } = renderWorkbench(appData({ greenBeanLots: [purchasedLot()] }))
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: `Delete ${toRoaId(LOT_X)}` }))

    const confirm = screen.getByRole('dialog', { name: `Delete purchased lot ${toRoaId(LOT_X)}?` })
    expect(within(confirm).getByText(/Bourbon from Doi Chang, 25 kg/)).toBeInTheDocument()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete lot' }))

    expect(await within(confirm).findByRole('alert')).toHaveTextContent(
      'This green bean lot already has 1 roaster stock record, so it was not deleted',
    )
    expect(handle.current.greenBeanLots).toHaveLength(1)

    vi.mocked(deleteGreenBeanLot).mockResolvedValueOnce(undefined)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete lot' }))
    await waitFor(() => expect(handle.current.greenBeanLots).toHaveLength(0))
    expect(deleteGreenBeanLot).toHaveBeenLastCalledWith(LOT_X)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("lets an Admin edit and delete a roaster's purchased lot, naming the buyer", () => {
    renderWorkbench(
      appData({ users: [roasterUser, otherRoaster], greenBeanLots: [purchasedLot()] }),
      adminUser,
    )
    openPurchasedTab()
    expect(screen.getByText('Bean Roasters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Edit ${toRoaId(LOT_X)}` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Delete ${toRoaId(LOT_X)}` })).toBeInTheDocument()
  })
})

describe('Roaster Workbench used-up purchased lots', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const usedUp = (over: Partial<GreenBeanLot> = {}) =>
    purchasedLot({ currentWeightKg: 0, availabilityStatus: 'Withdrawn', ...over })

  it('keeps a used-up lot under a collapsed Used up list, with View details and Edit', () => {
    renderWorkbench(appData({ greenBeanLots: [usedUp()] }))
    openPurchasedTab()

    // Off the shelf: no card and no Start roast.
    expect(screen.getByText('No purchased lots on the shelf')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start roast/ })).toBeNull()
    const toggle = screen.getByRole('button', { name: /Used up/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: `Edit ${toRoaId(LOT_X)}` })).toBeNull()

    expect(toggle).toHaveTextContent('Out of kg or withdrawn')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Bourbon · Natural · 25 kg bought/)).toBeInTheDocument()
    expect(screen.queryByText(/kg left/)).toBeNull()
    // Drawn from, so the server would refuse a delete: none is offered.
    expect(screen.queryByRole('button', { name: `Delete ${toRoaId(LOT_X)}` })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: `View details of ${toRoaId(LOT_X)}` }))
    const details = screen.getByRole('dialog', { name: 'Lot details' })
    expect(within(details).getByText('0 of 25 kg')).toBeInTheDocument()
    expect(within(details).queryByRole('button', { name: 'Delete' })).toBeNull()
    fireEvent.click(within(details).getByRole('button', { name: 'Edit lot' }))

    const form = screen.getByRole('dialog')
    expect(within(form).getByText('Edit Purchased Lot')).toBeInTheDocument()
    expect(within(form).getByDisplayValue('Doi Chang')).toBeInTheDocument()
  })

  it('offers Delete on a lot set Withdrawn that nothing was taken from', () => {
    renderWorkbench(appData({ greenBeanLots: [usedUp({ currentWeightKg: 25 })] }))
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: /Used up/ }))
    // Still holds coffee, and the row says so.
    expect(screen.getByText(/25 kg bought · Withdrawn, 25 kg left/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Delete ${toRoaId(LOT_X)}` }))
    expect(
      screen.getByRole('dialog', { name: `Delete purchased lot ${toRoaId(LOT_X)}?` }),
    ).toBeInTheDocument()
  })

  it('lists the newest used-up lots first, 20 of them until Show all', () => {
    // 23 lots added a day apart; their UUIDs sort the other way round.
    const lots = Array.from({ length: 23 }, (_, i) =>
      usedUp({
        id: `${String(90 - i).padStart(8, '0')}-0000-4000-8000-000000000000`,
        displayId: `GBL-2026-${i + 1}`,
        createdAt: `2026-08-${String(i + 1).padStart(2, '0')}T03:00:00.000Z`,
      }),
    )
    renderWorkbench(appData({ greenBeanLots: lots }))
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: /Used up/ }))

    const rows = () => within(document.getElementById('used-up-purchased-lots')!).getAllByRole('listitem')
    expect(rows()).toHaveLength(20)
    expect(rows()[0]).toHaveTextContent(toRoaId(lots[22].id))
    expect(rows()[19]).toHaveTextContent(toRoaId(lots[3].id))
    expect(screen.getByText('Newest 20 of 23')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show all 23' }))
    expect(rows()).toHaveLength(23)
    expect(rows()[22]).toHaveTextContent(toRoaId(lots[0].id))

    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(rows()).toHaveLength(20)
  })

  it('has no Show all while every used-up lot fits', () => {
    renderWorkbench(appData({ greenBeanLots: [usedUp()] }))
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: /Used up/ }))
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it("lists only the viewer's own used-up lots", () => {
    const theirs = usedUp({ id: LOT_A, createdById: otherRoaster.id })
    renderWorkbench(appData({ greenBeanLots: [usedUp(), theirs] }))
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: /Used up/ }))
    expect(screen.getByRole('button', { name: `Edit ${toRoaId(LOT_X)}` })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `Edit ${toRoaId(LOT_A)}` })).toBeNull()
  })

  it('shows the Admin every used-up lot with its buyer', () => {
    const theirs = usedUp({ id: LOT_A, createdById: otherRoaster.id })
    renderWorkbench(
      appData({ users: [roasterUser, otherRoaster], greenBeanLots: [usedUp(), theirs] }),
      adminUser,
    )
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: /Used up/ }))
    expect(screen.getByRole('button', { name: `Edit ${toRoaId(LOT_A)}` })).toBeInTheDocument()
    expect(screen.getByText(/by Hill Roasters/)).toBeInTheDocument()
  })
})

describe('Roaster Workbench Add External Lot', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createGreenBeanLot).mockImplementation(async (input) =>
      purchasedLot({
        id: LOT_A,
        displayId: 'GBL-2026-30',
        initialWeightKg: input.initialWeightKg,
        currentWeightKg: input.initialWeightKg,
        createdById: (input as { ownerId?: string }).ownerId ?? auth.currentUser?.id,
      }),
    )
  })

  const pick = (placeholder: string, option: string) => {
    fireEvent.click(screen.getByRole('button', { name: placeholder }))
    fireEvent.click(screen.getByRole('button', { name: option }))
  }

  const fillLot = () => {
    fireEvent.change(screen.getByLabelText(/Origin \/ Supplier/), { target: { value: 'Doi Chang' } })
    pick('Select variety...', 'Bourbon')
    pick('Select process type...', 'Natural')
    fireEvent.change(screen.getByLabelText(/Initial Weight \(kg\)/), { target: { value: '12' } })
  }

  it('labels every field and marks the required ones', () => {
    renderWorkbench(appData())
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: 'Add lot' }))

    for (const label of [
      /Origin \/ Supplier/,
      'Producer',
      /Initial Weight \(kg\)/,
      'Price/kg (THB)',
      'Total Price (THB)',
      'Taste Note (optional)',
      'Supplier Notes',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    for (const group of ['Variety *', 'Process Type *', 'Grade']) {
      expect(screen.getByRole('group', { name: group })).toBeInTheDocument()
    }
    // The date field is read out as "Purchase Date" with the date it shows.
    const purchaseDate = screen.getByRole('button', { name: /^Purchase Date \d{1,2} [A-Z][a-z]+ \d{4}$/ })
    expect(purchaseDate).toHaveAttribute('id', 'external-lot-purchase-date')
    expect(screen.getByText('Purchase Date').closest('label')).toHaveAttribute('for', 'external-lot-purchase-date')
    expect(screen.getByLabelText(/Origin \/ Supplier/)).toBeRequired()
    // A roaster buys for themselves: no picker.
    expect(screen.queryByRole('group', { name: 'Buying for' })).toBeNull()
  })

  it("adds a roaster's lot as theirs, with an English toast", async () => {
    const { handle } = renderWorkbench(appData())
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: 'Add lot' }))
    fillLot()
    fireEvent.click(screen.getByRole('button', { name: 'Add Lot' }))

    await waitFor(() => expect(createGreenBeanLot).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createGreenBeanLot).mock.calls[0][0]).not.toHaveProperty('ownerId')
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith({
        type: 'success',
        message: 'Purchased lot GBL-2026-30 added',
      }),
    )
    expect(handle.current.greenBeanLots.map((lot) => lot.id)).toEqual([LOT_A])
  })

  it('lets an Admin buy the lot for a roaster, who then owns it', async () => {
    const inactive: User = {
      ...otherRoaster,
      id: 'user-roaster-3',
      name: 'Gone Roasters',
      isActive: false,
    }
    renderWorkbench(
      appData({ users: [adminUser, roasterUser, otherRoaster, inactive] }),
      adminUser,
    )
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: 'Add lot' }))

    const buyer = screen.getByRole('group', { name: 'Buying for' })
    // Admin's own stock by default; the active roasters to choose from.
    fireEvent.click(within(buyer).getByRole('button', { name: 'Me (Admin)' }))
    expect(within(buyer).getByRole('button', { name: 'Bean Roasters' })).toBeInTheDocument()
    expect(within(buyer).queryByRole('button', { name: 'Gone Roasters' })).toBeNull()
    fireEvent.click(within(buyer).getByRole('button', { name: 'Hill Roasters' }))
    fillLot()
    fireEvent.click(screen.getByRole('button', { name: 'Add Lot' }))

    await waitFor(() => expect(createGreenBeanLot).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createGreenBeanLot).mock.calls[0][0]).toMatchObject({
      ownerId: otherRoaster.id,
      sourceType: 'External',
      initialWeightKg: 12,
      externalSource: { originName: 'Doi Chang', variety: 'Bourbon', processType: 'Natural' },
    })
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith({
        type: 'success',
        message: 'Purchased lot GBL-2026-30 added for Hill Roasters',
      }),
    )
  })

  it('sends no ownerId when an Admin buys for themselves', async () => {
    renderWorkbench(appData({ users: [adminUser, roasterUser] }), adminUser)
    openPurchasedTab()
    fireEvent.click(screen.getByRole('button', { name: 'Add lot' }))
    fillLot()
    fireEvent.click(screen.getByRole('button', { name: 'Add Lot' }))

    await waitFor(() => expect(createGreenBeanLot).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createGreenBeanLot).mock.calls[0][0]).not.toHaveProperty('ownerId')
  })
})

describe('Roaster Workbench internal stock', { timeout: 20000 }, () => {
  it('names how a stock row came in, not the raw enum', () => {
    renderWorkbench(appData({ roasterInventory: [stock()] }))
    expect(screen.getByText('Your internal inventory')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('View Details'))
    expect(screen.getByText('Sent for roasting')).toBeInTheDocument()
    expect(screen.queryByText('RoastingStock')).toBeNull()
  })

  it("shows a purchased lot's stock row with its lot's variety and process, bought in", () => {
    renderWorkbench(
      appData({
        greenBeanLots: [purchasedLot()],
        roasterInventory: [
          stock({
            greenBeanLotId: LOT_X,
            variety: undefined,
            process: undefined,
            withdrawalType: undefined,
          }),
        ],
      }),
    )
    fireEvent.click(screen.getByTitle('View Details'))
    expect(screen.getByText('How it came in')).toBeInTheDocument()
    expect(screen.getByText('Bought in')).toBeInTheDocument()
    expect(screen.getAllByText('Bourbon').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Natural').length).toBeGreaterThan(0)
  })

  it("titles an Admin's view for the roasters and names each row's roaster", () => {
    renderWorkbench(
      appData({
        users: [roasterUser, otherRoaster],
        roasterInventory: [stock(), stock({ id: 'inv-2', roasterId: otherRoaster.id })],
      }),
      adminUser,
    )
    expect(screen.getByText("Roasters' internal inventory")).toBeInTheDocument()
    expect(screen.queryByText('Your internal inventory')).toBeNull()
    expect(screen.getByText('Bean Roasters')).toBeInTheDocument()
    expect(screen.getByText('Hill Roasters')).toBeInTheDocument()
  })
})
