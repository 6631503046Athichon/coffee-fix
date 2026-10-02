import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { User, UserRole } from '../../types';
import { getAllUsers, updateUser } from '../../services/auth/userService';
import UserManagement from './UserManagement';

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
