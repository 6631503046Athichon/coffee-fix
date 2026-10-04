import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { User, UserRole } from '../../types'
import { getAllUsers } from '../../services/auth/userService'
import UserManagement from './UserManagement'

// At phone width the User Management header kept the title and the Transfer
// Ownership / Create User buttons on one row, so the buttons ran off the
// card. Below sm they now stack under the title and fill the width.

const { auth } = vi.hoisted(() => ({ auth: { currentUser: null as User | null } }))

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../services/auth/userService', () => ({
  getAllUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  transferOwnership: vi.fn(),
}))

const root: User = { id: 'u-root', name: 'Rita Root', username: 'rita', roles: [UserRole.Admin], isSuperAdmin: true }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAllUsers).mockResolvedValue([root])
  auth.currentUser = root
})

describe('User Management header at phone width', () => {
  it('stacks the title and the buttons on mobile, one row from sm up', async () => {
    render(
      <MemoryRouter>
        <UserManagement />
      </MemoryRouter>,
    )
    await screen.findAllByText('Rita Root')

    const header = screen.getByTestId('user-management-header')
    expect(header).toHaveClass('flex', 'flex-col', 'gap-4', 'sm:flex-row', 'sm:items-center', 'sm:justify-between')
    expect(header).not.toHaveClass('justify-between')

    const transfer = within(header).getByRole('button', { name: /Transfer Ownership/ })
    const create = within(header).getByRole('button', { name: /Create User/ })
    const buttons = transfer.parentElement as HTMLElement
    expect(create.parentElement).toBe(buttons)
    expect(buttons).toHaveClass('flex', 'flex-col', 'sm:flex-row')
    expect(transfer).toHaveClass('justify-center')
    expect(create).toHaveClass('justify-center')
  })
})
