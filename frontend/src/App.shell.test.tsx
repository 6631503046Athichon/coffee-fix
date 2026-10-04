import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User, UserRole } from './types';
import { api, bulkLoadPhase1, bulkLoadPhase2 } from './services/api';
import { ApiError } from './services/apiError';
import App from './App';

// The signed-in app shell:
// - F46: an unknown address shows a 404 with a way home (the app-level
//   catch-all could never match, so the page was blank);
// - F41: a signed-out visitor is sent to login with the page remembered;
// - F42: reload requests are merged into one reload at a time (each is two
//   rate-limited bulk-load calls), and a failed reload says so;
// - a toast coming or going does not re-render the signed-in app.

const { auth, sidebarProps, dashboardRenders } = vi.hoisted(() => ({
  // What the app shell last passed to the Sidebar.
  sidebarProps: { current: null as Record<string, unknown> | null },
  // How often the page below has rendered.
  dashboardRenders: { count: 0 },
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

const phase1 = {
  farms: [], harvestLots: [], cropYears: [], processTypes: [], activityTypes: [],
  coffeeGrades: [], customers: [], users: [],
};
const phase2 = {
  soilAnalyses: [], weatherRecords: [], gapLogs: [], processingBatches: [],
  parchmentLots: [], greenBeanLots: [], roasterInventory: [], roastBatches: [],
};

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

vi.mock('./components/layout', () => ({
  Sidebar: (props: Record<string, unknown>) => {
    sidebarProps.current = props;
    return null;
  },
  Header: () => null,
}));
vi.mock('./components/auth/Login', async () => {
  const { useLocation } = await import('react-router-dom');
  return {
    default: function LoginProbe() {
      const location = useLocation();
      return <div>LOGIN PAGE from {String((location.state as { from?: string } | null)?.from)}</div>;
    },
  };
});
// A page that asks for a reload three times in a row, as a save that
// refreshes plus the events it fires can.
vi.mock('./components/farmer/FarmerDashboard', async () => {
  const { useDataContext } = await import('./hooks/useDataContext');
  return {
    default: function FarmerDashboardProbe() {
      const { refreshData } = useDataContext();
      dashboardRenders.count += 1;
      return (
        <div>
          <p>FARMER DASHBOARD</p>
          <button
            onClick={() => {
              void refreshData();
              void refreshData();
              void refreshData();
            }}
          >
            refresh three times
          </button>
        </div>
      );
    },
  };
});

const farmer: User = { id: 'u-farmer', name: 'Fern Farmer', username: 'fern', roles: [UserRole.Farmer], isActive: true };

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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  signIn(null);
  sidebarProps.current = null;
  dashboardRenders.count = 0;
  vi.mocked(bulkLoadPhase1).mockResolvedValue(phase1);
  vi.mocked(bulkLoadPhase2).mockResolvedValue(phase2);
  // /data-version: no stamps
  vi.mocked(api.get).mockResolvedValue({});
});

describe('unknown addresses', () => {
  it('show a 404 inside the app with a link home', async () => {
    signIn(farmer);

    render(app('/no-such-page'));

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your dashboard' })).toHaveAttribute('href', '/');
  });

  it('do not replace a real page', async () => {
    signIn(farmer);

    render(app('/farmer-dashboard'));

    expect(await screen.findByText('FARMER DASHBOARD')).toBeInTheDocument();
    expect(screen.queryByText('Page not found')).not.toBeInTheDocument();
  });
});

describe('the sidebar', () => {
  it('is told when the signed-in user is a super admin, so it shows them the Admin sections', async () => {
    signIn({ ...farmer, id: 'u-super', isSuperAdmin: true });

    render(app('/farmer-dashboard'));

    expect(await screen.findByText('FARMER DASHBOARD')).toBeInTheDocument();
    expect(sidebarProps.current).toMatchObject({ currentUserRoles: [UserRole.Farmer], isSuperAdmin: true });
  });

  it('is told a user without the flag is not one', async () => {
    signIn(farmer);

    render(app('/farmer-dashboard'));

    expect(await screen.findByText('FARMER DASHBOARD')).toBeInTheDocument();
    expect(sidebarProps.current).toMatchObject({ isSuperAdmin: false });
  });
});

describe('deep links', () => {
  it('a signed-out visitor goes to login with the page they asked for', async () => {
    render(app('/harvest-lots?lot=HL-7'));

    expect(await screen.findByText('LOGIN PAGE from /harvest-lots?lot=HL-7')).toBeInTheDocument();
  });

  it('shows the loading screen, not the login page, while the session is restored', () => {
    auth.isAuthLoading = true;

    render(app('/harvest-lots'));

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText(/LOGIN PAGE/)).not.toBeInTheDocument();
  });
});

describe('data reloads', () => {
  it('merge a burst of refresh requests into one reload', async () => {
    signIn(farmer);
    render(app('/farmer-dashboard'));
    await waitFor(() => expect(bulkLoadPhase1).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: 'refresh three times' }));

    await waitFor(() => expect(bulkLoadPhase1).toHaveBeenCalledTimes(2));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    expect(bulkLoadPhase1).toHaveBeenCalledTimes(2);
    expect(bulkLoadPhase2).toHaveBeenCalledTimes(2);
  });

  it('wait for a running reload, then run one follow-up for everything asked meanwhile', async () => {
    signIn(farmer);
    const slow = deferred<typeof phase1>();
    vi.mocked(bulkLoadPhase1).mockReturnValueOnce(slow.promise);
    render(app('/farmer-dashboard'));
    await waitFor(() => expect(bulkLoadPhase1).toHaveBeenCalledTimes(1));

    const button = await screen.findByRole('button', { name: 'refresh three times' });
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    expect(bulkLoadPhase1).toHaveBeenCalledTimes(1);

    await act(async () => {
      slow.resolve(phase1);
    });
    await waitFor(() => expect(bulkLoadPhase1).toHaveBeenCalledTimes(2));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    expect(bulkLoadPhase1).toHaveBeenCalledTimes(2);
  });

  it('say so when a reload fails instead of staying silently stale', async () => {
    signIn(farmer);
    render(app('/farmer-dashboard'));
    await waitFor(() => expect(bulkLoadPhase1).toHaveBeenCalledTimes(1));

    vi.mocked(bulkLoadPhase1).mockRejectedValueOnce(new ApiError('Internal error', 500));
    fireEvent.click(await screen.findByRole('button', { name: 'refresh three times' }));

    expect(await screen.findByText(/Could not refresh the data/)).toBeInTheDocument();
  });

  it('when rate-limited, say when the data will refresh and retry then', async () => {
    signIn(farmer);
    render(app('/farmer-dashboard'));
    await waitFor(() => expect(bulkLoadPhase1).toHaveBeenCalledTimes(1));

    vi.mocked(bulkLoadPhase2).mockRejectedValueOnce(
      new ApiError('Too many requests. Please try again later.', 429, { retryAfter: 1 }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'refresh three times' }));

    expect(await screen.findByText(/The data will refresh again in 1 second\./)).toBeInTheDocument();
    await waitFor(() => expect(bulkLoadPhase1).toHaveBeenCalledTimes(3), { timeout: 3000 });
  });

  it('drop the rate-limit retry once a later reload has gone through', async () => {
    signIn(farmer);
    render(app('/farmer-dashboard'));
    await waitFor(() => expect(bulkLoadPhase1).toHaveBeenCalledTimes(1));

    vi.mocked(bulkLoadPhase2).mockRejectedValueOnce(
      new ApiError('Too many requests. Please try again later.', 429, { retryAfter: 1 }),
    );
    const button = await screen.findByRole('button', { name: 'refresh three times' });
    fireEvent.click(button);
    expect(await screen.findByText(/The data will refresh again in 1 second\./)).toBeInTheDocument();

    // A save reloads before the retry is due, and this reload succeeds.
    fireEvent.click(button);
    await waitFor(() => expect(bulkLoadPhase1).toHaveBeenCalledTimes(3));

    // The retry would only spend two more calls of the per-minute budget.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1500));
    });
    expect(bulkLoadPhase1).toHaveBeenCalledTimes(3);
    expect(bulkLoadPhase2).toHaveBeenCalledTimes(3);
  });
});

describe('toasts', () => {
  it('coming up do not re-render the signed-in page', async () => {
    signIn(farmer);
    render(app('/farmer-dashboard'));
    expect(await screen.findByText('FARMER DASHBOARD')).toBeInTheDocument();
    await waitFor(() => expect(bulkLoadPhase2).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const before = dashboardRenders.count;

    // ConnectionToastListener adds a toast; the list changes, the page does not.
    await act(async () => {
      window.dispatchEvent(new Event('backend:disconnected'));
    });

    expect(await screen.findByText(/Backend server is unavailable/)).toBeInTheDocument();
    expect(dashboardRenders.count).toBe(before);
  });
});
