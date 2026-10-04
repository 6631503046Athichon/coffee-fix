import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User, UserRole } from './types';
import { api, bulkLoadPhase1, bulkLoadPhase2 } from './services/api';
import { authService } from './services/auth/authService';
import App from './App';

// F41 follow-up: the page a signed-out visitor asked for is remembered for
// the login page, but a page left behind by signing out is not. Otherwise
// the next person to sign in on this browser lands on the previous user's
// last page (and sees its address and query) instead of their dashboard.
//
// Real AuthProvider, Login, Header and app shell; only the services, the
// Sidebar and the two pages are stand-ins.

const alice: User = { id: 'u-alice', name: 'Alice Farmer', username: 'alice', roles: [UserRole.Farmer], isActive: true };
const bob: User = { id: 'u-bob', name: 'Bob Farmer', username: 'bob', roles: [UserRole.Farmer], isActive: true };

vi.mock('./services/auth/authService', () => {
  const authService = {
    getCurrentUser: vi.fn(async () => null),
    login: vi.fn(),
    logout: vi.fn(async () => {}),
  };
  return { authService, default: authService };
});

vi.mock('./services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/api')>();
  const pending = () => new Promise<never>(() => {});
  return {
    ...actual,
    api: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) },
    bulkLoadPhase1: vi.fn(),
    bulkLoadPhase2: vi.fn(),
  };
});
vi.mock('./services/sales/saleOrderService', () => ({ getAllSaleOrders: vi.fn(async () => []) }));
vi.mock('./services/sales/pricingHistoryService', () => ({ getAllPricingHistory: vi.fn(async () => []) }));

vi.mock('./components/layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./components/layout')>()),
  Sidebar: () => null,
}));
vi.mock('./components/farmer/FarmerDashboard', () => ({ default: () => <p>FARMER DASHBOARD</p> }));
vi.mock('./components/farmer/HarvestLotsManagement', () => ({ default: () => <p>HARVEST LOTS</p> }));

const signInWithForm = async (identifier: string) => {
  fireEvent.change(await screen.findByTestId('login-email'), { target: { value: identifier } });
  fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'Secret123' } });
  await act(async () => {
    fireEvent.click(screen.getByTestId('login-submit'));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.getCurrentUser).mockResolvedValue(null);
  vi.mocked(authService.login).mockImplementation(async ({ identifier }) => (identifier === 'bob' ? bob : alice));
  vi.mocked(authService.logout).mockResolvedValue(undefined);
  vi.mocked(bulkLoadPhase1).mockResolvedValue({
    farms: [], harvestLots: [], cropYears: [], processTypes: [], activityTypes: [],
    coffeeGrades: [], customers: [], users: [],
  });
  vi.mocked(bulkLoadPhase2).mockResolvedValue({
    soilAnalyses: [], weatherRecords: [], gapLogs: [], processingBatches: [],
    parchmentLots: [], greenBeanLots: [], roasterInventory: [], roastBatches: [],
  });
  // /data-version: no stamps
  vi.mocked(api.get).mockResolvedValue({});
});

describe('signing out and signing in as someone else', () => {
  it('a deep link opened signed out still leads there after signing in', async () => {
    render(
      <MemoryRouter initialEntries={['/harvest-lots?lot=HL-7']}>
        <App />
      </MemoryRouter>,
    );

    await signInWithForm('alice');

    expect(await screen.findByText('HARVEST LOTS')).toBeInTheDocument();
  });

  it('the next user lands on their dashboard, not the page the last one signed out from', async () => {
    render(
      <MemoryRouter initialEntries={['/harvest-lots?lot=HL-7']}>
        <App />
      </MemoryRouter>,
    );
    await signInWithForm('alice');
    expect(await screen.findByText('HARVEST LOTS')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Logout/ }));
    });
    expect(await screen.findByTestId('login-submit')).toBeInTheDocument();

    await signInWithForm('bob');

    expect(await screen.findByText('FARMER DASHBOARD')).toBeInTheDocument();
    expect(screen.queryByText('HARVEST LOTS')).not.toBeInTheDocument();
  });

  it('the same holds when the session ends with a 401', async () => {
    render(
      <MemoryRouter initialEntries={['/harvest-lots?lot=HL-7']}>
        <App />
      </MemoryRouter>,
    );
    await signInWithForm('alice');
    expect(await screen.findByText('HARVEST LOTS')).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new Event('auth:logout'));
    });
    expect(await screen.findByTestId('login-submit')).toBeInTheDocument();

    await signInWithForm('bob');

    expect(await screen.findByText('FARMER DASHBOARD')).toBeInTheDocument();
    expect(screen.queryByText('HARVEST LOTS')).not.toBeInTheDocument();
  });
});
