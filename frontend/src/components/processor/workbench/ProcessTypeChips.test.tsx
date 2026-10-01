import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import type { ProcessType } from '../../../types'
import ProcessTypeChips, { ProcessTypeChip } from './ProcessTypeChips'
import ProcessTypePill, { ProcessTypeDot } from './ProcessTypePill'

const processType = (name: string, hue: string, isActive = true): ProcessType => ({
  id: `pt-${name}`,
  name,
  colorScheme: {
    borderColor: `border-l-${hue}-500`,
    iconBg: `bg-${hue}-100`,
    iconColor: `text-${hue}-600`,
    badgeColor: `bg-${hue}-100 text-${hue}-700 border-${hue}-200`,
  },
  createdDate: '2026-09-01',
  isActive,
})

const types: ProcessType[] = [
  processType('Washed', 'blue'),
  processType('Natural', 'yellow'),
  processType('Honey', 'amber', false),
  processType('Anaerobic', 'purple'),
  processType('Carbonic Maceration', 'teal'),
]

const group = () => screen.getByRole('group', { name: 'Process type' })
const chips = () => within(group()).getAllByRole('button')

describe('ProcessTypeChips', () => {
  it('shows the active types in the admin order as a wrapping 2/3-column grid', () => {
    render(<ProcessTypeChips value="Natural" onChange={() => {}} processTypes={types} />)
    expect(chips().map((b) => b.textContent)).toEqual(['Washed', 'Natural', 'Anaerobic', 'Carbonic Maceration'])
    expect(group()).toHaveClass('grid', 'grid-cols-2', 'sm:grid-cols-3')
    for (const chip of chips()) {
      expect(chip).toHaveAttribute('type', 'button')
      expect(chip).toHaveClass('focus-visible:ring-2')
    }
  })

  it('marks only the selected chip, filled in its colour with a check; the others are tinted with a dot', () => {
    render(<ProcessTypeChips value="natural" onChange={() => {}} processTypes={types} />)
    const [washed, natural] = chips()
    expect(natural).toHaveAttribute('aria-pressed', 'true')
    expect(natural).toHaveClass('bg-yellow-700', 'text-white')
    expect(natural.querySelector('svg')).not.toBeNull()
    expect(washed).toHaveAttribute('aria-pressed', 'false')
    expect(washed).toHaveClass('bg-blue-50', 'border-blue-200', 'text-blue-800', 'focus-visible:ring-blue-600')
    expect(washed.querySelector('svg')).toBeNull()
    expect(washed.querySelector('span.rounded-full')).toHaveClass('bg-blue-500')
    expect(chips().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })

  it('puts the dot and the check in the same fixed slot, so the label does not move', () => {
    const { rerender } = render(<ProcessTypeChips value="Washed" onChange={() => {}} processTypes={types} />)
    const slotOf = (name: string) =>
      within(within(group()).getByRole('button', { name })).getByTestId('process-type-chip-icon')
    const slotClasses = 'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center'
    expect(slotOf('Natural')).toHaveClass(slotClasses)
    expect(slotOf('Natural').querySelector('svg')).toBeNull()
    rerender(<ProcessTypeChips value="Natural" onChange={() => {}} processTypes={types} />)
    expect(slotOf('Natural').className).toBe(slotClasses)
    expect(slotOf('Natural').querySelector('svg')).not.toBeNull()
    expect(slotOf('Natural')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps an inactive current value listed, in its colour, and sends it back unchanged', () => {
    const onChange = vi.fn()
    render(<ProcessTypeChips value="Honey" onChange={onChange} processTypes={types} />)
    const honey = chips().at(-1)!
    expect(honey).toHaveTextContent('Honey')
    expect(honey).toHaveAttribute('aria-pressed', 'true')
    expect(honey).toHaveClass('bg-amber-700')
    expect(honey).toHaveAttribute('title', expect.stringContaining('no longer offered'))
    fireEvent.click(honey)
    expect(onChange).toHaveBeenLastCalledWith('Honey')
  })

  it('keeps an unknown current value too, in gray', () => {
    render(<ProcessTypeChips value="Wet-Hulled" onChange={() => {}} processTypes={types} />)
    const kept = chips().at(-1)!
    expect(kept).toHaveTextContent('Wet-Hulled')
    expect(kept).toHaveClass('bg-gray-600', 'text-white')
  })

  it('sends the picked name exactly as the admin list spells it', () => {
    const onChange = vi.fn()
    render(<ProcessTypeChips value="Washed" onChange={onChange} processTypes={types} />)
    fireEvent.click(within(group()).getByRole('button', { name: 'Carbonic Maceration' }))
    expect(onChange).toHaveBeenCalledWith('Carbonic Maceration')
  })

  it('offers the classic three while the list has not loaded', () => {
    render(<ProcessTypeChips value="Honey" onChange={() => {}} processTypes={[]} />)
    expect(chips().map((b) => b.textContent)).toEqual(['Honey', 'Natural', 'Washed'])
    expect(chips()[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('says so when the admin has no active type', () => {
    render(<ProcessTypeChips value="" onChange={() => {}} processTypes={[processType('Washed', 'blue', false)]} />)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByText(/No active process types/)).toBeInTheDocument()
  })
})

describe('ProcessTypeChip (static preview)', () => {
  it('draws the same chip as the picker, as plain text instead of a button', () => {
    const { container } = render(
      <>
        <ProcessTypeChip name="Carbonic" hue="emerald" selected={false} />
        <ProcessTypeChip name="Carbonic" hue="emerald" selected />
      </>,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    const [plain, picked] = Array.from(container.children)
    expect(plain.tagName).toBe('SPAN')
    expect(plain).toHaveClass('bg-emerald-50', 'border-emerald-200', 'text-emerald-800', 'rounded-lg')
    expect(plain.querySelector('span.rounded-full')).toHaveClass('bg-emerald-500')
    expect(picked).toHaveClass('bg-emerald-700', 'text-white')
    expect(picked.querySelector('svg')).not.toBeNull()
  })

  it('has no hover tint, so it does not look clickable; the picker chip does', () => {
    const { container } = render(<ProcessTypeChip name="Natural" hue="yellow" selected={false} />)
    const preview = container.firstChild as HTMLElement
    expect(preview).toHaveClass('bg-yellow-50')
    expect(preview.className).not.toMatch(/hover:/)
    render(<ProcessTypeChips value="Washed" onChange={() => {}} processTypes={types} />)
    expect(within(group()).getByRole('button', { name: 'Natural' })).toHaveClass('hover:bg-yellow-100', 'hover:border-yellow-300')
  })

  it('matches the picker chip class for class', () => {
    const { container } = render(<ProcessTypeChip name="Washed" hue="blue" selected />)
    render(<ProcessTypeChips value="Washed" onChange={() => {}} processTypes={types} />)
    const button = within(group()).getByRole('button', { name: 'Washed' })
    expect((container.firstChild as HTMLElement).className).toBe(button.className)
  })
})

describe('ProcessTypePill', () => {
  it('uses the colour the admin gave the type', () => {
    render(<ProcessTypePill type="Anaerobic" processTypes={types} />)
    expect(screen.getByText('Anaerobic')).toHaveClass('bg-purple-100', 'text-purple-700', 'border-purple-200', 'rounded-full')
  })

  it('keeps the colour with a custom shape, and is gray for an unknown type', () => {
    render(
      <>
        <ProcessTypePill type="washed" processTypes={types} className="uppercase text-[10px]" />
        <ProcessTypePill type="Mystery" processTypes={types} />
      </>,
    )
    expect(screen.getByText('washed')).toHaveClass('uppercase', 'bg-blue-100', 'text-blue-700')
    expect(screen.getByText('Mystery')).toHaveClass('bg-gray-100', 'text-gray-700')
  })

  it('takes an explicit hue instead of a lookup by name', () => {
    render(
      <>
        <ProcessTypePill type="Brand new" hue="fuchsia" />
        <ProcessTypePill type="Washed" processTypes={types} hue="lime" />
      </>,
    )
    expect(screen.getByText('Brand new')).toHaveClass('bg-fuchsia-100', 'text-fuchsia-700', 'border-fuchsia-200')
    expect(screen.getByText('Washed')).toHaveClass('bg-lime-100', 'text-lime-700')
    expect(screen.getByText('Washed')).not.toHaveClass('bg-blue-100')
  })

  it('draws a dot in the type colour', () => {
    const { container } = render(<ProcessTypeDot type="Honey" processTypes={types} />)
    expect(container.firstChild).toHaveClass('bg-amber-500', 'rounded-full')
  })
})
