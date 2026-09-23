import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { UserRole } from '../../types'
import type { AppData, Farm, HarvestLot, WeatherRecord } from '../../types'
import { getAllWeatherRecords } from '../../services/farm/weatherService'
import { captureCsvDownloads } from '../../test/captureCsvDownloads'
import FarmerDataHub from './FarmerDataHub'
import FarmWeatherPanel from './FarmWeatherPanel'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'admin', name: 'Admin', roles: [UserRole.Admin] } }),
}))

vi.mock('../../services/farm/weatherService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/farm/weatherService')>(),
  getAllWeatherRecords: vi.fn(),
}))

const withData = (data: AppData, ui: React.ReactElement) => (
  <MemoryRouter>
    <DataContext.Provider
      value={{ data, setData: vi.fn(), refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}
    >
      {ui}
    </DataContext.Provider>
  </MemoryRouter>
)

describe('Farm CSV exports', { timeout: 20000 }, () => {
  const downloads = captureCsvDownloads()

  it('exports the harvest lots of the chosen year from every page, by display ID', () => {
    const lot = (n: number, year: number): HarvestLot => ({
      id: `hl-uuid-${year}-${n}`,
      displayId: `HL-${year}-${String(n).padStart(3, '0')}`,
      farmerName: 'Somsak',
      cherryVariety: 'Catimor',
      weightKg: 120.5,
      harvestDate: `${year}-01-${String(n).padStart(2, '0')}`,
      farmPlotLocation: 'Plot 1',
      status: 'Ready for Processing',
    })
    const data: AppData = {
      ...INITIAL_APP_DATA,
      harvestLots: [
        ...Array.from({ length: 12 }, (_, i) => lot(i + 1, 2025)),
        ...Array.from({ length: 3 }, (_, i) => lot(i + 1, 2026)),
      ],
    }
    render(withData(data, <FarmerDataHub currentUser={{ id: 'admin', name: 'Admin', roles: [UserRole.Admin] }} />))

    const select = screen.getAllByText('All')[0].closest('div.relative') as HTMLElement
    fireEvent.click(within(select).getByText('All'))
    fireEvent.click(within(select).getByText('2025', { selector: 'button' }))
    fireEvent.click(screen.getByText('Export CSV'))

    const [header, ...rows] = downloads[0].lines
    expect(header).toBe('"Lot ID","Farmer","Variety","Weight (kg)","Harvest Date","Location","Status"')
    expect(rows).toHaveLength(12)
    expect(rows[0]).toBe('"HL-2025-012","Somsak","Catimor","120.5","2025-01-12","Plot 1","Ready for Processing"')
    expect(rows.some((row) => row.includes('2026'))).toBe(false)
    expect(downloads[0].filename).toMatch(/^harvest-lots_2025_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('exports every weather record in the selected range, not just the page shown', async () => {
    const farm: Farm = { id: 'farm-1', name: 'ไร่ดอยช้าง', location: 'แปลง 2', farmerName: 'Somsak' }
    const records: WeatherRecord[] = Array.from({ length: 12 }, (_, i) => ({
      id: `w-${i + 1}`,
      farmId: farm.id,
      farmPlotLocation: '',
      recordDate: `2026-09-${String(i + 1).padStart(2, '0')}`,
      temperatureMin: -1.5 + i,
      temperatureMax: 28,
      temperatureAvg: 20,
      rainfall: 3.2,
      humidity: 80,
      source: 'Manual',
      notes: i === 0 ? 'ฝนตกหนัก, ลมแรง' : undefined,
    }))
    vi.mocked(getAllWeatherRecords).mockResolvedValue(records)

    render(withData({ ...INITIAL_APP_DATA, farms: [farm] }, <FarmWeatherPanel farm={farm} isOpen onClose={vi.fn()} />))

    const exportButton = screen.getByText('ส่งออก CSV').closest('button')!
    await waitFor(() => expect(exportButton).toBeEnabled())
    // Ten rows on screen, twelve in range.
    expect(screen.getAllByLabelText('แก้ไขข้อมูลอากาศ')).toHaveLength(10)

    fireEvent.click(exportButton)
    const [header, ...rows] = downloads[0].lines
    expect(header.split(',')[0]).toBe('"วันที่บันทึก"')
    expect(rows).toHaveLength(12)
    // Newest first, like the table; the oldest carries the Thai note and a
    // negative temperature that must stay a number.
    expect(rows[0].startsWith('"2026-09-12"')).toBe(true)
    expect(rows[11]).toBe('"2026-09-01","","-1.5","28","20","3.2","80","Manual","ฝนตกหนัก, ลมแรง"')

    const [{ startDate, endDate }] = vi.mocked(getAllWeatherRecords).mock.lastCall as [
      { startDate: string; endDate: string },
    ]
    expect(downloads[0].filename.startsWith(`weather_ไร่ดอยช้าง_from-${startDate}_to-${endDate}_`)).toBe(true)
    expect(downloads[0].filename).toMatch(/_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  describe('when the range holds more records than the table loads', () => {
    const farm: Farm = { id: 'farm-1', name: 'ไร่ดอยช้าง', location: 'แปลง 2', farmerName: 'Somsak' }
    const record = (id: string, recordDate: string): WeatherRecord => ({
      id,
      farmId: farm.id,
      farmPlotLocation: '',
      recordDate,
      temperatureMin: 18,
      temperatureMax: 28,
      temperatureAvg: 23,
      rainfall: 0,
      humidity: 80,
      source: 'API',
    })
    // What the table gets: the newest 50,000, all on one day.
    const loaded = Array.from({ length: 50000 }, (_, i) => record(`w-${i}`, '2026-09-20'))

    const renderPanel = (fullRange: WeatherRecord[]) => {
      vi.mocked(getAllWeatherRecords).mockImplementation(async (options) =>
        typeof options === 'object' && options.limit === 250000 ? fullRange : loaded,
      )
      render(withData({ ...INITIAL_APP_DATA, farms: [farm] }, <FarmWeatherPanel farm={farm} isOpen onClose={vi.fn()} />))
    }

    it('fetches the whole range for the export', async () => {
      renderPanel([...loaded, record('w-oldest', '2026-08-01')])

      const exportButton = screen.getByText('ส่งออก CSV').closest('button')!
      await waitFor(() => expect(exportButton).toBeEnabled())
      expect(screen.getByText('50,000+')).toBeInTheDocument()

      fireEvent.click(exportButton)
      await waitFor(() => expect(downloads).toHaveLength(1))

      const rows = downloads[0].lines.slice(1)
      expect(rows).toHaveLength(50001)
      expect(rows[50000].startsWith('"2026-08-01"')).toBe(true)
      const calls = vi.mocked(getAllWeatherRecords).mock.calls.map(
        ([options]) => options as { startDate: string; endDate: string; limit: number },
      )
      const panelCall = calls.filter((options) => options.limit === 50000).at(-1)
      expect(calls.at(-1)).toEqual({ ...panelCall, limit: 250000 })
    })

    it('refuses to export a range the backend cannot return in full', async () => {
      renderPanel(new Array(250000).fill(loaded[0]))

      const exportButton = screen.getByText('ส่งออก CSV').closest('button')!
      await waitFor(() => expect(exportButton).toBeEnabled())
      fireEvent.click(exportButton)

      expect(await screen.findByText(/กรุณาเลือกช่วงวันที่ให้สั้นลง/)).toBeInTheDocument()
      expect(downloads).toHaveLength(0)
    })
  })
})
