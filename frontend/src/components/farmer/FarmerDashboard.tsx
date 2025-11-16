import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { HarvestLot, Farm, FarmRequest, CropYear, UserRole, SCA_ATTRIBUTES } from '../../types';
import { addFarmRequest } from '../../services/farmRequestService';
import { ChevronRight, PlusCircle, ArrowUp, ArrowDown, BarChart, Weight, Wind, Coffee, Award, Send } from 'lucide-react';
import DatePicker from '../common/DatePicker';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PageHeader } from '../common/PageHeader';
import { Alert } from '../common/Alert';
import { StatCard } from '../common/StatCard';
import { generateHarvestLotId, generateFarmRequestId } from '../../utils/idGenerator';
import { toFixed2 } from '../../utils/formatters';

type SortableKeys = keyof HarvestLot;

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
  if (!avgScores) {
    return (
      <div className="flex items-center justify-center h-[300px] text-gray-500 text-sm">
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
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis
          dataKey="attribute"
          tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 500 }}
        />
        <PolarRadiusAxis
          angle={30}
          domain={[6, 10]}
          tickCount={5}
          tick={{ fill: '#9ca3af', fontSize: 10 }}
        />
        <Radar
          name="Score"
          dataKey="score"
          stroke="#6366f1"
          fill="#818cf8"
          fillOpacity={0.6}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
};

const FarmerDashboard: React.FC = () => {
  const { data, setData } = useDataContext();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Farm Request Form States
  const [farmName, setFarmName] = useState('');
  const [farmLocation, setFarmLocation] = useState('');
  const [farmAltitude, setFarmAltitude] = useState('');
  const [farmSize, setFarmSize] = useState('');
  const [farmLatitude, setFarmLatitude] = useState('');
  const [farmLongitude, setFarmLongitude] = useState('');
  const [farmRequestReason, setFarmRequestReason] = useState('');
  const [showFarmRequestSuccess, setShowFarmRequestSuccess] = useState(false);

  // Harvest Lot Form States
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [cherryVariety, setCherryVariety] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().substring(0, 10));
  const [cropYearId, setCropYearId] = useState('');
  const [showLotSuccess, setShowLotSuccess] = useState(false);
  
  // Table State
  const [statusFilter, setStatusFilter] = useState<'All' | 'Ready for Processing' | 'Processing'>('All');
  const [sortColumn, setSortColumn] = useState<SortableKeys>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleRowClick = (lotId: string) => {
    navigate(`/farmer-dashboard/${lotId}`);
  };
  
  const handleFarmRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      alert('You must be logged in to submit a farm request');
      return;
    }

    const newFarmRequest: FarmRequest = {
      id: generateFarmRequestId(data.farmRequests.map(req => req.id)),
      farmName: farmName,
      location: farmLocation,
      altitude: farmAltitude || undefined,
      size: farmSize || undefined,
      latitude: farmLatitude ? parseFloat(farmLatitude) : undefined,
      longitude: farmLongitude ? parseFloat(farmLongitude) : undefined,
      ownerName: currentUser.name,
      requesterId: currentUser.id,
      requestDate: new Date().toISOString().split('T')[0],
      status: 'Pending',
      reason: farmRequestReason,
    };

    // Save to localStorage
    addFarmRequest(newFarmRequest);

    // Update context state
    setData(prevData => ({
      ...prevData,
      farmRequests: [newFarmRequest, ...prevData.farmRequests],
    }));

    // Reset form
    setFarmName('');
    setFarmLocation('');
    setFarmAltitude('');
    setFarmSize('');
    setFarmLatitude('');
    setFarmLongitude('');
    setFarmRequestReason('');
    setShowFarmRequestSuccess(true);
    setTimeout(() => setShowFarmRequestSuccess(false), 5000);
  };

  const handleLotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedFarm = data.farms.find(f => f.id === selectedFarmId);
    if (!selectedFarm) return alert("Please select a valid farm.");

    const newLot: HarvestLot = {
      id: generateHarvestLotId(data.harvestLots.map(l => l.id)),
      farmerName: selectedFarm.farmerName,
      cherryVariety,
      weightKg: parseFloat(weightKg),
      farmPlotLocation: selectedFarm.location,
      harvestDate,
      status: 'Ready for Processing',
      cropYearId: cropYearId || undefined,
    };
    setData(prevData => ({ ...prevData, harvestLots: [newLot, ...prevData.harvestLots] }));
    setSelectedFarmId('');
    setCherryVariety('');
    setWeightKg('');
    setHarvestDate(new Date().toISOString().substring(0, 10));
    setCropYearId('');
    setShowLotSuccess(true);
    setTimeout(() => setShowLotSuccess(false), 3000);
  };

  const handleSort = (column: SortableKeys) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };
  
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

    return scoredLots.sort((a, b) => b.score - a.score).slice(0, 3);

  }, [data, myHarvestLots]);

  const sortedAndFilteredLots = useMemo(() => {
    const filtered = myHarvestLots.filter(lot => statusFilter === 'All' || lot.status === statusFilter);
    return filtered.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        return 0;
    });
  }, [myHarvestLots, statusFilter, sortColumn, sortDirection]);

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

  const filterStatuses: Array<'All' | 'Ready for Processing' | 'Processing'> = ['All', 'Ready for Processing', 'Processing'];

  const SortableHeader: React.FC<{ column: SortableKeys; label: string }> = ({ column, label }) => (
    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
      <button onClick={() => handleSort(column)} className="flex items-center gap-1 hover:text-gray-700">
        {label}
        {sortColumn === column && (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-8">
        <PageHeader
          title="Farmer Dashboard"
          description="Your command center for farm and harvest management."
        />

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
        
        {qualityFeedbackData.length > 0 && (
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                    {qualityFeedbackData.map((item) => (
                        <div
                            key={item.lotId}
                            onClick={() => navigate(`/traceability/${item.greenBeanLotId}`)}
                            className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-xl hover:border-indigo-300 cursor-pointer transition-all duration-300 group"
                        >
                            {/* Header: Lot ID & Variety */}
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">{item.lotId}</h3>
                                    <p className="text-sm text-gray-600">{item.variety}</p>
                                </div>
                                <div className="p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                                    <Award className="h-5 w-5 text-indigo-600" />
                                </div>
                            </div>

                            {/* Radar Chart */}
                            <div className="mb-4">
                                <SensoryRadarChart avgScores={item.avgScores} />
                            </div>

                            {/* Footer: Score & Metadata */}
                            <div className="border-t border-gray-100 pt-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-600">Total Score</span>
                                    <span className="text-2xl font-bold text-indigo-600">{toFixed2(item.score)}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span>Grade: <span className="font-semibold text-gray-700">{item.grade}</span></span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                                        {item.processType}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span>Harvest: {item.harvestDate}</span>
                                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white shadow-sm rounded-lg p-8 border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Send className="h-5 w-5 text-blue-600" />
            </div>
            Request New Farm
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Submit a request for admin approval. Provide detailed information about your farm for faster processing.
          </p>
          <form onSubmit={handleFarmRequestSubmit} className="space-y-5">
              <Input
                label="Farm Name"
                type="text"
                id="farmName"
                value={farmName}
                onChange={e => setFarmName(e.target.value)}
                required
                placeholder="e.g., Highland Valley Farm"
              />
              <Input
                label="Location"
                type="text"
                id="farmLocation"
                value={farmLocation}
                onChange={e => setFarmLocation(e.target.value)}
                required
                placeholder="e.g., Chiang Mai, North Thailand"
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Altitude"
                  type="text"
                  id="farmAltitude"
                  value={farmAltitude}
                  onChange={e => setFarmAltitude(e.target.value)}
                  placeholder="e.g., 1200m"
                />
                <Input
                  label="Size"
                  type="text"
                  id="farmSize"
                  value={farmSize}
                  onChange={e => setFarmSize(e.target.value)}
                  placeholder="e.g., 5 hectares"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Latitude"
                  type="number"
                  step="any"
                  id="farmLatitude"
                  value={farmLatitude}
                  onChange={e => setFarmLatitude(e.target.value)}
                  placeholder="e.g., 18.7883"
                  helperText="Range: -90 to 90"
                />
                <Input
                  label="Longitude"
                  type="number"
                  step="any"
                  id="farmLongitude"
                  value={farmLongitude}
                  onChange={e => setFarmLongitude(e.target.value)}
                  placeholder="e.g., 98.9853"
                  helperText="Range: -180 to 180"
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  <strong>Tip:</strong> GPS coordinates help us fetch weather data for your farm. You can find coordinates using Google Maps or GPS apps.
                </p>
              </div>
              <div>
                  <label htmlFor="farmRequestReason" className="block text-sm font-semibold text-gray-700 mb-2">
                    Reason for Request <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="farmRequestReason"
                    value={farmRequestReason}
                    onChange={e => setFarmRequestReason(e.target.value)}
                    required
                    rows={3}
                    className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all resize-none"
                    placeholder="Explain why you're requesting this farm (e.g., expanding operations, new plot with excellent microclimate)"
                  />
              </div>
              <div className="flex items-end justify-between min-h-12 pt-2">
                  {showFarmRequestSuccess && (
                    <Alert variant="success" className="flex-1 mr-4">
                      Request submitted for admin review!
                    </Alert>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    icon={<Send className="h-4 w-4" />}
                    className="ml-auto"
                  >
                    Submit Request
                  </Button>
              </div>
          </form>
        </div>

        <div className="bg-white shadow-sm rounded-lg p-8 border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <div className="p-2 bg-green-100 rounded-lg">
              <Coffee className="h-5 w-5 text-green-600" />
            </div>
            Register New Harvest Lot
          </h2>
          <form onSubmit={handleLotSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Select Farm</label>
                <Select<Farm>
                  value={selectedFarmId}
                  onChange={(v) => setSelectedFarmId((v as string) || '')}
                  options={availableFarms}
                  getValue={(f) => f.id}
                  getLabel={(f) => `${f.farmerName} - ${f.location}`}
                  placeholder="Select a farm..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Cherry Variety</label>
                    <Select
                      value={cherryVariety}
                      onChange={(v) => setCherryVariety((v as string) || '')}
                      options={COFFEE_VARIETIES}
                      placeholder="Select variety..."
                    />
                </div>
                <Input
                  label="Weight (kg)"
                  type="number"
                  id="weightKg"
                  value={weightKg}
                  onChange={e => setWeightKg(e.target.value)}
                  required
                  placeholder="0"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <DatePicker
                    value={harvestDate}
                    onChange={setHarvestDate}
                    label="Harvest Date"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Crop Year (Optional)</label>
                  <Select<CropYear>
                    value={cropYearId}
                    onChange={(v) => setCropYearId((v as string) || '')}
                    options={data.cropYears}
                    getValue={(cy) => cy.id}
                    getLabel={(cy) => cy.description ? `${cy.year} — ${cy.description}` : cy.year}
                    placeholder="Select crop year..."
                  />
                </div>
              </div>
              <div className="flex items-end justify-between h-12 pt-2">
                  {showLotSuccess && (
                    <Alert variant="success" className="flex-1 mr-4">
                      Harvest lot registered!
                    </Alert>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    icon={<PlusCircle className="h-4 w-4" />}
                    className="ml-auto"
                  >
                    Submit Lot
                  </Button>
              </div>
          </form>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <div className="bg-gray-50 p-6 border-b border-gray-200">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <h3 className="text-2xl font-bold text-gray-900">Active Harvest Lots</h3>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-semibold text-gray-700">Filter:</span>
              {filterStatuses.map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    statusFilter === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4 p-6 bg-gray-50">
          {sortedAndFilteredLots.length === 0 ? (
            <div className="text-center py-12">
              <Coffee className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium">No harvest lots found</p>
              <p className="text-gray-400 text-sm">Try adjusting your filters or add a new harvest lot</p>
            </div>
          ) : (
            sortedAndFilteredLots.map((lot: HarvestLot) => (
              <div
                key={lot.id}
                onClick={() => handleRowClick(lot.id)}
                className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <h4 className="text-xl font-bold text-gray-900">{lot.id}</h4>
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                        lot.status === 'Processing'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {lot.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <p className="text-gray-500 text-xs uppercase font-semibold mb-1 tracking-wide">Farmer</p>
                        <p className="text-gray-900 font-medium text-sm">{lot.farmerName}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <p className="text-gray-500 text-xs uppercase font-semibold mb-1 tracking-wide">Variety</p>
                        <p className="text-gray-900 font-medium text-sm">{lot.cherryVariety}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <p className="text-gray-500 text-xs uppercase font-semibold mb-1 tracking-wide">Weight</p>
                        <p className="text-gray-900 font-medium text-sm">{lot.weightKg} kg</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <p className="text-gray-500 text-xs uppercase font-semibold mb-1 tracking-wide">Harvest Date</p>
                        <p className="text-gray-900 font-medium text-sm">{lot.harvestDate}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-indigo-50 transition-colors">
                      <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default FarmerDashboard;
