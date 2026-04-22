// Sensory-score validation helpers adapted from CupperScoringSheet.
// Shared between the Processor workbench cupping panel and any future callers.

import { SCA_SENSORY_ATTRIBUTES, SCA_CUP_ATTRIBUTES } from '../../../types'

export interface ScoreInput {
  value: string
  error: string | null
}

/**
 * Validates a raw string score against the SCA 1-10 scale.
 * Returns the trimmed/formatted value along with the first user-facing error, if any.
 */
export const validateScore = (
  value: string,
): { formattedValue: string; error: string | null } => {
  if (value.trim() === '') return { formattedValue: value, error: 'Required.' }
  const numValue = parseFloat(value)
  if (isNaN(numValue)) return { formattedValue: value, error: 'Invalid number.' }
  if (numValue < 1 || numValue > 10)
    return { formattedValue: value, error: 'Must be 1-10.' }
  return { formattedValue: numValue.toFixed(2), error: null }
}

/** Empty initial sensory scores (all attributes blank, no errors). */
export const initialSensoryScores = SCA_SENSORY_ATTRIBUTES.reduce(
  (acc, attr) => {
    acc[attr] = { value: '', error: null }
    return acc
  },
  {} as Record<string, ScoreInput>,
)

/** Initial cup scores (all 5 cups marked "good"). */
export const initialCupScores = SCA_CUP_ATTRIBUTES.reduce(
  (acc, attr) => {
    acc[attr] = 5
    return acc
  },
  {} as Record<string, number>,
)
