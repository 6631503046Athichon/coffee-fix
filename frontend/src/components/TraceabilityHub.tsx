
import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDataContext } from '../hooks/useDataContext';
import { useAuth } from '../contexts/AuthContext';
import { Search, ExternalLink, CheckCircle, Archive, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { UserRole } from '../types';

const PAGE_SIZE = 10;

const TraceabilityHub: React.FC = () => {
    const { data } = useDataContext();
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    // Check if user has access
    useEffect(() => {
        if (currentUser) {
            const hasAccess = currentUser.roles?.some(role => 
                role === UserRole.Admin || role === UserRole.Processor
            );
            if (!hasAccess) {
                navigate('/farmer-dashboard');
            }
        }
    }, [currentUser, navigate]);

    const enrichedLots = useMemo(() => {
        // Ensure data arrays exist and are arrays
        if (!data?.greenBeanLots || !Array.isArray(data.greenBeanLots)) {
            return [];
        }

        try {
            return data.greenBeanLots.map(gbl => {
                if (!gbl) return null;
                
                const parchmentLot = data.parchmentLots?.find(p => p?.id === gbl.parchmentLotId);
                const processingBatch = data.processingBatches?.find(b => b?.id === parchmentLot?.processingBatchId);
                const harvestLot = data.harvestLots?.find(h => h?.id === parchmentLot?.harvestLotId);
                
                let finalScore: string | number = 'N/A';
                const scoreInfo = gbl.cuppingScores?.[0];
                if (scoreInfo) {
                    try {
                        const session = data.cuppingSessions?.find(s => s?.id === scoreInfo.sessionId);
                        const sample = session?.samples?.find(s => s?.greenBeanLotId === gbl.id);
                        if (session && sample && session.finalResults && session.finalResults[sample.id]) {
                            finalScore = session.finalResults[sample.id].totalScore.toFixed(2);
                        } else if (scoreInfo.score) { // Fallback to score on GBL if final results not compiled
                            finalScore = scoreInfo.score.toFixed(2);
                        }
                    } catch (error) {
                        console.error('Error processing cupping score:', error);
                        // Use fallback score if available
                        if (scoreInfo.score) {
                            finalScore = scoreInfo.score.toFixed(2);
                        }
                    }
                }

                return {
                    ...gbl,
                    processType: processingBatch?.processType || 'N/A',
                    variety: harvestLot?.cherryVariety || 'N/A',
                    finalScore,
                };
            }).filter(Boolean); // Remove any null entries
        } catch (error) {
            console.error('Error enriching lots:', error);
            return [];
        }
    }, [data?.greenBeanLots, data?.parchmentLots, data?.processingBatches, data?.harvestLots, data?.cuppingSessions]);

    const filteredLots = useMemo(() => {
        if (!enrichedLots || enrichedLots.length === 0) {
            return [];
        }

        try {
            const searchLower = searchTerm.toLowerCase();
            return enrichedLots.filter(lot => {
                if (!lot) return false;
                return (
                    (lot.id?.toLowerCase() || '').includes(searchLower) ||
                    (lot.grade?.toLowerCase() || '').includes(searchLower) ||
                    (lot.processType?.toLowerCase() || '').includes(searchLower) ||
                    (lot.variety?.toLowerCase() || '').includes(searchLower)
                );
            }).sort((a, b) => {
                // Sort by ID descending (newest first)
                const aId = a?.id || '';
                const bId = b?.id || '';
                return bId.localeCompare(aId);
            });
        } catch (error) {
            console.error('Error filtering lots:', error);
            return [];
        }
    }, [enrichedLots, searchTerm]);

    // Reset page when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    // Pagination logic
    const totalPages = Math.ceil(filteredLots.length / PAGE_SIZE);
    const paginatedLots = filteredLots.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    // Show error if data processing failed
    if (error) {
        return (
            <div className="space-y-6">
                <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-lg font-semibold text-red-800 mb-1">Error Loading Traceability Data</h3>
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

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
                            {paginatedLots.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center">
                                        <Search className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                                        <p className="text-sm font-medium text-gray-500">
                                            {enrichedLots.length === 0
                                                ? 'No green bean lots available. Process some batches to create traceability records.'
                                                : 'No lots match your search criteria.'}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                paginatedLots.map(lot => {
                                    if (!lot || !lot.id) return null;
                                    return (
                                        <tr key={lot.id} className="hover:bg-gray-50 transition-colors duration-200">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-sm font-bold text-gray-900">{lot.id}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-sm text-gray-700">{lot.variety || 'N/A'}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-sm font-medium text-gray-900">{lot.processType || 'N/A'}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-sm text-gray-700">{lot.grade || 'N/A'}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-sm font-bold text-indigo-600">{lot.finalScore || 'N/A'}</span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                                                    lot.availabilityStatus === 'Available'
                                                        ? 'bg-green-100 text-green-700 border-green-200'
                                                        : 'bg-gray-100 text-gray-700 border-gray-200'
                                                }`}>
                                                    {lot.availabilityStatus === 'Available' ? <CheckCircle className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                                                    {lot.availabilityStatus || 'Unknown'}
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
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex justify-center items-center px-4 py-3 bg-gray-50 border-t border-gray-200">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={`w-7 h-7 text-xs font-medium rounded-md transition-colors ${
                                        currentPage === page
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                                >
                                    {page}
                                </button>
                            ))}
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TraceabilityHub;
