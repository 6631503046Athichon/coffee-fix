import { act, renderHook } from '@testing-library/react'
import { clearFormDrafts, useFormPersist } from './useFormPersist'

const initialValues = { weightKg: '', cropYearId: '' }

describe('useFormPersist', () => {
  beforeEach(() => localStorage.clear())

  it('fills in defaults without making the form dirty', () => {
    const { result } = renderHook(() => useFormPersist({ storageKey: 'lot', initialValues }))
    act(() => result.current.setDefaults({ cropYearId: 'cy-1' }))
    expect(result.current.values.cropYearId).toBe('cy-1')
    expect(result.current.isDirty).toBe(false)

    act(() => result.current.setValue('weightKg', '42'))
    expect(result.current.isDirty).toBe(true)
  })

  it('loads the new key\'s own draft when the key changes, never carrying the old one over', () => {
    localStorage.setItem('form-persist-lot-u-b', JSON.stringify({ weightKg: '999' }))
    const { result, rerender } = renderHook(
      ({ storageKey }) => useFormPersist({ storageKey, initialValues }),
      { initialProps: { storageKey: 'lot-u-a' } },
    )
    act(() => result.current.setValue('weightKg', '42'))
    expect(result.current.isDirty).toBe(true)

    rerender({ storageKey: 'lot-u-b' })
    expect(result.current.values.weightKg).toBe('999')
    expect(result.current.wasRestored).toBe(true)
    expect(result.current.isDirty).toBe(false)

    rerender({ storageKey: 'lot-u-c' })
    expect(result.current.values.weightKg).toBe('')
    expect(result.current.wasRestored).toBe(false)
  })

  it('clearFormDrafts removes every saved draft and nothing else', () => {
    localStorage.setItem('form-persist-harvest-lot-modal', '{}')
    localStorage.setItem('form-persist-harvest-lot-modal-u-a', '{}')
    localStorage.setItem('weatherApiSimulateFailure', 'true')

    clearFormDrafts()

    expect(Object.keys(localStorage)).toEqual(['weatherApiSimulateFailure'])
  })
})
