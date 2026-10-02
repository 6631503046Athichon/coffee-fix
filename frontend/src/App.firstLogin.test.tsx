import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User, UserRole } from './types';
import { bulkLoadPhase1 } from './services/api';
import App from './App';

// A new account must replace the credentials the Admin gave it before it can
// use the app: every signed-in URL leads to the setup page while any
// mustChange* flag is set, and a reload of the setup page keeps the user there.

const { auth } = vi.hoisted(() => ({
  auth: {
    currentUser: null as User | null,
    isAuthenticated: false,
    isAuthLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  },
}));

vi.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => auth,
}));

vi.mock('./services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/api')>();
  const pending = () => new Promise<never>(() => {});
  return {
    ...actual,
    api: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) },
    bulkLoadPhase1: vi.fn(pending),
    bulkLoadPhase2: vi.fn(pending),
  };
});
vi.mock('./services/sales/saleOrderService', () => ({ getAllSaleOrders: vi.fn(() => new Promise(() => {})) }));
vi.mock('./services/sales/pricingHistoryService', () => ({ getAllPricingHistory: vi.fn(() => new Promise(() => {})) }));

vi.mock('./components/layout', () => ({ Sidebar: () => null, Header: () => null }));
vi.mock('./components/auth/Login', () => ({ default: () => <div>LOGIN PAGE</div> }));
vi.mock('./components/auth/FirstLoginSetup', () => ({
  FirstLoginSetup: ({ user }: { user: User }) => <div>SETUP PAGE for {user.name}</div>,
}));
vi.mock('./components/farmer/FarmerDashboard', () => ({ default: () => <div>FARMER DASHBOARD</div> }));
vi.mock('./components/processor/ProcessorWorkbench', () => ({ default: () => <div>PROCESSOR WORKBENCH</div> }));

const farmer: User = { id: 'u-farmer', name: 'Fern Farmer', username: 'fern', roles: [UserRole.Farmer], isActive: true };
const newcomer: User = {
  id: 'u-new',
  name: 'New Processor',
  username: 'processor_004',
  roles: [UserRole.Processor],
  isActive: true,
  mustChangePassword: true,
  mustChangeUsername: true,
  mustChangeEmail: false,
};

const signIn = (user: User | null) => {
  auth.currentUser = user;
  auth.isAuthenticated = !!user;
  auth.isAuthLoading = false;
};

const app = (path: string) => (
  <MemoryRouter initialEntries={[path]}>
    <App />
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  signIn(null);
});

describe('first-login setup routing', () => {
  it.each([
    ['/'],
    ['/farmer-dashboard'],
    ['/processor'],
    ['/users'],
  ])('holds a user who still owes setup on the setup page when they open %s', async (path) => {
    signIn(newcomer);

    render(app(path));

    expect(await screen.findByText('SETUP PAGE for New Processor')).toBeInTheDocument();
    expect(screen.queryByText('PROCESSOR WORKBENCH')).not.toBeInTheDocument();
    expect(screen.queryByText('FARMER DASHBOARD')).not.toBeInTheDocument();
  });

  it('does not start loading app data for a user who still owes setup', async () => {
    signIn(newcomer);

    render(app('/processor'));

    await screen.findByText('SETUP PAGE for New Processor');
    expect(bulkLoadPhase1).not.toHaveBeenCalled();
  });

  it.each([
    [{ mustChangePassword: true }],
    [{ mustChangeUsername: true }],
    [{ mustChangeEmail: true }],
  ])('any one flag is enough (%o)', async (flags) => {
    signIn({ ...farmer, ...flags });

    render(app('/farmer-dashboard'));

    expect(await screen.findByText('SETUP PAGE for Fern Farmer')).toBeInTheDocument();
  });

  it('keeps a reload of the setup page on the setup page while the session is restored', async () => {
    auth.isAuthLoading = true;
    const { rerender } = render(app('/first-login-setup'));

    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();

    signIn(newcomer);
    rerender(app('/first-login-setup'));

    expect(await screen.findByText('SETUP PAGE for New Processor')).toBeInTheDocument();
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();
  });

  it('sends a user whose setup is done from the setup page to their dashboard', async () => {
    signIn(farmer);

    render(app('/first-login-setup'));

    expect(await screen.findByText('FARMER DASHBOARD')).toBeInTheDocument();
    expect(screen.queryByText(/SETUP PAGE/)).not.toBeInTheDocument();
  });

  it('lets a user whose setup is done into the app', async () => {
    signIn(farmer);

    render(app('/farmer-dashboard'));

    expect(await screen.findByText('FARMER DASHBOARD')).toBeInTheDocument();
    expect(bulkLoadPhase1).toHaveBeenCalled();
  });

  it('still sends a signed-out visitor of the setup page to login', async () => {
    render(app('/first-login-setup'));

    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });
});
