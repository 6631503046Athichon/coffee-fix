

import React, { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { Coffee, Droplets, FlaskConical, Trophy, Users, Search, Lightbulb, Database, ClipboardCheck, Edit, Flame, MapPin, Tag, Package, Box } from 'lucide-react';

import { UserRole, CuppingSessionType, Customer } from './types';
import { INITIAL_APP_DATA } from './constants';
import { DataContext } from './hooks/useDataContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { connectionManager } from './utils/connectionManager';
import { logger } from './utils/logger';
import { getDashboardPathByRole } from './utils/routing';
import ToastContainer from './components/common/ToastContainer';
import { getAllSaleOrders } from './services/sales/saleOrderService';
import { getAllInvoices } from './services/sales/invoiceService';
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
const CoffeeVarietiesManager = lazy(() => import('./components/admin/CoffeeVarietiesManager'));
const CustomerManagement = lazy(() => import('./components/sales/CustomerManagement'));

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
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && currentUser) {
    // Redirect to appropriate dashboard based on user role
    return <Navigate to={getDashboardPathByRole(currentUser.roles)} replace />;
  }

  return <Navigate to="/login" replace />;
};

// First Login Setup Wrapper
const FirstLoginSetupWrapper: React.FC = () => {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return withRouteLoader(<FirstLoginSetup user={currentUser} />);
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

// Protected routes component
const ProtectedRoutes: React.FC = () => {
  const { isAuthenticated, isAuthLoading, currentUser } = useAuth();
  const [data, setData] = useState(INITIAL_APP_DATA);
  const [isEditing, setIsEditingState] = useState(false);
  const isEditingRef = useRef(false);

  // Function to set editing state - pauses auto-refresh while editing
  const setIsEditing = useCallback((editing: boolean) => {
    isEditingRef.current = editing;
    setIsEditingState(editing);
  }, []);

  // Cached data versions for smart auto-refresh (detects if data changed before reloading)
  const lastVersionsRef = useRef<Record<string, string | null>>({});

  // Helper function to merge backend data with mock data (backend data takes priority for same IDs)
  const mergeArrays = useCallback(<T extends { id: string }>(backendData: T[], mockData: T[]): T[] => {
    const backendIds = new Set(backendData.map(item => item.id));
    const uniqueMockData = mockData.filter(item => !backendIds.has(item.id));
    return [...backendData, ...uniqueMockData];
  }, []);

  // Load data from backend API using parallel bulk-loads then a single state update
  const loadDataFromBackend = useCallback(async () => {
    try {
      // Load sale orders, invoices, pricing history from backend API
      let storedSaleOrders: any[] = [];
      let storedInvoices: any[] = [];
      let storedPricingHistory: any[] = [];
      let salesDataLoadFailed = false;
      try {
        [storedSaleOrders, storedInvoices, storedPricingHistory] = await Promise.all([
          getAllSaleOrders(),
          getAllInvoices(),
          getAllPricingHistory(),
        ]);
      } catch (err) {
        salesDataLoadFailed = true;
        console.warn('Failed to load sales data from backend:', err);
      }

      // Run both phases in parallel for faster load
      const [phase1, phase2] = await Promise.all([bulkLoadPhase1(), bulkLoadPhase2()]);

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
        customers: mergeArrays(storedCustomers, INITIAL_APP_DATA.customers),
        users: phase1.users,
        saleOrders: salesDataLoadFailed ? prev.saleOrders : storedSaleOrders,
        invoices: salesDataLoadFailed ? prev.invoices : storedInvoices,
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

      if (salesDataLoadFailed) {
        lastVersionsRef.current = {};
      } else {
        try {
          lastVersionsRef.current = await api.get<Record<string, string | null>>('/data-version');
        } catch (versionError) {
          console.warn('Failed to sync data versions after reload:', versionError);
        }
      }
    } catch (error) {
      lastVersionsRef.current = {};
      console.error('Failed to load data from backend:', error);
      // Fallback to INITIAL_APP_DATA if API fails
    }
  }, [mergeArrays]);

  // Refresh data function - can be called from any component
  const refreshData = useCallback(async () => {
    await loadDataFromBackend();
  }, [loadDataFromBackend]);

  // Weather auto-fetch now runs entirely on the backend (see
  // backend/src/lib/weatherScheduler.ts, started from instrumentation.ts).
  // The old browser-side loop only collected data while someone had the
  // app open — records arrived at random times and two open tabs raced
  // each other into duplicate rows. The server collects on schedule 24/7;
  // the frontend just reads.

  // Debounced refresh to prevent burst reloads from rapid events
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      loadDataFromBackend();
    }, 2000);
  }, [loadDataFromBackend]);

  // Load data from backend API on mount
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) {
      // Do not load data if not authenticated or still loading auth
      return;
    }

    // Initial load
    loadDataFromBackend();

    // Auto-refresh every 2 minutes with smart change detection
    // First checks /api/data-version for changes, only reloads if data actually changed
    const refreshInterval = setInterval(async () => {
      if (isEditingRef.current || !connectionManager.isConnected()) return;
      try {
        const versions = await api.get<Record<string, string | null>>('/data-version');
        const hasChanges = Object.keys(versions).some(
          key => versions[key] !== lastVersionsRef.current[key]
        );
        if (hasChanges) {
          await loadDataFromBackend();
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
  }, [isAuthenticated, isAuthLoading, loadDataFromBackend, debouncedRefresh]);

  // Connection recovery: auto-refresh when backend reconnects
  // Recovery polling is started/stopped internally by connectionManager.reportFailure()/reportSuccess()
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return;

    const handleReconnected = () => {
      loadDataFromBackend();
    };

    window.addEventListener('backend:connected', handleReconnected);

    return () => {
      connectionManager.stopRecoveryPolling();
      window.removeEventListener('backend:connected', handleReconnected);
    };
  }, [isAuthenticated, isAuthLoading, loadDataFromBackend]);

  const contextValue = useMemo(() => ({ data, setData, refreshData, setIsEditing, isEditing }), [data, setData, refreshData, setIsEditing, isEditing]);

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
      { name: 'Customer Management', href: '/customers', icon: Users, roles: [UserRole.Admin, UserRole.Roaster], section: 'roaster' },
      { name: 'Quality Insights', href: '/insights', icon: Lightbulb, roles: [UserRole.Roaster], section: 'roaster' },

      // Administration Section (Admin only)
      { name: 'User Management', href: '/users', icon: Users, roles: [UserRole.Admin], section: 'admin' },
      { name: 'Activity Types', href: '/activity-types', icon: Tag, roles: [UserRole.Admin], section: 'admin' },
      { name: 'Process Types', href: '/process-types', icon: Coffee, roles: [UserRole.Admin], section: 'admin' },
      { name: 'Coffee Varieties', href: '/coffee-varieties', icon: Coffee, roles: [UserRole.Admin], section: 'admin' },
    ];
  }, [currentUser, data.cuppingSessions]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }


  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <DataContext.Provider value={contextValue}>
      <div className="flex h-screen bg-gray-50 text-gray-800">
        <Sidebar navItems={navItems} currentUserRoles={currentUser?.roles || [UserRole.Farmer]} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden w-full lg:w-auto">
          <Header currentUserRoles={currentUser?.roles || [UserRole.Farmer]} />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-3 sm:p-4 md:p-6 lg:p-8 pt-16 lg:pt-4">
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
          {/* Protected Routes - requires authentication */}
          <Route path="/*" element={<ProtectedRoutes />} />
          {/* 404 Fallback */}
          <Route path="*" element={
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
                <p className="text-gray-600 mb-6">Page not found</p>
                <Link to="/login" className="text-blue-600 hover:text-blue-700">
                  Go to Login
                </Link>
              </div>
            </div>
          } />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
