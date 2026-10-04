import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPassword, verifyResetToken } from '../../services/auth/authService'
import ResetPassword from './ResetPassword'

// F43: the page said 6 characters, but the backend (passwordSchema) needs 8+
// with an uppercase letter, a lowercase letter and a number, so a password
// the page accepted was refused by the server. The page now shows and checks
// the real policy before sending.

vi.mock('../../services/auth/authService', () => ({
  verifyResetToken: vi.fn(),
  resetPassword: vi.fn(),
}))

const renderPage = async () => {
  render(
    <MemoryRouter initialEntries={['/reset-password?token=tok-123']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { name: 'Reset Password' })
}

const submitWith = async (password: string, confirm = password) => {
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: confirm } })
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: 'Reset Password' }).closest('form')!)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyResetToken).mockResolvedValue({ valid: true })
  vi.mocked(resetPassword).mockResolvedValue(undefined)
})

describe('Reset Password page password policy', () => {
  it('states the backend policy next to the field', async () => {
    await renderPage()

    expect(screen.getByText(/At least 8 characters, with an uppercase letter, a lowercase letter and a number/)).toBeInTheDocument()
    expect(screen.queryByText(/6 characters/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('New Password')).toHaveAttribute('minLength', '8')
  })

  it.each([
    ['abc123', 'must be at least 8 characters'],
    ['abcdefg1', 'must contain an uppercase letter'],
    ['ABCDEFG1', 'must contain a lowercase letter'],
    ['Abcdefgh', 'must contain a number'],
  ])('refuses %s before sending it (%s)', async (password, problem) => {
    await renderPage()

    await submitWith(password)

    expect(screen.getByText(new RegExp(problem))).toBeInTheDocument()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('sends a password that meets the policy', async () => {
    await renderPage()

    await submitWith('Abcdefg1')

    expect(resetPassword).toHaveBeenCalledWith('tok-123', 'Abcdefg1')
    expect(await screen.findByText('Password Reset Successful!')).toBeInTheDocument()
  })

  it('still refuses passwords that do not match', async () => {
    await renderPage()

    await submitWith('Abcdefg1', 'Abcdefg2')

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(resetPassword).not.toHaveBeenCalled()
  })
})
