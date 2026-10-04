import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CoffeeVariety,
  addCoffeeVariety,
  getAllCoffeeVarieties,
  updateCoffeeVariety,
} from '../../services/reference/coffeeVarietyService';
import CoffeeVarietiesManager from './CoffeeVarietiesManager';

// Variety names are unique ignoring case and surrounding spaces. On prod the
// page (and the API) accepted "bourbon" while "Bourbon" existed. The popup
// now stops it before saving, like the grade, process type and activity type
// pages do, and checks the whole registry even while a filter narrows the cards.

vi.mock('../../services/reference/coffeeVarietyService', () => ({
  getAllCoffeeVarieties: vi.fn(),
  addCoffeeVariety: vi.fn(),
  updateCoffeeVariety: vi.fn(),
  deleteCoffeeVariety: vi.fn(),
}));

const variety = (id: string, name: string, species = 'Arabica'): CoffeeVariety => ({
  id,
  name,
  species,
  origin: null,
  description: null,
  characteristics: null,
  altitude: null,
  isActive: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
});

let registry: CoffeeVariety[] = [];

const NAME = 'e.g., Typica, Bourbon, Gesha';

const nameBox = () => screen.getByPlaceholderText(NAME);
const submitForm = () => fireEvent.submit(nameBox().closest('form')!);
const editButtonOf = (name: string) =>
  within(screen.getByText(name).closest('div.flex.justify-between') as HTMLElement).getAllByRole('button')[0];

const openAdd = async () => {
  render(<CoffeeVarietiesManager />);
  await screen.findByText('Typica');
  fireEvent.click(screen.getByRole('button', { name: /Add Variety/ }));
};

beforeEach(() => {
  vi.clearAllMocks();
  registry = [variety('v-bourbon', 'Bourbon'), variety('v-typica', 'Typica')];
  vi.mocked(getAllCoffeeVarieties).mockImplementation(async filters =>
    registry.filter(v => !filters?.search || v.name.toLowerCase().includes(filters.search.toLowerCase())),
  );
  vi.mocked(addCoffeeVariety).mockImplementation(async data => variety('v-new', data.name));
  vi.mocked(updateCoffeeVariety).mockImplementation(async (id, data) => variety(id, data.name));
});

describe('Coffee Varieties duplicate names', { timeout: 20000 }, () => {
  it.each(['bourbon', '  BOURBON ', 'bOuRbOn'])('blocks adding "%s" while "Bourbon" exists', async name => {
    await openAdd();
    fireEvent.change(nameBox(), { target: { value: name } });
    submitForm();

    expect(
      await screen.findByText('Coffee variety "Bourbon" already exists (names are not case-sensitive)'),
    ).toBeInTheDocument();
    expect(addCoffeeVariety).not.toHaveBeenCalled();
    // The popup stays open with what was typed.
    expect(nameBox()).toHaveValue(name);
  });

  it('checks the whole registry while a search hides the matching card', async () => {
    render(<CoffeeVarietiesManager />);
    await screen.findByText('Bourbon');

    const box = screen.getByPlaceholderText('Search varieties...');
    fireEvent.change(box, { target: { value: 'typ' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByText('Bourbon')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Add Variety/ }));
    fireEvent.change(nameBox(), { target: { value: 'bourbon' } });
    submitForm();

    expect(await screen.findByText(/Coffee variety "Bourbon" already exists/)).toBeInTheDocument();
    expect(getAllCoffeeVarieties).toHaveBeenLastCalledWith();
    expect(addCoffeeVariety).not.toHaveBeenCalled();
  });

  it('adds a name nobody has yet, trimmed', async () => {
    await openAdd();
    fireEvent.change(nameBox(), { target: { value: '  SL28 ' } });
    submitForm();

    await waitFor(() => expect(addCoffeeVariety).toHaveBeenCalledTimes(1));
    expect(addCoffeeVariety).toHaveBeenCalledWith(expect.objectContaining({ name: 'SL28' }));
    await waitFor(() => expect(screen.queryByPlaceholderText(NAME)).toBeNull());
  });

  it('blocks renaming another variety to an existing name in a different case', async () => {
    render(<CoffeeVarietiesManager />);
    await screen.findByText('Typica');
    fireEvent.click(editButtonOf('Typica'));
    fireEvent.change(nameBox(), { target: { value: 'BOURBON' } });
    submitForm();

    expect(await screen.findByText(/Coffee variety "Bourbon" already exists/)).toBeInTheDocument();
    expect(updateCoffeeVariety).not.toHaveBeenCalled();
  });

  it('lets a variety change only the case of its own name', async () => {
    render(<CoffeeVarietiesManager />);
    await screen.findByText('Bourbon');
    fireEvent.click(editButtonOf('Bourbon'));
    fireEvent.change(nameBox(), { target: { value: 'BOURBON' } });
    submitForm();

    await waitFor(() => expect(updateCoffeeVariety).toHaveBeenCalledTimes(1));
    expect(updateCoffeeVariety).toHaveBeenCalledWith('v-bourbon', expect.objectContaining({ name: 'BOURBON' }));
  });

  it('still saves an older case-duplicate when its name is left alone', async () => {
    registry.push(variety('v-bourbon-lower', 'bourbon'));
    render(<CoffeeVarietiesManager />);
    await screen.findByText('bourbon');
    fireEvent.click(editButtonOf('bourbon'));
    fireEvent.click(screen.getByLabelText('Active (available for selection)'));
    submitForm();

    await waitFor(() => expect(updateCoffeeVariety).toHaveBeenCalledTimes(1));
    expect(updateCoffeeVariety).toHaveBeenCalledWith(
      'v-bourbon-lower',
      expect.objectContaining({ name: 'bourbon', isActive: false }),
    );
  });

  it('saves an older name with stray spaces unchanged without tripping over itself', async () => {
    // " Gesha " was stored before names were trimmed, next to an older
    // case-duplicate. Saving it with its name left alone is not a rename.
    registry.push(variety('v-gesha', ' Gesha '), variety('v-gesha-lower', 'gesha'));
    render(<CoffeeVarietiesManager />);
    await screen.findByText('Gesha');
    fireEvent.click(editButtonOf('Gesha'));
    fireEvent.click(screen.getByLabelText('Active (available for selection)'));
    submitForm();

    await waitFor(() => expect(updateCoffeeVariety).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/already exists/)).toBeNull();
    expect(updateCoffeeVariety).toHaveBeenCalledWith(
      'v-gesha',
      expect.objectContaining({ name: 'Gesha', isActive: false }),
    );
  });

  it('shows the server message when the server refuses the name', async () => {
    vi.mocked(addCoffeeVariety).mockRejectedValueOnce(
      new Error('Coffee variety "Gesha" already exists (names are not case-sensitive)'),
    );
    await openAdd();
    fireEvent.change(nameBox(), { target: { value: 'gesha' } });
    submitForm();

    expect(await screen.findByText(/Coffee variety "Gesha" already exists/)).toBeInTheDocument();
  });
});
