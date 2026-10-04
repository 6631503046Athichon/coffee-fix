import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User, UserRole } from '../../types';
import { getAllUsers } from '../../services/auth/userService';
import UserManagement from './UserManagement';

// User Management has its own Admin check on top of the route's. A super
// admin counts as an Admin whatever roles the account lists, so it must not
// bounce them to the farmer dashboard.

const { auth } = vi.hoisted(() => ({ auth: { currentUser: null as User | null } }));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../services/auth/userService', () => ({
  getAllUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  transferOwnership: vi.fn(),
}));

const root: User = { id: 'u-root', name: 'Rita Root', username: 'rita', roles: [UserRole.Processor], isSuperAdmin: true };
const farmer: User = { id: 'u-farmer', name: 'Fern Farmer', username: 'fern', roles: [UserRole.Farmer] };

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/users']}>
      <Routes>
        <Route path="/users" element={<UserManagement />} />
        <Route path="/farmer-dashboard" element={<div>FARMER DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAllUsers).mockResolvedValue([root, farmer]);
});

describe('User Management for a super admin', () => {
  it('stays open for a super admin without the Admin role', async () => {
    auth.currentUser = root;
    renderPage();

    expect(await screen.findByText('Fern Farmer')).toBeInTheDocument();
    expect(screen.queryByText('FARMER DASHBOARD')).not.toBeInTheDocument();
  });

  it('still sends a non-admin away', async () => {
    auth.currentUser = farmer;
    renderPage();

    expect(await screen.findByText('FARMER DASHBOARD')).toBeInTheDocument();
  });
});
