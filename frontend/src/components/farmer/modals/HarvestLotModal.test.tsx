import React, { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../../constants'
import { DataContext } from '../../../hooks/useDataContext'
import { UserRole } from '../../../types'
import type { AppData, CropYear, Farm, User } from '../../../types'
import HarvestLotModal from './HarvestLotModal'

// F44: the popup used to mark itself dirty as soon as it filled in its own
// defaults (current crop year, first variety), so every page that mounts it
// asked "leave page?" on reload; and its draft was one browser-wide key, so
// the next person to sign in on that browser got it.

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

let auth: { currentUser: User | null } = { currentUser: null }
// Who the mocked useAuth returns; the harness signs in before rendering.
const signIn = (user: User) => { auth = { currentUser: user } }
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => auth }))

const somchai: User = { id: 'u-somchai', name: 'Somchai', roles: [UserRole.Farmer] }
const malee: User = { id: 'u-malee', name: 'Malee', roles: [UserRole.Farmer] }

const farms: Farm[] = [
  { id: 'farm-s', farmName: 'Doi Farm', name: 'Doi Farm', location: 'Chiang Rai', farmerName: 'Somchai', ownerUserId: 'u-somchai', varieties: ['Catimor'] },
  { id: 'farm-m', farmName: 'Mae Farm', name: 'Mae Farm', location: 'Nan', farmerName: 'Malee', ownerUserId: 'u-malee', varieties: ['Typica'] },
]

// The popup lists the crop years around today by name; the dates are wide
// enough to make this the current one whatever day the suite runs on.
const now = new Date()
const activeStart = now.getMonth() + 1 >= 10 ? now.getFullYear() : now.getFullYear() - 1
const currentYearName = `${activeStart}/${activeStart + 1}`
const cropYears: CropYear[] = [
  { id: '11111111-1111-4111-8111-111111111111', year: currentYearName, startDate: '2000-01-01', endDate: '2999-12-31' },
]

const Harness: React.FC<{ user: User; farm?: Farm; open?: boolean }> = ({ user, farm, open = true }) => {
  signIn(user)
  const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, farms, cropYears })
  return (
    <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
      <HarvestLotModal isOpen={open} onClose={() => {}} farm={farm} />
    </DataContext.Provider>
  )
}

// What the browser does on reload: true when the page asked "leave page?".
const leavePrompted = () => {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

const draftKeys = () => Object.keys(localStorage).filter((key) => key.startsWith('form-persist-'))

describe('Harvest lot popup draft (F44)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fills in its defaults without asking "leave page?" or saving a draft', async () => {
    render(<Harness user={somchai} />)
    const dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
    // The defaults are in: the first variety and the current crop year.
    await waitFor(() => expect(within(dialog).getByText('Catimor', { selector: 'span' })).toBeInTheDocument())
    expect(within(dialog).getByRole('button', { name: new RegExp(currentYearName) })).toHaveClass('bg-green-600')

    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(leavePrompted()).toBe(false)
    expect(draftKeys()).toEqual([])
  })

  it('still guards a real change and saves it as this user\'s draft', async () => {
    render(<Harness user={somchai} />)
    const dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
    fireEvent.change(within(dialog).getByLabelText('Weight (kg) *'), { target: { value: '42' } })

    expect(leavePrompted()).toBe(true)
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(draftKeys()).toEqual(['form-persist-harvest-lot-modal-u-somchai'])
    expect(JSON.parse(localStorage.getItem('form-persist-harvest-lot-modal-u-somchai')!)).toMatchObject({ weightKg: '42' })
  })

  it('does not mark itself dirty when it opens on a farm passed in by the page', async () => {
    render(<Harness user={somchai} farm={farms[0]} />)
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(leavePrompted()).toBe(false)
    expect(draftKeys()).toEqual([])
  })

  it('never shows another user\'s draft, nor the old browser-wide one', () => {
    localStorage.setItem('form-persist-harvest-lot-modal', JSON.stringify({ weightKg: '777' }))
    localStorage.setItem('form-persist-harvest-lot-modal-u-malee', JSON.stringify({ weightKg: '999' }))

    const { unmount } = render(<Harness user={somchai} />)
    let dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
    expect(within(dialog).getByLabelText('Weight (kg) *')).toHaveValue(null)
    expect(within(dialog).queryByText('ข้อมูลที่กรอกก่อนหน้านี้ถูกกู้คืนแล้ว')).not.toBeInTheDocument()
    unmount()

    // Malee gets her own draft back.
    render(<Harness user={malee} />)
    dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
    expect(within(dialog).getByLabelText('Weight (kg) *')).toHaveValue(999)
    expect(within(dialog).getByText('ข้อมูลที่กรอกก่อนหน้านี้ถูกกู้คืนแล้ว')).toBeInTheDocument()
  })
})

describe('Harvest lot popup: switching farm and the default date', () => {
  const admin: User = { id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }
  const draftKey = 'form-persist-harvest-lot-modal-u-admin'

  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('drops the restored draft and its banner when the user picks another farm', async () => {
    localStorage.setItem(draftKey, JSON.stringify({ weightKg: '42', cherryVariety: 'Catimor' }))
    render(<Harness user={admin} />)
    const dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
    expect(within(dialog).getByLabelText('Weight (kg) *')).toHaveValue(42)
    expect(within(dialog).getByText('ข้อมูลที่กรอกก่อนหน้านี้ถูกกู้คืนแล้ว')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: /Doi Farm/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Mae Farm/ }))

    expect(within(dialog).getByLabelText('Weight (kg) *')).toHaveValue(null)
    expect(within(dialog).queryByText('ข้อมูลที่กรอกก่อนหน้านี้ถูกกู้คืนแล้ว')).not.toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(1000) })
    // A reload must not bring the discarded weight back.
    expect(localStorage.getItem(draftKey)).toBeNull()
    expect(leavePrompted()).toBe(false)

    // What is typed for the new farm is saved as usual.
    fireEvent.change(within(dialog).getByLabelText('Weight (kg) *'), { target: { value: '15' } })
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(JSON.parse(localStorage.getItem(draftKey)!)).toMatchObject({ weightKg: '15', cherryVariety: 'Typica' })
  })

  describe('on Thai time', () => {
    const originalTZ = process.env.TZ
    beforeAll(() => {
      process.env.TZ = 'Asia/Bangkok'
    })
    afterAll(() => {
      if (originalTZ === undefined) delete process.env.TZ
      else process.env.TZ = originalTZ
    })

    it("defaults the harvest date to the viewer's today, not the UTC day, also after a farm switch", () => {
      // 01:30 on 5 October in Thailand, still 4 October in UTC.
      vi.setSystemTime(new Date('2026-10-04T18:30:00.000Z'))
      render(<Harness user={admin} />)
      const dialog = screen.getByRole('dialog', { name: 'Register New Harvest Lot' })
      expect(within(dialog).getByRole('button', { name: '5 October 2026' })).toBeInTheDocument()

      fireEvent.click(within(dialog).getByRole('button', { name: /Doi Farm/ }))
      fireEvent.click(within(dialog).getByRole('button', { name: /Mae Farm/ }))
      expect(within(dialog).getByRole('button', { name: '5 October 2026' })).toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: '4 October 2026' })).not.toBeInTheDocument()
    })
  })
})
