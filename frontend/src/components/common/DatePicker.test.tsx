import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, vi } from 'vitest'
import DatePicker from './DatePicker'

const originalTZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Asia/Bangkok'
  expect(new Date('2026-09-14T17:00:00.000Z').getDate()).toBe(15)
  // jsdom has no scrollIntoView; the open calendar calls it on a timer.
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => {
  // Assigning undefined would set the string 'undefined' (read as UTC) for
  // the files that run after this one in the same worker.
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

const dayButtons = () =>
  screen.getAllByRole('button').filter(button => /^\d{1,2}$/.test(button.textContent ?? ''))

describe('DatePicker', () => {
  it('shows a YYYY-MM-DD value and returns the picked day as YYYY-MM-DD', () => {
    const onChange = vi.fn()
    render(<DatePicker value="2026-09-15" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '15 September 2026' }))
    expect(screen.getByText('September')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '20' }))

    expect(onChange).toHaveBeenCalledWith('2026-09-20')
  })

  it('reads an ISO datetime as its Thai day instead of "NaN undefined NaN"', () => {
    // 00:00 on the 15th in Bangkok.
    render(<DatePicker value="2026-09-14T17:00:00.000Z" onChange={() => {}} />)

    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '15 September 2026' }))

    // The calendar opens on that month with the day marked, not as an empty grid.
    expect(screen.getByText('September')).toBeInTheDocument()
    expect(dayButtons()).toHaveLength(30)
    expect(screen.getByRole('button', { name: '15' })).toHaveClass('bg-blue-600')
  })

  it('shows the placeholder and a usable calendar for an unreadable value', () => {
    const onChange = vi.fn()
    render(<DatePicker value="not a date" onChange={onChange} placeholder="เลือกวันที่" />)

    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'เลือกวันที่' }))

    expect(dayButtons().length).toBeGreaterThanOrEqual(28)
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-01$/))
  })

  it('is flat: a plain header bar and no coloured halo on the picked day (F47)', () => {
    render(<DatePicker value="2026-09-15" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '15 September 2026' }))

    const header = screen.getByRole('button', { name: 'Previous' }).parentElement as HTMLElement
    expect(header).toHaveClass('bg-gray-50')
    expect(header.className).not.toMatch(/gradient/)
    expect(screen.getByRole('button', { name: '15' }).className).not.toMatch(/ring-blue-200/)
  })

  it('treats an impossible day as empty', () => {
    render(<DatePicker value="2026-02-30" onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Select date' })).toBeInTheDocument()
  })
})
