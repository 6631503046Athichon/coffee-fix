import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { UserRole } from '../../types'
import type { AppData, Farm, GAPLogEntry, HarvestLot, SoilAnalysis, User } from '../../types'
import { api } from '../../services/api'
import { ApiError } from '../../services/apiError'
import { formatDateDisplay } from '../../utils/formatters'
import FarmManagement from './FarmManagement'
import FarmSoilPanel from './FarmSoilPanel'
import FarmWeatherPanel from './FarmWeatherPanel'
import GAPComplianceHelper from './GAPComplianceHelper'
import HarvestLotsManagement from './HarvestLotsManagement'

// Findings from the production test on the farmer screens: filtered-empty
// states, the site confirm popup instead of window.confirm, no farm UUIDs on
// screen, English dates in the GAP report and the Soil popup's AI error.

vi.mock('../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

let auth: { currentUser: User | null } = { currentUser: null }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))
const signIn = (user: User) => { auth = { currentUser: user } }

const owner: User = { id: 'u-owner', name: 'Somchai', roles: [UserRole.Farmer] }
const admin: User = { id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }

const FARM_UUID = '5e86b64d-1111-4111-8111-111111111111'
const doiFarm: Farm = {
  id: FARM_UUID, farmName: 'Doi Farm', name: 'Doi Farm', location: 'Chiang Rai',
  farmerName: 'Somchai', ownerUserId: 'u-owner', varieties: ['Catimor'], collaborators: [],
}
const maeFarm: Farm = {
  id: 'farm-mae', farmName: 'Mae Farm', name: 'Mae Farm', location: 'Nan',
  farmerName: 'Somchai', ownerUserId: 'u-owner', varieties: ['Typica'], collaborators: [],
}

const Harness: React.FC<{ user: User; data?: Partial<AppData>; children: React.ReactNode }> = ({ user, data: initial, children }) => {
  signIn(user)
  const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, farms: [doiFarm, maeFarm], ...initial })
  return (
    <MemoryRouter>
      <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
        {children}
      </DataContext.Provider>
    </MemoryRouter>
  )
}

// A promise the test settles by hand, to look at the popup while it waits.
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('GAP Compliance Helper', { timeout: 20000 }, () => {
  beforeEach(() => vi.clearAllMocks())

  const activityTypes = [
    { id: 't1', name: 'Fertilizing', isActive: true, createdDate: '2026-01-01' },
    { id: 't2', name: 'Pest control', isActive: true, createdDate: '2026-01-01' },
  ]
  const gapLog: GAPLogEntry = {
    id: 'g-1', farmId: FARM_UUID, farmPlotLocation: 'Doi Farm • Chiang Rai', activityType: 'Fertilizing',
    date: '2026-10-05', productUsed: 'Compost', quantity: '20 kg', createdBy: 'u-owner',
  }
  const toolbar = () => screen.getByText('Filter Logs:').closest('div.bg-gray-50') as HTMLElement
  const pick = (current: string, option: string) => {
    const select = within(toolbar()).getByText(current).closest('div.relative') as HTMLElement
    fireEvent.click(within(select).getByText(current))
    fireEvent.click(within(select).getByText(option, { selector: 'button' }))
  }

  it('has one asterisk on the required Date label', () => {
    render(<Harness user={owner} data={{ activityTypes }}><GAPComplianceHelper /></Harness>)
    const labels = Array.from(document.querySelectorAll('label')).map(l => l.textContent)
    expect(labels).toContain('Date*')
    expect(labels.some(text => /\*\s*\*/.test(text ?? ''))).toBe(false)
  })

  it('says the filters match nothing, with Clear filters, when logs exist', () => {
    render(<Harness user={owner} data={{ activityTypes, gapLogs: [gapLog] }}><GAPComplianceHelper /></Harness>)
    pick('All Farms', 'Mae Farm • Nan')

    expect(screen.getByText('No logs match these filters')).toBeInTheDocument()
    expect(screen.queryByText('No Activity Logs yet')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('Compost')).toBeInTheDocument()
  })

  it('keeps the first-use message when there are no logs at all', () => {
    render(<Harness user={owner} data={{ activityTypes }}><GAPComplianceHelper /></Harness>)
    expect(screen.getByText('No Activity Logs yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('prints the report dates with the shared English helper, not Buddhist-era Thai', () => {
    render(<Harness user={owner} data={{ activityTypes, gapLogs: [gapLog] }}><GAPComplianceHelper /></Harness>)
    fireEvent.click(screen.getByText('Generate Report'))

    const report = screen.getByText('Summary of Agricultural Practices').closest('div.overflow-y-auto') as HTMLElement
    // English whatever the machine's own locale is (a Thai one gives 2569).
    expect(within(report).getByText('Date Issued').nextElementSibling)
      .toHaveTextContent(formatDateDisplay(new Date()))
    expect(within(report).getByText('Compost').closest('tr')).toHaveTextContent('5 Oct 2026')
    expect(report).not.toHaveTextContent('2569')
    expect(report).not.toHaveTextContent(/[฀-๿]/)
  })

  it('deletes a log after the site confirm popup, once, without window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const pending = deferred<unknown>()
    vi.mocked(api.delete).mockReturnValue(pending.promise as Promise<never>)
    render(<Harness user={owner} data={{ activityTypes, gapLogs: [gapLog] }}><GAPComplianceHelper /></Harness>)

    fireEvent.click(within(screen.getByText('Compost').closest('tr') as HTMLElement).getByTitle('Delete'))
    const dialog = screen.getByRole('dialog', { name: 'Delete activity log?' })
    expect(api.delete).not.toHaveBeenCalled()

    const confirm = within(dialog).getByRole('button', { name: 'Delete log' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(within(dialog).getByRole('button', { name: 'Deleting...' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()

    pending.resolve({})
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete activity log?' })).not.toBeInTheDocument())
    expect(vi.mocked(api.delete).mock.calls).toEqual([['/gap-logs/g-1']])
    expect(screen.queryByText('Compost')).not.toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})

describe('Farm Management', { timeout: 20000 }, () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['an Admin', admin, 'Farm Management'],
    ['a farmer', owner, 'My Farm Management'],
  ])('titles the page for %s', (_label, user, title) => {
    render(<Harness user={user}><FarmManagement /></Harness>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(new RegExp(`^${title}$`))
  })

  it('says the filters match nothing, with Clear filters, when farms exist', () => {
    render(<Harness user={owner}><FarmManagement /></Harness>)
    fireEvent.change(screen.getByLabelText('Search Farms'), { target: { value: 'no such farm' } })

    expect(screen.getByText('No farms match these filters')).toBeInTheDocument()
    expect(screen.queryByText('No farms yet')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('button', { name: 'Select farm Doi Farm' })).toBeInTheDocument()
    expect(screen.getByLabelText('Search Farms')).toHaveValue('')
  })

  it('keeps the first-use message for a farmer with no farms', () => {
    render(<Harness user={{ id: 'u-new', name: 'New', roles: [UserRole.Farmer] }}><FarmManagement /></Harness>)
    expect(screen.getByText('No farms yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add My First Farm/ })).toBeInTheDocument()
  })

  it('names the farm in the delete popup without its id', () => {
    render(<Harness user={owner}><FarmManagement /></Harness>)
    const card = screen.getByRole('button', { name: 'Select farm Doi Farm' })
    fireEvent.click(within(card).getByRole('button', { name: 'Options menu' }))
    fireEvent.click(within(card).getByRole('menuitem', { name: /Delete Farm/ }))

    const dialog = screen.getByRole('dialog', { name: 'Confirm Farm Deletion' })
    expect(dialog).toHaveTextContent('Doi Farm • Chiang Rai')
    expect(dialog).not.toHaveTextContent(FARM_UUID)
  })

  describe('Map view', () => {
    // A stand-in for Leaflet that keeps each marker's popup.
    const popups = new Map<string, HTMLElement>()
    const fakeLeaflet = {
      map: () => {
        const map = { setView: () => map, invalidateSize() {}, remove() {}, removeLayer() {}, fitBounds() {} }
        return map
      },
      tileLayer: () => ({ addTo() {} }),
      divIcon: (options: unknown) => options,
      marker: ([lat, lng]: [number, number]) => {
        const key = `${lat},${lng}`
        const marker = {
          addTo: () => marker,
          bindPopup: (content: HTMLElement) => { popups.set(key, content); return marker },
          setPopupContent: (content: HTMLElement) => { popups.set(key, content) },
          setIcon() {},
          on() {},
        }
        return marker
      },
      featureGroup: function FeatureGroup() {
        return { getBounds: () => ({ pad: () => ({}) }) }
      },
    }
    beforeEach(() => {
      popups.clear()
      window.L = fakeLeaflet
    })
    afterEach(() => {
      delete window.L
    })

    it('names the same owners in the marker popup as on the card', () => {
      const shared: Farm = {
        ...doiFarm, latitude: 19.9, longitude: 99.7,
        ownerName: 'Farmer User', ownerNames: ['Somchai', 'Malee'], caretakerNames: ['Daeng'],
      }
      render(<Harness user={admin} data={{ farms: [shared] }}><FarmManagement /></Harness>)
      const card = screen.getByRole('button', { name: 'Select farm Doi Farm' })
      expect(card).toHaveTextContent('Owner: Somchai, Malee')

      fireEvent.click(screen.getByRole('button', { name: /Map View/ }))
      const popup = popups.get('19.9,99.7') as HTMLElement
      expect(popup).toHaveTextContent('Owner: Somchai, Malee')
      expect(popup).not.toHaveTextContent('Farmer User')
    })
  })
})

describe('Soil popup', { timeout: 20000 }, () => {
  beforeEach(() => vi.clearAllMocks())

  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  const fillRequired = () => {
    type('pH', '6')
    type('ฟอสฟอรัส (ppm)', '12')
    type('โพแทสเซียม (ppm)', '80')
    type('แคลเซียม (ppm)', '1200')
    type('แมกนีเซียม (ppm)', '150')
  }

  it('shows the farm by name, not its id', () => {
    render(<Harness user={owner}><FarmSoilPanel farm={doiFarm} isOpen onClose={vi.fn()} /></Harness>)
    expect(screen.getByRole('dialog', { name: 'ข้อมูลดินของฟาร์ม' })).not.toHaveTextContent(FARM_UUID)
    expect(screen.getByRole('heading', { name: 'Doi Farm' })).toBeInTheDocument()
  })

  it('says once, in Thai, that AI is not set up when the server answers 501', async () => {
    const reason = 'AI features are not set up on this server yet'
    vi.mocked(api.post).mockRejectedValue(new ApiError(reason, 501, { error: reason }))
    render(<Harness user={owner}><FarmSoilPanel farm={doiFarm} isOpen onClose={vi.fn()} /></Harness>)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /สร้างคำแนะนำ AI/ }))

    expect(await screen.findByText('ระบบ AI ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์')).toBeInTheDocument()
    expect(screen.getAllByText('ระบบ AI ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์')).toHaveLength(1)
    expect(screen.getAllByText(/เกิดข้อผิดพลาด/)).toHaveLength(1)
    expect(screen.queryByText(/AI features are not set up/)).not.toBeInTheDocument()
  })

  it('shows any other AI refusal once, as the server words it', async () => {
    const reason = 'Too many AI requests. Please wait a minute and try again.'
    vi.mocked(api.post).mockRejectedValue(new ApiError(reason, 429, { error: reason }))
    render(<Harness user={owner}><FarmSoilPanel farm={doiFarm} isOpen onClose={vi.fn()} /></Harness>)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /สร้างคำแนะนำ AI/ }))

    expect(await screen.findByText(reason)).toBeInTheDocument()
    expect(screen.getAllByText(reason)).toHaveLength(1)
  })

  it('deletes an analysis after the site confirm popup, sending one DELETE on a double click', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const pending = deferred<unknown>()
    vi.mocked(api.delete).mockReturnValue(pending.promise as Promise<never>)
    const analysis = {
      id: 's-1', farmId: FARM_UUID, farmPlotLocation: 'Plot A', testDate: '2026-09-01',
      pH: 5.6, phosphorus: 12, potassium: 140, calcium: 900, magnesium: 120,
      createdBy: 'u-owner', createdByRole: UserRole.Farmer,
    } as SoilAnalysis
    render(<Harness user={owner} data={{ soilAnalyses: [analysis] }}><FarmSoilPanel farm={doiFarm} isOpen onClose={vi.fn()} /></Harness>)

    fireEvent.click(screen.getByRole('button', { name: 'ลบผลดิน' }))
    const dialog = screen.getByRole('dialog', { name: 'ลบผลวิเคราะห์ดินนี้?' })
    const confirm = within(dialog).getByRole('button', { name: 'ยืนยันการลบ' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(within(dialog).getByRole('button', { name: 'กำลังลบ...' })).toBeDisabled()

    pending.resolve({})
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'ลบผลวิเคราะห์ดินนี้?' })).not.toBeInTheDocument())
    expect(vi.mocked(api.delete).mock.calls).toEqual([['/soil-analyses/s-1']])
    expect(screen.getByText('ยังไม่มีการบันทึกผลวิเคราะห์ดินสำหรับฟาร์มนี้')).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('keeps the popup open with the reason when the delete fails', async () => {
    vi.mocked(api.delete).mockRejectedValue(new ApiError('Forbidden', 403, { error: 'Forbidden' }))
    const analysis = {
      id: 's-1', farmId: FARM_UUID, farmPlotLocation: 'Plot A', testDate: '2026-09-01',
      pH: 5.6, phosphorus: 12, potassium: 140, calcium: 900, magnesium: 120,
      createdBy: 'u-owner', createdByRole: UserRole.Farmer,
    } as SoilAnalysis
    render(<Harness user={owner} data={{ soilAnalyses: [analysis] }}><FarmSoilPanel farm={doiFarm} isOpen onClose={vi.fn()} /></Harness>)

    fireEvent.click(screen.getByRole('button', { name: 'ลบผลดิน' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'ลบผลวิเคราะห์ดินนี้?' })).getByRole('button', { name: 'ยืนยันการลบ' }))

    const dialog = screen.getByRole('dialog', { name: 'ลบผลวิเคราะห์ดินนี้?' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('ลบผลวิเคราะห์ไม่สำเร็จ กรุณาลองใหม่')
    fireEvent.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog', { name: 'ลบผลวิเคราะห์ดินนี้?' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ลบผลดิน' })).toBeInTheDocument()
  })
})

describe('Weather popup', { timeout: 20000 }, () => {
  beforeEach(() => vi.clearAllMocks())

  const backendWeather = {
    id: 'w-1', farmId: FARM_UUID, farmPlotLocation: 'Chiang Rai', recordDate: '2026-09-20T00:00:00.000Z',
    temperatureMin: 18, temperatureMax: 28, temperatureAvg: 23, rainfall: 2, humidity: 80, source: 'Manual',
    createdAt: '2026-09-20T03:00:00.000Z',
  }

  it('shows the farm by name, not its id, and deletes a record after the site confirm popup', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    vi.mocked(api.get).mockResolvedValue({ weatherRecords: [backendWeather] })
    vi.mocked(api.delete).mockResolvedValue({})
    render(<Harness user={owner}><FarmWeatherPanel farm={doiFarm} isOpen onClose={vi.fn()} /></Harness>)

    expect(screen.getByRole('dialog', { name: 'ข้อมูลอากาศของฟาร์ม' })).not.toHaveTextContent(FARM_UUID)
    fireEvent.click(await screen.findByRole('button', { name: 'ลบข้อมูลอากาศ' }))
    const dialog = screen.getByRole('dialog', { name: 'ลบข้อมูลอากาศนี้?' })
    expect(api.delete).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'ยืนยันการลบ' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'ลบข้อมูลอากาศนี้?' })).not.toBeInTheDocument())
    expect(vi.mocked(api.delete).mock.calls).toEqual([['/weather-records/w-1']])
    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})

describe('Harvest Lots', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  const readyLot: HarvestLot = {
    id: 'hl-1', displayId: 'HL-2026-1', farmId: FARM_UUID, farmerName: 'Somchai', cherryVariety: 'Catimor',
    weightKg: 300, farmPlotLocation: 'Chiang Rai', harvestDate: '2026-09-01', status: 'Ready for Processing',
  }

  it('says the filters match nothing, with Clear filters, when lots exist', () => {
    render(<Harness user={owner} data={{ harvestLots: [readyLot] }}><HarvestLotsManagement /></Harness>)
    fireEvent.click(within(screen.getByTestId('harvest-lots-toolbar')).getByRole('button', { name: 'Complete' }))

    expect(screen.getByText('No harvest lots match these filters')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Your First Harvest Lot' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('HL-2026-1')).toBeInTheDocument()
  })

  it('keeps the first-use message when there are no lots at all', () => {
    render(<Harness user={owner}><HarvestLotsManagement /></Harness>)
    expect(screen.getByText('No harvest lots yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Your First Harvest Lot' })).toBeInTheDocument()
  })

  const farmField = (dialog: HTMLElement) =>
    within(within(dialog).getByText('Select Farm *').parentElement as HTMLElement).getAllByRole('button')[0]

  it('starts Add Harvest Lot on no farm under All Farms, and on the farm the page is filtered to', () => {
    render(<Harness user={owner}><HarvestLotsManagement /></Harness>)
    const toolbar = screen.getByTestId('harvest-lots-toolbar')

    fireEvent.click(within(toolbar).getByRole('button', { name: /Add Harvest Lot/ }))
    let dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
    expect(farmField(dialog)).toHaveTextContent('Select a farm...')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    const farmFilter = within(toolbar).getByText('Farm:').parentElement as HTMLElement
    fireEvent.click(within(farmFilter).getByRole('button', { name: 'All Farms' }))
    fireEvent.click(within(farmFilter).getByRole('button', { name: 'Mae Farm' }))
    fireEvent.click(within(toolbar).getByRole('button', { name: /Add Harvest Lot/ }))
    dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
    expect(farmField(dialog)).toHaveTextContent('Mae Farm • Nan')
  })

  it('has one asterisk on the required Harvest Date label', () => {
    render(<Harness user={owner}><HarvestLotsManagement /></Harness>)
    fireEvent.click(within(screen.getByTestId('harvest-lots-toolbar')).getByRole('button', { name: /Add Harvest Lot/ }))
    const dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
    const labels = Array.from(dialog.querySelectorAll('label')).map(l => l.textContent)
    expect(labels).toContain('Harvest Date*')
    expect(labels.some(text => /\*\s*\*/.test(text ?? ''))).toBe(false)
  })
})
