

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { Coffee, Droplets, FlaskConical, Trophy, Users, Search, BarChart, Lightbulb, Database, ClipboardCheck, Edit, Flame, MapPin, Tag, Package } from 'lucide-react';

import { UserRole, User, CuppingSessionType } from './types';
import { MOCK_DATA } from './constants';
import { DataContext } from './hooks/useDataContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { getAllSoilAnalyses, initializeSoilAnalyses } from './services/soilAnalysisService';
import { getAllWeatherRecords, initializeWeatherRecords } from './services/weatherService';
import { getAllCustomers, getAllSaleOrders, getAllInvoices, getAllPricingHistory, initializeCustomers, initializeSaleOrders, initializeInvoices, initializePricingHistory } from './services/salesService';
import { getAllActivityTypes, initializeActivityTypes } from './services/activityTypeService';
import { getAllProcessTypes, initializeProcessTypes, resetProcessTypes } from './services/processTypeService';
import { getAllFarms, initializeFarms } from './services/farmService';
import { getAllHarvestLots } from './services/harvestLotService';
import { getAllGAPLogs } from './services/gapLogService';
import { getAllCropYears } from './services/cropYearService';
import { Sidebar, Header } from './components/layout';
import Login from './components/auth/Login';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import { FirstLoginSetup } from './components/auth/FirstLoginSetup';
import ProcessorWorkbench from './components/processor/ProcessorWorkbench';
import CuppingHub from './components/cupper/CuppingHub';
import TraceabilityPage from './components/TraceabilityPage';
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
import ActivityTypeManagement from './components/admin/ActivityTypeManagement';
import ProcessTypeManagement from './components/admin/ProcessTypeManagement';
import RoasterWorkbench from './components/roaster/RoasterWorkbench';
import CoffeeVarietiesManager from './components/CoffeeVarietiesManager';

// Root Redirect Component - redirects to login if not authenticated
const RootRedirect: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
    
  
  if (isLoading) {
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
  
  if (isAuthenticated) {
    return <Navigate to="/farmer-dashboard" replace />;
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

// Protected routes component
const ProtectedRoutes: React.FC = () => {
  const { isAuthenticated, isLoading, currentUser } = useAuth();
  const [data, setData] = useState(MOCK_DATA);

  // Load data from backend API
  const loadDataFromBackend = async () => {
    try {
      // Load all data from backend API
      const [storedFarms, storedSoilAnalyses, storedWeatherRecords, storedHarvestLots, storedGAPLogs, storedActivityTypes, storedProcessTypes, storedCustomers, storedSaleOrders, storedInvoices, storedPricingHistory, storedCropYears] = await Promise.all([
        getAllFarms(),
        getAllSoilAnalyses(),
        getAllWeatherRecords(),
        getAllHarvestLots(),
        getAllGAPLogs(),
        getAllActivityTypes(),
        getAllProcessTypes(),
        getAllCustomers(),
        getAllSaleOrders(),
        getAllInvoices(),
        getAllPricingHistory(),
        getAllCropYears(),
      ]);

      setData(prev => ({
        ...prev,
        farms: storedFarms.length > 0 ? storedFarms : prev.farms,
        soilAnalyses: storedSoilAnalyses.length > 0 ? storedSoilAnalyses : prev.soilAnalyses,
        weatherRecords: storedWeatherRecords.length > 0 ? storedWeatherRecords : prev.weatherRecords,
        harvestLots: storedHarvestLots.length > 0 ? storedHarvestLots : prev.harvestLots,
        gapLogs: storedGAPLogs.length > 0 ? storedGAPLogs : prev.gapLogs,
        activityTypes: storedActivityTypes.length > 0 ? storedActivityTypes : prev.activityTypes,
        processTypes: storedProcessTypes.length > 0 ? storedProcessTypes : prev.processTypes,
        customers: storedCustomers.length > 0 ? storedCustomers : prev.customers,
        saleOrders: storedSaleOrders.length > 0 ? storedSaleOrders : prev.saleOrders,
        invoices: storedInvoices.length > 0 ? storedInvoices : prev.invoices,
        pricingHistory: storedPricingHistory.length > 0 ? storedPricingHistory : prev.pricingHistory,
        cropYears: storedCropYears, // Always use backend data, even if empty
      }));
    } catch (error) {
      console.error('Failed to load data from backend:', error);
      // Fallback to MOCK_DATA if API fails
    }
  };

  // Refresh data function - can be called from any component
  const refreshData = useCallback(async () => {
    await loadDataFromBackend();
  }, []);

  // Load data from backend API on mount
  useEffect(() => {
    // Initial load
    loadDataFromBackend();

    // Auto-refresh every 30 seconds
    const refreshInterval = setInterval(() => {
      loadDataFromBackend();
    }, 30000);

    // Listen for localStorage changes from other components (for activity types and process types that still use localStorage)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && (
        e.key === 'coffee_lab_process_types' ||
        e.key === 'coffee_lab_activity_types'
      )) {
        // Reload only activity types and process types from localStorage
        // Other data will be reloaded from backend on next mount
        loadDataFromBackend();
      }
    };

    // Custom event for same-window localStorage changes
    const handleCustomStorageUpdate = () => {
      // Reload data from backend when localStorage is updated
      loadDataFromBackend();
    };

    // Custom event for data refresh
    const handleDataRefresh = () => {
      loadDataFromBackend();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('localStorageUpdate', handleCustomStorageUpdate);
    window.addEventListener('dataRefresh', handleDataRefresh);

    return () => {
      clearInterval(refreshInterval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('localStorageUpdate', handleCustomStorageUpdate);
      window.removeEventListener('dataRefresh', handleDataRefresh);
    };
  }, []);

  const contextValue = useMemo(() => ({ data, setData, refreshData }), [data, setData]);

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
      { name: 'Farmer Dashboard', href: '/farmer-dashboard', icon: Coffee, roles: [UserRole.Farmer, UserRole.Admin] },
      { name: 'Harvest Lots', href: '/harvest-lots', icon: Package, roles: [UserRole.Farmer, UserRole.Admin] },
      { name: 'Farm Management', href: '/farmer-farms', icon: MapPin, roles: [UserRole.Farmer, UserRole.Admin] },
      { name: 'Data Hub', href: '/farmer-data-hub', icon: Database, roles: [UserRole.Farmer, UserRole.Admin] },
      { name: 'GAP Helper', href: '/gap-compliance', icon: ClipboardCheck, roles: [UserRole.Farmer, UserRole.Admin] },

      // Processor Section
      { name: 'Processor Workbench', href: '/processor', icon: Droplets, roles: [UserRole.Processor, UserRole.Admin] },

      // Quality & Cupping Section
      { name: 'Cupping Lab', href: '/cupping', icon: FlaskConical, roles: [UserRole.Processor, UserRole.Roaster, UserRole.HeadJudge, UserRole.Admin] },
      { name: 'Scoring Sheet', href: '/scoring', icon: Edit, roles: [UserRole.Cupper, UserRole.Admin] },
      { name: 'Competition Admin', href: competitionAdminHref, icon: Trophy, roles: [UserRole.HeadJudge, UserRole.Cupper, UserRole.Admin] },
      { name: 'Quality Insights', href: '/insights', icon: Lightbulb, roles: [UserRole.Roaster, UserRole.Processor, UserRole.Admin] },

      // Roaster Section
      { name: 'Roaster Workbench', href: '/roaster', icon: Flame, roles: [UserRole.Roaster, UserRole.Admin] },

      // Traceability & Admin
      { name: 'Traceability Hub', href: '/traceability', icon: Search, roles: [UserRole.Admin, UserRole.Processor] },
      { name: 'User Management', href: '/users', icon: Users, roles: [UserRole.Admin] },
      { name: 'Activity Types', href: '/activity-types', icon: Tag, roles: [UserRole.Admin] },
      { name: 'Process Types', href: '/process-types', icon: Coffee, roles: [UserRole.Admin] },
      { name: 'Coffee Varieties', href: '/coffee-varieties', icon: Coffee, roles: [UserRole.Admin] },
    ];
  }, [currentUser, data.cuppingSessions]);

  if (isLoading) {
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
        <div className="flex-1 flex flex-col overflow-hidden w-full lg:w-auto">
          <Header currentUserRoles={currentUser?.roles || [UserRole.Farmer]} onRoleChange={() => {}} />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-3 sm:p-4 md:p-6 lg:p-8 pt-16 lg:pt-4">
            <Routes>
              <Route path="/farmer" element={<Navigate to="/farmer-dashboard" replace />} />
              <Route path="/dashboard" element={<Navigate to="/farmer-dashboard" replace />} />
              <Route path="/processor" element={<ProcessorWorkbench currentUser={currentUser!} />} />
              <Route path="/roaster" element={<RoasterWorkbench currentUser={currentUser!} />} />
              <Route path="/cupping" element={<CuppingHub />} />
              <Route path="/cupping/:id" element={<CuppingSessionDetail currentUser={currentUser!} />} />
              <Route path="/scoring" element={<CupperScoringSheet currentUser={currentUser!} />} />
              <Route path="/insights" element={<QualityInsights />} />
              <Route path="/competition/:id" element={<CompetitionDashboard currentUserRoles={currentUser?.roles || [UserRole.Farmer]} />} />
              <Route path="/traceability" element={<TraceabilityHub />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/farmer-farms" element={<FarmerFarmManagement />} />
              <Route path="/activity-types" element={<ActivityTypeManagement />} />
              <Route path="/process-types" element={<ProcessTypeManagement />} />
              <Route path="/coffee-varieties" element={<CoffeeVarietiesManager />} />
              <Route path="/farmer-dashboard" element={<FarmerDashboard />} />
              <Route path="/farmer-dashboard/:lotId" element={<HarvestLotDetail />} />
              <Route path="/harvest-lots" element={<HarvestLotsManagement />} />
              <Route path="/farmer-data-hub" element={<FarmerDataHub currentUser={currentUser!} />} />
              <Route path="/gap-compliance" element={<GAPComplianceHelper />} />
            </Routes>
          </main>
        </div>
      </div>
    </DataContext.Provider>
  );
};

const App: React.FC = () => {
  const [data] = useState(MOCK_DATA);
  const contextValue = useMemo(() => ({ data, setData: () => {} }), [data]);

  // Initialize localStorage on app mount (only for non-API data)
  useEffect(() => {
    // Only initialize localStorage for data that doesn't come from API
    // API data (farms, soil analyses, weather records, harvest lots, GAP logs) 
    // will be loaded in ProtectedRoutes component
    initializeActivityTypes(MOCK_DATA.activityTypes);
    // Force: reset to exactly the three defaults on each refresh (per request)
    resetProcessTypes(MOCK_DATA.processTypes);
    initializeCustomers(MOCK_DATA.customers);
    initializeSaleOrders(MOCK_DATA.saleOrders);
    initializeInvoices(MOCK_DATA.invoices);
    initializePricingHistory(MOCK_DATA.pricingHistory);
  }, []);

  return (
    <AuthProvider>
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
    </AuthProvider>
  );
};

export default App;