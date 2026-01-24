import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { HarvestLot, Farm, CropYear, UserRole, SCA_ATTRIBUTES } from '../../types';
import { BarChart, Weight, Wind, Award, MapPin, Leaf, TrendingUp, Clock, ArrowRight, Flame, Droplets, FlaskConical } from 'lucide-react';
import DatePicker from '../common/DatePicker';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PageHeader } from '../common/PageHeader';
import { Alert } from '../common/Alert';
import { StatCard } from '../common/StatCard';
import { generateHarvestLotId } from '../../utils/idGenerator';
import { toFixed2 } from '../../utils/formatters';
import { formatHarvestLotId } from '../../utils/formatHarvestLotId';


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

// Sensory Radar Chart Component for Quality Feedback
const SensoryRadarChart: React.FC<{ avgScores: { [attribute: string]: number } | null }> = ({ avgScores }) => {
  const chartRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Fix rotated text labels after chart renders
    const fixRotatedText = () => {
      if (!chartRef.current) return;
      
      const svg = chartRef.current.querySelector('svg');
      if (!svg) return;

      // Find all text elements in polar radius axis
      const textElements = svg.querySelectorAll('.recharts-polar-radius-axis text, .recharts-polar-radius-axis tspan');
      textElements.forEach((textEl) => {
        const svgText = textEl as SVGTextElement;
        const x = parseFloat(svgText.getAttribute('x') || '0');
        const y = parseFloat(svgText.getAttribute('y') || '0');
        
        // Force rotate to 0 degrees at the text position
        svgText.setAttribute('transform', `rotate(0 ${x} ${y})`);
        svgText.setAttribute('text-anchor', 'middle');
        svgText.setAttribute('dominant-baseline', 'middle');
        
        // Override inline styles
        svgText.style.transform = 'rotate(0deg)';
        svgText.style.textAnchor = 'middle';
        svgText.style.dominantBaseline = 'middle';
      });
    };

    // Run multiple times to ensure it works
    const timeout1 = setTimeout(fixRotatedText, 100);
    const timeout2 = setTimeout(fixRotatedText, 300);
    const timeout3 = setTimeout(fixRotatedText, 500);
    
    window.addEventListener('resize', fixRotatedText);
    
    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
      window.removeEventListener('resize', fixRotatedText);
    };
  }, [avgScores]);

  if (!avgScores) {
    return (
      <div className="flex items-center justify-center h-[250px] text-gray-500 text-sm">
        Sensory details not available
      </div>
    );
  }

  const chartData = SCA_ATTRIBUTES.map(attr => ({
    attribute: attr === 'Fragrance/Aroma' ? 'Fragrance' : attr,
    score: avgScores[attr] || 0,
    fullMark: 10,
  }));

  return (
    <div ref={chartRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ResponsiveContainer width="100%" height={250}>
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="attribute"
            tick={{ fill: '#4b5563', fontSize: 10, fontWeight: 600 }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[6, 10]}
            tickCount={5}
            tick={{ fill: '#9ca3af', fontSize: 9 }}
            tickFormatter={(value) => value}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#6366f1"
            fill="#818cf8"
            fillOpacity={0.5}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
      <style>{`
        .recharts-polar-radius-axis text,
        .recharts-polar-radius-axis tspan {
          transform: rotate(0deg) !important;
          text-anchor: middle !important;
          dominant-baseline: middle !important;
        }
        .recharts-polar-radius-axis .recharts-text {
          transform: rotate(0deg) !important;
          text-anchor: middle !important;
        }
      `}</style>
    </div>
  );
};

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

  const qualityFeedbackData = useMemo(() => {
    const farmerLots = myHarvestLots;

    const scoredLots = farmerLots.map(hl => {
        const relatedBatches = data.processingBatches.filter(b => b.harvestLotId === hl.id);
        const relatedParchmentLots = data.parchmentLots.filter(p => relatedBatches.some(b => b.id === p.processingBatchId));
        const relatedGreenBeanLots = data.greenBeanLots.filter(g => relatedParchmentLots.some(p => p.id === g.parchmentLotId));

        if (relatedGreenBeanLots.length === 0) return null;

        const gbl = relatedGreenBeanLots[0];
        const scoreInfo = gbl.cuppingScores[0];
        if (!scoreInfo) return null;

        const session = data.cuppingSessions.find(s => s.id === scoreInfo.sessionId);
        const sample = session?.samples.find(s => s.greenBeanLotId === gbl.id);

        if (session && sample && session.finalResults && session.finalResults[sample.id]) {
            // Get the processing batch to extract process type
            const batch = relatedBatches.find(b => relatedParchmentLots.some(p => p.processingBatchId === b.id));

            return {
                lotId: hl.id,
                variety: hl.cherryVariety,
                score: session.finalResults[sample.id].totalScore,
                grade: gbl.grade || '-',
                processType: batch?.processType || '-',
                harvestDate: hl.harvestDate,
                greenBeanLotId: gbl.id,
                avgScores: session.finalResults[sample.id].avgScores || null,
            };
        }
        return null;
    }).filter(Boolean) as { lotId: string; variety: string; score: number; grade: string; processType: string; harvestDate: string; greenBeanLotId: string; avgScores: { [attribute: string]: number } | null; }[];

    const sortedLots = scoredLots.sort((a, b) => b.score - a.score).slice(0, 3);

    // Mock data for demonstration if no real data exists
    if (sortedLots.length === 0) {
        return [{
            lotId: 'HL001',
            variety: 'Gesha',
            score: 87.5,
            grade: 'Specialty',
            processType: 'Washed',
            harvestDate: '2024-01-15',
            greenBeanLotId: 'GBL001',
            avgScores: {
                'Fragrance/Aroma': 8.5,
                'Flavor': 8.7,
                'Aftertaste': 8.6,
                'Acidity': 8.4,
                'Body': 8.3,
                'Uniformity': 8.5,
                'Balance': 8.6,
                'Clean Cup': 8.8,
                'Sweetness': 8.5,
                'Overall': 8.6
            }
        }];
    }

    return sortedLots;

  }, [data, myHarvestLots]);


  const stats = useMemo(() => ({
    totalLots: myHarvestLots.length,
    totalWeight: myHarvestLots.reduce((sum, lot) => sum + lot.weightKg, 0),
    inProcessing: myHarvestLots.filter(l => l.status === 'Processing').length,
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
                  View All →
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
                  Add your first harvest lot →
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
                        <span className="font-semibold text-gray-900">{formatHarvestLotId(lot.id, 'short', lot.harvestDate)}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          lot.status === 'Processing'
                            ? 'bg-blue-100 text-blue-800'
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
        
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 border-b border-gray-200">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <Award className="text-blue-600 h-6 w-6" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">Quality Feedback</h2>
                </div>
                <p className="text-gray-600">Top-performing lots with cupping scores - click to view traceability</p>
            </div>
            
            {/* Table with Spider Charts */}
            <div className="overflow-x-auto p-6">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Lot ID
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Variety
                            </th>
                            <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[200px] md:min-w-[250px]">
                                Spider Chart
                            </th>
                            <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Total Score
                            </th>
                            <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Grade
                            </th>
                            <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Process Type
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Harvest Date
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {qualityFeedbackData.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center">
                                    <Award className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                                    <p className="text-gray-500 text-lg font-medium">No quality feedback data available</p>
                                    <p className="text-gray-400 text-sm">Quality feedback will appear here once cupping scores are available</p>
                                </td>
                            </tr>
                        ) : (
                            qualityFeedbackData.map((item) => (
                                <tr
                                    key={item.lotId}
                                    onClick={() => navigate(`/traceability/${item.greenBeanLotId}`)}
                                    className="hover:bg-indigo-50 cursor-pointer transition-colors"
                                >
                                    <td className="px-4 py-5 whitespace-nowrap">
                                        <div className="text-sm font-bold text-gray-900">
                                          {(() => {
                                            const lot = data.harvestLots.find(l => l.id === item.lotId);
                                            return lot ? formatHarvestLotId(item.lotId, 'short', lot.harvestDate) : item.lotId;
                                          })()}
                                        </div>
                                    </td>
                                    <td className="px-4 py-5 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-700">{item.variety}</div>
                                    </td>
                                    <td className="px-4 py-5">
                                        <div className="w-full h-[250px] flex items-center justify-center">
                                            <SensoryRadarChart avgScores={item.avgScores} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-5 whitespace-nowrap text-center">
                                        <div className="text-2xl font-bold text-indigo-600">{toFixed2(item.score)}</div>
                                    </td>
                                    <td className="px-4 py-5 whitespace-nowrap text-center">
                                        <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            {item.grade}
                                        </span>
                                    </td>
                                    <td className="px-4 py-5 whitespace-nowrap text-center">
                                        <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                            {item.processType}
                                        </span>
                                    </td>
                                    <td className="px-4 py-5 whitespace-nowrap">
                                        <div className="text-sm text-gray-600">{item.harvestDate}</div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

    </div>
  );
};

export default FarmerDashboard;
