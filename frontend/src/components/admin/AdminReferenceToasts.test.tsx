import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataContext } from '../../hooks/useDataContext'
import { INITIAL_APP_DATA } from '../../constants'
import type { ActivityType, AppData, CoffeeGrade, ProcessType } from '../../types'
import { updateProcessType } from '../../services/processing/processTypeService'
import { updateActivityType } from '../../services/reference/activityTypeService'
import { updateCoffeeGrade } from '../../services/reference/coffeeGradeService'
import { captureAppToasts } from '../../test/captureAppToasts'
import ProcessTypeManagement from './ProcessTypeManagement'
import ActivityTypeManagement from './ActivityTypeManagement'
import CoffeeGradeManagement from './CoffeeGradeManagement'

// A refused Active/Inactive switch or grade move on the admin reference pages
// says why in the site toast, not the browser's alert box, and leaves the row
// as it was.

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

const scheme = { borderColor: 'border-l-blue-500', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', badgeColor: 'bg-blue-100 text-blue-700 border-blue-200' }

const processTypes = [
  { id: 'pt-washed', name: 'Washed', colorScheme: scheme, createdDate: '2026-09-01', isActive: true },
] as unknown as ProcessType[]

const activityTypes = [
  { id: 'at-prune', name: 'Pruning', createdDate: '2026-09-01', isActive: true },
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

let alertSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  expect(alertSpy).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('Reference page failures go to the site toast', { timeout: 20000 }, () => {
  const toasts = captureAppToasts()

  it('Process Types: a refused status switch', async () => {
    vi.mocked(updateProcessType).mockRejectedValue(new Error('Process type is locked'))
    renderInData(<ProcessTypeManagement />)

    fireEvent.click(within(rowOf('Washed')).getByRole('button', { name: 'Active' }))

    await waitFor(() => expect(toasts).toContainEqual({ type: 'error', message: 'Process type is locked' }))
    expect(within(rowOf('Washed')).getByRole('button', { name: 'Active' })).toBeInTheDocument()
  })

  it('Activity Types: a refused status switch, with a fallback when the error says nothing', async () => {
    vi.mocked(updateActivityType).mockRejectedValue(new Error(''))
    renderInData(<ActivityTypeManagement />)

    fireEvent.click(within(rowOf('Pruning')).getByRole('button', { name: 'Active' }))

    await waitFor(() => expect(toasts).toContainEqual({ type: 'error', message: 'Failed to update status' }))
    expect(within(rowOf('Pruning')).getByRole('button', { name: 'Active' })).toBeInTheDocument()
  })

  it('Coffee Grades: a refused status switch', async () => {
    vi.mocked(updateCoffeeGrade).mockRejectedValue(new Error('Grade A is in use'))
    renderInData(<CoffeeGradeManagement />)

    fireEvent.click(within(rowOf('Grade A')).getByRole('button', { name: 'Active' }))

    await waitFor(() => expect(toasts).toContainEqual({ type: 'error', message: 'Grade A is in use' }))
  })

  it('Coffee Grades: a refused move keeps the order', async () => {
    vi.mocked(updateCoffeeGrade).mockRejectedValue(new Error('Server down'))
    renderInData(<CoffeeGradeManagement />)

    fireEvent.click(within(rowOf('Grade A')).getByTitle('Move down'))

    await waitFor(() => expect(toasts).toContainEqual({ type: 'error', message: 'Server down' }))
    const names = screen.getAllByText(/^Grade [AB]$/).map(el => el.textContent)
    expect(names.indexOf('Grade A')).toBeLessThan(names.indexOf('Grade B'))
  })
})
