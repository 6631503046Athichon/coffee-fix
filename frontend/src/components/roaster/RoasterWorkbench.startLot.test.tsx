import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GreenBeanSourceType, UserRole } from '../../types'
import type { AppData, GreenBeanLot, RoastBatch, RoasterInventoryItem, User } from '../../types'
import { claimGreenBeanLot, createRoastBatch } from '../../services/roaster/roasterService'
import {
  createSaleOrder,
  getSellableGreenLots,
  getSellableRoasts,
} from '../../services/sales/saleOrderService'
import {
  TestDataProvider,
  adminUser,
  appData,
  customer,
  roasterUser,
  sale,
  sellableGreen,
} from '../../test/salesFixtures'
import type { TestDataHandle } from '../../test/salesFixtures'
import { toRoaId } from '../../utils/formatters'
import RoasterWorkbench from './RoasterWorkbench'

const { auth, addToast } = vi.hoisted(() => ({
  auth: { currentUser: null as User | null },
  addToast: vi.fn(),
}))

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
vi.mock('../common/DatePicker', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))
vi.mock('../../services/roaster/roasterService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/roaster/roasterService')>()),
  claimGreenBeanLot: vi.fn(),
  createRoastBatch: vi.fn(),
}))
vi.mock('../../services/sales/saleOrderService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/sales/saleOrderService')>()),
  getSellableRoasts: vi.fn(),
  getSellableGreenLots: vi.fn(),
  createSaleOrder: vi.fn(),
}))

// Real UUIDs, so the ROA ids read like the ones on the roaster pages.
const LOT_A = 'a3bb189e-8bf9-4888-9912-ace4e6543002'
const LOT_X = '5f0c2d7e-1b2a-4c3d-8e4f-9a0b1c2d3e4f'

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
  ...over,
})

const purchasedLot = (over: Partial<GreenBeanLot> = {}): GreenBeanLot => ({
  id: LOT_X,
  displayId: 'GBL-2026-12',
  sourceType: GreenBeanSourceType.External,
  externalSource: {
    originName: 'Doi Chang',
    variety: 'Bourbon',
    processType: 'Natural',
    purchaseDate: '2026-09-01',
    pricePerKg: 250,
    currency: 'THB',
  },
  grade: 'Grade A',
  initialWeightKg: 25,
  currentWeightKg: 25,
  availabilityStatus: 'Available',
  cuppingScores: [],
  // The roaster bought it in: only its buyer (or an Admin) sees it on the
  // purchased shelf
  createdById: roasterUser.id,
  ...over,
})

const renderWorkbench = (
  data: AppData = appData({ customers: [customer()], roasterInventory: [stock()] }),
  user: User = roasterUser,
  refreshData: () => Promise<void> = async () => {},
) => {
  auth.currentUser = user
  const handle: TestDataHandle = { current: data }
  render(
    <MemoryRouter initialEntries={['/roaster']}>
      <TestDataProvider initial={data} dataRef={handle} refreshData={refreshData}>
        <RoasterWorkbench currentUser={user} />
      </TestDataProvider>
    </MemoryRouter>,
  )
  return { handle }
}

/** A promise the test settles by hand. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const withPurchasedLot = (over: Partial<GreenBeanLot> = {}, inventory = [stock()]) =>
  appData({ customers: [customer()], roasterInventory: inventory, greenBeanLots: [purchasedLot(over)] })

// Customer and 2 kg at 300 on the preselected green line.
const fillSale = async () => {
  await waitFor(() => expect(itemPicker()).toHaveTextContent('12 kg left'))
  const customerGroup = screen.getByRole('group', { name: 'Customer' })
  fireEvent.click(within(customerGroup).getByRole('button'))
  fireEvent.click(within(customerGroup).getByRole('button', { name: 'Cafe Aroma (Retailer)' }))
  fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '300' } })
}

const recordSale = () =>
  fireEvent.click(within(sellPane()).getByRole('button', { name: 'Record sale' }))

// For a save the test settles by hand; a save that resolves at once is
// clicked right before a waitFor, so it lands inside act.
const fillAndRecordSale = async () => {
  await fillSale()
  recordSale()
}

const startLot = () => screen.getByRole('dialog')
const chips = () => within(startLot()).getByRole('group', { name: 'Roast or sell this lot' })
const chip = (name: 'Roast' | 'Sell') =>
  within(chips()).getByRole('button', { name: new RegExp(`^${name}`) })
// jsdom ignores Tailwind's `hidden`, so each pane is found through a field only it has.
const roastPane = () => screen.getByLabelText('Green beans in').closest('form') as HTMLElement
const sellPane = () => screen.getByLabelText('Notes').closest('form')?.parentElement as HTMLElement
const claimStep = () => screen.getByLabelText('Green beans to sell').closest('form') as HTMLElement
const itemPicker = () =>
  within(screen.getByRole('group', { name: 'Item for line 1' })).getAllByRole('button')[0]

const openPurchasedLot = () => {
  fireEvent.click(screen.getByRole('button', { name: /Purchased Lots/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))
}

describe('RoasterWorkbench Start roast popup', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSellableRoasts).mockResolvedValue({ roasts: [], missingWeightCount: 0 })
    vi.mocked(getSellableGreenLots).mockResolvedValue([
      sellableGreen({ id: 'inv-1', label: toRoaId(LOT_A), greenBeanLotId: LOT_A, availableKg: 12 }),
    ])
  })

  it('opens on Roast for an internal lot', () => {
    renderWorkbench()
    // The card shows the green lot's ROA id (not the stock row's), as the popup does.
    const start = screen.getByRole('button', { name: 'Start roast' })
    expect(within(start.closest('article') as HTMLElement).getByText(toRoaId(LOT_A))).toBeInTheDocument()
    fireEvent.click(start)

    expect(screen.getByRole('dialog', { name: 'Log a new roast' })).toBeInTheDocument()
    expect(within(startLot()).getByText(toRoaId(LOT_A))).toBeInTheDocument()
    expect(chip('Roast')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Sell')).toHaveAttribute('aria-pressed', 'false')
    expect(within(roastPane()).getByRole('button', { name: 'Log Roast' })).toBeInTheDocument()
    // The sale form (and its stock lists) loads only once Sell is chosen.
    expect(getSellableGreenLots).not.toHaveBeenCalled()
  })

  it('keeps what was typed in each pane when switching between Roast and Sell', async () => {
    renderWorkbench()
    fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))
    fireEvent.change(screen.getByLabelText('Green beans in'), { target: { value: '4' } })

    fireEvent.click(chip('Sell'))
    expect(screen.getByRole('dialog', { name: 'Sell green beans' })).toBeInTheDocument()
    expect(within(startLot()).getByText(/in your stock/)).toBeInTheDocument()
    await waitFor(() =>
      expect(itemPicker()).toHaveTextContent(
        `Green beans · ${toRoaId(LOT_A)} · GBL-2026-9 · Grade A Typica Washed`,
      ),
    )
    expect(roastPane()).toHaveAttribute('inert')
    expect(sellPane()).not.toHaveAttribute('inert')
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Pick up Friday' } })

    fireEvent.click(chip('Roast'))
    expect(screen.getByRole('dialog', { name: 'Log a new roast' })).toBeInTheDocument()
    expect(screen.getByLabelText('Green beans in')).toHaveValue(4)
    expect(sellPane()).toHaveAttribute('inert')
    expect(roastPane()).not.toHaveAttribute('inert')

    fireEvent.click(chip('Sell'))
    expect(screen.getByLabelText('Notes')).toHaveValue('Pick up Friday')
    expect(getSellableGreenLots).toHaveBeenCalledTimes(1)
  })

  it('records the green-bean sale, patches the stock row and closes', async () => {
    vi.mocked(createSaleOrder).mockResolvedValue({
      saleOrder: sale({ id: 'sale-new', orderNumber: 'ORD-2026-0042' }),
      affectedRoastBatches: [],
      affectedInventoryItems: [{ id: 'inv-1', remainingWeightKg: 10 }],
    })
    const { handle } = renderWorkbench()
    fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))
    fireEvent.click(chip('Sell'))
    await waitFor(() => expect(itemPicker()).toHaveTextContent('12 kg left'))

    const customerGroup = screen.getByRole('group', { name: 'Customer' })
    fireEvent.click(within(customerGroup).getByRole('button'))
    fireEvent.click(within(customerGroup).getByRole('button', { name: 'Cafe Aroma (Retailer)' }))
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '300' } })
    fireEvent.click(within(sellPane()).getByRole('button', { name: 'Record sale' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(vi.mocked(createSaleOrder).mock.calls[0][0].items).toEqual([
      { roasterInventoryId: 'inv-1', quantity: 2, pricePerKg: 300 },
    ])
    await waitFor(() =>
      expect(handle.current.roasterInventory.find((i) => i.id === 'inv-1')?.remainingWeightKg).toBe(
        10,
      ),
    )
    expect(addToast).toHaveBeenCalledWith({
      type: 'success',
      message: 'Sale ORD-2026-0042 recorded',
    })
  })

  it('claims a purchased lot before selling it, and roasts from that stock row afterwards', async () => {
    const claimed = stock({
      id: 'inv-new',
      greenBeanLotId: LOT_X,
      claimedWeightKg: 3,
      remainingWeightKg: 3,
    })
    vi.mocked(claimGreenBeanLot).mockResolvedValue({
      inventoryItem: claimed,
      updatedSourceLot: { id: LOT_X, currentWeightKg: 22, availabilityStatus: 'Available' },
    })
    vi.mocked(getSellableGreenLots).mockResolvedValue([
      sellableGreen({
        id: 'inv-new',
        label: toRoaId(LOT_X),
        greenBeanLotId: LOT_X,
        availableKg: 3,
      }),
    ])
    vi.mocked(createRoastBatch).mockResolvedValue({
      roastBatch: {
        id: 'rb-new',
        roasterId: roasterUser.id,
        roasterInventoryId: 'inv-new',
        greenBeanLotId: LOT_X,
        roastDate: '2026-09-23',
        batchSizeKg: 2,
        yieldPercentage: 85,
        roastProfileNotes: 'No notes',
      },
      updatedInventory: { ...claimed, remainingWeightKg: 1 },
    } as Awaited<ReturnType<typeof createRoastBatch>>)
    const { handle } = renderWorkbench(
      appData({
        customers: [customer()],
        roasterInventory: [stock()],
        greenBeanLots: [purchasedLot()],
      }),
    )
    openPurchasedLot()
    fireEvent.click(chip('Sell'))

    expect(
      within(startLot()).getByText('Claim the green beans you are selling'),
    ).toBeInTheDocument()
    expect(within(startLot()).getByText(/on the shelf/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Green beans to sell'), { target: { value: '3' } })
    fireEvent.click(within(claimStep()).getByRole('button', { name: 'Claim Stock' }))

    await waitFor(() => expect(itemPicker()).toHaveTextContent(`Green beans · ${toRoaId(LOT_X)}`))
    expect(claimGreenBeanLot).toHaveBeenCalledWith(LOT_X, 3)
    expect(screen.getByLabelText('Kg')).toHaveValue('3')
    expect(handle.current.roasterInventory.map((i) => i.id)).toEqual(['inv-1', 'inv-new'])
    expect(handle.current.greenBeanLots[0].currentWeightKg).toBe(22)
    expect(addToast).toHaveBeenCalledWith({
      type: 'success',
      message: 'Claimed 3 kg into your stock. They stay there if you cancel the sale.',
    })

    fireEvent.click(chip('Roast'))
    fireEvent.change(screen.getByLabelText('Green beans in'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Roasted beans out'), { target: { value: '1.7' } })
    fireEvent.click(within(roastPane()).getByRole('button', { name: 'Log Roast' }))

    await waitFor(() => expect(createRoastBatch).toHaveBeenCalled())
    expect(vi.mocked(createRoastBatch).mock.calls[0][0]).toMatchObject({
      roasterInventoryId: 'inv-new',
      greenBeanLotId: LOT_X,
      batchSizeKg: 2,
    })
    expect(claimGreenBeanLot).toHaveBeenCalledTimes(1)
  })

  it('sells from stock already held of a purchased lot without claiming again', async () => {
    const held = stock({ id: 'inv-x', greenBeanLotId: LOT_X, remainingWeightKg: 5 })
    vi.mocked(getSellableGreenLots).mockResolvedValue([
      sellableGreen({ id: 'inv-x', label: toRoaId(LOT_X), greenBeanLotId: LOT_X, availableKg: 5 }),
    ])
    renderWorkbench(
      appData({
        customers: [customer()],
        roasterInventory: [held],
        greenBeanLots: [purchasedLot()],
      }),
    )
    openPurchasedLot()
    fireEvent.click(chip('Sell'))

    expect(within(startLot()).getByText(/You already have/)).toHaveTextContent(
      'You already have 5 kg of this lot in your stock.',
    )
    fireEvent.click(within(startLot()).getByRole('button', { name: 'Sell from my stock' }))

    await waitFor(() => expect(itemPicker()).toHaveTextContent(`Green beans · ${toRoaId(LOT_X)}`))
    expect(itemPicker()).toHaveTextContent('5 kg left')
    expect(claimGreenBeanLot).not.toHaveBeenCalled()
  })

  it("offers an Admin the buyer's stock of a roaster's purchased lot, not an Admin row", async () => {
    // An old Admin row of the lot (from before claims went to the buyer) and
    // the roaster's own row: only the roaster's is the lot's stock.
    const adminRow = stock({
      id: 'inv-admin',
      roasterId: adminUser.id,
      greenBeanLotId: LOT_X,
      remainingWeightKg: 7,
    })
    const roasterRow = stock({ id: 'inv-x', greenBeanLotId: LOT_X, remainingWeightKg: 5 })
    vi.mocked(getSellableGreenLots).mockResolvedValue([
      sellableGreen({ id: 'inv-x', label: toRoaId(LOT_X), greenBeanLotId: LOT_X, availableKg: 5 }),
    ])
    renderWorkbench(
      appData({
        customers: [customer()],
        roasterInventory: [adminRow, roasterRow],
        greenBeanLots: [purchasedLot()],
        users: [adminUser, roasterUser],
      }),
      adminUser,
    )
    openPurchasedLot()
    fireEvent.click(chip('Sell'))

    expect(within(startLot()).getByText(/already has/)).toHaveTextContent(
      'Bean Roasters already has 5 kg of this lot in their stock.',
    )
    fireEvent.click(within(startLot()).getByRole('button', { name: 'Sell from their stock' }))

    await waitFor(() => expect(itemPicker()).toHaveTextContent('5 kg left'))
    expect(within(startLot()).getByText(/Selling for/)).toHaveTextContent('Selling for Bean Roasters')
    expect(getSellableGreenLots).toHaveBeenCalledWith(roasterUser.id)
    expect(claimGreenBeanLot).not.toHaveBeenCalled()
  })

  it("tells an Admin a claim of a roaster's purchased lot went into that roaster's stock", async () => {
    const claimed = stock({
      id: 'inv-new',
      greenBeanLotId: LOT_X,
      claimedWeightKg: 3,
      remainingWeightKg: 3,
    })
    vi.mocked(claimGreenBeanLot).mockResolvedValue({
      inventoryItem: claimed,
      updatedSourceLot: { id: LOT_X, currentWeightKg: 22, availabilityStatus: 'Available' },
    })
    vi.mocked(getSellableGreenLots).mockResolvedValue([
      sellableGreen({ id: 'inv-new', label: toRoaId(LOT_X), greenBeanLotId: LOT_X, availableKg: 3 }),
    ])
    renderWorkbench(
      appData({
        customers: [customer()],
        roasterInventory: [],
        greenBeanLots: [purchasedLot()],
        users: [adminUser, roasterUser],
      }),
      adminUser,
    )
    openPurchasedLot()
    fireEvent.click(chip('Sell'))

    expect(within(claimStep()).getByText(/into Bean Roasters's/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Green beans to sell'), { target: { value: '3' } })
    fireEvent.click(within(claimStep()).getByRole('button', { name: 'Claim Stock' }))

    await waitFor(() => expect(itemPicker()).toHaveTextContent('3 kg left'))
    expect(addToast).toHaveBeenCalledWith({
      type: 'success',
      message: "Claimed 3 kg into Bean Roasters's stock. They stay there if you cancel the sale.",
    })
    expect(within(startLot()).getByText(/Selling for/)).toHaveTextContent('Selling for Bean Roasters')
  })

  it("claims the shelf's exact kg when Use all is picked", async () => {
    const shelf = 0.19999999999999998
    vi.mocked(claimGreenBeanLot).mockResolvedValue({
      inventoryItem: stock({ id: 'inv-new', greenBeanLotId: LOT_X, remainingWeightKg: shelf }),
      updatedSourceLot: { id: LOT_X, currentWeightKg: 0, availabilityStatus: 'Withdrawn' },
    })
    renderWorkbench(
      appData({
        customers: [customer()],
        roasterInventory: [stock()],
        greenBeanLots: [purchasedLot({ currentWeightKg: shelf })],
      }),
    )
    openPurchasedLot()
    fireEvent.click(chip('Sell'))

    // The roast pane has its own Use all; this one is the claim step's.
    fireEvent.click(within(claimStep()).getByRole('button', { name: 'Use all 0.2 kg' }))
    expect(screen.getByLabelText('Green beans to sell')).toHaveValue('0.2')
    fireEvent.click(within(claimStep()).getByRole('button', { name: 'Claim Stock' }))

    await waitFor(() => expect(claimGreenBeanLot).toHaveBeenCalledWith(LOT_X, shelf))
  })

  it('refuses a claim above the shelf without calling the server', () => {
    renderWorkbench(
      appData({
        customers: [customer()],
        roasterInventory: [stock()],
        greenBeanLots: [purchasedLot()],
      }),
    )
    openPurchasedLot()
    fireEvent.click(chip('Sell'))

    fireEvent.click(within(claimStep()).getByRole('button', { name: 'Claim Stock' }))
    expect(within(claimStep()).getByRole('alert')).toHaveTextContent('Enter the kg you are selling')
    fireEvent.change(screen.getByLabelText('Green beans to sell'), { target: { value: '26' } })
    fireEvent.click(within(claimStep()).getByRole('button', { name: 'Claim Stock' }))
    expect(within(claimStep()).getByRole('alert')).toHaveTextContent(
      'At most 25 kg are on the shelf',
    )
    expect(claimGreenBeanLot).not.toHaveBeenCalled()
  })

  it("lets an Admin sell another roaster's stock, recorded for that roaster", async () => {
    vi.mocked(createSaleOrder).mockResolvedValue({
      saleOrder: sale({ id: 'sale-new', orderNumber: 'ORD-2026-0042' }),
      affectedRoastBatches: [],
      affectedInventoryItems: [{ id: 'inv-1', remainingWeightKg: 10 }],
    })
    const { handle } = renderWorkbench(
      appData({ customers: [customer()], roasterInventory: [stock()], users: [adminUser, roasterUser] }),
      adminUser,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))

    expect(chip('Roast')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Sell')).toBeEnabled()
    expect(chip('Sell')).not.toHaveAttribute('title')
    fireEvent.click(chip('Sell'))

    expect(within(startLot()).getByText(/Selling for/)).toHaveTextContent(
      `Lot ${toRoaId(LOT_A)} · 12 kg in stock · Selling for Bean Roasters`,
    )
    // The row names the seller, so the form asks for no roaster of its own.
    expect(screen.queryByRole('group', { name: 'Sell for' })).not.toBeInTheDocument()
    await fillSale()
    recordSale()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(getSellableGreenLots).toHaveBeenCalledWith(roasterUser.id)
    expect(getSellableRoasts).toHaveBeenCalledWith(roasterUser.id)
    expect(vi.mocked(createSaleOrder).mock.calls[0][0]).toMatchObject({
      sellerId: roasterUser.id,
      items: [{ roasterInventoryId: 'inv-1', quantity: 2, pricePerKg: 300 }],
    })
    await waitFor(() =>
      expect(handle.current.roasterInventory.find((i) => i.id === 'inv-1')?.remainingWeightKg).toBe(
        10,
      ),
    )
  })

  it('names the seller "this roaster" when the users list does not have them', async () => {
    renderWorkbench(appData({ customers: [customer()], roasterInventory: [stock()] }), adminUser)
    fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))
    fireEvent.click(chip('Sell'))

    expect(within(startLot()).getByText(/Selling for/)).toHaveTextContent('Selling for this roaster')
    await waitFor(() => expect(itemPicker()).toHaveTextContent('12 kg left'))
  })

  it('sells an Admin their own stock without naming a seller', async () => {
    vi.mocked(createSaleOrder).mockResolvedValue({
      saleOrder: sale({ id: 'sale-new', createdBy: adminUser.id }),
      affectedRoastBatches: [],
      affectedInventoryItems: [],
    })
    renderWorkbench(
      appData({
        customers: [customer()],
        roasterInventory: [stock({ roasterId: adminUser.id })],
        users: [adminUser, roasterUser],
      }),
      adminUser,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))
    fireEvent.click(chip('Sell'))

    expect(within(startLot()).getByText(/in your stock/)).toBeInTheDocument()
    expect(within(startLot()).queryByText(/Selling for/)).not.toBeInTheDocument()
    await fillSale()
    recordSale()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(getSellableGreenLots).toHaveBeenCalledWith(undefined)
    expect(vi.mocked(createSaleOrder).mock.calls[0][0]).not.toHaveProperty('sellerId')
  })

  it('does not offer Sell to an Admin on stock whose owner is not a roaster', () => {
    const otherAdmin: User = { id: 'user-admin-2', name: 'Second Admin', roles: [UserRole.Admin] }
    renderWorkbench(
      appData({
        customers: [customer()],
        roasterInventory: [stock({ roasterId: otherAdmin.id })],
        users: [adminUser, otherAdmin, roasterUser],
      }),
      adminUser,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))

    expect(chip('Sell')).toBeDisabled()
    expect(chip('Sell')).toHaveAttribute('title', "Only a roaster's stock can be sold for them")
    expect(getSellableGreenLots).not.toHaveBeenCalled()
  })

  it("keeps a roast an Admin logs from a roaster's stock in the Roast Log, with that row's flavors", async () => {
    const roastOf = (over: Partial<RoastBatch>) =>
      ({
        roasterId: roasterUser.id,
        roasterInventoryId: 'inv-1',
        greenBeanLotId: LOT_A,
        roastDate: '2026-09-20',
        batchSizeKg: 2,
        yieldPercentage: 85,
        roastProfileNotes: 'No notes',
        ...over,
      }) as RoastBatch
    // Logged by the roaster themselves on this row.
    const earlier = roastOf({ id: 'rb-old', flavorNotes: 'Cocoa, Honey' })
    vi.mocked(createRoastBatch).mockResolvedValue({
      // The server records the roast for the owner of the beans.
      roastBatch: roastOf({ id: '0000d431-aaaa-4bbb-8ccc-dddddddddddd', roastDate: '2026-09-23' }),
      updatedInventory: { ...stock(), remainingWeightKg: 10 },
    } as Awaited<ReturnType<typeof createRoastBatch>>)
    renderWorkbench(
      appData({
        customers: [customer()],
        roasterInventory: [stock()],
        roastBatches: [earlier],
        users: [adminUser, roasterUser],
      }),
      adminUser,
    )
    expect(screen.getAllByRole('button', { name: /^View details of roast/ })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))
    fireEvent.change(screen.getByLabelText('Green beans in'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Roasted beans out'), { target: { value: '1.7' } })
    fireEvent.click(within(roastPane()).getByRole('button', { name: 'Log Roast' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(vi.mocked(createRoastBatch).mock.calls[0][0]).toMatchObject({
      roasterInventoryId: 'inv-1',
      flavorNotes: 'Cocoa, Honey',
    })
    expect(addToast).toHaveBeenCalledWith({
      type: 'success',
      message: 'Roast RB-4321 logged (2 kg)',
    })
    expect(screen.getAllByRole('button', { name: /^View details of roast/ })).toHaveLength(2)
  })

  it('tops up the stock row a claim returns instead of adding a second copy', async () => {
    // Held but empty, so the claim step shows (no "Sell from my stock").
    const empty = stock({ id: 'inv-x', greenBeanLotId: LOT_X, claimedWeightKg: 20, remainingWeightKg: 0 })
    vi.mocked(claimGreenBeanLot).mockResolvedValue({
      inventoryItem: { ...empty, claimedWeightKg: 23, remainingWeightKg: 3 },
      updatedSourceLot: { id: LOT_X, currentWeightKg: 22, availabilityStatus: 'Available' },
    })
    vi.mocked(getSellableGreenLots).mockResolvedValue([
      sellableGreen({ id: 'inv-x', label: toRoaId(LOT_X), greenBeanLotId: LOT_X, availableKg: 3 }),
    ])
    const { handle } = renderWorkbench(withPurchasedLot({}, [stock(), empty]))
    openPurchasedLot()
    fireEvent.click(chip('Sell'))
    expect(within(startLot()).queryByText(/You already have/)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Green beans to sell'), { target: { value: '3' } })
    fireEvent.click(within(claimStep()).getByRole('button', { name: 'Claim Stock' }))

    await waitFor(() => expect(itemPicker()).toHaveTextContent(`Green beans · ${toRoaId(LOT_X)}`))
    expect(handle.current.roasterInventory.map((i) => i.id)).toEqual(['inv-1', 'inv-x'])
    expect(handle.current.roasterInventory.find((i) => i.id === 'inv-x')?.remainingWeightKg).toBe(3)
  })

  it('shows a failed claim inline, lets it be tried again and reloads the shelf', async () => {
    const refreshData = vi.fn(async () => {})
    vi.mocked(claimGreenBeanLot).mockRejectedValue(new Error('Insufficient weight available'))
    renderWorkbench(withPurchasedLot(), roasterUser, refreshData)
    openPurchasedLot()
    fireEvent.click(chip('Sell'))

    fireEvent.change(screen.getByLabelText('Green beans to sell'), { target: { value: '3' } })
    fireEvent.click(within(claimStep()).getByRole('button', { name: 'Claim Stock' }))

    await waitFor(() =>
      expect(within(claimStep()).getByRole('alert')).toHaveTextContent('Insufficient weight available'),
    )
    expect(within(claimStep()).getByRole('button', { name: 'Claim Stock' })).toBeEnabled()
    expect(screen.getByLabelText('Green beans to sell')).toHaveValue('3')
    expect(refreshData).toHaveBeenCalledTimes(1)
  })

  it('refuses a claim that would leave 0.01 kg or less to sell', () => {
    renderWorkbench(withPurchasedLot())
    openPurchasedLot()
    fireEvent.click(chip('Sell'))

    fireEvent.change(screen.getByLabelText('Green beans to sell'), { target: { value: '0.01' } })
    fireEvent.click(within(claimStep()).getByRole('button', { name: 'Claim Stock' }))

    expect(within(claimStep()).getByRole('alert')).toHaveTextContent(
      'Claim more than 0.01 kg to sell it',
    )
    expect(claimGreenBeanLot).not.toHaveBeenCalled()
  })

  it('fills in kg the stock can cover when Use all claims a shelf with more than 3 decimals', async () => {
    const shelf = 12.3456
    vi.mocked(claimGreenBeanLot).mockResolvedValue({
      inventoryItem: stock({ id: 'inv-new', greenBeanLotId: LOT_X, remainingWeightKg: shelf }),
      updatedSourceLot: { id: LOT_X, currentWeightKg: 0, availabilityStatus: 'Withdrawn' },
    })
    // The server lists the free kg rounded down to the gram.
    vi.mocked(getSellableGreenLots).mockResolvedValue([
      sellableGreen({ id: 'inv-new', label: toRoaId(LOT_X), greenBeanLotId: LOT_X, availableKg: 12.345 }),
    ])
    renderWorkbench(withPurchasedLot({ currentWeightKg: shelf }))
    openPurchasedLot()
    fireEvent.click(chip('Sell'))

    fireEvent.click(within(claimStep()).getByRole('button', { name: 'Use all 12.346 kg' }))
    fireEvent.click(within(claimStep()).getByRole('button', { name: 'Claim Stock' }))

    await waitFor(() => expect(itemPicker()).toHaveTextContent('12.345 kg left'))
    expect(claimGreenBeanLot).toHaveBeenCalledWith(LOT_X, shelf)
    expect(screen.getByLabelText('Kg')).toHaveValue('12.345')
    expect(screen.getByLabelText('Kg')).not.toHaveAttribute('aria-invalid', 'true')
    expect(within(sellPane()).queryByText(/^Only .* left$/)).not.toBeInTheDocument()
  })

  it('does not switch or reopen a popup when a claim lands after it was closed', async () => {
    const claim = deferred<Awaited<ReturnType<typeof claimGreenBeanLot>>>()
    vi.mocked(claimGreenBeanLot).mockReturnValue(claim.promise)
    const { handle } = renderWorkbench(withPurchasedLot())
    openPurchasedLot()
    fireEvent.click(chip('Sell'))
    fireEvent.change(screen.getByLabelText('Green beans to sell'), { target: { value: '3' } })
    fireEvent.click(within(claimStep()).getByRole('button', { name: 'Claim Stock' }))

    // Closed while the claim is in flight, then another lot opened.
    fireEvent.click(within(startLot()).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Internal Lots/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))
    fireEvent.change(screen.getByLabelText('Green beans in'), { target: { value: '4' } })

    claim.resolve({
      inventoryItem: stock({ id: 'inv-new', greenBeanLotId: LOT_X, remainingWeightKg: 3 }),
      updatedSourceLot: { id: LOT_X, currentWeightKg: 22, availabilityStatus: 'Available' },
    })

    // The stock still lands in the app data...
    await waitFor(() =>
      expect(handle.current.roasterInventory.map((i) => i.id)).toEqual(['inv-1', 'inv-new']),
    )
    // ...but the popup open now is left as it was.
    expect(screen.getByRole('dialog', { name: 'Log a new roast' })).toBeInTheDocument()
    expect(chip('Roast')).toHaveAttribute('aria-pressed', 'true')
    expect(within(startLot()).getByText(toRoaId(LOT_A))).toBeInTheDocument()
    expect(screen.getByLabelText('Green beans in')).toHaveValue(4)
    expect(getSellableGreenLots).not.toHaveBeenCalled()
  })

  it('leaves the next popup open when a sale saved from a closed one finishes', async () => {
    const save = deferred<Awaited<ReturnType<typeof createSaleOrder>>>()
    vi.mocked(createSaleOrder).mockReturnValue(save.promise)
    renderWorkbench()
    fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))
    fireEvent.click(chip('Sell'))
    await fillAndRecordSale()
    // The form's own Cancel waits for the save; the popup's X does not.
    expect(within(sellPane()).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    fireEvent.click(within(startLot()).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))
    fireEvent.change(screen.getByLabelText('Green beans in'), { target: { value: '4' } })
    save.resolve({
      saleOrder: sale({ id: 'sale-new', orderNumber: 'ORD-2026-0042' }),
      affectedRoastBatches: [],
      affectedInventoryItems: [{ id: 'inv-1', remainingWeightKg: 10 }],
    })

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith({ type: 'success', message: 'Sale ORD-2026-0042 recorded' }),
    )
    expect(screen.getByRole('dialog', { name: 'Log a new roast' })).toBeInTheDocument()
    expect(screen.getByLabelText('Green beans in')).toHaveValue(4)
  })

  it('still reports a sale that fails after its popup was closed with Escape', async () => {
    const save = deferred<Awaited<ReturnType<typeof createSaleOrder>>>()
    vi.mocked(createSaleOrder).mockReturnValue(save.promise)
    renderWorkbench()
    fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))
    fireEvent.click(chip('Sell'))
    await fillAndRecordSale()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    save.reject(new Error('Not enough green beans left in ROA-7742'))

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith({
        type: 'error',
        message: 'Not enough green beans left in ROA-7742',
      }),
    )
  })

  it('closes only New customer on Escape and keeps what was typed in both panes', async () => {
    renderWorkbench()
    fireEvent.click(screen.getByRole('button', { name: 'Start roast' }))
    fireEvent.change(screen.getByLabelText('Green beans in'), { target: { value: '4' } })
    fireEvent.click(chip('Sell'))
    await waitFor(() => expect(itemPicker()).toHaveTextContent('12 kg left'))
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Pick up Friday' } })

    fireEvent.click(within(sellPane()).getByRole('button', { name: 'New customer' }))
    expect(screen.getByRole('dialog', { name: 'Create New Customer' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Create New Customer' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Sell green beans' })).toBeInTheDocument()
    expect(screen.getByLabelText('Notes')).toHaveValue('Pick up Friday')
    fireEvent.click(chip('Roast'))
    expect(screen.getByLabelText('Green beans in')).toHaveValue(4)
  })

  it("lists another user's bought-in lot only for an Admin, never for another roaster", () => {
    const othersLot = purchasedLot({ createdById: 'user-someone-else' })
    renderWorkbench(appData({ customers: [customer()], roasterInventory: [stock()], greenBeanLots: [othersLot] }))
    fireEvent.click(screen.getByRole('button', { name: /Purchased Lots/ }))
    expect(screen.queryByRole('button', { name: 'Start roast' })).toBeNull()
    cleanup()

    renderWorkbench(
      appData({ customers: [customer()], roasterInventory: [stock()], greenBeanLots: [othersLot] }),
      adminUser,
    )
    fireEvent.click(screen.getByRole('button', { name: /Purchased Lots/ }))
    expect(screen.getByRole('button', { name: 'Start roast' })).toBeInTheDocument()
  })
})
