import React, { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { UserRole } from '../../types'
import type { AppData, Farm, User } from '../../types'
import HarvestLotsManagement from './HarvestLotsManagement'

// At phone width the Harvest Lots toolbar (status filter, farm filter, Add
// Harvest Lot) used to sit on one unwrapped row inside an overflow-hidden
// card, which pushed the farm filter and the Add button off-screen. It now
// stacks below sm and keeps the single row from sm up.

vi.mock('../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const farmer: User = { id: 'u-farmer', name: 'Somchai', roles: [UserRole.Farmer] }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: farmer }) }))

const farms: Farm[] = [
  { id: 'farm-1', farmName: 'Doi Farm', name: 'Doi Farm', location: 'Chiang Rai', farmerName: 'Somchai', ownerUserId: 'u-farmer', varieties: ['Catimor'] },
]

const Harness: React.FC = () => {
  const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, farms, harvestLots: [] })
  return (
    <MemoryRouter>
      <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
        <HarvestLotsManagement />
      </DataContext.Provider>
    </MemoryRouter>
  )
}

describe('Harvest Lots toolbar at phone width', () => {
  it('stacks on mobile and goes back to one row from sm up', () => {
    render(<Harness />)

    const toolbar = screen.getByTestId('harvest-lots-toolbar')
    expect(toolbar).toHaveClass('flex', 'flex-col', 'w-full', 'sm:flex-row', 'sm:flex-wrap', 'sm:items-center', 'sm:w-auto')
  })

  it('wraps the status buttons and lets the farm filter and Add button fill the width', () => {
    render(<Harness />)

    const toolbar = screen.getByTestId('harvest-lots-toolbar')
    const statusGroup = within(toolbar).getByText('Filter:').parentElement as HTMLElement
    expect(statusGroup).toHaveClass('flex-wrap')
    expect(statusGroup.className).not.toMatch(/space-x-/)

    const farmGroup = within(toolbar).getByText('Farm:').parentElement as HTMLElement
    const farmSelect = farmGroup.querySelector('div.relative') as HTMLElement
    expect(farmSelect).toHaveClass('w-full', 'sm:w-52')

    // The header has one Add Harvest Lot; the empty state has its own button.
    expect(within(toolbar).getByRole('button', { name: /Add Harvest Lot/ })).toHaveClass('w-full', 'sm:w-auto')
  })
})
