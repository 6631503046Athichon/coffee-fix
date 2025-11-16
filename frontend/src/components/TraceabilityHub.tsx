
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDataContext } from '../hooks/useDataContext';
import { Search, ExternalLink, CheckCircle, Archive } from 'lucide-react';

const TraceabilityHub: React.FC = () => {
    const { data } = useDataContext();
    const [searchTerm, setSearchTerm] = useState('');

    const enrichedLots = useMemo(() => {
        return data.greenBeanLots.map(gbl => {
            const parchmentLot = data.parchmentLots.find(p => p.id === gbl.parchmentLotId);
            const processingBatch = data.processingBatches.find(b => b.id === parchmentLot?.processingBatchId);
            const harvestLot = data.harvestLots.find(h => h.id === parchmentLot?.harvestLotId);
            
            let finalScore: string | number = 'N/A';
            const scoreInfo = gbl.cuppingScores[0];
            if (scoreInfo) {
                const session = data.cuppingSessions.find(s => s.id === scoreInfo.sessionId);
                const sample = session?.samples.find(s => s.greenBeanLotId === gbl.id);
                if (session && sample && session.finalResults && session.finalResults[sample.id]) {
                    finalScore = session.finalResults[sample.id].totalScore.toFixed(2);
                } else if (scoreInfo.score) { // Fallback to score on GBL if final results not compiled
                    finalScore = scoreInfo.score.toFixed(2);
                }
            }

            return {
                ...gbl,
                processType: processingBatch?.processType || 'N/A',
                variety: harvestLot?.cherryVariety || 'N/A',
                finalScore,
            };
        });
    }, [data.greenBeanLots, data.parchmentLots, data.processingBatches, data.harvestLots, data.cuppingSessions]);

    const filteredLots = useMemo(() => {
        return enrichedLots.filter(lot => 
            lot.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            lot.grade.toLowerCase().includes(searchTerm.toLowerCase()) ||
            lot.processType.toLowerCase().includes(searchTerm.toLowerCase()) ||
            lot.variety.toLowerCase().includes(searchTerm.toLowerCase())
        ).sort((a, b) => a.id.localeCompare(b.id));
    }, [enrichedLots, searchTerm]);

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                <h1 className="text-3xl font-bold text-gray-900">Traceability Curation Hub</h1>
                <p className="text-gray-600 mt-2">Manage and view public traceability pages for green bean lots.</p>
            </div>

            {/* Search Bar */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search by Lot ID, variety, process, or grade..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-all"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white shadow-lg rounded-2xl overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead>
                            <tr className="bg-gray-900 border-b border-gray-200">
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Lot ID</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Variety</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Process</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Grade</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Final Score</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredLots.map(lot => (
                                <tr key={lot.id} className="hover:bg-gray-50 transition-colors duration-200">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm font-bold text-gray-900">{lot.id}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-700">{lot.variety}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm font-medium text-gray-900">{lot.processType}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm text-gray-700">{lot.grade}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-sm font-bold text-indigo-600">{lot.finalScore}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                                            lot.availabilityStatus === 'Available'
                                                ? 'bg-green-100 text-green-700 border-green-200'
                                                : 'bg-gray-100 text-gray-700 border-gray-200'
                                        }`}>
                                            {lot.availabilityStatus === 'Available' ? <CheckCircle className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                                            {lot.availabilityStatus}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <Link
                                            to={`/traceability/${lot.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-bold text-sm transition-colors duration-200 hover:underline"
                                        >
                                            View Page <ExternalLink className="h-4 w-4" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                     {filteredLots.length === 0 && (
                        <div className="text-center p-12 text-gray-500">
                            <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-medium">No lots match your search criteria.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TraceabilityHub;
