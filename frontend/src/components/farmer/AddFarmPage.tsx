import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PlusCircle, Save, MapPin, Compass, X, RefreshCw, ArrowLeft, Sprout, User, Ruler, Coffee, Leaf, Info } from 'lucide-react';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Farm } from '../../types';
import { Button, Input } from '../common';
import Select from '../common/Select';
import { addFarm, updateFarm } from '../../services/farmService';
import { generateFarmId } from '../../utils/idGenerator';

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

const AddFarmPage: React.FC = () => {
	const navigate = useNavigate();
	const { farmId } = useParams<{ farmId?: string }>();
	const { data, setData } = useDataContext();
	const { currentUser } = useAuth();

	const [farmName, setFarmName] = useState('');
	const [farmLocation, setFarmLocation] = useState('');
	const [ownerName, setOwnerName] = useState(currentUser?.name ?? '');
	const [caretakerName, setCaretakerName] = useState('');
	const [selectedVarieties, setSelectedVarieties] = useState<string[]>([]);
	const [customVariety, setCustomVariety] = useState('');
	const [latitudeInput, setLatitudeInput] = useState('');
	const [longitudeInput, setLongitudeInput] = useState('');
	const [sizeInput, setSizeInput] = useState('');
	const [formError, setFormError] = useState<string | null>(null);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
	const [isGeocoding, setIsGeocoding] = useState(false);
	const [isGettingLocation, setIsGettingLocation] = useState(false);

	const isEditing = Boolean(farmId);
	const editingFarm = farmId ? data.farms.find(f => f.id === farmId) : null;

	useEffect(() => {
		if (currentUser && !ownerName) {
			setOwnerName(currentUser.name);
		}
	}, [currentUser, ownerName]);

	useEffect(() => {
		if (isEditing && editingFarm) {
			setFarmName(editingFarm.name ?? '');
			setFarmLocation(editingFarm.location);
			setOwnerName(editingFarm.ownerName ?? editingFarm.farmerName);
			setCaretakerName(editingFarm.caretakerName ?? '');
			setSelectedVarieties(editingFarm.varieties ?? []);
			setCustomVariety('');
			setLatitudeInput(
				editingFarm.latitude !== undefined && editingFarm.latitude !== null ? String(editingFarm.latitude) : '',
			);
			setLongitudeInput(
				editingFarm.longitude !== undefined && editingFarm.longitude !== null ? String(editingFarm.longitude) : '',
			);
			setSizeInput(
				editingFarm.sizeHectares !== undefined && editingFarm.sizeHectares !== null ? String(editingFarm.sizeHectares) : '',
			);
		} else {
			// Reset form for new farm
			setFarmName('');
			setFarmLocation('');
			setOwnerName(currentUser?.name ?? '');
			setCaretakerName('');
			setSelectedVarieties([]);
			setCustomVariety('');
			setLatitudeInput('');
			setLongitudeInput('');
			setSizeInput('');
		}
		setFormError(null);
	}, [isEditing, editingFarm, currentUser]);

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

		if (isEditing && farmId) {
			const existing = data.farms.find(f => f.id === farmId);
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
				const savedFarm = await updateFarm(farmId, updatedFarm);
				setData(prev => ({
					...prev,
					farms: prev.farms.map(f => f.id === farmId ? savedFarm : f),
				}));
				setToast({ type: 'success', message: 'Farm updated successfully!' });
				setTimeout(() => {
					navigate('/farmer-farms');
				}, 1000);
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
				setTimeout(() => {
					navigate('/farmer-farms');
				}, 1000);
			} catch (error) {
				console.error('Failed to add farm:', error);
				setToast({ type: 'error', message: 'Failed to add farm' });
			}
		}
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

	const pageTitle = isEditing ? 'Edit Farm' : 'Add New Farm';
	const submitLabel = isEditing ? 'Update Farm' : 'Save Farm';
	const submitIcon = isEditing ? <Save className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />;
	const toastColors = !toast
		? ''
		: toast.type === 'success'
			? 'bg-green-50 border-green-200 text-green-800'
			: 'bg-red-50 border-red-200 text-red-700';

	return (
		<div className="space-y-6">
			{/* Header Section */}
			<div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl p-6 shadow-sm border border-emerald-200">
				<div className="flex items-center gap-4 mb-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => navigate('/farmer-farms')}
						icon={<ArrowLeft className="h-4 w-4" />}
						className="bg-white hover:bg-gray-50"
					>
						Back to Farms
					</Button>
					<div className="flex-1 flex items-center gap-3">
						<div className="p-3 bg-emerald-100 rounded-xl">
							<Sprout className="h-6 w-6 text-emerald-600" />
						</div>
						<div>
							<h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
								{pageTitle}
							</h1>
							<p className="text-gray-600 mt-1">Fill in the farm information below</p>
						</div>
					</div>
				</div>

				{toast && (
					<div className={`flex items-center justify-between px-4 py-3 border rounded-xl ${toastColors} transition-all duration-300`}>
						<span className="font-semibold">{toast.message}</span>
						<button className="p-1 rounded-full hover:bg-black/5 transition-colors" onClick={() => setToast(null)} aria-label="Close message">
							<X className="h-4 w-4" />
						</button>
					</div>
				)}
			</div>

			<form onSubmit={handleSaveFarm} className="space-y-6">
				{/* Basic Information Section */}
				<div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
					<div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
						<div className="p-2 bg-emerald-50 rounded-lg">
							<MapPin className="h-5 w-5 text-emerald-600" />
						</div>
						<h2 className="text-xl font-bold text-gray-900">Basic Information</h2>
					</div>
					<div className="space-y-4">
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
					</div>
				</div>

				{/* People Section */}
				<div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
					<div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
						<div className="p-2 bg-blue-50 rounded-lg">
							<User className="h-5 w-5 text-blue-600" />
						</div>
						<h2 className="text-xl font-bold text-gray-900">People</h2>
					</div>
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
				</div>

				{/* Location Details Section */}
				<div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-sky-200">
					<div className="flex items-center gap-3 mb-6 pb-4 border-b border-sky-100">
						<div className="p-2 bg-sky-50 rounded-lg">
							<Compass className="h-5 w-5 text-sky-600" />
						</div>
						<h2 className="text-xl font-bold text-gray-900">Location Details</h2>
					</div>
					<div className="space-y-4">
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
						
						{/* GPS Tools Card */}
						<div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-3">
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={handleGeocodeLocation}
									disabled={isGeocoding || !farmLocation.trim()}
									icon={isGeocoding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
									className="bg-white hover:bg-sky-50 border-sky-300 text-sky-700 hover:text-sky-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
								>
									{isGeocoding ? 'Finding...' : 'Find GPS from Location'}
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={handleGetCurrentLocation}
									disabled={isGettingLocation}
									icon={isGettingLocation ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}
									className="bg-white hover:bg-sky-50 border-sky-300 text-sky-700 hover:text-sky-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
								>
									{isGettingLocation ? 'Getting...' : 'Use Current Location'}
								</Button>
							</div>
							<div className="flex items-start gap-2 bg-white rounded-lg p-3 border border-sky-200">
								<Info className="h-4 w-4 text-sky-600 mt-0.5 flex-shrink-0" />
								<p className="text-xs text-gray-600 leading-relaxed">
									<strong className="text-sky-700">Tip:</strong> Enter your farm location above, then click "Find GPS from Location" to automatically get coordinates, or use "Use Current Location" if you're at the farm.
								</p>
							</div>
						</div>
					</div>
				</div>

				{/* Farm Details Section */}
				<div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
					<div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
						<div className="p-2 bg-amber-50 rounded-lg">
							<Ruler className="h-5 w-5 text-amber-600" />
						</div>
						<h2 className="text-xl font-bold text-gray-900">Farm Size</h2>
					</div>
					<div className="max-w-md">
						<Input
							label="Area Size (Hectares)"
							placeholder="e.g., 15"
							value={sizeInput}
							onChange={e => setSizeInput(e.target.value)}
							type="text"
							fullWidth
						/>
					</div>
				</div>

				{/* Coffee Varieties Section */}
				<div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-emerald-200">
					<div className="flex items-center gap-3 mb-6 pb-4 border-b border-emerald-100">
						<div className="p-2 bg-emerald-50 rounded-lg">
							<Coffee className="h-5 w-5 text-emerald-600" />
						</div>
						<div className="flex-1">
							<h2 className="text-xl font-bold text-gray-900">Coffee Varieties</h2>
							<p className="text-xs text-gray-500 mt-1">Select or add at least one variety *</p>
						</div>
					</div>
					<div className="space-y-4">
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
							<Button 
								type="button" 
								variant="secondary" 
								onClick={handleCustomVarietyAdd} 
								className="md:w-auto whitespace-nowrap bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 transition-all"
							>
								Add
							</Button>
						</div>
						{selectedVarieties.length > 0 && (
							<div className="pt-4 border-t border-gray-100">
								<p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
									<Leaf className="h-4 w-4 text-emerald-600" />
									Selected Varieties ({selectedVarieties.length})
								</p>
								<div className="flex flex-wrap gap-2">
									{selectedVarieties.map(variety => (
										<span 
											key={variety} 
											className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-medium hover:bg-emerald-100 transition-all animate-in fade-in duration-200"
										>
											{variety}
											<button
												type="button"
												onClick={() => removeVariety(variety)}
												className="text-emerald-500 hover:text-emerald-700 transition-colors rounded-full hover:bg-emerald-200 p-0.5"
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
				</div>

				{/* Error Message */}
				{formError && (
					<div className="px-4 py-3 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm flex items-start gap-2 animate-in fade-in duration-200">
						<X className="h-4 w-4 mt-0.5 flex-shrink-0" />
						<span>{formError}</span>
					</div>
				)}

				{/* Form Actions */}
				<div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
					<div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
						<Button 
							type="button" 
							variant="outline" 
							onClick={() => navigate('/farmer-farms')}
							className="px-6 hover:bg-gray-50 transition-all"
						>
							Cancel
						</Button>
						<Button 
							type="submit" 
							variant="primary" 
							icon={submitIcon}
							className="px-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all"
						>
							{submitLabel}
						</Button>
					</div>
				</div>
			</form>
		</div>
	);
};

export default AddFarmPage;
