import React, { useCallback, useEffect, useRef, useState } from 'react'

interface DebouncedSearchInputProps {
  placeholder: string
  className: string
  onSearch: (value: string) => void
  debounceMs?: number
}

/**
 * Isolated search input that owns its draft value and debounces callbacks.
 * Wrapped in React.memo so parent re-renders don't clobber the in-progress query.
 */
export const DebouncedSearchInput = React.memo(
  ({ placeholder, className, onSearch, debounceMs = 300 }: DebouncedSearchInputProps) => {
    const [value, setValue] = useState('')
    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value
        setValue(v)
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => onSearch(v), debounceMs)
      },
      [onSearch, debounceMs],
    )

    useEffect(() => () => clearTimeout(timerRef.current), [])

    return (
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        className={className}
      />
    )
  },
)

DebouncedSearchInput.displayName = 'DebouncedSearchInput'

export default DebouncedSearchInput
