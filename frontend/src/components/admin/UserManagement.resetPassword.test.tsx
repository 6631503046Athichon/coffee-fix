import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { User, UserRole } from '../../types';
import { getAllUsers, updateUser } from '../../services/auth/userService';
import UserManagement from './UserManagement';
import { captureAppToasts } from '../../test/captureAppToasts';

// PUT /users/:id applies the password policy to an Admin's reset too
// (8+ characters with an uppercase letter, a lowercase letter and a digit),
// so the generated password must always meet it.

const { auth } = vi.hoisted(() => ({ auth: { currentUser: null as User | null } }));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../services/auth/userService', () => ({
  getAllUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(async () => ({})),
  deleteUser: vi.fn(),
  transferOwnership: vi.fn(),
}));

const owner: User = { id: 'u-owner', name: 'Olive Owner', username: 'olive', roles: [UserRole.Admin], isSuperAdmin: true };
const farmer: User = { id: 'u-farmer', name: 'Fern Farmer', username: 'fern', roles: [UserRole.Farmer] };

afterEach(() => {
  vi.restoreAllMocks();
});

const openResetFor = async (name: string) => {
  render(
    <MemoryRouter>
      <UserManagement />
    </MemoryRouter>,
  );
  await screen.findByText(name);
  fireEvent.click(within(screen.getByText(name).closest('tr')!).getByTitle('Reset password'));
  return screen.getByRole('heading', { name: `Reset Password for ${name}` }).parentElement!;
};

describe('UserManagement password reset', { timeout: 20000 }, () => {
  it('generates a password with an uppercase letter, a lowercase letter and a digit', async () => {
    auth.currentUser = owner;
    vi.mocked(getAllUsers).mockResolvedValue([owner, farmer]);
    render(
      <MemoryRouter>
        <UserManagement />
      </MemoryRouter>,
    );
    await screen.findByText('Fern Farmer');
    fireEvent.click(within(screen.getByText('Fern Farmer').closest('tr')!).getByTitle('Reset password'));

    // The first twelve draws all land on 'a': a password the policy refuses.
    const realRandom = Math.random;
    let draws = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (draws++ < 12 ? 0.4 : realRandom()));

    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    const { password } = vi.mocked(updateUser).mock.calls[0][1] as { password: string };
    expect(password).toHaveLength(12);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
  });
});

// The reset and its Copy button speak through the site (no browser alert box):
// a failed reset stays in the popup with the reason, a copy goes to the toast.
describe('UserManagement password reset feedback', { timeout: 20000 }, () => {
  const toasts = captureAppToasts();

  afterEach(() => {
    // jsdom has no clipboard; the copy tests put a stand-in on navigator.
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it('keeps the popup open with the reason when the reset fails, then retries', async () => {
    auth.currentUser = owner;
    vi.mocked(getAllUsers).mockResolvedValue([owner, farmer]);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(updateUser).mockRejectedValueOnce(new Error('Password must contain a digit'));

    const popup = await openResetFor('Fern Farmer');
    fireEvent.click(within(popup).getByRole('button', { name: 'Reset Password' }));

    expect(await within(popup).findByRole('alert')).toHaveTextContent('Password must contain a digit');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Reset Password for Fern Farmer' })).toBeInTheDocument();

    vi.mocked(updateUser).mockResolvedValueOnce({} as never);
    fireEvent.click(within(popup).getByRole('button', { name: 'Reset Password' }));
    expect(await within(popup).findByText('Password reset successfully!')).toBeInTheDocument();
    expect(within(popup).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('copies the new password and confirms it in the site toast', async () => {
    auth.currentUser = owner;
    vi.mocked(getAllUsers).mockResolvedValue([owner, farmer]);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const popup = await openResetFor('Fern Farmer');
    fireEvent.click(within(popup).getByRole('button', { name: 'Reset Password' }));
    await within(popup).findByText('Password reset successfully!');
    const shown = popup.querySelector('code')!.textContent;

    fireEvent.click(within(popup).getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(toasts).toContainEqual({ type: 'success', message: 'Password copied' }));
    expect(writeText).toHaveBeenCalledWith(shown);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('says so in the toast when the browser refuses the copy', async () => {
    auth.currentUser = owner;
    vi.mocked(getAllUsers).mockResolvedValue([owner, farmer]);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => { throw new Error('denied'); }) },
      configurable: true,
    });

    const popup = await openResetFor('Fern Farmer');
    fireEvent.click(within(popup).getByRole('button', { name: 'Reset Password' }));
    await within(popup).findByText('Password reset successfully!');

    fireEvent.click(within(popup).getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(toasts).toContainEqual({
      type: 'error',
      message: "Couldn't copy the password. Select it and copy it by hand.",
    }));
  });
});
