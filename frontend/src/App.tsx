

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { Coffee, Droplets, FlaskConical, Trophy, Users, Search, Lightbulb, Database, ClipboardCheck, Edit, Flame, MapPin, Tag, Package, Box } from 'lucide-react';

import { UserRole, CuppingSessionType, Customer } from './types';
import { MOCK_DATA } from './constants';
import { DataContext } from './hooks/useDataContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { connectionManager } from './utils/connectionManager';
import ToastContainer from './components/common/ToastContainer';
import { initWeatherAutoFetchService, stopWeatherAutoFetchService } from './services/weatherAutoFetchService';
import { getAllSaleOrders } from './services/saleOrderService';
import { getAllInvoices } from './services/invoiceService';
import { getAllPricingHistory } from './services/pricingHistoryService';
import { api, bulkLoadPhase1, bulkLoadPhase2 } from './services/api';
import { transformFarmFromBackend, transformHarvestLotFromBackend, transformSoilAnalysisFromBackend, transformWeatherRecordFromBackend, transformGAPLogFromBackend } from './services/utils/transformers';
import { transformProcessingBatchFromBackend } from './services/processingBatchService';
import { transformParchmentLotFromBackend } from './services/parchmentLotService';
import { transformGreenBeanLotFromBackend } from './services/greenBeanLotService';
import { transformCustomerFromBackend } from './services/customerService';
import { transformInventoryItem, transformRoastBatch } from './services/roasterService';
import { Sidebar, Header } from './components/layout';
import Login from './components/auth/Login';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import { FirstLoginSetup } from './components/auth/FirstLoginSetup';
import ProtectedRoute from './components/common/ProtectedRoute';
import ProcessorWorkbench from './components/processor/ProcessorWorkbench';
import ParchmentPage from './components/processor/ParchmentTab';
import CuppingHub from './components/cupper/CuppingHub';
import TraceabilityPage from './components/TraceabilityPage';
import PublicTraceabilityPage from './components/PublicTraceabilityPage';
import CompetitionDashboard from './components/competition/CompetitionDashboard';
import FarmerDashboard from './components/farmer/FarmerDashboard';
import HarvestLotDetail from './components/farmer/HarvestLotDetail';
import HarvestLotsManagement from './components/farmer/HarvestLotsManagement';
import QualityInsights from './components/QualityInsights';
import CuppingSessionDetail from './components/cupper/CuppingSessionDetail';
import FarmerDataHub from './components/farmer/FarmerDataHub';
import GAPComplianceHelper from './components/farmer/GAPComplianceHelper';
import CupperScoringSheet from './components/cupper/CupperScoringSheet';
import TraceabilityHub from './components/TraceabilityHub';
import UserManagement from './components/UserManagement';
import FarmerFarmManagement from './components/farmer/FarmManagement';
import AddFarmPage from './components/farmer/AddFarmPage';
import ActivityTypeManagement from './components/admin/ActivityTypeManagement';
import ProcessTypeManagement from './components/admin/ProcessTypeManagement';
import RoasterWorkbench from './components/roaster/RoasterWorkbench';
import CoffeeVarietiesManager from './components/CoffeeVarietiesManager';
import CustomerManagement from './components/CustomerManagement';

// Helper function to get dashboard path by role
const getDashboardPathByRole = (roles: UserRole[]): string => {
  if (roles.includes(UserRole.Processor)) return '/processor';
  if (roles.includes(UserRole.Roaster)) return '/roaster';
  if (roles.includes(UserRole.Cupper) || roles.includes(UserRole.HeadJudge)) return '/cupping';
  if (roles.includes(UserRole.Farmer) || roles.includes(UserRole.Admin)) return '/farmer-dashboard';
  return '/farmer-dashboard'; // default
};

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

  return <FirstLoginSetup user={currentUser} />;
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
  const [data, setData] = useState(MOCK_DATA);
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
      try {
        [storedSaleOrders, storedInvoices, storedPricingHistory] = await Promise.all([
          getAllSaleOrders(),
          getAllInvoices(),
          getAllPricingHistory(),
        ]);
      } catch (err) {
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

      // Single state update — no intermediate flicker
      setData(prev => ({
        ...prev,
        farms: mergeArrays(storedFarms as any, MOCK_DATA.farms),
        harvestLots: mergeArrays(storedHarvestLots as any, MOCK_DATA.harvestLots),
        cropYears: phase1.cropYears.length > 0 ? phase1.cropYears : prev.cropYears,
        processTypes: phase1.processTypes.length > 0 ? phase1.processTypes : prev.processTypes,
        activityTypes: phase1.activityTypes.length > 0 ? phase1.activityTypes : prev.activityTypes,
        customers: mergeArrays(storedCustomers, MOCK_DATA.customers),
        users: phase1.users.length > 0 ? phase1.users : prev.users,
        saleOrders: storedSaleOrders.length > 0 ? storedSaleOrders : prev.saleOrders,
        invoices: storedInvoices.length > 0 ? storedInvoices : prev.invoices,
        pricingHistory: storedPricingHistory.length > 0 ? storedPricingHistory : prev.pricingHistory,
        soilAnalyses: storedSoilAnalyses.length > 0 ? storedSoilAnalyses : prev.soilAnalyses,
        weatherRecords: storedWeatherRecords.length > 0 ? storedWeatherRecords : prev.weatherRecords,
        gapLogs: storedGAPLogs.length > 0 ? storedGAPLogs : prev.gapLogs,
        processingBatches: mergeArrays(storedProcessingBatches, MOCK_DATA.processingBatches),
        parchmentLots: mergeArrays(storedParchmentLots, MOCK_DATA.parchmentLots),
        greenBeanLots: mergeArrays(storedGreenBeanLots, MOCK_DATA.greenBeanLots),
        roasterInventory: storedRoasterInventory.length > 0 ? storedRoasterInventory : prev.roasterInventory,
        roastBatches: storedRoastBatches.length > 0 ? storedRoastBatches : prev.roastBatches,
      }));
    } catch (error) {
      console.error('Failed to load data from backend:', error);
      // Fallback to MOCK_DATA if API fails
    }
  }, [mergeArrays]);

  // Refresh data function - can be called from any component
  const refreshData = useCallback(async () => {
    await loadDataFromBackend();
  }, [loadDataFromBackend]);

  // Initialize weather auto-fetch service using farm data from DB
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading || data.farms.length === 0) return;

    // Initialize the service with farm data and callback to update weather records
    initWeatherAutoFetchService(
      data.farms,
      (newRecord) => {
        console.log('[App] Weather auto-fetch saved new record:', newRecord);
        setData(prev => ({
          ...prev,
          weatherRecords: [newRecord, ...prev.weatherRecords.filter(r => r.id !== newRecord.id)]
        }));
      },
      currentUser?.id
    );

    return () => {
      stopWeatherAutoFetchService();
    };
  }, [isAuthenticated, isAuthLoading, data.farms]);

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
          lastVersionsRef.current = versions;
          loadDataFromBackend();
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

  const contextValue = useMemo(() => ({ data, setData, refreshData, setIsEditing, isEditing }), [data, setData, setIsEditing, isEditing]);

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
                    <ProcessorWorkbench currentUser={currentUser!} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/parchment"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Processor, UserRole.Admin]}>
                    <ParchmentPage currentUser={currentUser!} />
                  </ProtectedRoute>
                }
              />
              <Route path="/roaster" element={<ProtectedRoute allowedRoles={[UserRole.Roaster, UserRole.Admin]}><RoasterWorkbench currentUser={currentUser!} /></ProtectedRoute>} />
              <Route path="/cupping" element={<CuppingHub />} />
              <Route path="/cupping/:id" element={<CuppingSessionDetail currentUser={currentUser!} />} />
              <Route path="/scoring" element={<CupperScoringSheet currentUser={currentUser!} />} />
              <Route
                path="/insights"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Processor, UserRole.Roaster, UserRole.Admin]}>
                    <QualityInsights />
                  </ProtectedRoute>
                }
              />
              <Route path="/competition/:id" element={<CompetitionDashboard currentUserRoles={currentUser?.roles || [UserRole.Farmer]} />} />
              <Route path="/traceability" element={<ProtectedRoute allowedRoles={[UserRole.Admin, UserRole.Processor]}><TraceabilityHub /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute allowedRoles={[UserRole.Admin]}><UserManagement /></ProtectedRoute>} />
              <Route path="/customers" element={<ProtectedRoute allowedRoles={[UserRole.Admin, UserRole.Roaster]}><CustomerManagement /></ProtectedRoute>} />
              <Route
                path="/farmer-farms"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    <FarmerFarmManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/farmer-farms/add"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    <AddFarmPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/farmer-farms/edit/:farmId"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    <AddFarmPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/activity-types" element={<ProtectedRoute allowedRoles={[UserRole.Admin]}><ActivityTypeManagement /></ProtectedRoute>} />
              <Route path="/process-types" element={<ProtectedRoute allowedRoles={[UserRole.Admin]}><ProcessTypeManagement /></ProtectedRoute>} />
              <Route path="/coffee-varieties" element={<ProtectedRoute allowedRoles={[UserRole.Admin]}><CoffeeVarietiesManager /></ProtectedRoute>} />
              <Route
                path="/farmer-dashboard"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    <FarmerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/farmer-dashboard/:lotId"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    <HarvestLotDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/harvest-lots"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    <HarvestLotsManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/farmer-data-hub"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    <FarmerDataHub currentUser={currentUser!} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/gap-compliance"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.Farmer, UserRole.Admin]}>
                    <GAPComplianceHelper />
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
  const [data] = useState(MOCK_DATA);
  const contextValue = useMemo(() => ({ data, setData: () => {}, refreshData: async () => {}, setIsEditing: () => {}, isEditing: false }), [data]);

  // Initialize localStorage on app mount (only for non-API data)
  // No localStorage initialization needed — all data comes from API

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
            path="/traceability/:lotId"
            element={
              <DataContext.Provider value={contextValue}>
                <TraceabilityPage />
              </DataContext.Provider>
            }
          />
          <Route
            path="/trace/:publicId"
            element={<PublicTraceabilityPage />}
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
