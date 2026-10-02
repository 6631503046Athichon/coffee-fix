import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import type { AppData, Farm, HarvestLot } from '../../types'
import { api } from '../../services/api'
import HarvestLotDetail from './HarvestLotDetail'

vi.mock('../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const lot = (overrides: Partial<HarvestLot> = {}): HarvestLot => ({
  id: 'hl-1', displayId: 'HL-2026-1', farmerName: 'Somchai', cherryVariety: 'Catimor',
  weightKg: 400, farmPlotLocation: 'Doi Chang', harvestDate: '2026-09-15',
  status: 'Ready for Processing', cropYearId: 'cy-2026',
  ...overrides,
})

// Another farmer's farm whose location text matches the lot's plot.
const otherFarm: Farm = { id: 'farm-other', farmName: 'Other Farm', farmerName: 'Malee', location: 'Doi Chang' }
const ownFarm: Farm = { id: 'farm-own', farmName: 'Own Farm', farmerName: 'Somchai', location: 'Plot A' }

const renderDetail = (harvestLot: HarvestLot) => {
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
