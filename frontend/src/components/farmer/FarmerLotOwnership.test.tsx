import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { UserRole } from '../../types'
import type { AppData, Farm, HarvestLot, User } from '../../types'
import { api } from '../../services/api'
import FarmerDataHub from './FarmerDataHub'
import FarmerDashboard from './FarmerDashboard'
import HarvestLotsManagement from './HarvestLotsManagement'
import HarvestLotModal from './modals/HarvestLotModal'

// The farmer pages decide whose lots are whose by user id (the lot's farm's
// owner), never by comparing the name on the lot with the user's name: a
// renamed farmer, or a farm an Admin gave to someone else, keeps its lots.

vi.mock('../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

let auth: { currentUser: User | null } = { currentUser: null }
// Who the mocked useAuth returns; the harnesses sign in before rendering.
const signIn = (user: User) => { auth = { currentUser: user } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))

// Renamed since the lot was recorded as "Somchai".
const renamedFarmer: User = { id: 'u-farmer', name: 'Somchai Jaidee', roles: [UserRole.Farmer] }
// A farmer who also processes: the backend also sends this account other
// farmers' lots (every lot still Ready for Processing, as to any Processor).
const farmerProcessor: User = { id: 'u-farmer', name: 'Somchai', roles: [UserRole.Farmer, UserRole.Processor] }
const admin: User = { id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }

const farms: Farm[] = [
  { id: 'farm-1', farmName: 'Doi Farm', name: 'Doi Farm', location: 'Chiang Rai', farmerName: 'Somchai Jaidee', ownerUserId: 'u-farmer', varieties: ['Catimor'] },
  {
    id: 'farm-2', farmName: 'Mae Farm', name: 'Mae Farm', location: 'Nan', farmerName: 'Malee', ownerUserId: 'u-malee', varieties: ['Typica'],
    // The farmer helps out here, but the farm and its lots are Malee's.
    collaborators: [{ id: 'c-1', farmId: 'farm-2', userId: 'u-farmer' }],
  },
]

const lot = (overrides: Partial<HarvestLot>): HarvestLot => ({
  id: 'hl-1', displayId: 'HL-2026-001', farmId: 'farm-1', farmerName: 'Somchai',
  cherryVariety: 'Catimor', weightKg: 400, farmPlotLocation: 'Chiang Rai',
  harvestDate: '2026-09-15', status: 'Ready for Processing',
  ...overrides,
})

const ownLot = lot({})
// Malee's lot, named after a "Somchai" (the same name as the farmer's).
const othersLot = lot({ id: 'hl-2', displayId: 'HL-2026-002', farmId: 'farm-2', farmerName: 'Somchai', farmPlotLocation: 'Nan', weightKg: 900 })

const Harness: React.FC<{ user: User; lots: HarvestLot[]; children: React.ReactNode }> = ({ user, lots, children }) => {
  signIn(user)
  const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, farms, harvestLots: lots })
  return (
    <MemoryRouter>
      <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
        {children}
      </DataContext.Provider>
    </MemoryRouter>
  )
}

describe('Farmer pages find the farmer\'s lots by farm owner, not by name', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('Data Hub: a renamed farmer still sees and can edit their lot', () => {
    render(<Harness user={renamedFarmer} lots={[ownLot]}><FarmerDataHub currentUser={renamedFarmer} /></Harness>)

    expect(screen.getByText('HL-2026-001')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-001' })).toBeInTheDocument()
  })

  it('Data Hub: another farmer\'s lot is neither listed nor editable, even under the same name', () => {
    render(<Harness user={farmerProcessor} lots={[ownLot, othersLot]}><FarmerDataHub currentUser={farmerProcessor} /></Harness>)

    expect(screen.getByText('HL-2026-001')).toBeInTheDocument()
    expect(screen.queryByText('HL-2026-002')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit harvest lot HL-2026-002' })).not.toBeInTheDocument()
  })

  it('Data Hub: an Admin sees and can edit every lot', () => {
    render(<Harness user={admin} lots={[ownLot, othersLot]}><FarmerDataHub currentUser={admin} /></Harness>)

    expect(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-001' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-002' })).toBeInTheDocument()
  })

  it('Data Hub: Edit and Delete follow the lot\'s owner (createdById, else its farm\'s owner)', () => {
    const recordedForFarmer = lot({ createdById: 'u-farmer' })
    // On the farmer's farm, but the backend has it as Malee's.
    const recordedForMalee = lot({ id: 'hl-3', displayId: 'HL-2026-003', createdById: 'u-malee' })
    // Older lot with no owner stored: its farm's owner counts.
    const legacy = lot({ id: 'hl-4', displayId: 'HL-2026-004' })
    render(
      <Harness user={renamedFarmer} lots={[recordedForFarmer, recordedForMalee, legacy]}>
        <FarmerDataHub currentUser={renamedFarmer} />
      </Harness>,
    )

    expect(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-001' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-001' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-004' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-004' })).toBeInTheDocument()

    expect(screen.getByText('HL-2026-003')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit harvest lot HL-2026-003' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete harvest lot HL-2026-003' })).not.toBeInTheDocument()
  })

  it('Harvest Lots: a renamed farmer still sees their lot, and only theirs', () => {
    render(<Harness user={renamedFarmer} lots={[ownLot, othersLot]}><HarvestLotsManagement /></Harness>)

    expect(screen.getByText('HL-2026-001')).toBeInTheDocument()
    expect(screen.queryByText('HL-2026-002')).not.toBeInTheDocument()
    expect(screen.getByText('Total Lots').nextElementSibling).toHaveTextContent(/^1$/)
    expect(screen.getByText('Total Weight').nextElementSibling).toHaveTextContent('400 kg')
  })

  it('Dashboard: a renamed farmer\'s stats and recent lots still count their lot', () => {
    render(<Harness user={renamedFarmer} lots={[ownLot, othersLot]}><FarmerDashboard /></Harness>)

    expect(screen.getByText('Total Harvest Lots').nextElementSibling).toHaveTextContent(/^1$/)
    expect(screen.getByText('HL-2026-001')).toBeInTheDocument()
    expect(screen.queryByText('HL-2026-002')).not.toBeInTheDocument()
  })
})

describe('Admin harvest lot popup names the farm\'s owner as the farmer', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  const users: User[] = [
    // Sorts first among the farmers, so it was the old default.
    { id: 'u-anan', name: 'Anan', roles: [UserRole.Farmer] },
    { id: 'u-farmer', name: 'Somchai Jaidee', roles: [UserRole.Farmer] },
    { id: 'u-malee', name: 'Malee', roles: [UserRole.Farmer] },
  ]

  // Opened from Harvest Lots filtered to Doi Farm: with two farms and no
  // filter the popup would pick none.
  const ModalHarness: React.FC<{ open?: boolean }> = ({ open = true }) => {
    signIn(admin)
    const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, farms, users })
    return (
      <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
        <HarvestLotModal isOpen={open} onClose={() => {}} defaultFarmId="farm-1" />
      </DataContext.Provider>
    )
  }

  const pickFarmer = (dialog: HTMLElement, name: string) => {
    const field = within(dialog).getByText('Select Farmer *').parentElement as HTMLElement
    fireEvent.click(within(field).getAllByRole('button')[0])
    fireEvent.click(within(field).getByRole('button', { name }))
  }

  it('starts with the selected farm\'s owner and follows the farm when it changes', async () => {
    vi.mocked(api.post).mockResolvedValue({
      harvestLot: {
        id: 'hl-new', farmId: 'farm-2', farmerName: 'Malee', cherryVariety: 'Typica', weightKg: 50,
        farmPlotLocation: 'Nan', harvestDate: '2026-09-30T00:00:00.000Z', status: 'ReadyForProcessing',
      },
    })
    render(<ModalHarness />)
    const dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })

    await waitFor(() => expect(within(dialog).getByText('Assigned Farmer: Somchai Jaidee')).toBeInTheDocument())

    // Switch the farm to Malee's.
    fireEvent.click(within(dialog).getByText('Doi Farm • Chiang Rai'))
    fireEvent.click(within(dialog).getByText('Mae Farm • Nan', { selector: 'button' }))
    await waitFor(() => expect(within(dialog).getByText('Assigned Farmer: Malee')).toBeInTheDocument())

    fireEvent.change(within(dialog).getByLabelText('Weight (kg) *'), { target: { value: '50' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Register Lot' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.post).mock.calls[0][0]).toBe('/harvest-lots')
    expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({ farmId: 'farm-2', farmerName: 'Malee' })
  })

  it('drops a farmer the Admin picked by hand when the farm changes', async () => {
    render(<ModalHarness />)
    const dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
    await waitFor(() => expect(within(dialog).getByText('Assigned Farmer: Somchai Jaidee')).toBeInTheDocument())

    pickFarmer(dialog, 'Anan')
    expect(within(dialog).getByText('Assigned Farmer: Anan')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByText('Doi Farm • Chiang Rai'))
    fireEvent.click(within(dialog).getByText('Mae Farm • Nan', { selector: 'button' }))
    await waitFor(() => expect(within(dialog).getByText('Assigned Farmer: Malee')).toBeInTheDocument())
  })

  it('starts again from the farm\'s owner when the popup is reopened', async () => {
    const { rerender } = render(<ModalHarness />)
    let dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
    await waitFor(() => expect(within(dialog).getByText('Assigned Farmer: Somchai Jaidee')).toBeInTheDocument())
    pickFarmer(dialog, 'Anan')
    expect(within(dialog).getByText('Assigned Farmer: Anan')).toBeInTheDocument()

    rerender(<ModalHarness open={false} />)
    rerender(<ModalHarness open />)

    dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
    await waitFor(() => expect(within(dialog).getByText('Assigned Farmer: Somchai Jaidee')).toBeInTheDocument())
  })
})
