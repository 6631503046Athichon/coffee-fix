import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgotPassword } from '../../services/auth/authService'
import { captureAppToasts } from '../../test/captureAppToasts'
import ForgotPassword from './ForgotPassword'

// In development the backend hands back the reset link; its Copy Link button
// reports through the site toast, not the browser's alert box.

vi.mock('../../services/auth/authService', () => ({
  forgotPassword: vi.fn(),
}))

const resetUrl = 'http://localhost:5173/reset-password?token=dev-token'

const sendRequest = async () => {
  vi.mocked(forgotPassword).mockResolvedValue({ message: 'ok', devToken: 'dev-token', devResetUrl: resetUrl })
  render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Email or Username'), { target: { value: 'fern' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }))
  await screen.findByText('Email Sent Successfully!')
}

describe('ForgotPassword development reset link', { timeout: 20000 }, () => {
  const toasts = captureAppToasts()

  afterEach(() => {
    // jsdom has no clipboard; these tests put a stand-in on navigator.
    delete (navigator as { clipboard?: unknown }).clipboard
    vi.restoreAllMocks()
  })

  it('copies the link and confirms it in the site toast', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await sendRequest()

    fireEvent.click(screen.getByRole('button', { name: 'Copy Link' }))

    await waitFor(() => expect(toasts).toContainEqual({ type: 'success', message: 'Reset link copied' }))
    expect(writeText).toHaveBeenCalledWith(resetUrl)
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('says so when the browser has no clipboard to copy to', async () => {
    await sendRequest()

    fireEvent.click(screen.getByRole('button', { name: 'Copy Link' }))

    await waitFor(() => expect(toasts).toContainEqual({
      type: 'error',
      message: "Couldn't copy the link. Select it and copy it by hand.",
    }))
  })
})
