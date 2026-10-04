import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { User, UserRole } from '../../types'
import Login from './Login'
import AuthLoadingScreen, { AUTH_SLOW_HINT_MS } from './AuthLoadingScreen'
import { loginRedirectState, postLoginPath, redirectTargetFrom } from './loginRedirect'

// F41: a signed-out visitor of an app page is sent to /login with the page in
// the navigation state; once signed in (by the form, or by a session check
// that answered late on a cold backend) the login page goes on to that page
// instead of always landing on the dashboard.

const { auth } = vi.hoisted(() => ({
  auth: {
    currentUser: null as User | null,
    isAuthenticated: false,
    isAuthLoading: false,
    login: vi.fn(),
  },
}))

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))

const farmer: User = { id: 'u-farmer', name: 'Fern Farmer', username: 'fern', roles: [UserRole.Farmer] }
const newcomer: User = { ...farmer, id: 'u-new', mustChangePassword: true }

const loginPage = (state?: unknown) => (
  <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/farmer-dashboard" element={<div>FARMER DASHBOARD</div>} />
      <Route path="/harvest-lots" element={<div>HARVEST LOTS</div>} />
      <Route path="/first-login-setup" element={<div>SETUP PAGE</div>} />
    </Routes>
  </MemoryRouter>
)

const renderLogin = (state?: unknown) => render(loginPage(state))

const signInWithForm = async () => {
  fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'fern' } })
  fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'Secret123' } })
  await act(async () => {
    fireEvent.click(screen.getByTestId('login-submit'))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.currentUser = null
  auth.isAuthenticated = false
  auth.isAuthLoading = false
})

describe('login page sends the user on to the page they asked for', () => {
  it('after signing in with the form', async () => {
    auth.login.mockResolvedValue(farmer)
    renderLogin(loginRedirectState({ pathname: '/harvest-lots' }))

    await signInWithForm()

    expect(await screen.findByText('HARVEST LOTS')).toBeInTheDocument()
  })

  it('when a slow session check signs the user in after the page has opened', async () => {
    const state = loginRedirectState({ pathname: '/harvest-lots' })
    const { rerender } = renderLogin(state)
    expect(screen.getByTestId('login-submit')).toBeInTheDocument()

    auth.currentUser = farmer
    auth.isAuthenticated = true
    rerender(loginPage(state))

    expect(await screen.findByText('HARVEST LOTS')).toBeInTheDocument()
  })

  it('falls back to the dashboard when no page was asked for', async () => {
    auth.login.mockResolvedValue(farmer)
    renderLogin()

    await signInWithForm()

    expect(await screen.findByText('FARMER DASHBOARD')).toBeInTheDocument()
  })

  it('still holds a user who owes first-login setup on the setup page', async () => {
    auth.login.mockResolvedValue(newcomer)
    renderLogin(loginRedirectState({ pathname: '/harvest-lots' }))

    await signInWithForm()

    expect(await screen.findByText('SETUP PAGE')).toBeInTheDocument()
  })
})

describe('redirectTargetFrom', () => {
  it('keeps an in-app page with its query', () => {
    expect(redirectTargetFrom(loginRedirectState({ pathname: '/processor', search: '?lot=42' }))).toBe('/processor?lot=42')
  })

  it.each([
    [undefined],
    [null],
    [{ from: 42 }],
    [{ from: 'https://evil.example/x' }],
    [{ from: '//evil.example/x' }],
    [{ from: '/\\evil.example' }],
    [{ from: '/login' }],
    [{ from: '/reset-password?token=abc' }],
    [{ from: '/first-login-setup' }],
    [{ from: '/' }],
  ])('ignores %o', (state) => {
    expect(redirectTargetFrom(state)).toBeNull()
  })

  it('postLoginPath prefers setup, then the saved page, then the dashboard', () => {
    expect(postLoginPath(newcomer, { from: '/harvest-lots' })).toBe('/first-login-setup')
    expect(postLoginPath(farmer, { from: '/harvest-lots' })).toBe('/harvest-lots')
    expect(postLoginPath(farmer, null)).toBe('/farmer-dashboard')
  })
})

describe('AuthLoadingScreen', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('says why it is still waiting once the check runs long', () => {
    vi.useFakeTimers()
    render(<AuthLoadingScreen />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText(/Connecting to the server/)).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(AUTH_SLOW_HINT_MS)
    })

    expect(screen.getByText(/Connecting to the server/)).toBeInTheDocument()
  })
})
