import React, { useCallback, useEffect, useRef, useState } from 'react'

interface DebouncedSearchInputProps {
  placeholder: string
  className: string
  onSearch: (value: string) => void
  /**
   * The search the parent is filtering by. The box starts from it and follows
   * it when it changes from elsewhere, so a box mounted later (e.g. after a
   * switch between views) shows the query that is still being applied.
   */
  value?: string
  debounceMs?: number
}

/**
 * Isolated search input that owns its draft value and debounces callbacks.
 * Wrapped in React.memo so parent re-renders don't clobber the in-progress query.
 */
export const DebouncedSearchInput = React.memo(
  ({ placeholder, className, onSearch, value, debounceMs = 300 }: DebouncedSearchInputProps) => {
    const [draft, setDraft] = useState(value ?? '')
    // The last query this box and its parent agreed on. When `value` moves away
    // from it, the change came from outside and the box shows it; the echo of
    // this box's own debounced query leaves the draft alone.
    const [syncedValue, setSyncedValue] = useState(value ?? '')
    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
    const pendingRef = useRef<string | null>(null)

    if (value !== undefined && value !== syncedValue) {
      setSyncedValue(value)
      setDraft(value)
    }

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value
        setDraft(v)
        pendingRef.current = v
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          pendingRef.current = null
          setSyncedValue(v)
          onSearch(v)
        }, debounceMs)
      },
      [onSearch, debounceMs],
    )

    // Apply the typed query now rather than after the debounce. Runs when the
    // box loses focus, which happens before a click on e.g. Export lands, so
    // that action works on the query the box shows.
    const flush = useCallback(() => {
      if (pendingRef.current === null) return
      clearTimeout(timerRef.current)
      const pending = pendingRef.current
      pendingRef.current = null
      setSyncedValue(pending)
      onSearch(pending)
    }, [onSearch])

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') flush()
      },
      [flush],
    )

    useEffect(
      () => () => {
        clearTimeout(timerRef.current)
        // Hand over a query typed just before the box went away, instead of
        // silently dropping it.
        if (pendingRef.current !== null) {
          const pending = pendingRef.current
          pendingRef.current = null
          onSearch(pending)
        }
      },
      [onSearch],
    )

    return (
      <input
        type="text"
        placeholder={placeholder}
        value={draft}
        onChange={handleChange}
        onBlur={flush}
        onKeyDown={handleKeyDown}
        className={className}
      />
    )
  },
)

DebouncedSearchInput.displayName = 'DebouncedSearchInput'

export default DebouncedSearchInput
