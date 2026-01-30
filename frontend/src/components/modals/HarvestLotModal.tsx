import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { HarvestLot, Farm, CropYear, UserRole } from '../../types';
import { Coffee } from 'lucide-react';
import DatePicker from '../common/DatePicker';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { generateHarvestLotId } from '../../utils/idGenerator';
import { addHarvestLot } from '../../services/harvestLotService';

// Production Year Chips Component
const ProductionYearChips: React.FC<{
  years: CropYear[];
  value: string;
  onChange: (value: string) => void;
  maxVisible?: number; // จำนวนปีที่แสดง (default: 5)
}> = ({ years, value, onChange, maxVisible = 5 }) => {
  const [offset, setOffset] = useState(0);
  const initializedRef = useRef(false);

  // Smart Logic: หาปีปัจจุบันจาก today
  const currentYearId = useMemo(() => {
    const today = new Date();
    return years.find(y => {
      const start = new Date(y.startDate);
      const end = new Date(y.endDate);
      return today >= start && today <= end;
    })?.id || '';
  }, [years]);

  // Initialize offset ให้อยู่รอบๆ ปีปัจจุบัน (แค่ครั้งแรกเท่านั้น)
  useEffect(() => {
    if (initializedRef.current) return; // ไม่ reset ถ้า initialize แล้ว
    if (years.length > maxVisible && currentYearId) {
      const currentIndex = years.findIndex(y => y.id === currentYearId);
      const halfRange = Math.floor(maxVisible / 2);
      let startIndex = Math.max(0, currentIndex - halfRange);
      if (startIndex + maxVisible > years.length) {
        startIndex = Math.max(0, years.length - maxVisible);
      }
      setOffset(startIndex);
      initializedRef.current = true;
    }
  }, [years, currentYearId, maxVisible]);

  // คำนวณปีที่แสดง
  const visibleYears = useMemo(() => {
    if (years.length <= maxVisible) return years;
    return years.slice(offset, offset + maxVisible);
  }, [years, offset, maxVisible]);

  const canGoBack = offset > 0;
  const canGoForward = offset + maxVisible < years.length;
  const hasNavigation = years.length > maxVisible;

  // Base styles for all chips
  const baseChipClass = "relative flex items-center justify-center py-3 px-4 rounded-xl border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 cursor-pointer";
  const selectedClass = "bg-green-600 text-white border-green-600 shadow-lg";
  const unselectedClass = "bg-white text-gray-700 border-gray-200 hover:border-green-400 hover:bg-green-50";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {/* ปุ่ม "None" สำหรับไม่เลือกปี */}
        <button
          type="button"
          onClick={() => onChange('')}
          className={`${baseChipClass} ${!value ? selectedClass : unselectedClass}`}
        >
          <span className="text-sm font-semibold">None</span>
        </button>

        {/* ปุ่มแต่ละปี (จำกัดจำนวน) */}
        {visibleYears.map(year => {
          const isSelected = value === year.id;
          const isCurrent = year.id === currentYearId;

          return (
            <button
              key={year.id}
              type="button"
              onClick={() => onChange(year.id)}
              className={`${baseChipClass} ${isSelected ? selectedClass : unselectedClass}`}
              title={year.description || year.year}
            >
              {/* Current Badge - เฉพาะปีปัจจุบันเท่านั้น */}
              {isCurrent && (
                <span className={`absolute -top-2 -right-2 px-2 py-0.5 text-[10px] font-bold rounded-full shadow-sm ${
                  isSelected ? 'bg-white text-green-600' : 'bg-green-500 text-white'
                }`}>
                  Current
                </span>
              )}
              <span className="text-sm font-semibold">{year.year}</span>
            </button>
          );
        })}
      </div>

      {/* Navigation arrows - ด้านล่าง */}
      {/* ซ้าย = ไปปีใหม่ (offset-1), ขวา = ไปปีเก่า (offset+1) เพราะ years เรียง descending */}
      {hasNavigation && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - 1))}
            disabled={!canGoBack}
            className={`p-2 rounded-full transition-all duration-200 ${canGoBack ? 'hover:bg-green-100 text-gray-700' : 'text-gray-300 cursor-not-allowed'}`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setOffset(Math.min(years.length - maxVisible, offset + 1))}
            disabled={!canGoForward}
            className={`p-2 rounded-full transition-all duration-200 ${canGoForward ? 'hover:bg-green-100 text-gray-700' : 'text-gray-300 cursor-not-allowed'}`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

interface HarvestLotModalProps {
  isOpen: boolean;
  onClose: () => void;
  farm?: Farm; // Optional - can be selected in modal
  onSuccess?: (message: string) => void; // Callback to notify parent component of success
}

export const HarvestLotModal: React.FC<HarvestLotModalProps> = ({
  isOpen,
  onClose,
  farm: initialFarm,
  onSuccess,
}) => {
  const { data, setData } = useDataContext();
  const { currentUser } = useAuth();

  // Get available farms (farms that user can access)
  const availableFarms = React.useMemo(() => {
    if (!currentUser) return data.farms;
    const isAdmin = currentUser.roles?.includes(UserRole.Admin);
    if (isAdmin) return data.farms;
    return data.farms.filter(f =>
      f.ownerUserId === currentUser.id ||
      f.farmerName === currentUser.name
    );
  }, [data.farms, currentUser]);

  // Filter farms that have varieties
  const farmsWithVarieties = React.useMemo(() => {
    return availableFarms.filter(f => f.varieties && f.varieties.length > 0);
  }, [availableFarms]);

  // Farm selection state
  const [selectedFarmId, setSelectedFarmId] = useState<string>(initialFarm?.id || '');
  const selectedFarm = React.useMemo(() => {
    return farmsWithVarieties.find(f => f.id === selectedFarmId) || initialFarm;
  }, [selectedFarmId, farmsWithVarieties, initialFarm]);

  // Form states
  const [cherryVariety, setCherryVariety] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().substring(0, 10));
  const [cropYearId, setCropYearId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<{
    farm?: string;
    variety?: string;
    weight?: string;
    harvestDate?: string;
    general?: string;
  }>({});

  // Reset form when modal opens or farm changes
  useEffect(() => {
    if (isOpen) {
      if (initialFarm) {
        setSelectedFarmId(initialFarm.id);
      } else if (farmsWithVarieties.length > 0 && !selectedFarmId) {
        setSelectedFarmId(farmsWithVarieties[0].id);
      }
      // Clear errors and success message when modal opens
      setFormErrors({});
      setSuccessMessage(null);

      // Auto-select current production year
      if (!cropYearId && data.cropYears.length > 0) {
        const today = new Date();
        const currentYear = data.cropYears.find(y => {
          const start = new Date(y.startDate);
          const end = new Date(y.endDate);
          return today >= start && today <= end;
        });
        if (currentYear) {
          setCropYearId(currentYear.id);
        }
      }
    }
  }, [isOpen, initialFarm, farmsWithVarieties, selectedFarmId, data.cropYears]);

  // Update form when selected farm changes
  useEffect(() => {
    if (selectedFarm) {
      setCherryVariety(selectedFarm.varieties?.[0] || '');
      setWeightKg('');
      setHarvestDate(new Date().toISOString().substring(0, 10));
      setCropYearId('');
    }
  }, [selectedFarm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent double submission
    if (isSubmitting) {
      return;
    }

    // Clear previous errors
    setFormErrors({});

    // Validate farm selection
    if (!selectedFarm) {
      setFormErrors({ farm: 'Please select a farm.' });
      return;
    }

    // Validate that farm has varieties and one is selected
    if (!selectedFarm.varieties || selectedFarm.varieties.length === 0) {
      setFormErrors({ farm: 'This farm has no varieties. Please add varieties to the farm first.' });
      return;
    }

    if (!cherryVariety) {
      setFormErrors({ variety: 'Please select a cherry variety.' });
      return;
    }

    // Validate weight
    const weightValue = weightKg.trim();
    if (!weightValue) {
      setFormErrors({ weight: 'Please enter a weight.' });
      return;
    }

    const parsedWeight = parseFloat(weightValue);
    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      setFormErrors({ weight: 'Please enter a valid weight greater than 0.' });
      return;
    }

    if (parsedWeight > 100000) {
      setFormErrors({ weight: 'Weight seems too large. Please check your input.' });
      return;
    }

    // Validate harvest date
    if (!harvestDate) {
      setFormErrors({ harvestDate: 'Please select a harvest date.' });
      return;
    }

    const selectedDate = new Date(harvestDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    if (selectedDate > today) {
      setFormErrors({ harvestDate: 'Harvest date cannot be in the future.' });
      return;
    }

    setIsSubmitting(true);

    try {
      // Validate cropYearId if provided
      let validCropYearId: string | undefined = undefined;
      if (cropYearId && cropYearId.trim() !== '') {
        // Check if the selected cropYearId exists in data.cropYears
        const cropYearExists = data.cropYears.some(cy => cy.id === cropYearId);
        if (!cropYearExists) {
          setFormErrors({ general: 'Selected crop year not found. Please select a valid crop year.' });
          setIsSubmitting(false);
          return;
        }
        // Validate UUID format (basic check)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(cropYearId)) {
          setFormErrors({ general: 'Invalid crop year ID format. Please select a valid crop year.' });
          setIsSubmitting(false);
          return;
        }
        validCropYearId = cropYearId;
      }

      const lotData: Partial<HarvestLot> = {
        farmId: selectedFarm.id,
        farmerName: selectedFarm.farmerName,
        farmPlotLocation: selectedFarm.location, // Use farm location as plot location
        cherryVariety,
        weightKg: parseFloat(weightKg),
        harvestDate,
        status: 'Ready for Processing',
        cropYearId: validCropYearId,
      };

      const savedLot = await addHarvestLot(lotData);
      
      setData(prev => ({
        ...prev,
        harvestLots: [savedLot, ...prev.harvestLots],
      }));

      // Show success message
      const successMsg = `Harvest lot ${savedLot.id || 'created'} registered successfully!`;
      setSuccessMessage(successMsg);
      setFormErrors({});
      
      // Notify parent component if callback provided
      if (onSuccess) {
        onSuccess(successMsg);
      }

      // Reset form (keep selected farm) after a short delay to show success message
      setTimeout(() => {
        setCherryVariety(selectedFarm.varieties?.[0] || '');
        setWeightKg('');
        setHarvestDate(new Date().toISOString().substring(0, 10));
        setCropYearId('');
        setSuccessMessage(null);
        setIsSubmitting(false);
      }, 2000);
    } catch (error: any) {
      console.error('Failed to add harvest lot:', error);
      const errorMessage = error?.message || error?.error || 'Failed to register harvest lot. Please try again.';
      setFormErrors({ general: errorMessage });
      setIsSubmitting(false);
    }
  };

  const inputClass = "block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400 text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  // Filter varieties to show only those planted in this farm
  const availableVarieties = useMemo(() => {
    if (!selectedFarm?.varieties || selectedFarm.varieties.length === 0) {
      return [];
    }
    // Return only varieties that are in the farm's varieties list (including custom varieties)
    return selectedFarm.varieties;
  }, [selectedFarm?.varieties]);

  // Build farm label for dropdown
  const buildFarmLabel = (farm: Farm) => {
    if (farm.name && farm.location) {
      return `${farm.name} • ${farm.location}`;
    }
    return farm.name || farm.location;
  };

  const farmOptions = React.useMemo(() => {
    return farmsWithVarieties.map(farm => ({
      value: farm.id,
      label: buildFarmLabel(farm),
    }));
  }, [farmsWithVarieties]);

  // Sort crop years: current/active years first (endDate >= today), then by startDate desc
  const sortedCropYears = React.useMemo(() => {
    const today = new Date();
    return [...data.cropYears].sort((a, b) => {
      const aEndDate = new Date(a.endDate);
      const bEndDate = new Date(b.endDate);
      const aStartDate = new Date(a.startDate);
      const bStartDate = new Date(b.startDate);
      
      // Active years (not expired) come first
      const aIsActive = aEndDate >= today;
      const bIsActive = bEndDate >= today;
      
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      
      // Within same category, sort by startDate desc (newest first)
      return bStartDate.getTime() - aStartDate.getTime();
    });
  }, [data.cropYears]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register New Harvest Lot"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-2">
            <span className="text-green-600 font-semibold">✓</span>
            <p className="text-sm text-green-800 flex-1">{successMessage}</p>
          </div>
        )}
        
        {/* General Error Message */}
        {formErrors.general && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
            <span className="text-red-600 font-semibold">⚠️</span>
            <p className="text-sm text-red-800 flex-1">{formErrors.general}</p>
          </div>
        )}

        {/* Farm Selection - Only show if no initial farm provided */}
        {!initialFarm && (
          farmsWithVarieties.length > 0 ? (
            <div>
              <label className={labelClass}>Select Farm *</label>
              <Select
                value={selectedFarmId}
                onChange={(v) => {
                  setSelectedFarmId((v as string) || '');
                  setFormErrors(prev => ({ ...prev, farm: undefined }));
                }}
                options={farmOptions}
                placeholder="Select a farm..."
                colorTheme="emerald"
              />
              {formErrors.farm && (
                <p className="mt-1 text-sm text-red-600">{formErrors.farm}</p>
              )}
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800">
                No farms with varieties available. Please add varieties to your farms first before registering harvest lots.
              </p>
            </div>
          )
        )}

        {/* Farm Info Banner - Only show if farm is selected */}
        {selectedFarm && (
          <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Coffee className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-green-900">{selectedFarm.farmerName}</p>
              <p className="text-sm text-green-700">{selectedFarm.location}</p>
              {selectedFarm.varieties && selectedFarm.varieties.length > 0 && (
                <p className="text-xs text-green-600 mt-1">
                  Planted Varieties: {selectedFarm.varieties.join(', ')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Variety - Full Width - Only show if farm is selected and has varieties */}
        {!selectedFarm ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-800">
              Please select a farm first.
            </p>
          </div>
        ) : availableVarieties.length > 0 ? (
          <div>
            <label className={labelClass}>Cherry Variety *</label>
            <Select
              value={cherryVariety}
              onChange={(v) => {
                setCherryVariety((v as string) || '');
                setFormErrors(prev => ({ ...prev, variety: undefined }));
              }}
              options={availableVarieties}
              placeholder="Select variety..."
              colorTheme="emerald"
            />
            {formErrors.variety && (
              <p className="mt-1 text-sm text-red-600">{formErrors.variety}</p>
            )}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-800">
              This farm has no varieties recorded. Please add varieties to the farm first before registering harvest lots.
            </p>
          </div>
        )}

        {/* Weight & Harvest Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              label="Weight (kg) *"
              type="number"
              id="weightKg"
              value={weightKg}
              onChange={e => {
                setWeightKg(e.target.value);
                setFormErrors(prev => ({ ...prev, weight: undefined }));
              }}
              required
              placeholder="0"
              fullWidth
              className={formErrors.weight ? 'border-red-500 focus:ring-red-500' : ''}
            />
            {formErrors.weight && (
              <p className="mt-1 text-sm text-red-600">{formErrors.weight}</p>
            )}
          </div>
          <div>
            <DatePicker
              value={harvestDate}
              onChange={(date) => {
                setHarvestDate(date);
                setFormErrors(prev => ({ ...prev, harvestDate: undefined }));
              }}
              label="Harvest Date *"
              required
            />
            {formErrors.harvestDate && (
              <p className="mt-1 text-sm text-red-600">{formErrors.harvestDate}</p>
            )}
          </div>
        </div>

        {/* Crop Year - Full Width with Chips */}
        <div>
          <label className={labelClass}>Production Year (Optional)</label>
          <ProductionYearChips
            years={sortedCropYears}
            value={cropYearId}
            onChange={setCropYearId}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!selectedFarm || availableVarieties.length === 0 || isSubmitting}>
            {isSubmitting ? 'Registering...' : 'Register Lot'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default HarvestLotModal;
