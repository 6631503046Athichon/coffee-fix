import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { ProcessingBatchStatus } from '../../../types'
import type { ProcessingBatch } from '../../../types'
import { api } from '../../../services/api'
import { transformProcessingBatchFromBackend } from '../../../services/processing/processingBatchService'
import { formatDate } from '../../../utils/formatters'
import DryingLogModal, { dryingLogFormErrors } from './DryingLogModal'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

// The popup saves each reading through POST, PUT and DELETE
// /processing-batches/:id/drying-logs[/:logId] and hands the batch's list back.

const batch: ProcessingBatch = {
  id: 'pb-1', displayId: 'PB-2026-3', harvestLotId: 'hl-1', createdById: 'processor',
  status: ProcessingBatchStatus.Completed, processType: 'Washed',
  dryingLog: [{ id: 'log-1', date: '2026-09-03', moistureContent: 35, ambientTemp: 30, relativeHumidity: 65 }],
}

const stored = (overrides: Record<string, unknown> = {}) => ({
  id: 'log-1', processingBatchId: 'pb-1', date: '2026-09-03T12:00:00.000Z',
  moistureContent: 35, ambientTemp: 30, relativeHumidity: 65, createdAt: '2026-09-03T08:00:00.000Z',
  ...overrides,
})

const renderModal = (onLogsChange = vi.fn()) => {
  render(
    <DryingLogModal batch={batch} canEdit onClose={() => {}} onLogsChange={onLogsChange} />,
  )
  return { popup: screen.getByRole('dialog'), onLogsChange }
}

const type = (popup: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(popup).getByLabelText(label), { target: { value } })

describe('DryingLogModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts a new reading and hands back the list with it, as YYYY-MM-DD with its id', async () => {
    vi.mocked(api.post).mockResolvedValue({
      dryingLog: stored({ id: 'log-2', date: '2026-09-04T12:00:00.000Z', moistureContent: 28 }),
    })
    const { popup, onLogsChange } = renderModal()

    type(popup, 'Moisture (%)', '28')
    type(popup, 'Temp (°C)', '30')
    type(popup, 'Humidity (%)', '65')
    fireEvent.click(within(popup).getByRole('button', { name: 'Add reading' }))

    await waitFor(() => expect(onLogsChange).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith('/processing-batches/pb-1/drying-logs', {
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      moistureContent: 28, ambientTemp: 30, relativeHumidity: 65,
    })
    expect(onLogsChange).toHaveBeenCalledWith('pb-1', [
      batch.dryingLog![0],
      { id: 'log-2', date: '2026-09-04', moistureContent: 28, ambientTemp: 30, relativeHumidity: 65 },
    ])
  })

  it('puts only the changed fields and deletes through the reading\'s own path', async () => {
    vi.mocked(api.put).mockResolvedValue({ dryingLog: stored({ ambientTemp: 33 }) })
    vi.mocked(api.delete).mockResolvedValue({ id: 'log-1' })
    const { popup, onLogsChange } = renderModal()
    const label = formatDate('2026-09-03', 'short')

    fireEvent.click(within(popup).getByRole('button', { name: `Edit the reading of ${label}` }))
    type(popup, 'Temp (°C)', '33')
    fireEvent.click(within(popup).getByRole('button', { name: 'Save reading' }))
    await waitFor(() => expect(onLogsChange).toHaveBeenCalledTimes(1))
    expect(api.put).toHaveBeenCalledWith('/processing-batches/pb-1/drying-logs/log-1', { ambientTemp: 33 })
    expect(onLogsChange.mock.calls[0][1][0]).toMatchObject({ id: 'log-1', ambientTemp: 33 })

    fireEvent.click(within(popup).getByRole('button', { name: `Delete the reading of ${label}` }))
    fireEvent.click(within(popup).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(onLogsChange).toHaveBeenCalledTimes(2))
    expect(api.delete).toHaveBeenCalledWith('/processing-batches/pb-1/drying-logs/log-1')
    expect(onLogsChange).toHaveBeenLastCalledWith('pb-1', [])
  })

  it('an unchanged edit saves nothing', () => {
    const { popup, onLogsChange } = renderModal()
    fireEvent.click(within(popup).getByRole('button', { name: /Edit the reading/ }))
    fireEvent.click(within(popup).getByRole('button', { name: 'Save reading' }))
    expect(api.put).not.toHaveBeenCalled()
    expect(onLogsChange).not.toHaveBeenCalled()
    expect(within(popup).getByRole('button', { name: 'Add reading' })).toBeInTheDocument()
  })
})

describe('dryingLogFormErrors', () => {
  const ok = { date: '2026-10-05', moistureContent: '12', ambientTemp: '28', relativeHumidity: '70' }

  it('accepts a reading dated today within the limits', () => {
    expect(dryingLogFormErrors(ok, '2026-10-05')).toEqual({})
    expect(dryingLogFormErrors({ ...ok, moistureContent: '0', relativeHumidity: '100' }, '2026-10-05')).toEqual({})
  })

  it('refuses a future date, a missing date and out-of-range numbers', () => {
    expect(dryingLogFormErrors({ ...ok, date: '2026-10-06' }, '2026-10-05')).toEqual({
      date: 'The reading date cannot be in the future.',
    })
    expect(dryingLogFormErrors({ ...ok, date: '' }, '2026-10-05').date).toBe('Pick the reading date.')
    expect(Object.keys(dryingLogFormErrors(
      { ...ok, moistureContent: '100.1', ambientTemp: '75', relativeHumidity: '' },
      '2026-10-05',
    ))).toEqual(['moistureContent', 'ambientTemp', 'relativeHumidity'])
  })
})

describe('transformProcessingBatchFromBackend drying log', () => {
  it('keeps each reading\'s id and lists them oldest first', () => {
    const result = transformProcessingBatchFromBackend({
      id: 'pb-1', harvestLotId: 'hl-1', status: 'Completed', processType: 'Washed',
      dryingLogs: [
        stored({ id: 'log-3', date: '2026-09-05T12:00:00.000Z' }),
        stored({ id: 'log-1', date: '2026-09-03T12:00:00.000Z' }),
        stored({ id: 'log-2', date: '2026-09-04T12:00:00.000Z' }),
      ],
    })
    expect(result.dryingLog?.map((log) => [log.id, log.date])).toEqual([
      ['log-1', '2026-09-03'], ['log-2', '2026-09-04'], ['log-3', '2026-09-05'],
    ])
  })
})
