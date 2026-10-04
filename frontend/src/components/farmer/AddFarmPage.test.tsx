import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { UserRole } from '../../types'
import type { AppData, Farm, User } from '../../types'
import { api } from '../../services/api'
import AddFarmPage from './AddFarmPage'

vi.mock('../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const owner: User = { id: 'u-owner', name: 'Somchai', roles: [UserRole.Farmer] }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: owner }) }))

// As the farm list loads it: transformFarmFromBackend puts the name in both
// farmName and name.
const farm: Farm = {
  id: 'farm-1', farmName: 'TEST-CLAUDE Farm', name: 'TEST-CLAUDE Farm',
  location: 'Chiang Rai', farmerName: 'Somchai', ownerNames: ['Somchai'],
  ownerUserId: 'u-owner', varieties: ['Catimor'], sizeHectares: 2, collaborators: [],
}

// What the backend sends back for the PUT: the farm as it saved it.
const savedFrom = (body: Record<string, unknown>) => ({
  farm: { id: 'farm-1', ownerId: 'u-owner', ...body },
})

const EditRoute: React.FC = () => {
  const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, farms: [farm] })
  return (
    <MemoryRouter initialEntries={['/farmer-farms/edit/farm-1']}>
      <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
        <Routes>
          <Route path="/farmer-farms/edit/:farmId" element={<AddFarmPage />} />
          <Route path="/farmer-farms" element={<p>Farm Management page</p>} />
        </Routes>
      </DataContext.Provider>
    </MemoryRouter>
  )
}

const putBody = () => vi.mocked(api.put).mock.calls[0][1] as Record<string, unknown>

describe('Editing a farm', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({})
    vi.mocked(api.put).mockImplementation(async (_url: string, body: any) => savedFrom(body))
  })

  it('sends the new name when the farm is renamed', async () => {
    render(<EditRoute />)

    const nameInput = await screen.findByLabelText('Farm Name')
    expect(nameInput).toHaveValue('TEST-CLAUDE Farm')
    fireEvent.change(nameInput, { target: { value: 'TEST-CLAUDE Farm F1' } })
    fireEvent.change(screen.getByLabelText('Area Size (Hectares)'), { target: { value: '3.5' } })
    fireEvent.click(screen.getByRole('button', { name: /Update Farm/ }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.put).mock.calls[0][0]).toBe('/farms/farm-1')
    expect(putBody()).toMatchObject({ farmName: 'TEST-CLAUDE Farm F1', sizeHectares: 3.5 })
    expect(await screen.findByText('Farm updated successfully!')).toBeInTheDocument()
  })

  it('sends an empty name when the name is cleared, not the old one', async () => {
    render(<EditRoute />)

    fireEvent.change(await screen.findByLabelText('Farm Name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /Update Farm/ }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(putBody().farmName).toBe('')
  })

  it('keeps the name when only other fields change', async () => {
    render(<EditRoute />)

    await screen.findByLabelText('Farm Name')
    fireEvent.change(screen.getByLabelText('Area Size (Hectares)'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: /Update Farm/ }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(putBody()).toMatchObject({ farmName: 'TEST-CLAUDE Farm', sizeHectares: 4 })
  })
})
