import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDataContext } from '../../../hooks/useDataContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useFormPersist } from '../../../hooks/useFormPersist';
import { HarvestLot, Farm, CropYear, UserRole } from '../../../types';
import { isAdminUser, ownsFarm } from '../../../utils/farmAccess';
import { findCurrentCropYearId } from '../../processor/workbench/constants';
import { Coffee } from 'lucide-react';
import DatePicker from '../../common/DatePicker';
import Select from '../../common/Select';
import { Modal } from '../../common/Modal';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import RestoredDataBanner from '../../common/RestoredDataBanner';
import { generateHarvestLotId } from '../../../utils/idGenerator';
import { addHarvestLot } from '../../../services/lots/harvestLotService';
import { todayDateOnly } from '../../../utils/dateOnly';

// Production Year Chips Component - แสดงแค่ 3 ปี (ก่อน, ปัจจุบัน, หน้า)
const ProductionYearChips: React.FC<{
  years: CropYear[];
  value: string;
  onChange: (value: string) => void;
}> = ({ years, value, onChange }) => {
  // หาปีปัจจุบันจาก today (Thai calendar day, so 30 September and
  // 1 October each have a current year)
  const currentYearId = useMemo(() => findCurrentCropYearId(years), [years]);

  // Base styles for all chips
  const baseChipClass = "relative flex items-center justify-center py-3 px-4 rounded-xl border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 cursor-pointer";
  const selectedClass = "bg-green-600 text-white border-green-600 shadow-lg";
  const unselectedClass = "bg-white text-gray-700 border-gray-200 hover:border-green-400 hover:bg-green-50";

  return (
    <div className="grid grid-cols-3 gap-3">
      {years.map(year => {
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
  const isAdmin = isAdminUser(currentUser);

  // The farms the user may record a lot on: any for an Admin, else the ones
  // they own (the backend refuses a collaborator's shared farm).
  const availableFarms = React.useMemo(() => {
    if (!currentUser) return data.farms;
    if (isAdmin) return data.farms;
    return data.farms.filter(f => ownsFarm(currentUser, f));
  }, [data.farms, currentUser, isAdmin]);

  // Filter farms that have varieties
  const farmsWithVarieties = React.useMemo(() => {
    return availableFarms.filter(f => f.varieties && f.varieties.length > 0);
  }, [availableFarms]);

  // Farm selection state
  const [selectedFarmId, setSelectedFarmId] = useState<string>(initialFarm?.id || '');
  const selectedFarm = React.useMemo(() => {
    return farmsWithVarieties.find(f => f.id === selectedFarmId) || initialFarm;
  }, [selectedFarmId, farmsWithVarieties, initialFarm]);

  // Form persist hook - saves form data to localStorage. The draft is kept
  // per user, so whoever signs in next on this browser never gets it (the
  // Header's Logout also clears every draft). Values the form fills in by
  // itself go through setDefaults: they are not edits, so they must not make
  // the form dirty (a false "leave page?" prompt) or save a draft.
  const {
    values: formValues,
    setValue: setFormValue,
    setDefaults,
    resetForm,
    clearSavedData,
    wasRestored,
  } = useFormPersist({
    storageKey: `harvest-lot-modal-${currentUser?.id || 'signed-out'}`,
    initialValues: {
      cherryVariety: '',
      weightKg: '',
      // The viewer's today (utils/dateOnly); the UTC day is still yesterday
      // in Thailand until 07:00.
      harvestDate: todayDateOnly(),
      cropYearId: '',
    },
    warnOnLeave: true,
  });

  // Extract values from formValues for easier access
  const { cherryVariety, weightKg, harvestDate, cropYearId } = formValues;

  // Form state setters that use the persist hook
  const setCherryVariety = (value: string) => setFormValue('cherryVariety', value);
  const setWeightKg = (value: string) => setFormValue('weightKg', value);
  const setHarvestDate = (value: string) => setFormValue('harvestDate', value);
  const setCropYearId = (value: string) => setFormValue('cropYearId', value);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // The lot belongs to its farm's owner (the backend records it as theirs),
  // so the farmer named on it follows the farm. An Admin may pick another
  // name, but the pick holds only for the farm it was made on, and the popup
  // starts again from the owner each time it opens.
  const [farmerPick, setFarmerPick] = useState<{ farmId: string; name: string } | null>(null);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) setFarmerPick(null);
  }
  const selectedFarmerName = farmerPick && farmerPick.farmId === (selectedFarm?.id ?? '')
    ? farmerPick.name
    : selectedFarm?.farmerName?.trim() || '';

  const [formErrors, setFormErrors] = useState<{
    farm?: string;
    farmer?: string;
    variety?: string;
    weight?: string;
    harvestDate?: string;
    general?: string;
  }>({});

  const farmerOptions = useMemo(() => {
    const farmerNameSet = new Set(
      data.users
        .filter(user => user.roles?.includes(UserRole.Farmer) && user.isActive !== false)
        .map(user => user.name)
        .filter((name): name is string => !!name && name.trim().length > 0)
    );

    // Keep backward compatibility for farms that still reference a farmer name not in users list.
    if (selectedFarm?.farmerName?.trim()) {
      farmerNameSet.add(selectedFarm.farmerName.trim());
    }

    return Array.from(farmerNameSet)
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ value: name, label: name }));
  }, [data.users, selectedFarm?.farmerName]);

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

      // Auto-select current production year as default
      if (data.cropYears.length > 0) {
        const currentYearId = findCurrentCropYearId(data.cropYears);
        const currentYear = data.cropYears.find(y => y.id === currentYearId);
        // เลือก current year เป็นค่าเริ่มต้นเสมอ ถ้ายังไม่ได้เลือก หรือค่าเก่าไม่ตรงกับ crop year ที่มีอยู่
        const validSelection = cropYearId && data.cropYears.some(y => y.id === cropYearId);
        if (currentYear && !validSelection) {
          setDefaults({ cropYearId: currentYear.id });
        }
      }
    }
  }, [isOpen, initialFarm, farmsWithVarieties, selectedFarmId, data.cropYears]);

  // Update form when selected farm changes (but keep restored data)
  const prevFarmIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedFarm) {
      // Only reset if farm actually changed (not on initial mount with restored data)
      if (prevFarmIdRef.current !== null && prevFarmIdRef.current !== selectedFarm.id) {
        // Switching farm throws the entries away, so the saved draft (and
        // the "restored" banner over the now blank fields) goes with them;
        // otherwise a reload would bring the discarded values back.
        clearSavedData();
        setDefaults({
          cherryVariety: selectedFarm.varieties?.[0] || '',
          weightKg: '',
          harvestDate: todayDateOnly(),
          cropYearId: '',
        });
      } else if (!cherryVariety && selectedFarm.varieties?.[0]) {
        // Set default variety if not set
        setDefaults({ cherryVariety: selectedFarm.varieties[0] });
      }
      prevFarmIdRef.current = selectedFarm.id;
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

    if (isAdmin && !selectedFarmerName.trim()) {
      setFormErrors({ farmer: 'Please select a farmer.' });
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
        farmerName: isAdmin ? selectedFarmerName.trim() : selectedFarm.farmerName,
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

      // Build success message for parent notification/toast
      const successMsg = `Harvest lot ${savedLot.id || 'created'} registered successfully!`;
      setFormErrors({});

      // Notify parent component if callback provided
      if (onSuccess) {
        onSuccess(successMsg);
      }

      // Clear saved form data on success
      clearSavedData();

      // Reset local modal state and close immediately after successful registration
      resetForm();
      setDefaults({ cherryVariety: selectedFarm.varieties?.[0] || '' });
      setSuccessMessage(null);
      onClose();
    } catch (error: any) {
      console.error('Failed to add harvest lot:', error);
      const errorMessage = error?.message || error?.error || 'Failed to register harvest lot. Please try again.';
      setFormErrors({ general: errorMessage });
    } finally {
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
  }, [selectedFarm]);

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

  // Filter to 3 crop years (previous, current, next) and sort by startDate desc (newest left)
  const sortedCropYears = React.useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const activeCropYearStart = currentMonth >= 10 ? currentYear : currentYear - 1;

    // Build the 3 year strings we want
    const targetYears = [
      `${activeCropYearStart - 1}/${activeCropYearStart}`,     // previous
      `${activeCropYearStart}/${activeCropYearStart + 1}`,     // current
      `${activeCropYearStart + 1}/${activeCropYearStart + 2}`, // next
    ];

    return [...data.cropYears]
      .filter(cy => targetYears.includes(cy.year))
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [data.cropYears]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register New Harvest Lot"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Restored Data Banner */}
        <RestoredDataBanner
          show={wasRestored && !successMessage}
          onClear={resetForm}
          message="ข้อมูลที่กรอกก่อนหน้านี้ถูกกู้คืนแล้ว"
        />

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
              {isAdmin && selectedFarmerName && (
                <p className="text-sm text-green-800">Assigned Farmer: {selectedFarmerName}</p>
              )}
              <p className="text-sm text-green-700">{selectedFarm.location}</p>
              {selectedFarm.varieties && selectedFarm.varieties.length > 0 && (
                <p className="text-xs text-green-600 mt-1">
                  Planted Varieties: {selectedFarm.varieties.join(', ')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Farmer Selection - Admin only */}
        {isAdmin && (
          <div>
            <label className={labelClass}>Select Farmer *</label>
            <Select
              value={selectedFarmerName}
              onChange={(v) => {
                setFarmerPick({ farmId: selectedFarm?.id ?? '', name: (v as string) || '' });
                setFormErrors(prev => ({ ...prev, farmer: undefined }));
              }}
              options={farmerOptions}
              placeholder="Select a farmer..."
              colorTheme="emerald"
            />
            {formErrors.farmer && (
              <p className="mt-1 text-sm text-red-600">{formErrors.farmer}</p>
            )}
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
          <Button variant="secondary" onClick={onClose} type="button" disabled={isSubmitting}>
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
