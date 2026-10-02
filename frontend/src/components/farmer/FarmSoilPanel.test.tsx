import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { UserRole } from '../../types'
import type { AppData, Farm, SoilAnalysis } from '../../types'
import FarmSoilPanel from './FarmSoilPanel'

const { apiPost, apiPut, extractSoilDataFromImage } = vi.hoisted(() => ({
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  extractSoilDataFromImage: vi.fn(),
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'farmer-1', name: 'Somsak', roles: [UserRole.Farmer] } }),
}))

// The real soil service and transformer run; only the HTTP call is faked, so
// the assertions see the body the backend would receive.
vi.mock('../../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/api')>()),
  api: { get: vi.fn(), post: apiPost, put: apiPut, patch: vi.fn(), delete: vi.fn() },
}))

vi.mock('../../services/external/geminiService', () => ({
  extractSoilDataFromImage,
  generateSoilRecommendations: vi.fn(),
}))

const farm: Farm = { id: 'farm-1', name: 'ไร่ดอยช้าง', location: 'แปลง 2', farmerName: 'Somsak' }

const analysis = (overrides: Partial<SoilAnalysis> = {}): SoilAnalysis => ({
  id: 'soil-1',
  farmId: 'farm-1',
  farmPlotLocation: 'แปลง 2',
  testDate: '2026-09-15',
  pH: 6,
  phosphorus: 12,
  potassium: 80,
  nitrogen: 0.2,
  calcium: 1200,
  magnesium: 150,
  createdBy: 'farmer-1',
  createdByRole: UserRole.Farmer,
  ...overrides,
})

// What the backend sends back for a saved analysis.
const savedRow = { soilAnalysis: { ...analysis(), testDate: '2026-09-15T12:00:00.000Z' } }

const renderPanel = (soilAnalyses: SoilAnalysis[] = []) => {
  const data: AppData = { ...INITIAL_APP_DATA, farms: [farm], soilAnalyses }
  return render(
    <DataContext.Provider
      value={{ data, setData: vi.fn(), refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}
    >
      <FarmSoilPanel farm={farm} />
    </DataContext.Provider>,
  )
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

const fillRequired = () => {
  type('pH', '6')
  type('ฟอสฟอรัส (ppm)', '12')
  type('โพแทสเซียม (ppm)', '80')
  type('แคลเซียม (ppm)', '1200')
  type('แมกนีเซียม (ppm)', '150')
}

const submit = (buttonName: string) =>
  fireEvent.submit(screen.getByRole('button', { name: buttonName }).closest('form') as HTMLFormElement)

// The JSON body the API client would send (undefined keys drop out).
const sentBody = (mock: typeof apiPost) => JSON.parse(JSON.stringify(mock.mock.calls[0][1]))

describe('FarmSoilPanel nitrogen', { timeout: 20000 }, () => {
  beforeEach(() => {
    apiPost.mockReset().mockResolvedValue(savedRow)
    apiPut.mockReset().mockResolvedValue(savedRow)
    extractSoilDataFromImage.mockReset()
  })

  it('has a nitrogen field and saves what is typed into it', async () => {
    renderPanel()
    fillRequired()
    type('ไนโตรเจน (%)', '0.15')

    submit('บันทึกผลดิน')

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1))
    expect(apiPost.mock.calls[0][0]).toBe('/soil-analyses')
    expect(sentBody(apiPost).nitrogen).toBe('0.15')
  })

  it('does not send 0 for a new analysis when nitrogen is left blank', async () => {
    renderPanel()
    fillRequired()

    submit('บันทึกผลดิน')

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1))
    expect(sentBody(apiPost)).not.toHaveProperty('nitrogen')
  })

  it('keeps the stored nitrogen when an analysis is edited', async () => {
    renderPanel([analysis({ nitrogen: 0.2 })])

    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขผลดิน' }))
    expect(screen.getByLabelText('ไนโตรเจน (%)')).toHaveValue(0.2)
    submit('บันทึกการแก้ไขผลดิน')

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1))
    expect(apiPut.mock.calls[0][0]).toBe('/soil-analyses/soil-1')
    expect(sentBody(apiPut).nitrogen).toBe('0.2')
  })

  it('clears a stored nitrogen to 0 when the field is emptied on an edit', async () => {
    renderPanel([analysis({ nitrogen: 1.8 })])

    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขผลดิน' }))
    expect(screen.getByLabelText('ไนโตรเจน (%)')).toHaveValue(1.8)
    type('ไนโตรเจน (%)', '')
    submit('บันทึกการแก้ไขผลดิน')

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1))
    // The column is NOT NULL and 0 means no reading; leaving it out would
    // keep 1.8 behind a success toast.
    expect(sentBody(apiPut).nitrogen).toBe('0')
  })

  it('leaves nitrogen out of an edit when the record has none, instead of writing 0', async () => {
    renderPanel([analysis({ nitrogen: undefined })])

    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขผลดิน' }))
    submit('บันทึกการแก้ไขผลดิน')

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1))
    expect(sentBody(apiPut)).not.toHaveProperty('nitrogen')
  })

  it('saves the nitrogen the AI read from a lab report photo', async () => {
    extractSoilDataFromImage.mockResolvedValue({
      pH: '6',
      phosphorus: '12',
      potassium: '80',
      nitrogen: '0.18',
      calcium: '1200',
      magnesium: '150',
    })
    renderPanel()

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['img'], 'report.png', { type: 'image/png' })] },
    })
    fireEvent.click(await screen.findByRole('button', { name: /อ่านค่าจากรูป/ }))
    await waitFor(() => expect(screen.getByLabelText('ไนโตรเจน (%)')).toHaveValue(0.18))

    submit('บันทึกผลดิน')

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1))
    expect(sentBody(apiPost).nitrogen).toBe('0.18')
  })
})
