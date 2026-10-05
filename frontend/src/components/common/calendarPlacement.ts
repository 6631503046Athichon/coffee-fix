// Where DatePicker's calendar opens, in viewport pixels.
//
// The calendar is drawn with position: fixed at its field, so a popup's
// scrolling body no longer cuts it off. It opens below the field as before
// when it fits there, flips above when it fits there instead (a field near the
// bottom of a popup or the screen), and otherwise takes the side with more
// room. It is always kept on screen: with no room on either side it covers
// part of the field rather than being cut off.

export type CalendarSide = 'below' | 'above';

export interface CalendarSpot {
  top: number;
  left: number;
  side: CalendarSide;
}

interface FieldBox {
  top: number;
  bottom: number;
  left: number;
}

interface Size {
  width: number;
  height: number;
}

/** Space between the field and the calendar. */
export const CALENDAR_GAP = 8;
/** Space kept between the calendar and the screen edges. */
export const SCREEN_MARGIN = 8;

// When max < min (a calendar taller or wider than the screen) min wins, so
// its top or left edge stays visible.
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function placeCalendar(field: FieldBox, calendar: Size, viewport: Size): CalendarSpot {
  const roomBelow = viewport.height - SCREEN_MARGIN - (field.bottom + CALENDAR_GAP);
  const roomAbove = field.top - CALENDAR_GAP - SCREEN_MARGIN;
  const side: CalendarSide =
    calendar.height <= roomBelow || roomBelow >= roomAbove ? 'below' : 'above';
  const wantedTop =
    side === 'below' ? field.bottom + CALENDAR_GAP : field.top - CALENDAR_GAP - calendar.height;
  return {
    top: clamp(wantedTop, SCREEN_MARGIN, viewport.height - SCREEN_MARGIN - calendar.height),
    left: clamp(field.left, SCREEN_MARGIN, viewport.width - SCREEN_MARGIN - calendar.width),
    side,
  };
}
