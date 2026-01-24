import React from 'react';
import { ParchmentLot } from '../../../types';
import { ChevronsRight, Scale, DollarSign, AlertCircle, Check, Plus, Trash2 } from 'lucide-react';

const GradeDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  index: number;
}> = ({ value, onChange, index }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const options = [
    { value: 'Grade A', label: 'Grade A' },
    { value: 'Grade B', label: 'Grade B' },
    { value: 'Grade C', label: 'Grade C' },
    { value: 'Peaberry', label: 'Peaberry' },
    { value: 'Screen 18', label: 'Screen 18' },
    { value: 'Screen 17', label: 'Screen 17' },
    { value: 'Screen 16', label: 'Screen 16' },
    { value: 'Screen 15', label: 'Screen 15' }
  ];

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all hover:border-gray-400 flex items-center justify-between gap-2"
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>{selectedOption ? selectedOption.label : 'Select Grade'}</span>
        <svg className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-2 left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
          <div className="py-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 transition-all text-sm font-medium ${value === option.value
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-900 hover:bg-green-50 hover:text-green-700'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export interface HullAndGradeModalProps {
  parchment: ParchmentLot;
  totalGreenWeight: string;
  onTotalGreenWeightChange: (value: string) => void;
  gradedLots: { grade: string; weight: string; price: string }[];
  onGradedLotsChange: (lots: { grade: string; weight: string; price: string }[]) => void;
  gradedWeightSum: number;
}

const HullAndGradeModal: React.FC<HullAndGradeModalProps> = ({
  parchment,
  totalGreenWeight,
  onTotalGreenWeightChange,
  gradedLots,
  onGradedLotsChange,
  gradedWeightSum,
}) => {
  const totalWeightNum = parseFloat(totalGreenWeight) || 0;
  const weightMismatch = totalWeightNum > 0 && Math.abs(gradedWeightSum - totalWeightNum) > 0.01;
  const weightLossPercent = totalGreenWeight ? (((parchment.currentWeightKg - parseFloat(totalGreenWeight)) / parchment.currentWeightKg) * 100).toFixed(1) : '0';

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <div className="p-4 bg-green-600 rounded-2xl shadow-lg">
          <ChevronsRight className="h-10 w-10 text-white" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Hull & Grade</h2>
          <p className="text-base text-gray-600 mt-1">Parchment Lot #{parchment.id}</p>
        </div>
      </div>

      <div className="bg-amber-50 rounded-2xl p-6 mb-6 border border-amber-200">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Parchment Weight</p>
            <p className="text-3xl font-bold text-amber-600">{parchment.currentWeightKg.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">kilograms</p>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Moisture</p>
            <p className="text-3xl font-bold text-blue-600">{parchment.moistureContent}%</p>
            <p className="text-xs text-gray-500 mt-1">content</p>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-base font-bold text-gray-700 mb-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-green-600" />
            Total Green Bean Weight
          </div>
        </label>
        <input
          type="number"
          step="0.1"
          value={totalGreenWeight}
          onChange={e => onTotalGreenWeightChange(e.target.value)}
          required
          placeholder="Enter total weight in kg"
          className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-lg font-semibold focus:ring-2 focus:ring-green-500 focus:border-green-500 shadow-sm transition-all"
        />
        {totalGreenWeight && (
          <div className="mt-3 flex items-center justify-between bg-blue-50 rounded-xl p-4 border border-blue-200">
            <span className="text-sm font-semibold text-gray-700">Weight Loss from Hulling</span>
            <span className="text-2xl font-bold text-blue-600">{weightLossPercent}%</span>
          </div>
        )}
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t-2 border-gray-300"></div>
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">Create Graded Lots</span>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        {gradedLots.map((lot, index) => (
          <div key={index} className="bg-green-50 rounded-xl p-4 border border-green-200">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">#{index + 1}</span>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Grade</label>
                  <GradeDropdown
                    value={lot.grade}
                    onChange={(value) => onGradedLotsChange(gradedLots.map((l, i) => i === index ? { ...l, grade: value } : l))}
                    index={index}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0.00"
                    value={lot.weight}
                    onChange={e => onGradedLotsChange(gradedLots.map((l, i) => i === index ? { ...l, weight: e.target.value } : l))}
                    required
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                    <div className="flex items-center gap-1">
                      <DollarSign size={12} className="text-gray-500" />
                      Price/kg (THB)
                    </div>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Optional"
                    value={lot.price}
                    onChange={e => onGradedLotsChange(gradedLots.map((l, i) => i === index ? { ...l, price: e.target.value } : l))}
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => onGradedLotsChange(gradedLots.filter((_, i) => i !== index))}
                disabled={gradedLots.length <= 1}
                className="flex-shrink-0 p-2.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="Remove this grade"
              >
                <Trash2 size={20} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onGradedLotsChange([...gradedLots, { grade: '', weight: '', price: '' }])}
        className="w-full py-3 px-4 border border-dashed border-green-300 rounded-xl text-sm font-bold text-green-600 hover:bg-green-50 hover:border-green-400 transition-all flex items-center justify-center gap-2"
      >
        <Plus size={18} /> Add Another Grade
      </button>

      <div className={`mt-6 rounded-2xl p-6 border shadow-lg transition-all ${weightMismatch ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Total Accounted For</span>
          {weightMismatch ? (
            <AlertCircle className="h-6 w-6 text-red-600" />
          ) : (
            <Check className="h-6 w-6 text-green-600" />
          )}
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className={`text-4xl font-extrabold ${weightMismatch ? 'text-red-600' : 'text-green-600'}`}>
            {gradedWeightSum.toFixed(2)}
          </span>
          <span className="text-2xl font-bold text-gray-400">/</span>
          <span className="text-2xl font-bold text-gray-600">{totalWeightNum.toFixed(2)} kg</span>
        </div>
        {weightMismatch && (
          <div className="mt-3 flex items-start gap-2 bg-red-100 rounded-lg p-3 border border-red-200">
            <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-red-800">
              The sum of graded lots must exactly match the total green bean weight.
            </p>
          </div>
        )}
        {!weightMismatch && totalWeightNum > 0 && (
          <div className="mt-3 flex items-center gap-2 bg-green-100 rounded-lg p-3 border border-green-200">
            <Check size={16} className="text-green-600 flex-shrink-0" />
            <p className="text-xs font-semibold text-green-800">
              Perfect! All weights are accounted for.
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default HullAndGradeModal;
