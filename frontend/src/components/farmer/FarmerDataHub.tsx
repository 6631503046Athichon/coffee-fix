import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { HarvestLot, User, UserRole } from '../../types';
import { Download, Filter, ChevronRight, ChevronLeft, Database, Edit, Trash2, Package } from 'lucide-react';
import DatePicker from '../common/DatePicker';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PageHeader } from '../common/PageHeader';
import { Badge } from '../common/Badge';
import { exportToCSV } from '../../utils/exportCSV';
import { deleteHarvestLot, updateHarvestLot } from '../../services/harvestLotService';

import { formatDateDisplay } from '../../utils/formatters';

// Removed inline CustomFilterDropdown in favor of shared Select

const ITEMS_PER_PAGE = 10;

interface FarmerDataHubProps {
    currentUser: User;
}

const FarmerDataHub: React.FC<FarmerDataHubProps> = ({ currentUser }) => {
    const { data, setData } = useDataContext();
    const navigate = useNavigate();
    const [yearFilter, setYearFilter] = useState<string>('All');
    const [plotFilter, setPlotFilter] = useState<string>('All');
    const [currentPage, setCurrentPage] = useState(1);

    // Guard clause for null currentUser
    if (!currentUser) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-gray-500">Loading user data...</p>
            </div>
        );
    }

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingLot, setEditingLot] = useState<HarvestLot | null>(null);
    const [editFormData, setEditFormData] = useState({
        farmerName: '',
        cherryVariety: '',
        weightKg: '',
        harvestDate: '',
        farmPlotLocation: '',
        status: 'Ready for Processing'
    });

    const uniqueYears = useMemo(() => {
        const years = new Set(data.harvestLots.map(lot => new Date(lot.harvestDate).getFullYear().toString()));
        // fix: Explicitly type sort callback parameters to resolve TS error
        return ['All', ...Array.from(years).sort((a: string, b: string) => parseInt(b) - parseInt(a))];
    }, [data.harvestLots]);

    const uniquePlots = useMemo(() => {
        const plots = new Set(data.harvestLots.map(lot => lot.farmPlotLocation));
        return ['All', ...Array.from(plots).sort()];
    }, [data.harvestLots]);
    
    const filteredLots = useMemo(() => {
        return data.harvestLots
            .filter(lot => {
                // Filter by current user (farmers see only their own data, admins see all)
                const isAdmin = currentUser.roles?.includes(UserRole.Admin) || false;
                const userMatch = isAdmin || lot.farmerName === currentUser.name;

                const lotYear = new Date(lot.harvestDate).getFullYear().toString();
                const yearMatch = yearFilter === 'All' || lotYear === yearFilter;
                const plotMatch = plotFilter === 'All' || lot.farmPlotLocation === plotFilter;
                return userMatch && yearMatch && plotMatch;
            })
            .sort((a, b) => new Date(b.harvestDate).getTime() - new Date(a.harvestDate).getTime());
    }, [data.harvestLots, yearFilter, plotFilter, currentUser]);

    // Reset page when filters change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [yearFilter, plotFilter]);

    const totalPages = Math.ceil(filteredLots.length / ITEMS_PER_PAGE);
    const paginatedLots = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredLots.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredLots, currentPage]);

    const handleDelete = async (lotId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click
        if (window.confirm('Are you sure you want to delete this harvest lot? This action cannot be undone.')) {
            try {
                await deleteHarvestLot(lotId);
                setData(prev => ({
                    ...prev,
                    harvestLots: prev.harvestLots.filter(lot => lot.id !== lotId),
                }));
            } catch (error) {
                console.error('Failed to delete harvest lot:', error);
                alert('Failed to delete harvest lot. Please try again.');
            }
        }
    };

    const openEditModal = (lot: HarvestLot, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click
        setEditingLot(lot);
        setEditFormData({
            farmerName: lot.farmerName,
            cherryVariety: lot.cherryVariety,
            weightKg: lot.weightKg.toString(),
            harvestDate: lot.harvestDate,
            farmPlotLocation: lot.farmPlotLocation,
            status: lot.status
        });
        setIsEditModalOpen(true);
    };

    const closeEditModal = () => {
        setIsEditModalOpen(false);
        setEditingLot(null);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingLot) return;

        try {
            const updatedLot = await updateHarvestLot(editingLot.id, {
                farmerName: editFormData.farmerName,
                cherryVariety: editFormData.cherryVariety,
                weightKg: parseFloat(editFormData.weightKg),
                harvestDate: editFormData.harvestDate,
                farmPlotLocation: editFormData.farmPlotLocation,
                status: editFormData.status as 'Ready for Processing' | 'Complete',
            });
            setData(prev => ({
                ...prev,
                harvestLots: prev.harvestLots.map(lot => (lot.id === editingLot.id ? updatedLot : lot)),
            }));
            closeEditModal();
        } catch (error) {
            console.error('Failed to update harvest lot:', error);
            alert('Failed to update harvest lot. Please try again.');
        }
    };

    const handleExportCSV = () => {
        if (filteredLots.length === 0) {
            alert("No data to export.");
            return;
        }

        const headers = ['Lot ID', 'Farmer', 'Variety', 'Weight (kg)', 'Harvest Date', 'Location', 'Status'];
        const rows = filteredLots.map(lot => [
            lot.id,
            lot.farmerName,
            lot.cherryVariety,
            lot.weightKg.toString(),
            lot.harvestDate,
            lot.farmPlotLocation,
            lot.status
        ]);

        exportToCSV({ filename: 'harvest_data_export.csv', headers, data: rows });
    };

    const isAdmin = currentUser.roles?.includes(UserRole.Admin);
    const canEdit = (lot: HarvestLot) => {
        return isAdmin || lot.farmerName === currentUser.name;
    };

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
                                            {lot.displayId || lot.id.substring(0, 8).toUpperCase()}
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
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDelete(lot.id, e)}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-red-600 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-700"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
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
                                    <p className="text-sm font-mono font-semibold text-gray-900">{editingLot.displayId || editingLot.id.substring(0, 8).toUpperCase()}</p>
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
                                required
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
                                />
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                        <Button
                            type="button"
                            onClick={closeEditModal}
                            variant="outline"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                        >
                            Save Changes
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default FarmerDataHub;
