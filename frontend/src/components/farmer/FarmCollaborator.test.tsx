import React, { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { UserRole } from '../../types'
import type { AppData, Farm, User } from '../../types'
import FarmerDashboard from './FarmerDashboard'
import HarvestLotModal from './modals/HarvestLotModal'

// A collaborator (farmhand) sees a shared farm on Farm Management, but only
// the farm's owner may register a harvest lot on it (POST /harvest-lots). The
// Register popup used to tell a collaborator there were no farms with
// varieties, and the dashboard counted only the farms the user owns.

vi.mock('../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

let auth: { currentUser: User | null } = { currentUser: null }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))

const owner: User = { id: 'u-owner', name: 'Somchai', roles: [UserRole.Farmer] }
// Owns nothing; helps out on Mae Farm.
const farmhand: User = { id: 'u-hand', name: 'Daeng', roles: [UserRole.Farmer] }
// Owns Doi Farm and helps out on Mae Farm.
const ownerAndHand: User = { id: 'u-both', name: 'Malee', roles: [UserRole.Farmer] }

const farms: Farm[] = [
  { id: 'farm-doi', farmName: 'Doi Farm', name: 'Doi Farm', location: 'Chiang Rai', farmerName: 'Malee', ownerUserId: 'u-both', varieties: ['Catimor'] },
  {
    id: 'farm-mae', farmName: 'Mae Farm', name: 'Mae Farm', location: 'Nan', farmerName: 'Somchai', ownerUserId: 'u-owner', varieties: ['Typica'],
    collaborators: [
      { id: 'c-1', farmId: 'farm-mae', userId: 'u-hand' },
      { id: 'c-2', farmId: 'farm-mae', userId: 'u-both' },
    ],
  },
  // Nobody above is on it, so it never counts for them.
  { id: 'farm-far', farmName: 'Far Farm', name: 'Far Farm', location: 'Tak', farmerName: 'Other', ownerUserId: 'u-other', varieties: ['Geisha'] },
]

const Harness: React.FC<{ user: User; farmList?: Farm[]; children: React.ReactNode }> = ({ user, farmList = farms, children }) => {
  auth = { currentUser: user }
  const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, farms: farmList })
  return (
    <MemoryRouter>
      <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
        {children}
      </DataContext.Provider>
    </MemoryRouter>
  )
}

const popup = () => screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
const NO_FARMS = /No farms with varieties available/

describe('Register harvest lot popup for a collaborator', { timeout: 20000 }, () => {
  beforeEach(() => localStorage.clear())

  it('tells a farmhand that only the farm owner can register lots on the farm shared with them', () => {
    render(<Harness user={farmhand}><HarvestLotModal isOpen onClose={() => {}} /></Harness>)

    expect(within(popup()).getByText(
      'Only the farm owner can register harvest lots on a farm. You collaborate on Mae Farm, so ask the farm owner to register harvest lots there.',
    )).toBeInTheDocument()
    expect(within(popup()).queryByText(NO_FARMS)).not.toBeInTheDocument()
    expect(within(popup()).getByRole('button', { name: 'Register Lot' })).toBeDisabled()
  })

  it('offers an owner who also helps out their own farm only, and says why the shared one is missing', () => {
    render(<Harness user={ownerAndHand}><HarvestLotModal isOpen onClose={() => {}} /></Harness>)

    expect(within(popup()).getByText('Farms shared with you (Mae Farm) are not listed: only the farm owner can register harvest lots on a farm.')).toBeInTheDocument()
    // The farm picked for the lot is the user's own.
    expect(within(popup()).getByText('Planted Varieties: Catimor')).toBeInTheDocument()
    expect(within(popup()).queryByText(/Planted Varieties: Typica/)).not.toBeInTheDocument()
  })

  it('still asks an owner whose farms have no varieties to add them, naming the shared farm left out', () => {
    const bare = farms.map((farm) => (farm.id === 'farm-doi' ? { ...farm, varieties: [] } : farm))
    render(<Harness user={ownerAndHand} farmList={bare}><HarvestLotModal isOpen onClose={() => {}} /></Harness>)

    const message = within(popup()).getByText(NO_FARMS)
    expect(message).toHaveTextContent('Please add varieties to your farms first before registering harvest lots.')
    expect(message).toHaveTextContent('Farms shared with you (Mae Farm) are not listed: only the farm owner can register harvest lots on a farm.')
  })

  it('keeps the plain message for a farmer with no farms at all', () => {
    render(<Harness user={{ id: 'u-new', name: 'New', roles: [UserRole.Farmer] }}><HarvestLotModal isOpen onClose={() => {}} /></Harness>)

    expect(within(popup()).getByText(NO_FARMS)).toHaveTextContent(
      'No farms with varieties available. Please add varieties to your farms first before registering harvest lots.',
    )
    expect(within(popup()).queryByText(/collaborate on|shared with you/)).not.toBeInTheDocument()
  })

  it('offers the shared farm to its owner, with no collaborator note', () => {
    render(<Harness user={owner}><HarvestLotModal isOpen onClose={() => {}} /></Harness>)

    expect(within(popup()).getByText('Planted Varieties: Typica')).toBeInTheDocument()
    expect(within(popup()).queryByText(/shared with you/)).not.toBeInTheDocument()
  })
})

describe('Farmer Dashboard farm summary', { timeout: 20000 }, () => {
  // The value under a Farm Summary tile.
  const tile = (label: string) => screen.getByText(label).parentElement!.nextElementSibling

  it.each([
    ['a farmhand', farmhand, '1', '1'],
    ['an owner who also helps out', ownerAndHand, '2', '2'],
    ['the shared farm\'s owner', owner, '1', '1'],
  ])('counts the farms Farm Management lists (owned and shared) for %s', (_label, user, total, varieties) => {
    render(<Harness user={user}><FarmerDashboard /></Harness>)

    expect(tile('Total Farms')).toHaveTextContent(new RegExp(`^${total}$`))
    expect(tile('Varieties Planted')).toHaveTextContent(new RegExp(`^${varieties}$`))
  })

  it('counts every farm for an Admin', () => {
    render(<Harness user={{ id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }}><FarmerDashboard /></Harness>)

    expect(tile('Total Farms')).toHaveTextContent(/^3$/)
  })
})
