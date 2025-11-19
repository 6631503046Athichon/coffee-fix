import React, { useState, useEffect, useMemo } from 'react';
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

// Coffee varieties list
const COFFEE_VARIETIES = [
  'Gesha',
  'Caturra',
  'Bourbon',
  'Typica',
  'SL28',
  'SL34',
  'Pacamara',
  'Catuai',
  'Mundo Novo',
  'Maragogype',
  'Kent',
  'Blue Mountain',
  'Ethiopian Heirloom',
  'Java',
  'Tekisic',
];

interface HarvestLotModalProps {
  isOpen: boolean;
  onClose: () => void;
  farm?: Farm; // Optional - can be selected in modal
}

export const HarvestLotModal: React.FC<HarvestLotModalProps> = ({
  isOpen,
  onClose,
  farm: initialFarm,
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

  // Reset form when modal opens or farm changes
  useEffect(() => {
    if (isOpen) {
      if (initialFarm) {
        setSelectedFarmId(initialFarm.id);
      } else if (farmsWithVarieties.length > 0 && !selectedFarmId) {
        setSelectedFarmId(farmsWithVarieties[0].id);
      }
    }
  }, [isOpen, initialFarm, farmsWithVarieties, selectedFarmId]);

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

    // Validate farm selection
    if (!selectedFarm) {
      alert('Please select a farm.');
      return;
    }

    // Validate that farm has varieties and one is selected
    if (!selectedFarm.varieties || selectedFarm.varieties.length === 0) {
      alert('This farm has no varieties. Please add varieties to the farm first.');
      return;
    }

    if (!cherryVariety) {
      alert('Please select a cherry variety.');
      return;
    }

    if (!weightKg || parseFloat(weightKg) <= 0) {
      alert('Please enter a valid weight.');
      return;
    }

    setIsSubmitting(true);

    try {
      const lotData: Partial<HarvestLot> = {
        farmId: selectedFarm.id,
        farmerName: selectedFarm.farmerName,
        farmPlotLocation: selectedFarm.location, // Use farm location as plot location
        cherryVariety,
        weightKg: parseFloat(weightKg),
        harvestDate,
        status: 'Ready for Processing',
        cropYearId: cropYearId && cropYearId.trim() !== '' ? cropYearId : undefined,
      };

      const savedLot = await addHarvestLot(lotData);
      
      setData(prev => ({
        ...prev,
        harvestLots: [savedLot, ...prev.harvestLots],
      }));

      // Reset form (keep selected farm)
      setCherryVariety(selectedFarm.varieties?.[0] || '');
      setWeightKg('');
      setHarvestDate(new Date().toISOString().substring(0, 10));
      setCropYearId('');
      setIsSubmitting(false);

      // Don't close modal automatically - let user close manually or add another lot
      // onClose();
    } catch (error: any) {
      console.error('Failed to add harvest lot:', error);
      const errorMessage = error?.message || error?.error || 'Failed to register harvest lot. Please try again.';
      alert(errorMessage);
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
      maxWidth="auto"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Farm Selection - Only show if no initial farm provided */}
        {!initialFarm && (
          farmsWithVarieties.length > 0 ? (
            <div>
              <label className={labelClass}>Select Farm *</label>
              <Select
                value={selectedFarmId}
                onChange={(v) => setSelectedFarmId((v as string) || '')}
                options={farmOptions}
                placeholder="Select a farm..."
                colorTheme="emerald"
              />
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
              onChange={(v) => setCherryVariety((v as string) || '')}
              options={availableVarieties}
              placeholder="Select variety..."
              colorTheme="emerald"
            />
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
              onChange={e => setWeightKg(e.target.value)}
              required
              placeholder="0"
              fullWidth
            />
          </div>
          <div>
            <DatePicker
              value={harvestDate}
              onChange={setHarvestDate}
              label="Harvest Date *"
              required
            />
          </div>
        </div>

        {/* Crop Year - Full Width */}
        <div>
          <label className={labelClass}>Production Year (Optional)</label>
          <Select<CropYear>
            value={cropYearId}
            onChange={(v) => setCropYearId((v as string) || '')}
            options={sortedCropYears}
            getValue={(cy) => cy.id}
            getLabel={(cy) => cy.description ? `${cy.year} — ${cy.description}` : cy.year}
            placeholder="Select production year..."
            colorTheme="emerald"
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
