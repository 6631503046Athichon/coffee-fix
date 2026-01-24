import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption<T = string> {
  value: T;
  label: string;
  description?: string;
}

interface DropdownProps<T = string> {
  value: T;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  label?: string;
  error?: string;
}

/**
 * Reusable Dropdown Component
 *
 * Features:
 * - Type-safe generic support
 * - Click outside to close
 * - Keyboard navigation support
 * - Customizable styling
 * - Optional label and error display
 * - Disabled state support
 *
 * @example
 * <Dropdown
 *   value={selectedValue}
 *   onChange={setSelectedValue}
 *   options={[
 *     { value: '1', label: 'Option 1' },
 *     { value: '2', label: 'Option 2' }
 *   ]}
 *   placeholder="Select an option"
 * />
 */
export function Dropdown<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  disabled = false,
  className = '',
  required = false,
  label,
  error
}: DropdownProps<T>): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Find selected option
  const selectedOption = options.find(opt => opt.value === value);
  const displayLabel = selectedOption?.label || placeholder;
  const hasOptions = options.length > 0;

  const handleSelect = (optionValue: T) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const toggleDropdown = () => {
    if (hasOptions && !disabled) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={toggleDropdown}
          disabled={disabled || !hasOptions}
          className={`
            w-full border rounded-xl px-4 py-3 text-base font-medium
            bg-white focus:outline-none transition-all
            flex items-center justify-between gap-2 shadow-sm
            ${disabled || !hasOptions
              ? 'opacity-50 cursor-not-allowed bg-gray-100'
              : 'hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
            }
            ${error
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
              : 'border-gray-300'
            }
            ${!selectedOption && !disabled ? 'text-gray-500' : 'text-gray-900'}
          `}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown
            className={`h-5 w-5 text-gray-500 transition-transform duration-200 flex-shrink-0 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isOpen && hasOptions && (
          <div className="absolute z-50 mt-2 left-0 right-0 bg-white border border-gray-300 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
            <div className="py-1">
              {options.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500 text-center">
                  No options available
                </div>
              ) : (
                options.map((option) => {
                  const isSelected = option.value === value;

                  return (
                    <button
                      key={String(option.value)}
                      type="button"
                      onClick={() => handleSelect(option.value)}
                      className={`
                        w-full text-left px-4 py-3 transition-all text-base font-medium
                        flex items-center justify-between gap-2
                        ${isSelected
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-900 hover:bg-indigo-50 hover:text-indigo-700'
                        }
                      `}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{option.label}</div>
                        {option.description && (
                          <div className="text-sm text-gray-500 truncate mt-0.5">
                            {option.description}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-5 w-5 text-indigo-700 flex-shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

export default Dropdown;
