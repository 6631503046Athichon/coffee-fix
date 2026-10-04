import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { GreenBeanSourceType, ParchmentSourceType } from '../../../types'
import type { GreenBeanLot, ParchmentLot } from '../../../types'
import { api } from '../../../services/api'
import { ApiError } from '../../../services/apiError'
import VoidWithdrawalModal from './VoidWithdrawalModal'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

// D7: the confirm popup says what goes back where before anything is sent,
// takes an optional reason, and shows the backend's refusal.

const pushRow = { id: 'w-1', amountKg: 10, withdrawalType: 'Roasting Stock' as const, date: '2026-09-20', targetRoasterId: 'r-1' }
const greenLot: GreenBeanLot = {
  id: 'gbl-1', displayId: 'GBL-2026-9', sourceType: GreenBeanSourceType.Internal, createdById: 'p-1',
  grade: 'Grade A', initialWeightKg: 10, currentWeightKg: 0, availabilityStatus: 'Withdrawn',
  cuppingScores: [], withdrawalHistory: [pushRow],
}
const hullRow = { id: 'pw-1', amountKg: 100, withdrawalType: 'HullAndGrade' as const, date: '2026-09-20T00:00:00.000Z' }
const parchmentLot: ParchmentLot = {
  id: 'pl-1', displayId: 'PL-2026-3', processingBatchId: 'pb-1', sourceType: ParchmentSourceType.Internal,
  initialWeightKg: 100, currentWeightKg: 0, moistureContent: 11, processType: 'Washed', status: 'Hulled',
  withdrawalHistory: [hullRow],
}
const graded: GreenBeanLot = {
  ...greenLot, id: 'gbl-7', displayId: 'GBL-2026-7', grade: 'Grade B', initialWeightKg: 60, currentWeightKg: 60,
  availabilityStatus: 'Available', parchmentLotId: 'pl-1', parchmentWithdrawalId: 'pw-1', withdrawalHistory: [],
}

const confirmVoid = () => fireEvent.click(screen.getByRole('button', { name: 'Void withdrawal' }))

describe('VoidWithdrawalModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('says the kg go back to the lot (Available again) and off the roaster stock', () => {
    render(
      <VoidWithdrawalModal
        target={{ kind: 'greenBean', lot: greenLot, withdrawal: pushRow }}
        roasterName="Doi Roasters"
        onClose={() => {}}
        onVoided={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Void withdrawal' })).toBeInTheDocument()
    const effects = screen.getByTestId('void-withdrawal-effects')
    expect(effects).toHaveTextContent('10.00 kg go back to green bean lot GBL-2026-9, which becomes Available again.')
    expect(effects).toHaveTextContent('The same 10.00 kg are taken back off the stock of Doi Roasters.')
    expect(effects).toHaveTextContent('If the roaster already roasted or sold them, the void is refused and nothing changes.')
    expect(effects).toHaveTextContent('The row stays in the history, marked Voided.')
  })

  it('says a Hull & Grade void deletes the green bean lots it made', () => {
    render(
      <VoidWithdrawalModal
        target={{ kind: 'parchment', lot: parchmentLot, withdrawal: hullRow }}
        gradedLots={[graded]}
        onClose={() => {}}
        onVoided={vi.fn()}
      />,
    )
    const effects = screen.getByTestId('void-withdrawal-effects')
    expect(effects).toHaveTextContent('100.00 kg of parchment go back to lot PL-2026-3, which goes back to Awaiting Hulling.')
    expect(effects).toHaveTextContent('The green bean lots this Hull & Grade made are deleted: GBL-2026-7 (Grade B, 60.00 kg).')
    expect(screen.getByText('Hull & Grade')).toBeInTheDocument()
  })

  it('sends the typed reason and hands back the reply', async () => {
    vi.mocked(api.post).mockResolvedValue({
      greenBeanLot: { ...greenLot, currentWeightKg: 10, availabilityStatus: 'Available', withdrawalHistory: [] },
      withdrawal: { ...pushRow, withdrawalType: 'RoastingStock', voidedAt: '2026-10-04T00:00:00.000Z' },
      roasterInventoryItem: null,
    })
    const onVoided = vi.fn()
    render(
      <VoidWithdrawalModal
        target={{ kind: 'greenBean', lot: greenLot, withdrawal: pushRow }}
        onClose={() => {}}
        onVoided={onVoided}
      />,
    )
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Wrong roaster' } })
    confirmVoid()

    await waitFor(() => expect(onVoided).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith('/green-bean-lots/gbl-1/withdrawals/w-1/void', { reason: 'Wrong roaster' })
    expect(onVoided.mock.calls[0][0]).toMatchObject({
      kind: 'greenBean',
      result: { greenBeanLot: { currentWeightKg: 10 }, withdrawal: { voidedAt: '2026-10-04T00:00:00.000Z' } },
    })
  })

  it('voids a parchment withdrawal with no reason as an empty body', async () => {
    vi.mocked(api.post).mockResolvedValue({ parchmentLot: parchmentLot, withdrawal: hullRow, removedGreenBeanLots: [] })
    const onVoided = vi.fn()
    render(
      <VoidWithdrawalModal
        target={{ kind: 'parchment', lot: parchmentLot, withdrawal: hullRow }}
        onClose={() => {}}
        onVoided={onVoided}
      />,
    )
    confirmVoid()
    await waitFor(() => expect(onVoided).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith('/parchment-lots/pl-1/withdrawals/pw-1/void', {})
    expect(onVoided.mock.calls[0][0].kind).toBe('parchment')
  })

  it('shows the refusal and stays open', async () => {
    const refusal = new ApiError(
      'Doi Roasters already used these kg: only 2 of the 10 kg sent are still in their stock (roasts or sales took the rest), so this withdrawal cannot be voided.',
      409,
    )
    vi.mocked(api.post).mockRejectedValue(refusal)
    const onVoided = vi.fn()
    const onError = vi.fn()
    render(
      <VoidWithdrawalModal
        target={{ kind: 'greenBean', lot: greenLot, withdrawal: pushRow }}
        onClose={() => {}}
        onVoided={onVoided}
        onError={onError}
      />,
    )
    confirmVoid()
    expect(await screen.findByRole('alert')).toHaveTextContent('Doi Roasters already used these kg')
    expect(onError).toHaveBeenCalledWith(refusal.message, refusal)
    expect(onVoided).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Void withdrawal' })).toBeInTheDocument()
  })

  it('names the permission rule on a 403', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('Forbidden', 403))
    render(
      <VoidWithdrawalModal
        target={{ kind: 'greenBean', lot: greenLot, withdrawal: pushRow }}
        onClose={() => {}}
        onVoided={vi.fn()}
      />,
    )
    confirmVoid()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only the owner of this lot, or an admin, can void its withdrawals.',
    )
  })
})
