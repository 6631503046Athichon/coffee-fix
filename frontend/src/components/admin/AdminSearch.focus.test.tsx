import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User, UserRole } from '../../types';
import { getAllUsers } from '../../services/auth/userService';
import { CoffeeVariety, getAllCoffeeVarieties } from '../../services/reference/coffeeVarietyService';
import CoffeeVarietiesManager from './CoffeeVarietiesManager';
import UserManagement from './UserManagement';

// The User Management and Coffee Varieties pages swapped the whole page for a
// loading screen while they fetched. Every keystroke in the search box started
// a fetch, so the box was unmounted and lost focus after one letter. The page
// now stays up (the spinner sits where the rows go) and the box searches once,
// 300 ms after the last key.

const { auth } = vi.hoisted(() => ({ auth: { currentUser: null as User | null } }));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../services/auth/userService', () => ({
  getAllUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  transferOwnership: vi.fn(),
}));
vi.mock('../../services/reference/coffeeVarietyService', () => ({
  getAllCoffeeVarieties: vi.fn(),
  addCoffeeVariety: vi.fn(),
  updateCoffeeVariety: vi.fn(),
  deleteCoffeeVariety: vi.fn(),
}));

const DEBOUNCE_MS = 300;
const pastDebounce = () => new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS + 150));

/** A promise the test settles by hand, to hold a fetch open. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};

/** Types into the box one value at a time, checking it stays mounted and focused after each key. */
const typeKeepingFocus = (box: HTMLElement, values: string[]) => {
  box.focus();
  for (const value of values) {
    fireEvent.change(box, { target: { value } });
    expect(box).toBeInTheDocument();
    expect(box).toHaveFocus();
  }
};

const owner: User = { id: 'u-owner', name: 'Olive Owner', username: 'olive', roles: [UserRole.Admin], isSuperAdmin: true };
const farmer: User = { id: 'u-farmer', name: 'Fern Farmer', username: 'fern', roles: [UserRole.Farmer] };
const felix: User = { id: 'u-felix', name: 'Felix Fieldhand', username: 'felix', roles: [UserRole.Farmer] };
const allUsers = [owner, farmer, felix];

const matchUsers = (search?: string) =>
  allUsers.filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()));

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
const allVarieties = [variety('v-1', 'Typica'), variety('v-2', 'Gesha'), variety('v-3', 'Geisha Village')];

const matchVarieties = (search?: string) =>
  allVarieties.filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()));

beforeEach(() => {
  vi.clearAllMocks();
  auth.currentUser = owner;
  vi.mocked(getAllUsers).mockImplementation(async filters => matchUsers(filters?.search));
  vi.mocked(getAllCoffeeVarieties).mockImplementation(async filters => matchVarieties(filters?.search));
});

describe('User Management search', { timeout: 20000 }, () => {
  const SEARCH = 'Search by name, email, or username...';

  const renderPage = () =>
    render(
      <MemoryRouter>
        <UserManagement />
      </MemoryRouter>,
    );

  it('keeps the search box up while users load, with the spinner inside the table', async () => {
    const load = deferred<User[]>();
    vi.mocked(getAllUsers).mockReturnValueOnce(load.promise);
    renderPage();

    expect(screen.getByPlaceholderText(SEARCH)).toBeInTheDocument();
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveTextContent('Loading users...');
    expect(spinner.closest('table')).not.toBeNull();

    load.resolve(allUsers);
    expect(await screen.findByText('Fern Farmer')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('typing several letters keeps focus and searches once, for the whole word', async () => {
    renderPage();
    await screen.findByText('Fern Farmer');
    expect(getAllUsers).toHaveBeenCalledTimes(1);

    const box = screen.getByPlaceholderText(SEARCH);
    typeKeepingFocus(box, ['f', 'fe', 'fer']);
    // Nothing is fetched mid-word.
    expect(getAllUsers).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(getAllUsers).toHaveBeenCalledTimes(2));
    expect(getAllUsers).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'fer' }));
    await waitFor(() => expect(screen.queryByText('Olive Owner')).toBeNull());
    expect(screen.getByText('Fern Farmer')).toBeInTheDocument();
    expect(screen.queryByText('Felix Fieldhand')).toBeNull();
    expect(box).toHaveFocus();
    expect(box).toHaveValue('fer');

    await pastDebounce();
    expect(getAllUsers).toHaveBeenCalledTimes(2);
  });

  it('a slow, older search that answers last does not replace the newer rows', async () => {
    renderPage();
    await screen.findByText('Fern Farmer');

    const slow = deferred<User[]>();
    vi.mocked(getAllUsers).mockImplementation(async filters =>
      filters?.search === 'f' ? slow.promise : matchUsers(filters?.search),
    );

    const box = screen.getByPlaceholderText(SEARCH);
    typeKeepingFocus(box, ['f']);
    fireEvent.keyDown(box, { key: 'Enter' });
    typeKeepingFocus(box, ['fe', 'fer', 'fern']);
    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() => expect(screen.queryByText('Felix Fieldhand')).toBeNull());
    expect(screen.getByText('Fern Farmer')).toBeInTheDocument();

    // The search for 'f' (Fern and Felix) answers only now.
    slow.resolve(matchUsers('f'));
    await pastDebounce();
    expect(screen.queryByText('Felix Fieldhand')).toBeNull();
    expect(screen.getByText('Fern Farmer')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Clear empties the box and lists everyone again', async () => {
    renderPage();
    await screen.findByText('Fern Farmer');

    const box = screen.getByPlaceholderText(SEARCH);
    typeKeepingFocus(box, ['fern']);
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByText('Olive Owner')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(box).toHaveValue('');
    expect(await screen.findByText('Olive Owner')).toBeInTheDocument();
    expect(getAllUsers).toHaveBeenLastCalledWith(expect.objectContaining({ search: undefined }));
  });
});

describe('Coffee Varieties search', { timeout: 20000 }, () => {
  const SEARCH = 'Search varieties...';

  it('keeps the search box up while varieties load, with the spinner in the list area', async () => {
    const load = deferred<CoffeeVariety[]>();
    vi.mocked(getAllCoffeeVarieties).mockReturnValueOnce(load.promise);
    render(<CoffeeVarietiesManager />);

    expect(screen.getByPlaceholderText(SEARCH)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading coffee varieties...');
    // No "nothing found" message while the first load runs.
    expect(screen.queryByText('No coffee varieties found.')).toBeNull();

    load.resolve(allVarieties);
    expect(await screen.findByText('Typica')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('typing several letters keeps focus and searches once, for the whole word', async () => {
    render(<CoffeeVarietiesManager />);
    await screen.findByText('Typica');
    expect(getAllCoffeeVarieties).toHaveBeenCalledTimes(1);

    const box = screen.getByPlaceholderText(SEARCH);
    typeKeepingFocus(box, ['g', 'ge', 'ges']);
    expect(getAllCoffeeVarieties).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(getAllCoffeeVarieties).toHaveBeenCalledTimes(2));
    expect(getAllCoffeeVarieties).toHaveBeenLastCalledWith({ search: 'ges' });
    await waitFor(() => expect(screen.queryByText('Typica')).toBeNull());
    expect(screen.getByText('Gesha')).toBeInTheDocument();
    expect(screen.queryByText('Geisha Village')).toBeNull();
    expect(box).toHaveFocus();
    expect(box).toHaveValue('ges');

    await pastDebounce();
    expect(getAllCoffeeVarieties).toHaveBeenCalledTimes(2);
  });

  it('a slow, older search that answers last does not replace the newer cards', async () => {
    render(<CoffeeVarietiesManager />);
    await screen.findByText('Typica');

    const slow = deferred<CoffeeVariety[]>();
    vi.mocked(getAllCoffeeVarieties).mockImplementation(async filters =>
      filters?.search === 'ge' ? slow.promise : matchVarieties(filters?.search),
    );

    const box = screen.getByPlaceholderText(SEARCH);
    typeKeepingFocus(box, ['g', 'ge']);
    fireEvent.keyDown(box, { key: 'Enter' });
    typeKeepingFocus(box, ['ges', 'gesh', 'gesha']);
    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() => expect(screen.queryByText('Typica')).toBeNull());
    expect(screen.getByText('Gesha')).toBeInTheDocument();

    // The search for 'ge' (Gesha and Geisha Village) answers only now.
    slow.resolve(matchVarieties('ge'));
    await pastDebounce();
    expect(screen.queryByText('Geisha Village')).toBeNull();
    expect(screen.getByText('Gesha')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
