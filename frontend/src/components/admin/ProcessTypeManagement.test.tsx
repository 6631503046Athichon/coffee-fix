import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import ProcessTypeManagement from './ProcessTypeManagement';
import { DataContext } from '../../hooks/useDataContext';
import { INITIAL_APP_DATA } from '../../constants';
import type { AppData, GreenBeanLot, ParchmentLot, ProcessingBatch, ProcessType } from '../../types';
import {
  PROCESS_TYPE_PICKER_HUES,
  processTypeHueLabel,
  processTypeScheme,
} from '../processor/workbench/processTypeColors';
import { addProcessType, updateProcessType } from '../../services/processing/processTypeService';

vi.mock('../../services/processing/processTypeService', () => ({
  addProcessType: vi.fn(),
  updateProcessType: vi.fn(),
  deleteProcessType: vi.fn(),
  processTypeNameExists: vi.fn(async () => false),
}));

const mockedAdd = vi.mocked(addProcessType);
const mockedUpdate = vi.mocked(updateProcessType);

const processType = (id: string, name: string, colorScheme: unknown, isActive = true): ProcessType => ({
  id,
  name,
  colorScheme: colorScheme as ProcessType['colorScheme'],
  createdDate: '2026-09-01',
  isActive,
});

// An old-form Blue scheme, a seeded (nameless) Yellow one, a Sky scheme from
// before the palette had sky, and an empty one.
const TYPES: ProcessType[] = [
  processType('pt-washed', 'Washed', {
    name: 'Blue',
    borderColor: 'border-l-blue-500',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
  }),
  processType('pt-natural', 'Natural', {
    borderColor: 'border-l-yellow-500',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    badgeColor: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  }),
  processType('pt-lactic', 'Lactic', { borderColor: 'border-l-sky-500', badgeColor: 'bg-sky-100 text-sky-800' }, false),
  processType('pt-mystery', 'Mystery', {}),
];

const Harness: React.FC<{ types: ProcessType[]; initial?: Partial<AppData> }> = ({ types, initial }) => {
  const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, ...initial, processTypes: types });
  return (
    <DataContext.Provider
      value={{ data, setData, refreshData: async () => {}, setIsEditing: () => {}, isEditing: false }}
    >
      <ProcessTypeManagement />
    </DataContext.Provider>
  );
};

const renderPage = (types: ProcessType[] = TYPES, initial?: Partial<AppData>) =>
  render(<Harness types={types} initial={initial} />);
// Plain DOM lookups keep these fast; the first picker test checks the roles and names.
const swatchGroup = () => document.querySelector<HTMLElement>('[role="radiogroup"]')!;
const swatches = () => Array.from(swatchGroup().querySelectorAll<HTMLButtonElement>('[role="radio"]'));
const swatch = (label: string) => swatchGroup().querySelector<HTMLButtonElement>(`[role="radio"][aria-label="${label}"]`)!;
const preview = () => screen.getByTestId('process-type-color-preview');
const rowOf = (name: string) => screen.getAllByText(name)[0].closest('tr')!;

beforeEach(() => {
  mockedAdd.mockReset();
  mockedUpdate.mockReset();
  mockedAdd.mockImplementation(async input => ({ ...input, id: 'pt-new', createdDate: '2026-10-01' }) as ProcessType);
  mockedUpdate.mockImplementation(async input => input);
});

// Each test renders the whole admin page; give the suites the same 20 s
// budget as the other heavy page tests so a busy parallel run does not flake.
describe('ProcessTypeManagement list', { timeout: 20000 }, () => {
  it('shows each type with the shared pill in its stored colour, and the colour name', () => {
    renderPage();
    const pillIn = (name: string) =>
      within(rowOf(name)).getAllByText(name).find(el => el.classList.contains('rounded-full'))!;
    expect(pillIn('Washed')).toHaveClass('bg-blue-100', 'text-blue-700', 'border-blue-200', 'px-2', 'py-0.5', 'font-medium');
    expect(pillIn('Natural')).toHaveClass('bg-yellow-100', 'text-yellow-700');
    // A sky scheme now shows sky; an empty one gray, with no crash.
    expect(pillIn('Lactic')).toHaveClass('bg-sky-100', 'text-sky-700');
    expect(pillIn('Mystery')).toHaveClass('bg-gray-100', 'text-gray-700');
    expect(within(rowOf('Washed')).getByText('Blue')).toBeInTheDocument();
    expect(within(rowOf('Mystery')).getByText('Gray')).toBeInTheDocument();
  });
});

describe('ProcessTypeManagement colour picker', { timeout: 20000 }, () => {
  it('offers 18 round swatches, named, in palette order, with no native select', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Process Type/ }));
    const group = screen.getByRole('radiogroup', { name: /Color/ });
    expect(within(group).getAllByRole('radio').map(s => s.getAttribute('aria-label'))).toEqual(
      PROCESS_TYPE_PICKER_HUES.map(processTypeHueLabel),
    );
    expect(within(group).getByRole('radio', { name: 'Fuchsia' })).toHaveAttribute('aria-checked', 'false');
    expect(swatches()).toHaveLength(18);
    for (const s of swatches()) {
      expect(s).toHaveClass('rounded-full', 'h-8', 'w-8');
      expect(s).toHaveAttribute('type', 'button');
      expect(s.getAttribute('title')).toMatch(new RegExp(`^${s.getAttribute('aria-label')}`));
    }
    expect(swatch('Teal')).toHaveClass('bg-teal-500');
    expect(document.querySelector('select')).toBeNull();
  });

  it('updates the live preview and saves the chosen colour in the stored scheme shape', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Process Type/ }));
    fireEvent.change(screen.getByPlaceholderText(/e\.g\., Washed/), { target: { value: 'Carbonic' } });
    fireEvent.click(swatch('Emerald'));

    expect(swatch('Emerald')).toHaveAttribute('aria-checked', 'true');
    expect(swatch('Emerald').querySelector('svg')).not.toBeNull();
    expect(swatches().filter(s => s.getAttribute('aria-checked') === 'true')).toHaveLength(1);

    // The preview sits on white like the real pages; its static chips have no hover.
    expect(preview()).toHaveClass('bg-white');
    const [plainChip, selectedChip] = within(preview()).getAllByText('Carbonic').map(el => el.closest('[data-selected]')!);
    expect(plainChip).toHaveClass('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
    expect(plainChip.className).not.toMatch(/hover:/);
    expect(selectedChip).toHaveClass('bg-emerald-700', 'text-white');
    // The table badge and the small uppercase Parchment page badge.
    const [tablePill, parchmentPill] = within(preview())
      .getAllByText('Carbonic')
      .filter(el => el.classList.contains('rounded-full'));
    expect(tablePill).toHaveClass('bg-emerald-100', 'text-emerald-700', 'border-emerald-200', 'text-xs');
    expect(parchmentPill).toHaveClass('bg-emerald-100', 'text-emerald-700', 'uppercase', 'text-[10px]', 'font-bold');
    expect(preview()).toHaveTextContent('Emerald');

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(mockedAdd).toHaveBeenCalledTimes(1));
    const saved = mockedAdd.mock.calls[0][0];
    expect(saved).toEqual({
      name: 'Carbonic',
      description: undefined,
      colorScheme: {
        name: 'Emerald',
        borderColor: 'border-l-emerald-500',
        iconBg: 'bg-emerald-100',
        iconColor: 'text-emerald-600',
        badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      },
      isActive: true,
    });
    expect(Object.keys(saved.colorScheme)).toEqual(['name', 'borderColor', 'iconBg', 'iconColor', 'badgeColor']);
    // The new type is listed in its colour.
    await waitFor(() => expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument());
    expect(within(rowOf('Carbonic')).getAllByText('Carbonic').some(el => el.classList.contains('bg-emerald-100'))).toBe(true);
  });

  it('moves the choice with the arrow keys, Home and End (one tab stop)', () => {
    renderPage([]);
    fireEvent.click(screen.getByRole('button', { name: /Add Process Type/ }));
    expect(swatch('Blue')).toHaveAttribute('aria-checked', 'true');
    expect(swatches().filter(s => s.tabIndex === 0)).toEqual([swatch('Blue')]);

    fireEvent.keyDown(swatch('Blue'), { key: 'ArrowRight' });
    expect(swatch('Indigo')).toHaveAttribute('aria-checked', 'true');
    expect(swatch('Indigo')).toHaveFocus();
    fireEvent.keyDown(swatch('Indigo'), { key: 'ArrowUp' });
    expect(swatch('Blue')).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(swatch('Blue'), { key: 'End' });
    expect(swatch('Gray')).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(swatch('Gray'), { key: 'ArrowRight' });
    expect(swatch('Red')).toHaveAttribute('aria-checked', 'true');
    expect(swatch('Red')).toHaveFocus();
    fireEvent.keyDown(swatch('Red'), { key: 'ArrowLeft' });
    expect(swatch('Gray')).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(swatch('Gray'), { key: 'Home' });
    expect(swatch('Red')).toHaveAttribute('aria-checked', 'true');
    expect(swatches().filter(s => s.tabIndex === 0)).toEqual([swatch('Red')]);
  });

  it('keeps the 500 colour on the chosen swatch, with a dark ring and a check that shows on it', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Process Type/ }));
    fireEvent.click(swatch('Yellow'));
    expect(swatch('Yellow')).toHaveClass('bg-yellow-500', 'ring-2', 'ring-gray-900', 'ring-offset-2');
    expect(swatch('Yellow')).not.toHaveClass('bg-yellow-700');
    expect(swatch('Yellow').querySelector('svg')).toHaveClass('text-gray-900');
    // The others have no ring until focused.
    expect(swatch('Red')).not.toHaveClass('ring-2');

    fireEvent.click(swatch('Red'));
    expect(swatch('Red')).toHaveClass('bg-red-500', 'ring-gray-900');
    expect(swatch('Red').querySelector('svg')).toHaveClass('text-white');
    expect(swatch('Yellow').querySelector('svg')).toBeNull();
  });

  it('starts a new type on Blue while it is free, else on a colour far from the ones in use', () => {
    const { unmount } = renderPage([]);
    fireEvent.click(screen.getByRole('button', { name: /Add Process Type/ }));
    expect(swatch('Blue')).toHaveAttribute('aria-checked', 'true');
    unmount();

    // Blue, Yellow and Sky are taken: not Red (the error colour) or Orange
    // (like Yellow), but Green.
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Process Type/ }));
    expect(swatch('Green')).toHaveAttribute('aria-checked', 'true');
  });

  it('marks colours other types use, with who uses them, and keeps them selectable', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Process Type/ }));
    const marker = (label: string) => swatch(label).querySelector('[data-testid="swatch-used-marker"]');
    expect(marker('Blue')).not.toBeNull();
    expect(swatch('Blue')).toHaveAttribute('title', 'Blue — used by Washed; looks like Sky (Lactic)');
    expect(swatch('Yellow')).toHaveAttribute('title', 'Yellow — used by Natural');
    expect(swatch('Sky')).toHaveAttribute('title', 'Sky — used by Lactic; looks like Blue (Washed)');
    expect(swatch('Gray')).toHaveAttribute('title', 'Gray — used by Mystery');
    expect(marker('Red')).toBeNull();
    expect(swatch('Red')).toHaveAttribute('title', 'Red');
    expect(screen.getByText('Used by another type')).toBeInTheDocument();

    fireEvent.click(swatch('Blue'));
    expect(swatch('Blue')).toHaveAttribute('aria-checked', 'true');
    expect(preview()).toHaveTextContent('Also used by Washed');
    expect(preview()).toHaveTextContent('Looks like Sky (Lactic)');
  });

  it('names the look-alike colours in use, which are not marked as used', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Add Process Type/ }));
    expect(swatch('Cyan')).toHaveAttribute('title', 'Cyan — looks like Sky (Lactic), Blue (Washed)');
    expect(swatch('Cyan').querySelector('[data-testid="swatch-used-marker"]')).toBeNull();
    expect(swatch('Amber')).toHaveAttribute('title', 'Amber — looks like Yellow (Natural)');

    fireEvent.click(swatch('Amber'));
    expect(preview()).toHaveTextContent('Looks like Yellow (Natural)');
    expect(preview()).not.toHaveTextContent('Also used by');
    fireEvent.click(swatch('Purple'));
    expect(preview()).not.toHaveTextContent('Looks like');
  });
});

describe('ProcessTypeManagement edit', { timeout: 20000 }, () => {
  const editButtonOf = (name: string) => within(rowOf(name)).getByRole('button', { name: /Edit/ });

  it('preselects the stored colour, from any scheme shape', () => {
    renderPage();
    fireEvent.click(editButtonOf('Natural'));
    expect(swatch('Yellow')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(editButtonOf('Lactic'));
    expect(swatch('Sky')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(editButtonOf('Mystery'));
    expect(swatch('Gray')).toHaveAttribute('aria-checked', 'true');
  });

  it('does not mark the edited type\'s own colour as used, but does mark the others', () => {
    renderPage();
    fireEvent.click(editButtonOf('Washed'));
    expect(swatch('Blue')).toHaveAttribute('aria-checked', 'true');
    expect(swatch('Blue').querySelector('[data-testid="swatch-used-marker"]')).toBeNull();
    expect(swatch('Blue')).toHaveAttribute('title', 'Blue — looks like Sky (Lactic)');
    expect(swatch('Yellow').querySelector('[data-testid="swatch-used-marker"]')).not.toBeNull();
  });

  it('saves the original scheme unchanged when the colour is kept, and the new one when changed', async () => {
    renderPage();
    fireEvent.click(editButtonOf('Washed'));
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(mockedUpdate.mock.calls[0][0].colorScheme)).toBe(JSON.stringify(TYPES[0].colorScheme));

    await waitFor(() => expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument());
    fireEvent.click(editButtonOf('Natural'));
    fireEvent.click(swatch('Rose'));
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2));
    expect(mockedUpdate.mock.calls[1][0]).toMatchObject({
      id: 'pt-natural',
      name: 'Natural',
      colorScheme: processTypeScheme('rose'),
    });
    await waitFor(() =>
      expect(within(rowOf('Natural')).getAllByText('Natural').some(el => el.classList.contains('bg-rose-100'))).toBe(true),
    );
  });

  it('warns that records still on the old name lose the colour when a type in use is renamed', () => {
    const initial: Partial<AppData> = {
      parchmentLots: [{ id: 'pl-1', processType: 'Natural' }, { id: 'pl-2', processType: 'Washed' }] as ParchmentLot[],
      processingBatches: [{ id: 'pb-1', processType: 'natural ' }] as ProcessingBatch[],
      greenBeanLots: [{ id: 'gb-1', externalSource: { processType: 'Natural' } }] as GreenBeanLot[],
    };
    renderPage(TYPES, initial);
    fireEvent.click(editButtonOf('Natural'));
    const name = screen.getByPlaceholderText(/e\.g\., Washed/);
    expect(screen.queryByTestId('rename-in-use-warning')).toBeNull();

    fireEvent.change(name, { target: { value: 'Natural Process' } });
    expect(screen.getByTestId('rename-in-use-warning')).toHaveTextContent(
      '3 existing records still use "Natural". They keep that name, so after renaming they no longer match this type and show in gray.',
    );
    // A change of case or spacing still matches the records.
    fireEvent.change(name, { target: { value: ' NATURAL ' } });
    expect(screen.queryByTestId('rename-in-use-warning')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // A type nothing uses is renamed without a warning.
    fireEvent.click(editButtonOf('Mystery'));
    fireEvent.change(screen.getByPlaceholderText(/e\.g\., Washed/), { target: { value: 'Mystery 2' } });
    expect(screen.queryByTestId('rename-in-use-warning')).toBeNull();
  });

  it('counts one record in the singular', () => {
    renderPage(TYPES, { parchmentLots: [{ id: 'pl-1', processType: 'Washed' }] as ParchmentLot[] });
    fireEvent.click(editButtonOf('Washed'));
    fireEvent.change(screen.getByPlaceholderText(/e\.g\., Washed/), { target: { value: 'Fully Washed' } });
    expect(screen.getByTestId('rename-in-use-warning')).toHaveTextContent('1 existing record still uses "Washed".');
  });
});

// Rendered in place, the page's space-y-6 gave the popup's fixed backdrop a
// 24px top margin and left an undimmed strip across the top of the screen.
describe('ProcessTypeManagement popup', { timeout: 20000 }, () => {
  const bodyOverlays = () => Array.from(document.body.children).filter(el => el.matches('.fixed.inset-0'));

  it('renders the add and edit popups on <body>, outside the spaced page', () => {
    const { container } = renderPage();
    expect(container.firstElementChild).toHaveClass('space-y-6');

    fireEvent.click(screen.getByRole('button', { name: /Add Process Type/ }));
    expect(bodyOverlays()).toHaveLength(1);
    expect(bodyOverlays()[0]).toHaveTextContent('Add Process Type');
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(bodyOverlays()).toHaveLength(0);

    fireEvent.click(within(rowOf('Washed')).getByRole('button', { name: /Edit/ }));
    expect(bodyOverlays()).toHaveLength(1);
    expect(bodyOverlays()[0]).toHaveTextContent('Edit Process Type');
    expect(bodyOverlays()[0]).toContainElement(swatchGroup());
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
  });
});
