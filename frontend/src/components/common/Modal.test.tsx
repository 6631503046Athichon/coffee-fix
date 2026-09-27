import React, { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
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

  describe('with a popup opened from another', () => {
    const Stacked: React.FC<{
      onOuterClose: () => void
      onInnerClose: () => void
      onOuterLastFocus?: () => void
    }> = ({ onOuterClose, onInnerClose, onOuterLastFocus }) => {
      const [innerOpen, setInnerOpen] = useState(false)
      return (
        <Modal isOpen onClose={onOuterClose} title="Sell coffee">
          <input aria-label="Notes" />
          <button type="button" onClick={() => setInnerOpen(true)} onFocus={onOuterLastFocus}>
            New customer
          </button>
          <Modal
            isOpen={innerOpen}
            onClose={() => {
              onInnerClose()
              setInnerOpen(false)
            }}
            title="Create New Customer"
            showCloseButton={false}
          >
            <input aria-label="Name" />
            <button type="button">Create</button>
          </Modal>
        </Modal>
      )
    }

    it('closes only the top popup on Escape', () => {
      const onOuterClose = vi.fn()
      const onInnerClose = vi.fn()
      render(<Stacked onOuterClose={onOuterClose} onInnerClose={onInnerClose} />)
      fireEvent.click(screen.getByRole('button', { name: 'New customer' }))

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onInnerClose).toHaveBeenCalledTimes(1)
      expect(onOuterClose).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog', { name: 'Create New Customer' })).not.toBeInTheDocument()

      // With the top one gone, the popup underneath answers Escape again.
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onOuterClose).toHaveBeenCalledTimes(1)
    })

    it('keeps Shift+Tab inside the top popup', () => {
      const onOuterLastFocus = vi.fn()
      render(
        <Stacked onOuterClose={() => {}} onInnerClose={() => {}} onOuterLastFocus={onOuterLastFocus} />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'New customer' }))
      const name = screen.getByLabelText('Name')
      act(() => name.focus())

      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })

      expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus()
      // The popup underneath never pulled focus back to its own last control.
      expect(onOuterLastFocus).not.toHaveBeenCalled()
    })
  })

  it('wraps Tab past a pane hidden with inert', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Start roast" showCloseButton={false}>
        <button type="button">First</button>
        <div inert>
          <button type="button">Hidden pane</button>
        </div>
        <button type="button">Last</button>
        <div inert>
          <button type="button">Hidden too</button>
        </div>
      </Modal>,
    )
    const last = screen.getByRole('button', { name: 'Last' })
    act(() => last.focus())

    fireEvent.keyDown(document, { key: 'Tab' })

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('pulls a forward Tab back inside when the focused control was removed', () => {
    const Swap: React.FC = () => {
      const [claimed, setClaimed] = useState(false)
      return (
        <Modal isOpen onClose={() => {}} title="Sell green beans" showCloseButton={false}>
          <button type="button">First</button>
          {claimed ? (
            <input aria-label="Kg" />
          ) : (
            <button type="button" onClick={() => setClaimed(true)}>
              Claim Stock
            </button>
          )}
        </Modal>
      )
    }
    render(
      <>
        <button type="button">Behind the popup</button>
        <Swap />
      </>,
    )
    const claim = screen.getByRole('button', { name: 'Claim Stock' })
    act(() => claim.focus())
    fireEvent.click(claim)
    // The button unmounted with focus on it, so focus fell to <body>.
    expect(document.body).toHaveFocus()

    const tab = fireEvent.keyDown(document, { key: 'Tab' })

    expect(tab).toBe(false)
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })
})
