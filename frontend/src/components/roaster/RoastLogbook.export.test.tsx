import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { ToastProvider } from '../../contexts/ToastContext'
import { RoastLevel, UserRole } from '../../types'
import type { AppData, RoastBatch, RoasterInventoryItem, User } from '../../types'
import { captureCsvDownloads } from '../../test/captureCsvDownloads'
import RoastLogbook from './RoastLogbook'

const roaster: User = { id: 'roaster-1', name: 'Somchai Roaster', roles: [UserRole.Roaster] }
const admin: User = { id: 'admin-1', name: 'Admin', roles: [UserRole.Admin] }

const inventory: RoasterInventoryItem[] = [
  {
    id: 'inv-natural', roasterId: roaster.id, greenBeanLotId: 'a0000001-0000-4000-8000-000000000001',
    claimedWeightKg: 200, remainingWeightKg: 50, process: 'Natural', variety: 'Catimor', grade: 'Grade A',
  },
  {
    id: 'inv-washed', roasterId: roaster.id, greenBeanLotId: 'b0000002-0000-4000-8000-000000000002',
    claimedWeightKg: 100, remainingWeightKg: 60, process: 'Washed', variety: 'Typica', grade: 'Grade B',
  },
]

const roast = (index: number, item: RoasterInventoryItem): RoastBatch => ({
  id: `c${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`,
  displayId: `RB-${String(index).padStart(4, '0')}`,
  roasterId: roaster.id,
  roasterInventoryId: item.id,
  greenBeanLotId: item.greenBeanLotId,
  roastDate: `2026-09-${String(index).padStart(2, '0')}`,
  batchSizeKg: 10,
  roastedWeightKg: 8.5,
  yieldPercentage: 85,
  weightLossPct: 15,
  roastLevel: RoastLevel.Medium,
  roastProfileNotes: '=cmd notes',
  flavorNotes: 'Berry, "jam"',
})

// Twelve natural roasts span two pages of ten; three washed ones must be left out.
const naturalRoasts = Array.from({ length: 12 }, (_, i) => roast(i + 1, inventory[0]))
const washedRoasts = Array.from({ length: 3 }, (_, i) => roast(i + 20, inventory[1]))

const appData: AppData = {
  ...INITIAL_APP_DATA,
  users: [roaster, admin],
  roasterInventory: inventory,
  roastBatches: [...washedRoasts, ...naturalRoasts],
}

const renderLogbook = (currentUser: User) =>
  render(
    <DataContext.Provider
      value={{
        data: appData,
        setData: vi.fn(),
        refreshData: async () => {},
        isEditing: false,
        setIsEditing: () => {},
      }}
    >
      <ToastProvider>
        <RoastLogbook currentUser={currentUser} />
      </ToastProvider>
    </DataContext.Provider>,
  )

describe('Roast logbook CSV export', { timeout: 15000 }, () => {
  const downloads = captureCsvDownloads()

  const csvLines = () => {
    expect(downloads).toHaveLength(1)
    expect(downloads[0].text.charCodeAt(0)).toBe(0xfeff)
    expect(downloads[0].type).toBe('text/csv;charset=utf-8')
    return downloads[0].lines
  }

  // Text queries rather than role queries: computing roles over the whole
  // logbook table is slow enough in jsdom to time out on a busy machine.
  const pickProcess = (process: string) => {
    fireEvent.click(screen.getByText('All process types'))
    fireEvent.click(screen.getByText(process, { selector: 'button' }))
  }
  const exportButton = () => screen.getByText('Export CSV').closest('button')!

  it('exports only the roasts matching the process filter, from every page', () => {
    renderLogbook(roaster)
    pickProcess('Natural')

    // The table shows ten of the twelve matches; the export must hold all twelve.
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/View details of roast/)).toHaveLength(10)

    fireEvent.click(exportButton())

    const [header, ...rows] = csvLines()
    expect(header).toBe(
      '"Roast date","Roast ID","Source lot","Variety","Process","Grade","Roast level","Input kg","Output kg","Yield %","Weight loss %","Roast notes","Flavor notes","Record ID"',
    )
    expect(rows).toHaveLength(12)
    expect(rows.every((row) => row.includes('"Natural"'))).toBe(true)
    expect(rows.some((row) => row.includes('Washed'))).toBe(false)
    expect(new Set(rows.map((row) => row.split(',')[1]))).toEqual(
      new Set(naturalRoasts.map((r) => `"${r.displayId}"`)),
    )

    // Newest first, fixed decimals, source lot as the roaster pages show it,
    // quotes doubled and formula-looking notes defused.
    expect(rows[0]).toBe(
      '"2026-09-12","RB-0012","ROA-4561","Catimor","Natural","Grade A","Medium","10.00","8.50","85.0","15.0","\'=cmd notes","Berry, ""jam""","c0000012-0000-4000-8000-000000000000"',
    )

    expect(downloads[0].filename).toMatch(/^roast-log_natural_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('exports the other process on its own once the filter changes', () => {
    renderLogbook(roaster)
    pickProcess('Washed')
    fireEvent.click(exportButton())

    const rows = csvLines().slice(1)
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.includes('"Washed"'))).toBe(true)
  })

  it('adds a Roaster column for admins', () => {
    renderLogbook(admin)
    pickProcess('Washed')
    fireEvent.click(exportButton())

    const [header, first] = csvLines()
    expect(header.split(',').slice(0, 5)).toEqual([
      '"Roast date"', '"Roast ID"', '"Source lot"', '"Roaster"', '"Variety"',
    ])
    expect(first).toContain('"Somchai Roaster"')
  })

  it('disables the export when no roast matches', () => {
    renderLogbook({ ...roaster, id: 'someone-else' })
    expect(exportButton()).toBeDisabled()
  })
})
