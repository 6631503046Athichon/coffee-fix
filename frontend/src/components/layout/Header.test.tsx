import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { UserRole } from '../../types'
import Header from './Header'

const logout = vi.fn()
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout, currentUser: { id: 'u-farmer', name: 'Somchai', roles: [UserRole.Farmer] } }),
}))

const renderHeader = () =>
  render(
    <MemoryRouter initialEntries={['/farmer-dashboard']}>
      <Routes>
        <Route path="/farmer-dashboard" element={<Header currentUserRoles={[UserRole.Farmer]} onToggleMobileNav={() => {}} />} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('Header logout (F44)', () => {
  beforeEach(() => {
    localStorage.clear()
    logout.mockReset()
    localStorage.setItem('form-persist-harvest-lot-modal-u-farmer', JSON.stringify({ weightKg: '42' }))
    localStorage.setItem('form-persist-harvest-lot-modal', JSON.stringify({ weightKg: '7' }))
    localStorage.setItem('weatherApiSimulateFailure', 'true')
  })

  it('clears every unsent form draft so the next person on this browser does not get it', async () => {
    logout.mockResolvedValue(undefined)
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: /Logout/ }))

    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument())
    expect(logout).toHaveBeenCalledTimes(1)
    expect(Object.keys(localStorage)).toEqual(['weatherApiSimulateFailure'])
  })

  it('clears them even when the backend logout fails', async () => {
    logout.mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: /Logout/ }))

    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument())
    expect(Object.keys(localStorage)).toEqual(['weatherApiSimulateFailure'])
  })
})
