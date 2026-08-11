import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDataContext } from '@/hooks/useDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Search, ExternalLink, CheckCircle, Archive, AlertCircle, ChevronLeft, ChevronRight, QrCode, Star } from 'lucide-react';
import { UserRole, GreenBeanLot } from '@/types';
import { formatGreenBeanId } from '@/utils/formatDisplayId';
import { QRCodeModal } from '@/components/modals/qr/QRCodeModal';

const PAGE_SIZE = 10;
const NEW_TAG_HOURS = 24;

const isRecentLot = (dateString?: string | null): boolean => {
    if (!dateString) return false;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return false;
    const diffHours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    return diffHours >= 0 && diffHours <= NEW_TAG_HOURS;
};

interface EnrichedLot extends GreenBeanLot {
    processType: string;
    variety: string;
    finalScore: string | number;
}

const TraceabilityHub: React.FC = () => {
    const { data, refreshData } = useDataContext();
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [varietyFilter, setVarietyFilter] = useState('All');
    const [processFilter, setProcessFilter] = useState('All');
    const [gradeFilter, setGradeFilter] = useState('All');

    // Modal states
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [selectedLotForQR, setSelectedLotForQR] = useState<EnrichedLot | null>(null);

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
                        } else if (scoreInfo.score != null) {
                            finalScore = scoreInfo.score.toFixed(2);
                        }
                    } catch (error) {
                        console.error('Error processing cupping score:', error);
                        if (scoreInfo.score != null) {
                            finalScore = scoreInfo.score.toFixed(2);
                        }
                    }
                }

                return {
                    ...gbl,
                    processType: processingBatch?.processType || 'N/A',
                    variety: harvestLot?.cherryVariety || 'N/A',
                    finalScore,
                } as EnrichedLot;
            }).filter(Boolean) as EnrichedLot[];
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
                const matchesVariety = varietyFilter === 'All' || lot.variety === varietyFilter;
                const matchesProcess = processFilter === 'All' || lot.processType === processFilter;
                const matchesGrade = gradeFilter === 'All' || lot.grade === gradeFilter;
                const formattedLotId = formatGreenBeanId(lot).toLowerCase();
                return (
                    (lot.id?.toLowerCase() || '').includes(searchLower) ||
                    formattedLotId.includes(searchLower) ||
                    (lot.publicTraceId?.toLowerCase() || '').includes(searchLower) ||
                    (lot.grade?.toLowerCase() || '').includes(searchLower) ||
                    (lot.processType?.toLowerCase() || '').includes(searchLower) ||
                    (lot.variety?.toLowerCase() || '').includes(searchLower)
                ) && matchesVariety && matchesProcess && matchesGrade;
            }).sort((a, b) => {
                const aDate = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bDate = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
                if (aDate !== bDate) {
                    return bDate - aDate;
                }
                const aId = a?.id || '';
                const bId = b?.id || '';
                return bId.localeCompare(aId);
            });
        } catch (error) {
            console.error('Error filtering lots:', error);
            return [];
        }
    }, [enrichedLots, searchTerm, varietyFilter, processFilter, gradeFilter]);

    // Reset page when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, varietyFilter, processFilter, gradeFilter]);

    const varietyOptions = useMemo(() => {
        const set = new Set<string>();
        enrichedLots.forEach(lot => {
            if (lot?.variety) set.add(lot.variety);
        });
        return ['All', ...Array.from(set).sort()];
    }, [enrichedLots]);

    const processOptions = useMemo(() => {
        const set = new Set<string>();
        enrichedLots.forEach(lot => {
            if (lot?.processType) set.add(lot.processType);
        });
        return ['All', ...Array.from(set).sort()];
    }, [enrichedLots]);

    const gradeOptions = useMemo(() => {
        const set = new Set<string>();
        enrichedLots.forEach(lot => {
            if (lot?.grade) set.add(lot.grade);
        });
        return ['All', ...Array.from(set).sort()];
    }, [enrichedLots]);

    // Pagination logic
    const totalPages = Math.ceil(filteredLots.length / PAGE_SIZE);
    const paginatedLots = filteredLots.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    // QR Modal handlers
    const openQRModal = (lot: EnrichedLot) => {
        setSelectedLotForQR(lot);
        setQrModalOpen(true);
    };

    const handlePublicIdGenerated = (publicTraceId: string) => {
        if (refreshData) {
            refreshData();
        }
    };

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
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 space-y-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            Variety
                        </label>
                        <select
                            value={varietyFilter}
                            onChange={(e) => setVarietyFilter(e.target.value)}
                            className="block w-full border border-gray-300 rounded-xl bg-white py-2.5 px-3 text-sm font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        >
                            {varietyOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            Process
                        </label>
                        <select
                            value={processFilter}
                            onChange={(e) => setProcessFilter(e.target.value)}
                            className="block w-full border border-gray-300 rounded-xl bg-white py-2.5 px-3 text-sm font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        >
                            {processOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            Grade
                        </label>
                        <select
                            value={gradeFilter}
                            onChange={(e) => setGradeFilter(e.target.value)}
                            className="block w-full border border-gray-300 rounded-xl bg-white py-2.5 px-3 text-sm font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        >
                            {gradeOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white shadow-lg rounded-2xl overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Lot ID</th>
                                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Variety</th>
                                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Process</th>
                                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Grade</th>
                                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Score</th>
                                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">QR</th>
                                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {paginatedLots.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center">
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
                                    const hasPublicId = !!lot.publicTraceId;
                                    const displayScore = lot.processorScore != null
                                        ? lot.processorScore.toFixed(1)
                                        : lot.finalScore;
                                    const isNew = isRecentLot(lot.createdAt);

                                    return (
                                        <tr
                                            key={lot.id}
                                            className="hover:bg-gray-50 transition-colors duration-200"
                                        >
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-mono font-semibold text-gray-900" title={lot.id}>
                                                        {formatGreenBeanId(lot)}
                                                    </span>
                                                    {isNew && (
                                                        <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 border border-rose-200">
                                                            new
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <span className="text-sm text-gray-700">{lot.variety || 'N/A'}</span>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <span className="text-sm font-medium text-gray-900">{lot.processType || 'N/A'}</span>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <span className="text-sm text-gray-700">{lot.grade || 'N/A'}</span>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                    {lot.processorScore != null && lot.processorScore >= 80 && (
                                                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                                    )}
                                                    <span className="text-sm font-bold text-indigo-600">{displayScore}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                                                    lot.availabilityStatus === 'Available'
                                                        ? 'bg-green-100 text-green-700 border-green-200'
                                                        : 'bg-gray-100 text-gray-700 border-gray-200'
                                                }`}>
                                                    {lot.availabilityStatus === 'Available' ? <CheckCircle className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                                                    {lot.availabilityStatus || 'Unknown'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <button
                                                    onClick={() => openQRModal(lot)}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                                        hasPublicId
                                                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200'
                                                            : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                                                    }`}
                                                    title={hasPublicId ? 'View/Download QR' : 'Generate QR'}
                                                >
                                                    <QrCode className="h-3.5 w-3.5" />
                                                    {hasPublicId ? 'QR' : 'Generate'}
                                                </button>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <Link
                                                    to={hasPublicId ? `/trace/${lot.publicTraceId}` : `/traceability/${lot.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-bold text-sm transition-colors duration-200 hover:underline"
                                                >
                                                    View <ExternalLink className="h-4 w-4" />
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
                                className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            {(() => {
                                const TOTAL_SLOTS = 7;
                                const tp = totalPages;
                                const cp = currentPage;
                                let slots: (number | 'ellipsis')[] = [];
                                if (tp <= TOTAL_SLOTS) {
                                    slots = Array.from({ length: tp }, (_, i) => i + 1);
                                } else if (cp <= 4) {
                                    slots = [1, 2, 3, 4, 5, 'ellipsis', tp];
                                } else if (cp >= tp - 3) {
                                    slots = [1, 'ellipsis', tp - 4, tp - 3, tp - 2, tp - 1, tp];
                                } else {
                                    slots = [1, 'ellipsis', cp - 1, cp, cp + 1, 'ellipsis', tp];
                                }
                                return slots.map((slot, idx) => (
                                    slot === 'ellipsis' ? (
                                        <span key={`e-${idx}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-xs">...</span>
                                    ) : (
                                        <button key={slot} onClick={() => setCurrentPage(slot)} className={`w-8 h-8 text-xs font-medium rounded-md transition-colors flex items-center justify-center ${cp === slot ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>{slot}</button>
                                    )
                                ));
                            })()}
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* QR Code Modal */}
            {selectedLotForQR && (
                <QRCodeModal
                    isOpen={qrModalOpen}
                    onClose={() => {
                        setQrModalOpen(false);
                        setSelectedLotForQR(null);
                    }}
                    lotId={selectedLotForQR.id}
                    publicTraceId={selectedLotForQR.publicTraceId}
                    onPublicIdGenerated={handlePublicIdGenerated}
                />
            )}
        </div>
    );
};

export default TraceabilityHub;
