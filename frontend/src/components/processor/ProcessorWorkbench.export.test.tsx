import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { ToastProvider } from '../../contexts/ToastContext'
import { GreenBeanSourceType, ParchmentSourceType, UserRole } from '../../types'
import type { AppData, GreenBeanLot, ParchmentLot } from '../../types'
import { captureCsvDownloads } from '../../test/captureCsvDownloads'
import ProcessorWorkbench from './ProcessorWorkbench'

const greenLot = (
  displayId: string,
  grade: string,
  currentWeightKg: number,
  day: number,
  extra: Partial<GreenBeanLot> = {},
): GreenBeanLot => ({
  id: `gbl-${displayId}`,
  displayId,
  sourceType: GreenBeanSourceType.Internal,
  grade,
  initialWeightKg: 20,
  currentWeightKg,
  availabilityStatus: 'Available',
  cuppingScores: [],
  createdAt: `2026-09-${String(day).padStart(2, '0')}T08:00:00.000Z`,
  ...extra,
})

// Seven Grade A lots in stock (more than one page of five), two Grade B in
// stock and one Grade A that is used up.
const gradeA = Array.from({ length: 7 }, (_, i) =>
  greenLot(`GBL-2026-A${i + 1}`, 'Grade A', 10, i + 1, i === 0 ? { pricePerKg: 180, currency: 'THB' } : {}),
)
const gradeB = [greenLot('GBL-2026-B1', 'Grade B', 10, 10), greenLot('GBL-2026-B2', 'Grade B', 5, 11)]
const depleted = greenLot('GBL-2026-A0', 'Grade A', 0, 12)

const parchmentLot = (displayId: string, processType: string, day: number): ParchmentLot => ({
  id: `pch-${displayId}`,
  displayId,
  sourceType: ParchmentSourceType.Internal,
  initialWeightKg: 50,
  currentWeightKg: 40,
  moistureContent: 11,
  processType,
  status: 'AwaitingHulling',
  createdAt: `2026-09-${String(day).padStart(2, '0')}T08:00:00.000Z`,
})

const parchment = [
  ...Array.from({ length: 6 }, (_, i) => parchmentLot(`PCH-2026-N${i + 1}`, 'Natural', i + 1)),
  parchmentLot('PCH-2026-W1', 'Washed', 8),
  parchmentLot('PCH-2026-W2', 'Washed', 9),
]

const appData: AppData = {
  ...INITIAL_APP_DATA,
  greenBeanLots: [...gradeA, ...gradeB, depleted],
  parchmentLots: parchment,
}

function Harness() {
  const [data, setData] = useState(appData)
  return (
    <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
      <ToastProvider>
        <ProcessorWorkbench currentUser={{ id: 'processor', name: 'Processor', roles: [UserRole.Processor] }} />
      </ToastProvider>
    </DataContext.Provider>
  )
}

const section = (title: string) => screen.getByText(title).closest('div.shadow-sm') as HTMLElement
const greenSection = () => section('3 · Green Bean Stock')
const parchmentSection = () => section('2 · Parchment Stock')

/** Picks an option from one of the shared Select dropdowns, found by its current label. */
const pick = (within_: HTMLElement, current: string, option: string) => {
  const select = within(within_).getByText(current).closest('div.relative') as HTMLElement
  fireEvent.click(within(select).getByText(current))
  fireEvent.click(within(select).getByText(option, { selector: 'button' }))
}

const countBadge = (el: HTMLElement) => el.querySelector('span.rounded-full')!.textContent

describe('Processor workbench CSV export', { timeout: 20000 }, () => {
  const downloads = captureCsvDownloads()

  const lastCsv = () => {
    expect(downloads).toHaveLength(1)
    return downloads[0].lines
  }

  it('exports every green bean lot the data grid lists under its filters, not just the page', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    pick(greenSection(), 'All Grades', 'Grade A')

    expect(countBadge(greenSection())).toBe('7')
    fireEvent.click(within(greenSection()).getByLabelText('Export CSV'))

    const [header, ...rows] = lastCsv()
    expect(header.split('","')[0]).toBe('"Green bean lot')
    expect(rows).toHaveLength(7)
    expect(rows.map((row) => row.split(',')[0]).sort()).toEqual(
      gradeA.map((lot) => `"${lot.displayId}"`).sort(),
    )
    expect(rows.join('\n')).not.toMatch(/Grade B|GBL-2026-A0/)
    // Newest first, as in the grid; the priced lot is the oldest.
    expect(rows[0]).toContain('"GBL-2026-A7"')
    expect(rows[6]).toContain('"10.00","180.00","THB","1800.00"')
    // The Availability column says what the switch says, not the stored value.
    expect(rows.every((row) => row.includes('"On sale"'))).toBe(true)
    expect(rows.join('\n')).not.toMatch(/"Available"/)
    expect(downloads[0].filename).toMatch(/^green-bean-stock_in-stock_grade-a_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('exports the parchment the data grid lists for the chosen process', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    pick(parchmentSection(), 'All Process', 'Washed')

    fireEvent.click(within(parchmentSection()).getByLabelText('Export CSV'))
    const rows = lastCsv().slice(1)
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.includes('"Washed"'))).toBe(true)
    expect(downloads[0].filename).toMatch(/^parchment-stock_washed_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('keeps the search visible across views and leaves grid-only filters out of the workflow view', async () => {
    render(<Harness />)

    // Workflow view first: search, and switch views before the debounce fires.
    fireEvent.change(within(greenSection()).getByPlaceholderText('Search lots...'), {
      target: { value: 'grade b' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))

    expect(within(greenSection()).getByPlaceholderText('Search lots...')).toHaveValue('grade b')
    await waitFor(() => expect(countBadge(greenSection())).toBe('2'))

    // A grid-only filter that matches nothing here...
    pick(greenSection(), 'All Grades', 'Grade A')
    expect(countBadge(greenSection())).toBe('0')
    expect(within(greenSection()).getByLabelText('Export CSV')).toBeDisabled()

    // ...does not follow the lots into the workflow view, which has no grade control.
    fireEvent.click(screen.getByRole('button', { name: 'Workflow' }))
    expect(within(greenSection()).getByPlaceholderText('Search lots...')).toHaveValue('grade b')
    expect(countBadge(greenSection())).toBe('2')

    fireEvent.click(within(greenSection()).getByLabelText('Export CSV'))
    const rows = lastCsv().slice(1)
    expect(rows.map((row) => row.split(',')[0]).sort()).toEqual(['"GBL-2026-B1"', '"GBL-2026-B2"'])
    expect(downloads[0].filename).toMatch(/^green-bean-stock_search-grade-b_in-stock_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('applies a search typed just before Export is clicked', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))

    const box = within(greenSection()).getByPlaceholderText('Search lots...')
    fireEvent.change(box, { target: { value: 'grade b' } })
    // Clicking Export takes focus off the box first, well inside the debounce.
    fireEvent.blur(box)
    fireEvent.click(within(greenSection()).getByLabelText('Export CSV'))

    const rows = lastCsv().slice(1)
    expect(rows.map((row) => row.split(',')[0]).sort()).toEqual(['"GBL-2026-B1"', '"GBL-2026-B2"'])
    expect(downloads[0].filename).toMatch(/^green-bean-stock_search-grade-b_in-stock_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('keeps the data grid on a page it has after paging further in the workflow view', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    pick(greenSection(), 'All Grades', 'Grade B')
    pick(parchmentSection(), 'All Process', 'Washed')

    // The workflow view lists every lot in stock, over two pages in each column.
    fireEvent.click(screen.getByRole('button', { name: 'Workflow' }))
    fireEvent.click(within(greenSection()).getByRole('button', { name: '2' }))
    fireEvent.click(within(parchmentSection()).getByRole('button', { name: '2' }))

    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    expect(countBadge(greenSection())).toBe('2')
    expect(within(greenSection()).queryByText('No matching green bean lots found')).toBeNull()
    expect(within(greenSection()).getAllByText('GBL-2026-B1').length).toBeGreaterThan(0)
    expect(within(greenSection()).getAllByText('GBL-2026-B2').length).toBeGreaterThan(0)
    expect(within(parchmentSection()).getAllByText('PCH-2026-W1').length).toBeGreaterThan(0)
    expect(within(parchmentSection()).getAllByText('PCH-2026-W2').length).toBeGreaterThan(0)
  })
})
