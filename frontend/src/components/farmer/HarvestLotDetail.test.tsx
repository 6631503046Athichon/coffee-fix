import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { UserRole } from '../../types'
import type { AppData, Farm, HarvestLot, User } from '../../types'
import { api } from '../../services/api'
import HarvestLotDetail from './HarvestLotDetail'

vi.mock('../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

let auth: { currentUser: User | null } = { currentUser: null }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))

const somchai: User = { id: 'u-somchai', name: 'Somchai', roles: [UserRole.Farmer] }
const malee: User = { id: 'u-malee', name: 'Malee', roles: [UserRole.Farmer] }
const admin: User = { id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }

const lot = (overrides: Partial<HarvestLot> = {}): HarvestLot => ({
  id: 'hl-1', displayId: 'HL-2026-1', farmerName: 'Somchai', cherryVariety: 'Catimor',
  weightKg: 400, farmPlotLocation: 'Doi Chang', harvestDate: '2026-09-15',
  status: 'Ready for Processing', cropYearId: 'cy-2026',
  ...overrides,
})

// Another farmer's farm whose location text matches the lot's plot.
const otherFarm: Farm = { id: 'farm-other', farmName: 'Other Farm', farmerName: 'Malee', location: 'Doi Chang', ownerUserId: 'u-malee' }
const ownFarm: Farm = { id: 'farm-own', farmName: 'Own Farm', farmerName: 'Somchai', location: 'Plot A', ownerUserId: 'u-somchai', varieties: ['Catimor', 'Typica'] }

const renderDetail = (harvestLot: HarvestLot, user: User = somchai) => {
  auth = { currentUser: user }
  const setData = vi.fn()
  const data: AppData = { ...INITIAL_APP_DATA, harvestLots: [harvestLot], farms: [otherFarm, ownFarm] }
  render(
    <MemoryRouter initialEntries={[`/farmer-dashboard/${harvestLot.id}`]}>
      <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
        <Routes>
          <Route path="/farmer-dashboard/:lotId" element={<HarvestLotDetail />} />
        </Routes>
      </DataContext.Provider>
    </MemoryRouter>,
  )
  return { setData }
}

describe('HarvestLotDetail farm link', () => {
  beforeEach(() => vi.clearAllMocks())

  it('never saves a farm onto a lot that has none, nor guesses one from the plot text', async () => {
    const { setData } = renderDetail(lot())

    expect(screen.getByText('Harvest Lot Details')).toBeInTheDocument()
    expect(screen.getAllByText('Not linked to a farm').length).toBeGreaterThan(0)
    expect(screen.queryByText('Other Farm')).not.toBeInTheDocument()
    // Give any effect a chance to run.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.put).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
    expect(setData).not.toHaveBeenCalled()
  })

  it('shows the farm the lot is stored on, read-only', async () => {
    renderDetail(lot({ farmId: 'farm-own' }))
    expect(screen.getAllByText('Own Farm').length).toBeGreaterThan(0)
    expect(screen.queryByText('Other Farm')).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.put).not.toHaveBeenCalled()
  })

  it('prefers the farm summary that came with the lot', () => {
    renderDetail(lot({ farmId: 'farm-own', farm: { id: 'farm-own', farmName: 'Own Farm (server)' } }))
    expect(screen.getAllByText('Own Farm (server)').length).toBeGreaterThan(0)
  })
})

describe('HarvestLotDetail edit', { timeout: 20000 }, () => {
  beforeEach(() => vi.clearAllMocks())

  const editButton = () => screen.queryByRole('button', { name: 'Edit harvest lot HL-2026-1' })

  it.each([
    ['the lot\'s owner', somchai, true],
    ['an Admin', admin, true],
    ['another farmer', malee, false],
  ])('offers Edit to the same people as the Data Hub: %s', (_label, user, canEdit) => {
    renderDetail(lot({ farmId: 'farm-own' }), user)
    expect(editButton() !== null).toBe(canEdit)
  })

  it('opens the Data Hub\'s edit popup and saves only what was changed', async () => {
    // A stateful harness, so the saved lot shows on the page.
    auth = { currentUser: somchai }
    const Harness: React.FC = () => {
      const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, harvestLots: [lot({ farmId: 'farm-own' })], farms: [otherFarm, ownFarm] })
      return (
        <MemoryRouter initialEntries={['/farmer-dashboard/hl-1']}>
          <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
            <Routes>
              <Route path="/farmer-dashboard/:lotId" element={<HarvestLotDetail />} />
            </Routes>
          </DataContext.Provider>
        </MemoryRouter>
      )
    }
    vi.mocked(api.put).mockResolvedValue({
      harvestLot: {
        id: 'hl-1', displayId: 'HL-2026-1', farmId: 'farm-own', farmerName: 'Somchai', cherryVariety: 'Catimor',
        weightKg: 380, farmPlotLocation: 'Doi Chang', harvestDate: '2026-09-15T00:00:00.000Z',
        status: 'ReadyForProcessing', cropYearId: 'cy-2026',
      },
    })
    render(<Harness />)

    fireEvent.click(editButton() as HTMLElement)
    const dialog = screen.getByRole('dialog', { name: 'Edit Harvest Lot' })
    expect(within(dialog).getByLabelText('Farmer Name')).toHaveAttribute('readonly')
    fireEvent.change(within(dialog).getByLabelText('Weight (kg)'), { target: { value: '380' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Harvest Lot' })).not.toBeInTheDocument())
    expect(vi.mocked(api.put).mock.calls).toStrictEqual([['/harvest-lots/hl-1', { weightKg: 380 }]])
    expect(screen.getByText('Weight (kg)').nextElementSibling).toHaveTextContent('380')
  })
})
