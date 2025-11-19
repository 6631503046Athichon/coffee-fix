
import * as React from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { SoilAnalysis, UserRole } from '../../types';
import { PlusCircle, Filter, Microscope, FlaskConical, X, CheckCircle, Edit, Trash2, Download } from 'lucide-react';
import DatePicker from '../common/DatePicker';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PageHeader } from '../common/PageHeader';
import { Alert } from '../common/Alert';
import { generateSoilAnalysisId } from '../../utils/idGenerator';
import { addSoilAnalysis, updateSoilAnalysis } from '../../services/soilAnalysisService';

// Removed custom farm dropdown in favor of shared Select component

interface SoilAnalysisManagerProps {
  currentUser: { id: string; name: string; roles: UserRole[] };
}

const SoilAnalysisManager: React.FC<SoilAnalysisManagerProps> = ({ currentUser }) => {
    const { data, setData } = useDataContext();

    // Form state
    const [farmId, setFarmId] = React.useState('');
    const [farmPlotLocation, setFarmPlotLocation] = React.useState('');
    const [testDate, setTestDate] = React.useState(new Date().toISOString().substring(0, 10));
    const [labName, setLabName] = React.useState('');
    const [certificateNumber, setCertificateNumber] = React.useState('');

    // Core nutrients (required)
    const [pH, setPH] = React.useState<string>('');
    const [phosphorus, setPhosphorus] = React.useState<string>('');
    const [potassium, setPotassium] = React.useState<string>('');
    const [nitrogen, setNitrogen] = React.useState<string>('');
    const [calcium, setCalcium] = React.useState<string>('');
    const [magnesium, setMagnesium] = React.useState<string>('');

    // Optional nutrients
    const [organicMatter, setOrganicMatter] = React.useState<string>('');
    const [sulfur, setSulfur] = React.useState<string>('');
    const [zinc, setZinc] = React.useState<string>('');
    const [iron, setIron] = React.useState<string>('');
    const [manganese, setManganese] = React.useState<string>('');
    const [copper, setCopper] = React.useState<string>('');
    const [boron, setBoron] = React.useState<string>('');

    const [notes, setNotes] = React.useState('');
    const [recommendations, setRecommendations] = React.useState('');

    const [showSuccess, setShowSuccess] = React.useState(false);
    const [editingAnalysis, setEditingAnalysis] = React.useState<SoilAnalysis | null>(null);
    const [farmFilter, setFarmFilter] = React.useState('All');

    const formRef = React.useRef<HTMLDivElement>(null);

    const farmOptions = React.useMemo(() => {
        return data.farms.map(f => ({
            id: f.id,
            name: f.farmerName,
            location: f.location
        }));
    }, [data.farms]);

    const farmFilterOptions = React.useMemo(() => {
        const options = data.farms.map(f => ({ id: f.id, label: `${f.farmerName} - ${f.location}` }));
        return [{ id: 'All', label: 'All Farms' }, ...options];
    }, [data.farms]);
    

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            // Build the soil analysis object
            const analysisData: Partial<SoilAnalysis> = {
                farmId,
                farmPlotLocation,
                testDate,
                labName: labName || undefined,
                certificateNumber: certificateNumber || undefined,
                pH: parseFloat(pH),
                phosphorus: parseFloat(phosphorus),
                potassium: parseFloat(potassium),
                nitrogen: parseFloat(nitrogen),
                calcium: parseFloat(calcium),
                magnesium: parseFloat(magnesium),
                organicMatter: organicMatter ? parseFloat(organicMatter) : undefined,
                sulfur: sulfur ? parseFloat(sulfur) : undefined,
                zinc: zinc ? parseFloat(zinc) : undefined,
                iron: iron ? parseFloat(iron) : undefined,
                manganese: manganese ? parseFloat(manganese) : undefined,
                copper: copper ? parseFloat(copper) : undefined,
                boron: boron ? parseFloat(boron) : undefined,
                notes: notes || undefined,
                recommendations: recommendations || undefined,
                createdBy: currentUser.id,
                createdByRole: currentUser.roles[0], // Use primary role
            };

            if (editingAnalysis) {
                // Update existing analysis
                const updatedAnalysis = await updateSoilAnalysis(editingAnalysis.id, analysisData);
                setData(prev => ({
                    ...prev,
                    soilAnalyses: prev.soilAnalyses.map(analysis =>
                        analysis.id === editingAnalysis.id ? updatedAnalysis : analysis
                    )
                }));
                setEditingAnalysis(null);
            } else {
                // Create new analysis
                const newAnalysis = await addSoilAnalysis(analysisData);
                setData(prev => ({ ...prev, soilAnalyses: [newAnalysis, ...prev.soilAnalyses] }));
            }

            // Reset form
            resetForm();
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Failed to save soil analysis:', error);
            alert('Failed to save soil analysis. Please try again.');
        }
    };

    const resetForm = () => {
        setFarmId('');
        setFarmPlotLocation('');
        setTestDate(new Date().toISOString().substring(0, 10));
        setLabName('');
        setCertificateNumber('');
        setPH('');
        setPhosphorus('');
        setPotassium('');
        setNitrogen('');
        setCalcium('');
        setMagnesium('');
        setOrganicMatter('');
        setSulfur('');
        setZinc('');
        setIron('');
        setManganese('');
        setCopper('');
        setBoron('');
        setNotes('');
        setRecommendations('');
    };

    const handleEdit = (analysis: SoilAnalysis) => {
        setEditingAnalysis(analysis);
        setFarmId(analysis.farmId);
        setFarmPlotLocation(analysis.farmPlotLocation);
        setTestDate(analysis.testDate);
        setLabName(analysis.labName || '');
        setCertificateNumber(analysis.certificateNumber || '');
        setPH(analysis.pH.toString());
        setPhosphorus(analysis.phosphorus.toString());
        setPotassium(analysis.potassium.toString());
        setNitrogen(analysis.nitrogen.toString());
        setCalcium(analysis.calcium.toString());
        setMagnesium(analysis.magnesium.toString());
        setOrganicMatter(analysis.organicMatter?.toString() || '');
        setSulfur(analysis.sulfur?.toString() || '');
        setZinc(analysis.zinc?.toString() || '');
        setIron(analysis.iron?.toString() || '');
        setManganese(analysis.manganese?.toString() || '');
        setCopper(analysis.copper?.toString() || '');
        setBoron(analysis.boron?.toString() || '');
        setNotes(analysis.notes || '');
        setRecommendations(analysis.recommendations || '');

        // Scroll to form
        setTimeout(() => {
            formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    };

    const handleCancelEdit = () => {
        setEditingAnalysis(null);
        resetForm();
    };

    const handleDelete = (analysisId: string) => {
        if (confirm('Are you sure you want to delete this soil analysis?')) {
            setData(prev => ({
                ...prev,
                soilAnalyses: prev.soilAnalyses.filter(analysis => analysis.id !== analysisId)
            }));
        }
    };

    const filteredAnalyses = React.useMemo(() => {
        return data.soilAnalyses.filter(analysis => {
            const farmMatch = farmFilter === 'All' || analysis.farmId === farmFilter;
            return farmMatch;
        });
    }, [data.soilAnalyses, farmFilter]);

    const exportToCSV = () => {
        const headers = [
            'Test Date', 'Farm', 'Plot Location', 'Lab Name', 'Certificate #',
            'pH', 'P (ppm)', 'K (ppm)', 'N (%)', 'Ca (ppm)', 'Mg (ppm)',
            'OM (%)', 'S (ppm)', 'Zn (ppm)', 'Fe (ppm)', 'Mn (ppm)', 'Cu (ppm)', 'B (ppm)',
            'Recommendations', 'Notes'
        ];

        const rows = filteredAnalyses.map(analysis => {
            const farm = data.farms.find(f => f.id === analysis.farmId);
            return [
                analysis.testDate,
                farm ? `${farm.farmerName} - ${farm.location}` : 'Unknown',
                analysis.farmPlotLocation,
                analysis.labName || '',
                analysis.certificateNumber || '',
                analysis.pH,
                analysis.phosphorus,
                analysis.potassium,
                analysis.nitrogen,
                analysis.calcium,
                analysis.magnesium,
                analysis.organicMatter || '',
                analysis.sulfur || '',
                analysis.zinc || '',
                analysis.iron || '',
                analysis.manganese || '',
                analysis.copper || '',
                analysis.boron || '',
                analysis.recommendations || '',
                analysis.notes || ''
            ].map(cell => `"${cell}"`).join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `soil-analysis-${new Date().toISOString().substring(0, 10)}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-8">
            {/* Header Section */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-teal-100 rounded-lg">
                        <Microscope className="h-7 w-7 text-teal-600" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Soil Analysis Manager</h1>
                        <p className="text-gray-600 text-sm">Track and manage soil test results for optimal farm health.</p>
                    </div>
                </div>
            </div>

            {/* Add/Edit Form */}
            <div ref={formRef} className="bg-white shadow-sm rounded-xl p-8 border border-gray-200">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-teal-100 rounded-lg">
                            <FlaskConical className="h-5 w-5 text-teal-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">
                            {editingAnalysis ? 'Edit Soil Analysis' : 'Add New Analysis'}
                        </h2>
                    </div>
                    {editingAnalysis && (
                        <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-colors"
                        >
                            <X className="h-4 w-4" />
                            Cancel Edit
                        </button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Information */}
                    <div className="border-b border-gray-200 pb-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Farm *</label>
                                <Select<{ id: string; name: string; location: string }>
                                    value={farmId}
                                    onChange={(v) => setFarmId((v as string) || '')}
                                    options={farmOptions}
                                    getValue={(o) => o.id}
                                    getLabel={(o) => `${o.name} - ${o.location}`}
                                    placeholder="Select a farm..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Plot Location *</label>
                                <input
                                    type="text"
                                    value={farmPlotLocation}
                                    onChange={e => setFarmPlotLocation(e.target.value)}
                                    required
                                    placeholder="e.g., Plot A, North Field"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <DatePicker
                                    value={testDate}
                                    onChange={setTestDate}
                                    label="Test Date"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Lab Name</label>
                                <input
                                    type="text"
                                    value={labName}
                                    onChange={e => setLabName(e.target.value)}
                                    placeholder="e.g., Chiang Mai Agricultural Testing Laboratory"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Certificate Number</label>
                                <input
                                    type="text"
                                    value={certificateNumber}
                                    onChange={e => setCertificateNumber(e.target.value)}
                                    placeholder="e.g., CMATL-2025-0342"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Core Nutrients (Required) */}
                    <div className="border-b border-gray-200 pb-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Core Nutrients (Required)</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">pH *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={pH}
                                    onChange={e => setPH(e.target.value)}
                                    required
                                    placeholder="6.5"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">P - Phosphorus (ppm) *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={phosphorus}
                                    onChange={e => setPhosphorus(e.target.value)}
                                    required
                                    placeholder="45"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">K - Potassium (ppm) *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={potassium}
                                    onChange={e => setPotassium(e.target.value)}
                                    required
                                    placeholder="180"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">N - Nitrogen (%) *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={nitrogen}
                                    onChange={e => setNitrogen(e.target.value)}
                                    required
                                    placeholder="2.8"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Ca - Calcium (ppm) *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={calcium}
                                    onChange={e => setCalcium(e.target.value)}
                                    required
                                    placeholder="1200"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Mg - Magnesium (ppm) *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={magnesium}
                                    onChange={e => setMagnesium(e.target.value)}
                                    required
                                    placeholder="150"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Optional Nutrients */}
                    <div className="border-b border-gray-200 pb-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Nutrients (Optional)</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">OM - Organic Matter (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={organicMatter}
                                    onChange={e => setOrganicMatter(e.target.value)}
                                    placeholder="4.5"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">S - Sulfur (ppm)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={sulfur}
                                    onChange={e => setSulfur(e.target.value)}
                                    placeholder="20"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Zn - Zinc (ppm)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={zinc}
                                    onChange={e => setZinc(e.target.value)}
                                    placeholder="3.5"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Fe - Iron (ppm)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={iron}
                                    onChange={e => setIron(e.target.value)}
                                    placeholder="50"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Mn - Manganese (ppm)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={manganese}
                                    onChange={e => setManganese(e.target.value)}
                                    placeholder="15"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Cu - Copper (ppm)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={copper}
                                    onChange={e => setCopper(e.target.value)}
                                    placeholder="2.0"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">B - Boron (ppm)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={boron}
                                    onChange={e => setBoron(e.target.value)}
                                    placeholder="0.8"
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Notes and Recommendations */}
                    <div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Recommendations</label>
                                <textarea
                                    value={recommendations}
                                    onChange={e => setRecommendations(e.target.value)}
                                    rows={4}
                                    placeholder="e.g., แนะนำเพิ่มปุ๋ยอินทรีย์เพื่อรักษาระดับอินทรีย์วัตถุ..."
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 resize-none placeholder-gray-400"
                                ></textarea>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    rows={4}
                                    placeholder="Optional notes about this soil test..."
                                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white hover:border-gray-400 resize-none placeholder-gray-400"
                                ></textarea>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        {showSuccess && (
                            <div className="flex items-center gap-2 bg-teal-50 text-teal-700 px-4 py-2 rounded-lg border border-teal-200">
                                <CheckCircle className="h-5 w-5" />
                                <span className="font-semibold">
                                    {editingAnalysis ? 'Analysis updated successfully!' : 'Analysis added successfully!'}
                                </span>
                            </div>
                        )}
                        <button
                            type="submit"
                            className="ml-auto inline-flex items-center gap-2 justify-center rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
                        >
                            {editingAnalysis ? (
                                <>
                                    <CheckCircle className="h-4 w-4" />
                                    Update Analysis
                                </>
                            ) : (
                                <>
                                    <PlusCircle className="h-4 w-4" />
                                    Add Analysis
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* Analysis Records Table */}
            <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-gray-200">
                <div className="bg-gray-50 p-6 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Filter className="h-4 w-4" />
                            Filter:
                        </span>
                                                                        <Select<{ id: string; label: string }>
                                                    className="w-64"
                                                    value={farmFilter}
                                                    onChange={(v) => setFarmFilter((v as string) || 'All')}
                                                    options={farmFilterOptions}
                                                    getValue={(o) => o.id}
                                                    getLabel={(o) => o.label}
                                                    placeholder="All Farms"
                                                />
                    </div>
                    <button
                        onClick={exportToCSV}
                        className="inline-flex items-center gap-2 justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition-colors"
                    >
                        <Download className="h-4 w-4" />
                        Export CSV
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-900">
                            <tr>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Test Date</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Farm / Plot</th>
                                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">pH</th>
                                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">P (ppm)</th>
                                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">K (ppm)</th>
                                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">N (%)</th>
                                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Ca (ppm)</th>
                                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Mg (ppm)</th>
                                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredAnalyses.map((analysis) => {
                                const farm = data.farms.find(f => f.id === analysis.farmId);
                                return (
                                    <tr key={analysis.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{analysis.testDate}</td>
                                        <td className="px-6 py-4 text-sm">
                                            <div className="font-semibold text-gray-900">{farm?.farmerName || 'Unknown'}</div>
                                            <div className="text-gray-600">{analysis.farmPlotLocation}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">{analysis.pH}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{analysis.phosphorus}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{analysis.potassium}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{analysis.nitrogen}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{analysis.calcium}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{analysis.magnesium}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleEdit(analysis)}
                                                    className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(analysis.id)}
                                                    className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SoilAnalysisManager;
