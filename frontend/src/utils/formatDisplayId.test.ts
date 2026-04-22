import {
  formatDisplayId,
  formatGreenBeanId,
  formatParchmentId,
  formatProcessingBatchId,
  formatHarvestLotId,
} from './formatDisplayId'

describe('formatDisplayId', () => {
  test('returns existing displayId when one is already present', () => {
    // Backend-assigned IDs win over client-side formatting.
    expect(
      formatDisplayId(
        { id: 'abcd-1234', displayId: 'PCH-2026-042' },
        'PCH',
      ),
    ).toBe('PCH-2026-042')
  })

  test('builds {prefix}-{year}-#{hash4} from createdAt and UUID', () => {
    expect(
      formatDisplayId(
        { id: 'B7AF3C9E-0000-0000-0000-000000000000', createdAt: '2025-06-15T10:00:00Z' },
        'GBL',
      ),
    ).toBe('GBL-2025-#b7af')
  })

  test('lowercases the UUID hash regardless of input casing', () => {
    // UUIDs from crypto.randomUUID() are lowercase but API payloads sometimes arrive uppercase.
    expect(
      formatDisplayId({ id: 'UPPERCASE-UUID', createdAt: '2024-01-01' }, 'PB'),
    ).toBe('PB-2024-#uppe')
  })

  test('falls back to current year when createdAt is missing', () => {
    const currentYear = new Date().getFullYear()
    expect(formatDisplayId({ id: 'deadbeef' }, 'HL')).toBe(`HL-${currentYear}-#dead`)
  })

  test('falls back to current year when createdAt is unparseable', () => {
    const currentYear = new Date().getFullYear()
    expect(
      formatDisplayId({ id: '12345678', createdAt: 'not-a-date' }, 'HL'),
    ).toBe(`HL-${currentYear}-#1234`)
  })

  test('accepts Date objects for createdAt', () => {
    expect(
      formatDisplayId({ id: 'cafebabe', createdAt: new Date('2023-03-01T00:00:00Z') }, 'PCH'),
    ).toBe('PCH-2023-#cafe')
  })

  test('prefix helpers forward to formatDisplayId with the right prefix', () => {
    const item = { id: '00112233', createdAt: '2026-01-01' }
    expect(formatGreenBeanId(item)).toBe('GBL-2026-#0011')
    expect(formatParchmentId(item)).toBe('PCH-2026-#0011')
    expect(formatProcessingBatchId(item)).toBe('PB-2026-#0011')
    expect(formatHarvestLotId(item)).toBe('HL-2026-#0011')
  })

  test('handles IDs shorter than 4 characters without throwing', () => {
    // Guards against substring(0, 4) on very short ids returning a partial hash rather than erroring.
    expect(formatDisplayId({ id: 'ab', createdAt: '2025-01-01' }, 'GBL')).toBe('GBL-2025-#ab')
  })
})
