import React from 'react';
import { HarvestLot, CropYear } from '../../../types';
import { PlayCircle, Scale, Droplet } from 'lucide-react';
import DatePicker from '../../common/DatePicker';

// Custom Dropdown Component for Process Type Selection
const ProcessTypeDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  processTypes: { value: string; label: string; }[];
}> = ({ value, onChange, processTypes }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const options = processTypes || [];

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value) ||
    options[0] ||
    { value: '', label: 'No process types available' };

  const hasOptions = options.length > 0;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => hasOptions && setIsOpen(!isOpen)}
        disabled={!hasOptions}
        className={`w-full border border-gray-300 rounded-xl px-4 py-3 text-base font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-gray-400 flex items-center justify-between gap-2 shadow-sm ${!hasOptions ? 'opacity-50 cursor-not-allowed' : ''
          }`}
      >
        <span className="text-gray-900">{selectedOption.label}</span>
        <svg className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && hasOptions && (
        <div className="absolute z-20 mt-3 left-0 right-0 bg-white border border-gray-300 rounded-xl shadow-2xl overflow-hidden">
          <div className="py-2">
            {options.length === 0 ? (
              <div className="px-5 py-3 text-sm text-gray-500 text-center">
                No active process types available
              </div>
            ) : (
              options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-5 py-3 transition-all text-base font-medium ${option.value === value
                      ? 'bg-indigo-100 text-indigo-700 font-bold'
                      : 'text-gray-900 hover:bg-indigo-50 hover:text-indigo-700'
                    }`}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Custom Dropdown Component for Crop Year Selection
const CustomCropYearDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: CropYear[];
  placeholder?: string;
}> = ({ value, onChange, options, placeholder = 'Select...' }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.id === value);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-gray-400 flex items-center justify-between gap-2 shadow-sm"
      >
        <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
          {selectedOption ? `${selectedOption.year} (${selectedOption.season})` : placeholder}
        </span>
        <svg className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-3 left-0 right-0 bg-white border border-gray-300 rounded-xl shadow-2xl overflow-hidden">
          <div className="py-2 max-h-60 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className="w-full text-left px-5 py-3 transition-all text-base font-medium text-gray-400 hover:bg-indigo-50 hover:text-indigo-700"
            >
              {placeholder}
            </button>
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-5 py-3 transition-all text-base font-medium ${option.id === value
                    ? 'bg-indigo-100 text-indigo-700 font-bold'
                    : 'text-gray-900 hover:bg-indigo-50 hover:text-indigo-700'
                  }`}
              >
                {option.year} ({option.season})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export interface StartProcessingModalProps {
  harvestLot: HarvestLot;
  processTypes: { value: string; label: string; }[];
  cropYears: CropYear[];
  selectedProcessType: string;
  onProcessTypeChange: (value: string) => void;
  cropYearId: string;
  onCropYearChange: (value: string) => void;
  dryingStartDate: string;
  onDryingStartDateChange: (value: string) => void;
  dryingEndDate: string;
  onDryingEndDateChange: (value: string) => void;
}

const StartProcessingModal: React.FC<StartProcessingModalProps> = ({
  harvestLot,
  processTypes,
  cropYears,
  selectedProcessType,
  onProcessTypeChange,
  cropYearId,
  onCropYearChange,
  dryingStartDate,
  onDryingStartDateChange,
  dryingEndDate,
  onDryingEndDateChange,
}) => {
  return (
    <>
      <div className="flex items-center gap-4 mb-8">
        <div className="p-4 bg-blue-100 rounded-xl shadow-md">
          <PlayCircle className="h-10 w-10 text-blue-600" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Record Process</h2>
          <p className="text-base text-gray-600 mt-1">Lot #{harvestLot.id}</p>
        </div>
      </div>
      <div className="bg-gray-50 rounded-2xl p-8 mb-8 border border-gray-200 shadow-sm">
        <div className="grid grid-cols-3 gap-8">
          <div className="text-center">
            <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">Variety</p>
            <p className="text-2xl font-bold text-gray-900">{harvestLot.cherryVariety}</p>
          </div>
          <div className="text-center border-l-2 border-gray-300">
            <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">Weight</p>
            <p className="text-2xl font-bold text-green-600">{harvestLot.weightKg} kg</p>
          </div>
          <div className="text-center border-l-2 border-gray-300">
            <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">Farmer</p>
            <p className="text-2xl font-bold text-gray-900">{harvestLot.farmerName}</p>
          </div>
        </div>
      </div>
      <div className="mb-6 space-y-4">
        <div>
          <label htmlFor="processType" className="block text-base font-bold text-gray-700 mb-3">Select Process Type</label>
          <ProcessTypeDropdown
            value={selectedProcessType}
            onChange={onProcessTypeChange}
            processTypes={processTypes}
          />
          <input type="hidden" name="processType" value={selectedProcessType} />
        </div>

        <div>
          <label htmlFor="cropYear" className="block text-base font-bold text-gray-700 mb-3">Crop Year (Optional)</label>
          <CustomCropYearDropdown
            value={cropYearId}
            onChange={onCropYearChange}
            options={cropYears}
            placeholder="Select crop year..."
          />
          <p className="mt-1 text-xs text-gray-500">Associate this batch with a crop year for tracking and reporting</p>
        </div>

        <div>
          <label htmlFor="processNotes" className="block text-sm font-semibold text-gray-700 mb-2">Process Notes (Optional)</label>
          <textarea
            id="processNotes"
            name="processNotes"
            rows={2}
            placeholder="e.g., Ferment 24h in sealed tank, raised-bed drying, frequent turning"
            className="w-full border border-gray-300 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all resize-none"
          />
          <p className="mt-1 text-xs text-gray-500">Use this to capture special steps or parameters for this batch.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-base font-bold text-gray-700 mb-3">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-green-600" />
                Parchment Weight (kg)
              </div>
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              name="parchmentWeightKg"
              placeholder="e.g., 85.0"
              required
              className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-base focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 shadow-sm"
            />
          </div>
          <div>
            <label className="block text-base font-bold text-gray-700 mb-3">
              <div className="flex items-center gap-2">
                <Droplet className="h-5 w-5 text-blue-600" />
                Coffee Moisture (%)
              </div>
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              name="moistureContent"
              placeholder="e.g., 12.0"
              required
              className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
            />
            <p className="mt-2 text-xs text-gray-500">Measured on parchment at end of drying (workers input).</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <DatePicker
              value={dryingStartDate}
              onChange={onDryingStartDateChange}
              label="Drying Start Date"
              required
            />
          </div>
          <div>
            <DatePicker
              value={dryingEndDate}
              onChange={onDryingEndDateChange}
              label="Drying End Date"
              required
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default StartProcessingModal;
