import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataContext } from '../hooks/useDataContext';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { Coffee, Droplets, FlaskConical, TrendingUp, Users, Award, PackageCheck, Package, PlusCircle, BookText, MapPin, Clock, ArrowRight, Calendar, Box } from 'lucide-react';

const StatCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: string | number;
  borderColor: string;
  iconBg: string;
  iconColor: string;
  subtitle?: string;
}> = ({ icon, title, value, borderColor, iconBg, iconColor, subtitle }) => (
  <div className={`bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border-l-4 ${borderColor} border border-gray-200`}>
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${iconBg}`}>
          <div className={iconColor}>
            {icon}
          </div>
        </div>
        <TrendingUp className="h-5 w-5 text-green-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-600 mb-1">{title}</p>
        <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const { data } = useDataContext();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const isAdmin = currentUser?.roles?.includes(UserRole.Admin) || false;
  const isFarmer = currentUser?.roles?.includes(UserRole.Farmer) || false;
  const isProcessor = currentUser?.roles?.includes(UserRole.Processor) || false;
  const isCupper = currentUser?.roles?.includes(UserRole.Cupper) || currentUser?.roles?.includes(UserRole.HeadJudge) || false;
  const isRoaster = currentUser?.roles?.includes(UserRole.Roaster) || false;

  const onlyProcessor = isProcessor && !isAdmin && !isFarmer && !isCupper && !isRoaster;
  const onlyFarmer = isFarmer && !isAdmin && !isProcessor && !isCupper && !isRoaster;
  const onlyCupper = isCupper && !isAdmin && !isProcessor && !isFarmer && !isRoaster;
  const onlyRoaster = isRoaster && !isAdmin && !isProcessor && !isFarmer && !isCupper;

  // Processor crop-year KPIs
  const processorCropYearStats = React.useMemo(() => {
    if (!isProcessor) return null;
    const today = new Date().toISOString().slice(0, 10);

    const hasDataForCrop = (cy: typeof data.cropYears[number]) => {
      if (!cy) return false;
      const harvestsIn = data.harvestLots.some(lot => lot.harvestDate >= cy.startDate && lot.harvestDate <= cy.endDate);
      if (harvestsIn) return true;
      // parchment by linked harvest date
      const harvestById = new Map<string, typeof data.harvestLots[number]>(
        data.harvestLots.map(h => [h.id, h] as const)
      );
      return data.parchmentLots.some(p => {
        const h = harvestById.get(p.harvestLotId);
        return h ? (h.harvestDate >= cy.startDate && h.harvestDate <= cy.endDate) : false;
      });
    };

    // 1) Try crop year that contains today
    let selectedCrop = data.cropYears.find(cy => today >= cy.startDate && today <= cy.endDate)
      || data.cropYears[data.cropYears.length - 1];

    // 2) If no data falls into the selected crop year, pick the most recent crop year that has data
    if (selectedCrop && !hasDataForCrop(selectedCrop)) {
      const withData = [...data.cropYears]
        .filter(cy => hasDataForCrop(cy))
        .sort((a, b) => a.endDate < b.endDate ? 1 : -1);
      if (withData.length > 0) selectedCrop = withData[0];
    }

    if (!selectedCrop) return null;

    const cropHarvests = data.harvestLots.filter(lot => lot.harvestDate >= selectedCrop.startDate && lot.harvestDate <= selectedCrop.endDate);
    const cropYearHarvestCount = cropHarvests.length;
    const cropYearHarvestWeight = cropHarvests.reduce((sum, lot) => sum + lot.weightKg, 0);

    const cropHarvestIds = new Set(cropHarvests.map(h => h.id));
    const cropParchment = data.parchmentLots.filter(p => cropHarvestIds.has(p.harvestLotId));
    const cropParchmentCount = cropParchment.length;
    const cropParchmentWeight = cropParchment.reduce((sum, p) => sum + p.currentWeightKg, 0);

    return {
      cropYearLabel: selectedCrop.year,
      cropYearHarvestCount,
      cropYearHarvestWeight: cropYearHarvestWeight.toFixed(1),
      cropParchmentCount,
      cropParchmentWeight: cropParchmentWeight.toFixed(1),
    };
  }, [data.cropYears, data.harvestLots, data.parchmentLots, isProcessor]);

  const hasAvailableGreenBeans = React.useMemo(
    () => data.greenBeanLots.some(lot => lot.availabilityStatus === 'Available' && lot.currentWeightKg > 0),
    [data.greenBeanLots]
  );

  const hasRoasterInventory = React.useMemo(
    () => data.roasterInventory.some(item => item.roasterId === currentUser?.id && item.remainingWeightKg > 0.01),
    [data.roasterInventory, currentUser?.id]
  );

  const handleRoasterQuickAction = (action: 'claim' | 'logRoast' | 'viewLog') => {
    switch (action) {
      case 'claim':
        if (!hasAvailableGreenBeans) {
          alert('No green bean stock is available to claim right now.');
          return;
        }
        navigate('/roaster', { state: { quickAction: 'claim' } });
        break;
      case 'logRoast':
        if (!hasRoasterInventory) {
          alert('You do not have inventory yet. Claim a lot first.');
          return;
        }
        navigate('/roaster', { state: { quickAction: 'logRoast' } });
        break;
      case 'viewLog':
        navigate('/roaster', { state: { quickAction: 'viewLog' } });
        break;
      default:
        break;
    }
  };

  // Processor operational KPIs (stock, processing, hulling)
  const processorOpsStats = React.useMemo(() => {
    if (!isProcessor) return null;
    const available = data.greenBeanLots.filter(l => l.availabilityStatus === 'Available');
    const availableCount = available.length;
    const availableWeight = available.reduce((sum, l) => sum + l.currentWeightKg, 0);

    const inProcessing = data.processingBatches.filter(b => b.status !== 'Completed').length;
    const completed = data.processingBatches.filter(b => b.status === 'Completed').length;
    const awaitingHulling = data.parchmentLots.filter(p => p.status === 'Awaiting Hulling').length;

    return {
      availableCount,
      availableWeight: availableWeight.toFixed(1),
      inProcessing,
      completed,
      awaitingHulling,
    };
  }, [data.greenBeanLots, data.processingBatches, data.parchmentLots, isProcessor]);

  // Farmer KPIs (scoped to current user)
  const farmerStats = React.useMemo(() => {
    if (!isFarmer) return null;
    const myFarmCount = data.farms.filter(f => f.ownerUserId === currentUser?.id || f.farmerName === currentUser?.name).length;
    const myHarvestLots = data.harvestLots.filter(l => l.farmerName === currentUser?.name);
    const myLotIds = new Set(myHarvestLots.map(l => l.id));
    const myInProcessing = data.processingBatches.filter(b => myLotIds.has(b.harvestLotId) && b.status !== 'Completed').length;
    const myCompleted = data.processingBatches.filter(b => myLotIds.has(b.harvestLotId) && b.status === 'Completed').length;
    return { myFarmCount, myHarvestCount: myHarvestLots.length, myInProcessing, myCompleted };
  }, [data.farms, data.harvestLots, data.processingBatches, currentUser?.id, currentUser?.name, isFarmer]);

  // Cupper KPIs (assigned sessions)
  const cupperStats = React.useMemo(() => {
    if (!isCupper) return null;
    const assigned = data.cuppingSessions.filter(cs => cs.judges.some(j => j.id === currentUser?.id));
    const inScoring = assigned.filter(cs => cs.status === 'Scoring' || cs.status === 'Adjudication').length;
    const finalized = assigned.filter(cs => cs.status === 'Finalized').length;
    const totalSamples = assigned.reduce((sum, cs) => sum + cs.samples.length, 0);
    return { assignedCount: assigned.length, inScoring, finalized, totalSamples };
  }, [data.cuppingSessions, currentUser?.id, isCupper]);

  // Roaster KPIs (own inventory and roasts)
  const roasterStats = React.useMemo(() => {
    if (!isRoaster) return null;
    const myInventory = data.roasterInventory.filter(i => i.roasterId === currentUser?.id);
    const inventoryCount = myInventory.length;
    const remainingKg = myInventory.reduce((sum, i) => sum + i.remainingWeightKg, 0);
    const myRoasts = data.roastBatches.filter(rb => rb.roasterId === currentUser?.id).length;
    const availableLots = data.greenBeanLots.filter(l => l.availabilityStatus === 'Available').length;
    return { inventoryCount, remainingKg: remainingKg.toFixed(1), myRoasts, availableLots };
  }, [data.roasterInventory, data.roastBatches, data.greenBeanLots, currentUser?.id, isRoaster]);

  // Calculate stats based on role
  let activeLots = 0;
  let processingBatches = 0;
  let completedBatches = 0;
  let cuppingSessions = 0;
  let totalUsers = 0;
  let greenBeanLots = 0;

  if (isAdmin) {
    activeLots = data.harvestLots.length;
    processingBatches = data.processingBatches.filter(b => b.status !== 'Completed').length;
    completedBatches = data.processingBatches.filter(b => b.status === 'Completed').length;
    cuppingSessions = data.cuppingSessions.length;
    totalUsers = data.users.length;
    greenBeanLots = data.greenBeanLots.length;
  } else if (isFarmer) {
    const farmerLots = data.harvestLots.filter(lot => lot.farmerName === currentUser?.name);
    activeLots = farmerLots.length;
    const farmerLotIds = farmerLots.map(lot => lot.id);
    processingBatches = data.processingBatches.filter(b =>
      farmerLotIds.includes(b.harvestLotId) && b.status !== 'Completed'
    ).length;
    completedBatches = data.processingBatches.filter(b =>
      farmerLotIds.includes(b.harvestLotId) && b.status === 'Completed'
    ).length;
  } else if (isProcessor) {
    processingBatches = data.processingBatches.filter(b => b.status !== 'Completed').length;
    completedBatches = data.processingBatches.filter(b => b.status === 'Completed').length;
    greenBeanLots = data.greenBeanLots.length;
  } else if (isCupper) {
    cuppingSessions = data.cuppingSessions.length;
    greenBeanLots = data.greenBeanLots.length;
  } else if (isRoaster) {
    greenBeanLots = data.greenBeanLots.filter(lot => lot.availabilityStatus === 'Available').length;
    const roasterInventory = data.roasterInventory.filter(item => item.roasterId === currentUser?.id);
    totalUsers = roasterInventory.length; // Interpreted as roaster inventory count
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Coffee className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Welcome to Coffee Lab</h1>
            <p className="text-gray-600 mt-1">Your central hub for coffee quality and traceability.</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Award className="h-6 w-6 text-blue-600" />
          Overview Statistics
        </h2>

        {/* Processor-only consolidated section */}
        {onlyProcessor ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {processorCropYearStats && (
              <>
                <StatCard
                  icon={<Calendar className="h-6 w-6" />}
                  title={`Crop Year Harvest (${processorCropYearStats.cropYearLabel})`}
                  value={`${processorCropYearStats.cropYearHarvestWeight} kg`}
                  borderColor="border-l-green-500"
                  iconBg="bg-green-100"
                  iconColor="text-green-600"
                  subtitle={`${processorCropYearStats.cropYearHarvestCount} lots cherries`}
                />
                <StatCard
                  icon={<Box className="h-6 w-6" />}
                  title="Parchment (Crop Year)"
                  value={`${processorCropYearStats.cropParchmentWeight} kg`}
                  borderColor="border-l-amber-500"
                  iconBg="bg-amber-100"
                  iconColor="text-amber-600"
                  subtitle={`${processorCropYearStats.cropParchmentCount} lots current`}
                />
              </>
            )}
            {processorOpsStats && (
              <>
                <StatCard
                  icon={<Package className="h-6 w-6" />}
                  title="Available Stock"
                  value={`${processorOpsStats.availableCount} lots`}
                  borderColor="border-l-blue-500"
                  iconBg="bg-blue-100"
                  iconColor="text-blue-600"
                  subtitle={`${processorOpsStats.availableWeight} kg green beans`}
                />
                <StatCard
                  icon={<TrendingUp className="h-6 w-6" />}
                  title="In Processing"
                  value={`${processorOpsStats.inProcessing} batches`}
                  borderColor="border-l-amber-500"
                  iconBg="bg-amber-100"
                  iconColor="text-amber-600"
                  subtitle={`${processorOpsStats.awaitingHulling} awaiting hulling`}
                />
                <StatCard
                  icon={<PackageCheck className="h-6 w-6" />}
                  title="Completed Batches"
                  value={processorOpsStats.completed}
                  borderColor="border-l-green-500"
                  iconBg="bg-green-100"
                  iconColor="text-green-600"
                  subtitle="Ready for next stage"
                />
              </>
            )}
          </div>
        ) : onlyFarmer ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {farmerStats && (
              <>
                <StatCard
                  icon={<Coffee className="h-6 w-6" />}
                  title="My Farms"
                  value={farmerStats.myFarmCount}
                  borderColor="border-l-green-500"
                  iconBg="bg-green-100"
                  iconColor="text-green-600"
                  subtitle="Owned or assigned"
                />
                <StatCard
                  icon={<Coffee className="h-6 w-6" />}
                  title="Active Harvest Lots"
                  value={farmerStats.myHarvestCount}
                  borderColor="border-l-blue-500"
                  iconBg="bg-blue-100"
                  iconColor="text-blue-600"
                  subtitle="Currently tracked"
                />
                <StatCard
                  icon={<Droplets className="h-6 w-6" />}
                  title="Batches in Processing"
                  value={farmerStats.myInProcessing}
                  borderColor="border-l-amber-500"
                  iconBg="bg-amber-100"
                  iconColor="text-amber-600"
                  subtitle={`${farmerStats.myCompleted} completed`}
                />
              </>
            )}
          </div>
        ) : onlyCupper ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cupperStats && (
              <>
                <StatCard
                  icon={<FlaskConical className="h-6 w-6" />}
                  title="Assigned Sessions"
                  value={cupperStats.assignedCount}
                  borderColor="border-l-blue-500"
                  iconBg="bg-blue-100"
                  iconColor="text-blue-600"
                  subtitle={`${cupperStats.totalSamples} samples`}
                />
                <StatCard
                  icon={<TrendingUp className="h-6 w-6" />}
                  title="In Scoring/Adjudication"
                  value={cupperStats.inScoring}
                  borderColor="border-l-amber-500"
                  iconBg="bg-amber-100"
                  iconColor="text-amber-600"
                  subtitle="Active evaluations"
                />
                <StatCard
                  icon={<Award className="h-6 w-6" />}
                  title="Finalized Sessions"
                  value={cupperStats.finalized}
                  borderColor="border-l-green-500"
                  iconBg="bg-green-100"
                  iconColor="text-green-600"
                  subtitle="Results locked"
                />
              </>
            )}
          </div>
        ) : onlyRoaster ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roasterStats && (
              <>
                <StatCard
                  icon={<Package className="h-6 w-6" />}
                  title="My Inventory Items"
                  value={roasterStats.inventoryCount}
                  borderColor="border-l-blue-500"
                  iconBg="bg-blue-100"
                  iconColor="text-blue-600"
                  subtitle={`${roasterStats.remainingKg} kg remaining`
                  }
                />
                <StatCard
                  icon={<PlusCircle className="h-6 w-6" />}
                  title="Total Roast Batches"
                  value={roasterStats.myRoasts}
                  borderColor="border-l-amber-500"
                  iconBg="bg-amber-100"
                  iconColor="text-amber-600"
                  subtitle="All-time"
                />
                <StatCard
                  icon={<Coffee className="h-6 w-6" />}
                  title="Available Lots to Claim"
                  value={roasterStats.availableLots}
                  borderColor="border-l-green-500"
                  iconBg="bg-green-100"
                  iconColor="text-green-600"
                  subtitle="Platform stock"
                />
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(isAdmin || isProcessor) && processorCropYearStats && (
            <>
              <StatCard
                icon={<Calendar className="h-6 w-6" />}
                title={`Crop Year Harvest (${processorCropYearStats.cropYearLabel})`}
                value={`${processorCropYearStats.cropYearHarvestWeight} kg`}
                borderColor="border-l-green-500"
                iconBg="bg-green-100"
                iconColor="text-green-600"
                subtitle={`${processorCropYearStats.cropYearHarvestCount} lots cherries`}
              />
              <StatCard
                icon={<Box className="h-6 w-6" />}
                title="Parchment (Crop Year)"
                value={`${processorCropYearStats.cropParchmentWeight} kg`}
                borderColor="border-l-amber-500"
                iconBg="bg-amber-100"
                iconColor="text-amber-600"
                subtitle={`${processorCropYearStats.cropParchmentCount} lots current`}
              />
            </>
          )}
          {(isAdmin || isFarmer) && (
            <StatCard
              icon={<Coffee className="h-6 w-6" />}
              title="Active Harvest Lots"
              value={activeLots}
              borderColor="border-l-green-500"
              iconBg="bg-green-100"
              iconColor="text-green-600"
              subtitle="Currently tracked"
            />
          )}
          {(isAdmin || isFarmer || isProcessor) && (
            <StatCard
              icon={<Droplets className="h-6 w-6" />}
              title="Batches in Processing"
              value={processingBatches}
              borderColor="border-l-blue-500"
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
              subtitle="Active batches"
            />
          )}
          {(isAdmin || isCupper) && (
            <StatCard
              icon={<FlaskConical className="h-6 w-6" />}
              title="Cupping Sessions"
              value={cuppingSessions}
              borderColor="border-l-blue-500"
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
              subtitle="Total sessions"
            />
          )}
          {(isAdmin || isFarmer || isProcessor) && (
            <StatCard
              icon={<PackageCheck className="h-6 w-6" />}
              title="Completed Batches"
              value={completedBatches}
              borderColor="border-l-amber-500"
              iconBg="bg-amber-100"
              iconColor="text-amber-600"
              subtitle="Ready for next stage"
            />
          )}
          {(isAdmin || isProcessor || isCupper || isRoaster) && (
            <StatCard
              icon={<Coffee className="h-6 w-6" />}
              title={isRoaster ? 'Available Green Beans' : 'Green Bean Lots'}
              value={greenBeanLots}
              borderColor="border-l-green-500"
              iconBg="bg-green-100"
              iconColor="text-green-600"
              subtitle={isRoaster ? 'Ready to claim' : 'Available inventory'}
            />
          )}
          {isAdmin && (
            <StatCard
              icon={<Users className="h-6 w-6" />}
              title="Total Users"
              value={totalUsers}
              borderColor="border-l-blue-500"
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
              subtitle="Active members"
            />
          )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Actions</h2>
        {isRoaster ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[{
              key: 'claim' as const,
              title: 'Quick Claim',
              description: 'Open the claim modal with the next available lot.',
              iconBg: 'bg-green-100 text-green-600',
              icon: <Package className="h-6 w-6" />,
              disabled: !hasAvailableGreenBeans,
            }, {
              key: 'logRoast' as const,
              title: 'Log a Roast',
              description: 'Start a roast entry from your latest inventory.',
              iconBg: 'bg-amber-100 text-amber-600',
              icon: <PlusCircle className="h-6 w-6" />,
              disabled: !hasRoasterInventory,
            }, {
              key: 'viewLog' as const,
              title: 'View Roast Log',
              description: 'Jump to your roasting history and flavor notes.',
              iconBg: 'bg-blue-100 text-blue-600',
              icon: <BookText className="h-6 w-6" />,
              disabled: false,
            }].map(action => (
              <button
                key={action.key}
                type="button"
                onClick={() => !action.disabled && handleRoasterQuickAction(action.key)}
                className={`bg-white border border-gray-200 rounded-lg p-6 text-left shadow-sm transition-shadow ${
                  action.disabled ? 'cursor-not-allowed opacity-60' : 'hover:shadow-md hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
                }`}
                aria-disabled={action.disabled}
              >
                <span className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg ${action.iconBg}`}>
                  {action.icon}
                </span>
                <h3 className="font-bold text-gray-900 mb-1">{action.title}</h3>
                <p className="text-sm text-gray-600">{action.description}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {(isAdmin || isFarmer) && (
              <button
                onClick={() => navigate('/farmer-dashboard')}
                className="bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-lg p-6 text-left transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <Coffee className="h-6 w-6 text-green-600 mb-4" />
                <h3 className="font-bold text-gray-900 mb-1">New Harvest</h3>
                <p className="text-sm text-gray-600">Record a new harvest lot</p>
              </button>
            )}
            {(isAdmin || isProcessor) && (
              <button
                onClick={() => navigate('/processor')}
                className="bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-lg p-6 text-left transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <Droplets className="h-6 w-6 text-blue-600 mb-4" />
                <h3 className="font-bold text-gray-900 mb-1">Start Processing</h3>
                <p className="text-sm text-gray-600">Begin new processing batch</p>
              </button>
            )}
            {(isAdmin || isCupper) && (
              <button
                onClick={() => navigate('/cupping')}
                className="bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-lg p-6 text-left transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <FlaskConical className="h-6 w-6 text-blue-600 mb-4" />
                <h3 className="font-bold text-gray-900 mb-1">New Session</h3>
                <p className="text-sm text-gray-600">Create cupping session</p>
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => navigate('/insights')}
                className="bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-lg p-6 text-left transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <Award className="h-6 w-6 text-blue-600 mb-4" />
                <h3 className="font-bold text-gray-900 mb-1">View Reports</h3>
                <p className="text-sm text-gray-600">Quality insights & analytics</p>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pending Farm Requests - Admin Only */}
      {isAdmin && (() => {
        const pendingRequests = data.farmRequests
          .filter(r => r.status === 'Pending')
          .sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime())
          .slice(0, 5);

        if (pendingRequests.length === 0) return null;

        return (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <MapPin className="h-6 w-6 text-amber-600" />
                Pending Farm Requests
                <span className="inline-flex items-center justify-center px-2.5 py-0.5 text-sm font-bold leading-none text-white bg-red-600 rounded-full">
                  {data.farmRequests.filter(r => r.status === 'Pending').length}
                </span>
              </h2>
              <button
                onClick={() => navigate('/farm-management')}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                View All
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="bg-white border border-amber-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                          <MapPin className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{request.farmName}</h3>
                          <p className="text-sm text-gray-600">{request.location}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1">Owner</p>
                          <p className="text-sm text-gray-900 font-medium">{request.ownerName}</p>
                        </div>
                        {request.altitude && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1">Altitude</p>
                            <p className="text-sm text-gray-900 font-medium">{request.altitude}</p>
                          </div>
                        )}
                        {request.size && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1">Size</p>
                            <p className="text-sm text-gray-900 font-medium">{request.size}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1">Requested</p>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-gray-400" />
                            <p className="text-sm text-gray-900 font-medium">{request.requestDate}</p>
                          </div>
                        </div>
                      </div>

                      {request.reason && (
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-gray-500 mb-1">Reason</p>
                          <p className="text-sm text-gray-700 line-clamp-2">{request.reason}</p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => navigate('/farm-management')}
                      className="ml-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors shadow-sm"
                    >
                      Review
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Dashboard;
