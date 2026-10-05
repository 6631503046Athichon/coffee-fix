import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { toDateOnly } from '../../utils/dateOnly';
import { placeCalendar, type CalendarSide } from './calendarPlacement';

// View modes for the popover. 'day' shows the standard date grid,
// 'month' lets the user pick a month from a 3×4 grid, and 'year' lets
// them pick a year from a 12-year decade page. Each view has its own
// prev/next behaviour (month / year / decade respectively).
type CalendarView = 'day' | 'month' | 'year';

interface DatePickerProps {
    value: string; // YYYY-MM-DD format
    onChange: (date: string) => void;
    /**
     * Shown above the field and read out as its name with the date, e.g.
     * "Purchase Date, 5 October 2026".
     */
    label?: string;
    placeholder?: string;
    required?: boolean;
    className?: string;
    /**
     * The field's id, so an outside <label htmlFor> names it when there is no
     * `label`. Made up when left out.
     */
    id?: string;
    /**
     * Border, radius, padding and focus of the field itself, in place of the
     * default look, so a form can match its other inputs. `className` only
     * reaches the wrapper around the label and the field.
     */
    triggerClassName?: string;
}

// The field's own look, unless a caller passes `triggerClassName`.
const DEFAULT_TRIGGER =
    'px-4 py-2.5 border-2 border-gray-300 rounded-xl hover:border-blue-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm';

/**
 * Whether any of `field` is still on screen: inside the window and inside
 * every ancestor that clips it (a popup's scrolling body). Edges that touch
 * count as inside.
 */
const isFieldInView = (field: HTMLElement): boolean => {
    const box = field.getBoundingClientRect();
    const overlaps = (area: { top: number; bottom: number; left: number; right: number }) =>
        box.bottom >= area.top && box.top <= area.bottom && box.right >= area.left && box.left <= area.right;
    if (!overlaps({ top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth })) return false;
    for (let el = field.parentElement; el && el !== document.body; el = el.parentElement) {
        const style = window.getComputedStyle(el);
        const clips = /(auto|scroll|hidden|clip)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`);
        if (clips && !overlaps(el.getBoundingClientRect())) return false;
    }
    return true;
};

const DatePicker: React.FC<DatePickerProps> = ({
    value,
    onChange,
    label,
    placeholder = "Select date",
    required = false,
    className = "",
    id,
    triggerClassName
}) => {
    const madeUpId = useId();
    const fieldId = id || `date-picker-${madeUpId}`;
    const labelId = `${fieldId}-label`;
    const valueId = `${fieldId}-value`;
    const [isOpen, setIsOpen] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [view, setView] = useState<CalendarView>('day');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const fieldRef = useRef<HTMLButtonElement>(null);
    const calendarRef = useRef<HTMLDivElement>(null);
    // Where the calendar sits (fixed, in its containing block's pixels); null
    // until it is first measured, and drawn hidden until then.
    const [spot, setSpot] = useState<{ top: number; left: number; side: CalendarSide } | null>(null);

    // Parse value to Date object (local midnight). A value that is not a
    // readable date counts as no date: the button shows the placeholder and
    // the calendar opens on the current month instead of "NaN undefined NaN"
    // and an empty grid. An ISO datetime is read as its Thai calendar day.
    const selectedDay = toDateOnly(value);
    const selectedDate = selectedDay ? new Date(selectedDay + 'T00:00:00') : null;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setView('day'); // reset to day view when closing
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // While the calendar is open, Escape closes just the calendar. Capture phase
    // runs before a dialog's own Escape-to-close listener, and stopPropagation
    // keeps the key from reaching it and closing the whole dialog.
    useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setIsOpen(false);
            setView('day');
        };
        document.addEventListener('keydown', handleEscape, true);
        return () => document.removeEventListener('keydown', handleEscape, true);
    }, [isOpen]);

    // Reset to day view whenever the popover is reopened.
    useEffect(() => {
        if (isOpen) setView('day');
    }, [isOpen]);

    // The calendar is drawn with position: fixed at its field, so a popup's
    // scrolling body no longer cuts it off (you had to scroll inside the popup
    // to reach it). It stays in place in the DOM, so clicks on it still count
    // as inside the field and inside the popup. It opens below the field, or
    // above it when there is no room below (calendarPlacement).
    const placeAtField = useCallback(() => {
        const field = fieldRef.current;
        const calendar = calendarRef.current;
        if (!field || !calendar) return;
        const calendarBox = calendar.getBoundingClientRect();
        // Where top/left 0 lands: the viewport, or an ancestor with a
        // transform or filter, which fixed elements are placed in instead.
        const originTop = calendarBox.top - (parseFloat(calendar.style.top) || 0);
        const originLeft = calendarBox.left - (parseFloat(calendar.style.left) || 0);
        const next = placeCalendar(
            field.getBoundingClientRect(),
            { width: calendarBox.width, height: calendarBox.height },
            { width: window.innerWidth, height: window.innerHeight },
        );
        const top = next.top - originTop;
        const left = next.left - originLeft;
        setSpot(prev =>
            prev && prev.top === top && prev.left === left && prev.side === next.side
                ? prev
                : { top, left, side: next.side });
    }, []);

    // Placed before the browser paints (a reopened calendar starts from its
    // last spot and is moved before it shows), again when the calendar changes
    // height (month and year views, 5- or 6-week months), and while the page
    // or the popup scrolls or the window resizes.
    useLayoutEffect(() => {
        if (isOpen) placeAtField();
    }, [isOpen, view, currentMonth, placeAtField]);

    // On any scroll (the page, a popup's body, any scrolling box: the capture
    // listener hears them all) or resize, the calendar follows its field. Once
    // the field is scrolled out of sight the calendar closes instead: being
    // fixed, it would otherwise stay on screen with nothing under it.
    const followField = useCallback(() => {
        const field = fieldRef.current;
        if (field && !isFieldInView(field)) {
            setIsOpen(false);
            return;
        }
        placeAtField();
    }, [placeAtField]);

    useEffect(() => {
        if (!isOpen) return;
        window.addEventListener('scroll', followField, true);
        window.addEventListener('resize', followField);
        return () => {
            window.removeEventListener('scroll', followField, true);
            window.removeEventListener('resize', followField);
        };
    }, [isOpen, followField]);

    // Initialize current month from selected date
    useEffect(() => {
        if (selectedDate) {
            setCurrentMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
        }
    }, [value]); // Update when value changes

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days: (number | null)[] = [];

        // Add empty cells for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }

        // Add days of month
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }

        return days;
    };

    const formatDisplayDate = (date: Date | null) => {
        if (!date) return '';
        const day = date.getDate();
        const month = monthNames[date.getMonth()];
        const year = date.getFullYear();
        return `${day} ${month} ${year}`;
    };

    const handleDateClick = (day: number) => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const newDate = new Date(year, month, day);

        // Format as YYYY-MM-DD
        const formatted = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        onChange(formatted);
        setIsOpen(false);
    };

    // View-aware navigation. In day view we step by month, in month view
    // by year, and in year view by a 12-year decade page. Keeps prev/next
    // arrows useful regardless of which picker the user is in.
    const goToPrevious = () => {
        if (view === 'day') {
            setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
        } else if (view === 'month') {
            setCurrentMonth(new Date(currentMonth.getFullYear() - 1, currentMonth.getMonth(), 1));
        } else {
            setCurrentMonth(new Date(currentMonth.getFullYear() - 12, currentMonth.getMonth(), 1));
        }
    };

    const goToNext = () => {
        if (view === 'day') {
            setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
        } else if (view === 'month') {
            setCurrentMonth(new Date(currentMonth.getFullYear() + 1, currentMonth.getMonth(), 1));
        } else {
            setCurrentMonth(new Date(currentMonth.getFullYear() + 12, currentMonth.getMonth(), 1));
        }
    };

    const handleMonthSelect = (monthIndex: number) => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), monthIndex, 1));
        setView('day');
    };

    const handleYearSelect = (year: number) => {
        setCurrentMonth(new Date(year, currentMonth.getMonth(), 1));
        setView('month');
    };

    // Decade page: floor the year to the nearest 12-year block, e.g.
    // 2026 → 2016-2027, so navigation lands on the same set of cells as
    // long as you stay within the block.
    const decadeStart = Math.floor(currentMonth.getFullYear() / 12) * 12;
    const decadeYears = Array.from({ length: 12 }, (_, i) => decadeStart + i);

    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const goToToday = () => {
        const today = new Date();
        setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
        const formatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        onChange(formatted);
        setIsOpen(false);
    };

    const clearDate = () => {
        onChange('');
        setIsOpen(false);
    };

    const isToday = (day: number) => {
        const today = new Date();
        return day === today.getDate() &&
            currentMonth.getMonth() === today.getMonth() &&
            currentMonth.getFullYear() === today.getFullYear();
    };

    const isSelected = (day: number) => {
        if (!selectedDate) return false;
        return day === selectedDate.getDate() &&
            currentMonth.getMonth() === selectedDate.getMonth() &&
            currentMonth.getFullYear() === selectedDate.getFullYear();
    };

    const days = getDaysInMonth(currentMonth);

    return (
        <div ref={dropdownRef} className={`relative ${className}`}>
            {label && (
                <label id={labelId} htmlFor={fieldId} className="block text-sm font-semibold text-gray-700 mb-2">
                    {label}
                    {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
                </label>
            )}

            {/* Input Button: named by its label and the date it shows. */}
            <button
                ref={fieldRef}
                id={fieldId}
                type="button"
                aria-labelledby={label ? `${labelId} ${valueId}` : undefined}
                aria-expanded={isOpen}
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between bg-white min-w-0 focus:outline-none ${triggerClassName ?? DEFAULT_TRIGGER}`}
            >
                <span id={valueId} className={`text-sm font-medium truncate flex-1 text-left mr-2 ${selectedDate ? 'text-gray-900' : 'text-gray-500'}`}>
                    {selectedDate ? formatDisplayDate(selectedDate) : placeholder}
                </span>
                <Calendar className="h-5 w-5 text-gray-400 flex-shrink-0" />
            </button>

            {/* Calendar Dropdown */}
            {isOpen && (
                <div
                    ref={calendarRef}
                    data-calendar-side={spot?.side}
                    style={{
                        position: 'fixed',
                        top: spot?.top ?? 0,
                        left: spot?.left ?? 0,
                        visibility: spot ? undefined : 'hidden',
                    }}
                    className="z-[10000] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden w-[300px] max-w-[calc(100vw-16px)]">

                    {/* Header bar — clickable month/year buttons let the
                        user jump straight to the month or year picker.
                        Prev/next arrows step by the unit of the current
                        view (month / year / decade). */}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-100">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                goToPrevious();
                            }}
                            className="p-1.5 hover:bg-white rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-blue-600 hover:shadow-sm"
                            aria-label="Previous"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>

                        <div className="flex-1 flex items-center justify-center gap-1">
                            {view === 'day' && (
                                <>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setView('month');
                                        }}
                                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-sm font-bold text-gray-900 hover:bg-white hover:shadow-sm transition-all"
                                    >
                                        {monthNames[currentMonth.getMonth()]}
                                        <ChevronDown className="h-3 w-3 opacity-50" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setView('year');
                                        }}
                                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-sm font-bold text-blue-600 hover:bg-white hover:shadow-sm transition-all"
                                    >
                                        {currentMonth.getFullYear()}
                                        <ChevronDown className="h-3 w-3 opacity-50" />
                                    </button>
                                </>
                            )}
                            {view === 'month' && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setView('year');
                                    }}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-sm font-bold text-blue-600 hover:bg-white hover:shadow-sm transition-all"
                                >
                                    {currentMonth.getFullYear()}
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </button>
                            )}
                            {view === 'year' && (
                                <span className="px-2 py-0.5 text-sm font-bold text-blue-600">
                                    {decadeStart} – {decadeStart + 11}
                                </span>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                goToNext();
                            }}
                            className="p-1.5 hover:bg-white rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-blue-600 hover:shadow-sm"
                            aria-label="Next"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>

                    {view === 'day' && (
                        <div className="p-3">
                            {/* Day Names — Sun/Sat get a subtle red tint so
                                weekends stand out from weekdays at a glance. */}
                            <div className="grid grid-cols-7 gap-1 mb-1.5">
                                {dayNames.map((day, i) => (
                                    <div
                                        key={day}
                                        className={`text-center text-[10px] font-bold uppercase tracking-wider py-1 ${
                                            i === 0 || i === 6
                                                ? 'text-red-400'
                                                : 'text-gray-400'
                                        }`}
                                    >
                                        {day}
                                    </div>
                                ))}
                            </div>

                            {/* Calendar Days */}
                            <div className="grid grid-cols-7 gap-1">
                                {days.map((day, index) => {
                                    if (day === null) {
                                        return <div key={`empty-${index}`} className="aspect-square min-h-[34px]" />;
                                    }

                                    const isTodayDay = isToday(day);
                                    const isSelectedDay = isSelected(day);
                                    const dayOfWeek = (index % 7);
                                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                                    return (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleDateClick(day);
                                            }}
                                            className={`
                                                aspect-square flex items-center justify-center rounded-lg text-sm font-semibold transition-all duration-150 min-w-[34px] min-h-[34px] w-full
                                                ${isSelectedDay
                                                    ? 'bg-blue-600 text-white shadow-sm scale-105'
                                                    : isTodayDay
                                                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-300 font-bold'
                                                        : isWeekend
                                                            ? 'text-red-500 hover:bg-red-50'
                                                            : 'hover:bg-blue-50 text-gray-700 hover:text-blue-700'
                                                }
                                            `}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {view === 'month' && (
                        <div className="p-3">
                            <div className="grid grid-cols-3 gap-2">
                                {monthNamesShort.map((m, i) => {
                                    const isCurrentMonth =
                                        i === currentMonth.getMonth();
                                    const isSelectedMonth =
                                        selectedDate &&
                                        i === selectedDate.getMonth() &&
                                        currentMonth.getFullYear() ===
                                            selectedDate.getFullYear();
                                    const today = new Date();
                                    const isThisMonth =
                                        i === today.getMonth() &&
                                        currentMonth.getFullYear() ===
                                            today.getFullYear();
                                    return (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleMonthSelect(i);
                                            }}
                                            className={`
                                                py-3 rounded-lg text-sm font-semibold transition-all
                                                ${isSelectedMonth
                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                    : isThisMonth
                                                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-300 font-bold'
                                                        : isCurrentMonth
                                                            ? 'bg-gray-100 text-gray-900'
                                                            : 'hover:bg-blue-50 text-gray-700 hover:text-blue-700'
                                                }
                                            `}
                                        >
                                            {m}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {view === 'year' && (
                        <div className="p-3">
                            <div className="grid grid-cols-3 gap-2">
                                {decadeYears.map((y) => {
                                    const isCurrentYear =
                                        y === currentMonth.getFullYear();
                                    const isSelectedYear =
                                        selectedDate &&
                                        y === selectedDate.getFullYear();
                                    const isThisYear =
                                        y === new Date().getFullYear();
                                    return (
                                        <button
                                            key={y}
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleYearSelect(y);
                                            }}
                                            className={`
                                                py-3 rounded-lg text-sm font-semibold transition-all
                                                ${isSelectedYear
                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                    : isThisYear
                                                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-300 font-bold'
                                                        : isCurrentYear
                                                            ? 'bg-gray-100 text-gray-900'
                                                            : 'hover:bg-blue-50 text-gray-700 hover:text-blue-700'
                                                }
                                            `}
                                        >
                                            {y}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between px-3 py-2.5 border-t border-gray-100 bg-gray-50">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clearDate();
                            }}
                            className="text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors px-2.5 py-1 rounded-md hover:bg-white"
                        >
                            Clear
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                goToToday();
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
                        >
                            Today
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatePicker;
