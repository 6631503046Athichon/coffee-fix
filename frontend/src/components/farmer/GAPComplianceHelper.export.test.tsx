import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { UserRole } from '../../types'
import type { AppData, Farm, GAPLogEntry } from '../../types'
import { captureCsvDownloads } from '../../test/captureCsvDownloads'
import GAPComplianceHelper from './GAPComplianceHelper'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'admin', name: 'Admin', roles: [UserRole.Admin] } }),
}))

const farms: Farm[] = [
  { id: 'farm-1', name: 'ไร่ดอยช้าง', location: 'แปลง 2', farmerName: 'Somsak' },
  { id: 'farm-2', name: 'Hill Farm', location: 'Plot 9', farmerName: 'Nok' },
]

const log = (id: string, farmId: string, activityType: string, notes?: string): GAPLogEntry => ({
  id,
  farmId,
  farmPlotLocation: farmId === 'farm-1' ? 'ไร่ดอยช้าง • แปลง 2' : 'Hill Farm • Plot 9',
  activityType,
  date: '2026-09-10',
  productUsed: `Product ${id}`,
  quantity: '20 kg',
  notes,
})

const gapLogs: GAPLogEntry[] = [
  // Twelve matching logs: more than one page of ten.
  ...Array.from({ length: 12 }, (_, i) => log(`fert-${i + 1}`, 'farm-1', 'Fertilizing')),
  log('pest-1', 'farm-1', 'Pest control'),
  log('pest-2', 'farm-1', 'Pest control'),
  log('fert-other-farm', 'farm-2', 'Fertilizing'),
  // A type that is no longer in the activity type list.
  log('prune-1', 'farm-1', 'Pruning', 'Cut back, "old" wood'),
]

const appData: AppData = {
  ...INITIAL_APP_DATA,
  farms,
  gapLogs,
  activityTypes: [
    { id: 't1', name: 'Fertilizing', isActive: true, createdDate: '2026-01-01' },
    { id: 't2', name: 'Pest control', isActive: true, createdDate: '2026-01-01' },
  ],
}

const renderPage = () =>
  render(
    <DataContext.Provider
      value={{ data: appData, setData: vi.fn(), refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}
    >
      <GAPComplianceHelper />
    </DataContext.Provider>,
  )

const toolbar = () => screen.getByText('Filter Logs:').closest('div.bg-gray-50') as HTMLElement

const pick = (container: HTMLElement, current: string, option: string) => {
  const select = within(container).getByText(current).closest('div.relative') as HTMLElement
  fireEvent.click(within(select).getByText(current))
  fireEvent.click(within(select).getByText(option, { selector: 'button' }))
}

describe('GAP log CSV export and report', { timeout: 20000 }, () => {
  const downloads = captureCsvDownloads()

  it('exports every log matching the farm and activity filters, across pages', () => {
    renderPage()
    pick(toolbar(), 'All Farms', 'ไร่ดอยช้าง • แปลง 2')
    pick(toolbar(), 'All', 'Fertilizing')

    fireEvent.click(within(toolbar()).getByText('Export CSV'))

    const [header, ...rows] = downloads[0].lines
    expect(header).toBe('"Date","Farm","Location","Activity Type","Product/Method","Quantity","Notes"')
    expect(rows).toHaveLength(12)
    expect(rows[0]).toBe('"2026-09-10","ไร่ดอยช้าง","แปลง 2","Fertilizing","Product fert-1","20 kg",""')
    expect(rows.every((row) => row.includes('"Fertilizing"') && row.includes('"ไร่ดอยช้าง"'))).toBe(true)
    expect(downloads[0].filename).toMatch(/^gap-log_ไร่ดอยช้าง_fertilizing_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('prints notes, the active filters and logs of unlisted types under Other', () => {
    renderPage()
    pick(toolbar(), 'All Farms', 'ไร่ดอยช้าง • แปลง 2')
    fireEvent.click(screen.getByText('Generate Report'))

    const report = screen.getByText('Summary of Agricultural Practices').closest('div.overflow-y-auto') as HTMLElement
    expect(within(report).getByText('Total Records').nextElementSibling).toHaveTextContent('15 entries')
    expect(within(report).getByText('Farm').nextElementSibling).toHaveTextContent('ไร่ดอยช้าง • แปลง 2')
    expect(within(report).getByText('Activity Type').nextElementSibling).toHaveTextContent('All activity types')

    // 12 + 2 + 1: every log counted in the total is printed.
    expect(within(report).getAllByText(/^Product /, { selector: 'td' })).toHaveLength(15)
    const other = within(report).getByText('Other').closest('div.mb-4') as HTMLElement
    expect(within(other).getByText('Product prune-1')).toBeInTheDocument()
    expect(within(other).getByText('Type: Pruning')).toBeInTheDocument()
    expect(within(other).getByText('Cut back, "old" wood')).toBeInTheDocument()

    // The report dialog offers the same export.
    fireEvent.click(within(screen.getByText('Print').closest('div') as HTMLElement).getByText('Export CSV'))
    expect(downloads[0].lines).toHaveLength(16)
  })
})
