import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { HarvestLot, User, UserRole } from '../../types';
import { Download, Filter, ChevronRight, Database, Edit, Trash2 } from 'lucide-react';
import DatePicker from '../common/DatePicker';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PageHeader } from '../common/PageHeader';
import { Badge } from '../common/Badge';
import { exportToCSV } from '../../utils/exportCSV';
import { formatHarvestLotId } from '../../utils/formatHarvestLotId';

// Removed inline CustomFilterDropdown in favor of shared Select

interface FarmerDataHubProps {
    currentUser: User;
}

const FarmerDataHub: React.FC<FarmerDataHubProps> = ({ currentUser }) => {
    const { data, setData } = useDataContext();
    const navigate = useNavigate();
    const [yearFilter, setYearFilter] = useState<string>('All');
    const [plotFilter, setPlotFilter] = useState<string>('All');

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
        return data.harvestLots.filter(lot => {
            // Filter by current user (farmers see only their own data, admins see all)
            const isAdmin = currentUser.roles?.includes(UserRole.Admin) || false;
            const userMatch = isAdmin || lot.farmerName === currentUser.name;

            const lotYear = new Date(lot.harvestDate).getFullYear().toString();
            const yearMatch = yearFilter === 'All' || lotYear === yearFilter;
            const plotMatch = plotFilter === 'All' || lot.farmPlotLocation === plotFilter;
            return userMatch && yearMatch && plotMatch;
        });
    }, [data.harvestLots, yearFilter, plotFilter, currentUser]);

    const handleDelete = (lotId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click
        if (window.confirm('Are you sure you want to delete this harvest lot? This action cannot be undone.')) {
            setData(prev => ({
                ...prev,
                harvestLots: prev.harvestLots.filter(lot => lot.id !== lotId),
            }));
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

    const handleEditSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingLot) return;

        setData(prev => ({
            ...prev,
            harvestLots: prev.harvestLots.map(lot =>
                lot.id === editingLot.id
                    ? {
                        ...lot,
                        farmerName: editFormData.farmerName,
                        cherryVariety: editFormData.cherryVariety,
                        weightKg: parseFloat(editFormData.weightKg),
                        harvestDate: editFormData.harvestDate,
                        farmPlotLocation: editFormData.farmPlotLocation,
                        status: editFormData.status as 'Ready for Processing' | 'Processing'
                    }
                    : lot
            )
        }));
        closeEditModal();
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

    const isAdmin = currentUser.role === UserRole.Admin;
    const canEdit = (lot: HarvestLot) => {
        return isAdmin || lot.farmerName === currentUser.name;
    };

    return (
        <div className="space-y-6">
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

            <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-900">
                            <tr>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Lot ID</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Farmer</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Variety</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Weight (kg)</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Harvest Date</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Details</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredLots.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center">
                                        <Database className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                                        <p className="text-gray-500 text-lg font-medium">No harvest data found</p>
                                        <p className="text-gray-400 text-sm">Try adjusting your filters</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredLots.map((lot: HarvestLot) => (
                                    <tr
                                        key={lot.id}
                                        onClick={() => navigate(`/farmer-dashboard/${lot.id}`)}
                                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                            {formatHarvestLotId(lot.id, 'short', lot.harvestDate)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                            {lot.farmerName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                            {lot.cherryVariety}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {lot.weightKg} kg
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {lot.harvestDate}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <Badge variant={lot.status === 'Processing' ? 'primary' : 'success'}>
                                                {lot.status}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                                            {canEdit(lot) ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={(e) => openEditModal(lot, e)}
                                                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-blue-600 transition-colors hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700"
                                                        title="Edit"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDelete(lot.id, e)}
                                                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-red-600 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-700"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs font-medium text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/farmer-dashboard/${lot.id}`);
                                                }}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-indigo-600 transition-colors hover:border-indigo-100 hover:bg-indigo-50 hover:text-indigo-700"
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
            </div>

            {/* Edit Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={closeEditModal}
                title="Edit Harvest Lot"
                maxWidth="2xl"
            >
                <form onSubmit={handleEditSubmit}>
                            <div className="space-y-5">
                                {editingLot && (
                                    <Input
                                        label="Lot ID"
                                        type="text"
                                        id="edit-lotId"
                                        value={editingLot.id}
                                        disabled
                                    />
                                )}
                                <Input
                                    label="Farmer Name"
                                    type="text"
                                    id="edit-farmerName"
                                    value={editFormData.farmerName}
                                    onChange={e => setEditFormData({ ...editFormData, farmerName: e.target.value })}
                                    required
                                />
                                <Input
                                    label="Cherry Variety"
                                    type="text"
                                    id="edit-cherryVariety"
                                    value={editFormData.cherryVariety}
                                    onChange={e => setEditFormData({ ...editFormData, cherryVariety: e.target.value })}
                                    required
                                />
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
                                    />
                                    <div>
                                        <DatePicker
                                            value={editFormData.harvestDate}
                                            onChange={(date) => setEditFormData({ ...editFormData, harvestDate: date })}
                                            label="Harvest Date"
                                            required
                                        />
                                    </div>
                                </div>
                                <Input
                                    label="Farm Plot Location"
                                    type="text"
                                    id="edit-farmPlotLocation"
                                    value={editFormData.farmPlotLocation}
                                    onChange={e => setEditFormData({ ...editFormData, farmPlotLocation: e.target.value })}
                                    required
                                />
                                <div>
                                    <label htmlFor="edit-status" className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                                    <select
                                        id="edit-status"
                                        value={editFormData.status}
                                        onChange={e => setEditFormData({ ...editFormData, status: e.target.value })}
                                        required
                                        className="block w-full border border-gray-300 rounded-xl shadow-sm py-2.5 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                    >
                                        <option value="Ready for Processing">Ready for Processing</option>
                                        <option value="Processing">Processing</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mt-8 flex justify-end space-x-3">
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