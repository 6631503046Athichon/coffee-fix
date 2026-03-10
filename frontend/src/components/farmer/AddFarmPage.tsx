import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PlusCircle, Save, MapPin, Compass, X, RefreshCw, ArrowLeft, Sprout, User as UserIcon, Ruler, Coffee, Leaf, Info } from 'lucide-react';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Farm, User, UserRole } from '../../types';
import { Button, Input } from '../common';
import Select from '../common/Select';
import { addFarm, updateFarm } from '../../services/farmService';
import { generateFarmId } from '../../utils/idGenerator';
import { getActiveCoffeeVarieties, CoffeeVariety } from '../../services/coffeeVarietyService';
import { getAllUsers } from '../../services/userService';

type ParsedGoogleMaps = { lat: number; lng: number; placeName?: string } | null;

const getDistrictProvince = (placeName?: string): string | undefined => {
	if (!placeName) return undefined;
	const parts = placeName
		.split(',')
		.map(part => part.trim())
		.filter(Boolean);
	if (parts.length < 2) return undefined;
	const district = parts[parts.length - 2];
	const province = parts[parts.length - 1];
	return `${district}, ${province}`;
};

const getDistrictProvinceFromAddress = (address: Record<string, string>): string | undefined => {
	const district =
		address.county ||
		address.city_district ||
		address.state_district ||
		address.municipality ||
		address.city ||
		address.town ||
		address.village ||
		address.suburb ||
		address.neighbourhood;
	const province = address.state || address.region || address.province;
	if (district && province) return `${district}, ${province}`;
	return district || province;
};

function parseGoogleMapsUrl(url: string): ParsedGoogleMaps {
	if (!url) return null;
	try {
		const trimmed = url.trim();

		// Extract place name from /place/ENCODED_NAME/ pattern
		let placeName: string | undefined;
		const placeMatch = trimmed.match(/\/place\/([^/@]+)/);
		if (placeMatch) {
			try {
				placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
			} catch {
				placeName = placeMatch[1].replace(/\+/g, ' ');
			}
		}

		const atMatch = trimmed.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
		if (atMatch) {
			return {
				lat: parseFloat(atMatch[1]),
				lng: parseFloat(atMatch[2]),
				placeName,
			};
		}

		const qMatch = trimmed.match(/[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
		if (qMatch) {
			return {
				lat: parseFloat(qMatch[1]),
				lng: parseFloat(qMatch[2]),
				placeName,
			};
		}

		return null;
	} catch {
		return null;
	}
}

const AddFarmPage: React.FC = () => {
	const navigate = useNavigate();
	const { farmId } = useParams<{ farmId?: string }>();
	const { data, setData } = useDataContext();
	const { currentUser } = useAuth();

	const [farmName, setFarmName] = useState('');
	const [farmLocation, setFarmLocation] = useState('');
	const [ownerNames, setOwnerNames] = useState<string[]>(['']);
	const [selectedVarieties, setSelectedVarieties] = useState<string[]>([]);

	// Farmer (owner) dropdown
	const [farmerUsers, setFarmerUsers] = useState<User[]>([]);
	const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
	const [farmersLoading, setFarmersLoading] = useState(true);
	const isAdmin = currentUser?.roles?.includes(UserRole.Admin) ?? false;
	const [customVariety, setCustomVariety] = useState('');
	const [customVarietiesList, setCustomVarietiesList] = useState<string[]>([]); // varieties ที่ user เพิ่มเอง
	const [googleMapsUrl, setGoogleMapsUrl] = useState('');
	const [latitudeInput, setLatitudeInput] = useState('');
	const [longitudeInput, setLongitudeInput] = useState('');
	const [sizeInput, setSizeInput] = useState('');
	const [formError, setFormError] = useState<string | null>(null);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
	const [isGeocoding, setIsGeocoding] = useState(false);
	const [isGettingLocation, setIsGettingLocation] = useState(false);
	const [isParsingUrl, setIsParsingUrl] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const lastLoadedFarmIdRef = useRef<string | null>(null);

	// Coffee varieties from API
	const [coffeeVarieties, setCoffeeVarieties] = useState<CoffeeVariety[]>([]);
	const [varietiesLoading, setVarietiesLoading] = useState(true);

	const isEditing = Boolean(farmId);
	const editingFarm = farmId ? data.farms.find(f => f.id === farmId) : null;

	// Fetch coffee varieties from API
	useEffect(() => {
		const fetchVarieties = async () => {
			setVarietiesLoading(true);
			try {
				const varieties = await getActiveCoffeeVarieties();
				setCoffeeVarieties(varieties);
			} catch (error) {
				console.error('Failed to fetch coffee varieties:', error);
			} finally {
				setVarietiesLoading(false);
			}
		};
		fetchVarieties();
	}, []);

	// Fetch farmer users for dropdown
	useEffect(() => {
		const fetchFarmers = async () => {
			setFarmersLoading(true);
			try {
				const users = await getAllUsers();
				const farmers = users.filter(u => u.roles?.includes(UserRole.Farmer) && u.isActive !== false);
				setFarmerUsers(farmers);
				if (currentUser && !isAdmin && farmers.some(f => f.id === currentUser.id)) {
					setSelectedOwnerId(currentUser.id);
				}
			} catch (error) {
				console.error('Failed to fetch farmers:', error);
			} finally {
				setFarmersLoading(false);
			}
		};
		fetchFarmers();
	}, [currentUser, isAdmin]);

	useEffect(() => {
		if (isEditing && editingFarm) {
			if (lastLoadedFarmIdRef.current === editingFarm.id) {
				return;
			}
			lastLoadedFarmIdRef.current = editingFarm.id;
			setFarmName(editingFarm.name ?? '');
			setFarmLocation(editingFarm.location);
			const parsedOwners = editingFarm.ownerNames && editingFarm.ownerNames.length > 0
				? editingFarm.ownerNames
				: (editingFarm.ownerName ?? editingFarm.farmerName ?? '')
					.split(',')
					.map(name => name.trim())
					.filter(Boolean);
			setOwnerNames(parsedOwners.length > 0 ? parsedOwners : ['']);
			if (editingFarm.ownerUserId) {
				setSelectedOwnerId(editingFarm.ownerUserId);
			} else if (currentUser && !isAdmin) {
				setSelectedOwnerId(currentUser.id);
			}
			setSelectedVarieties(editingFarm.varieties ?? []);
			setCustomVariety('');
			setGoogleMapsUrl(editingFarm.googleMapsUrl ?? '');
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
			lastLoadedFarmIdRef.current = null;
			// Reset form for new farm
			setFarmName('');
			setFarmLocation('');
			setOwnerNames(['']);
			if (currentUser && !isAdmin) {
				setSelectedOwnerId(currentUser.id);
			} else {
				setSelectedOwnerId('');
			}
			setSelectedVarieties([]);
			setCustomVariety('');
			setGoogleMapsUrl('');
			setLatitudeInput('');
			setLongitudeInput('');
			setSizeInput('');
		}
		setFormError(null);
	}, [isEditing, editingFarm]);

	const toggleVariety = (variety: string) => {
		setSelectedVarieties(prev => (prev.includes(variety) ? prev.filter(v => v !== variety) : [...prev, variety]));
	};

	const handleOwnerNameChange = (index: number, value: string) => {
		setOwnerNames(prev => prev.map((name, i) => (i === index ? value : name)));
	};

	const handleAddOwnerName = () => {
		setOwnerNames(prev => [...prev, '']);
	};

	const handleRemoveOwnerName = (index: number) => {
		setOwnerNames(prev => (prev.length === 1 ? [''] : prev.filter((_, i) => i !== index)));
	};

	const removeVariety = (variety: string) => {
		setSelectedVarieties(prev => prev.filter(v => v !== variety));
	};

	const handleCustomVarietyAdd = () => {
		const trimmed = customVariety.trim();
		if (!trimmed) return;
		// เพิ่มลงใน selected varieties
		setSelectedVarieties(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
		// เพิ่มลงใน dropdown ด้วย (ถ้ายังไม่มีใน list)
		const allExistingVarieties = [...coffeeVarieties.map(v => v.name), ...customVarietiesList];
		if (!allExistingVarieties.includes(trimmed)) {
			setCustomVarietiesList(prev => [...prev, trimmed]);
		}
		setCustomVariety('');
	};

	const handleExtractFromGoogleMapsUrl = async () => {
		setFormError(null);

		if (!googleMapsUrl.trim()) {
			setFormError('Please paste a Google Maps URL first');
			return;
		}

		const parsed = parseGoogleMapsUrl(googleMapsUrl);
		if (!parsed) {
			setFormError('Unable to extract coordinates from this Google Maps URL. Please check the link or enter coordinates manually.');
			return;
		}

		const { lat, lng, placeName } = parsed;
		let districtProvince = getDistrictProvince(placeName);
		if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
			setFormError('The coordinates from this URL are not in a valid range.');
			return;
		}

		setLatitudeInput(lat.toFixed(6));
		setLongitudeInput(lng.toFixed(6));

		if (!districtProvince) {
			setIsParsingUrl(true);
			try {
				const response = await fetch(
					`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
					{
						headers: {
							'User-Agent': 'CoffeeLab-Platform/1.0',
						},
					}
				);
				if (response.ok) {
					const result = await response.json();
					if (result && result.address) {
						districtProvince = getDistrictProvinceFromAddress(result.address);
					}
				}
			} catch (error) {
				console.error('Reverse geocoding error:', error);
			} finally {
				setIsParsingUrl(false);
			}
		}

		const existingLocation = farmLocation.trim();

		// ถ้ามี Location อยู่แล้ว และดึงชื่อสถานที่จาก URL ได้ ให้เตือนว่าอาจไม่ตรงกัน
		if (existingLocation && districtProvince && existingLocation !== districtProvince) {
			setFarmLocation(districtProvince); // อัพเดทเป็นอำเภอ, จังหวัดจาก URL
			setToast({
				type: 'success',
				message: `เปลี่ยน Location จาก "${existingLocation}" เป็น "${districtProvince}" ตาม Google Maps URL`,
			});
		} else if (existingLocation && !districtProvince) {
			// มี Location อยู่แล้ว แต่ URL ไม่มีข้อมูลอำเภอ, จังหวัด - เตือนให้ตรวจสอบ
			setFormError(`⚠️ คุณกรอก "${existingLocation}" แต่ลิงค์ Google Maps ไม่มีข้อมูลอำเภอ/จังหวัด กรุณาตรวจสอบว่าพิกัด (${lat.toFixed(4)}, ${lng.toFixed(4)}) ตรงกับ "${existingLocation}" หรือไม่`);
		} else if (districtProvince && !existingLocation) {
			// ไม่มี Location - ใส่ชื่ออำเภอ, จังหวัดจาก URL ให้
			setFarmLocation(districtProvince);
			setToast({
				type: 'success',
				message: `ดึงพิกัดและ Location "${districtProvince}" จาก Google Maps URL สำเร็จ`,
			});
		} else {
			setToast({
				type: 'success',
				message: 'ดึงพิกัดจาก Google Maps URL สำเร็จ',
			});
		}
	};

	const handleSaveFarm = async (event: React.FormEvent) => {
		event.preventDefault();
		
		// Prevent double submission
		if (isSubmitting) {
			return;
		}
		
		setFormError(null);
		setToast(null);
		
		// Check authentication first
		if (!currentUser || !currentUser.id) {
			setFormError('Please log in before adding a farm. Your session may have expired.');
			setToast({ type: 'error', message: 'Please log in again' });
			setTimeout(() => {
				window.location.href = '/login';
			}, 2000);
			return;
		}
		
		setIsSubmitting(true);
		// Location is always required, but farm name is optional (can be removed when editing)
		if (!farmLocation.trim()) {
			setFormError('Please enter location');
			setIsSubmitting(false);
			return;
		}
		const sanitizedOwners = ownerNames.map(name => name.trim()).filter(Boolean);
		if (sanitizedOwners.length === 0) {
			setFormError('Please enter farm owner name');
			setIsSubmitting(false);
			return;
		}
		if (!selectedOwnerId) {
			setFormError('กรุณาเลือก Farmer ที่จะเป็นเจ้าของสวน');
			setIsSubmitting(false);
			return;
		}
		const selectedFarmer = farmerUsers.find(f => f.id === selectedOwnerId);
		const sanitizedFarmers = selectedFarmer ? [selectedFarmer.name] : [];
		if (selectedVarieties.length === 0) {
			setFormError('Please select or add at least 1 coffee variety');
			setIsSubmitting(false);
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
				setIsSubmitting(false);
				return;
			}
			const parsedLat = Number(trimmedLat);
			const parsedLng = Number(trimmedLng);
			if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
				setFormError('Coordinates must be numbers only');
				setIsSubmitting(false);
				return;
			}
			if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
				setFormError('Latitude must be between -90 and 90, and longitude between -180 and 180');
				setIsSubmitting(false);
				return;
			}
			latitude = parsedLat;
			longitude = parsedLng;
		}
		if (trimmedSize) {
			const parsedSize = Number(trimmedSize);
			if (Number.isNaN(parsedSize)) {
				setFormError('Area size must be a number only');
				setIsSubmitting(false);
				return;
			}
			if (parsedSize <= 0) {
				setFormError('Area size must be greater than 0 hectares');
				setIsSubmitting(false);
				return;
			}
			sizeHectares = parsedSize;
		}

		const ownerDisplayName = sanitizedOwners.join(', ');
		const timestamp = new Date().toISOString();

		if (isEditing && farmId) {
			const existing = data.farms.find(f => f.id === farmId);
			if (!existing) {
				setFormError('Farm data not found for editing');
				setIsSubmitting(false);
				return;
			}
			const updatedFarm: Farm = {
				...existing,
				name: farmName.trim() || undefined,
				farmerName: ownerDisplayName,
				ownerNames: sanitizedOwners,
				caretakerNames: sanitizedFarmers,
				caretakerName: undefined,
				googleMapsUrl: googleMapsUrl.trim() || undefined,
				location: farmLocation.trim(),
				ownerUserId: selectedOwnerId,
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
				setIsSubmitting(false);
				setTimeout(() => {
					navigate('/farmer-farms');
				}, 1000);
			} catch (error: any) {
				console.error('Failed to update farm:', error);
				const errorMessage = error?.message || 'Failed to update farm. Please try again.';
				setFormError(errorMessage);
				setToast({ type: 'error', message: errorMessage });
				setIsSubmitting(false);
				
				// If authentication error, redirect to login after showing error
				if (errorMessage.includes('Authentication failed') || errorMessage.includes('401')) {
					setTimeout(() => {
						window.location.href = '/login';
					}, 3000);
				}
			}
		} else {
			const newFarm: Farm = {
				id: generateFarmId(data.farms.map(f => f.id)),
				name: farmName.trim(),
				farmerName: ownerDisplayName,
				ownerNames: sanitizedOwners,
				caretakerNames: sanitizedFarmers,
				caretakerName: undefined,
				googleMapsUrl: googleMapsUrl.trim() || undefined,
				location: farmLocation.trim(),
				ownerUserId: selectedOwnerId,
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
				setIsSubmitting(false);
				setTimeout(() => {
					navigate('/farmer-farms');
				}, 1000);
			} catch (error: any) {
				console.error('Failed to add farm:', error);
				const errorMessage = error?.message || 'Failed to add farm. Please check your connection and try again.';
				setFormError(errorMessage);
				setToast({ type: 'error', message: errorMessage });
				setIsSubmitting(false);
				
				// If authentication error, redirect to login after showing error
				if (errorMessage.includes('Authentication failed') || errorMessage.includes('401')) {
					setTimeout(() => {
						window.location.href = '/login';
					}, 3000);
				}
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
		<div className="max-w-4xl mx-auto">
		<div className="space-y-6">
			{/* Header Section */}
			<div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl p-6 shadow-sm border border-emerald-200">
				<div className="flex items-center gap-4 mb-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => navigate(-1)}
						icon={<ArrowLeft className="h-4 w-4" />}
						className="bg-white hover:bg-gray-50"
					>
						Back
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
							<UserIcon className="h-5 w-5 text-blue-600" />
						</div>
						<h2 className="text-xl font-bold text-gray-900">People</h2>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<label className="block text-sm font-semibold text-gray-700">Farm Owner Name</label>
								<Button
									type="button"
									variant="secondary"
									onClick={handleAddOwnerName}
									className="px-3 py-1.5 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
								>
									Add Owner
								</Button>
							</div>
							<div className="space-y-2">
								{ownerNames.map((name, index) => (
									<div key={`owner-${index}`} className="flex items-center gap-2">
										<Input
											placeholder={`Owner name ${index + 1}`}
											value={name}
											onChange={e => handleOwnerNameChange(index, e.target.value)}
											fullWidth
										/>
										{ownerNames.length > 1 && (
											<Button
												type="button"
												variant="outline"
												onClick={() => handleRemoveOwnerName(index)}
												className="px-2.5 py-2 text-gray-500 hover:text-red-600"
												aria-label={`Remove owner ${index + 1}`}
											>
												<X className="h-4 w-4" />
											</Button>
										)}
									</div>
								))}
							</div>
						</div>
						<div className="space-y-3">
							<label className="block text-sm font-semibold text-gray-700">Farmer (เจ้าของฟาร์ม)</label>
							<Select
								options={farmerUsers}
								value={selectedOwnerId || null}
								onChange={(v) => setSelectedOwnerId(v as string)}
								getValue={(u: User) => u.id}
								getLabel={(u: User) => `${u.name}${u.email ? ` (${u.email})` : u.username ? ` (${u.username})` : ''}`}
								placeholder={farmersLoading ? 'กำลังโหลด...' : 'เลือก Farmer...'}
								disabled={!isAdmin || farmersLoading}
								colorTheme="blue"
							/>
							{!isAdmin && (
								<p className="text-xs text-gray-500">ฟาร์มจะถูกสร้างในบัญชีของคุณ</p>
							)}
						</div>
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
						<Input
							label="Google Maps URL (optional)"
							placeholder="Paste a full Google Maps link, e.g. https://www.google.com/maps/..."
							value={googleMapsUrl}
							onChange={e => setGoogleMapsUrl(e.target.value)}
							fullWidth
						/>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-1">Latitude</label>
								<div className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-700 font-mono text-sm min-h-[42px] flex items-center">
									{latitudeInput || <span className="text-gray-400">—</span>}
								</div>
							</div>
							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-1">Longitude</label>
								<div className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-700 font-mono text-sm min-h-[42px] flex items-center">
									{longitudeInput || <span className="text-gray-400">—</span>}
								</div>
							</div>
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
									onClick={handleExtractFromGoogleMapsUrl}
									disabled={!googleMapsUrl.trim() || isParsingUrl}
									icon={isParsingUrl ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
									className="bg-white hover:bg-sky-50 border-sky-300 text-sky-700 hover:text-sky-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
								>
									{isParsingUrl ? 'Checking...' : 'Use Google Maps URL'}
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
									options={[...coffeeVarieties.map(v => v.name), ...customVarietiesList].filter(v => !selectedVarieties.includes(v))}
									placeholder={varietiesLoading ? "Loading varieties..." : "Select variety..."}
									colorTheme="emerald"
									disabled={varietiesLoading}
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
							disabled={isSubmitting}
							className="px-6 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Cancel
						</Button>
						<Button 
							type="submit" 
							variant="primary" 
							icon={submitIcon}
							disabled={isSubmitting}
							className="px-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isSubmitting ? 'Saving...' : submitLabel}
						</Button>
					</div>
				</div>
			</form>
		</div>
		</div>
	);
};

export default AddFarmPage;
