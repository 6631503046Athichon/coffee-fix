import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { UserRole } from '../../types'
import type { AppData, Farm, GAPLogEntry, HarvestLot, SoilAnalysis, User, WeatherRecord } from '../../types'
import { api } from '../../services/api'
import { ApiError } from '../../services/apiError'
import FarmManagement from './FarmManagement'
import AddFarmPage from './AddFarmPage'
import FarmSoilPanel from './FarmSoilPanel'
import FarmWeatherPanel from './FarmWeatherPanel'
import GAPComplianceHelper from './GAPComplianceHelper'

vi.mock('../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

let auth: { currentUser: User | null } = { currentUser: null }
// Who the mocked useAuth returns; the harnesses sign in before rendering.
const signIn = (user: User) => { auth = { currentUser: user } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))

const owner: User = { id: 'u-owner', name: 'Somchai', roles: [UserRole.Farmer] }
// Farmhand on the owner's farm, with a farm of their own.
const farmhand: User = { id: 'u-hand', name: 'Malee', roles: [UserRole.Farmer] }
const admin: User = { id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }

const sharedFarm: Farm = {
  id: 'farm-1', farmName: 'Doi Farm', name: 'Doi Farm',
  // Edited since the farm's lots were recorded at "Chiang Rai".
  location: 'Chiang Rai, Mae Suai',
  farmerName: 'Somchai', ownerUserId: 'u-owner', varieties: ['Catimor'],
  collaborators: [{ id: 'c-1', farmId: 'farm-1', userId: 'u-hand', user: { id: 'u-hand', name: 'Malee' } }],
}
const handsOwnFarm: Farm = {
  id: 'farm-2', farmName: 'Malee Farm', name: 'Malee Farm', location: 'Nan',
  farmerName: 'Malee', ownerUserId: 'u-hand', varieties: ['Typica'], collaborators: [],
}

const lotOnSharedFarm: HarvestLot = {
  id: 'hl-1', farmId: 'farm-1', farmerName: 'Somchai', cherryVariety: 'Catimor', weightKg: 300,
  farmPlotLocation: 'Chiang Rai', harvestDate: '2026-09-01', status: 'Ready for Processing',
}

const weather = (id: string, source: 'Manual' | 'API'): WeatherRecord => ({
  id, farmId: 'farm-1', farmPlotLocation: 'Chiang Rai', recordDate: '2026-09-20',
  temperatureMin: 18, temperatureMax: 28, temperatureAvg: 23, rainfall: 2, humidity: 80, source,
})

const Harness: React.FC<{ user: User; data?: Partial<AppData>; children: React.ReactNode }> = ({ user, data: initial, children }) => {
  signIn(user)
  const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, farms: [sharedFarm, handsOwnFarm], ...initial })
  return (
    <MemoryRouter>
      <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
        {children}
      </DataContext.Provider>
    </MemoryRouter>
  )
}

const farmCard = (name: string) => screen.getByRole('button', { name: `Select farm ${name}` })

const openDelete = (name: string) => {
  fireEvent.click(within(farmCard(name)).getByRole('button', { name: 'Options menu' }))
  fireEvent.click(within(farmCard(name)).getByRole('menuitem', { name: /Delete Farm/ }))
  return screen.getByRole('dialog', { name: 'Confirm Farm Deletion' })
}

describe('Farm Management actions follow the backend\'s farm rules', { timeout: 20000 }, () => {
  beforeEach(() => vi.clearAllMocks())

  it('a collaborator gets no Edit or Delete on a shared farm, but keeps Soil and Weather', () => {
    render(<Harness user={farmhand}><FarmManagement /></Harness>)

    const shared = farmCard('Doi Farm')
    expect(within(shared).getByText('ผู้ดูแล')).toBeInTheDocument()
    expect(within(shared).queryByRole('button', { name: 'Options menu' })).not.toBeInTheDocument()
    expect(within(shared).getByRole('button', { name: 'Soil' })).toBeInTheDocument()
    expect(within(shared).getByRole('button', { name: 'Weather' })).toBeInTheDocument()

    // Their own farm keeps the menu.
    expect(within(farmCard('Malee Farm')).getByRole('button', { name: 'Options menu' })).toBeInTheDocument()
  })

  it.each([
    ['owner', owner],
    ['Admin', admin],
  ])('the %s gets Edit and Delete on the farm', (_label, user) => {
    render(<Harness user={user}><FarmManagement /></Harness>)

    fireEvent.click(within(farmCard('Doi Farm')).getByRole('button', { name: 'Options menu' }))
    expect(within(farmCard('Doi Farm')).getByRole('menuitem', { name: /Edit/ })).toBeInTheDocument()
    expect(within(farmCard('Doi Farm')).getByRole('menuitem', { name: /Delete Farm/ })).toBeInTheDocument()
  })

  it('finds the farm\'s lots by farmId after its location was edited, and does not delete it', () => {
    render(<Harness user={owner} data={{ harvestLots: [lotOnSharedFarm] }}><FarmManagement /></Harness>)

    const dialog = openDelete('Doi Farm')

    expect(within(dialog).getByText('Cannot delete farm because it has related data')).toBeInTheDocument()
    expect(within(dialog).getByText('Harvest Lots:').parentElement).toHaveTextContent('Harvest Lots: 1 entries')
    expect(within(dialog).queryByRole('button', { name: /Delete Farm/ })).not.toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('lets the farm\'s weather records, fetched or typed in, go with the farm', async () => {
    vi.mocked(api.delete).mockResolvedValue({ message: 'Farm deleted successfully' })
    render(<Harness user={owner} data={{ weatherRecords: [weather('w-1', 'Manual'), weather('w-2', 'API')] }}><FarmManagement /></Harness>)

    const dialog = openDelete('Doi Farm')
    expect(within(dialog).queryByText('Cannot delete farm because it has related data')).not.toBeInTheDocument()
    expect(within(dialog).getByText(/2 weather records/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete Farm/ }))

    await waitFor(() => expect(screen.getByText('Farm deleted successfully')).toBeInTheDocument())
    expect(api.delete).toHaveBeenCalledWith('/farms/farm-1')
    expect(screen.queryByRole('button', { name: 'Select farm Doi Farm' })).not.toBeInTheDocument()
  })

  it('shows what the backend found linked when it refuses the delete (409)', async () => {
    vi.mocked(api.delete).mockRejectedValue(new ApiError('This farm still has records linked to it.', 409, {
      error: 'This farm still has records linked to it.',
      dependents: { harvestLots: 3, gapLogs: 0, soilAnalyses: 1 },
    }))
    render(<Harness user={owner}><FarmManagement /></Harness>)

    fireEvent.click(within(openDelete('Doi Farm')).getByRole('button', { name: /Delete Farm/ }))

    await waitFor(() => expect(screen.getByText(
      'Cannot delete farm because it has related data. Please delete the following first: Harvest Lots (3), Soil Analyses (1)',
    )).toBeInTheDocument())
    expect(farmCard('Doi Farm')).toBeInTheDocument()
  })
})

describe('Collaborators record data on a shared farm', { timeout: 20000 }, () => {
  beforeEach(() => vi.clearAllMocks())

  const backendWeather = {
    id: 'w-1', farmId: 'farm-1', farmPlotLocation: 'Chiang Rai', recordDate: '2026-09-20T00:00:00.000Z',
    temperatureMin: 18, temperatureMax: 28, temperatureAvg: 23, rainfall: 2, humidity: 80, source: 'Manual',
    createdAt: '2026-09-20T03:00:00.000Z',
  }

  it.each([
    ['a collaborator edits weather records but cannot delete them', farmhand, false],
    ['the owner can delete them', owner, true],
    ['an Admin can delete them', admin, true],
  ])('%s', async (_label, user, canDelete) => {
    vi.mocked(api.get).mockResolvedValue({ weatherRecords: [backendWeather] })
    render(<Harness user={user}><FarmWeatherPanel farm={sharedFarm} isOpen onClose={vi.fn()} /></Harness>)

    // The shared farm's own records are listed (asked for by its farmId).
    await waitFor(() => expect(screen.getByRole('button', { name: 'แก้ไขข้อมูลอากาศ' })).toBeInTheDocument())
    expect(vi.mocked(api.get).mock.calls[0][0]).toBe('/weather-records')
    expect(vi.mocked(api.get).mock.calls[0][1]).toMatchObject({ farmId: 'farm-1' })
    expect(screen.queryByRole('button', { name: 'ลบข้อมูลอากาศ' }) !== null).toBe(canDelete)
  })

  it.each([
    ['a collaborator edits soil analyses but cannot delete them', farmhand, false],
    ['the owner can delete them', owner, true],
    ['an Admin can delete them', admin, true],
  ])('%s', (_label, user, canDelete) => {
    const analysis = {
      id: 's-1', farmId: 'farm-1', farmPlotLocation: 'Chiang Rai', testDate: '2026-09-01',
      pH: 5.6, phosphorus: 12, potassium: 140, calcium: 900, magnesium: 120,
      createdBy: 'u-hand', createdByRole: UserRole.Farmer,
    } as SoilAnalysis
    render(<Harness user={user} data={{ soilAnalyses: [analysis] }}><FarmSoilPanel farm={sharedFarm} isOpen onClose={vi.fn()} /></Harness>)

    expect(screen.getByRole('button', { name: 'แก้ไขผลดิน' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ลบผลดิน' }) !== null).toBe(canDelete)
  })

  it('a collaborator can pick the shared farm for a GAP activity and sees its logs', () => {
    const gapLog: GAPLogEntry = {
      id: 'g-1', farmId: 'farm-1', farmPlotLocation: 'Doi Farm • Chiang Rai', activityType: 'Fertilizing',
      date: '2026-09-10', productUsed: 'Compost', quantity: '20 kg',
    }
    render(<Harness user={farmhand} data={{ gapLogs: [gapLog] }}><GAPComplianceHelper /></Harness>)

    expect(screen.getByText('Compost')).toBeInTheDocument()
    const toolbar = screen.getByText('Filter Logs:').closest('div.bg-gray-50') as HTMLElement
    fireEvent.click(within(toolbar).getByText('All Farms'))
    expect(within(toolbar).getByText('Doi Farm • Chiang Rai, Mae Suai', { selector: 'button' })).toBeInTheDocument()
  })

  describe('GAP logs: deleting or moving one off its farm', () => {
    const originalScrollIntoView = Element.prototype.scrollIntoView
    // jsdom has no scrollIntoView; Edit scrolls to the form on a timer.
    beforeAll(() => { Element.prototype.scrollIntoView = vi.fn() })
    afterAll(() => { Element.prototype.scrollIntoView = originalScrollIntoView })

    const log = (id: string, productUsed: string, createdBy: string): GAPLogEntry => ({
      id, farmId: 'farm-1', farmPlotLocation: 'Doi Farm • Chiang Rai', activityType: 'Fertilizing',
      date: '2026-09-10', productUsed, quantity: '20 kg', createdBy,
    })
    // Recorded by the owner, and by the farmhand.
    const ownersLog = log('g-1', 'Compost', 'u-owner')
    const handsLog = log('g-2', 'Lime', 'u-hand')

    const row = (productUsed: string) => screen.getByText(productUsed).closest('tr') as HTMLElement
    const farmPicker = () => within(screen.getByText('Farm/Plot *').parentElement as HTMLElement).getByRole('button')

    it('a collaborator deletes only the logs they recorded, and edits the owner\'s in place on its farm', () => {
      render(<Harness user={farmhand} data={{ gapLogs: [ownersLog, handsLog] }}><GAPComplianceHelper /></Harness>)

      expect(within(row('Compost')).getByTitle('Edit')).toBeInTheDocument()
      expect(within(row('Compost')).queryByTitle('Delete')).not.toBeInTheDocument()
      expect(within(row('Lime')).getByTitle('Delete')).toBeInTheDocument()

      // The owner's log stays on its farm (the backend refuses the move).
      fireEvent.click(within(row('Compost')).getByTitle('Edit'))
      expect(screen.getByText('Edit Activity Log')).toBeInTheDocument()
      expect(farmPicker()).toBeDisabled()

      // Their own log may move, as they may delete it.
      fireEvent.click(within(row('Lime')).getByTitle('Edit'))
      expect(farmPicker()).toBeEnabled()
    })

    it.each([
      ['owner', owner],
      ['Admin', admin],
    ])('the %s deletes and moves any of the farm\'s logs', (_label, user) => {
      render(<Harness user={user} data={{ gapLogs: [ownersLog, handsLog] }}><GAPComplianceHelper /></Harness>)

      expect(within(row('Compost')).getByTitle('Delete')).toBeInTheDocument()
      expect(within(row('Lime')).getByTitle('Delete')).toBeInTheDocument()
      fireEvent.click(within(row('Lime')).getByTitle('Edit'))
      expect(farmPicker()).toBeEnabled()
    })
  })
})

describe('A collaborator cannot reach the farm edit form', { timeout: 20000 }, () => {
  // A stand-in for Leaflet, which the map loads from a CDN: it keeps each
  // marker's popup so the test can look inside it.
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
  const withGps = (farm: Farm, latitude: number, longitude: number): Farm => ({ ...farm, latitude, longitude })
  const mappedFarms = [withGps(sharedFarm, 19.9, 99.7), withGps(handsOwnFarm, 18.8, 100.8)]
  const popupOf = (farm: Farm) => popups.get(`${farm.latitude},${farm.longitude}`)!
  const detailsButton = (farm: Farm) => within(popupOf(farm)).queryByRole('button', { name: 'ดูรายละเอียด Farm' })

  beforeEach(() => {
    vi.clearAllMocks()
    popups.clear()
    window.L = fakeLeaflet
  })
  afterEach(() => {
    delete window.L
  })

  it('in Map view, the shared farm\'s popup has no link to the edit form; their own farm\'s has', () => {
    render(<Harness user={farmhand} data={{ farms: mappedFarms }}><FarmManagement /></Harness>)
    fireEvent.click(screen.getByRole('button', { name: /Map View/ }))

    expect(popupOf(mappedFarms[0]).textContent).toContain('Doi Farm')
    expect(detailsButton(mappedFarms[0])).toBeNull()
    expect(detailsButton(mappedFarms[1])).not.toBeNull()
  })

  it.each([
    ['owner', owner],
    ['Admin', admin],
  ])('in Map view, the %s keeps the link on the farm', (_label, user) => {
    render(<Harness user={user} data={{ farms: mappedFarms }}><FarmManagement /></Harness>)
    fireEvent.click(screen.getByRole('button', { name: /Map View/ }))

    expect(detailsButton(mappedFarms[0])).not.toBeNull()
  })

  const EditRoute: React.FC<{ user: User }> = ({ user }) => {
    signIn(user)
    const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, farms: [sharedFarm, handsOwnFarm] })
    return (
      <MemoryRouter initialEntries={['/farmer-farms/edit/farm-1']}>
        <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
          <Routes>
            <Route path="/farmer-farms/edit/:farmId" element={<AddFarmPage />} />
            <Route path="/farmer-farms" element={<p>Farm Management page</p>} />
          </Routes>
        </DataContext.Provider>
      </MemoryRouter>
    )
  }

  it('opening the shared farm\'s edit address shows a notice instead of the form', async () => {
    vi.mocked(api.get).mockResolvedValue({})
    render(<EditRoute user={farmhand} />)

    expect(screen.getByText(/Only the farm's owner or an Admin can edit Doi Farm/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Update Farm/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add|Remove/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Back to Farm Management/ }))
    expect(await screen.findByText('Farm Management page')).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it.each([
    ['owner', owner],
    ['Admin', admin],
  ])('the %s gets the edit form', async (_label, user) => {
    vi.mocked(api.get).mockResolvedValue({})
    render(<EditRoute user={user} />)

    expect(await screen.findByRole('button', { name: /Update Farm/ })).toBeInTheDocument()
    expect(screen.queryByText(/Only the farm's owner or an Admin can edit/)).not.toBeInTheDocument()
  })
})
