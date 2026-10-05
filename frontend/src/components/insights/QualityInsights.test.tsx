import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import type { AppData, Farm } from '../../types'
import QualityInsights from './QualityInsights'

// The AI calls are not under test here.
vi.mock('@/services/external/geminiService', () => ({
  getQualityInsights: vi.fn(),
  generateComprehensiveReport: vi.fn(),
}))

const farm = (over: Partial<Farm> = {}): Farm => ({
  id: 'farm-1',
  farmerName: 'Somchai',
  location: 'Chiang Rai',
  ...over,
})

const page = (data: AppData) => (
  <MemoryRouter>
    <DataContext.Provider
      value={{
        data,
        setData: vi.fn(),
        refreshData: async () => {},
        setIsEditing: vi.fn(),
        isEditing: false,
        saleOrdersStatus: 'ok',
      }}
    >
      <QualityInsights />
    </DataContext.Provider>
  </MemoryRouter>
)

const farmChartCard = () =>
  screen.getByRole('heading', { name: 'Farm Performance Over Time' }).parentElement!.parentElement!

describe('QualityInsights comparative charts', () => {
  it('says there is nothing to compare instead of drawing empty axes', () => {
    render(page({ ...INITIAL_APP_DATA }))

    const processCard = screen.getByRole('heading', { name: 'Processing Method Comparison' }).parentElement!
    expect(within(processCard).getByRole('status')).toHaveTextContent('No scored lots yet')

    const farmCard = farmChartCard()
    expect(within(farmCard).getByRole('status')).toHaveTextContent('No farmers yet')
    // The empty picker says so and cannot be opened.
    const picker = within(farmCard).getByRole('button', { name: /No farmers yet/ })
    expect(picker).toBeDisabled()
  })

  it('names the farmer whose lots have no scores yet', () => {
    render(page({ ...INITIAL_APP_DATA, farms: [farm(), farm({ id: 'farm-2', farmerName: 'Malee' })] }))

    const farmCard = farmChartCard()
    expect(within(farmCard).getByRole('button', { name: /Somchai/ })).toBeEnabled()
    expect(within(farmCard).getByRole('status')).toHaveTextContent('No scored lots for Somchai yet')
  })

  it('picks the first farmer once the farms load after the page', () => {
    const { rerender } = render(page({ ...INITIAL_APP_DATA }))
    expect(within(farmChartCard()).getByRole('status')).toHaveTextContent('No farmers yet')

    rerender(page({ ...INITIAL_APP_DATA, farms: [farm({ farmerName: 'Malee' })] }))

    const farmCard = farmChartCard()
    expect(within(farmCard).getByRole('button', { name: /Malee/ })).toBeInTheDocument()
    expect(within(farmCard).getByRole('status')).toHaveTextContent('No scored lots for Malee yet')
  })
})
