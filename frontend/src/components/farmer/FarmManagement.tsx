import React, { useEffect, useMemo, useState } from 'react';
import { PlusCircle, Sprout, MapPin, Leaf, Coffee, Search, ShieldCheck, Layers3, Compass, X, MoreVertical, Edit3, Save, Microscope, Trash2, Cloud, Thermometer, CheckCircle, FlaskConical, CloudRain, Droplets, RefreshCw, Package, Map as MapIcon } from 'lucide-react';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Farm, UserRole, SoilAnalysis, WeatherRecord, HarvestLot } from '../../types';
import { Button, Input, Modal, StatCard } from '../common';
import Select from '../common/Select';
import { addFarm, updateFarm, deleteFarm } from '../../services/farmService';
import { generateFarmId, generateSoilAnalysisId, generateHarvestLotId } from '../../utils/idGenerator';
import { formatDateDisplay } from '../../utils/formatters';
import { fetchWeatherData } from '../../services/weatherApiService';
import { addWeatherRecord, updateWeatherRecord, deleteWeatherRecord } from '../../services/weatherService';
import { deleteSoilAnalysis } from '../../services/soilAnalysisService';
import FarmSoilPanel from './FarmSoilPanel';
import WeatherModal from '../modals/WeatherModal';
import HarvestLotModal from '../modals/HarvestLotModal';
import FarmMapView from '../common/FarmMapView';

type ModalTab = 'farm' | 'soil' | 'weather';

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
	const [sizeInput, setSizeInput] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [varietyFilter, setVarietyFilter] = useState('All');
	const [formError, setFormError] = useState<string | null>(null);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
	const [editingFarmId, setEditingFarmId] = useState<string | null>(null);
	const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
	const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [farmToDelete, setFarmToDelete] = useState<Farm | null>(null);

	// Modal states for farm actions
	const [isSoilModalOpen, setIsSoilModalOpen] = useState(false);
	const [isWeatherModalOpen, setIsWeatherModalOpen] = useState(false);
	const [isHarvestModalOpen, setIsHarvestModalOpen] = useState(false);
	const [modalFarm, setModalFarm] = useState<Farm | null>(null);

	// Tab state for main modal
	const [activeTab, setActiveTab] = useState<ModalTab>('farm');

	// View mode: 'cards' or 'map'
	const [viewMode, setViewMode] = useState<'cards' | 'map'>('cards');

	// Soil form state
	const [soilPlotLocation, setSoilPlotLocation] = useState('');
	const [soilTestDate, setSoilTestDate] = useState(new Date().toISOString().substring(0, 10));
	const [soilLabName, setSoilLabName] = useState('');
	const [soilPH, setSoilPH] = useState('');
	const [soilPhosphorus, setSoilPhosphorus] = useState('');
	const [soilPotassium, setSoilPotassium] = useState('');
	const [soilNitrogen, setSoilNitrogen] = useState('');
	const [soilCalcium, setSoilCalcium] = useState('');
	const [soilMagnesium, setSoilMagnesium] = useState('');
	const [soilNotes, setSoilNotes] = useState('');
	const [editingSoilId, setEditingSoilId] = useState<string | null>(null);
	const [soilFormError, setSoilFormError] = useState<string | null>(null);

	// Weather form state
	const [weatherDate, setWeatherDate] = useState(new Date().toISOString().substring(0, 10));
	const [weatherTempMin, setWeatherTempMin] = useState('');
	const [weatherTempMax, setWeatherTempMax] = useState('');
	const [weatherRainfall, setWeatherRainfall] = useState('');
	const [weatherHumidity, setWeatherHumidity] = useState('70');
	const [weatherNotes, setWeatherNotes] = useState('');
	const [editingWeatherId, setEditingWeatherId] = useState<string | null>(null);
	const [weatherFormError, setWeatherFormError] = useState<string | null>(null);
	const [isFetchingWeather, setIsFetchingWeather] = useState(false);

	// Harvest form state
	const [harvestVariety, setHarvestVariety] = useState('');
	const [harvestWeight, setHarvestWeight] = useState('');
	const [harvestDate, setHarvestDate] = useState(new Date().toISOString().substring(0, 10));
	const [editingHarvestId, setEditingHarvestId] = useState<string | null>(null);
	const [harvestFormError, setHarvestFormError] = useState<string | null>(null);
	const [isGeocoding, setIsGeocoding] = useState(false);
	const [isGettingLocation, setIsGettingLocation] = useState(false);

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
		// Reset farm form
		setFarmName('');
		setFarmLocation('');
		setOwnerName(currentUser?.name ?? '');
		setCaretakerName('');
		setSelectedVarieties([]);
		setCustomVariety('');
		setLatitudeInput('');
		setLongitudeInput('');
		setSizeInput('');
		setFormError(null);
		setEditingFarmId(null);

		// Reset tab
		setActiveTab('farm');

		// Reset soil form
		setSoilPlotLocation('');
		setSoilTestDate(new Date().toISOString().substring(0, 10));
		setSoilLabName('');
		setSoilPH('');
		setSoilPhosphorus('');
		setSoilPotassium('');
		setSoilNitrogen('');
		setSoilCalcium('');
		setSoilMagnesium('');
		setSoilNotes('');
		setEditingSoilId(null);
		setSoilFormError(null);

		// Reset weather form
		setWeatherDate(new Date().toISOString().substring(0, 10));
		setWeatherTempMin('');
		setWeatherTempMax('');
		setWeatherRainfall('');
		setWeatherHumidity('70');
		setWeatherNotes('');
		setEditingWeatherId(null);
		setWeatherFormError(null);

		// Reset harvest form
		setHarvestVariety('');
		setHarvestWeight('');
		setHarvestDate(new Date().toISOString().substring(0, 10));
		setEditingHarvestId(null);
		setHarvestFormError(null);
	};

	// Get soil analyses for editing farm
	const editingFarmSoilAnalyses = useMemo(() => {
		if (!editingFarmId) return [];
		return data.soilAnalyses
			.filter(a => a.farmId === editingFarmId)
			.sort((a, b) => new Date(b.testDate).getTime() - new Date(a.testDate).getTime());
	}, [data.soilAnalyses, editingFarmId]);

	// Get weather records for editing farm
	const editingFarmWeatherRecords = useMemo(() => {
		if (!editingFarmId) return [];
		return data.weatherRecords
			.filter(r => r.farmId === editingFarmId)
			.sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime());
	}, [data.weatherRecords, editingFarmId]);

	// Get harvest lots for editing farm
	const editingFarmHarvestLots = useMemo(() => {
		if (!editingFarmId) return [];
		const editingFarm = data.farms.find(f => f.id === editingFarmId);
		if (!editingFarm) return [];
		return data.harvestLots
			.filter(lot => lot.farmPlotLocation === editingFarm.location || lot.farmPlotLocation.includes(editingFarm.location))
			.sort((a, b) => new Date(b.harvestDate).getTime() - new Date(a.harvestDate).getTime());
	}, [data.harvestLots, data.farms, editingFarmId]);

	// Calculate weather temperature average
	const weatherTempAvg = useMemo(() => {
		if (weatherTempMin && weatherTempMax) {
			return ((parseFloat(weatherTempMin) + parseFloat(weatherTempMax)) / 2).toFixed(1);
		}
		return '';
	}, [weatherTempMin, weatherTempMax]);

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

	const handleSaveFarm = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!currentUser) {
			setFormError('Please log in before adding a farm');
			return;
		}
		// Location is always required, but farm name is optional (can be removed when editing)
		if (!farmLocation.trim()) {
			setFormError('Please enter location');
			return;
		}
		if (!ownerName.trim()) {
			setFormError('Please enter farm owner name');
			return;
		}
		if (!caretakerName.trim()) {
			setFormError('Please enter caretaker name');
			return;
		}
		if (selectedVarieties.length === 0) {
			setFormError('Please select or add at least 1 coffee variety');
			return;
		}

		const trimmedLat = latitudeInput.trim();
		const trimmedLng = longitudeInput.trim();
		const trimmedSize = sizeInput.trim();
		let latitude: number | undefined;
		let longitude: number | undefined;
		let sizeHectares: number | undefined;
		if (trimmedLat || trimmedLng) {
			if (!trimmedLat || !trimmedLng) {
				setFormError('Please enter both latitude and longitude or leave both empty');
				return;
			}
			const parsedLat = Number(trimmedLat);
			const parsedLng = Number(trimmedLng);
			if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
				setFormError('Coordinates must be numbers only');
				return;
			}
			if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
				setFormError('Latitude must be between -90 and 90, and longitude between -180 and 180');
				return;
			}
			latitude = parsedLat;
			longitude = parsedLng;
		}
		if (trimmedSize) {
			const parsedSize = Number(trimmedSize);
			if (Number.isNaN(parsedSize)) {
				setFormError('Area size must be a number only');
				return;
			}
			if (parsedSize <= 0) {
				setFormError('Area size must be greater than 0 hectares');
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
				setFormError('Farm data not found for editing');
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
				sizeHectares,
				updatedAt: timestamp,
			};
			try {
				const savedFarm = await updateFarm(editingFarmId, updatedFarm);
				setData(prev => ({
					...prev,
					farms: prev.farms.map(f => f.id === editingFarmId ? savedFarm : f),
				}));
				setToast({ type: 'success', message: 'Farm updated successfully!' });
			} catch (error) {
				console.error('Failed to update farm:', error);
				setToast({ type: 'error', message: 'Failed to update farm' });
			}
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
				sizeHectares,
				createdAt: timestamp,
				updatedAt: timestamp,
			};
			try {
				const savedFarm = await addFarm(newFarm);
				setData(prev => ({
					...prev,
					farms: [savedFarm, ...prev.farms],
				}));
				setToast({ type: 'success', message: 'Farm added successfully!' });
			} catch (error) {
				console.error('Failed to add farm:', error);
				setToast({ type: 'error', message: 'Failed to add farm' });
			}
		}

		closeModal();
	};

	// Soil form handlers
	const handleSoilSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingFarmId) return;

		if (!soilPH || !soilPhosphorus || !soilPotassium || !soilNitrogen || !soilCalcium || !soilMagnesium) {
			setSoilFormError('Please fill in all essential nutrient values');
			return;
		}

		const editingFarm = data.farms.find(f => f.id === editingFarmId);
		if (!editingFarm) return;

		const soilData: SoilAnalysis = {
			id: editingSoilId ?? generateSoilAnalysisId(data.soilAnalyses.map(a => a.id)),
			farmId: editingFarmId,
			farmPlotLocation: soilPlotLocation || editingFarm.location,
			testDate: soilTestDate,
			labName: soilLabName || undefined,
			pH: parseFloat(soilPH),
			phosphorus: parseFloat(soilPhosphorus),
			potassium: parseFloat(soilPotassium),
			nitrogen: parseFloat(soilNitrogen),
			calcium: parseFloat(soilCalcium),
			magnesium: parseFloat(soilMagnesium),
			notes: soilNotes || undefined,
			createdBy: currentUser?.id ?? 'system',
			createdByRole: currentUser?.roles?.[0] ?? UserRole.Farmer,
		};

		if (editingSoilId) {
			setData(prev => ({
				...prev,
				soilAnalyses: prev.soilAnalyses.map(a => a.id === editingSoilId ? soilData : a),
			}));
		} else {
			setData(prev => ({
				...prev,
				soilAnalyses: [soilData, ...prev.soilAnalyses],
			}));
		}

		// Reset soil form
		setSoilPlotLocation('');
		setSoilTestDate(new Date().toISOString().substring(0, 10));
		setSoilLabName('');
		setSoilPH('');
		setSoilPhosphorus('');
		setSoilPotassium('');
		setSoilNitrogen('');
		setSoilCalcium('');
		setSoilMagnesium('');
		setSoilNotes('');
		setEditingSoilId(null);
		setSoilFormError(null);
		setToast({ type: 'success', message: editingSoilId ? 'Soil data updated' : 'Soil data saved' });
	};

	const handleSoilEdit = (analysis: SoilAnalysis) => {
		setEditingSoilId(analysis.id);
		setSoilPlotLocation(analysis.farmPlotLocation);
		setSoilTestDate(analysis.testDate);
		setSoilLabName(analysis.labName ?? '');
		setSoilPH(analysis.pH.toString());
		setSoilPhosphorus(analysis.phosphorus.toString());
		setSoilPotassium(analysis.potassium.toString());
		setSoilNitrogen(analysis.nitrogen.toString());
		setSoilCalcium(analysis.calcium.toString());
		setSoilMagnesium(analysis.magnesium.toString());
		setSoilNotes(analysis.notes ?? '');
	};

	const handleSoilDelete = async (id: string) => {
		if (!confirm('Confirm deletion of this soil data?')) return;
		try {
			await deleteSoilAnalysis(id);
			setData(prev => ({
				...prev,
				soilAnalyses: prev.soilAnalyses.filter(a => a.id !== id),
			}));
			if (editingSoilId === id) {
				setEditingSoilId(null);
			}
			setToast({ type: 'success', message: 'Soil data deleted' });
		} catch (error) {
			console.error('Failed to delete soil analysis:', error);
			setToast({ type: 'error', message: 'Failed to delete soil data' });
		}
	};

	// Weather form handlers
	const handleWeatherSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingFarmId) return;

		if (!weatherTempMin || !weatherTempMax || !weatherRainfall || !weatherHumidity) {
			setWeatherFormError('Please fill in all required fields');
			return;
		}

		const editingFarm = data.farms.find(f => f.id === editingFarmId);
		if (!editingFarm) return;

		const weatherData: Partial<WeatherRecord> = {
			farmId: editingFarmId,
			farmPlotLocation: editingFarm.location,
			recordDate: weatherDate,
			temperatureMin: parseFloat(weatherTempMin),
			temperatureMax: parseFloat(weatherTempMax),
			temperatureAvg: weatherTempAvg ? parseFloat(weatherTempAvg) : (parseFloat(weatherTempMin) + parseFloat(weatherTempMax)) / 2,
			rainfall: parseFloat(weatherRainfall),
			humidity: parseFloat(weatherHumidity),
			source: 'Manual',
			notes: weatherNotes || undefined,
		};

		try {
			if (editingWeatherId) {
				const savedRecord = await updateWeatherRecord(editingWeatherId, weatherData);
				setData(prev => ({
					...prev,
					weatherRecords: prev.weatherRecords.map(r => r.id === editingWeatherId ? savedRecord : r),
				}));
				setToast({ type: 'success', message: 'Weather data updated' });
			} else {
				const savedRecord = await addWeatherRecord(weatherData);
				setData(prev => ({
					...prev,
					weatherRecords: [savedRecord, ...prev.weatherRecords],
				}));
				setToast({ type: 'success', message: 'Weather data saved' });
			}

			// Reset weather form
			setWeatherDate(new Date().toISOString().substring(0, 10));
			setWeatherTempMin('');
			setWeatherTempMax('');
			setWeatherRainfall('');
			setWeatherHumidity('70');
			setWeatherNotes('');
			setEditingWeatherId(null);
			setWeatherFormError(null);
		} catch (error) {
			console.error('Failed to save weather record:', error);
			setWeatherFormError('Failed to save weather data');
		}
	};

	const handleWeatherEdit = (record: WeatherRecord) => {
		setEditingWeatherId(record.id);
		setWeatherDate(record.recordDate);
		setWeatherTempMin(record.temperatureMin.toString());
		setWeatherTempMax(record.temperatureMax.toString());
		setWeatherRainfall(record.rainfall.toString());
		setWeatherHumidity(record.humidity.toString());
		setWeatherNotes(record.notes ?? '');
	};

	const handleWeatherDelete = async (id: string) => {
		if (!confirm('Confirm deletion of this weather data?')) return;
		try {
			await deleteWeatherRecord(id);
			setData(prev => ({
				...prev,
				weatherRecords: prev.weatherRecords.filter(r => r.id !== id),
			}));
			if (editingWeatherId === id) {
				setEditingWeatherId(null);
			}
			setToast({ type: 'success', message: 'Weather data deleted' });
		} catch (error) {
			console.error('Failed to delete weather record:', error);
			setToast({ type: 'error', message: 'Failed to delete weather data' });
		}
	};

	const handleFetchWeather = async () => {
		if (!editingFarmId) return;
		const editingFarm = data.farms.find(f => f.id === editingFarmId);
		if (!editingFarm?.latitude || !editingFarm?.longitude) {
			setWeatherFormError('This farm does not have GPS coordinates yet');
			return;
		}

		setIsFetchingWeather(true);
		setWeatherFormError(null);

		try {
			const weatherData = await fetchWeatherData(editingFarm.latitude, editingFarm.longitude);
			if (weatherData) {
				setWeatherTempMin(weatherData.temperatureMin.toString());
				setWeatherTempMax(weatherData.temperatureMax.toString());
				setWeatherRainfall(weatherData.rainfall.toString());
				if (weatherData.humidity) {
					setWeatherHumidity(weatherData.humidity.toString());
				}
				setWeatherNotes(`Fetched from API on ${new Date().toLocaleString('en-US')}`);
			}
		} catch (error) {
			setWeatherFormError('Unable to fetch data');
		} finally {
			setIsFetchingWeather(false);
		}
	};

	// Harvest form handlers
	const handleHarvestSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingFarmId) return;

		if (!harvestVariety || !harvestWeight) {
			setHarvestFormError('Please enter variety and weight');
			return;
		}

		const editingFarm = data.farms.find(f => f.id === editingFarmId);
		if (!editingFarm) return;

		const harvestData: HarvestLot = {
			id: editingHarvestId ?? generateHarvestLotId(data.harvestLots.map(l => l.id)),
			farmerName: editingFarm.farmerName,
			cherryVariety: harvestVariety,
			weightKg: parseFloat(harvestWeight),
			farmPlotLocation: editingFarm.location,
			harvestDate: harvestDate,
			status: 'Ready for Processing',
		};

		if (editingHarvestId) {
			setData(prev => ({
				...prev,
				harvestLots: prev.harvestLots.map(l => l.id === editingHarvestId ? harvestData : l),
			}));
			setToast({ type: 'success', message: 'Harvest Lot updated' });
			// Reset harvest form after edit
			setHarvestVariety('');
			setHarvestWeight('');
			setHarvestDate(new Date().toISOString().substring(0, 10));
			setEditingHarvestId(null);
		} else {
			setData(prev => ({
				...prev,
				harvestLots: [harvestData, ...prev.harvestLots],
			}));
			setToast({ type: 'success', message: 'Harvest Lot saved! You can add more varieties on the same day' });
			// Reset only variety and weight, keep the same date for easy adding multiple varieties
			setHarvestVariety('');
			setHarvestWeight('');
			// Keep harvestDate the same so user can easily add more varieties on the same day
		}
		setHarvestFormError(null);
	};

	const handleHarvestEdit = (lot: HarvestLot) => {
		setEditingHarvestId(lot.id);
		setHarvestVariety(lot.cherryVariety);
		setHarvestWeight(lot.weightKg.toString());
		setHarvestDate(lot.harvestDate);
	};

	const handleHarvestDelete = (id: string) => {
		if (!confirm('Confirm deletion of this Harvest Lot?')) return;
		setData(prev => ({
			...prev,
			harvestLots: prev.harvestLots.filter(l => l.id !== id),
		}));
		if (editingHarvestId === id) {
			setEditingHarvestId(null);
		}
		setToast({ type: 'success', message: 'Harvest Lot deleted' });
	};

	// Geocoding: Find GPS coordinates from location address
	const handleGeocodeLocation = async () => {
		if (!farmLocation.trim()) {
			setFormError('Please enter a location first');
			return;
		}

		setIsGeocoding(true);
		setFormError(null);

		try {
			// Use OpenStreetMap Nominatim API (free, no API key required)
			const query = encodeURIComponent(farmLocation.trim());
			const response = await fetch(
				`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
				{
					headers: {
						'User-Agent': 'CoffeeLab-Platform/1.0', // Required by Nominatim
					},
				}
			);

			if (!response.ok) {
				throw new Error('Failed to fetch location data');
			}

			const data = await response.json();

			if (data && data.length > 0) {
				const result = data[0];
				setLatitudeInput(parseFloat(result.lat).toFixed(6));
				setLongitudeInput(parseFloat(result.lon).toFixed(6));
				setToast({
					type: 'success',
					message: `Found location: ${result.display_name}`,
				});
			} else {
				setFormError('Location not found. Please try a more specific address or enter coordinates manually.');
			}
		} catch (error) {
			setFormError('Unable to find GPS coordinates. Please enter them manually.');
			console.error('Geocoding error:', error);
		} finally {
			setIsGeocoding(false);
		}
	};

	// Get current location using browser geolocation API
	const handleGetCurrentLocation = () => {
		if (!navigator.geolocation) {
			setFormError('Geolocation is not supported by your browser');
			return;
		}

		setIsGettingLocation(true);
		setFormError(null);

		navigator.geolocation.getCurrentPosition(
			(position) => {
				setLatitudeInput(position.coords.latitude.toFixed(6));
				setLongitudeInput(position.coords.longitude.toFixed(6));
				setToast({
					type: 'success',
					message: 'Current location retrieved successfully',
				});
				setIsGettingLocation(false);
			},
			(error) => {
				setFormError('Unable to get your current location. Please allow location access or enter coordinates manually.');
				setIsGettingLocation(false);
				console.error('Geolocation error:', error);
			},
			{
				enableHighAccuracy: true,
				timeout: 10000,
				maximumAge: 0,
			}
		);
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

	const isEditing = Boolean(editingFarmId);
	const toastColors = !toast
		? ''
		: toast.type === 'success'
			? 'bg-green-50 border-green-200 text-green-800'
			: 'bg-red-50 border-red-200 text-red-700';
	const modalTitle = isEditing ? 'Edit Farm' : 'Add New Farm';
	const modalSubmitLabel = isEditing ? 'Update Farm' : 'Save Farm';
	const modalSubmitIcon = isEditing ? <Save className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />;
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
						<Button variant="primary" icon={<PlusCircle className="h-5 w-5" />} onClick={handleOpenAddModal}>
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
							<Button variant="primary" icon={<PlusCircle className="h-4 w-4" />} onClick={handleOpenAddModal}>Add My First Farm</Button>
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
						height="600px"
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
													handleOpenEditModal(farm);
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


			<Modal isOpen={isModalOpen} onClose={closeModal} title={modalTitle} maxWidth="2xl">
				{/* Tab Navigation - show only when editing */}
				{editingFarmId && (
					<div className="flex border-b border-gray-200 mb-6">
						<button
							type="button"
							onClick={() => setActiveTab('farm')}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
								activeTab === 'farm'
									? 'border-emerald-600 text-emerald-600'
									: 'border-transparent text-gray-500 hover:text-gray-700'
							}`}
						>
							<MapPin className="h-4 w-4 inline mr-2" />
							Farm Info
						</button>
						<button
							type="button"
							onClick={() => setActiveTab('soil')}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
								activeTab === 'soil'
									? 'border-emerald-600 text-emerald-600'
									: 'border-transparent text-gray-500 hover:text-gray-700'
							}`}
						>
							<Microscope className="h-4 w-4 inline mr-2" />
							Soil Data ({editingFarmSoilAnalyses.length})
						</button>
						<button
							type="button"
							onClick={() => setActiveTab('weather')}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
								activeTab === 'weather'
									? 'border-emerald-600 text-emerald-600'
									: 'border-transparent text-gray-500 hover:text-gray-700'
							}`}
						>
							<Cloud className="h-4 w-4 inline mr-2" />
							Weather ({editingFarmWeatherRecords.length})
						</button>
					</div>
				)}

				{/* Farm Tab Content */}
				{activeTab === 'farm' && (
				<form onSubmit={handleSaveFarm} className="space-y-6">
					<Input
						label="Farm Name"
						placeholder="e.g., Finca La Esperanza (optional)"
						value={farmName}
						onChange={e => setFarmName(e.target.value)}
						fullWidth
					/>
					<Input
						label="Location"
						placeholder="Province / Coordinates / Planting Zone"
						value={farmLocation}
						onChange={e => setFarmLocation(e.target.value)}
						required
						fullWidth
					/>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Input
							label="Farm Owner Name"
							placeholder="Owner's real name"
							value={ownerName}
							onChange={e => setOwnerName(e.target.value)}
							required
							fullWidth
						/>
						<Input
							label="Caretaker Name"
							placeholder="Manager/Main Caretaker"
							value={caretakerName}
							onChange={e => setCaretakerName(e.target.value)}
							required
							fullWidth
						/>
					</div>
					<div className="space-y-3">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<Input
								label="Latitude"
								placeholder="e.g., 19.910"
								value={latitudeInput}
								onChange={e => setLatitudeInput(e.target.value)}
								type="text"
								fullWidth
							/>
							<Input
								label="Longitude"
								placeholder="e.g., 99.841"
								value={longitudeInput}
								onChange={e => setLongitudeInput(e.target.value)}
								type="text"
								fullWidth
							/>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={(e) => {
									e.stopPropagation();
									handleGeocodeLocation();
								}}
								disabled={isGeocoding || !farmLocation.trim()}
								icon={isGeocoding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
							>
								{isGeocoding ? 'Finding...' : 'Find GPS from Location'}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={(e) => {
									e.stopPropagation();
									handleGetCurrentLocation();
								}}
								disabled={isGettingLocation}
								icon={isGettingLocation ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}
							>
								{isGettingLocation ? 'Getting...' : 'Use Current Location'}
							</Button>
						</div>
						<p className="text-xs text-gray-500">
							💡 Tip: Enter your farm location above, then click "Find GPS from Location" to automatically get coordinates, or use "Use Current Location" if you're at the farm.
						</p>
					</div>
					<div className="w-1/2">
						<Input
							label="Area Size (Hectares)"
							placeholder="e.g., 15"
							value={sizeInput}
							onChange={e => setSizeInput(e.target.value)}
							type="text"
							fullWidth
						/>
					</div>
					<div className="space-y-4">
						<div>
							<label className="block text-sm font-semibold text-gray-700 mb-2">Planted Varieties *</label>
							<div className="flex flex-col gap-3 md:flex-row md:items-end">
								<div className="flex-1">
									<Select
										value={null}
										onChange={(v) => {
											const variety = v as string;
											if (variety && !selectedVarieties.includes(variety)) {
												toggleVariety(variety);
											}
										}}
										options={COFFEE_VARIETIES.filter(v => !selectedVarieties.includes(v))}
										placeholder="Select variety..."
										colorTheme="emerald"
									/>
								</div>
								<div className="flex-1">
									<Input
										placeholder="Or type another variety name"
										value={customVariety}
										onChange={e => setCustomVariety(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												handleCustomVarietyAdd();
											}
										}}
										fullWidth
									/>
								</div>
								<Button type="button" variant="secondary" onClick={handleCustomVarietyAdd} className="md:w-auto whitespace-nowrap">
									Add
								</Button>
							</div>
						</div>
						{selectedVarieties.length > 0 && (
							<div>
								<p className="text-xs font-semibold text-gray-500 mb-2">Selected Varieties ({selectedVarieties.length})</p>
								<div className="flex flex-wrap gap-2">
									{selectedVarieties.map(variety => (
										<span key={variety} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-medium">
											{variety}
											<button
												type="button"
												onClick={() => removeVariety(variety)}
												className="text-emerald-500 hover:text-emerald-700 transition-colors"
												aria-label={`Remove variety ${variety}`}
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
							Cancel
						</Button>
						<Button type="submit" variant="primary" icon={modalSubmitIcon}>
							{modalSubmitLabel}
						</Button>
					</div>
				</form>
				)}

				{/* Soil Tab Content */}
				{activeTab === 'soil' && editingFarmId && (
					<div className="space-y-6">
						<form onSubmit={handleSoilSubmit} className="space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<Input
									label="Plot / Planting Area"
									placeholder="e.g., Plot A"
									value={soilPlotLocation}
									onChange={e => setSoilPlotLocation(e.target.value)}
									fullWidth
								/>
								<Input
									label="Test Date"
									type="date"
									value={soilTestDate}
									onChange={e => setSoilTestDate(e.target.value)}
									required
									fullWidth
								/>
							</div>
							<Input
								label="Laboratory Name"
								placeholder="e.g., Chiang Mai Agricultural Lab"
								value={soilLabName}
								onChange={e => setSoilLabName(e.target.value)}
								fullWidth
							/>
							<div className="border-t pt-4">
								<p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
									<FlaskConical className="h-4 w-4 text-emerald-600" />
									Essential Nutrients (Required)
								</p>
								<div className="grid grid-cols-2 md:grid-cols-3 gap-4">
									<Input label="pH" type="number" step="0.1" value={soilPH} onChange={e => setSoilPH(e.target.value)} required fullWidth />
									<Input label="Phosphorus (ppm)" type="number" step="0.1" value={soilPhosphorus} onChange={e => setSoilPhosphorus(e.target.value)} required fullWidth />
									<Input label="Potassium (ppm)" type="number" step="0.1" value={soilPotassium} onChange={e => setSoilPotassium(e.target.value)} required fullWidth />
									<Input label="Nitrogen (%)" type="number" step="0.1" value={soilNitrogen} onChange={e => setSoilNitrogen(e.target.value)} required fullWidth />
									<Input label="Calcium (ppm)" type="number" step="0.1" value={soilCalcium} onChange={e => setSoilCalcium(e.target.value)} required fullWidth />
									<Input label="Magnesium (ppm)" type="number" step="0.1" value={soilMagnesium} onChange={e => setSoilMagnesium(e.target.value)} required fullWidth />
								</div>
							</div>
							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
								<textarea
									value={soilNotes}
									onChange={e => setSoilNotes(e.target.value)}
									rows={2}
									placeholder="Additional notes..."
									className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
								/>
							</div>
							{soilFormError && (
								<div className="px-4 py-3 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm">{soilFormError}</div>
							)}
							<div className="flex justify-end gap-3">
								{editingSoilId && (
									<Button type="button" variant="outline" onClick={() => { setEditingSoilId(null); setSoilFormError(null); }}>
										Cancel Edit
									</Button>
								)}
								<Button type="submit" variant="primary" icon={<CheckCircle className="h-4 w-4" />}>
									{editingSoilId ? 'Update Soil Data' : 'Save Soil Data'}
								</Button>
							</div>
						</form>

						{/* Soil History Table */}
						{editingFarmSoilAnalyses.length > 0 && (
							<div className="border-t pt-4">
								<h3 className="text-sm font-semibold text-gray-900 mb-3">Analysis History ({editingFarmSoilAnalyses.length} entries)</h3>
								<div className="overflow-x-auto">
									<table className="min-w-full divide-y divide-gray-200 text-sm">
										<thead className="bg-gray-900 text-white">
											<tr>
												<th className="px-3 py-2 text-left font-semibold">Date</th>
												<th className="px-3 py-2 text-center font-semibold">pH</th>
												<th className="px-3 py-2 text-center font-semibold">N</th>
												<th className="px-3 py-2 text-center font-semibold">P</th>
												<th className="px-3 py-2 text-center font-semibold">K</th>
												<th className="px-3 py-2 text-center font-semibold">Actions</th>
											</tr>
										</thead>
										<tbody className="bg-white divide-y divide-gray-100">
											{editingFarmSoilAnalyses.map(analysis => (
												<tr key={analysis.id} className="hover:bg-gray-50">
													<td className="px-3 py-2">{formatDateDisplay(analysis.testDate)}</td>
													<td className="px-3 py-2 text-center font-semibold">{analysis.pH}</td>
													<td className="px-3 py-2 text-center">{analysis.nitrogen}</td>
													<td className="px-3 py-2 text-center">{analysis.phosphorus}</td>
													<td className="px-3 py-2 text-center">{analysis.potassium}</td>
													<td className="px-3 py-2 text-center">
														<div className="flex items-center justify-center gap-1">
															<button type="button" onClick={() => handleSoilEdit(analysis)} className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100">
																<Edit3 className="h-3.5 w-3.5" />
															</button>
															<button type="button" onClick={() => handleSoilDelete(analysis.id)} className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100">
																<Trash2 className="h-3.5 w-3.5" />
															</button>
														</div>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						)}
					</div>
				)}

				{/* Weather Tab Content */}
				{activeTab === 'weather' && editingFarmId && (
					<div className="space-y-6">
						<form onSubmit={handleWeatherSubmit} className="space-y-4">
							<div className="flex justify-end">
								<Button
									type="button"
									variant="secondary"
									onClick={handleFetchWeather}
									disabled={isFetchingWeather}
									icon={<RefreshCw className={`h-4 w-4 ${isFetchingWeather ? 'animate-spin' : ''}`} />}
								>
									{isFetchingWeather ? 'Fetching...' : 'Fetch from API'}
								</Button>
							</div>
							<Input
								label="Record Date"
								type="date"
								value={weatherDate}
								onChange={e => setWeatherDate(e.target.value)}
								required
								fullWidth
							/>
							<div className="border-t pt-4">
								<p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
									<Thermometer className="h-4 w-4 text-gray-500" />
									Temperature
								</p>
								<div className="grid grid-cols-3 gap-4">
									<Input label="Min (°C)" type="number" step="0.1" value={weatherTempMin} onChange={e => setWeatherTempMin(e.target.value)} required fullWidth />
									<Input label="Max (°C)" type="number" step="0.1" value={weatherTempMax} onChange={e => setWeatherTempMax(e.target.value)} required fullWidth />
									<Input label="Avg (°C)" type="text" value={weatherTempAvg} disabled fullWidth />
								</div>
							</div>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
										<CloudRain className="h-4 w-4 text-gray-500" />
										Rainfall (mm)
									</label>
									<input
										type="number"
										step="0.1"
										value={weatherRainfall}
										onChange={e => setWeatherRainfall(e.target.value)}
										required
										className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
									/>
								</div>
								<div>
									<label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
										<Droplets className="h-4 w-4 text-gray-500" />
										Humidity (%)
									</label>
									<input
										type="number"
										step="1"
										min="0"
										max="100"
										value={weatherHumidity}
										onChange={e => setWeatherHumidity(e.target.value)}
										required
										className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
									/>
								</div>
							</div>
							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
								<textarea
									value={weatherNotes}
									onChange={e => setWeatherNotes(e.target.value)}
									rows={2}
									placeholder="Additional notes..."
									className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
							</div>
							{weatherFormError && (
								<div className="px-4 py-3 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm">{weatherFormError}</div>
							)}
							<div className="flex justify-end gap-3">
								{editingWeatherId && (
									<Button type="button" variant="outline" onClick={() => { setEditingWeatherId(null); setWeatherFormError(null); }}>
										Cancel Edit
									</Button>
								)}
								<Button type="submit" variant="primary" icon={<CheckCircle className="h-4 w-4" />}>
									{editingWeatherId ? 'Update Weather Data' : 'Save Weather Data'}
								</Button>
							</div>
						</form>

						{/* Weather History Table */}
						{editingFarmWeatherRecords.length > 0 && (
							<div className="border-t pt-4">
								<h3 className="text-sm font-semibold text-gray-900 mb-3">Weather History ({editingFarmWeatherRecords.length} entries)</h3>
								<div className="overflow-x-auto">
									<table className="min-w-full divide-y divide-gray-200 text-sm">
										<thead className="bg-gray-900 text-white">
											<tr>
												<th className="px-3 py-2 text-left font-semibold">Date</th>
												<th className="px-3 py-2 text-center font-semibold">Temperature</th>
												<th className="px-3 py-2 text-center font-semibold">Rainfall</th>
												<th className="px-3 py-2 text-center font-semibold">Humidity</th>
												<th className="px-3 py-2 text-center font-semibold">Actions</th>
											</tr>
										</thead>
										<tbody className="bg-white divide-y divide-gray-100">
											{editingFarmWeatherRecords.map(record => (
												<tr key={record.id} className="hover:bg-gray-50">
													<td className="px-3 py-2">{formatDateDisplay(record.recordDate)}</td>
													<td className="px-3 py-2 text-center">{record.temperatureMin}°-{record.temperatureMax}°</td>
													<td className="px-3 py-2 text-center">{record.rainfall} mm</td>
													<td className="px-3 py-2 text-center">{record.humidity}%</td>
													<td className="px-3 py-2 text-center">
														<div className="flex items-center justify-center gap-1">
															<button type="button" onClick={() => handleWeatherEdit(record)} className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100">
																<Edit3 className="h-3.5 w-3.5" />
															</button>
															<button type="button" onClick={() => handleWeatherDelete(record.id)} className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100">
																<Trash2 className="h-3.5 w-3.5" />
															</button>
														</div>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						)}
					</div>
				)}

			</Modal>

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
