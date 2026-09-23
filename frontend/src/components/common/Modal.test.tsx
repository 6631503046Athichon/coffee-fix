import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { Modal } from './Modal'

describe('Modal', () => {
  it('stays open when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose} title="Register lot">
        <input aria-label="Weight" />
      </Modal>,
    )

    fireEvent.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('still closes from the X button and from Escape', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose} title="Register lot">
        <p>Body</p>
      </Modal>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('keeps clicks inside the modal from reaching whatever rendered it', () => {
    const onCardClick = vi.fn()
    render(
      <div onClick={onCardClick}>
        <Modal isOpen onClose={() => {}} title="Details">
          <button type="button">Inside</button>
        </Modal>
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Inside' }))
    fireEvent.click(screen.getByRole('dialog'))

    expect(onCardClick).not.toHaveBeenCalled()
  })
})
