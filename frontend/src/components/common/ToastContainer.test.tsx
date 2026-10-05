import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../contexts/ToastContext'
import ToastContainer from './ToastContainer'
import { NOTHING_TO_EXPORT_MESSAGE, downloadCsv } from '../../utils/exportCSV'
import { showAppToast } from '../../utils/appToast'

const renderApp = () =>
  render(
    <ToastProvider>
      <ToastContainer />
    </ToastProvider>,
  )

describe('ToastContainer', () => {
  it('shows a toast sent from a plain helper (utils/appToast)', () => {
    renderApp()

    act(() => showAppToast({ type: 'warning', message: 'Check the weights' }))

    expect(screen.getByText('Check the weights')).toBeInTheDocument()
  })

  it('tells the user when an export has no rows, instead of doing nothing', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderApp()

    let downloaded = true
    act(() => {
      downloaded = downloadCsv('gap-log_2026-09-23.csv', ['Date'], [])
    })

    expect(downloaded).toBe(false)
    expect(click).not.toHaveBeenCalled()
    expect(screen.getByText(NOTHING_TO_EXPORT_MESSAGE)).toBeInTheDocument()
    click.mockRestore()
  })

  it('stops listening once it is gone', () => {
    const { unmount } = renderApp()
    unmount()

    expect(() => showAppToast({ type: 'info', message: 'Nobody listens' })).not.toThrow()
    expect(screen.queryByText('Nobody listens')).not.toBeInTheDocument()
  })
})
