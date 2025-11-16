import React, { useEffect, useMemo, useRef, useState } from 'react';

export type Option<V extends string | number = string> = {
  value: V;
  label: string;
  disabled?: boolean;
};

export type SelectProps<T = Option | string | number> = {
  options: T[];
  value?: string | number | null;
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  getValue?: (item: T) => string | number;
  getLabel?: (item: T) => string;
};

/**
 * Reusable, styled dropdown select.
 * - Accepts string/number arrays or Option objects or arbitrary arrays via getValue/getLabel.
 * - Click outside to close, simple keyboard focus trap, and disabled state.
 */
const Select = <T,>({
  options,
  value = null,
  onChange,
  placeholder = 'Select... ',
  className = '',
  disabled = false,
  getValue,
  getLabel,
}: SelectProps<T>) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const normalized: Option[] = useMemo(() => {
    return (options as any[]).map((item) => {
      if (typeof item === 'string' || typeof item === 'number') {
        return { value: item, label: String(item) } as Option;
      }
      const v = getValue ? getValue(item as any) : (item as any).value;
      const l = getLabel ? getLabel(item as any) : (item as any).label ?? String(v);
      const d = (item as any).disabled ?? false;
      return { value: v, label: l, disabled: d } as Option;
    });
  }, [options, getValue, getLabel]);

  const selected = useMemo(() => normalized.find((o) => o.value === value) ?? null, [normalized, value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleSelect = (val: string | number) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full text-left px-3 py-2 border rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between`}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className="w-4 h-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-2 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
          {normalized.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">No options</div>
          ) : (
            normalized.map((opt) => (
              <button
                key={`${opt.value}`}
                type="button"
                disabled={!!opt.disabled}
                onClick={() => handleSelect(opt.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                  value === opt.value ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                } ${opt.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Select;
