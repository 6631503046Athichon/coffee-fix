import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Sprout, MapPin, Leaf, Coffee, Search, ShieldCheck, Layers3, Compass, X, MoreVertical, Edit3, Microscope, Trash2, Cloud, Map as MapIcon } from 'lucide-react';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Farm, UserRole } from '../../types';
import { Button, Input, Modal, StatCard } from '../common';
import Select from '../common/Select';
import { deleteFarm } from '../../services/farmService';
import { formatDateDisplay } from '../../utils/formatters';
import FarmSoilPanel from './FarmSoilPanel';
import WeatherModal from '../modals/WeatherModal';
import HarvestLotModal from '../modals/HarvestLotModal';
import FarmMapView from '../common/FarmMapView';

const FarmManagement: React.FC = () => {
	const navigate = useNavigate();
	const { data, setData } = useDataContext();
	const { currentUser } = useAuth();

	const [searchTerm, setSearchTerm] = useState('');
	const [varietyFilter, setVarietyFilter] = useState('All');
	const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
	const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
	const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [farmToDelete, setFarmToDelete] = useState<Farm | null>(null);

	// Modal states for farm actions
	const [isSoilModalOpen, setIsSoilModalOpen] = useState(false);
	const [isWeatherModalOpen, setIsWeatherModalOpen] = useState(false);
	const [isHarvestModalOpen, setIsHarvestModalOpen] = useState(false);
	const [modalFarm, setModalFarm] = useState<Farm | null>(null);

	// View mode: 'cards' or 'map'
	const [viewMode, setViewMode] = useState<'cards' | 'map'>('cards');

	const isAdminView = currentUser?.roles?.includes(UserRole.Admin) ?? false;

	const scopedFarms = useMemo(() => {
		if (!currentUser) return data.farms;
		if (isAdminView) return data.farms;
		return data.farms.filter(
			farm => farm.ownerUserId === currentUser.id || farm.farmerName === currentUser.name,
		);
	}, [currentUser, data.farms, isAdminView]);

	const varietyOptions = useMemo(() => {
		const set = new Set<string>();
		scopedFarms.forEach(farm => farm.varieties?.forEach(variety => set.add(variety)));
		return Array.from(set).sort();
	}, [scopedFarms]);

	const trimmedSearch = searchTerm.trim();
	const filteredFarms = useMemo(() => {
		const lowerSearch = trimmedSearch.toLowerCase();
		const toTimestamp = (farm: Farm) => Date.parse(farm.updatedAt ?? farm.createdAt ?? '') || 0;

		return scopedFarms
			.filter(farm => {
				const matchesSearch = !lowerSearch
					|| farm.name?.toLowerCase().includes(lowerSearch)
					|| farm.farmerName.toLowerCase().includes(lowerSearch)
					|| farm.ownerName?.toLowerCase().includes(lowerSearch)
					|| farm.caretakerName?.toLowerCase().includes(lowerSearch)
					|| farm.location.toLowerCase().includes(lowerSearch)
					|| farm.id.toLowerCase().includes(lowerSearch);
				const matchesVariety = varietyFilter === 'All'
					|| (farm.varieties ?? []).some(variety => variety === varietyFilter);
				// Admin sees all farms including archived, farmers only see non-archived
				const matchesStatus = isAdminView ? true : !farm.archived;
				return matchesSearch && matchesVariety && matchesStatus;
			})
			.sort((a, b) => toTimestamp(b) - toTimestamp(a));
	}, [scopedFarms, trimmedSearch, varietyFilter, isAdminView]);

	useEffect(() => {
		if (!selectedFarmId) return;
		const stillVisible = filteredFarms.some(farm => farm.id === selectedFarmId);
		if (!stillVisible) {
			setSelectedFarmId(null);
		}
	}, [filteredFarms, selectedFarmId]);

	const isSearching = trimmedSearch.length > 0;
	const hasAnyFarms = scopedFarms.length > 0;
	const showSearchEmptyState = filteredFarms.length === 0 && isSearching;
	const showInitialEmptyState = filteredFarms.length === 0 && !isSearching && !hasAnyFarms;
	const showFilterEmptyState = filteredFarms.length === 0 && !isSearching && hasAnyFarms;

	const stats = useMemo(() => {
		const total = scopedFarms.length;
		const uniqueVarietiesCount = varietyOptions.length;
		const avgVarieties = scopedFarms.length === 0
			? 0
			: scopedFarms.reduce((sum, farm) => sum + (farm.varieties?.length ?? 0), 0) / scopedFarms.length;
		const ownedWithGps = scopedFarms.filter(
			farm => farm.latitude !== undefined && farm.latitude !== null && farm.longitude !== undefined && farm.longitude !== null,
		).length;
		return {
			total,
			uniqueVarietiesCount,
			avgVarieties: avgVarieties.toFixed(1),
			gpsReady: ownedWithGps,
		};
	}, [scopedFarms, varietyOptions.length]);

	const soilSummaryByFarm = useMemo(() => {
		const summary = new globalThis.Map<string, { count: number; lastDate?: string }>();
		data.soilAnalyses.forEach(analysis => {
			if (!analysis.farmId) return;
			const existing = summary.get(analysis.farmId) ?? { count: 0, lastDate: undefined };
			existing.count += 1;
			if (!existing.lastDate || new Date(analysis.testDate).getTime() > new Date(existing.lastDate).getTime()) {
				existing.lastDate = analysis.testDate;
			}
			summary.set(analysis.farmId, existing);
		});
		return summary;
	}, [data.soilAnalyses]);

	const selectedFarm = useMemo(() => {
		if (!selectedFarmId) return null;
		return data.farms.find(farm => farm.id === selectedFarmId) ?? null;
	}, [data.farms, selectedFarmId]);

	const farmsWithGPS = useMemo(() => {
		return filteredFarms.filter(
			farm =>
				farm.latitude !== undefined &&
				farm.latitude !== null &&
				farm.longitude !== undefined &&
				farm.longitude !== null
		);
	}, [filteredFarms]);


	useEffect(() => {
		const handleOutsideClick = () => setMenuOpenId(null);
		document.addEventListener('click', handleOutsideClick);
		return () => document.removeEventListener('click', handleOutsideClick);
	}, []);

	const handleSelectFarm = (farm: Farm) => {
		setSelectedFarmId(farm.id);
		setMenuOpenId(null);
	};

	const handleOpenAddFarm = () => {
		navigate('/farmer-farms/add');
	};

	const handleOpenEditFarm = (farm: Farm) => {
		navigate(`/farmer-farms/edit/${farm.id}`);
	};




	// Check farm related data
	const checkFarmRelatedData = (farm: Farm) => {
		const relatedData = {
			harvestLots: data.harvestLots.filter(
				lot => lot.farmPlotLocation === farm.location || lot.farmPlotLocation.includes(farm.location)
			),
			soilAnalyses: data.soilAnalyses.filter(analysis => analysis.farmId === farm.id),
			weatherRecords: data.weatherRecords.filter(record => record.farmId === farm.id),
			gapLogs: data.gapLogs.filter(
				log => log.farmId === farm.id || log.farmPlotLocation === farm.location || log.farmPlotLocation.includes(farm.location)
			),
		};

		const hasRelatedData = 
			relatedData.harvestLots.length > 0 ||
			relatedData.soilAnalyses.length > 0 ||
			relatedData.weatherRecords.length > 0 ||
			relatedData.gapLogs.length > 0;

		return { relatedData, hasRelatedData };
	};

	const handleOpenDeleteModal = (farm: Farm) => {
		setFarmToDelete(farm);
		setIsDeleteModalOpen(true);
		setMenuOpenId(null);
	};

	const handleCloseDeleteModal = () => {
		setIsDeleteModalOpen(false);
		setFarmToDelete(null);
	};

	const handleConfirmDelete = async () => {
		if (!farmToDelete) return;

		const { relatedData, hasRelatedData } = checkFarmRelatedData(farmToDelete);

		if (hasRelatedData) {
			setToast({
				type: 'error',
				message: `Cannot delete farm because it has related data. Please delete the following first: ${relatedData.harvestLots.length > 0 ? `Harvest Lots (${relatedData.harvestLots.length})` : ''}${relatedData.soilAnalyses.length > 0 ? `, Soil Analyses (${relatedData.soilAnalyses.length})` : ''}${relatedData.weatherRecords.length > 0 ? `, Weather Records (${relatedData.weatherRecords.length})` : ''}${relatedData.gapLogs.length > 0 ? `, GAP Logs (${relatedData.gapLogs.length})` : ''}`,
			});
			handleCloseDeleteModal();
			return;
		}

		// Delete farm
		try {
			await deleteFarm(farmToDelete.id);
			setData(prev => ({
				...prev,
				farms: prev.farms.filter(f => f.id !== farmToDelete.id),
			}));
			setToast({ type: 'success', message: 'Farm deleted successfully' });
			handleCloseDeleteModal();
		} catch (error) {
			console.error('Failed to delete farm:', error);
			setToast({ type: 'error', message: 'Failed to delete farm' });
		}
	};

	const toastColors = !toast
		? ''
		: toast.type === 'success'
			? 'bg-green-50 border-green-200 text-green-800'
			: 'bg-red-50 border-red-200 text-red-700';
	const emptyStateTitle = showSearchEmptyState
		? 'No farms match your search'
		: 'No farms yet';
	const emptyStateDescription = showSearchEmptyState
		? 'Try adjusting your search or clearing filters to see all farms'
		: 'Start by adding your first farm to view details and track planted varieties';

	return (
		<div className="space-y-6">
			<div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
				<div className="flex flex-col gap-4">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold text-gray-900">My Farm Management</h1>
							<p className="text-gray-600">Add farm information, track varieties, and search farms quickly</p>
						</div>
						<Button variant="primary" icon={<PlusCircle className="h-5 w-5" />} onClick={handleOpenAddFarm}>
							Add Farm
						</Button>
					</div>
					{toast && (
						<div className={`flex items-center justify-between px-4 py-3 border rounded-xl ${toastColors}`}>
							<span className="font-semibold">{toast.message}</span>
							<button className="p-1 rounded-full hover:bg-black/5" onClick={() => setToast(null)} aria-label="Close message">
								<X className="h-4 w-4" />
							</button>
						</div>
					)}
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<StatCard icon={Sprout} title="Total Farms" value={stats.total} borderColor="border-l-emerald-400" iconBg="bg-emerald-50" iconColor="text-emerald-600" />
				<StatCard icon={Leaf} title="Planted Varieties" value={stats.uniqueVarietiesCount} borderColor="border-l-lime-400" iconBg="bg-lime-50" iconColor="text-lime-600" />
				<StatCard icon={Coffee} title="Varieties/Farm (Avg)" value={stats.avgVarieties} borderColor="border-l-amber-400" iconBg="bg-amber-50" iconColor="text-amber-600" />
				<StatCard icon={Compass} title="GPS Ready" value={stats.gpsReady} borderColor="border-l-sky-400" iconBg="bg-sky-50" iconColor="text-sky-600" />
			</div>

			<div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => setViewMode('cards')}
							className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
								viewMode === 'cards'
									? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
									: 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
							}`}
						>
							<Layers3 className="h-4 w-4" />
							Cards
						</button>
						<button
							type="button"
							onClick={() => setViewMode('map')}
							className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
								viewMode === 'map'
									? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
									: 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
							}`}
						>
							<MapIcon className="h-4 w-4" />
							Map View
						</button>
					</div>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<Input
						label="Search Farms"
						placeholder="Search by farm name, owner, or location"
						value={searchTerm}
						onChange={e => setSearchTerm(e.target.value)}
						icon={<Search className="h-4 w-4" />}
						fullWidth
					/>
					<div>
						<label className="block text-sm font-semibold text-gray-700 mb-2">Filter by Variety</label>
						<div className="flex items-center gap-2">
							<div className="flex-1">
								<Select
									value={varietyFilter}
									onChange={(v) => setVarietyFilter((v as string) || 'All')}
									options={['All', ...varietyOptions]}
									placeholder="Select variety..."
									colorTheme="emerald"
								/>
							</div>
							{varietyFilter !== 'All' && (
								<button
									type="button"
									onClick={() => setVarietyFilter('All')}
									className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors whitespace-nowrap"
									title="Clear filter"
								>
									<Leaf className="h-4 w-4 flex-shrink-0" />
									<span className="hidden sm:inline truncate max-w-[120px]">{varietyFilter}</span>
									<X className="h-3.5 w-3.5 flex-shrink-0" />
								</button>
							)}
						</div>
					</div>
				</div>
			</div>

			{showInitialEmptyState || showSearchEmptyState ? (
				<div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
					<Sprout className="h-12 w-12 mx-auto text-gray-300 mb-4" />
					<h3 className="text-xl font-semibold text-gray-800 mb-2">{emptyStateTitle}</h3>
					<p className="text-gray-500 mb-4">{emptyStateDescription}</p>
					<div className="flex justify-center gap-3">
						{showSearchEmptyState && (
							<Button type="button" variant="outline" onClick={() => setSearchTerm('')}>Clear Search</Button>
						)}
						{showInitialEmptyState && (
							<Button variant="primary" icon={<PlusCircle className="h-4 w-4" />} onClick={handleOpenAddFarm}>Add My First Farm</Button>
						)}
					</div>
				</div>
			) : showFilterEmptyState ? (
				<div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500">
					<p className="text-base font-semibold text-gray-700 mb-1">No farms match this filter</p>
					<p className="text-sm">Try changing the filter or search again to see other listings</p>
				</div>
			) : viewMode === 'map' ? (
				<div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
					<div className="mb-4">
						<h2 className="text-xl font-bold text-gray-900 mb-2">Farm Locations Map</h2>
						<p className="text-sm text-gray-600">
							{farmsWithGPS.length} of {filteredFarms.length} farms have GPS coordinates
						</p>
					</div>
					<FarmMapView
						farms={filteredFarms}
						selectedFarmId={selectedFarmId}
						onFarmClick={(farm) => setSelectedFarmId(farm.id)}
						height="800px"
					/>
				</div>
			) : (
				<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
					{filteredFarms.map(farm => {
						const isSelected = selectedFarm?.id === farm.id;
						return (
						<div
							key={farm.id}
							className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-300 ${isSelected ? 'border-emerald-300 ring-2 ring-emerald-200' : farm.archived ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200'}`}
							onClick={() => handleSelectFarm(farm)}
							onKeyDown={event => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									handleSelectFarm(farm);
								}
							}}
							tabIndex={0}
							role="button"
							aria-label={`Select farm ${farm.name ?? farm.location}`}
						>
							<div className="flex items-start justify-between mb-4 gap-3">
								<div className="flex-1 space-y-1.5 min-w-0">
									<p className="text-xs font-semibold text-gray-400">{farm.id}</p>
									<h3 className="text-xl font-bold text-gray-900 leading-tight truncate">{farm.name ?? farm.location}</h3>
									<p className="text-sm text-gray-500 leading-relaxed truncate">{farm.location}</p>
									<div className="space-y-0.5">
										<p className="text-xs text-gray-500 leading-relaxed">Owner: <span className="font-medium">{farm.ownerName ?? farm.farmerName}</span></p>
										{farm.caretakerName && <p className="text-xs text-gray-500 leading-relaxed">Caretaker: <span className="font-medium">{farm.caretakerName}</span></p>}
									</div>
								</div>
								<div className="flex flex-col items-end gap-2 flex-shrink-0">
									<div className="p-2.5 bg-emerald-50 rounded-full">
										<MapPin className="h-4 w-4 text-emerald-600" />
									</div>
									<div className="relative">
										<button
											type="button"
											onClick={event => {
												event.stopPropagation();
												setMenuOpenId(prev => (prev === farm.id ? null : farm.id));
											}}
											className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
											aria-label="Options menu"
										>
											<MoreVertical className="h-4 w-4" />
										</button>
										{menuOpenId === farm.id && (
											<div onClick={event => event.stopPropagation()} className="absolute right-0 mt-2 w-40 rounded-2xl border border-gray-100 bg-white shadow-lg z-10">
												<button
													type="button"
													onClick={() => {
													setMenuOpenId(null);
													handleOpenEditFarm(farm);
												}}
													className="flex items-center gap-2 w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
												>
													<Edit3 className="h-4 w-4" /> Edit
												</button>
												<button
													type="button"
													onClick={() => {
														setMenuOpenId(null);
														handleOpenDeleteModal(farm);
													}}
													className="flex items-center gap-2 w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
												>
													<Trash2 className="h-4 w-4" /> Delete Farm
												</button>
											</div>
										)}
									</div>
								</div>
							</div>
							<div className="space-y-3 text-sm text-gray-600">
								{farm.varieties && farm.varieties.length > 0 && (
									<div>
										<p className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
											<Leaf className="h-3.5 w-3.5 flex-shrink-0" /> Planted Varieties
										</p>
										<div className="flex flex-wrap gap-1.5">
											{farm.varieties.map(variety => (
												<span key={variety} className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
													{variety}
												</span>
											))}
										</div>
									</div>
								)}
								<div className="flex items-center gap-2 text-xs text-gray-500 leading-relaxed">
									<Layers3 className="h-3.5 w-3.5 flex-shrink-0" />
									<span>{farm.varieties?.length || 0} varieties recorded</span>
								</div>
								{(() => {
									const soilSummary = soilSummaryByFarm.get(farm.id);
									return soilSummary ? (
										<div className="flex items-center gap-2 text-xs text-emerald-700 leading-relaxed">
											<Microscope className="h-4 w-4 text-emerald-600 flex-shrink-0" />
											<span>
												{soilSummary.count} soil analyses
												{soilSummary.lastDate && ` (latest ${formatDateDisplay(soilSummary.lastDate)})`}
											</span>
										</div>
									) : (
										<div className="flex items-center gap-2 text-xs text-amber-700 leading-relaxed">
											<Microscope className="h-4 w-4 text-amber-600 flex-shrink-0" />
											<span>No soil analysis recorded yet</span>
										</div>
									);
								})()}
								{farm.latitude !== undefined && farm.latitude !== null && farm.longitude !== undefined && farm.longitude !== null ? (
									<div className="flex items-center gap-2 text-xs text-emerald-700 leading-relaxed">
										<ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
										<span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 font-semibold">
											GPS Ready ({farm.latitude.toFixed(3)}, {farm.longitude.toFixed(3)})
										</span>
									</div>
								) : (
									<div className="flex items-center gap-2 text-xs text-amber-700 leading-relaxed">
										<ShieldCheck className="h-4 w-4 text-amber-600 flex-shrink-0" />
										<span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 font-semibold">No GPS coordinates specified</span>
									</div>
								)}
							</div>

							{/* Action Buttons */}
							<div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-2">
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										setModalFarm(farm);
										setIsSoilModalOpen(true);
									}}
									className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
								>
									<Microscope className="h-3.5 w-3.5 flex-shrink-0" />
									<span className="truncate">Soil</span>
								</button>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										setModalFarm(farm);
										setIsWeatherModalOpen(true);
									}}
									className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors"
								>
									<Cloud className="h-3.5 w-3.5 flex-shrink-0" />
									<span className="truncate">Weather</span>
								</button>
							</div>
						</div>
					);
				})}
				</div>
			)}


			{/* Delete Confirmation Modal */}
			<Modal
				isOpen={isDeleteModalOpen}
				onClose={handleCloseDeleteModal}
				title="Confirm Farm Deletion"
				maxWidth="2xl"
			>
				{farmToDelete && (() => {
					const { relatedData, hasRelatedData } = checkFarmRelatedData(farmToDelete);
					return (
						<div className="space-y-6">
							<div className="bg-red-50 border border-red-200 rounded-xl p-4">
								<div className="flex items-start gap-3">
									<Trash2 className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
									<div>
										<p className="text-sm font-semibold text-red-800 mb-1">You are about to delete this farm</p>
										<p className="text-sm text-red-700">
											<strong>{farmToDelete.name ?? farmToDelete.location}</strong> ({farmToDelete.id})
										</p>
									</div>
								</div>
							</div>

							{hasRelatedData ? (
								<div className="space-y-4">
									<div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
										<p className="text-sm font-semibold text-amber-800 mb-2">
											Cannot delete farm because it has related data
										</p>
										<p className="text-sm text-amber-700 mb-3">
											Please delete the following data before deleting the farm:
										</p>
										<ul className="space-y-2 text-sm text-amber-800">
											{relatedData.harvestLots.length > 0 && (
												<li className="flex items-center gap-2">
													<span className="w-2 h-2 bg-amber-500 rounded-full"></span>
													<span>
														<strong>Harvest Lots:</strong> {relatedData.harvestLots.length} entries
													</span>
												</li>
											)}
											{relatedData.soilAnalyses.length > 0 && (
												<li className="flex items-center gap-2">
													<span className="w-2 h-2 bg-amber-500 rounded-full"></span>
													<span>
														<strong>Soil Analyses:</strong> {relatedData.soilAnalyses.length} entries
													</span>
												</li>
											)}
											{relatedData.weatherRecords.length > 0 && (
												<li className="flex items-center gap-2">
													<span className="w-2 h-2 bg-amber-500 rounded-full"></span>
													<span>
														<strong>Weather Records:</strong> {relatedData.weatherRecords.length} entries
													</span>
												</li>
											)}
											{relatedData.gapLogs.length > 0 && (
												<li className="flex items-center gap-2">
													<span className="w-2 h-2 bg-amber-500 rounded-full"></span>
													<span>
														<strong>GAP Logs:</strong> {relatedData.gapLogs.length} entries
													</span>
												</li>
											)}
										</ul>
									</div>
									<div className="flex justify-end">
										<Button type="button" variant="outline" onClick={handleCloseDeleteModal}>
											Close
										</Button>
									</div>
								</div>
							) : (
								<div className="space-y-4">
									<p className="text-sm text-gray-700">
										Are you sure you want to delete this farm? This action cannot be undone.
									</p>
									<div className="flex justify-end gap-3">
										<Button type="button" variant="outline" onClick={handleCloseDeleteModal}>
											Cancel
										</Button>
										<Button
											type="button"
											variant="primary"
											onClick={handleConfirmDelete}
											className="bg-red-600 hover:bg-red-700 text-white"
										>
											<Trash2 className="h-4 w-4 mr-2" />
											Delete Farm
										</Button>
									</div>
								</div>
							)}
						</div>
					);
				})()}
			</Modal>

			{/* Soil Analysis Modal */}
			{modalFarm && (
				<FarmSoilPanel
					isOpen={isSoilModalOpen}
					onClose={() => {
						setIsSoilModalOpen(false);
						setModalFarm(null);
					}}
					farm={modalFarm}
				/>
			)}

			{/* Weather Modal */}
			{modalFarm && (
				<WeatherModal
					isOpen={isWeatherModalOpen}
					onClose={() => {
						setIsWeatherModalOpen(false);
						setModalFarm(null);
					}}
					farm={modalFarm}
				/>
			)}

			{/* Harvest Lot Modal */}
			{modalFarm && (
				<HarvestLotModal
					isOpen={isHarvestModalOpen}
					onClose={() => {
						setIsHarvestModalOpen(false);
						setModalFarm(null);
					}}
					farm={modalFarm}
				/>
			)}
		</div>
	);
};

export default FarmManagement;
