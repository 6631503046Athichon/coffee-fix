import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { User, UserRole } from '../../types'
import { deleteUser, getAllUsers } from '../../services/auth/userService'
import UserManagement from './UserManagement'
import { EditUserModal } from './modals'

// Production-test findings on User Management: an empty search or filter
// says so (with a way out) instead of inviting the Admin to create a first
// user, roles read "Head Judge" rather than the enum, and a delete asks in the
// site's confirm popup.

const { auth } = vi.hoisted(() => ({ auth: { currentUser: null as User | null } }))

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../services/auth/userService', () => ({
  getAllUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  transferOwnership: vi.fn(),
}))

const admin: User = { id: 'u-admin', name: 'Adam Admin', username: 'adam', roles: [UserRole.Admin], isActive: true }
const judge: User = { id: 'u-judge', name: 'Jo Judge', username: 'jo', roles: [UserRole.HeadJudge, UserRole.Cupper], isActive: true }

const renderPage = () =>
  render(
    <MemoryRouter>
      <UserManagement />
    </MemoryRouter>,
  )

let confirmSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  auth.currentUser = admin
  confirmSpy = vi.spyOn(window, 'confirm')
  vi.mocked(getAllUsers).mockImplementation(async (filters) =>
    [admin, judge].filter((user) => !filters?.role || user.roles.includes(filters.role as UserRole)),
  )
})

afterEach(() => {
  expect(confirmSpy).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

const pickRole = async (label: string) => {
  fireEvent.click(screen.getByRole('button', { name: /All Roles/ }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }))
  })
}

describe('User Management roles', { timeout: 20000 }, () => {
  it('shows Head Judge on the chips and in the role filter, and filters by the enum', async () => {
    renderPage()
    const row = (await screen.findByText('Jo Judge')).closest('tr')!
    expect(within(row).getByText('Head Judge')).toBeInTheDocument()
    expect(within(row).queryByText('HeadJudge')).not.toBeInTheDocument()

    await pickRole('Head Judge')

    expect(getAllUsers).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'HeadJudge' }))
    expect(screen.queryByText('HeadJudge')).not.toBeInTheDocument()
  })
})

describe('User Management empty list', { timeout: 20000 }, () => {
  it('says no users match a filter, and Clear filters brings the list back', async () => {
    renderPage()
    await screen.findByText('Jo Judge')
    vi.mocked(getAllUsers).mockResolvedValueOnce([])

    await pickRole('Farmer')

    expect(await screen.findByText('No users match these filters')).toBeInTheDocument()
    expect(screen.queryByText(/add your first user/)).not.toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    })
    expect(await screen.findByText('Jo Judge')).toBeInTheDocument()
    expect(getAllUsers).toHaveBeenLastCalledWith({ search: undefined, role: undefined, status: undefined })
  })

  it('keeps the first-use text when there are no users and no filter', async () => {
    vi.mocked(getAllUsers).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No users found')).toBeInTheDocument()
    expect(screen.getByText(/add your first user/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('says the users could not be loaded, not that there are none, when the load fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getAllUsers).mockRejectedValue(new Error('Failed to fetch'))
    renderPage()

    expect(await screen.findByText('Users could not be loaded')).toBeInTheDocument()
    expect(screen.getByText(/Cannot connect to backend server/)).toBeInTheDocument()
    expect(screen.queryByText('No users found')).not.toBeInTheDocument()
    expect(screen.queryByText(/add your first user/)).not.toBeInTheDocument()
  })

  it('does not say no users match a filter when the filtered load fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPage()
    await screen.findByText('Jo Judge')
    vi.mocked(getAllUsers).mockRejectedValueOnce(new Error('500 Internal Server Error'))

    await pickRole('Farmer')

    expect(await screen.findByText('Users could not be loaded')).toBeInTheDocument()
    expect(screen.queryByText('No users match these filters')).not.toBeInTheDocument()
    expect(screen.queryByText(/users? found/)).not.toBeInTheDocument()
  })
})

describe('User Management delete', { timeout: 20000 }, () => {
  it('asks in the site popup, waits on it, then reloads the list', async () => {
    let finish!: () => void
    vi.mocked(deleteUser).mockReturnValue(new Promise<void>((resolve) => { finish = resolve }) as never)
    renderPage()
    const row = (await screen.findByText('Jo Judge')).closest('tr')!

    fireEvent.click(within(row).getByRole('button', { name: 'Delete user' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete user?' })
    expect(dialog).toHaveTextContent('Delete Jo Judge? This cannot be undone.')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete user' }))
    expect(deleteUser).toHaveBeenCalledWith('u-judge')
    expect(within(dialog).getByRole('button', { name: 'Keep user' })).toBeDisabled()

    vi.mocked(getAllUsers).mockResolvedValue([admin])
    await act(async () => { finish() })
    await waitFor(() => expect(screen.queryByText('Jo Judge')).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a refusal inside the popup', async () => {
    vi.mocked(deleteUser).mockRejectedValue(new Error('User owns farms'))
    renderPage()
    const row = (await screen.findByText('Jo Judge')).closest('tr')!

    fireEvent.click(within(row).getByRole('button', { name: 'Delete user' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete user' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('User owns farms')
    expect(screen.getByText('Jo Judge')).toBeInTheDocument()
  })
})

describe('Edit User popup', () => {
  it('labels the role checkboxes and says what changing the username does', () => {
    render(<EditUserModal isOpen user={judge} onClose={() => {}} onUserUpdated={() => {}} />)
    expect(screen.getByRole('checkbox', { name: 'Head Judge' })).toBeChecked()
    expect(screen.getByText('Change it to give the user a new username')).toBeInTheDocument()
    expect(screen.queryByText(/Clear the field/)).not.toBeInTheDocument()
  })
})
