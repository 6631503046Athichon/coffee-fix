import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

// View modes for the popover. 'day' shows the standard date grid,
// 'month' lets the user pick a month from a 3×4 grid, and 'year' lets
// them pick a year from a 12-year decade page. Each view has its own
// prev/next behaviour (month / year / decade respectively).
type CalendarView = 'day' | 'month' | 'year';

interface DatePickerProps {
    value: string; // YYYY-MM-DD format
    onChange: (date: string) => void;
    label?: string;
    placeholder?: string;
    required?: boolean;
    className?: string;
}

const DatePicker: React.FC<DatePickerProps> = ({
    value,
    onChange,
    label,
    placeholder = "Select date",
    required = false,
    className = ""
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [view, setView] = useState<CalendarView>('day');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const calendarRef = useRef<HTMLDivElement>(null);

    // Parse value to Date object
    const selectedDate = value ? new Date(value + 'T00:00:00') : null;

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

    // Reset to day view whenever the popover is reopened.
    useEffect(() => {
        if (isOpen) setView('day');
    }, [isOpen]);

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
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}

            {/* Input Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 border-2 border-gray-300 rounded-xl bg-white hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm min-w-0"
            >
                <span className={`text-sm font-medium truncate flex-1 text-left mr-2 ${value ? 'text-gray-900' : 'text-gray-500'}`}>
                    {value ? formatDisplayDate(selectedDate) : placeholder}
                </span>
                <Calendar className="h-5 w-5 text-gray-400 flex-shrink-0" />
            </button>

            {/* Calendar Dropdown */}
            {isOpen && (
                <div
                    ref={calendarRef}
                    className="absolute z-[10000] mt-2 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden w-[300px]">
                    {/* Auto scroll into view when opened */}
                    {(() => {
                        setTimeout(() => calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
                        return null;
                    })()}

                    {/* Header bar — clickable month/year buttons let the
                        user jump straight to the month or year picker.
                        Prev/next arrows step by the unit of the current
                        view (month / year / decade). */}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100">
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
                                                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-200 scale-105'
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
                                                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-200'
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
                                                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-200'
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
