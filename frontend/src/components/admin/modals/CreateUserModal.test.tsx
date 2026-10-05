import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '../../../types'
import { createUser } from '../../../services/auth/userService'
import CreateUserModal from './CreateUserModal'

// F45: once the backend has created the user, closing the popup any way
// (Done, the X, after confirming) refreshes the list behind it. Closing with
// the X used to skip the refresh, so the Admin could think the create failed
// and make the account a second time.

vi.mock('../../../services/auth/userService', () => ({ createUser: vi.fn() }))

const credentials = { username: 'farmer_008', password: 'Tmp-Pass-1', message: 'Share these with the user.' }

const setup = () => {
  const onClose = vi.fn()
  const onUserCreated = vi.fn()
  render(<CreateUserModal isOpen onClose={onClose} onUserCreated={onUserCreated} />)
  return { onClose, onUserCreated }
}

const createFarmer = async () => {
  fireEvent.change(screen.getByPlaceholderText("Enter user's full name"), { target: { value: 'New Farmer' } })
  fireEvent.click(screen.getByRole('checkbox', { name: UserRole.Farmer }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createUser).mockResolvedValue({
    user: { id: 'u-new', name: 'New Farmer', roles: [UserRole.Farmer] },
    credentials,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Create User popup refreshes the list after a create', () => {
  it('when closed with the X (after confirming)', async () => {
    const { onClose, onUserCreated } = setup()
    await createFarmer()
    expect(screen.getByText('User Created Successfully')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    // The site's confirm popup asks, not the browser's confirm box.
    expect(screen.getByRole('dialog', { name: 'Close without saving the credentials?' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close anyway' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onUserCreated).toHaveBeenCalledTimes(1)
  })

  it('when closed with Done, once', async () => {
    const { onClose, onUserCreated } = setup()
    await createFarmer()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onUserCreated).toHaveBeenCalledTimes(1)
  })

  it('stays open, without refreshing, when the X is not confirmed', async () => {
    const { onClose, onUserCreated } = setup()
    await createFarmer()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))

    expect(screen.queryByRole('dialog', { name: 'Close without saving the credentials?' })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(onUserCreated).not.toHaveBeenCalled()
    expect(screen.getByText('User Created Successfully')).toBeInTheDocument()
  })

  it('closes and refreshes when the backend returns no credentials to show', async () => {
    vi.mocked(createUser).mockResolvedValue({ user: { id: 'u-new', name: 'New Farmer', roles: [UserRole.Farmer] } })
    const { onClose, onUserCreated } = setup()

    await createFarmer()

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onUserCreated).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when closed without creating anyone', () => {
    const { onClose, onUserCreated } = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onUserCreated).not.toHaveBeenCalled()
  })

  it('does not refresh when the create fails', async () => {
    vi.mocked(createUser).mockRejectedValue(new Error('Email already in use'))
    const { onClose, onUserCreated } = setup()
    await createFarmer()
    expect(screen.getByText('Email already in use')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onUserCreated).not.toHaveBeenCalled()
  })
})

describe('Create User popup while the create is in flight', () => {
  it('cannot be closed, so a slow create still refreshes the list and its credentials do not leak into the next open', async () => {
    let finish!: (value: Awaited<ReturnType<typeof createUser>>) => void
    vi.mocked(createUser).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const { onClose, onUserCreated } = setup()
    await createFarmer()
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled()

    const close = screen.getByRole('button', { name: 'Close' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(close).toBeDisabled()
    expect(cancel).toBeDisabled()
    fireEvent.click(close)
    fireEvent.click(cancel)
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => {
      finish({ user: { id: 'u-new', name: 'New Farmer', roles: [UserRole.Farmer] }, credentials })
    })
    // The credentials show in this popup, and closing it refreshes the list.
    expect(screen.getByText('User Created Successfully')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onUserCreated).toHaveBeenCalledTimes(1)
  })

  it('can be closed again once a failed create is over', async () => {
    let fail!: (error: Error) => void
    vi.mocked(createUser).mockReturnValue(new Promise((_resolve, reject) => { fail = reject }))
    const { onClose } = setup()
    await createFarmer()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    await act(async () => {
      fail(new Error('Email already in use'))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
