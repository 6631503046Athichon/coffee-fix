import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
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

  it('keeps its own field look unless a form passes triggerClassName', () => {
    render(
      <>
        <DatePicker value="2026-10-05" onChange={() => {}} label="Default" />
        <DatePicker
          value="2026-10-06"
          onChange={() => {}}
          label="Matched"
          triggerClassName="rounded-lg border border-gray-300 px-3"
        />
      </>,
    )

    const plain = screen.getByRole('button', { name: 'Default 5 October 2026' })
    expect(plain).toHaveClass('border-2', 'rounded-xl', 'px-4', 'w-full')
    const matched = screen.getByRole('button', { name: 'Matched 6 October 2026' })
    expect(matched).toHaveClass('rounded-lg', 'border', 'px-3', 'w-full', 'flex', 'bg-white')
    expect(matched).not.toHaveClass('border-2', 'rounded-xl', 'px-4')
  })
})

describe('DatePicker name', () => {
  it('is named by its label and the date it shows', () => {
    render(<DatePicker value="2026-10-05" onChange={() => {}} label="Purchase Date" required />)

    const field = screen.getByRole('button', { name: 'Purchase Date 5 October 2026' })
    expect(screen.getByText('Purchase Date').closest('label')).toHaveAttribute('for', field.id)
  })

  it('says it is empty with the placeholder', () => {
    render(<DatePicker value="" onChange={() => {}} label="Harvest Date" />)

    expect(screen.getByRole('button', { name: 'Harvest Date Select date' })).toBeInTheDocument()
  })

  it('takes an id, so an outside label names it', () => {
    render(
      <>
        <label htmlFor="drying-start">Drying start</label>
        <DatePicker id="drying-start" value="2026-10-05" onChange={() => {}} />
      </>,
    )

    const field = screen.getByLabelText('Drying start')
    expect(field).toHaveAttribute('id', 'drying-start')
    expect(field).toHaveTextContent('5 October 2026')
  })

  it('gives every field its own id', () => {
    render(
      <>
        <DatePicker value="2026-10-05" onChange={() => {}} label="From" />
        <DatePicker value="2026-10-06" onChange={() => {}} label="To" />
      </>,
    )

    expect(screen.getByRole('button', { name: 'From 5 October 2026' }).id)
      .not.toBe(screen.getByRole('button', { name: 'To 6 October 2026' }).id)
  })
})

describe('DatePicker calendar placement', () => {
  // jsdom lays nothing out, so the field and the calendar report the boxes
  // a browser would: the field `fieldTop` px down a 1280 x 720 window, the
  // calendar 300 x 360 wherever its fixed top/left put it, plus `origin`
  // (an ancestor with a transform places fixed elements from its own corner).
  // A popup body marked data-scroll-body reports `bodyBox`.
  let fieldTop = 100
  let origin = { top: 0, left: 0 }
  let bodyBox = { top: 0, left: 0, width: 1280, height: 720 }
  const box = (top: number, left: number, width: number, height: number) =>
    ({ top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) }) as DOMRect

  beforeAll(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('aria-expanded')) return box(fieldTop, 40, 260, 44)
      if (this.hasAttribute('data-scroll-body')) return box(bodyBox.top, bodyBox.left, bodyBox.width, bodyBox.height)
      if (this.hasAttribute('data-calendar-side') || this.style.position === 'fixed') {
        return box(
          (parseFloat(this.style.top) || 0) + origin.top,
          (parseFloat(this.style.left) || 0) + origin.left,
          300,
          360,
        )
      }
      return box(0, 0, 0, 0)
    })
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(720)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280)
  })
  afterEach(() => {
    fieldTop = 100
    origin = { top: 0, left: 0 }
    bodyBox = { top: 0, left: 0, width: 1280, height: 720 }
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  const openCalendar = () => {
    fireEvent.click(screen.getByRole('button', { name: '15 September 2026' }))
    return screen.getByText('September').closest('[data-calendar-side]') as HTMLElement
  }

  it('opens below the field, fixed, so the popup body cannot cut it off', () => {
    render(<DatePicker value="2026-09-15" onChange={() => {}} />)
    const calendar = openCalendar()

    expect(calendar.dataset.calendarSide).toBe('below')
    expect(calendar.style.position).toBe('fixed')
    expect(calendar.style.top).toBe('152px')
    expect(calendar.style.left).toBe('40px')
    expect(calendar.style.visibility).toBe('')
  })

  it('opens upward when there is no room below the field', () => {
    fieldTop = 600
    render(<DatePicker value="2026-09-15" onChange={() => {}} />)
    const calendar = openCalendar()

    expect(calendar.dataset.calendarSide).toBe('above')
    // 600 - 8 - 360: its bottom edge sits just above the field.
    expect(calendar.style.top).toBe('232px')
  })

  it('stays at the field inside a transformed popup that places fixed elements from its corner', () => {
    origin = { top: 50, left: 30 }
    render(<DatePicker value="2026-09-15" onChange={() => {}} />)
    const calendar = openCalendar()

    expect(calendar.getBoundingClientRect().top).toBe(152)
    expect(calendar.getBoundingClientRect().left).toBe(40)
  })

  it('follows the field when the popup scrolls', () => {
    render(<DatePicker value="2026-09-15" onChange={() => {}} />)
    const calendar = openCalendar()

    fieldTop = 600
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    expect(calendar.dataset.calendarSide).toBe('above')
    expect(calendar.style.top).toBe('232px')
  })

  it('follows the field when the window resizes', () => {
    render(<DatePicker value="2026-09-15" onChange={() => {}} />)
    const calendar = openCalendar()

    fieldTop = 600
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(calendar.dataset.calendarSide).toBe('above')
    expect(calendar.style.top).toBe('232px')
  })

  it('follows the field when a scrolling box around it scrolls', () => {
    render(
      <div data-scroll-body="" style={{ overflowY: 'auto' }}>
        <DatePicker value="2026-09-15" onChange={() => {}} />
      </div>,
    )
    const calendar = openCalendar()

    fieldTop = 300
    fireEvent.scroll(document.querySelector('[data-scroll-body]')!)

    expect(calendar.style.top).toBe('352px')
  })

  it('closes once the page scrolls the field off the screen, instead of floating there', () => {
    render(<DatePicker value="2026-09-15" onChange={() => {}} />)
    openCalendar()

    fieldTop = -60
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    expect(screen.queryByText('September')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '15 September 2026' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes once a popup body scrolls the field out of its view', () => {
    // The popup body shows 200 to 500 px; the field sits at 100 to 144, above it.
    bodyBox = { top: 200, left: 0, width: 600, height: 300 }
    render(
      <div data-scroll-body="" style={{ overflowY: 'auto' }}>
        <DatePicker value="2026-09-15" onChange={() => {}} />
      </div>,
    )
    openCalendar()

    fireEvent.scroll(document.querySelector('[data-scroll-body]')!)

    expect(screen.queryByText('September')).not.toBeInTheDocument()
  })

  it('stays open while the field is still in view after a scroll', () => {
    bodyBox = { top: 50, left: 0, width: 600, height: 300 }
    render(
      <div data-scroll-body="" style={{ overflowY: 'auto' }}>
        <DatePicker value="2026-09-15" onChange={() => {}} />
      </div>,
    )
    openCalendar()

    fireEvent.scroll(document.querySelector('[data-scroll-body]')!)

    expect(screen.getByText('September')).toBeInTheDocument()
  })

  it('still picks a day, and Escape closes only the calendar', () => {
    const onChange = vi.fn()
    const dialogEscape = vi.fn()
    document.addEventListener('keydown', dialogEscape)
    render(<DatePicker value="2026-09-15" onChange={onChange} />)

    openCalendar()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('September')).not.toBeInTheDocument()
    expect(dialogEscape).not.toHaveBeenCalled()

    openCalendar()
    fireEvent.click(screen.getByRole('button', { name: '20' }))
    expect(onChange).toHaveBeenCalledWith('2026-09-20')
    expect(screen.queryByText('September')).not.toBeInTheDocument()
    document.removeEventListener('keydown', dialogEscape)
  })

  it('closes on a click outside the field, but not on one inside the calendar', () => {
    render(
      <div>
        <p>Elsewhere</p>
        <DatePicker value="2026-09-15" onChange={() => {}} />
      </div>,
    )
    const calendar = openCalendar()

    fireEvent.mouseDown(calendar)
    expect(screen.getByText('September')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('Elsewhere'))
    expect(screen.queryByText('September')).not.toBeInTheDocument()
  })
})
