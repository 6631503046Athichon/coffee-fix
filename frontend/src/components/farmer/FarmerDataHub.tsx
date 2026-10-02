import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { HarvestLot, User } from '../../types';
import { Download, Filter, ChevronRight, ChevronLeft, Database, Edit, Trash2, Package, Lock, AlertTriangle } from 'lucide-react';
import DatePicker from '../common/DatePicker';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PageHeader } from '../common/PageHeader';
import { Badge } from '../common/Badge';
import { Alert } from '../common/Alert';
import { csvDate, csvFilename, downloadCsv } from '../../utils/exportCSV';
import {
    deleteHarvestLot,
    HarvestLotDependents,
    HarvestLotProcessedError,
    updateHarvestLot,
} from '../../services/lots/harvestLotService';

import { formatDateDisplay } from '../../utils/formatters';
import { canManageHarvestLot, isAdminUser, ownHarvestLots } from '../../utils/farmAccess';

// Removed inline CustomFilterDropdown in favor of shared Select

const ITEMS_PER_PAGE = 10;

const PROCESSED_LOCK_MESSAGE = 'This lot has already been processed, so its weight and status are locked.';
const COMPLETE_LOCK_MESSAGE =
    'This lot is marked Complete, so its weight is locked. Set its status back to Ready for Processing to change the weight or delete the lot.';
const ADMIN_PROCESSED_MESSAGE =
    'This lot has already been processed, so its status stays Complete. As an Admin you can still correct its weight, which the traceability record uses.';
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
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingLot, setEditingLot] = useState<HarvestLot | null>(null);
    const [editFormData, setEditFormData] = useState({
        farmerName: '',
        cherryVariety: '',
        weightKg: '',
        harvestDate: '',
        farmPlotLocation: '',
        status: 'Ready for Processing',
        farmId: '',
        cropYearId: ''
    });
    const [editError, setEditError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

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

    // A lot is processed once a batch or parchment lot draws on it: its status
    // then stays Complete, its weight is locked (an Admin may correct it), and
    // only an Admin may delete it (with everything linked). The loaded batches
    // and parchment lots are only the latest ones, so a lot that says Complete
    // is treated as processed too, except that its status may be set back to
    // Ready (the backend refuses that if something does draw on it).
    const processedLotIds = useMemo(() => {
        const ids = new Set<string>();
        data.processingBatches.forEach(b => { if (b.harvestLotId) ids.add(b.harvestLotId); });
        data.parchmentLots.forEach(p => { if (p.harvestLotId) ids.add(p.harvestLotId); });
        return ids;
    }, [data.processingBatches, data.parchmentLots]);
    const hasLinkedRecords = (lot: HarvestLot) => processedLotIds.has(lot.id);
    const isProcessed = (lot: HarvestLot) => lot.status === 'Complete' || hasLinkedRecords(lot);

    // The farms a lot may move to: any for an Admin, else the user's own (the
    // backend refuses another farmer's farm). The lot's current farm is always
    // listed so the field shows it.
    const editFarmOptions = useMemo(() => {
        const farmLabel = (f: { id: string; farmName?: string; name?: string; location?: string }) =>
            [f.farmName || f.name, f.location].filter(Boolean).join(' • ') || f.id;
        const farms = isAdmin ? data.farms : data.farms.filter(f => f.ownerUserId === currentUser.id);
        const options = farms.map(f => ({ value: f.id, label: farmLabel(f) }));
        const current = editingLot?.farmId;
        if (current && !options.some(o => o.value === current)) {
            const farm = data.farms.find(f => f.id === current) || editingLot?.farm;
            options.unshift({ value: current, label: farm ? farmLabel(farm) : current });
        }
        return options;
    }, [data.farms, isAdmin, currentUser.id, editingLot]);

    const editCropYearOptions = useMemo(() => [
        { value: '', label: 'No crop year' },
        ...[...data.cropYears]
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
            .map(cy => ({ value: cy.id, label: cy.year })),
    ], [data.cropYears]);

    const uniqueYears = useMemo(() => {
        const years = new Set(myLots.map(lot => new Date(lot.harvestDate).getFullYear().toString()));
        // fix: Explicitly type sort callback parameters to resolve TS error
        return ['All', ...Array.from(years).sort((a: string, b: string) => parseInt(b) - parseInt(a))];
    }, [myLots]);

    const uniquePlots = useMemo(() => {
        const plots = new Set(myLots.map(lot => lot.farmPlotLocation));
        return ['All', ...Array.from(plots).sort()];
    }, [myLots]);

    const filteredLots = useMemo(() => {
        return myLots
            .filter(lot => {
                const lotYear = new Date(lot.harvestDate).getFullYear().toString();
                const yearMatch = yearFilter === 'All' || lotYear === yearFilter;
                const plotMatch = plotFilter === 'All' || lot.farmPlotLocation === plotFilter;
                return yearMatch && plotMatch;
            })
            .sort((a, b) => new Date(b.harvestDate).getTime() - new Date(a.harvestDate).getTime());
    }, [myLots, yearFilter, plotFilter]);

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
    // whole chain: batches, drying logs, parchment lots, withdrawals and sales.
    // The counts shown go along, so anything linked since is never deleted
    // unseen: the backend sends the new counts back instead.
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
        setEditError(null);
        setEditFormData({
            farmerName: lot.farmerName,
            cherryVariety: lot.cherryVariety,
            weightKg: lot.weightKg.toString(),
            harvestDate: lot.harvestDate,
            farmPlotLocation: lot.farmPlotLocation,
            status: lot.status,
            farmId: lot.farmId || '',
            cropYearId: lot.cropYearId || ''
        });
        setIsEditModalOpen(true);
    };

    const closeEditModal = () => {
        if (isSaving) return;
        setIsEditModalOpen(false);
        setEditingLot(null);
        setEditError(null);
    };

    // What the edit popup locks on the lot being edited (the backend enforces
    // the same): a processed lot's weight for everyone but an Admin, and its
    // status while a known batch or parchment lot draws on it. A lot that only
    // says Complete keeps its status open, so it can be set back to Ready.
    const weightLocked = editingLot ? isProcessed(editingLot) && !isAdmin : false;
    const statusLocked = editingLot ? hasLinkedRecords(editingLot) : false;
    const editingNote = !editingLot
        ? null
        : weightLocked
            ? (statusLocked ? PROCESSED_LOCK_MESSAGE : COMPLETE_LOCK_MESSAGE)
            : (isAdmin && statusLocked ? ADMIN_PROCESSED_MESSAGE : null);

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingLot || isSaving) return;

        // Send only what was changed: the backend writes every key it is
        // sent, so an untouched field must not go out at all.
        const changes: Partial<HarvestLot> = {};
        const textFields = [
            ['farmerName', 'Farmer name'],
            ['cherryVariety', 'Cherry variety'],
            ['farmPlotLocation', 'Farm plot location'],
        ] as const;
        for (const [field, label] of textFields) {
            const value = editFormData[field].trim();
            if (value === (editingLot[field] || '').trim()) continue;
            if (!value) {
                setEditError(`${label} cannot be blank.`);
                return;
            }
            changes[field] = value;
        }
        if (editFormData.harvestDate !== editingLot.harvestDate) {
            if (!editFormData.harvestDate) {
                setEditError('Harvest date cannot be blank.');
                return;
            }
            changes.harvestDate = editFormData.harvestDate;
        }
        // Locked fields never go out (the backend would refuse them).
        if (!weightLocked) {
            const weight = parseFloat(editFormData.weightKg);
            if (weight !== editingLot.weightKg) {
                if (!Number.isFinite(weight) || weight <= 0) {
                    setEditError('Weight must be a number greater than 0.');
                    return;
                }
                changes.weightKg = weight;
            }
        }
        if (!statusLocked && editFormData.status !== editingLot.status) {
            changes.status = editFormData.status as 'Ready for Processing' | 'Complete';
        }
        // The farm can be changed but not cleared; the backend checks the
        // caller may use the new one. An empty crop year clears it.
        if (editFormData.farmId && editFormData.farmId !== (editingLot.farmId || '')) {
            changes.farmId = editFormData.farmId;
        }
        if (editFormData.cropYearId !== (editingLot.cropYearId || '')) {
            changes.cropYearId = editFormData.cropYearId;
        }

        if (Object.keys(changes).length === 0) {
            closeEditModal();
            return;
        }

        setIsSaving(true);
        setEditError(null);
        try {
            const updatedLot = await updateHarvestLot(editingLot.id, changes);
            setData(prev => ({
                ...prev,
                harvestLots: prev.harvestLots.map(lot => (lot.id === editingLot.id ? updatedLot : lot)),
            }));
            setIsEditModalOpen(false);
            setEditingLot(null);
        } catch (error) {
            setEditError(error instanceof Error && error.message ? error.message : 'Failed to update harvest lot.');
        } finally {
            setIsSaving(false);
        }
    };

    // Exports every lot that matches the year and plot filters, across all pages.
    const handleExportCSV = () => {
        if (filteredLots.length === 0) return;

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
    const lotLabel = (lot: HarvestLot) => lot.displayId || lot.id.substring(0, 8).toUpperCase();

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
                        <Select
                            className="min-w-[140px]"
                            value={yearFilter}
                            onChange={(v) => setYearFilter((v as string) || 'All')}
                            options={uniqueYears}
                            placeholder="All Years"
                        />
                        <Select
                            className="min-w-[180px]"
                            value={plotFilter}
                            onChange={(v) => setPlotFilter((v as string) || 'All')}
                            options={uniquePlots}
                            placeholder="All Locations"
                        />
                    </div>
                    <Button
                        onClick={handleExportCSV}
                        disabled={filteredLots.length === 0}
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
                                        <p className="text-gray-500 text-base font-medium">No harvest data found</p>
                                        <p className="text-gray-400 text-sm">Try adjusting your filters</p>
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
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-indigo-600 transition-colors hover:border-indigo-100 hover:bg-indigo-50 hover:text-indigo-700"
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

            {/* Edit Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={closeEditModal}
                title="Edit Harvest Lot"
                maxWidth="2xl"
            >
                <form onSubmit={handleEditSubmit} className="space-y-6">
                    {/* Lot ID Badge */}
                    {editingLot && (
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 rounded-lg">
                                    <Package className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Lot ID</p>
                                    <p className="text-sm font-mono font-semibold text-gray-900">{lotLabel(editingLot)}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Basic Information */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">Basic Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Farmer Name"
                                type="text"
                                id="edit-farmerName"
                                value={editFormData.farmerName}
                                onChange={e => setEditFormData({ ...editFormData, farmerName: e.target.value })}
                                required
                                fullWidth
                            />
                            <Input
                                label="Cherry Variety"
                                type="text"
                                id="edit-cherryVariety"
                                value={editFormData.cherryVariety}
                                onChange={e => setEditFormData({ ...editFormData, cherryVariety: e.target.value })}
                                required
                                fullWidth
                            />
                        </div>
                    </div>

                    {/* Harvest Details */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">Harvest Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Weight (kg)"
                                type="number"
                                id="edit-weightKg"
                                value={editFormData.weightKg}
                                onChange={e => setEditFormData({ ...editFormData, weightKg: e.target.value })}
                                required={!weightLocked}
                                disabled={weightLocked}
                                min="0"
                                step="0.01"
                                fullWidth
                            />
                            <DatePicker
                                value={editFormData.harvestDate}
                                onChange={(date) => setEditFormData({ ...editFormData, harvestDate: date })}
                                label="Harvest Date"
                                required
                            />
                        </div>
                    </div>

                    {/* Location & Status */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">Location & Status</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Farm</label>
                                <Select
                                    value={editFormData.farmId}
                                    onChange={(v) => setEditFormData({ ...editFormData, farmId: (v as string) || '' })}
                                    options={editFarmOptions}
                                    placeholder="Not linked to a farm"
                                />
                                {isAdmin && editingLot && editFormData.farmId !== (editingLot.farmId || '') && (
                                    <p className="mt-1 text-xs text-gray-500">The lot will belong to the owner of this farm.</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Crop Year</label>
                                <Select
                                    value={editFormData.cropYearId}
                                    onChange={(v) => setEditFormData({ ...editFormData, cropYearId: (v as string) || '' })}
                                    options={editCropYearOptions}
                                    placeholder="No crop year"
                                />
                            </div>
                            <Input
                                label="Farm Plot Location"
                                type="text"
                                id="edit-farmPlotLocation"
                                value={editFormData.farmPlotLocation}
                                onChange={e => setEditFormData({ ...editFormData, farmPlotLocation: e.target.value })}
                                required
                                fullWidth
                            />
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                                <Select
                                    value={editFormData.status}
                                    onChange={(v) => setEditFormData({ ...editFormData, status: v as string })}
                                    options={[
                                        { value: 'Ready for Processing', label: 'Ready for Processing' },
                                        { value: 'Complete', label: 'Complete' }
                                    ]}
                                    placeholder="Select status"
                                    disabled={statusLocked}
                                />
                            </div>
                        </div>
                        {editingNote && (
                            <p className="flex items-center gap-2 text-sm text-gray-600">
                                <Lock className="h-4 w-4 flex-shrink-0 text-gray-400" />
                                {editingNote}
                            </p>
                        )}
                    </div>

                    {editError && (
                        <div role="alert">
                            <Alert type="error" message={editError} />
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                        <Button
                            type="button"
                            onClick={closeEditModal}
                            variant="outline"
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            loading={isSaving}
                        >
                            Save Changes
                        </Button>
                    </div>
                </form>
            </Modal>

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
                                    </ul>
                                    <p>
                                        {deleteState.dependents.greenBeanLots === 1
                                            ? '1 green bean lot loses its link back to this harvest.'
                                            : `${deleteState.dependents.greenBeanLots} green bean lots lose their link back to this harvest.`}
                                    </p>
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
