
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useDataContext } from '../hooks/useDataContext';
import { SCA_ATTRIBUTES, CuppingSession, ComprehensiveQualityReport } from '../types';
import { getQualityInsights, QualityInsight, generateComprehensiveReport } from '../services/geminiService';
import { Lightbulb, Loader2, AlertTriangle, Wand2, BarChart2, CheckSquare, Wind, Bot, TrendingUp, Trophy, FileText, User, Droplets, Flame } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Select from './common/Select';
import { formatGreenBeanId } from '../utils/formatDisplayId';

// Removed local CustomDropdown in favor of shared Select component

const QualityInsights: React.FC = () => {
    const { data } = useDataContext();
    
    // State for AI Cupping Insights
    const [selectedSessionId, setSelectedSessionId] = useState<string>('');
    const [selectedAttribute, setSelectedAttribute] = useState<string>(SCA_ATTRIBUTES[1]); // Default to 'Flavor'
    const [insights, setInsights] = useState<QualityInsight | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // State for Annual Quality Report
    const [report, setReport] = useState<ComprehensiveQualityReport | null>(null);
    const [isReportLoading, setIsReportLoading] = useState<boolean>(false);
    const [reportError, setReportError] = useState<string | null>(null);

    // State for Comparative Charts
    const farmerNames = useMemo(() => [...new Set(data.farms.map(f => f.farmerName))], [data.farms]);
    const [selectedFarmName, setSelectedFarmName] = useState<string>(farmerNames[0] || '');
    const [selectedParchmentLotId, setSelectedParchmentLotId] = useState<string>('');

    // Handlers for AI
    const handleGenerateCuppingInsights = async () => {
        const session = data.cuppingSessions.find(s => s.id === selectedSessionId);
        if (!session) { setError("Please select a valid cupping session."); return; }
        setIsLoading(true); setError(null); setInsights(null);
        try {
            const result = await getQualityInsights(session, selectedAttribute);
            setInsights(result);
        } catch (err: any) { setError(err.message || "An unknown error occurred."); } 
        finally { setIsLoading(false); }
    };
    
    const handleGenerateReport = async () => {
        setIsReportLoading(true);
        setReportError(null);
        setReport(null);
        try {
            const result = await generateComprehensiveReport(data);
            setReport(result);
        } catch (err: any) {
            setReportError(err.message || "An unknown error occurred.");
        } finally {
            setIsReportLoading(false);
        }
    };
    
    // Memoized Data for Charts
    const processComparisonData = useMemo(() => {
        const scoredLots = data.greenBeanLots.map(gbl => {
            const parchmentLot = data.parchmentLots.find(p => p.id === gbl.parchmentLotId);
            const process = parchmentLot?.processType;
            const scoreInfo = gbl.cuppingScores[0];
            let finalScore: number | null = null;
            if (scoreInfo) {
                const session = data.cuppingSessions.find(s => s.id === scoreInfo.sessionId);
                const sample = session?.samples.find(s => s.greenBeanLotId === gbl.id);
                if (session && sample && session.finalResults && session.finalResults[sample.id]) {
                    finalScore = session.finalResults[sample.id].totalScore;
                }
            }
            return { process, finalScore };
        }).filter((item): item is { process: string; finalScore: number } => item.process != null && item.finalScore != null);

        // fix: Refactored to help TypeScript's type inference by assigning the
        // accumulator property to a variable before accessing its properties.
        // fix: Explicitly type the accumulator in the reduce function to prevent type errors on `totalScore` and `count`.
        const scoresByProcess = scoredLots.reduce<Record<string, { totalScore: number, count: number }>>((acc, { process, finalScore }) => {
            const key = process!;
            if (!acc[key]) {
                acc[key] = { totalScore: 0, count: 0 };
            }
            const entry = acc[key];
            entry.totalScore += finalScore!;
            entry.count += 1;
            return acc;
        }, {});

        return Object.entries(scoresByProcess).map(([name, data]) => {
            const { totalScore, count } = data as { totalScore: number; count: number };
            return {
                name,
                'Average Score': parseFloat((totalScore / count).toFixed(2)),
            };
        });
    }, [data]);

    const farmPerformanceData = useMemo(() => {
        const farmLots = data.harvestLots.filter(hl => hl.farmerName === selectedFarmName);
        return farmLots.map(hl => {
            const relatedGbl = data.greenBeanLots.find(gbl => {
                const pLot = data.parchmentLots.find(p => p.id === gbl.parchmentLotId);
                return pLot?.harvestLotId === hl.id;
            });
            let finalScore: number | null = null;
            if (relatedGbl && relatedGbl.cuppingScores.length > 0) {
                 const scoreInfo = relatedGbl.cuppingScores[0];
                 const session = data.cuppingSessions.find(s => s.id === scoreInfo.sessionId);
                 const sample = session?.samples.find(s => s.greenBeanLotId === relatedGbl.id);
                 if (session && sample && session.finalResults && session.finalResults[sample.id]) {
                    finalScore = session.finalResults[sample.id].totalScore;
                 }
            }
            return { name: hl.harvestDate, Score: finalScore };
        }).filter(d => d.Score !== null).sort((a,b) => new Date(a.name).getTime() - new Date(b.name).getTime());
    }, [data, selectedFarmName]);

    const lotsForDryingAnalysis = useMemo(() => {
        return data.parchmentLots.filter(pl => {
            const batch = data.processingBatches.find(pb => pb.id === pl.processingBatchId);
            return batch && batch.dryingLog && batch.dryingLog.length > 0;
        });
    }, [data.parchmentLots, data.processingBatches]);
    
    const dryingChartData = useMemo(() => {
        if (!selectedParchmentLotId) return undefined;
        const parchmentLot = data.parchmentLots.find(pl => pl.id === selectedParchmentLotId);
        const batch = data.processingBatches.find(pb => pb.id === parchmentLot?.processingBatchId);
        return batch?.dryingLog ?? undefined;
    }, [selectedParchmentLotId, data.parchmentLots, data.processingBatches]);


    return (
        <div className="space-y-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                <h1 className="text-3xl font-bold text-gray-900">Quality Insights Dashboard</h1>
                <p className="text-gray-600 mt-2">High-level analytics and AI-powered tools for quality improvement.</p>
            </div>

            {/* --- Annual Quality Report --- */}
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <div className="text-center">
                    <FileText className="mx-auto h-12 w-12 text-indigo-600" />
                    <h2 className="mt-2 text-2xl font-bold text-gray-800">Annual Quality Report</h2>
                    <p className="mt-1 text-sm text-gray-500 max-w-2xl mx-auto">Generate a comprehensive AI-powered report analyzing platform-wide data to uncover key trends, top performers, and actionable insights.</p>
                    <button
                        onClick={handleGenerateReport}
                        disabled={isReportLoading}
                        className="mt-4 inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300"
                    >
                        {isReportLoading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Bot className="h-5 w-5 mr-2" />}
                        {isReportLoading ? 'Generating Report...' : 'Generate with AI'}
                    </button>
                </div>

                {isReportLoading && <div className="text-center p-8 mt-6"><Loader2 className="h-10 w-10 text-indigo-500 animate-spin mx-auto" /><p className="mt-2">Analyzing platform data...</p></div>}
                {reportError && <div className="mt-6 bg-red-50 border-l-4 border-red-400 p-4"><p className="text-red-800">{reportError}</p></div>}
                
                {report && (
                    <div className="mt-8 pt-6 border-t animate-fade-in">
                        <h3 className="text-3xl font-bold text-center text-gray-900">{report.title}</h3>
                        
                        <div className="mt-6 bg-indigo-50 p-6 rounded-lg border border-indigo-200">
                            <h4 className="text-lg font-semibold text-gray-800">Executive Summary</h4>
                            <p className="mt-2 text-gray-700">{report.executiveSummary}</p>
                        </div>

                        <div className="mt-8">
                            <h4 className="text-xl font-bold text-gray-800 flex items-center mb-4"><Trophy className="mr-2 text-yellow-500"/> Top Performing Coffees</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {report.topPerformingCoffees.map(coffee => {
                                    const linkedLot = data.greenBeanLots.find(lot => lot.id === coffee.lotId);
                                    const lotLabel = linkedLot ? formatGreenBeanId(linkedLot) : coffee.lotId;
                                    const cardClassName = 'block bg-white p-4 rounded-lg border transition-shadow';
                                    const cardBody = (
                                        <>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-bold text-indigo-700">Lot {lotLabel}</p>
                                                    <p className="text-sm text-gray-600">{coffee.variety} - {coffee.process}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-2xl font-extrabold text-gray-800">{coffee.score.toFixed(2)}</p>
                                                    <p className="text-xs text-gray-500">Score</p>
                                                </div>
                                            </div>
                                            <p className="mt-2 text-sm text-gray-500 italic">"{coffee.tastingNotes}"</p>
                                        </>
                                    );

                                    if (!linkedLot) {
                                        return (
                                            <div key={coffee.lotId} className={`${cardClassName} bg-gray-50 border-gray-200`}>
                                                {cardBody}
                                            </div>
                                        );
                                    }

                                    return (
                                        <Link
                                            to={`/traceability/${linkedLot.id}`}
                                            key={coffee.lotId}
                                            className={`${cardClassName} hover:shadow-md`}
                                        >
                                            {cardBody}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h4 className="text-lg font-semibold text-gray-800 mb-2">Variety Analysis</h4>
                                <p className="text-sm">Top Variety: <span className="font-bold text-indigo-700">{report.varietyAnalysis.topVariety}</span></p>
                                <p className="text-sm">Average Score: <span className="font-bold text-indigo-700">{report.varietyAnalysis.averageScore.toFixed(2)}</span></p>
                                <p className="mt-2 text-sm text-gray-600">{report.varietyAnalysis.analysis}</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h4 className="text-lg font-semibold text-gray-800 mb-2">Processing Analysis</h4>
                                <p className="text-sm">Top Process: <span className="font-bold text-indigo-700">{report.processingAnalysis.topProcess}</span></p>
                                <p className="text-sm">Average Score: <span className="font-bold text-indigo-700">{report.processingAnalysis.averageScore.toFixed(2)}</span></p>
                                <p className="mt-2 text-sm text-gray-600">{report.processingAnalysis.analysis}</p>
                            </div>
                        </div>

                        <div className="mt-8">
                            <h4 className="text-xl font-bold text-gray-800 flex items-center mb-4"><TrendingUp className="mr-2 text-green-500"/> Key Quality Trends</h4>
                            <ul className="space-y-2 list-disc list-inside text-gray-700">
                                {report.keyTrends.map((trend, i) => <li key={i}>{trend}</li>)}
                            </ul>
                        </div>

                        <div className="mt-8">
                             <h4 className="text-xl font-bold text-gray-800 mb-4">Recommendations for Stakeholders</h4>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                 <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                                     <h5 className="font-bold flex items-center"><User className="mr-2 text-green-700"/> For Farmers</h5>
                                     <p className="mt-2 text-sm text-gray-600">{report.recommendations.forFarmers}</p>
                                 </div>
                                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                     <h5 className="font-bold flex items-center"><Droplets className="mr-2 text-blue-700"/> For Processors</h5>
                                     <p className="mt-2 text-sm text-gray-600">{report.recommendations.forProcessors}</p>
                                 </div>
                                  <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                                     <h5 className="font-bold flex items-center"><Flame className="mr-2 text-orange-700"/> For Roasters</h5>
                                     <p className="mt-2 text-sm text-gray-600">{report.recommendations.forRoasters}</p>
                                 </div>
                             </div>
                        </div>
                    </div>
                )}
            </div>

            {/* --- Comparative Charts --- */}
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center"><BarChart2 className="mr-2 text-blue-600"/> Comparative Analysis</h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    <div>
                        <h3 className="font-semibold text-center text-gray-700 mb-2">Processing Method Comparison</h3>
                        <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={processComparisonData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis domain={[80, 'dataMax + 1']} /><Tooltip /><Legend /><Bar dataKey="Average Score" fill="#4f46e5" /></BarChart></ResponsiveContainer></div>
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-2 gap-4">
                             <h3 className="font-semibold text-gray-700">Farm Performance Over Time</h3>
                                      <Select
                                          value={selectedFarmName}
                                          onChange={(v) => setSelectedFarmName((v as string) || '')}
                                          options={farmerNames.map(name => ({ value: name, label: name }))}
                                          className="w-48"
                                      />
                        </div>
                        <div className="h-80"><ResponsiveContainer width="100%" height="100%"><LineChart data={farmPerformanceData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis domain={[80, 'dataMax + 1']} /><Tooltip /><Legend /><Line type="monotone" dataKey="Score" stroke="#10b981" strokeWidth={2} activeDot={{ r: 8 }} /></LineChart></ResponsiveContainer></div>
                    </div>
                </div>
            </div>

            {/* --- AI-Powered Cupping Analysis --- */}
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <h2 className="text-xl font-bold text-gray-800 mb-4">AI-Powered Cupping Analysis</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Cupping Session</label>
                        <Select
                            value={selectedSessionId}
                            onChange={(v) => setSelectedSessionId((v as string) || '')}
                            options={data.cuppingSessions.map(s => ({ value: s.id, label: s.name }))}
                            placeholder="Select a session..."
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Quality Attribute</label>
                        <Select
                            value={selectedAttribute}
                            onChange={(v) => setSelectedAttribute((v as string) || '')}
                            options={SCA_ATTRIBUTES.map(attr => ({ value: attr, label: attr }))}
                            placeholder="Select attribute..."
                        />
                    </div>
                    <button onClick={handleGenerateCuppingInsights} disabled={!selectedSessionId || isLoading} className="w-full md:w-auto inline-flex items-center justify-center rounded-lg border border-transparent bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300 transition-all">
                        {isLoading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Lightbulb className="h-5 w-5 mr-2" />}
                        {isLoading ? 'Analyzing...' : 'Generate Insights'}
                    </button>
                </div>
                <div className="mt-6">
                    {error && <div className="bg-red-50 border-l-4 border-red-400 p-4"><p className="text-sm font-medium text-red-800">{error}</p></div>}
                    {insights && !isLoading && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4 border-t">
                        <div className="lg:col-span-3 bg-gray-50 p-4 rounded-lg">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center mb-3"><BarChart2 className="h-5 w-5 mr-2 text-blue-500"/> Performance Summary</h3>
                            <p className="text-gray-600">{insights.performanceSummary}</p>
                        </div>
                         <div className="bg-gray-50 p-4 rounded-lg">
                             <h3 className="text-lg font-bold text-gray-800 flex items-center mb-3"><Wand2 className="h-5 w-5 mr-2 text-purple-500"/> Key Descriptors</h3>
                            <div className="flex flex-wrap gap-2">{insights.keyDescriptors.map((desc, i) => (<span key={i} className="px-3 py-1 bg-purple-100 text-purple-800 text-sm font-medium rounded-full">{desc}</span>))}</div>
                        </div>
                         <div className="lg:col-span-2 bg-gray-50 p-4 rounded-lg">
                             <h3 className="text-lg font-bold text-gray-800 flex items-center mb-3"><CheckSquare className="h-5 w-5 mr-2 text-green-500"/> Roaster Recommendations</h3>
                            <ul className="space-y-2 list-disc list-inside text-gray-600">{insights.roasterRecommendations.map((rec, i) => <li key={i}>{rec}</li>)}</ul>
                        </div>
                    </div>}
                </div>
            </div>

            {/* --- Drying Curve Analysis Section --- */}
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center"><Wind className="mr-2 text-blue-500"/> Drying Curve Analysis</h2>
                <div className="max-w-xs">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Parchment Lot for Analysis</label>
                    <Select
                        value={selectedParchmentLotId}
                        onChange={(v) => setSelectedParchmentLotId((v as string) || '')}
                        options={lotsForDryingAnalysis.map(lot => ({ value: lot.id, label: `${lot.id} (${lot.processType})` }))}
                        placeholder="Select a lot..."
                    />
                </div>
                <div className="mt-6 h-96">
                    {!selectedParchmentLotId ? <div className="flex items-center justify-center h-full bg-gray-50 rounded-md"><p className="text-gray-500">Please select a parchment lot to view its drying curve.</p></div>
                    : <ResponsiveContainer width="100%" height="100%"><LineChart data={dryingChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis yAxisId="left" label={{ value: 'Moisture (%)', angle: -90, position: 'insideLeft' }} /><YAxis yAxisId="right" orientation="right" label={{ value: 'Temp (°C) / Humidity (%)', angle: 90, position: 'insideRight' }} /><Tooltip /><Legend /><Line yAxisId="left" type="monotone" dataKey="moistureContent" name="Moisture" stroke="#3b82f6" strokeWidth={2} activeDot={{ r: 8 }} /><Line yAxisId="right" type="monotone" dataKey="ambientTemp" name="Temperature" stroke="#ef4444" /><Line yAxisId="right" type="monotone" dataKey="relativeHumidity" name="Humidity" stroke="#22c55e" /></LineChart></ResponsiveContainer>}
                </div>
            </div>
        </div>
    );
};

export default QualityInsights;
