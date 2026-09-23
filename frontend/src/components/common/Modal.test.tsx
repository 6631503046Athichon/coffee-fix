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

  it('fills the phone screen only when mobileFullScreen is set', () => {
    const { rerender } = render(
      <Modal isOpen onClose={() => {}} title="Sell" className="!p-5 !rounded-xl" mobileFullScreen>
        <p>Body</p>
      </Modal>,
    )
    const overlay = screen.getByRole('dialog')
    const box = overlay.firstElementChild as HTMLElement
    expect(overlay).toHaveClass('max-sm:!h-[100dvh]', 'max-sm:!items-stretch')
    expect(box).toHaveClass(
      'max-sm:!m-0',
      'max-sm:h-[100dvh]',
      'max-sm:max-h-[100dvh]',
      'max-sm:w-screen',
      'max-sm:max-w-none',
      'max-sm:!rounded-none',
      'max-sm:!p-4',
      '!p-5',
    )

    rerender(
      <Modal isOpen onClose={() => {}} title="Sell">
        <p>Body</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog')).not.toHaveClass('max-sm:!items-stretch')
    expect(screen.getByRole('dialog').firstElementChild).not.toHaveClass('max-sm:!m-0')
  })
})
