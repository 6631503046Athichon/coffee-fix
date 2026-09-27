import React from 'react'
import { formatBaht, gradeSplitValue } from './gradePrice'

interface GradeSplitValueProps {
  rows: { weight: string; price: string }[]
}

/**
 * The value line under a grade split's kg total: "13,230.00 THB value",
 * plus "1 of 2 grades priced" while some weighed rows have no price, so the
 * figure is not read as the value of the whole split. Renders nothing until
 * a row has both a weight and a valid price. Same place and size in every
 * Hull & Grade / Process & Grade form.
 */
const GradeSplitValue: React.FC<GradeSplitValueProps> = ({ rows }) => {
  const summary = gradeSplitValue(rows)
  if (!summary) return null
  const partial = summary.pricedRows < summary.weighedRows
  return (
    <p className="mt-1 text-sm font-bold text-gray-700">
      {formatBaht(summary.value)}{' '}
      <span className="text-xs font-semibold text-gray-400">
        value
        {partial &&
          ` · ${summary.pricedRows} of ${summary.weighedRows} grades priced`}
      </span>
    </p>
  )
}

export default GradeSplitValue
