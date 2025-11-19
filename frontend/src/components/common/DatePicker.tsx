import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

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
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Parse value to Date object
    const selectedDate = value ? new Date(value + 'T00:00:00') : null;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    const goToPreviousMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

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
                <div className="absolute z-[10000] mt-2 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-[320px]">
                    {/* Month Navigation */}
                    <div className="flex items-center justify-between mb-3">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                goToPreviousMonth();
                            }}
                            className="p-1.5 hover:bg-gray-100 rounded transition-colors cursor-pointer"
                        >
                            <ChevronLeft className="h-4 w-4 text-gray-600" />
                        </button>

                        <div className="text-center flex-1">
                            <div className="text-base font-semibold text-gray-900">
                                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                goToNextMonth();
                            }}
                            className="p-1.5 hover:bg-gray-100 rounded transition-colors cursor-pointer"
                        >
                            <ChevronRight className="h-4 w-4 text-gray-600" />
                        </button>
                    </div>

                    {/* Day Names */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {dayNames.map(day => (
                            <div key={day} className="text-center text-xs font-semibold text-gray-600 py-1.5">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Days */}
                    <div className="grid grid-cols-7 gap-1">
                        {days.map((day, index) => {
                            if (day === null) {
                                return <div key={`empty-${index}`} className="aspect-square min-h-[36px]" />;
                            }

                            const isTodayDay = isToday(day);
                            const isSelectedDay = isSelected(day);

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
                                        aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-200 min-w-[36px] min-h-[36px] w-full
                                        ${isSelectedDay
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : isTodayDay
                                                ? 'bg-blue-50 text-blue-600 border border-blue-600'
                                                : 'hover:bg-gray-100 text-gray-700'
                                        }
                                    `}
                                >
                                    {day}
                                </button>
                            );
                        })}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clearDate();
                            }}
                            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-3 py-1.5 rounded hover:bg-gray-50"
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
                            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
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
