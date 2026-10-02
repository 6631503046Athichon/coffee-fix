import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { User, UserRole } from '../../types'
import { firstLoginUpdate } from '../../services/auth/authService'
import { FirstLoginSetup } from './FirstLoginSetup'

// The setup form checks the same rules as the backend before sending, keeps
// the user on the page with the server's message when the request fails, and
// is where the user signs out (the rest of the app is closed to them).

const { auth } = vi.hoisted(() => ({
  auth: { setUser: vi.fn(), logout: vi.fn(async () => {}) },
}))

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../services/auth/authService', () => ({ firstLoginUpdate: vi.fn() }))

const newcomer: User = {
  id: 'u-new',
  name: 'New Farmer',
  username: 'farmer_007',
  roles: [UserRole.Farmer],
  mustChangePassword: true,
  mustChangeUsername: true,
  mustChangeEmail: false,
}

const renderSetup = (user: User = newcomer) =>
  render(
    <MemoryRouter initialEntries={['/first-login-setup']}>
      <Routes>
        <Route path="/first-login-setup" element={<FirstLoginSetup user={user} />} />
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  )

const fill = (fields: { current?: string; username?: string; password?: string; confirm?: string }) => {
  if (fields.current !== undefined) {
    fireEvent.change(screen.getByLabelText(/Current Password/), { target: { value: fields.current } })
  }
  if (fields.username !== undefined) {
    fireEvent.change(screen.getByLabelText(/New Username/), { target: { value: fields.username } })
  }
  if (fields.password !== undefined) {
    fireEvent.change(screen.getByLabelText(/^New Password/), { target: { value: fields.password } })
    fireEvent.change(screen.getByLabelText(/Confirm New Password/), {
      target: { value: fields.confirm ?? fields.password },
    })
  }
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Update & Continue' }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FirstLoginSetup', () => {
  it.each([
    ['newpassword123', 'Password must contain an uppercase letter'],
    ['NEWPASSWORD123', 'Password must contain a lowercase letter'],
    ['NewPassword', 'Password must contain a number'],
    ['Short1a', 'Password must be at least 8 characters long'],
  ])('refuses the weak password %s before sending it', (password, message) => {
    renderSetup()
    fill({ current: 'TempPass123', username: 'somchai', password })
    submit()

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(firstLoginUpdate).not.toHaveBeenCalled()
  })

  it('refuses to keep the current password', () => {
    renderSetup()
    fill({ current: 'TempPass123', username: 'somchai', password: 'TempPass123' })
    submit()

    expect(screen.getByText(/different from the current password/)).toBeInTheDocument()
    expect(firstLoginUpdate).not.toHaveBeenCalled()
  })

  it.each([['me@example.com'], ['ab'], ['has space']])('refuses the username %s', (username) => {
    renderSetup()
    fill({ current: 'TempPass123', username, password: 'MyOwnPass99' })
    submit()

    expect(screen.getByText(/letters, numbers, _ or -/, { selector: 'div' })).toBeInTheDocument()
    expect(firstLoginUpdate).not.toHaveBeenCalled()
  })

  it('shows a wrong current password and keeps the user signed in', async () => {
    vi.mocked(firstLoginUpdate).mockRejectedValueOnce(new Error('Current password is incorrect'))
    renderSetup()
    fill({ current: 'WrongPass1', username: 'somchai', password: 'MyOwnPass99' })
    submit()

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
    expect(auth.logout).not.toHaveBeenCalled()
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument()
  })

  it('sends valid details, stores the returned user and leaves the setup page', async () => {
    const saved = { ...newcomer, username: 'somchai', mustChangePassword: false, mustChangeUsername: false }
    vi.mocked(firstLoginUpdate).mockResolvedValueOnce({ user: saved, message: 'ok' })
    renderSetup()
    fill({ current: 'TempPass123', username: 'somchai', password: 'MyOwnPass99' })
    submit()

    expect(await screen.findByText('HOME')).toBeInTheDocument()
    expect(firstLoginUpdate).toHaveBeenCalledWith({
      currentPassword: 'TempPass123',
      newUsername: 'somchai',
      newEmail: undefined,
      newPassword: 'MyOwnPass99',
    })
    expect(auth.setUser).toHaveBeenCalledWith(saved)
  })

  it('shows and sends the username and email in lowercase, as they are saved and typed at sign-in', async () => {
    // Phone keyboards capitalise the first letter; the backend lowercases
    // both, so the form must show what the user will have to type later.
    vi.mocked(firstLoginUpdate).mockResolvedValueOnce({ user: { ...newcomer }, message: 'ok' })
    renderSetup({ ...newcomer, mustChangeEmail: true })
    fill({ current: 'TempPass123', username: 'Somchai_Farm', password: 'MyOwnPass99' })
    fireEvent.change(screen.getByLabelText(/Email Address/), { target: { value: 'Somchai@Gmail.com' } })

    expect(screen.getByLabelText(/New Username/)).toHaveValue('somchai_farm')
    expect(screen.getByLabelText(/Email Address/)).toHaveValue('somchai@gmail.com')
    expect(screen.getByLabelText(/New Username/)).toHaveAttribute('autocapitalize', 'none')
    expect(screen.getByLabelText(/Email Address/)).toHaveAttribute('autocapitalize', 'none')

    submit()
    await waitFor(() => expect(firstLoginUpdate).toHaveBeenCalledWith(expect.objectContaining({
      newUsername: 'somchai_farm',
      newEmail: 'somchai@gmail.com',
    })))
  })

  it('lets the user sign out', async () => {
    renderSetup()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(auth.logout).toHaveBeenCalled())
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument()
  })
})
