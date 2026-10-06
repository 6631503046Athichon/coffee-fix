

import React, { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Coffee, Droplets, FlaskConical, Trophy, Users, Search, Lightbulb, Database, ClipboardCheck, ClipboardList, Edit, Flame, MapPin, Tag, Package, Box, Bean, Receipt } from 'lucide-react';

import { UserRole, CuppingSessionType, Customer } from './types';
import { INITIAL_APP_DATA } from './constants';
import { DataContext, SaleOrdersStatus } from './hooks/useDataContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, useToast, useToastActions } from './contexts/ToastContext';
import { connectionManager } from './utils/connectionManager';
import { createRefreshQueue, RefreshQueue } from './utils/refreshQueue';
import { isApiError } from './services/apiError';
import { logger } from './utils/logger';
import { getDashboardPathByRole } from './utils/routing';
import { FIRST_LOGIN_SETUP_PATH, needsFirstLoginSetup } from './utils/firstLogin';
import ToastContainer from './components/common/ToastContainer';
import { getAllSaleOrders } from './services/sales/saleOrderService';
import { getAllPricingHistory } from './services/sales/pricingHistoryService';
import { api, bulkLoadPhase1, bulkLoadPhase2 } from './services/api';
import { transformFarmFromBackend, transformHarvestLotFromBackend, transformSoilAnalysisFromBackend, transformWeatherRecordFromBackend, transformGAPLogFromBackend } from './services/utils/transformers';
import { transformProcessingBatchFromBackend } from './services/processing/processingBatchService';
import { transformParchmentLotFromBackend } from './services/lots/parchmentLotService';
import { transformGreenBeanLotFromBackend } from './services/lots/greenBeanLotService';
import { transformCustomerFromBackend } from './services/sales/customerService';
import { transformInventoryItem, transformRoastBatch } from './services/roaster/roasterService';
import { Sidebar, Header } from './components/layout';
import Login from './components/auth/Login';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import ProtectedRoute from './components/common/ProtectedRoute';
import AuthLoadingScreen from './components/auth/AuthLoadingScreen';
import { loginRedirectState } from './components/auth/loginRedirect';

const FirstLoginSetup = lazy(() =>
  import('./components/auth/FirstLoginSetup').then(module => ({ default: module.FirstLoginSetup }))
);
const ProcessorWorkbench = lazy(() => import('./components/processor/ProcessorWorkbench'));
const ParchmentPage = lazy(() => import('./components/processor/ParchmentTab'));
const CuppingHub = lazy(() => import('./components/cupper/CuppingHub'));
const TraceabilityPage = lazy(() => import('./components/traceability/TraceabilityPage'));
const PublicTraceabilityPage = lazy(() => import('./components/traceability/PublicTraceabilityPage'));
const CompetitionDashboard = lazy(() => import('./components/competition/CompetitionDashboard'));
const FarmerDashboard = lazy(() => import('./components/farmer/FarmerDashboard'));
const HarvestLotDetail = lazy(() => import('./components/farmer/HarvestLotDetail'));
const HarvestLotsManagement = lazy(() => import('./components/farmer/HarvestLotsManagement'));
const QualityInsights = lazy(() => import('./components/insights/QualityInsights'));
const CuppingSessionDetail = lazy(() => import('./components/cupper/CuppingSessionDetail'));
const FarmerDataHub = lazy(() => import('./components/farmer/FarmerDataHub'));
const GAPComplianceHelper = lazy(() => import('./components/farmer/GAPComplianceHelper'));
const CupperScoringSheet = lazy(() => import('./components/cupper/CupperScoringSheet'));
const TraceabilityHub = lazy(() => import('./components/traceability/TraceabilityHub'));
const UserManagement = lazy(() => import('./components/admin/UserManagement'));
const FarmerFarmManagement = lazy(() => import('./components/farmer/FarmManagement'));
const AddFarmPage = lazy(() => import('./components/farmer/AddFarmPage'));
const ActivityTypeManagement = lazy(() => import('./components/admin/ActivityTypeManagement'));
const ProcessTypeManagement = lazy(() => import('./components/admin/ProcessTypeManagement'));
const RoasterWorkbench = lazy(() => import('./components/roaster/RoasterWorkbench'));
const RoastLogbook = lazy(() => import('./components/roaster/RoastLogbook'));
const CoffeeVarietiesManager = lazy(() => import('./components/admin/CoffeeVarietiesManager'));
const CoffeeGradeManagement = lazy(() => import('./components/admin/CoffeeGradeManagement'));
const CustomerManagement = lazy(() => import('./components/sales/CustomerManagement'));
const SalesLog = lazy(() => import('./components/sales/SalesLog'));

const RouteLoader: React.FC = () => (
  <div className="min-h-[16rem] flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mx-auto mb-3"></div>
      <p className="text-sm text-gray-600">Loading page...</p>
    </div>
  </div>
);

const withRouteLoader = (element: React.ReactNode) => (
  <Suspense fallback={<RouteLoader />}>
    {element}
  </Suspense>
);

// Root Redirect Component - redirects to login if not authenticated
const RootRedirect: React.FC = () => {
  const { isAuthenticated, isAuthLoading, currentUser } = useAuth();


  if (isAuthLoading) {
    // Show loading state while checking authentication
    return <AuthLoadingScreen />;
  }

  if (isAuthenticated && currentUser) {
    if (needsFirstLoginSetup(currentUser)) {
      return <Navigate to={FIRST_LOGIN_SETUP_PATH} replace />;
    }
    // Redirect to appropriate dashboard based on user role
    return <Navigate to={getDashboardPathByRole(currentUser.roles)} replace />;
  }

  return <Navigate to="/login" replace />;
};

// First Login Setup Wrapper
const FirstLoginSetupWrapper: React.FC = () => {
  const { currentUser, isAuthLoading } = useAuth();

  // On a reload the session is still being restored: wait for it rather
  // than sending a signed-in user to the login page.
  if (isAuthLoading) {
    return <RouteLoader />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Setup already done: nothing to do here.
  if (!needsFirstLoginSetup(currentUser)) {
    return <Navigate to={getDashboardPathByRole(currentUser.roles)} replace />;
  }

  return withRouteLoader(<FirstLoginSetup user={currentUser} />);
};

// Holds a user who still has to replace the credentials the Admin gave them
// on the setup page: any other signed-in URL redirects there, so the setup
// cannot be skipped by typing an address. Wraps ProtectedRoutes from outside
// so its data loading never starts for such a user.
const RequireFirstLoginDone: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();

  if (needsFirstLoginSetup(currentUser)) {
    return <Navigate to={FIRST_LOGIN_SETUP_PATH} replace />;
  }

  return <>{children}</>;
};

// Listens for backend connection state changes and shows toast notifications
const ConnectionToastListener: React.FC = () => {
  const { addToast } = useToast();

  useEffect(() => {
    const handleDisconnected = () => {
      addToast({
        type: 'warning',
        message: 'Backend server is unavailable. Retrying automatically...',
        duration: 10000,
      });
    };

    const handleConnected = () => {
      addToast({
        type: 'success',
        message: 'Backend server is back online. Refreshing data...',
        duration: 5000,
      });
    };

    window.addEventListener('backend:disconnected', handleDisconnected);
    window.addEventListener('backend:connected', handleConnected);

    return () => {
      window.removeEventListener('backend:disconnected', handleDisconnected);
      window.removeEventListener('backend:connected', handleConnected);
    };
  }, [addToast]);

  return null;
};

// How long a reload request waits so requests made right after it (a save
// that refreshes twice, several quick saves) share one reload.
const REFRESH_MERGE_WINDOW_MS = 300;

// The longest wait before retrying a reload the backend rate-limited.
const MAX_RATE_LIMIT_RETRY_SEC = 60;

/** Seconds the backend asked to wait (its 429 body carries retryAfter). */
const retryAfterSeconds = (data: unknown): number => {
  const value = Number((data as { retryAfter?: unknown } | null)?.retryAfter);
  if (!Number.isFinite(value) || value <= 0) return 30;
  return Math.min(Math.ceil(value), MAX_RATE_LIMIT_RETRY_SEC);
};

// Shown for an address no page answers to, inside the signed-in layout. An
// app-level catch-all can never match one: "/*" takes every path.
const NotFoundPage: React.FC = () => (
  <div className="min-h-[16rem] flex items-center justify-center">
    <div className="text-center">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">404</h1>
      <p className="text-gray-600 mb-4">Page not found</p>
      <Link
        to="/"
        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Go to your dashboard
      </Link>
    </div>
  </div>
);

// Protected routes component
const ProtectedRoutes: React.FC = () => {
  const { isAuthenticated, isAuthLoading, currentUser } = useAuth();
  // Actions only: the toast list would re-render every page on each toast.
  const { addToast } = useToastActions();
  const location = useLocation();
  const [data, setData] = useState(INITIAL_APP_DATA);
  const [isEditing, setIsEditingState] = useState(false);
  const isEditingRef = useRef(false);

  // Set once a signed-in user has been seen here. A sign-out (Logout or a
  // 401) re-renders this on the page being left, before the router reaches
  // /login; that page must not be remembered for the login page, or the next
  // person to sign in on this browser lands on it.
  const [wasSignedIn, setWasSignedIn] = useState(isAuthenticated);
  if (isAuthenticated && !wasSignedIn) {
    setWasSignedIn(true);
  }

  // Function to set editing state - pauses auto-refresh while editing
  const setIsEditing = useCallback((editing: boolean) => {
    isEditingRef.current = editing;
    setIsEditingState(editing);
  }, []);

  // Cached data versions for smart auto-refresh (detects if data changed before reloading)
  const lastVersionsRef = useRef<Record<string, string | null>>({});

  // Sales are loaded (and their version stamps watched) only for the roles
  // that have a sales log. Read through a ref so the loader keeps its identity.
  const canSeeSalesRef = useRef(false);
  const canSeeSales = !!currentUser && (
    !!currentUser.isSuperAdmin ||
    currentUser.roles.includes(UserRole.Admin) ||
    currentUser.roles.includes(UserRole.Roaster)
  );
  useEffect(() => {
    canSeeSalesRef.current = canSeeSales;
  });
  const [saleOrdersStatus, setSaleOrdersStatus] = useState<SaleOrdersStatus>('loading');

  // Helper function to merge backend data with mock data (backend data takes priority for same IDs)
  const mergeArrays = useCallback(<T extends { id: string }>(backendData: T[], mockData: T[]): T[] => {
    const backendIds = new Set(backendData.map(item => item.id));
    const uniqueMockData = mockData.filter(item => !backendIds.has(item.id));
    return [...backendData, ...uniqueMockData];
  }, []);

  // Load data from backend API in one parallel burst, then a single state update.
  //
  // These three groups do not feed each other, so they all go out together.
  // Chaining them cost three sequential round-trips before any data could
  // render, and each leg carries ~1s of fixed request overhead in production
  // regardless of how little work the query itself does.
  const loadDataFromBackend = useCallback(async () => {
    try {
      // Sales endpoints may fail without sinking the whole load, so they carry
      // their own catch and report through a flag. Invoices have no screen, so
      // they are not loaded at all.
      let saleOrdersLoadFailed = false;
      const saleOrdersRequest = canSeeSalesRef.current
        ? getAllSaleOrders().catch((err) => {
            saleOrdersLoadFailed = true;
            console.warn('Failed to load sale orders from backend:', err);
            return null;
          })
        : Promise.resolve([]);
      let salesDataLoadFailed = false;
      const salesRequest = Promise.all([
        saleOrdersRequest,
        getAllPricingHistory(),
      ]).catch((err) => {
        salesDataLoadFailed = true;
        console.warn('Failed to load sales data from backend:', err);
        return null;
      });

      // Version stamps are advisory — losing them only means the next
      // auto-refresh reloads instead of short-circuiting on "nothing changed".
      const versionsRequest = api
        .get<Record<string, string | null>>('/data-version')
        .catch((versionError) => {
          console.warn('Failed to sync data versions after reload:', versionError);
          return null;
        });

      // bulk-load stays bare: without it there is nothing to render, so let it
      // reject straight into the outer catch.
      const [sales, phase1, phase2, versions] = await Promise.all([
        salesRequest,
        bulkLoadPhase1(),
        bulkLoadPhase2(),
        versionsRequest,
      ]);

      const loadedSaleOrders = sales?.[0] ?? null;
      const storedPricingHistory: any[] = sales?.[1] ?? [];
      const saleOrdersFailed = saleOrdersLoadFailed || salesDataLoadFailed || !loadedSaleOrders;

      const storedFarms = phase1.farms.map(transformFarmFromBackend);
      const storedHarvestLots = phase1.harvestLots.map(transformHarvestLotFromBackend);
      const storedCustomers = phase1.customers.map(transformCustomerFromBackend);
      const storedSoilAnalyses = phase2.soilAnalyses.map(transformSoilAnalysisFromBackend);
      const storedWeatherRecords = phase2.weatherRecords.map(transformWeatherRecordFromBackend);
      const storedGAPLogs = phase2.gapLogs.map(transformGAPLogFromBackend);
      const storedProcessingBatches = phase2.processingBatches.map(transformProcessingBatchFromBackend);
      const storedParchmentLots = phase2.parchmentLots.map(transformParchmentLotFromBackend);
      const storedGreenBeanLots = phase2.greenBeanLots.map(transformGreenBeanLotFromBackend);
      const storedRoasterInventory = phase2.roasterInventory.map(transformInventoryItem);
      const storedRoastBatches = phase2.roastBatches.map(transformRoastBatch);
      // Single state update with no intermediate flicker
      setData(prev => ({
        ...prev,
        farms: mergeArrays(storedFarms as any, INITIAL_APP_DATA.farms),
        harvestLots: mergeArrays(storedHarvestLots as any, INITIAL_APP_DATA.harvestLots),
        cropYears: phase1.cropYears,
        processTypes: phase1.processTypes,
        activityTypes: phase1.activityTypes,
        coffeeGrades: phase1.coffeeGrades ?? prev.coffeeGrades,
        customers: mergeArrays(storedCustomers, INITIAL_APP_DATA.customers),
        users: phase1.users,
        saleOrders: loadedSaleOrders && !saleOrdersFailed ? loadedSaleOrders : prev.saleOrders,
        invoices: prev.invoices,
        pricingHistory: salesDataLoadFailed ? prev.pricingHistory : storedPricingHistory,
        soilAnalyses: storedSoilAnalyses,
        weatherRecords: storedWeatherRecords,
        gapLogs: storedGAPLogs,
        processingBatches: mergeArrays(storedProcessingBatches, INITIAL_APP_DATA.processingBatches),
        parchmentLots: mergeArrays(storedParchmentLots, INITIAL_APP_DATA.parchmentLots),
        greenBeanLots: mergeArrays(storedGreenBeanLots, INITIAL_APP_DATA.greenBeanLots),
        roasterInventory: storedRoasterInventory,
        roastBatches: storedRoastBatches,
      }));

      // A failed load keeps the rows already shown, so the log only reports
      // 'failed' while no load has ever succeeded.
      setSaleOrdersStatus((s) => (saleOrdersFailed ? (s === 'ok' ? 'ok' : 'failed') : 'ok'));

      // Same rule as before: a sales failure clears the stamps so the next
      // cycle does a full reload, and a version-fetch failure leaves the
      // previous stamps untouched rather than wiping them.
      if (saleOrdersLoadFailed || salesDataLoadFailed) {
        lastVersionsRef.current = {};
      } else if (versions) {
        lastVersionsRef.current = versions;
      }
    } catch (error) {
      lastVersionsRef.current = {};
      setSaleOrdersStatus((s) => (s === 'ok' ? 'ok' : 'failed'));
      console.error('Failed to load data from backend:', error);
      // The rows already shown stay; runRefresh tells the user they may be
      // out of date.
      throw error;
    }
  }, [mergeArrays]);

  // Every reload goes through one queue (utils/refreshQueue): one at a time,
  // bursts merged. A reload is two rate-limited bulk-load calls, and saves,
  // events, the auto-refresh and reconnects used to start their own.
  const refreshQueueRef = useRef<RefreshQueue | null>(null);
  const rateLimitRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestRefresh = useCallback(
    (options?: { immediate?: boolean }) => refreshQueueRef.current?.request(options) ?? Promise.resolve(),
    [],
  );

  // A failed reload used to leave the screen stale without a word.
  const reportRefreshFailure = useCallback((error: unknown) => {
    // Session expired: the auth:logout handler takes the user to login.
    if (isApiError(error) && error.status === 401) return;
    // Backend unreachable: ConnectionToastListener already says so, and the
    // reconnect reloads.
    if (!connectionManager.isConnected()) return;

    if (isApiError(error) && error.status === 429) {
      const waitSec = retryAfterSeconds(error.data);
      if (!rateLimitRetryRef.current) {
        rateLimitRetryRef.current = setTimeout(() => {
          rateLimitRetryRef.current = null;
          void requestRefresh({ immediate: true });
        }, waitSec * 1000);
      }
      addToast({
        type: 'warning',
        message: `Too many refreshes in a short time. The data will refresh again in ${waitSec} second${waitSec === 1 ? '' : 's'}.`,
        duration: 8000,
      });
      return;
    }

    addToast({
      type: 'error',
      message: 'Could not refresh the data. What you see may be out of date.',
      duration: 8000,
    });
  }, [addToast, requestRefresh]);

  const runRefresh = useCallback(async () => {
    try {
      await loadDataFromBackend();
      // A reload went through, so a rate-limit retry still waiting would
      // only spend two more bulk-load calls of the per-minute budget.
      if (rateLimitRetryRef.current) {
        clearTimeout(rateLimitRetryRef.current);
        rateLimitRetryRef.current = null;
      }
    } catch (error) {
      reportRefreshFailure(error);
    }
  }, [loadDataFromBackend, reportRefreshFailure]);

  useEffect(() => {
    const queue = createRefreshQueue(runRefresh, REFRESH_MERGE_WINDOW_MS);
    refreshQueueRef.current = queue;
    return () => {
      queue.dispose();
      if (refreshQueueRef.current === queue) refreshQueueRef.current = null;
      if (rateLimitRetryRef.current) {
        clearTimeout(rateLimitRetryRef.current);
        rateLimitRetryRef.current = null;
      }
    };
  }, [runRefresh]);

  // Refresh data function - can be called from any component. Resolves once
  // a reload started after the call has finished; never rejects.
  const refreshData = useCallback(() => requestRefresh(), [requestRefresh]);

  // Weather auto-fetch now runs entirely on the backend (see
  // backend/src/lib/weatherScheduler.ts, started from instrumentation.ts).
  // The old browser-side loop only collected data while someone had the
  // app open — records arrived at random times and two open tabs raced
  // each other into duplicate rows. The server collects on schedule 24/7;
  // the frontend just reads.

  // Debounced refresh to prevent burst reloads from rapid events
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile nav state lives here because the Header owns the toggle button
  // and the Sidebar owns the drawer it opens.
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const toggleMobileNav = useCallback(() => setIsMobileNavOpen((open) => !open), []);
  const closeMobileNav = useCallback(() => setIsMobileNavOpen(false), []);
  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      void requestRefresh({ immediate: true });
    }, 2000);
  }, [requestRefresh]);

  // Load data from backend API on mount
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) {
      // Do not load data if not authenticated or still loading auth
      return;
    }

    // Initial load
    void requestRefresh({ immediate: true });

    // Auto-refresh every 2 minutes with smart change detection
    // First checks /api/data-version for changes, only reloads if data actually changed
    const refreshInterval = setInterval(async () => {
      if (isEditingRef.current || !connectionManager.isConnected()) return;
      try {
        const versions = await api.get<Record<string, string | null>>('/data-version');
        // Sale and invoice stamps only matter to roles that load sales;
        // without this every recorded sale would reload every user.
        const hasChanges = Object.keys(versions).some(
          key =>
            (canSeeSalesRef.current || (key !== 'saleOrders' && key !== 'invoices')) &&
            versions[key] !== lastVersionsRef.current[key]
        );
        if (hasChanges) {
          await requestRefresh({ immediate: true });
        }
      } catch {
        // If version check fails, skip this refresh cycle
      }
    }, 120000);

    // Listen for localStorage changes from other components (for activity types and process types that still use localStorage)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && (
        e.key === 'coffee_lab_process_types' ||
        e.key === 'coffee_lab_activity_types'
      )) {
        debouncedRefresh();
      }
    };

    // Custom event for same-window localStorage changes
    const handleCustomStorageUpdate = () => {
      debouncedRefresh();
    };

    // Custom event for data refresh
    const handleDataRefresh = () => {
      debouncedRefresh();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('localStorageUpdate', handleCustomStorageUpdate);
    window.addEventListener('dataRefresh', handleDataRefresh);

    return () => {
      clearInterval(refreshInterval);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('localStorageUpdate', handleCustomStorageUpdate);
      window.removeEventListener('dataRefresh', handleDataRefresh);
    };
  }, [isAuthenticated, isAuthLoading, requestRefresh, debouncedRefresh]);

  // Connection recovery: auto-refresh when backend reconnects
  // Recovery polling is started/stopped internally by connectionManager.reportFailure()/reportSuccess()
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return;

    const handleReconnected = () => {
      void requestRefresh({ immediate: true });
    };

    window.addEventListener('backend:connected', handleReconnected);

    return () => {
      connectionManager.stopRecoveryPolling();
      window.removeEventListener('backend:connected', handleReconnected);
    };
  }, [isAuthenticated, isAuthLoading, requestRefresh]);

  const contextValue = useMemo(
    () => ({ data, setData, refreshData, setIsEditing, isEditing, saleOrdersStatus }),
    [data, setData, refreshData, setIsEditing, isEditing, saleOrdersStatus],
  );

  const navItems = useMemo(() => {
    let competitionAdminHref = '/cupping'; // Default to hub

    if (currentUser) {
        const judgeSessions = data.cuppingSessions.filter(s =>
            s.type === CuppingSessionType.Competition &&
            s.judges.some(j => j.id === currentUser.id)
        );

        // Prioritize active sessions for the current user
        const activeSession = judgeSessions.find(s => s.status === 'Adjudication' || s.status === 'Scoring');

        if (activeSession) {
            competitionAdminHref = `/competition/${activeSession.id}`;
        } else if (judgeSessions.length > 0) {
            // Fallback to the most recent session they are part of
            const sortedSessions = [...judgeSessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            competitionAdminHref = `/competition/${sortedSessions[0].id}`;
        }
    } else {
        // Fallback for when currentUser is not yet set, link to the first competition
        const firstCompetition = data.cuppingSessions.find(s => s.type === CuppingSessionType.Competition);
        if (firstCompetition) {
            competitionAdminHref = `/competition/${firstCompetition.id}`;
        }
    }

    return [
      // Farmer Section
      { name: 'Farmer Dashboard', href: '/farmer-dashboard', icon: Coffee, roles: [UserRole.Farmer, UserRole.Admin], section: 'farmer' },
      { name: 'Harvest Lots', href: '/harvest-lots', icon: Package, roles: [UserRole.Farmer, UserRole.Admin], section: 'farmer' },
      { name: 'Farm Management', href: '/farmer-farms', icon: MapPin, roles: [UserRole.Farmer, UserRole.Admin], section: 'farmer' },
      { name: 'Data Hub', href: '/farmer-data-hub', icon: Database, roles: [UserRole.Farmer, UserRole.Admin], section: 'farmer' },
      { name: 'GAP Helper', href: '/gap-compliance', icon: ClipboardCheck, roles: [UserRole.Farmer, UserRole.Admin], section: 'farmer' },

      // Processor Section
      { name: 'Processor Workbench', href: '/processor', icon: Droplets, roles: [UserRole.Processor, UserRole.Admin], section: 'processor' },
      { name: 'Parchment', href: '/parchment', icon: Box, roles: [UserRole.Processor, UserRole.Admin], section: 'processor' },
      { name: 'Traceability Hub', href: '/traceability', icon: Search, roles: [UserRole.Admin, UserRole.Processor], section: 'processor' },
      { name: 'Quality Insights', href: '/insights', icon: Lightbulb, roles: [UserRole.Processor], section: 'processor' },

      // Quality & Cupping Section
      { name: 'Competition Admin', href: competitionAdminHref, icon: Trophy, roles: [UserRole.HeadJudge, UserRole.Cupper, UserRole.Admin], section: 'cupping' },
      { name: 'Quality Insights', href: '/insights', icon: Lightbulb, roles: [UserRole.Admin], section: 'cupping' },

      // Roaster Section
      { name: 'Roaster Workbench', href: '/roaster', icon: Flame, roles: [UserRole.Roaster, UserRole.Admin], section: 'roaster' },
      { name: 'Roast Logbook', href: '/roast-logbook', icon: ClipboardList, roles: [UserRole.Roaster, UserRole.Admin], section: 'roaster' },
      { name: 'Sales', href: '/sales', icon: Receipt, roles: [UserRole.Roaster, UserRole.Admin], section: 'roaster' },
      { name: 'Customer Management', href: '/customers', icon: Users, roles: [UserRole.Admin, UserRole.Roaster], section: 'roaster' },
      { name: 'Quality Insights', href: '/insights', icon: Lightbulb, roles: [UserRole.Roaster], section: 'roaster' },

      // Administration Section (Admin only)
      { name: 'User Management', href: '/users', icon: Users, roles: [UserRole.Admin], section: 'admin' },
      { name: 'Activity Types', href: '/activity-types', icon: Tag, roles: [UserRole.Admin], section: 'admin' },
      { name: 'Process Types', href: '/process-types', icon: Coffee, roles: [UserRole.Admin], section: 'admin' },
      { name: 'Coffee Varieties', href: '/coffee-varieties', icon: Coffee, roles: [UserRole.Admin], section: 'admin' },
      { name: 'Coffee Grades', href: '/coffee-grades', icon: Bean, roles: [UserRole.Admin], section: 'admin' },
    ];
  }, [currentUser, data.cuppingSessions]);

  if (isAuthLoading) {
    return <AuthLoadingScreen />;
  }


  if (!isAuthenticated) {
    // Remember the page so the login page can come back to it (a deep link
    // survives a slow session check on a cold start, or opening it signed out).
    // Not after a sign-out here: see wasSignedIn.
    return (
      <Navigate
        to="/login"
        replace
        state={wasSignedIn ? undefined : loginRedirectState(location)}
      />
    );
  }

  return (
    <DataContext.Provider value={contextValue}>
      <div className="flex h-screen bg-gray-50 text-gray-800">
        <Sidebar
          navItems={navItems}
          currentUserRoles={currentUser?.roles || [UserRole.Farmer]}
          isSuperAdmin={!!currentUser?.isSuperAdmin}
          isMobileOpen={isMobileNavOpen}
          onMobileClose={closeMobileNav}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden w-full lg:w-auto">
          <Header
            currentUserRoles={currentUser?.roles || [UserRole.Farmer]}
            onToggleMobileNav={toggleMobileNav}
          />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-3 sm:p-4 md:p-6 lg:p-8 lg:pt-4">
            <Routes>
              <Route path="/farmer" element={<Navigate to="/farmer-dashboard" replace />} />
              <Route path="/dashboard" element={<Navigate to="/farmer-dashboard" replace />} />
              <Route
                path="/processor"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Processor, UserRole.Admin]}>
                    {withRouteLoader(<ProcessorWorkbench currentUser={currentUser!} />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/parchment"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Processor, UserRole.Admin]}>
                    {withRouteLoader(<ParchmentPage currentUser={currentUser!} />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/roaster"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Roaster, UserRole.Admin]}>
                    {withRouteLoader(<RoasterWorkbench currentUser={currentUser!} />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/roast-logbook"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Roaster, UserRole.Admin]}>
                    {withRouteLoader(<RoastLogbook currentUser={currentUser!} />)}
                  </ProtectedRoute>
                }
              />
              <Route path="/cupping" element={withRouteLoader(<CuppingHub />)} />
              <Route path="/cupping/:id" element={withRouteLoader(<CuppingSessionDetail currentUser={currentUser!} />)} />
              <Route path="/scoring" element={withRouteLoader(<CupperScoringSheet currentUser={currentUser!} />)} />
              <Route
                path="/insights"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Processor, UserRole.Roaster, UserRole.Admin]}>
                    {withRouteLoader(<QualityInsights />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/competition/:id"
                element={withRouteLoader(<CompetitionDashboard currentUserRoles={currentUser?.roles || [UserRole.Farmer]} />)}
              />
              <Route
                path="/traceability"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Admin, UserRole.Processor]}>
                    {withRouteLoader(<TraceabilityHub />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/traceability/:lotId"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Admin, UserRole.Processor]}>
                    {withRouteLoader(<TraceabilityPage />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Admin]}>
                    {withRouteLoader(<UserManagement />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customers"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Admin, UserRole.Roaster]}>
                    {withRouteLoader(<CustomerManagement />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Admin, UserRole.Roaster]}>
                    {withRouteLoader(<SalesLog currentUser={currentUser!} />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/farmer-farms"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    {withRouteLoader(<FarmerFarmManagement />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/farmer-farms/add"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    {withRouteLoader(<AddFarmPage />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/farmer-farms/edit/:farmId"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    {withRouteLoader(<AddFarmPage />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/activity-types"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Admin]}>
                    {withRouteLoader(<ActivityTypeManagement />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/process-types"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Admin]}>
                    {withRouteLoader(<ProcessTypeManagement />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/coffee-varieties"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Admin]}>
                    {withRouteLoader(<CoffeeVarietiesManager />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/coffee-grades"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Admin]}>
                    {withRouteLoader(<CoffeeGradeManagement />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/farmer-dashboard"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    {withRouteLoader(<FarmerDashboard />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/farmer-dashboard/:lotId"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    {withRouteLoader(<HarvestLotDetail />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/harvest-lots"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    {withRouteLoader(<HarvestLotsManagement />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/farmer-data-hub"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    {withRouteLoader(<FarmerDataHub currentUser={currentUser!} />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gap-compliance"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    {withRouteLoader(<GAPComplianceHelper />)}
                  </ProtectedRoute>
                }
              />
              {/* Any other address: a 404 inside the app, with a way home */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </DataContext.Provider>
  );
};

const App: React.FC = () => {
  // No app-level data state: internal traceability moved inside
  // ProtectedRoutes (auth-gated). The only public-facing trace view is
  // `/trace/:publicId` which fetches its own data from the public API.
  useEffect(() => {
    const preventNumberInputWheelChange = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'number') return;
      if (document.activeElement !== target) return;

      event.preventDefault();
      target.blur();
    };

    document.addEventListener('wheel', preventNumberInputWheelChange, {
      capture: true,
      passive: false,
    });

    return () => {
      document.removeEventListener('wheel', preventNumberInputWheelChange, true);
    };
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <ToastContainer />
        <ConnectionToastListener />
        <Routes>
          {/* Public Routes - no authentication required */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/first-login-setup" element={<FirstLoginSetupWrapper />} />
          <Route
            path="/trace/:publicId"
            element={withRouteLoader(<PublicTraceabilityPage />)}
          />
          {/* Root route - redirect to login if not authenticated */}
          <Route path="/" element={<RootRedirect />} />
          {/* Protected Routes - requires authentication. Unknown addresses
              land here too and get ProtectedRoutes' 404 (NotFoundPage). */}
          <Route path="/*" element={<RequireFirstLoginDone><ProtectedRoutes /></RequireFirstLoginDone>} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
