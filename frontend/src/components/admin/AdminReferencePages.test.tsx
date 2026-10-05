import React, { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataContext } from '../../hooks/useDataContext'
import { INITIAL_APP_DATA } from '../../constants'
import type { ActivityType, AppData, CoffeeGrade, ProcessType } from '../../types'
import { deleteProcessType } from '../../services/processing/processTypeService'
import { deleteActivityType } from '../../services/reference/activityTypeService'
import { deleteCoffeeGrade } from '../../services/reference/coffeeGradeService'
import { CoffeeVariety, deleteCoffeeVariety, getAllCoffeeVarieties } from '../../services/reference/coffeeVarietyService'
import { formatDateDisplay } from '../../utils/formatters'
import ProcessTypeManagement from './ProcessTypeManagement'
import ActivityTypeManagement from './ActivityTypeManagement'
import CoffeeGradeManagement from './CoffeeGradeManagement'
import CoffeeVarietiesManager from './CoffeeVarietiesManager'

// Production-test findings on the admin reference-data pages: deletes ask in
// the site's centred confirm popup (not the browser's confirm box) and wait
// on it while the request runs, the created date shows for every row ("-"
// when the row has none), and the variety cards' icon buttons are named.

vi.mock('../../services/processing/processTypeService', () => ({
  addProcessType: vi.fn(),
  updateProcessType: vi.fn(),
  deleteProcessType: vi.fn(),
  processTypeNameExists: vi.fn(async () => false),
}))
vi.mock('../../services/reference/activityTypeService', () => ({
  addActivityType: vi.fn(),
  updateActivityType: vi.fn(),
  deleteActivityType: vi.fn(),
}))
vi.mock('../../services/reference/coffeeGradeService', () => ({
  addCoffeeGrade: vi.fn(),
  updateCoffeeGrade: vi.fn(),
  deleteCoffeeGrade: vi.fn(),
}))
vi.mock('../../services/reference/coffeeVarietyService', () => ({
  getAllCoffeeVarieties: vi.fn(),
  addCoffeeVariety: vi.fn(),
  updateCoffeeVariety: vi.fn(),
  deleteCoffeeVariety: vi.fn(),
}))

const scheme = { borderColor: 'border-l-blue-500', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', badgeColor: 'bg-blue-100 text-blue-700 border-blue-200' }

const processTypes = [
  { id: 'pt-washed', name: 'Washed', colorScheme: scheme, createdDate: '2026-09-01', isActive: true },
  // As the sign-in bulk load hands them over: the backend's createdAt, no createdDate.
  { id: 'pt-honey', name: 'Honey', colorScheme: scheme, createdAt: '2026-08-15T03:00:00.000Z', isActive: true },
  // An old row with neither.
  { id: 'pt-old', name: 'Old Process', colorScheme: scheme, isActive: true },
] as unknown as ProcessType[]

const activityTypes = [
  { id: 'at-prune', name: 'Pruning', createdDate: '2026-09-01', isActive: true },
  { id: 'at-old', name: 'Old Activity', isActive: true },
] as unknown as ActivityType[]

const grades: CoffeeGrade[] = [
  { id: 'g-a', name: 'Grade A', sortOrder: 10, isActive: true } as CoffeeGrade,
  { id: 'g-b', name: 'Grade B', sortOrder: 20, isActive: true } as CoffeeGrade,
]

const Harness: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<AppData>({
    ...INITIAL_APP_DATA,
    processTypes,
    activityTypes,
    coffeeGrades: grades,
  })
  return (
    <DataContext.Provider value={{ data, setData, refreshData: async () => {}, setIsEditing: () => {}, isEditing: false }}>
      {children}
    </DataContext.Provider>
  )
}

const renderInData = (page: React.ReactElement) => render(<Harness>{page}</Harness>)

const rowOf = (name: string) => screen.getAllByText(name)[0].closest('tr')!

const deferred = () => {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

let confirmSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  confirmSpy = vi.spyOn(window, 'confirm')
})

afterEach(() => {
  expect(confirmSpy).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('Process type delete', { timeout: 20000 }, () => {
  it('asks in the site popup, waits on it while the delete runs, then removes the row', async () => {
    const pending = deferred()
    vi.mocked(deleteProcessType).mockReturnValue(pending.promise)
    renderInData(<ProcessTypeManagement />)

    fireEvent.click(within(rowOf('Washed')).getByRole('button', { name: /Delete/ }))
    const dialog = screen.getByRole('dialog', { name: 'Delete process type?' })
    expect(dialog).toHaveTextContent('Delete "Washed"? This cannot be undone.')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete process type' }))
    expect(deleteProcessType).toHaveBeenCalledWith('pt-washed')
    expect(within(dialog).getByRole('button', { name: 'Delete process type' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeDisabled()

    await act(async () => { pending.resolve() })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryAllByText('Washed')).toHaveLength(0)
  })

  it('says so when records still use the type', () => {
    const Page = () => {
      const [data, setData] = useState<AppData>({
        ...INITIAL_APP_DATA,
        processTypes,
        processingBatches: [{ id: 'b1', processType: 'Washed' }] as unknown as AppData['processingBatches'],
      })
      return (
        <DataContext.Provider value={{ data, setData, refreshData: async () => {}, setIsEditing: () => {}, isEditing: false }}>
          <ProcessTypeManagement />
        </DataContext.Provider>
      )
    }
    render(<Page />)
    fireEvent.click(within(rowOf('Washed')).getByRole('button', { name: /Delete/ }))
    expect(screen.getByRole('dialog')).toHaveTextContent('is used by processing batches or parchment lots')
  })

  it('keeps the row and shows the refusal in the popup', async () => {
    vi.mocked(deleteProcessType).mockRejectedValue(new Error('Process type is in use'))
    renderInData(<ProcessTypeManagement />)

    fireEvent.click(within(rowOf('Washed')).getByRole('button', { name: /Delete/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete process type' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Process type is in use')
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByText('Washed').length).toBeGreaterThan(0)
  })

  it('does nothing when kept', () => {
    renderInData(<ProcessTypeManagement />)
    fireEvent.click(within(rowOf('Washed')).getByRole('button', { name: /Delete/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(deleteProcessType).not.toHaveBeenCalled()
    expect(screen.getAllByText('Washed').length).toBeGreaterThan(0)
  })
})

describe('Created date on the type tables', { timeout: 20000 }, () => {
  const dateCell = (name: string) => within(rowOf(name)).getAllByRole('cell')[3]

  it('Process Types: the shared date format in English, from createdDate or createdAt, and "-" for neither', () => {
    renderInData(<ProcessTypeManagement />)
    expect(dateCell('Washed').textContent).toBe('1 Sep 2026')
    expect(dateCell('Honey')).toHaveTextContent(formatDateDisplay('2026-08-15T03:00:00.000Z'))
    expect(dateCell('Old Process').textContent).toBe('-')
  })

  it('Activity Types: the same', () => {
    renderInData(<ActivityTypeManagement />)
    const cell = (name: string) => within(rowOf(name)).getAllByRole('cell')[2]
    expect(cell('Pruning').textContent).toBe('1 Sep 2026')
    expect(cell('Old Activity').textContent).toBe('-')
  })
})

describe('Activity type and grade deletes', { timeout: 20000 }, () => {
  it('Activity Types: asks in the site popup, then removes the row', async () => {
    vi.mocked(deleteActivityType).mockResolvedValue(undefined as never)
    renderInData(<ActivityTypeManagement />)

    fireEvent.click(within(rowOf('Pruning')).getByRole('button', { name: /Delete/ }))
    expect(screen.getByRole('dialog', { name: 'Delete activity type?' })).toHaveTextContent('"Pruning"')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete activity type' }))
    })

    expect(deleteActivityType).toHaveBeenCalledWith('at-prune')
    expect(screen.queryByText('Pruning')).not.toBeInTheDocument()
  })

  it('Coffee Grades: shows the backend refusal in the popup, not an alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    vi.mocked(deleteCoffeeGrade).mockRejectedValue(new Error('Grade A is used by 3 green bean lots'))
    renderInData(<CoffeeGradeManagement />)

    fireEvent.click(within(rowOf('Grade A')).getByRole('button', { name: /Delete/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete grade' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Grade A is used by 3 green bean lots')
    expect(alertSpy).not.toHaveBeenCalled()
    expect(screen.getByText('Grade A')).toBeInTheDocument()
  })
})

describe('Coffee variety cards', { timeout: 20000 }, () => {
  const variety = (id: string, name: string): CoffeeVariety => ({
    id,
    name,
    species: 'Arabica',
    origin: null,
    description: null,
    characteristics: null,
    altitude: null,
    isActive: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  })

  beforeEach(() => {
    vi.mocked(getAllCoffeeVarieties).mockResolvedValue([variety('v-gesha', 'Gesha')])
  })

  it('names the icon-only edit and delete buttons', async () => {
    render(<CoffeeVarietiesManager />)
    const edit = await screen.findByRole('button', { name: 'Edit Gesha' })
    const del = screen.getByRole('button', { name: 'Delete Gesha' })
    expect(edit).toHaveAttribute('title', 'Edit variety')
    expect(del).toHaveAttribute('title', 'Delete variety')
  })

  it('asks in the site popup before deleting, then reloads the cards', async () => {
    vi.mocked(deleteCoffeeVariety).mockResolvedValue(undefined as never)
    render(<CoffeeVarietiesManager />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Gesha' }))

    const dialog = screen.getByRole('dialog', { name: 'Delete variety?' })
    expect(dialog).toHaveTextContent('"Gesha"')
    vi.mocked(getAllCoffeeVarieties).mockResolvedValue([])
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete variety' }))
    })

    expect(deleteCoffeeVariety).toHaveBeenCalledWith('v-gesha')
    await waitFor(() => expect(screen.queryByText('Gesha')).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
