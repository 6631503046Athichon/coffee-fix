import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { HarvestLot, UserRole } from '../../types';
import { ChevronRight, ArrowUp, ArrowDown, Coffee, PlusCircle, ChevronLeft } from 'lucide-react';
import { PageHeader } from '../common/PageHeader';
import { Button } from '../common/Button';
import Select from '../common/Select';
import HarvestLotModal from './modals/HarvestLotModal';


type SortableKeys = keyof HarvestLot;

const HarvestLotsManagement: React.FC = () => {
  const { data } = useDataContext();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Table State
  const [statusFilter, setStatusFilter] = useState<'All' | 'Ready for Processing' | 'Processing' | 'Complete'>('All');
  const [farmFilter, setFarmFilter] = useState<string>('All');
  const [sortColumn, setSortColumn] = useState<SortableKeys>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const handleRowClick = (lotId: string) => {
    navigate(`/farmer-dashboard/${lotId}`);
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

  const farmFilteredLots = useMemo(() => {
    return myHarvestLots.filter(lot => farmFilter === 'All' || lot.farmId === farmFilter);
  }, [myHarvestLots, farmFilter]);

  const sortedAndFilteredLots = useMemo(() => {
    const filtered = farmFilteredLots.filter(lot => {
      const matchesStatus = statusFilter === 'All' || lot.status === statusFilter;
      return matchesStatus;
    });

    return filtered.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];
        // Treat undefined as smallest so missing values group together consistently.
        if (aValue === undefined && bValue === undefined) return 0;
        if (aValue === undefined) return sortDirection === 'asc' ? -1 : 1;
        if (bValue === undefined) return sortDirection === 'asc' ? 1 : -1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        return 0;
    });
  }, [farmFilteredLots, statusFilter, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedAndFilteredLots.length / ITEMS_PER_PAGE);
  const pagedLots = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedAndFilteredLots.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedAndFilteredLots, currentPage]);

  // Reset page when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, farmFilter]);

  const stats = useMemo(() => ({
    totalLots: farmFilteredLots.length,
    totalWeight: farmFilteredLots.reduce((sum, lot) => sum + lot.weightKg, 0),
    completed: farmFilteredLots.filter(l => l.status === 'Complete').length,
    readyForProcessing: farmFilteredLots.filter(l => l.status === 'Ready for Processing').length,
  }), [farmFilteredLots]);

  const filterStatuses: Array<'All' | 'Ready for Processing' | 'Complete'> = ['All', 'Ready for Processing', 'Complete'];

  const SortableHeader: React.FC<{ column: SortableKeys; label: string }> = ({ column, label }) => (
    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
      <button onClick={() => handleSort(column)} className="flex items-center gap-1 hover:text-gray-700">
        {label}
        {sortColumn === column && (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  // Get available farms for current user
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

  const farmFilterOptions = useMemo(() => {
    const options = availableFarms.map((farm) => ({
      value: farm.id,
      label: farm.farmName || farm.name || farm.location || farm.id,
    }));
    return [{ value: 'All', label: 'All Farms' }, ...options];
  }, [availableFarms]);

  const farmNameById = useMemo(() => {
    return new Map(
      data.farms.map(farm => [farm.id, farm.farmName || farm.name || farm.location || farm.id])
    );
  }, [data.farms]);

  const handleOpenAddModal = () => {
    // Don't pre-select a farm - let user choose in modal
    setSelectedFarm(null);
    setIsAddModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Harvest Lots Management"
        description="Manage your harvest lots - add, view, and track your coffee harvests."
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Lots</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalLots}</p>
            </div>
            <Coffee className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Weight</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalWeight.toLocaleString()} kg</p>
            </div>
            <Coffee className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ready for Processing</p>
              <p className="text-2xl font-bold text-gray-900">{stats.readyForProcessing}</p>
            </div>
            <Coffee className="h-8 w-8 text-emerald-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-gray-900">{stats.completed}</p>
            </div>
            <Coffee className="h-8 w-8 text-amber-600" />
          </div>
        </div>
      </div>

      {/* Harvest Lots Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <div className="bg-gray-50 p-6 border-b border-gray-200">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <h3 className="text-2xl font-bold text-gray-900">Harvest Lots</h3>
            <div className="flex items-center gap-4">
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
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Farm:</span>
                <Select
                  options={farmFilterOptions}
                  value={farmFilter}
                  onChange={(value) => setFarmFilter(String(value ?? 'All'))}
                  className="w-52"
                  placeholder="Select farm"
                />
              </div>
              <Button
                variant="primary"
                icon={<PlusCircle className="h-4 w-4" />}
                onClick={handleOpenAddModal}
              >
                Add Harvest Lot
              </Button>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-6 bg-gray-50">
          {sortedAndFilteredLots.length === 0 ? (
            <div className="text-center py-12">
              <Coffee className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium">No harvest lots found</p>
              <p className="text-gray-400 text-sm mb-4">Try adjusting your filters or add a new harvest lot</p>
              <Button
                variant="primary"
                icon={<PlusCircle className="h-4 w-4" />}
                onClick={handleOpenAddModal}
              >
                Add Your First Harvest Lot
              </Button>
            </div>
          ) : (
            pagedLots.map((lot: HarvestLot) => (
              (() => {
                const farmName =
                  lot.farm?.farmName ||
                  lot.farm?.name ||
                  (lot.farmId ? farmNameById.get(lot.farmId) : undefined) ||
                  'Unknown Farm';

                return (
              <div
                key={lot.id}
                onClick={() => handleRowClick(lot.id)}
                className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <h4 className="text-xl font-bold text-gray-900">{lot.displayId || lot.id.substring(0, 8).toUpperCase()}</h4>
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                        lot.status === 'Complete'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {lot.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <p className="text-gray-500 text-xs uppercase font-semibold mb-1 tracking-wide">Farm</p>
                        <p className="text-gray-900 font-medium text-sm">{farmName}</p>
                      </div>
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
                );
              })()
            ))
          )}

          {/* Pagination */}
          {sortedAndFilteredLots.length > 0 && totalPages > 1 && (
            <div className="flex justify-center items-center gap-1 pt-4">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-white rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                    <button
                      key={slot}
                      onClick={() => setCurrentPage(slot)}
                      className={`w-8 h-8 text-sm font-medium rounded-md transition-colors flex items-center justify-center ${
                        cp === slot ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-white'
                      }`}
                    >
                      {slot}
                    </button>
                  )
                ));
              })()}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-white rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add Harvest Lot Modal */}
      <HarvestLotModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setSelectedFarm(null);
        }}
        farm={undefined}
      />
    </div>
  );
};

export default HarvestLotsManagement;

