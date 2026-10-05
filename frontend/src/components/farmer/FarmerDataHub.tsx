import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { HarvestLot, User } from '../../types';
import { Download, Filter, ChevronRight, ChevronLeft, Database, Edit, Trash2, AlertTriangle } from 'lucide-react';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { PageHeader } from '../common/PageHeader';
import { Badge } from '../common/Badge';
import { Alert } from '../common/Alert';
import { csvDate, csvFilename, downloadCsv } from '../../utils/exportCSV';
import {
    deleteHarvestLot,
    HarvestLotDependents,
    HarvestLotProcessedError,
} from '../../services/lots/harvestLotService';

import { formatDateDisplay } from '../../utils/formatters';
import { canManageHarvestLot, isAdminUser, ownHarvestLots } from '../../utils/farmAccess';
import HarvestLotEditModal, { harvestLotLabel, useHarvestLotProcessing } from './modals/HarvestLotEditModal';

// Removed inline CustomFilterDropdown in favor of shared Select

const ITEMS_PER_PAGE = 10;

const DEPENDENTS_CHANGED_MESSAGE =
    'What is linked to this lot changed since you looked, so nothing was deleted. Check the new counts below.';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// The delete popup: first a plain confirm; then, if the backend refused
// because the lot is processed (an Admin only), what deleting it with
// everything linked would remove.
interface DeleteState {
    lot: HarvestLot;
    dependents: HarvestLotDependents | null;
}

interface FarmerDataHubProps {
    currentUser: User;
}

const FarmerDataHub: React.FC<FarmerDataHubProps> = ({ currentUser }) => {
    const { data, setData, refreshData } = useDataContext();
    const navigate = useNavigate();
    const [yearFilter, setYearFilter] = useState<string>('All');
    const [plotFilter, setPlotFilter] = useState<string>('All');
    const [currentPage, setCurrentPage] = useState(1);

    // Edit Modal State
    const [editingLot, setEditingLot] = useState<HarvestLot | null>(null);

    // Delete Modal State
    const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Admin and super admin can do everything here.
    const isAdmin = isAdminUser(currentUser);

    // Admin sees every lot; a farmer the lots on their own farms, matched by
    // id so a renamed farmer or a farm given to someone else keeps its lots.
    const myLots = useMemo(
        () => (isAdmin ? data.harvestLots : ownHarvestLots(currentUser, data.harvestLots, data.farms)),
        [isAdmin, currentUser, data.harvestLots, data.farms]
    );

    // Processed lots: their status stays Complete, and only an Admin may
    // delete them (with everything linked).
    const { isProcessed } = useHarvestLotProcessing();

    // The filters say what they filter: the harvest year, and the lot's farm
    // plot location.
    const yearOptions = useMemo(() => {
        const years = new Set(myLots.map(lot => new Date(lot.harvestDate).getFullYear().toString()));
        // fix: Explicitly type sort callback parameters to resolve TS error
        const sorted = Array.from(years).sort((a: string, b: string) => parseInt(b) - parseInt(a));
        return [{ value: 'All', label: 'All years' }, ...sorted.map(year => ({ value: year, label: year }))];
    }, [myLots]);

    const plotOptions = useMemo(() => {
        const plots = Array.from(new Set(myLots.map(lot => lot.farmPlotLocation))).sort();
        return [{ value: 'All', label: 'All locations' }, ...plots.map(plot => ({ value: plot, label: plot }))];
    }, [myLots]);

    const filteredLots = useMemo(() => {
        const time = (lot: HarvestLot) => new Date(lot.harvestDate).getTime() || 0;
        return myLots
            .filter(lot => {
                const lotYear = new Date(lot.harvestDate).getFullYear().toString();
                const yearMatch = yearFilter === 'All' || lotYear === yearFilter;
                const plotMatch = plotFilter === 'All' || lot.farmPlotLocation === plotFilter;
                return yearMatch && plotMatch;
            })
            // Newest harvest first; on the same day the higher lot number
            // first (HL-2026-10 before HL-2026-9). The sort is stable, so
            // anything still equal keeps its order.
            .sort((a, b) => time(b) - time(a)
                || harvestLotLabel(b).localeCompare(harvestLotLabel(a), undefined, { numeric: true }));
    }, [myLots, yearFilter, plotFilter]);

    const filtersActive = yearFilter !== 'All' || plotFilter !== 'All';
    const clearFilters = () => {
        setYearFilter('All');
        setPlotFilter('All');
    };

    // Reset page when filters change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [yearFilter, plotFilter]);

    const totalPages = Math.ceil(filteredLots.length / ITEMS_PER_PAGE);
    const paginatedLots = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredLots.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredLots, currentPage]);

    // Guard clause for null currentUser (after every hook, so hook order never changes)
    if (!currentUser) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-gray-500">Loading user data...</p>
            </div>
        );
    }

    const openDeleteModal = (lot: HarvestLot, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click
        setDeleteError(null);
        setDeleteState({ lot, dependents: null });
    };

    const closeDeleteModal = () => {
        if (isDeleting) return;
        setDeleteState(null);
        setDeleteError(null);
    };

    // cascade (Admin only, after seeing the counts) deletes the lot with its
    // whole chain: batches, drying logs, parchment lots, withdrawals and sales,
    // and the green bean lots made from it. The counts shown go along, so
    // anything linked since is never deleted unseen: the backend sends the new
    // counts back instead. A green bean lot still in use refuses it all, with
    // the lots to void or settle first in the message.
    const runDelete = async (cascade: boolean) => {
        if (!deleteState || isDeleting) return;
        const { lot, dependents } = deleteState;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await deleteHarvestLot(lot.id, cascade ? { cascade: true, expected: dependents ?? undefined } : {});
            setData(prev => ({
                ...prev,
                harvestLots: prev.harvestLots.filter(h => h.id !== lot.id),
            }));
            setDeleteState(null);
            // The batches, parchment and green bean lots changed too.
            if (cascade) void refreshData();
        } catch (error) {
            if (error instanceof HarvestLotProcessedError) {
                if (isAdmin) {
                    setDeleteState({ lot, dependents: error.dependents });
                    if (cascade) setDeleteError(DEPENDENTS_CHANGED_MESSAGE);
                } else {
                    setDeleteError('This lot has already been processed, so only an Admin can delete it.');
                }
            } else {
                setDeleteError(error instanceof Error && error.message ? error.message : 'Failed to delete harvest lot.');
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const openEditModal = (lot: HarvestLot, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click
        setEditingLot(lot);
    };

    // Exports every lot that matches the year and plot filters, across all
    // pages. With none, downloadCsv says there is nothing to export.
    const handleExportCSV = () => {
        const headers = ['Lot ID', 'Farmer', 'Variety', 'Weight (kg)', 'Harvest Date', 'Location', 'Status'];
        const rows = filteredLots.map(lot => [
            lot.displayId || lot.id,
            lot.farmerName,
            lot.cherryVariety,
            lot.weightKg,
            csvDate(lot.harvestDate),
            lot.farmPlotLocation,
            lot.status
        ]);

        const filename = csvFilename('harvest-lots', [
            yearFilter !== 'All' && yearFilter,
            plotFilter !== 'All' && plotFilter,
        ]);
        downloadCsv(filename, headers, rows);
    };

    // An Admin, or the owner of the lot's farm (the backend's rule). Not the
    // name on the lot, and not a collaborator on the farm.
    const canEdit = (lot: HarvestLot) => canManageHarvestLot(currentUser, lot, data.farms);
    // A processed lot is part of the traceability chain: only an Admin may
    // delete it, and only with everything linked to it.
    const canDelete = (lot: HarvestLot) => canEdit(lot) && (isAdmin || !isProcessed(lot));
    const lotLabel = harvestLotLabel;

    return (
        <div className="space-y-6 min-w-0 w-full overflow-hidden">
            <PageHeader
                title="Data Hub"
                description="Master table of all harvest data"
                icon={<Database className="h-7 w-7 text-blue-600" />}
            />

            {/* Filters and Actions Bar */}
            <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Filter className="h-4 w-4" />
                            Filters
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Year</span>
                            <Select
                                className="min-w-[140px]"
                                value={yearFilter}
                                onChange={(v) => setYearFilter((v as string) || 'All')}
                                options={yearOptions}
                                placeholder="All years"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Location</span>
                            <Select
                                className="min-w-[180px]"
                                value={plotFilter}
                                onChange={(v) => setPlotFilter((v as string) || 'All')}
                                options={plotOptions}
                                placeholder="All locations"
                            />
                        </div>
                    </div>
                    <Button
                        onClick={handleExportCSV}
                        variant="success"
                        icon={<Download className="h-4 w-4" />}
                    >
                        Export CSV
                    </Button>
                </div>
            </div>

            <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto overflow-y-hidden">
                    <table className="w-full divide-y divide-gray-200 table-fixed">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th scope="col" className="w-[12%] px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Lot ID</th>
                                <th scope="col" className="w-[14%] px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Farmer</th>
                                <th scope="col" className="w-[14%] px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Variety</th>
                                <th scope="col" className="w-[10%] px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Weight</th>
                                <th scope="col" className="w-[12%] px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Harvest Date</th>
                                <th scope="col" className="w-[14%] px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                                <th scope="col" className="w-[12%] px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                                <th scope="col" className="w-[12%] px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Details</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {paginatedLots.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center">
                                        <Database className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                        {myLots.length > 0 && filtersActive ? (
                                            <>
                                                <p className="text-gray-500 text-base font-medium">No harvest lots match these filters</p>
                                                <p className="text-gray-400 text-sm mb-4">Try another year or location, or clear the filters to see every lot</p>
                                                <Button type="button" variant="outline" onClick={clearFilters}>
                                                    Clear filters
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-gray-500 text-base font-medium">No harvest lots yet</p>
                                                <p className="text-gray-400 text-sm">Lots registered on the Harvest Lots page appear here</p>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                paginatedLots.map((lot: HarvestLot) => (
                                    <tr
                                        key={lot.id}
                                        onClick={() => navigate(`/farmer-dashboard/${lot.id}`)}
                                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                                    >
                                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 truncate">
                                            {lotLabel(lot)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 truncate">
                                            {lot.farmerName}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 truncate">
                                            {lot.cherryVariety}
                                        </td>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                            {lot.weightKg} kg
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {formatDateDisplay(lot.harvestDate)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant={
                                                lot.status === 'Complete' ? 'purple' : 'success'
                                            }>
                                                {lot.status}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm">
                                            {canEdit(lot) ? (
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={(e) => openEditModal(lot, e)}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-blue-600 transition-colors hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700"
                                                        title="Edit"
                                                        aria-label={`Edit harvest lot ${lotLabel(lot)}`}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </button>
                                                    {canDelete(lot) && (
                                                        <button
                                                            onClick={(e) => openDeleteModal(lot, e)}
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-red-600 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-700"
                                                            title="Delete"
                                                            aria-label={`Delete harvest lot ${lotLabel(lot)}`}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs font-medium text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/farmer-dashboard/${lot.id}`);
                                                }}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-gray-500 transition-colors hover:border-gray-200 hover:bg-gray-50 hover:text-blue-600"
                                                title="Open details"
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
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
                                        <span key={`e-${idx}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">...</span>
                                    ) : (
                                        <button key={slot} onClick={() => setCurrentPage(slot)} className={`w-8 h-8 text-sm font-medium rounded-md transition-colors flex items-center justify-center ${cp === slot ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>{slot}</button>
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
                        <span className="ml-4 text-sm text-gray-500">
                            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredLots.length)} of {filteredLots.length}
                        </span>
                    </div>
                )}
            </div>

            {/* Edit Modal (shared with the harvest lot details page) */}
            <HarvestLotEditModal
                lot={editingLot}
                currentUser={currentUser}
                onClose={() => setEditingLot(null)}
            />

            {/* Delete Modal */}
            <Modal
                isOpen={deleteState !== null}
                onClose={closeDeleteModal}
                title={deleteState?.dependents ? 'Delete a processed lot' : 'Delete harvest lot'}
                maxWidth="lg"
            >
                {deleteState && (
                    <div className="space-y-5">
                        {deleteState.dependents ? (
                            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600 mt-0.5" />
                                <div className="space-y-2 text-sm text-red-800">
                                    <p className="font-semibold">
                                        Harvest lot {lotLabel(deleteState.lot)} has already been processed.
                                    </p>
                                    <p>Deleting it also permanently deletes everything linked to it:</p>
                                    <ul className="list-disc space-y-1 pl-5" aria-label="Linked records">
                                        <li>{plural(deleteState.dependents.processingBatches, 'processing batch', 'processing batches')} (with their drying logs)</li>
                                        <li>{plural(deleteState.dependents.parchmentLots, 'parchment lot', 'parchment lots')} (with their test results)</li>
                                        <li>{plural(deleteState.dependents.withdrawals, 'parchment withdrawal', 'parchment withdrawals')}, including any sale records</li>
                                        <li>{plural(deleteState.dependents.greenBeanLots, 'green bean lot', 'green bean lots')} made from it (with their price history)</li>
                                    </ul>
                                    {deleteState.dependents.greenBeanLots > 0 && (
                                        <p>
                                            If any of those green bean lots is still in use (a withdrawal that is not void, roaster stock, a roast, a sale, an invoice or a cupping sample), nothing is deleted and you will see which lots to void or settle first.
                                        </p>
                                    )}
                                    <p className="font-semibold">This cannot be undone.</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-700">
                                Delete harvest lot <span className="font-semibold">{lotLabel(deleteState.lot)}</span>
                                {deleteState.lot.farmerName ? ` from ${deleteState.lot.farmerName}` : ''}? This cannot be undone.
                            </p>
                        )}

                        {deleteError && (
                            <div role="alert">
                                <Alert type="error" message={deleteError} />
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                            <Button
                                type="button"
                                onClick={closeDeleteModal}
                                variant="outline"
                                disabled={isDeleting}
                            >
                                Cancel
                            </Button>
                            {deleteState.dependents ? (
                                <Button
                                    type="button"
                                    variant="danger"
                                    onClick={() => runDelete(true)}
                                    loading={isDeleting}
                                >
                                    Delete with everything linked
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="danger"
                                    onClick={() => runDelete(false)}
                                    loading={isDeleting}
                                >
                                    Delete
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default FarmerDataHub;
