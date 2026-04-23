import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { HarvestLot, Farm, CropYear, UserRole } from '../../types';
import { BarChart, Weight, Wind, Award, MapPin, Leaf, TrendingUp, Clock, ArrowRight, ChevronRight, Flame, Droplets, FlaskConical } from 'lucide-react';
import DatePicker from '../common/DatePicker';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PageHeader } from '../common/PageHeader';
import { Alert } from '../common/Alert';
import { StatCard } from '../common/StatCard';
import { generateHarvestLotId } from '../../utils/idGenerator';
import { toFixed2 } from '../../utils/formatters';



// Coffee varieties list
const COFFEE_VARIETIES = [
  'Gesha',
  'Caturra',
  'Bourbon',
  'Typica',
  'SL28',
  'SL34',
  'Pacamara',
  'Catuai',
  'Mundo Novo',
  'Maragogype',
  'Kent',
  'Blue Mountain',
  'Ethiopian Heirloom',
  'Java',
  'Tekisic',
];

// Removed custom dropdown components in favor of shared Select component

const FarmerDashboard: React.FC = () => {
  const { data, setData } = useDataContext();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Only lots belonging to current user (name-based for now)
  const isAdmin = currentUser?.roles?.includes(UserRole.Admin) || false;

  const myHarvestLots = useMemo(() => {
    if (!currentUser) return data.harvestLots;
    // Admin sees all harvest lots; farmers see only their own lots
    if (isAdmin) return data.harvestLots;
    return data.harvestLots.filter(hl => hl.farmerName === currentUser.name);
  }, [data.harvestLots, currentUser, isAdmin]);

  const stats = useMemo(() => ({
    totalLots: myHarvestLots.length,
    totalWeight: myHarvestLots.reduce((sum, lot) => sum + lot.weightKg, 0),
    completed: myHarvestLots.filter(l => l.status === 'Complete').length,
    readyForProcessing: myHarvestLots.filter(l => l.status === 'Ready for Processing').length,
  }), [myHarvestLots]);

  // Farms available to current user: owner match or legacy match by name; Admin sees all
  const availableFarms = useMemo(() => {
    if (!currentUser) return data.farms;
    const myId = currentUser.id;
    const isAdmin = currentUser.roles?.includes(UserRole.Admin);
    if (isAdmin) return data.farms;
    return data.farms.filter(f =>
      f.ownerUserId === myId ||
      f.farmerName === currentUser.name
    );
  }, [data.farms, currentUser]);

  // Compute average cupping feedback per year (for this farmer), then pick max/min
  const feedbackYearExtremes = useMemo(() => {
    // Admin: compute across all lots; Farmer: compute from own lots
    const scopedLots = isAdmin ? data.harvestLots : myHarvestLots;

    const yearToScores: Record<string, number[]> = {};
    for (const hl of scopedLots) {
      // Find related green bean lot score and its session year
      const relatedBatches = data.processingBatches.filter(b => b.harvestLotId === hl.id);
      const relatedParchments = data.parchmentLots.filter(p => relatedBatches.some(b => b.id === p.processingBatchId));
      const relatedGBLs = data.greenBeanLots.filter(g => relatedParchments.some(p => p.id === g.parchmentLotId));
      if (!relatedGBLs.length) continue;

      const gbl = relatedGBLs[0];
      const scoreInfo = gbl.cuppingScores[0];
      if (!scoreInfo) continue;

      const session = data.cuppingSessions.find(s => s.id === scoreInfo.sessionId);
      const sample = session?.samples.find(s => s.greenBeanLotId === gbl.id);

      let score: number | undefined;
      let dateStr: string | undefined;
      if (session && sample && session.finalResults && session.finalResults[sample.id]) {
        score = session.finalResults[sample.id].totalScore;
        dateStr = session.date;
      } else if (session) {
        score = scoreInfo.score; // fallback
        dateStr = session.date;
      } else {
        score = scoreInfo.score;
        dateStr = hl.harvestDate; // fallback to harvest year if session missing
      }
      if (score == null || isNaN(score)) continue;
      const year = (dateStr || '').slice(0, 4);
      if (!year) continue;
      if (!yearToScores[year]) yearToScores[year] = [];
      yearToScores[year].push(score);
    }

    const yearAverages = Object.entries(yearToScores).map(([year, scores]) => ({
      year,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    }));

    if (yearAverages.length === 0) return { max: null as null | { year: string; avg: number }, min: null as null | { year: string; avg: number } };

    const max = yearAverages.reduce((best, cur) => (best == null || cur.avg > best.avg ? cur : best), null as null | { year: string; avg: number });
    const min = yearAverages.reduce((worst, cur) => (worst == null || cur.avg < worst.avg ? cur : worst), null as null | { year: string; avg: number });
    return { max, min };
  }, [isAdmin, myHarvestLots, data.harvestLots, data.processingBatches, data.parchmentLots, data.greenBeanLots, data.cuppingSessions]);

  // Farm summary statistics
  const farmStats = useMemo(() => {
    const totalFarms = availableFarms.length;
    const uniqueVarieties = new Set<string>();
    availableFarms.forEach(farm => {
      farm.varieties?.forEach(v => uniqueVarieties.add(v));
    });
    const totalVarieties = uniqueVarieties.size;
    const farmsWithGPS = availableFarms.filter(f => f.latitude && f.longitude).length;
    
    return {
      totalFarms,
      totalVarieties,
      farmsWithGPS,
    };
  }, [availableFarms]);

  // Recent Harvest Lots (last 5, sorted by date)
  const recentHarvestLots = useMemo(() => {
    return myHarvestLots
      .sort((a, b) => new Date(b.harvestDate).getTime() - new Date(a.harvestDate).getTime())
      .slice(0, 5);
  }, [myHarvestLots]);

  return (
    <div className="space-y-8">
        <PageHeader
          title="Farmer Dashboard"
          description="Your command center for farm and harvest management."
        />

        {/* Quick Access for Admin Users */}
        {isAdmin && (
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Award className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Admin Quick Access</h3>
                  <p className="text-sm text-gray-600">Access other workbenches for testing and management</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => navigate('/processor')}
                className="flex items-center gap-3 p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left group"
              >
                <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                  <Droplets className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">Processor Workbench</p>
                  <p className="text-xs text-gray-500">Manage processing batches</p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
              </button>
              <button
                onClick={() => navigate('/roaster')}
                className="flex items-center gap-3 p-4 bg-white rounded-lg border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all text-left group"
              >
                <div className="p-2 bg-orange-100 rounded-lg group-hover:bg-orange-200 transition-colors">
                  <Flame className="h-5 w-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">Roaster Workbench</p>
                  <p className="text-xs text-gray-500">Manage roasting operations</p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-orange-600 group-hover:translate-x-1 transition-all" />
              </button>
              <button
                onClick={() => navigate('/cupping')}
                className="flex items-center gap-3 p-4 bg-white rounded-lg border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all text-left group"
              >
                <div className="p-2 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors">
                  <FlaskConical className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">Cupping Lab</p>
                  <p className="text-xs text-gray-500">Manage cupping sessions</p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
              </button>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard icon={BarChart} title="Total Harvest Lots" value={stats.totalLots} borderColor="border-l-blue-500" iconBg="bg-blue-100" iconColor="text-blue-600"/>
            <StatCard icon={Weight} title="Total Weight (kg)" value={stats.totalWeight.toLocaleString()} borderColor="border-l-green-500" iconBg="bg-green-100" iconColor="text-green-600"/>
            <StatCard
              icon={Award}
              title={`Best Avg Feedback ${feedbackYearExtremes.max ? `(${feedbackYearExtremes.max.year})` : ''}`}
              value={feedbackYearExtremes.max ? toFixed2(feedbackYearExtremes.max.avg) : '-'}
              borderColor="border-l-amber-500"
              iconBg="bg-amber-100"
              iconColor="text-amber-600"
            />
            <StatCard
              icon={Wind}
              title={`Lowest Avg Feedback ${feedbackYearExtremes.min ? `(${feedbackYearExtremes.min.year})` : ''}`}
              value={feedbackYearExtremes.min ? toFixed2(feedbackYearExtremes.min.avg) : '-'}
              borderColor="border-l-rose-500"
              iconBg="bg-rose-100"
              iconColor="text-rose-600"
            />
        </div>

        {/* Farm Summary & Recent Harvest Lots */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Farm Summary */}
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <MapPin className="h-5 w-5 text-emerald-600" />
              <h2 className="text-xl font-bold text-gray-900">Farm Summary</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-emerald-700">Total Farms</span>
                  <MapPin className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-emerald-900">{farmStats.totalFarms}</p>
              </div>
              <div className="bg-lime-50 rounded-lg p-4 border border-lime-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-lime-700">Varieties Planted</span>
                  <Leaf className="h-5 w-5 text-lime-600" />
                </div>
                <p className="text-2xl font-bold text-lime-900">{farmStats.totalVarieties}</p>
              </div>
              <div className="bg-sky-50 rounded-lg p-4 border border-sky-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-sky-700">Farms with GPS</span>
                  <TrendingUp className="h-5 w-5 text-sky-600" />
                </div>
                <p className="text-2xl font-bold text-sky-900">{farmStats.farmsWithGPS}</p>
              </div>
            </div>
          </div>

          {/* Recent Harvest Lots */}
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900">Recent Harvest Lots</h2>
              </div>
              {recentHarvestLots.length > 0 && (
                <button
                  onClick={() => navigate('/harvest-lots')}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  View All <ChevronRight className="inline w-4 h-4" />
                </button>
              )}
            </div>
            {recentHarvestLots.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">No harvest lots yet</p>
                <button
                  onClick={() => navigate('/harvest-lots')}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Add your first harvest lot <ArrowRight className="inline h-4 w-4 ml-1" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentHarvestLots.map((lot) => (
                  <div
                    key={lot.id}
                    onClick={() => navigate(`/farmer-dashboard/${lot.id}`)}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all group"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{lot.displayId || lot.id.substring(0, 8).toUpperCase()}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          lot.status === 'Complete'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {lot.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>{lot.cherryVariety}</span>
                        <span>•</span>
                        <span>{lot.weightKg} kg</span>
                        <span>•</span>
                        <span>{lot.harvestDate}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
    </div>
  );
};

export default FarmerDashboard;
