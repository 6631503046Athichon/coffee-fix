import { describe, expect, it } from 'vitest'
import { CALENDAR_GAP, SCREEN_MARGIN, placeCalendar } from './calendarPlacement'

const calendar = { width: 300, height: 360 }
const laptop = { width: 1280, height: 720 }
const field = (top: number, left = 100, height = 44) => ({ top, bottom: top + height, left })

describe('placeCalendar', () => {
  it('opens below the field when it fits there, as before', () => {
    expect(placeCalendar(field(100), calendar, laptop)).toEqual({
      top: 144 + CALENDAR_GAP,
      left: 100,
      side: 'below',
    })
  })

  it('flips above a field near the bottom of the screen or a popup', () => {
    // 720 - 8 - (676 + 8) = 28 px below, far too little for 360.
    const spot = placeCalendar(field(632), calendar, laptop)
    expect(spot).toEqual({ top: 632 - CALENDAR_GAP - 360, left: 100, side: 'above' })
  })

  it('stays below for as long as it fits there, and flips once it fits only above', () => {
    // The lowest field it still fits below: 720 - 8 - (344 + 8) = 360 px of room.
    expect(placeCalendar(field(300), calendar, laptop)).toEqual({ top: 352, left: 100, side: 'below' })
    // 268 px below, 384 above.
    expect(placeCalendar(field(400), calendar, laptop)).toEqual({ top: 32, left: 100, side: 'above' })
  })

  it('takes the side with more room when it fits on neither, and stays on screen', () => {
    const phone = { width: 375, height: 500 }
    // 240 px below, 184 above: below, pulled up to stay on screen (and left,
    // inside the 375 px width).
    expect(placeCalendar(field(200), calendar, phone)).toEqual({
      top: 500 - SCREEN_MARGIN - 360,
      left: 375 - SCREEN_MARGIN - 300,
      side: 'below',
    })
    // 136 px below, 288 above: above, pushed down to stay on screen.
    expect(placeCalendar(field(304, 20), calendar, phone)).toEqual({
      top: SCREEN_MARGIN,
      left: 20,
      side: 'above',
    })
  })

  it('keeps the top edge visible when the calendar is taller than the screen', () => {
    const tiny = { width: 375, height: 300 }
    expect(placeCalendar(field(120), calendar, tiny).top).toBe(SCREEN_MARGIN)
  })

  it('moves left to stay inside the right edge, and never past the left edge', () => {
    expect(placeCalendar(field(100, 1100), calendar, laptop).left).toBe(1280 - SCREEN_MARGIN - 300)
    expect(placeCalendar(field(100, -40), calendar, laptop).left).toBe(SCREEN_MARGIN)
    // A screen narrower than the calendar: the left edge stays visible.
    expect(placeCalendar(field(100, 20), calendar, { width: 280, height: 720 }).left).toBe(SCREEN_MARGIN)
  })
})
