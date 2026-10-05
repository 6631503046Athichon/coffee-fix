import React from 'react'
import { render, screen } from '@testing-library/react'
import type { PublicTraceData } from '../../services/lots/greenBeanLotService'
import TraceabilityStory from './TraceabilityStory'

// A lot whose cherry lot has no variety and whose parchment has no process.
const story = {
  lot: {
    id: 'gbl-1',
    grade: 'Grade B',
    sourceType: 'Internal',
    roastBatches: [],
    cuppingScores: [],
    parchmentLot: {
      processType: '',
      harvestLot: { cherryVariety: '', farmPlotLocation: 'Phupha Estate' },
    },
  },
  traceId: null,
} as unknown as PublicTraceData

describe('TraceabilityStory', () => {
  it('shows Unknown, not N/A, for an empty process or variety', () => {
    render(<TraceabilityStory data={story} shareUrl={null} />)

    // Method and Variety on the Origin and Processing cards, plus the Coffee
    // Details rows: four in all.
    expect(screen.getAllByText('Unknown')).toHaveLength(4)
    // The drying duration has no dates and keeps its own N/A.
    expect(screen.getByText('Drying Duration').nextElementSibling).toHaveTextContent('N/A')
    for (const label of ['Variety', 'Method', 'Processing method']) {
      for (const node of screen.getAllByText(label)) {
        expect(node.nextElementSibling).not.toHaveTextContent('N/A')
      }
    }
  })
})
