import React, { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { ToastProvider } from '../../contexts/ToastContext'
import { RoastLevel } from '../../types'
import Select from '../common/Select'
import { Modal } from '../common/Modal'
import ExternalLotsTable from './ExternalLotsTable'
import RoastDetailsModal, { type RoastDetails } from './RoastDetailsModal'
import type { ExternalDisplayLot } from '../../types/displayTypes'

const lotsOnPage = (count: number, from = 1): ExternalDisplayLot[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `gbl-${from + i}`,
    grade: 'Grade A',
    process: 'Natural',
    variety: 'Bourbon',
    currentWeightKg: 25,
  })) as unknown as ExternalDisplayLot[]

describe('Purchased lots shelf', () => {
  it('offers page controls so lots past the first page stay reachable', () => {
    const onPageChange = vi.fn()
    render(
      <ExternalLotsTable
        lots={lotsOnPage(6)}
        onRoast={vi.fn()}
        onAddExternal={vi.fn()}
        currentPage={1}
        totalPages={3}
        onPageChange={onPageChange}
        pageSize={6}
        hideHeader
      />,
    )

    fireEvent.click(screen.getByLabelText('Page 2'))
    expect(onPageChange).toHaveBeenCalledWith(2)

    fireEvent.click(screen.getByLabelText('Next page'))
    expect(onPageChange).toHaveBeenCalledWith(2)

    expect(screen.getByLabelText('Previous page')).toBeDisabled()
  })

  it('hides the controls when everything fits on one page', () => {
    render(
      <ExternalLotsTable
        lots={lotsOnPage(3)}
        onRoast={vi.fn()}
        onAddExternal={vi.fn()}
        currentPage={1}
        totalPages={1}
        onPageChange={vi.fn()}
        pageSize={6}
        hideHeader
      />,
    )
    expect(screen.queryByLabelText('Next page')).toBeNull()
  })
})

describe('Select inside a dialog', () => {
  const DialogWithSelect: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [value, setValue] = useState<string | number | null>(null)
    return (
      <Modal isOpen onClose={onClose}>
        <Select options={['Bourbon', 'Catuai']} value={value} onChange={setValue} />
      </Modal>
    )
  }

  it('closes only the open list on Escape, leaving the dialog up', () => {
    const onClose = vi.fn()
    render(<DialogWithSelect onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /select/i }))
    expect(screen.getByRole('button', { name: 'Bourbon' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('button', { name: 'Bourbon' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('still lets Escape close the dialog when no list is open', () => {
    const onClose = vi.fn()
    render(<DialogWithSelect onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })
})

describe('Roast details popup', () => {
  const roast: RoastDetails = {
    id: 'rb-1',
    displayId: 'RB-0521',
    roasterId: 'roaster',
    roasterInventoryId: 'inv-1',
    greenBeanLotId: 'gbl-1',
    roastDate: '2026-09-16',
    batchSizeKg: 10,
    yieldPercentage: 85,
    roastedWeightKg: 8.5,
    roastLevel: RoastLevel.Medium,
    roastProfileNotes: 'Dropped at 11:15',
    sourceVariety: 'Bourbon',
    sourceProcess: 'Natural',
    sourceGrade: 'Grade A',
  }

  const open = () =>
    render(
      <DataContext.Provider
        value={{
          data: INITIAL_APP_DATA,
          setData: vi.fn(),
          refreshData: async () => {},
          isEditing: false,
          setIsEditing: () => {},
        }}
      >
        <ToastProvider>
          <RoastDetailsModal roast={roast} canManage onClose={vi.fn()} />
        </ToastProvider>
      </DataContext.Provider>,
    )

  it('throws away an abandoned edit when Cancel is pressed', () => {
    open()

    fireEvent.click(screen.getByRole('button', { name: /edit roast/i }))
    const greenIn = screen.getByLabelText(/green beans in/i)
    expect(greenIn).toHaveValue('10')

    fireEvent.change(greenIn, { target: { value: '999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: /edit roast/i }))
    expect(screen.getByLabelText(/green beans in/i)).toHaveValue('10')
  })
})
