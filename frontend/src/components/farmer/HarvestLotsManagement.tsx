import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { HarvestLot, UserRole } from '../../types';
import { ChevronRight, ChevronLeft, ArrowUp, ArrowDown, Coffee, PlusCircle, Search } from 'lucide-react';

const PAGE_SIZE = 5;
import { PageHeader } from '../common/PageHeader';
import { Button } from '../common/Button';
import HarvestLotModal from '../modals/HarvestLotModal';
import { formatHarvestLotId } from '../../utils/formatHarvestLotId';

type SortableKeys = keyof HarvestLot;

const HarvestLotsManagement: React.FC = () => {
  const { data } = useDataContext();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Table State
  const [statusFilter, setStatusFilter] = useState<'All' | 'Ready for Processing' | 'Processing'>('All');
  const [sortColumn, setSortColumn] = useState<SortableKeys>('harvestDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

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

  const sortedAndFilteredLots = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    const filtered = myHarvestLots.filter(lot => {
      // Status filter
      if (statusFilter !== 'All' && lot.status !== statusFilter) return false;
      // Search filter
      if (searchTerm) {
        return (
          lot.id.toLowerCase().includes(searchLower) ||
          lot.farmerName.toLowerCase().includes(searchLower) ||
          lot.cherryVariety.toLowerCase().includes(searchLower) ||
          lot.harvestDate.includes(searchLower)
        );
      }
      return true;
    });
    return filtered.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        return 0;
    });
  }, [myHarvestLots, statusFilter, sortColumn, sortDirection, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(sortedAndFilteredLots.length / PAGE_SIZE);
  const paginatedLots = sortedAndFilteredLots.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchTerm]);

  const stats = useMemo(() => ({
    totalLots: myHarvestLots.length,
    totalWeight: myHarvestLots.reduce((sum, lot) => sum + lot.weightKg, 0),
    inProcessing: myHarvestLots.filter(l => l.status === 'Processing').length,
    readyForProcessing: myHarvestLots.filter(l => l.status === 'Ready for Processing').length,
  }), [myHarvestLots]);

  const filterStatuses: Array<'All' | 'Ready for Processing' | 'Processing'> = ['All', 'Ready for Processing', 'Processing'];

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
              <p className="text-sm text-gray-600">In Processing</p>
              <p className="text-2xl font-bold text-gray-900">{stats.inProcessing}</p>
            </div>
            <Coffee className="h-8 w-8 text-amber-600" />
          </div>
        </div>
      </div>

      {/* Harvest Lots Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <div className="bg-gray-50 p-6 border-b border-gray-200">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
            <h3 className="text-2xl font-bold text-gray-900">Harvest Lots</h3>
            <Button
              variant="primary"
              icon={<PlusCircle className="h-4 w-4" />}
              onClick={handleOpenAddModal}
            >
              Add Harvest Lot
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search by ID, farmer, variety..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            {/* Status Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold text-gray-700">Filter:</span>
              {filterStatuses.map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    statusFilter === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4 p-6 bg-gray-50">
          {paginatedLots.length === 0 ? (
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
            paginatedLots.map((lot: HarvestLot) => (
              <div
                key={lot.id}
                onClick={() => handleRowClick(lot.id)}
                className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                      <h4 className="text-xl font-bold text-gray-900">{formatHarvestLotId(lot.id, 'short', lot.harvestDate)}</h4>
                      <span className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap flex-shrink-0 ${
                        lot.status === 'Processing'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {lot.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            ))
          )}
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center px-4 py-3 bg-white border-t border-gray-200">
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

