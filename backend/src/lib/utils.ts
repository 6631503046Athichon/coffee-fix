/**
 * Safely parse float value
 * Returns null if value is undefined, null, or not a valid number
 */
export function safeParseFloat(value: any): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = parseFloat(value)
  return isNaN(parsed) ? null : parsed
}

/**
 * Safely parse integer value
 * Returns null if value is undefined, null, or not a valid number
 */
export function safeParseInt(value: any): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? null : parsed
}
