import React, { useEffect, useMemo, useState } from 'react';
import { PlusCircle, Sprout, MapPin, Leaf, Coffee, Search, ShieldCheck, Layers3, Compass, X, MoreVertical, Edit3, Archive, RotateCcw, Save, Microscope, Trash2 } from 'lucide-react';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Farm, UserRole } from '../../types';
import { Button, Input, Modal, StatCard } from '../common';
import { addFarm, updateFarm, deleteFarm } from '../../services/farmService';
import { generateFarmId } from '../../utils/idGenerator';
import { formatDateDisplay } from '../../utils/formatters';
import FarmSoilPanel from './FarmSoilPanel';

const COFFEE_VARIETIES = [
	'Gesha',
	'Caturra',
	'Typica',
	'Bourbon',
	'SL28',
	'SL34',
	'Pacamara',
	'Catuai',
	'Mundo Novo',
	'Maragogype',
	'Java',
	'Blue Mountain',
	'Ethiopian Heirloom',
];

// soil form logic moved to FarmSoilPanel

const FarmManagement: React.FC = () => {
	const { data, setData } = useDataContext();
	const { currentUser } = useAuth();

	const [isModalOpen, setIsModalOpen] = useState(false);
	const [farmName, setFarmName] = useState('');
	const [farmLocation, setFarmLocation] = useState('');
	const [ownerName, setOwnerName] = useState(currentUser?.name ?? '');
	const [caretakerName, setCaretakerName] = useState('');
	const [selectedVarieties, setSelectedVarieties] = useState<string[]>([]);
	const [customVariety, setCustomVariety] = useState('');
	const [latitudeInput, setLatitudeInput] = useState('');
	const [longitudeInput, setLongitudeInput] = useState('');
	const [altitudeInput, setAltitudeInput] = useState('');
	const [sizeInput, setSizeInput] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [varietyFilter, setVarietyFilter] = useState('All');
	const [viewFilter, setViewFilter] = useState<'active' | 'archived'>('active');
	const [formError, setFormError] = useState<string | null>(null);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
	const [editingFarmId, setEditingFarmId] = useState<string | null>(null);
	const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
	const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [farmToDelete, setFarmToDelete] = useState<Farm | null>(null);

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
		const matchesStatus = (farm: Farm) => (viewFilter === 'archived' ? Boolean(farm.archived) : !farm.archived);

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
				return matchesSearch && matchesVariety && matchesStatus(farm);
			})
			.sort((a, b) => toTimestamp(b) - toTimestamp(a));
	}, [scopedFarms, trimmedSearch, varietyFilter, viewFilter]);

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
		const summary = new Map<string, { count: number; lastDate?: string }>();
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

	useEffect(() => {
		if (currentUser && !ownerName) {
			setOwnerName(currentUser.name);
		}
	}, [currentUser, ownerName]);

	useEffect(() => {
		const handleOutsideClick = () => setMenuOpenId(null);
		document.addEventListener('click', handleOutsideClick);
		return () => document.removeEventListener('click', handleOutsideClick);
	}, []);

	const toggleVariety = (variety: string) => {
		setSelectedVarieties(prev => (prev.includes(variety) ? prev.filter(v => v !== variety) : [...prev, variety]));
	};

	const removeVariety = (variety: string) => {
		setSelectedVarieties(prev => prev.filter(v => v !== variety));
	};

	const handleCustomVarietyAdd = () => {
		const trimmed = customVariety.trim();
		if (!trimmed) return;
		setSelectedVarieties(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
		setCustomVariety('');
	};

	const handleSelectFarm = (farm: Farm) => {
		setSelectedFarmId(farm.id);
		setMenuOpenId(null);
	};

	const resetForm = () => {
		setFarmName('');
		setFarmLocation('');
		setOwnerName(currentUser?.name ?? '');
		setCaretakerName('');
		setSelectedVarieties([]);
		setCustomVariety('');
		setLatitudeInput('');
		setLongitudeInput('');
		setAltitudeInput('');
		setSizeInput('');
		setFormError(null);
		setEditingFarmId(null);
	};

	const handleOpenAddModal = () => {
		resetForm();
		setIsModalOpen(true);
	};

	const handleOpenEditModal = (farm: Farm) => {
		setEditingFarmId(farm.id);
		setFarmName(farm.name ?? '');
		setFarmLocation(farm.location);
		setOwnerName(farm.ownerName ?? farm.farmerName);
		setCaretakerName(farm.caretakerName ?? '');
		setSelectedVarieties(farm.varieties ?? []);
		setCustomVariety('');
		setLatitudeInput(
			farm.latitude !== undefined && farm.latitude !== null ? String(farm.latitude) : '',
		);
		setLongitudeInput(
			farm.longitude !== undefined && farm.longitude !== null ? String(farm.longitude) : '',
		);
		setAltitudeInput(
			farm.altitudeMeters !== undefined && farm.altitudeMeters !== null
				? String(farm.altitudeMeters)
				: '',
		);
		setSizeInput(
			farm.sizeHectares !== undefined && farm.sizeHectares !== null ? String(farm.sizeHectares) : '',
		);
		setFormError(null);
		setIsModalOpen(true);
	};

	const closeModal = () => {
		setIsModalOpen(false);
		resetForm();
	};

	const handleSaveFarm = (event: React.FormEvent) => {
		event.preventDefault();
		if (!currentUser) {
			setFormError('กรุณาเข้าสู่ระบบก่อนเพิ่มฟาร์ม');
			return;
		}
		if (!farmName.trim() || !farmLocation.trim()) {
			setFormError('กรอกชื่อฟาร์มและสถานที่ให้ครบถ้วน');
			return;
		}
		if (!ownerName.trim()) {
			setFormError('กรอกชื่อเจ้าของฟาร์ม');
			return;
		}
		if (!caretakerName.trim()) {
			setFormError('กรอกชื่อผู้ดูแลฟาร์ม');
			return;
		}
		if (selectedVarieties.length === 0) {
			setFormError('เลือกหรือเพิ่มสายพันธุ์กาแฟอย่างน้อย 1 รายการ');
			return;
		}

		const trimmedLat = latitudeInput.trim();
		const trimmedLng = longitudeInput.trim();
		const trimmedAltitude = altitudeInput.trim();
		const trimmedSize = sizeInput.trim();
		let latitude: number | undefined;
		let longitude: number | undefined;
		let altitudeMeters: number | undefined;
		let sizeHectares: number | undefined;
		if (trimmedLat || trimmedLng) {
			if (!trimmedLat || !trimmedLng) {
				setFormError('กรอกละติจูดและลองจิจูดให้ครบหรือเว้นว่างทั้งคู่');
				return;
			}
			const parsedLat = Number(trimmedLat);
			const parsedLng = Number(trimmedLng);
			if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
				setFormError('พิกัดต้องเป็นตัวเลขเท่านั้น');
				return;
			}
			if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
				setFormError('ละติจูดต้องอยู่ระหว่าง -90 ถึง 90 และลองจิจูดระหว่าง -180 ถึง 180');
				return;
			}
			latitude = parsedLat;
			longitude = parsedLng;
		}
		if (trimmedAltitude) {
			const parsedAltitude = Number(trimmedAltitude);
			if (Number.isNaN(parsedAltitude)) {
				setFormError('ความสูงต้องเป็นตัวเลขเท่านั้น');
				return;
			}
			if (parsedAltitude < -500 || parsedAltitude > 7000) {
				setFormError('ความสูงควรอยู่ระหว่าง -500 ถึง 7000 เมตร');
				return;
			}
			altitudeMeters = parsedAltitude;
		}
		if (trimmedSize) {
			const parsedSize = Number(trimmedSize);
			if (Number.isNaN(parsedSize)) {
				setFormError('ขนาดพื้นที่ต้องเป็นตัวเลขเท่านั้น');
				return;
			}
			if (parsedSize <= 0) {
				setFormError('ขนาดพื้นที่ต้องมากกว่า 0 เฮกตาร์');
				return;
			}
			sizeHectares = parsedSize;
		}

		const ownerDisplayName = ownerName.trim();
		const caretakerDisplayName = caretakerName.trim();
		const timestamp = new Date().toISOString();

		if (editingFarmId) {
			const existing = data.farms.find(f => f.id === editingFarmId);
			if (!existing) {
				setFormError('ไม่พบข้อมูลฟาร์มที่ต้องการแก้ไข');
				return;
			}
			const updatedFarm: Farm = {
				...existing,
				name: farmName.trim() || undefined,
				farmerName: ownerDisplayName,
				ownerName: ownerDisplayName,
				caretakerName: caretakerDisplayName,
				location: farmLocation.trim(),
				varieties: [...selectedVarieties].sort(),
				latitude,
				longitude,
				altitudeMeters,
				sizeHectares,
				updatedAt: timestamp,
			};
			updateFarm(updatedFarm);
			setData(prev => ({
				...prev,
				farms: prev.farms.map(f => (f.id === updatedFarm.id ? updatedFarm : f)),
			}));
			setToast({ type: 'success', message: 'อัปเดตข้อมูลฟาร์มเรียบร้อยแล้ว!' });
		} else {
			const newFarm: Farm = {
				id: generateFarmId(data.farms.map(f => f.id)),
				name: farmName.trim(),
				farmerName: ownerDisplayName,
				ownerName: ownerDisplayName,
				caretakerName: caretakerDisplayName,
				location: farmLocation.trim(),
				ownerUserId: currentUser.id,
				varieties: [...selectedVarieties].sort(),
				archived: false,
				latitude,
				longitude,
				altitudeMeters,
				sizeHectares,
				createdAt: timestamp,
				updatedAt: timestamp,
			};
			addFarm(newFarm);
			setData(prev => ({
				...prev,
				farms: [...prev.farms, newFarm],
			}));
			setToast({ type: 'success', message: 'เพิ่มฟาร์มใหม่เรียบร้อยแล้ว!' });
		}

		closeModal();
	};

	const handleArchiveToggle = (farm: Farm) => {
		const timestamp = new Date().toISOString();
		const nextArchived = !farm.archived;
		const updatedFarm: Farm = {
			...farm,
			archived: nextArchived,
			archivedAt: nextArchived ? timestamp : undefined,
			updatedAt: timestamp,
		};
		updateFarm(updatedFarm);
		setData(prev => ({
			...prev,
			farms: prev.farms.map(f => (f.id === updatedFarm.id ? updatedFarm : f)),
		}));
		setToast({ type: 'success', message: nextArchived ? 'เก็บฟาร์มเรียบร้อยแล้ว' : 'นำฟาร์มกลับมาแสดงแล้ว' });
		setMenuOpenId(null);
	};


	// ตรวจสอบข้อมูลที่เกี่ยวข้องกับฟาร์ม
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

	const handleConfirmDelete = () => {
		if (!farmToDelete) return;

		const { relatedData, hasRelatedData } = checkFarmRelatedData(farmToDelete);

		if (hasRelatedData) {
			setToast({
				type: 'error',
				message: `ไม่สามารถลบฟาร์มได้ เนื่องจากมีข้อมูลที่เกี่ยวข้องอยู่ กรุณาลบข้อมูลต่อไปนี้ก่อน: ${relatedData.harvestLots.length > 0 ? `Harvest Lots (${relatedData.harvestLots.length})` : ''}${relatedData.soilAnalyses.length > 0 ? `, Soil Analyses (${relatedData.soilAnalyses.length})` : ''}${relatedData.weatherRecords.length > 0 ? `, Weather Records (${relatedData.weatherRecords.length})` : ''}${relatedData.gapLogs.length > 0 ? `, GAP Logs (${relatedData.gapLogs.length})` : ''}`,
			});
			handleCloseDeleteModal();
			return;
		}

		// ลบฟาร์ม
		deleteFarm(farmToDelete.id);
		setData(prev => ({
			...prev,
			farms: prev.farms.filter(f => f.id !== farmToDelete.id),
		}));
		setToast({ type: 'success', message: 'ลบฟาร์มเรียบร้อยแล้ว' });
		handleCloseDeleteModal();
	};

	const isEditing = Boolean(editingFarmId);
	const toastColors = !toast
		? ''
		: toast.type === 'success'
			? 'bg-green-50 border-green-200 text-green-800'
			: 'bg-red-50 border-red-200 text-red-700';
	const modalTitle = isEditing ? 'แก้ไขข้อมูลฟาร์ม' : 'เพิ่มฟาร์มใหม่';
	const modalSubmitLabel = isEditing ? 'อัปเดตฟาร์ม' : 'บันทึกฟาร์ม';
	const modalSubmitIcon = isEditing ? <Save className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />;
	const emptyStateTitle = showSearchEmptyState
		? 'ไม่พบฟาร์มที่ตรงกับคำค้นหา'
		: viewFilter === 'archived'
			? 'ยังไม่มีฟาร์มที่ถูกเก็บ'
			: 'ยังไม่มีข้อมูลฟาร์ม';
	const emptyStateDescription = showSearchEmptyState
		? 'ลองปรับคำค้นหาหรือล้างตัวกรองเพื่อดูฟาร์มทั้งหมด'
		: viewFilter === 'archived'
			? 'เมื่อคุณกดเก็บฟาร์ม ข้อมูลจะย้ายมาแสดงที่นี่'
			: 'เริ่มต้นเพิ่มฟาร์มของคุณเพื่อดูรายละเอียดและติดตามสายพันธุ์ที่ปลูก';

	return (
		<div className="space-y-6">
			<div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-3">
						<Button variant="primary" icon={<PlusCircle className="h-5 w-5" />} onClick={handleOpenAddModal}>
							เพิ่มฟาร์ม
						</Button>
						<div>
							<p className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">Farm Hub</p>
							<h1 className="text-3xl font-bold text-gray-900">จัดการฟาร์มของฉัน</h1>
							<p className="text-gray-600">เพิ่มข้อมูลฟาร์ม ติดตามสายพันธุ์ และค้นหาฟาร์มได้อย่างรวดเร็ว</p>
						</div>
					</div>
					{toast && (
						<div className={`flex items-center justify-between px-4 py-3 border rounded-xl ${toastColors}`}>
							<span className="font-semibold">{toast.message}</span>
							<button className="p-1 rounded-full hover:bg-black/5" onClick={() => setToast(null)} aria-label="ปิดข้อความ">
								<X className="h-4 w-4" />
							</button>
						</div>
					)}
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<StatCard icon={Sprout} title="จำนวนฟาร์ม" value={stats.total} borderColor="border-l-emerald-400" iconBg="bg-emerald-50" iconColor="text-emerald-600" />
				<StatCard icon={Leaf} title="สายพันธุ์ที่ปลูก" value={stats.uniqueVarietiesCount} borderColor="border-l-lime-400" iconBg="bg-lime-50" iconColor="text-lime-600" />
				<StatCard icon={Coffee} title="สายพันธุ์/ฟาร์ม (เฉลี่ย)" value={stats.avgVarieties} borderColor="border-l-amber-400" iconBg="bg-amber-50" iconColor="text-amber-600" />
				<StatCard icon={Compass} title="พร้อมข้อมูลพิกัด" value={stats.gpsReady} borderColor="border-l-sky-400" iconBg="bg-sky-50" iconColor="text-sky-600" />
			</div>

			<div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<Input
						label="ค้นหาฟาร์ม"
						placeholder="ค้นหาจากชื่อฟาร์ม, เจ้าของ หรือสถานที่"
						value={searchTerm}
						onChange={e => setSearchTerm(e.target.value)}
						icon={<Search className="h-4 w-4" />}
						fullWidth
					/>
					<div className="space-y-4">
						<p className="text-sm font-semibold text-gray-700 mb-2">กรองตามสายพันธุ์</p>
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								onClick={() => setVarietyFilter('All')}
								className={`px-3 py-1.5 rounded-full text-sm border ${varietyFilter === 'All' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
							>
								ทั้งหมด
							</button>
							{varietyOptions.map(variety => (
								<button
									key={variety}
									type="button"
									onClick={() => setVarietyFilter(variety)}
									className={`px-3 py-1.5 rounded-full text-sm border ${varietyFilter === variety ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
								>
									{variety}
								</button>
							))}
						</div>
						<div>
							<p className="text-sm font-semibold text-gray-700 mb-2">สถานะการแสดง</p>
							<div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1 text-sm font-medium text-gray-600">
								{[
									{ label: 'ล่าสุด', value: 'active' as const },
									{ label: 'เก็บแล้ว', value: 'archived' as const },
								].map(option => (
									<button
										key={option.value}
										type="button"
										onClick={() => setViewFilter(option.value)}
										className={`px-4 py-1.5 rounded-full transition-colors ${viewFilter === option.value ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
									>
										{option.label}
									</button>
								))}
							</div>
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
							<Button type="button" variant="outline" onClick={() => setSearchTerm('')}>ล้างคำค้นหา</Button>
						)}
						{showInitialEmptyState && viewFilter === 'active' && (
							<Button variant="primary" icon={<PlusCircle className="h-4 w-4" />} onClick={handleOpenAddModal}>เพิ่มฟาร์มแรกของฉัน</Button>
						)}
					</div>
				</div>
			) : showFilterEmptyState ? (
				<div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500">
					<p className="text-base font-semibold text-gray-700 mb-1">ไม่มีฟาร์มที่ตรงกับการกรองนี้</p>
					<p className="text-sm">ลองเปลี่ยนตัวกรองหรือค้นหาใหม่เพื่อดูรายการอื่น</p>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
					{filteredFarms.map(farm => {
						const isSelected = selectedFarm?.id === farm.id;
						return (
						<div
							key={farm.id}
							className={`bg-white border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-300 ${isSelected ? 'border-emerald-300 ring-2 ring-emerald-200' : farm.archived ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200'}`}
							onClick={() => handleSelectFarm(farm)}
							onKeyDown={event => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									handleSelectFarm(farm);
								}
							}}
							tabIndex={0}
							role="button"
							aria-label={`เลือกฟาร์ม ${farm.name ?? farm.location}`}
						>
							<div className="flex items-start justify-between mb-4 gap-4">
								<div>
									<p className="text-xs font-semibold text-gray-400">{farm.id}</p>
									<h3 className="text-2xl font-bold text-gray-900">{farm.name ?? farm.location}</h3>
									<p className="text-sm text-gray-500">{farm.location}</p>
									<p className="text-sm text-gray-500">เจ้าของ: {farm.ownerName ?? farm.farmerName}</p>
									{farm.caretakerName && <p className="text-sm text-gray-500">ผู้ดูแล: {farm.caretakerName}</p>}
								</div>
								<div className="flex flex-col items-end gap-2">
									<div className="p-3 bg-emerald-50 rounded-full">
										<MapPin className="h-5 w-5 text-emerald-600" />
									</div>
									<div className="relative">
										<button
											type="button"
											onClick={event => {
												event.stopPropagation();
												setMenuOpenId(prev => (prev === farm.id ? null : farm.id));
											}}
											className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
											aria-label="เมนูตัวเลือก"
										>
											<MoreVertical className="h-4 w-4" />
										</button>
										{menuOpenId === farm.id && (
											<div onClick={event => event.stopPropagation()} className="absolute right-0 mt-2 w-40 rounded-2xl border border-gray-100 bg-white shadow-lg z-10">
												<button
													type="button"
													onClick={() => {
													setMenuOpenId(null);
													handleOpenEditModal(farm);
												}}
													className="flex items-center gap-2 w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
												>
													<Edit3 className="h-4 w-4" /> แก้ไข
												</button>
												<button
													type="button"
													onClick={() => handleArchiveToggle(farm)}
													className="flex items-center gap-2 w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
												>
													{farm.archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
													{farm.archived ? 'นำกลับมาแสดง' : 'เก็บ'}
												</button>
												<button
													type="button"
													onClick={() => {
														setMenuOpenId(null);
														handleOpenDeleteModal(farm);
													}}
													className="flex items-center gap-2 w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
												>
													<Trash2 className="h-4 w-4" /> ลบฟาร์ม
												</button>
											</div>
										)}
									</div>
									{farm.archived && <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 border border-amber-200">เก็บแล้ว</span>}
								</div>
							</div>
							<div className="space-y-3 text-sm text-gray-600">
								{farm.varieties && farm.varieties.length > 0 && (
									<div>
										<p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
											<Leaf className="h-3.5 w-3.5" /> สายพันธุ์ที่ปลูก
										</p>
										<div className="flex flex-wrap gap-2">
											{farm.varieties.map(variety => (
												<span key={variety} className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
													{variety}
												</span>
											))}
										</div>
									</div>
								)}
								<div className="flex items-center gap-2 text-xs text-gray-500">
									<Layers3 className="h-4 w-4" />
									<span>{farm.varieties?.length || 0} สายพันธุ์ที่บันทึก</span>
								</div>
								{(() => {
									const soilSummary = soilSummaryByFarm.get(farm.id);
									return soilSummary ? (
										<div className="flex items-center gap-2 text-xs text-emerald-700">
											<Microscope className="h-4 w-4 text-emerald-600" />
											<span>
												ผลวิเคราะห์ {soilSummary.count} ครั้ง
												{soilSummary.lastDate && ` (ล่าสุด ${formatDateDisplay(soilSummary.lastDate)})`}
											</span>
										</div>
									) : (
										<div className="flex items-center gap-2 text-xs text-amber-700">
											<Microscope className="h-4 w-4 text-amber-600" />
											<span>ยังไม่บันทึกผลวิเคราะห์ดิน</span>
										</div>
									);
								})()}
								{farm.latitude !== undefined && farm.latitude !== null && farm.longitude !== undefined && farm.longitude !== null ? (
									<div className="flex items-center gap-2 text-xs text-emerald-700">
										<ShieldCheck className="h-4 w-4 text-emerald-600" />
										<span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 font-semibold">
											พร้อมข้อมูล GPS ({farm.latitude.toFixed(3)}, {farm.longitude.toFixed(3)})
										</span>
									</div>
								) : (
									<div className="flex items-center gap-2 text-xs text-amber-700">
										<ShieldCheck className="h-4 w-4 text-amber-600" />
										<span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 font-semibold">ยังไม่ได้ระบุพิกัด</span>
									</div>
								)}
							</div>
						</div>
					);
				})}
				</div>
			)}

			{hasAnyFarms && (
				<FarmSoilPanel farm={selectedFarm} />
			)}

			<Modal isOpen={isModalOpen} onClose={closeModal} title={modalTitle} maxWidth="2xl">
				<form onSubmit={handleSaveFarm} className="space-y-6">
					<Input
						label="ชื่อฟาร์ม"
						placeholder="เช่น Finca La Esperanza"
						value={farmName}
						onChange={e => setFarmName(e.target.value)}
						required
						fullWidth
					/>
					<Input
						label="สถานที่"
						placeholder="จังหวัด / พิกัด / โซนปลูก"
						value={farmLocation}
						onChange={e => setFarmLocation(e.target.value)}
						required
						fullWidth
					/>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Input
							label="ชื่อเจ้าของฟาร์ม"
							placeholder="ชื่อเจ้าของตามจริง"
							value={ownerName}
							onChange={e => setOwnerName(e.target.value)}
							required
							fullWidth
						/>
						<Input
							label="ชื่อผู้ดูแลฟาร์ม"
							placeholder="ผู้จัดการ/ผู้ดูแลหลัก"
							value={caretakerName}
							onChange={e => setCaretakerName(e.target.value)}
							required
							fullWidth
						/>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Input
							label="ละติจูด (Latitude)"
							placeholder="เช่น 19.910"
							value={latitudeInput}
							onChange={e => setLatitudeInput(e.target.value)}
							type="text"
							fullWidth
						/>
						<Input
							label="ลองจิจูด (Longitude)"
							placeholder="เช่น 99.841"
							value={longitudeInput}
							onChange={e => setLongitudeInput(e.target.value)}
							type="text"
							fullWidth
						/>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Input
							label="ความสูงจากระดับน้ำทะเล (เมตร)"
							placeholder="เช่น 1200"
							value={altitudeInput}
							onChange={e => setAltitudeInput(e.target.value)}
							type="text"
							fullWidth
						/>
						<Input
							label="ขนาดพื้นที่ (เฮกตาร์)"
							placeholder="เช่น 15"
							value={sizeInput}
							onChange={e => setSizeInput(e.target.value)}
							type="text"
							fullWidth
						/>
					</div>
					<div className="space-y-3">
						<p className="text-sm font-semibold text-gray-700">ฟาร์มนี้ปลูกสายพันธุ์อะไรบ้าง?</p>
						<div className="flex flex-wrap gap-2">
							{COFFEE_VARIETIES.map(variety => (
								<button
									type="button"
									key={variety}
									onClick={() => toggleVariety(variety)}
									className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedVarieties.includes(variety)
										? 'bg-emerald-600 text-white border-emerald-600'
										: 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
								>
									{variety}
								</button>
							))}
						</div>
						<div className="flex flex-col gap-3 md:flex-row md:items-center">
							<Input
								label="เพิ่มสายพันธุ์อื่น"
								placeholder="เช่น Obata"
								value={customVariety}
								onChange={e => setCustomVariety(e.target.value)}
								fullWidth
							/>
							<Button type="button" variant="secondary" onClick={handleCustomVarietyAdd} className="md:w-40">
								เพิ่มสายพันธุ์
							</Button>
						</div>
						{selectedVarieties.length > 0 && (
							<div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
								<p className="text-xs font-semibold text-gray-500 mb-2">สายพันธุ์ที่เลือก</p>
								<div className="flex flex-wrap gap-2">
									{selectedVarieties.map(variety => (
										<span key={variety} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-gray-200 text-sm text-gray-700">
											{variety}
											<button
												type="button"
												onClick={() => removeVariety(variety)}
												className="text-gray-400 hover:text-red-500 transition-colors"
												aria-label={`ลบสายพันธุ์ ${variety}`}
											>
												<X className="h-3.5 w-3.5" />
											</button>
										</span>
									))}
								</div>
							</div>
						)}
					</div>

					{formError && (
						<div className="px-4 py-3 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm">
							{formError}
						</div>
					)}

					<div className="flex justify-end gap-3">
						<Button type="button" variant="outline" onClick={closeModal}>
							ยกเลิก
						</Button>
						<Button type="submit" variant="primary" icon={modalSubmitIcon}>
							{modalSubmitLabel}
						</Button>
					</div>
				</form>
			</Modal>

			{/* Delete Confirmation Modal */}
			<Modal
				isOpen={isDeleteModalOpen}
				onClose={handleCloseDeleteModal}
				title="ยืนยันการลบฟาร์ม"
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
										<p className="text-sm font-semibold text-red-800 mb-1">คุณกำลังจะลบฟาร์มนี้</p>
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
											ไม่สามารถลบฟาร์มได้ เนื่องจากมีข้อมูลที่เกี่ยวข้องอยู่
										</p>
										<p className="text-sm text-amber-700 mb-3">
											กรุณาลบข้อมูลต่อไปนี้ก่อนที่จะลบฟาร์ม:
										</p>
										<ul className="space-y-2 text-sm text-amber-800">
											{relatedData.harvestLots.length > 0 && (
												<li className="flex items-center gap-2">
													<span className="w-2 h-2 bg-amber-500 rounded-full"></span>
													<span>
														<strong>Harvest Lots:</strong> {relatedData.harvestLots.length} รายการ
													</span>
												</li>
											)}
											{relatedData.soilAnalyses.length > 0 && (
												<li className="flex items-center gap-2">
													<span className="w-2 h-2 bg-amber-500 rounded-full"></span>
													<span>
														<strong>Soil Analyses:</strong> {relatedData.soilAnalyses.length} รายการ
													</span>
												</li>
											)}
											{relatedData.weatherRecords.length > 0 && (
												<li className="flex items-center gap-2">
													<span className="w-2 h-2 bg-amber-500 rounded-full"></span>
													<span>
														<strong>Weather Records:</strong> {relatedData.weatherRecords.length} รายการ
													</span>
												</li>
											)}
											{relatedData.gapLogs.length > 0 && (
												<li className="flex items-center gap-2">
													<span className="w-2 h-2 bg-amber-500 rounded-full"></span>
													<span>
														<strong>GAP Logs:</strong> {relatedData.gapLogs.length} รายการ
													</span>
												</li>
											)}
										</ul>
									</div>
									<div className="flex justify-end">
										<Button type="button" variant="outline" onClick={handleCloseDeleteModal}>
											ปิด
										</Button>
									</div>
								</div>
							) : (
								<div className="space-y-4">
									<p className="text-sm text-gray-700">
										คุณแน่ใจหรือไม่ว่าต้องการลบฟาร์มนี้? การกระทำนี้ไม่สามารถยกเลิกได้
									</p>
									<div className="flex justify-end gap-3">
										<Button type="button" variant="outline" onClick={handleCloseDeleteModal}>
											ยกเลิก
										</Button>
										<Button
											type="button"
											variant="primary"
											onClick={handleConfirmDelete}
											className="bg-red-600 hover:bg-red-700 text-white"
										>
											<Trash2 className="h-4 w-4 mr-2" />
											ลบฟาร์ม
										</Button>
									</div>
								</div>
							)}
						</div>
					);
				})()}
			</Modal>
		</div>
	);
};

export default FarmManagement;
