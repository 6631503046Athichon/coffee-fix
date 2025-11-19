import React, { useState, useEffect, useMemo } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { HarvestLot, Farm, CropYear } from '../../types';
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
  farm: Farm;
}

export const HarvestLotModal: React.FC<HarvestLotModalProps> = ({
  isOpen,
  onClose,
  farm,
}) => {
  const { data, setData } = useDataContext();
  const { currentUser } = useAuth();

  // Form states
  const [cherryVariety, setCherryVariety] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().substring(0, 10));
  const [cropYearId, setCropYearId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCherryVariety(farm.varieties?.[0] || '');
      setWeightKg('');
      setHarvestDate(new Date().toISOString().substring(0, 10));
      setCropYearId('');
    }
  }, [isOpen, farm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent double submission
    if (isSubmitting) {
      return;
    }

    // Validate that farm has varieties and one is selected
    if (!farm.varieties || farm.varieties.length === 0) {
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
        farmId: farm.id,
        cherryVariety,
        weightKg: parseFloat(weightKg),
        harvestDate,
        status: 'Ready for Processing',
        cropYearId: cropYearId || undefined,
      };

      const savedLot = await addHarvestLot(lotData);
      
      setData(prev => ({
        ...prev,
        harvestLots: [savedLot, ...prev.harvestLots],
      }));

      // Reset form
      setCherryVariety(farm.varieties?.[0] || '');
      setWeightKg('');
      setHarvestDate(new Date().toISOString().substring(0, 10));
      setCropYearId('');
      setIsSubmitting(false);

      // Don't close modal automatically - let user close manually or add another lot
      // onClose();
    } catch (error) {
      console.error('Failed to add harvest lot:', error);
      alert('Failed to register harvest lot. Please try again.');
      setIsSubmitting(false);
    }
  };

  const inputClass = "block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400 text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  // Filter varieties to show only those planted in this farm
  const availableVarieties = useMemo(() => {
    if (!farm.varieties || farm.varieties.length === 0) {
      return [];
    }
    // Return only varieties that are in the farm's varieties list (including custom varieties)
    return farm.varieties;
  }, [farm.varieties]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register New Harvest Lot"
      maxWidth="auto"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Farm Info Banner */}
        <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <Coffee className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-green-900">{farm.farmerName}</p>
            <p className="text-sm text-green-700">{farm.location}</p>
            {farm.varieties && farm.varieties.length > 0 && (
              <p className="text-xs text-green-600 mt-1">
                Planted Varieties: {farm.varieties.join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* Variety - Full Width - Only show if farm has varieties */}
        {availableVarieties.length > 0 ? (
          <div>
            <label className={labelClass}>Cherry Variety *</label>
            <Select
              value={cherryVariety}
              onChange={(v) => setCherryVariety((v as string) || '')}
              options={availableVarieties}
              placeholder="Select variety..."
              colorTheme="emerald"
              fullWidth
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
            options={data.cropYears}
            getValue={(cy) => cy.id}
            getLabel={(cy) => cy.description ? `${cy.year} — ${cy.description}` : cy.year}
            placeholder="Select production year..."
            colorTheme="emerald"
            fullWidth
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={availableVarieties.length === 0 || isSubmitting}>
            {isSubmitting ? 'Registering...' : 'Register Lot'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default HarvestLotModal;
