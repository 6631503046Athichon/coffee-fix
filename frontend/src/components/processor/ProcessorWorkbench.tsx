import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { ProcessingBatch, ProcessingBatchStatus, ParchmentLot, GreenBeanLot, HarvestLot, User, UserRole, CuppingSessionType, JudgeScore, SCA_SENSORY_ATTRIBUTES, SCA_CUP_ATTRIBUTES, PricingHistory, Customer } from '../../types';
import { Coffee, Wind, PackageCheck, Sprout, ChevronsRight, CheckCircle, Archive, PlayCircle, TestTube, Plus, Trash2, LayoutGrid, List, AlertCircle, History, Save, Search, ArrowUp, ArrowDown, ChevronDown, Check, Microscope, Star, TrendingUp, Box, Droplet, Scale, Calendar, Package, Activity, DollarSign, FileText, X } from 'lucide-react';
import { addPricingHistory } from '../../services/salesService';
import { getAllCustomers } from '../../services/customerService';
import { addProcessingBatch, updateProcessingBatch } from '../../services/processingBatchService';
import DatePicker from '../common/DatePicker';
import InvoiceReceipt from './InvoiceReceipt';
import Select from '../common/Select';

type ViewMode = 'kanban' | 'table';
type SortDirection = 'asc' | 'desc';
type ParchmentSortKeys = keyof ParchmentLot | 'id';
type GreenBeanSortKeys = keyof GreenBeanLot | 'id' | 'qcScore';

const ITEMS_PER_PAGE = 5;

// Custom Dropdown Component for Process Type Selection
const ProcessTypeDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  processTypes: { value: string; label: string; }[];
}> = ({ value, onChange, processTypes }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const options = processTypes || [];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Find selected option or use first option as fallback
  const selectedOption = options.find(opt => opt.value === value) ||
    options[0] ||
    { value: '', label: 'No process types available' };

  // If no options available, disable dropdown
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
        <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
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

// Custom Dropdown Component for Grade Selection
const GradeDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  index: number;
}> = ({ value, onChange, index }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
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
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
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

// Custom Dropdown Component for Crop Year Selection
const CustomCropYearDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: { id: string; year: string; description?: string; }[];
  placeholder: string;
}> = ({ value, onChange, options, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCropYear = options.find(cy => cy.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="block w-full border border-gray-300 rounded-xl shadow-sm py-2.5 px-3 bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors hover:border-gray-400"
      >
        <div className="flex items-center justify-between">
          <span className={selectedCropYear ? "text-gray-900 font-medium" : "text-gray-500"}>
            {selectedCropYear ? selectedCropYear.year : placeholder}
          </span>
          <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          <div className="py-2">
            {options.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                No crop years available
              </div>
            ) : (
              options.map((cropYear) => (
                <button
                  key={cropYear.id}
                  type="button"
                  onClick={() => {
                    onChange(cropYear.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${value === cropYear.id ? 'bg-blue-50' : ''
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{cropYear.year}</p>
                      {cropYear.description && <p className="text-xs text-gray-500">{cropYear.description}</p>}
                    </div>
                    {value === cropYear.id && (
                      <Check className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Detailed Scoring Helpers (adapted from CupperScoringSheet) ---
interface ScoreInput {
  value: string;
  error: string | null;
}

const validateScore = (value: string): { formattedValue: string, error: string | null } => {
  if (value.trim() === '') return { formattedValue: value, error: "Required." };
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return { formattedValue: value, error: "Invalid number." };
  if (numValue < 1 || numValue > 10) return { formattedValue: value, error: "Must be 1-10." };
  return { formattedValue: numValue.toFixed(2), error: null };
};

const initialSensoryScores = SCA_SENSORY_ATTRIBUTES.reduce((acc, attr) => {
  acc[attr] = { value: '', error: null };
  return acc;
}, {} as Record<string, ScoreInput>);

const initialCupScores = SCA_CUP_ATTRIBUTES.reduce((acc, attr) => {
  acc[attr] = 5; // All 5 cups are good by default
  return acc;
}, {} as Record<string, number>);
// --- End Detailed Scoring Helpers ---

// Modal Portal Component
const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return ReactDOM.createPortal(children, document.body);
};

const KanbanCard: React.FC<{ batch: ProcessingBatch; onDragStart: (e: React.DragEvent<HTMLDivElement>, batchId: string) => void; onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void }> = ({ batch, onDragStart, onDragEnd }) => {
  const processColors = {
    'Washed': { borderColor: 'border-l-blue-500', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', badgeColor: 'text-blue-700 bg-blue-50 border-blue-200' },
    'Natural': { borderColor: 'border-l-amber-500', iconBg: 'bg-amber-100', iconColor: 'text-amber-600', badgeColor: 'text-amber-700 bg-amber-50 border-amber-200' },
    'Honey': { borderColor: 'border-l-yellow-500', iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600', badgeColor: 'text-yellow-700 bg-yellow-50 border-yellow-200' }
  };
  const colors = processColors[batch.processType as keyof typeof processColors] || processColors['Washed'];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, batch.id)}
      onDragEnd={onDragEnd}
      className={`bg-white border-l-4 ${colors.borderColor} rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-lg hover:border-gray-300 cursor-grab active:cursor-grabbing transition-all duration-200 mb-3`}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-10 h-10 ${colors.iconBg} rounded-lg flex items-center justify-center`}>
            <Coffee className={`h-5 w-5 ${colors.iconColor}`} />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">#{batch.id.substring(0, 6).toUpperCase()}</p>
            <p className="text-xs text-gray-500">Processing Batch</p>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${colors.badgeColor}`}>
          {batch.processType}
        </span>
      </div>

      {/* Card Body */}
      <div className="space-y-0 divide-y divide-gray-100">
        <div className="flex items-center justify-between py-2 first:pt-0">
          <div className="flex items-center gap-1.5">
            <Archive className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">Harvest Lot</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">{batch.harvestLotId}</span>
        </div>

        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">Weight</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">
            {batch.parchmentWeightKg ? `${batch.parchmentWeightKg} kg` : '-'}
          </span>
        </div>

        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-1.5">
            <Droplet className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">Moisture</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">
            {batch.moistureContent ? `${batch.moistureContent}%` : '-'}
          </span>
        </div>

        {batch.processNotes && (
          <div className="flex items-start justify-between py-2">
            <div className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">Notes</span>
            </div>
            <span className="text-sm text-gray-700 max-w-[60%] text-right break-words">
              {batch.processNotes}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const KanbanColumn: React.FC<{ title: string; status: ProcessingBatchStatus; batches: ProcessingBatch[]; icon: React.ReactNode; color: string; onDrop: (e: React.DragEvent<HTMLDivElement>, status: ProcessingBatchStatus) => void; onDragOver: (e: React.DragEvent<HTMLDivElement>) => void; onDragStart: (e: React.DragEvent<HTMLDivElement>, batchId: string) => void; onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void }> = ({ title, status, batches, icon, color, onDrop, onDragOver, onDragStart, onDragEnd }) => {
  const columnStyles = {
    'border-amber-400': { iconBg: 'bg-amber-500', iconColor: 'text-white', countColor: 'text-amber-600' },
    'border-blue-400': { iconBg: 'bg-blue-500', iconColor: 'text-white', countColor: 'text-blue-600' },
    'border-green-400': { iconBg: 'bg-green-500', iconColor: 'text-white', countColor: 'text-green-600' }
  };
  const styles = columnStyles[color as keyof typeof columnStyles] || columnStyles['border-amber-400'];

  return (
    <div
      onDrop={(e) => onDrop(e, status)}
      onDragOver={onDragOver}
      className="bg-white rounded-2xl p-4 w-full flex flex-col border border-gray-200 shadow-sm"
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <div className={`w-10 h-10 ${styles.iconBg} rounded-xl flex items-center justify-center shadow-md`}>
            <span className={styles.iconColor}>{icon}</span>
          </div>
          <div>
            <h3 className="font-semibold text-base text-gray-900">{title}</h3>
            <p className={`text-sm ${styles.countColor}`}>{batches.length} {batches.length === 1 ? 'batch' : 'batches'}</p>
          </div>
        </div>
      </div>
      <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar" style={{ maxHeight: '500px' }}>
        {batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors">
            <PackageCheck className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium text-gray-500">No completed batches yet</p>
          </div>
        ) : (
          batches.map(batch => (
            <KanbanCard key={batch.id} batch={batch} onDragStart={onDragStart} onDragEnd={onDragEnd} />
          ))
        )}
      </div>
    </div>
  );
};

interface ProcessorWorkbenchProps {
  currentUser: User;
}

const ProcessorWorkbench: React.FC<ProcessorWorkbenchProps> = ({ currentUser }) => {
  const { data, setData, refreshData } = useDataContext();
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const isAdmin = currentUser.role === UserRole.Admin;

  // Modal States
  const [modal, setModal] = useState<string | null>(null);
  const [selectedParchment, setSelectedParchment] = useState<ParchmentLot | null>(null);
  const [selectedHarvestLot, setSelectedHarvestLot] = useState<HarvestLot | null>(null);
  const [selectedGreenBean, setSelectedGreenBean] = useState<GreenBeanLot | null>(null);
  const [selectedGreenBeanForHistory, setSelectedGreenBeanForHistory] = useState<GreenBeanLot | null>(null);
  const [scoringLot, setScoringLot] = useState<GreenBeanLot | null>(null);
  
  // Form States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Customer Management State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  // Withdraw Stock Modal State
  const [withdrawalType, setWithdrawalType] = useState<'Sale' | 'Roasting Stock' | 'Sample' | 'Export' | 'Other'>('Sample');
  const [withdrawalSalePrice, setWithdrawalSalePrice] = useState('');
  const [withdrawalCurrency, setWithdrawalCurrency] = useState('THB');
  const [withdrawalCustomerId, setWithdrawalCustomerId] = useState<string>('');
  const [withdrawalCustomerName, setWithdrawalCustomerName] = useState('');
  const [withdrawalDeliveryAddress, setWithdrawalDeliveryAddress] = useState('');

  // Edit Withdrawal Modal State
  const [editingWithdrawalIndex, setEditingWithdrawalIndex] = useState<number | null>(null);
  const [editingWithdrawalLotId, setEditingWithdrawalLotId] = useState<string | null>(null);

  // Score Modal State
  const [scoringMode, setScoringMode] = useState<'simple' | 'detailed'>('simple');
  const [simpleQcScore, setSimpleQcScore] = useState('');
  const [notes, setNotes] = useState('');
  const [sensoryScores, setSensoryScores] = useState<Record<string, ScoreInput>>(initialSensoryScores);
  const [cupScores, setCupScores] = useState<Record<string, number>>(initialCupScores);
  const [defects, setDefects] = useState({ numCups: '0', intensity: 2 });
  // Invoice viewing state
  const [invoiceView, setInvoiceView] = useState<{ lot: GreenBeanLot; entryIndex: number } | null>(null);

  // Table Control States
  const [parchmentSearch, setParchmentSearch] = useState('');
  const [parchmentSortConfig, setParchmentSortConfig] = useState<{ key: ParchmentSortKeys; direction: SortDirection }>({ key: 'id', direction: 'asc' });
  const [parchmentCurrentPage, setParchmentCurrentPage] = useState(1);

  const [greenBeanSearch, setGreenBeanSearch] = useState('');
  const [greenBeanSortConfig, setGreenBeanSortConfig] = useState<{ key: GreenBeanSortKeys; direction: SortDirection }>({ key: 'id', direction: 'asc' });
  const [greenBeanCurrentPage, setGreenBeanCurrentPage] = useState(1);

  const [harvestLotSearch, setHarvestLotSearch] = useState('');
  const [batchSearch, setBatchSearch] = useState('');

  const processorUser = useMemo(() => data.users.find(u => u.role === UserRole.Processor), [data.users]);

  // (Removed) Top-of-workbench stat tiles were deprecated; relying on detailed sections below.

  // Get process types for dropdown with safe mock baseline
  const processTypeOptions = useMemo(() => {
    const BASE_OPTIONS = [
      { value: 'Washed', label: 'Washed Process' },
      { value: 'Natural', label: 'Natural Process' },
      { value: 'Honey', label: 'Honey Process' }
    ];

    const activeTypes = data.processTypes.filter(pt => pt.isActive);
    let options = activeTypes.map(pt => ({ value: pt.name, label: `${pt.name} Process` }));

    // If nothing is active/loaded yet, use the mock baseline
    if (options.length === 0) return BASE_OPTIONS;

    // Ensure the three defaults are always present (mock safety net)
    const existing = new Set(options.map(o => o.value.toLowerCase()));
    BASE_OPTIONS.forEach(base => {
      if (!existing.has(base.value.toLowerCase())) {
        options.push(base);
      }
    });

    return options;
  }, [data.processTypes]);

  // Hull & Grade Modal State
  const [gradedLots, setGradedLots] = useState<{ grade: string; weight: string; price: string }[]>([{ grade: 'Grade A', weight: '', price: '' }]);
  const [totalGreenWeight, setTotalGreenWeight] = useState('');

  // Process Type Selection State - initialize with first active process type
  const [selectedProcessType, setSelectedProcessType] = useState<string>(() => {
    const activeTypes = data.processTypes.filter(pt => pt.isActive);
    if (activeTypes.length > 0) {
      return activeTypes[0].name;
    }
    return 'Washed'; // Default fallback
  });

  // Load customers on component mount
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        setCustomersLoading(true);
        const customersList = await getAllCustomers();
        setCustomers(customersList);
      } catch (error) {
        console.error('Failed to load customers:', error);
        // Fallback to empty array - user can still type customer name manually
        setCustomers([]);
      } finally {
        setCustomersLoading(false);
      }
    };
    
    // Only load customers if user has access (Admin or Roaster)
    if (currentUser.role === UserRole.Admin || currentUser.role === UserRole.Roaster) {
      loadCustomers();
    }
  }, [currentUser.role]);

  // Customer options for dropdown
  const customerOptions = useMemo(() => {
    return customers.map(customer => ({
      value: customer.id,
      label: `${customer.name} (${customer.type})`,
    }));
  }, [customers]);

  // Handle customer selection - auto-fill name and address
  const handleCustomerSelect = (customerId: string) => {
    setWithdrawalCustomerId(customerId);
    const selectedCustomer = customers.find(c => c.id === customerId);
    if (selectedCustomer) {
      setWithdrawalCustomerName(selectedCustomer.name);
      if (selectedCustomer.address) {
        setWithdrawalDeliveryAddress(selectedCustomer.address);
      }
    } else {
      setWithdrawalCustomerName('');
      setWithdrawalDeliveryAddress('');
    }
  };

  // Update selectedProcessType when processTypeOptions changes (ensures it's always valid)
  useEffect(() => {
    if (processTypeOptions.length > 0) {
      const isCurrentValid = processTypeOptions.some(opt => opt.value === selectedProcessType);
      if (!isCurrentValid) {
        setSelectedProcessType(processTypeOptions[0].value);
      }
    }
  }, [processTypeOptions, selectedProcessType]);

  // Crop Year Selection State
  const [cropYearId, setCropYearId] = useState<string>('');

  // Date States for Complete Batch Modal
  const [dryingStartDate, setDryingStartDate] = useState('');
  const [dryingEndDate, setDryingEndDate] = useState('');

  const gradedWeightSum = useMemo(() => {
    return gradedLots.reduce((sum, lot) => sum + (parseFloat(lot.weight) || 0), 0);
  }, [gradedLots]);

  const resetAllScoreForms = useCallback(() => {
    setSimpleQcScore('');
    setNotes('');
    setSensoryScores(initialSensoryScores);
    setCupScores(initialCupScores);
    setDefects({ numCups: '0', intensity: 2 });
    setScoringMode('simple');
  }, []);

  useEffect(() => {
    if (scoringLot && processorUser) {
      const qcSessionId = `CS-QC-${processorUser.id}`;
      const qcSession = data.cuppingSessions.find(s => s.id === qcSessionId);
      if (qcSession) {
        const sampleInSession = qcSession.samples.find(s => s.greenBeanLotId === scoringLot.id);
        if (sampleInSession) {
          const scoreEntry = (qcSession.scores[sampleInSession.id] || []).find(s => s.judgeId === processorUser.id);
          if (scoreEntry) {
            setNotes(scoreEntry.notes);
            // Check if it's a detailed score
            if (Object.keys(scoreEntry.scores).length > 1) {
              setScoringMode('detailed');
              const newSensoryScores = { ...initialSensoryScores };
              SCA_SENSORY_ATTRIBUTES.forEach(attr => {
                if (scoreEntry.scores[attr] !== undefined) {
                  newSensoryScores[attr] = { value: scoreEntry.scores[attr].toFixed(2), error: null };
                }
              });
              setSensoryScores(newSensoryScores);

              const newCupScores = { ...initialCupScores };
              SCA_CUP_ATTRIBUTES.forEach(attr => {
                if (scoreEntry.scores[attr] !== undefined) {
                  newCupScores[attr] = scoreEntry.scores[attr] / 2;
                }
              });
              setCupScores(newCupScores);
              // Note: Defects are not saved in the score object, so they reset. This is a simplification.
            } else { // It's a simple score
              setScoringMode('simple');
              setSimpleQcScore(scoreEntry.totalScore.toString());
            }
            return;
          }
        }
      }
      // If no score found, reset everything
      resetAllScoreForms();
    }
  }, [scoringLot, processorUser, data.cuppingSessions, resetAllScoreForms]);


  const detailedCalculations = useMemo(() => {
    const sensoryTotal = SCA_SENSORY_ATTRIBUTES.reduce((sum, attr) => {
      const numValue = parseFloat(sensoryScores[attr].value);
      return sum + (isNaN(numValue) ? 0 : numValue);
    }, 0);
    const cupsTotal = SCA_CUP_ATTRIBUTES.reduce((sum, attr) => sum + (cupScores[attr] * 2), 0);
    const subtotal = sensoryTotal + cupsTotal;
    const defectCups = parseInt(defects.numCups, 10);
    const defectsTotal = (isNaN(defectCups) || defectCups < 0) ? 0 : defectCups * defects.intensity;
    const finalScore = subtotal - defectsTotal;
    return { subtotal, defectsTotal, finalScore };
  }, [sensoryScores, cupScores, defects]);


  const [draggedBatchId, setDraggedBatchId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Prevent clicks during drag operation
  useEffect(() => {
    if (isDragging) {
      const handleClick = (e: MouseEvent) => {
        // Prevent clicks during drag to avoid interrupting the drag operation
        e.preventDefault();
        e.stopPropagation();
      };
      document.addEventListener('click', handleClick, true);
      return () => {
        document.removeEventListener('click', handleClick, true);
      };
    }
  }, [isDragging]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, batchId: string) => {
    e.dataTransfer.setData('batchId', batchId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedBatchId(batchId);
    setIsDragging(true);
    // Set drag image to be invisible to prevent visual glitches
    const dragImage = document.createElement('div');
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-9999px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    // Reset dragged batch ID and dragging state when drag ends
    setDraggedBatchId(null);
    setIsDragging(false);
    // If drop was not successful (no drop event fired), the card will naturally return to its original position
    // This is the expected browser behavior, so we don't need to do anything special here
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, newStatus: ProcessingBatchStatus) => {
    // No longer needed - all batches are created as Completed
    e.preventDefault();
    e.stopPropagation();
    setDraggedBatchId(null);
    setIsDragging(false);
  };

  const handleSaveScore = () => {
    if (!processorUser || !scoringLot) return;

    let totalScore: number;
    let scoresToSave: { [attribute: string]: number };

    if (scoringMode === 'simple') {
      totalScore = parseFloat(simpleQcScore);
      if (isNaN(totalScore) || totalScore < 0 || totalScore > 100) {
        alert("Please enter a valid score between 0 and 100.");
        return;
      }
      scoresToSave = { 'Overall': totalScore };
    } else { // detailed mode
      let isValid = true;
      const tempSensoryScores = { ...sensoryScores };
      SCA_SENSORY_ATTRIBUTES.forEach(attr => {
        const result = validateScore(tempSensoryScores[attr].value);
        tempSensoryScores[attr] = { ...tempSensoryScores[attr], error: result.error };
        if (result.error) isValid = false;
      });
      setSensoryScores(tempSensoryScores);
      if (!isValid) return alert("Please correct the errors in the detailed scores.");

      totalScore = detailedCalculations.finalScore;
      scoresToSave = {};
      SCA_SENSORY_ATTRIBUTES.forEach(attr => {
        scoresToSave[attr] = parseFloat(sensoryScores[attr].value);
      });
      SCA_CUP_ATTRIBUTES.forEach(attr => {
        scoresToSave[attr] = cupScores[attr] * 2;
      });
    }

    setData(prev => {
      const qcSessionId = `CS-QC-${processorUser.id}`;
      let qcSession = prev.cuppingSessions.find(s => s.id === qcSessionId);
      let newSessions = [...prev.cuppingSessions];

      if (!qcSession) {
        qcSession = {
          id: qcSessionId, name: `${processorUser.name}'s Internal QC`, date: new Date().toISOString().substring(0, 10),
          type: CuppingSessionType.QC, samples: [],
          judges: [{ id: processorUser.id, name: processorUser.name, role: UserRole.Processor }],
          scores: {}, status: 'Finalized',
        };
        newSessions.push(qcSession);
      } else {
        newSessions = newSessions.map(s => s.id === qcSessionId ? { ...s } : s);
        qcSession = newSessions.find(s => s.id === qcSessionId)!;
      }

      let sampleInSession = qcSession.samples.find(s => s.greenBeanLotId === scoringLot.id);
      if (!sampleInSession) {
        const parchmentLot = prev.parchmentLots.find(p => p.id === scoringLot.parchmentLotId);
        const harvestLot = prev.harvestLots.find(h => h.id === parchmentLot?.harvestLotId);
        sampleInSession = {
          id: `S${qcSession.samples.length + 1}`, blindCode: scoringLot.id, greenBeanLotId: scoringLot.id,
          submitterInfo: { name: harvestLot?.farmerName || 'N/A' }, originInfo: { farm: harvestLot?.farmPlotLocation || 'N/A' },
          lotInfo: { process: parchmentLot?.processType || 'N/A' },
        };
        qcSession.samples.push(sampleInSession);
      }

      const newScoreEntry: JudgeScore = {
        judgeId: processorUser.id, judgeName: processorUser.name,
        scores: scoresToSave, notes: notes, totalScore,
      };

      const existingScores = qcSession.scores[sampleInSession.id] || [];
      const scoreIndex = existingScores.findIndex(s => s.judgeId === processorUser.id);
      if (scoreIndex > -1) existingScores[scoreIndex] = newScoreEntry;
      else existingScores.push(newScoreEntry);
      qcSession.scores[sampleInSession.id] = existingScores;

      const updatedGreenBeanLots = prev.greenBeanLots.map(gbl => {
        if (gbl.id === scoringLot.id) {
          const newCuppingScores = [...gbl.cuppingScores];
          const existingScoreIndex = newCuppingScores.findIndex(cs => cs.sessionId === qcSessionId);
          if (existingScoreIndex > -1) newCuppingScores[existingScoreIndex] = { sessionId: qcSessionId, score: totalScore };
          else newCuppingScores.push({ sessionId: qcSessionId, score: totalScore });
          return { ...gbl, cuppingScores: newCuppingScores };
        }
        return gbl;
      });

      return { ...prev, cuppingSessions: newSessions, greenBeanLots: updatedGreenBeanLots };
    });

    setScoringLot(null);
  };


  // Delete handlers for Admin
  const handleDeleteBatch = (batchId: string) => {
    if (window.confirm('Are you sure you want to delete this processing batch? This will also delete related parchment and green bean lots.')) {
      setData(prev => ({
        ...prev,
        processingBatches: prev.processingBatches.filter(b => b.id !== batchId),
        parchmentLots: prev.parchmentLots.filter(p => p.processingBatchId !== batchId),
        greenBeanLots: prev.greenBeanLots.filter(g => {
          const parchment = prev.parchmentLots.find(p => p.id === g.parchmentLotId);
          return parchment?.processingBatchId !== batchId;
        }),
      }));
    }
  };

  const handleDeleteParchmentLot = (lotId: string) => {
    if (window.confirm('Are you sure you want to delete this parchment lot? This will also delete related green bean lots.')) {
      setData(prev => ({
        ...prev,
        parchmentLots: prev.parchmentLots.filter(p => p.id !== lotId),
        greenBeanLots: prev.greenBeanLots.filter(g => g.parchmentLotId !== lotId),
      }));
    }
  };

  const handleDeleteGreenBeanLot = (lotId: string) => {
    if (window.confirm('Are you sure you want to delete this green bean lot?')) {
      setData(prev => ({
        ...prev,
        greenBeanLots: prev.greenBeanLots.filter(g => g.id !== lotId),
      }));
    }
  };

  const handleDeleteWithdrawal = (lotId: string, index: number) => {
    const lot = data.greenBeanLots.find(g => g.id === lotId);
    const withdrawal = lot?.withdrawalHistory?.[index];
    if (!withdrawal) return;

    if (window.confirm(`Are you sure you want to delete this withdrawal entry?\n\nAmount: ${withdrawal.amountKg} kg\nType: ${withdrawal.withdrawalType}\nDate: ${withdrawal.date}\n\nNote: The withdrawn amount (${withdrawal.amountKg} kg) will be returned to current stock.`)) {
      setData(prev => ({
        ...prev,
        greenBeanLots: prev.greenBeanLots.map(gbl => {
          if (gbl.id !== lotId) return gbl;
          const newHistory = [...(gbl.withdrawalHistory || [])];
          const deletedEntry = newHistory.splice(index, 1)[0];
          return {
            ...gbl,
            currentWeightKg: gbl.currentWeightKg + deletedEntry.amountKg, // Return stock
            withdrawalHistory: newHistory
          };
        })
      }));
    }
  };

  const handleEditWithdrawal = (lotId: string, index: number) => {
    const lot = data.greenBeanLots.find(g => g.id === lotId);
    const withdrawal = lot?.withdrawalHistory?.[index];
    if (!withdrawal) return;

    // Populate edit form with existing values
    setEditingWithdrawalLotId(lotId);
    setEditingWithdrawalIndex(index);
    setWithdrawalType(withdrawal.withdrawalType);
    setWithdrawalSalePrice(withdrawal.salePrice?.toString() || '');
    setWithdrawalCurrency(withdrawal.currency || 'THB');
    // Try to find customer by name
    const matchingCustomer = customers.find(c => c.name === withdrawal.customerName);
    setWithdrawalCustomerId(matchingCustomer?.id || '');
    setWithdrawalCustomerName(withdrawal.customerName || '');
    setWithdrawalDeliveryAddress(withdrawal.deliveryAddress || '');
    setModal('editWithdrawal');
  };

  const handleSaveEditWithdrawal = (formData: FormData) => {
    if (editingWithdrawalLotId === null || editingWithdrawalIndex === null) return;

    const notes = (formData.get('notes') as string) || '';

    setData(prev => ({
      ...prev,
      greenBeanLots: prev.greenBeanLots.map(gbl => {
        if (gbl.id !== editingWithdrawalLotId) return gbl;
        const newHistory = [...(gbl.withdrawalHistory || [])];
        const existing = newHistory[editingWithdrawalIndex];

        // Update only editable fields (not amount!)
        newHistory[editingWithdrawalIndex] = {
          ...existing,
          withdrawalType,
          notes,
          ...(withdrawalType === 'Sale' && {
            salePrice: withdrawalSalePrice ? parseFloat(withdrawalSalePrice) : undefined,
            currency: withdrawalCurrency,
            customerName: withdrawalCustomerName || undefined,
            deliveryAddress: withdrawalDeliveryAddress || undefined,
            totalAmount: withdrawalSalePrice ? (existing.amountKg * parseFloat(withdrawalSalePrice)) : existing.totalAmount
          }),
          // Clear sale fields if type changed from Sale
          ...(withdrawalType !== 'Sale' && {
            salePrice: undefined,
            currency: undefined,
            customerName: undefined,
            deliveryAddress: undefined,
            totalAmount: undefined
          })
        };

        return {
          ...gbl,
          withdrawalHistory: newHistory
        };
      })
    }));

    // Reset edit state
    setEditingWithdrawalLotId(null);
    setEditingWithdrawalIndex(null);
    setWithdrawalType('Sample');
    setWithdrawalSalePrice('');
    setWithdrawalCurrency('THB');
    setWithdrawalCustomerName('');
    setWithdrawalDeliveryAddress('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSubmitting) {
      return;
    }
    
    setFormError(null);
    const formData = new FormData(e.currentTarget);

    switch (modal) {
      case 'startProcessing':
        if (!selectedHarvestLot) {
          setFormError('Please select a harvest lot');
          return;
        }

        const processType = formData.get('processType') as string;
        if (!processType || processType.trim() === '') {
          setFormError('Please select a process type');
          return;
        }

        const processNotes = (formData.get('processNotes') as string) || undefined;

        // Validate parchment data
        const parchmentWeightKg = parseFloat(formData.get('parchmentWeightKg') as string);
        const moistureContent = parseFloat(formData.get('moistureContent') as string);

        if (isNaN(parchmentWeightKg) || parchmentWeightKg <= 0) {
          setFormError("Please enter a valid parchment weight in kg (greater than 0).");
          return;
        }
        if (isNaN(moistureContent) || moistureContent < 0 || moistureContent > 100) {
          setFormError("Please enter a valid coffee moisture between 0 and 100%.");
          return;
        }

        if (new Date(dryingEndDate) < new Date(dryingStartDate)) {
          setFormError("Drying End Date cannot be before Drying Start Date.");
          return;
        }

        setIsSubmitting(true);
        try {
          // Create processing batch via API with status Completed
          await addProcessingBatch({
            harvestLotId: selectedHarvestLot.id,
            status: ProcessingBatchStatus.Completed,
            processType,
            processNotes,
            cropYearId: cropYearId || undefined,
            parchmentWeightKg,
            moistureContent,
            dryingStartDate,
            dryingEndDate,
            baggingDate: dryingEndDate,
          });

          // Refresh data from backend to get the updated batch and parchment lot
          await refreshData();

          // Close modal and reset form on success
          setModal(null);
          setSelectedHarvestLot(null);
          setCropYearId('');
          setDryingStartDate('');
          setDryingEndDate('');
          setFormError(null);
        } catch (error: any) {
          console.error('Failed to create processing batch:', error);
          setFormError(error?.message || 'Failed to create processing batch. Please try again.');
        } finally {
          setIsSubmitting(false);
        }
        break;

      case 'hullAndGrade':
        if (!selectedParchment) return;
        const greenWeight = parseFloat(totalGreenWeight);
        if (Math.abs(gradedWeightSum - greenWeight) > 0.01) {
          alert("Validation Error: The sum of the weights for the graded lots must exactly match the total green bean weight.");
          return;
        }

        const today = new Date().toISOString().substring(0, 10);

        setData(prev => {
          const newGreenBeanLots: GreenBeanLot[] = gradedLots.map((gl, index) => {
            const newId = `GBL${String(prev.greenBeanLots.length + index + 1).padStart(3, '0')}`;
            const priceValue = parseFloat(gl.price);
            const hasPrice = !isNaN(priceValue) && priceValue > 0;

            return {
              id: newId,
              parchmentLotId: selectedParchment.id,
              grade: gl.grade,
              initialWeightKg: parseFloat(gl.weight),
              currentWeightKg: parseFloat(gl.weight),
              availabilityStatus: 'Available',
              cuppingScores: [],
              ...(hasPrice ? {
                pricePerKg: priceValue,
                currency: 'THB',
                priceSetDate: today,
                priceSetBy: currentUser.id
              } : {})
            };
          });

          // Create pricing history entries for lots with prices
          const newPricingHistory: PricingHistory[] = newGreenBeanLots
            .filter(lot => lot.pricePerKg)
            .map(lot => ({
              id: `PH${String(prev.pricingHistory.length + 1).padStart(3, '0')}`,
              greenBeanLotId: lot.id,
              pricePerKg: lot.pricePerKg!,
              currency: 'THB',
              effectiveDate: today,
              setBy: currentUser.id,
              notes: `Initial price set during hulling & grading`
            }));

          // Save to localStorage
          newPricingHistory.forEach(ph => addPricingHistory(ph));

          const updatedParchment = prev.parchmentLots.map(p => p.id === selectedParchment.id ? { ...p, status: 'Hulled' as 'Hulled', currentWeightKg: 0 } : p)

          return {
            ...prev,
            greenBeanLots: [...newGreenBeanLots, ...prev.greenBeanLots],
            parchmentLots: updatedParchment,
            pricingHistory: [...newPricingHistory, ...prev.pricingHistory]
          }
        });
        setTotalGreenWeight('');
        setGradedLots([{ grade: 'Grade A', weight: '', price: '' }]);
        break;

      case 'withdrawStock':
        if (!selectedGreenBean) return;
        const amountKg = parseFloat(formData.get('amountKg') as string);
        const purpose = (formData.get('purpose') as string) || '';

        setData(prev => ({
          ...prev,
          greenBeanLots: prev.greenBeanLots.map(gbl => {
            if (gbl.id !== selectedGreenBean.id) return gbl;

            // Generate invoice number for Sale type
            const invoiceNumber = withdrawalType === 'Sale'
              ? (() => {
                const year = new Date().getFullYear();
                const allWithdrawals = prev.greenBeanLots.flatMap(g => g.withdrawalHistory || []);
                const invoicesThisYear = allWithdrawals.filter(w => w.invoiceNumber?.startsWith(`INV-${year}-`));
                const nextNum = invoicesThisYear.length + 1;
                return `INV-${year}-${String(nextNum).padStart(3, '0')}`;
              })()
              : undefined;

            // Calculate total amount for Sale type
            const salePrice = withdrawalSalePrice ? parseFloat(withdrawalSalePrice) : 0;
            const totalAmount = withdrawalType === 'Sale' && salePrice > 0
              ? amountKg * salePrice
              : undefined;

            const withdrawal = {
              amountKg,
              withdrawalType,
              purpose,
              date: new Date().toISOString().substring(0, 10),
              withdrawnBy: currentUser.id,
              withdrawnByName: currentUser.name,
              // Add sale-specific fields only if type is Sale
              ...(withdrawalType === 'Sale' && {
                salePrice: salePrice || undefined,
                currency: withdrawalCurrency,
                customerName: withdrawalCustomerName || undefined,
                deliveryAddress: withdrawalDeliveryAddress || undefined,
                invoiceNumber,
                totalAmount
              })
            };
            return {
              ...gbl,
              currentWeightKg: gbl.currentWeightKg - amountKg,
              withdrawalHistory: [...(gbl.withdrawalHistory || []), withdrawal]
            }
          })
        }));
        // Reset withdrawal form state
        setWithdrawalType('Sample');
        setWithdrawalSalePrice('');
        setWithdrawalCurrency('THB');
        setWithdrawalCustomerId('');
        setWithdrawalCustomerName('');
        setWithdrawalDeliveryAddress('');
        break;

      case 'editWithdrawal':
        handleSaveEditWithdrawal(formData);
        break;
    }
    setModal(null);
  };

  const openModal = (type: string, item: any) => {
    if (type === 'startProcessing') {
      setSelectedHarvestLot(item);
      // Auto-select crop year from harvest lot if available
      if (item?.cropYearId) {
        setCropYearId(item.cropYearId);
      } else {
        setCropYearId('');
      }
    }
    if (type === 'hullAndGrade') setSelectedParchment(item);
    if (type === 'withdrawStock') setSelectedGreenBean(item);
    setModal(type);
  }

  const handleToggleAvailability = (lotId: string) => {
    setData(prev => ({ ...prev, greenBeanLots: prev.greenBeanLots.map(lot => lot.id === lotId ? { ...lot, availabilityStatus: lot.availabilityStatus === 'Available' ? 'Withdrawn' : 'Available' } : lot) }));
  };

  const readyForProcessingLots = data.harvestLots.filter(lot => lot.status === 'Ready for Processing');

  const processedHarvestLots = useMemo(() => {
    return readyForProcessingLots.filter(lot =>
      lot.id.toLowerCase().includes(harvestLotSearch.toLowerCase()) ||
      lot.cherryVariety.toLowerCase().includes(harvestLotSearch.toLowerCase())
    );
  }, [readyForProcessingLots, harvestLotSearch]);

  const TableView = () => (
    <div className="space-y-5">
      {/* Processing Summary */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 bg-indigo-500 rounded-lg">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <h3 className="font-semibold text-base text-gray-900">Processing Summary</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-green-50 rounded-lg p-3 border border-green-200">
            <p className="text-xs font-semibold text-green-600 uppercase mb-1">Completed</p>
            <p className="text-xl font-bold text-green-700">{data.processingBatches.filter(b => b.status === ProcessingBatchStatus.Completed).length}</p>
            <p className="text-xs text-green-600">batches</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
            <p className="text-xs font-semibold text-amber-600 uppercase mb-1">Parchment</p>
            <p className="text-xl font-bold text-amber-700">{data.parchmentLots.length}</p>
            <p className="text-xs text-amber-600">lots in stock</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <p className="text-xs font-semibold text-blue-600 uppercase mb-1">Green Bean</p>
            <p className="text-xl font-bold text-blue-700">{data.greenBeanLots.length}</p>
            <p className="text-xs text-blue-600">lots available</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
            <p className="text-xs font-semibold text-purple-600 uppercase mb-1">Ready</p>
            <p className="text-xl font-bold text-purple-700">{readyForProcessingLots.length}</p>
            <p className="text-xs text-purple-600">harvest lots</p>
          </div>
        </div>
      </div>

      {/* Incoming Harvest Lots Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        {/* Header with search */}
        <div className="p-4 bg-green-50 border-b border-green-200">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2 bg-green-600 rounded-lg">
              <Coffee className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Incoming Harvest Lots</h3>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search lots..."
              value={harvestLotSearch}
              onChange={e => setHarvestLotSearch(e.target.value)}
              className="pl-10 w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-900">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Lot ID</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Variety</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Weight (kg)</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Farmer</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {processedHarvestLots.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    <Coffee className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No harvest lots available</p>
                  </td>
                </tr>
              ) : (
                processedHarvestLots.map(lot => (
                  <tr key={lot.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">#{lot.id.substring(0, 6).toUpperCase()}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{lot.cherryVariety}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-green-600">{lot.weightKg} kg</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{lot.farmerName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => openModal('startProcessing', lot)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                      >
                        <PlayCircle className="h-3.5 w-3.5" /> Record Process
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Processing Batches Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        {/* Header with search */}
        <div className="p-4 bg-blue-50 border-b border-blue-200">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Processing Batches</h3>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search batches..."
              value={batchSearch}
              onChange={e => setBatchSearch(e.target.value)}
              className="pl-10 w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-900">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Batch ID</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Harvest Lot</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Process</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Notes</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Drying Duration</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {processedBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No matching batches found</p>
                  </td>
                </tr>
              ) : (
                processedBatches.map(b => {
                  const duration = b.dryingStartDate && b.dryingEndDate
                    ? `${Math.max(1, Math.round((new Date(b.dryingEndDate).getTime() - new Date(b.dryingStartDate).getTime()) / (1000 * 3600 * 24)))} days`
                    : 'N/A';
                  const durationClass = duration === 'N/A' ? 'text-sm font-medium text-gray-400' : 'text-sm font-medium text-gray-700';
                  return (
                    <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        #{b.id.substring(0, 6).toUpperCase()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        #{b.harvestLotId.substring(0, 6).toUpperCase()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block h-2 w-2 rounded-full ${b.processType === 'Washed' ? 'bg-blue-500' : b.processType === 'Natural' ? 'bg-amber-500' : 'bg-yellow-500'}`}></span>
                          <span className="text-sm font-medium text-gray-900">{b.processType}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap max-w-xs">
                        <div className="flex items-start gap-1.5 text-sm text-gray-700">
                          <FileText className="h-4 w-4 text-gray-400 mt-0.5" />
                          <span className="truncate block" title={b.processNotes || ''}>{b.processNotes || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full border ${b.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                            'bg-yellow-50 text-yellow-700 border-yellow-200'
                          }`}>
                          {b.status === 'Completed' && <CheckCircle className="h-3 w-3" />}
                          {b.status === 'To Process' && <PlayCircle className="h-3 w-3" />}
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={durationClass}>{duration}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => openModal('completeBatch', b)}
                          disabled={b.status === ProcessingBatchStatus.Completed}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-green-600 hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-1 transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                        >
                          <CheckCircle className="h-3.5 w-3.5" /> Complete Batch
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Parchment Stock Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        {/* Header with search */}
        <div className="p-4 bg-amber-50 border-b border-amber-200">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2 bg-amber-600 rounded-lg">
              <Box className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Parchment Stock</h3>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search lots..."
              value={parchmentSearch}
              onChange={e => {
                setParchmentSearch(e.target.value);
                setParchmentCurrentPage(1);
              }}
              className="pl-10 w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-900">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Lot ID</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Batch ID</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Weight (kg)</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Moisture (%)</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Process</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {paginatedParchmentLots.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                    <Box className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No matching parchment lots found</p>
                  </td>
                </tr>
              ) : (
                paginatedParchmentLots.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">#{p.id.substring(0, 6).toUpperCase()}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">#{p.processingBatchId.substring(0, 6).toUpperCase()}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{p.currentWeightKg.toFixed(2)} kg</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{p.moistureContent}%</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${
                          p.processType === 'Washed' ? 'bg-blue-500' :
                          p.processType === 'Natural' ? 'bg-amber-500' :
                          'bg-yellow-500'
                        }`}></span>
                        <span className="text-sm font-medium text-gray-900">{p.processType}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full border ${
                        p.status === 'Hulled'
                          ? 'bg-gray-50 text-gray-700 border-gray-200'
                          : 'bg-green-50 text-green-700 border-green-200'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${p.status === 'Hulled' ? 'bg-gray-400' : 'bg-green-500'}`}></div>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => openModal('hullAndGrade', p)}
                        disabled={p.status === 'Hulled' || p.currentWeightKg <= 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                      >
                        <ChevronsRight className="h-3.5 w-3.5" /> Hull & Grade
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={parchmentCurrentPage}
          totalPages={parchmentPageCount}
          onPageChange={setParchmentCurrentPage}
        />
      </div>

      {/* Green Bean Stock Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        {/* Header with search */}
        <div className="p-4 bg-green-50 border-b border-green-200">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2 bg-green-600 rounded-lg">
              <Coffee className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Green Bean Stock</h3>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search lots..."
              value={greenBeanSearch}
              onChange={e => {
                setGreenBeanSearch(e.target.value);
                setGreenBeanCurrentPage(1);
              }}
              className="pl-10 w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-900">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Lot ID</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Grade</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Weight (kg)</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">QC Score</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Availability</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {paginatedGreenBeanLots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    <Coffee className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No matching green bean lots found</p>
                  </td>
                </tr>
              ) : (
                paginatedGreenBeanLots.map(g => {
                  const qcScore = g.cuppingScores?.length > 0
                    ? (g.cuppingScores.reduce((sum, c) => sum + c.score, 0) / g.cuppingScores.length).toFixed(1)
                    : '-';

                  return (
                    <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">#{g.id.substring(0, 6).toUpperCase()}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{g.grade}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{g.currentWeightKg.toFixed(2)} kg</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {qcScore !== '-' ? (
                          <div className="flex items-center gap-1.5">
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            <span className="text-sm font-semibold text-gray-900">{qcScore}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full border ${
                          g.availabilityStatus === 'Available'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>
                          <div className={`w-2 h-2 rounded-full ${g.availabilityStatus === 'Available' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                          {g.availabilityStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {g.withdrawalHistory && g.withdrawalHistory.length > 0 && (
                            <button
                              onClick={() => setSelectedGreenBeanForHistory(g)}
                              className="inline-flex items-center justify-center px-2 py-1.5 text-xs font-semibold rounded-lg text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 transition-colors"
                              title="View Withdrawal History"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setScoringLot(g)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                            title="QC Score"
                          >
                            <Star className="h-3.5 w-3.5" /> QC Score
                          </button>
                          <button
                            onClick={() => openModal('withdrawStock', g)}
                            disabled={g.availabilityStatus === 'Withdrawn'}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                          >
                            <ChevronsRight className="h-3.5 w-3.5" /> Withdraw
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={greenBeanCurrentPage}
          totalPages={greenBeanPageCount}
          onPageChange={setGreenBeanCurrentPage}
        />
      </div>
    </div>
  );

  const KanbanView = () => (
    <>
      {/* Processing Summary Bar */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm mb-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 bg-indigo-500 rounded-lg">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <h3 className="font-semibold text-base text-gray-900">Processing Summary</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-green-50 rounded-lg p-3 border border-green-200">
            <p className="text-xs font-semibold text-green-600 uppercase mb-1">Completed</p>
            <p className="text-xl font-bold text-green-700">{data.processingBatches.filter(b => b.status === ProcessingBatchStatus.Completed).length}</p>
            <p className="text-xs text-green-600">batches</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
            <p className="text-xs font-semibold text-amber-600 uppercase mb-1">Parchment</p>
            <p className="text-xl font-bold text-amber-700">{data.parchmentLots.length}</p>
            <p className="text-xs text-amber-600">lots in stock</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <p className="text-xs font-semibold text-blue-600 uppercase mb-1">Green Bean</p>
            <p className="text-xl font-bold text-blue-700">{data.greenBeanLots.length}</p>
            <p className="text-xs text-blue-600">lots available</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
            <p className="text-xs font-semibold text-purple-600 uppercase mb-1">Ready</p>
            <p className="text-xl font-bold text-purple-700">{readyForProcessingLots.length}</p>
            <p className="text-xs text-purple-600">harvest lots</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Incoming Lots + Completed Batches */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Incoming Harvest Lots */}
        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <div className="p-4 bg-green-50 border-b border-green-200">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-green-600 rounded-lg">
                <Coffee className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Incoming Harvest Lots</h3>
            </div>
          </div>
          <div className="p-4" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {readyForProcessingLots.length > 0 ? (
              <div className="space-y-3">
                {readyForProcessingLots.map(lot => (
                  <div key={lot.id} className="bg-white border-l-4 border-l-green-500 rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-lg hover:border-gray-300 transition-all duration-200">
                    {/* Card Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <Sprout className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-gray-900">#{lot.id.substring(0, 6).toUpperCase()}</p>
                          <p className="text-xs text-gray-500">Harvest Lot</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-green-50 text-green-700 border-green-200">
                        Ready
                      </span>
                    </div>

                    {/* Card Body */}
                    <div className="space-y-0 divide-y divide-gray-100 mb-3">
                      <div className="flex items-center justify-between py-2 first:pt-0">
                        <div className="flex items-center gap-1.5">
                          <Coffee className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-600">Variety</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">{lot.cherryVariety}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-1.5">
                          <Scale className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-600">Weight</span>
                        </div>
                        <span className="text-sm font-semibold text-green-600">{lot.weightKg} kg</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex justify-end pt-3 border-t border-gray-200">
                      <button
                        onClick={() => openModal('startProcessing', lot)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                      >
                        <PlayCircle className="h-4 w-4" />
                        Record Process
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Coffee className="h-10 w-10 opacity-30 mb-2" />
                <p className="text-sm font-medium text-gray-500">No harvest lots available</p>
              </div>
            )}
          </div>
        </div>

        {/* Completed Batches */}
        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <div className="p-4 bg-green-50 border-b border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-green-600 rounded-lg">
                  <PackageCheck className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Completed Batches</h3>
              </div>
              <span className="text-sm text-green-600 font-semibold">{data.processingBatches.filter(b => b.status === ProcessingBatchStatus.Completed).length} batches</span>
            </div>
          </div>
          <div className="p-4" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {data.processingBatches.filter(b => b.status === ProcessingBatchStatus.Completed).length > 0 ? (
              <div className="space-y-3">
                {data.processingBatches.filter(b => b.status === ProcessingBatchStatus.Completed).map(batch => (
                  <KanbanCard key={batch.id} batch={batch} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <PackageCheck className="h-10 w-10 opacity-30 mb-2" />
                <p className="text-sm font-medium text-gray-500">No completed batches yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #d97706;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #b45309;
        }
      `}</style>
    </>
  );

  // --- Table Logic ---
  const SortableHeader = <T,>({ column, label, sortConfig, requestSort }: { column: T, label: string, sortConfig: { key: T, direction: SortDirection }, requestSort: (key: T) => void }) => (
    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">
      <button onClick={() => requestSort(column)} className="flex items-center gap-1 hover:text-indigo-600 transition-colors">
        {label}
        {sortConfig.key === column && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  const Pagination = ({ currentPage, totalPages, onPageChange }: { currentPage: number, totalPages: number, onPageChange: (page: number) => void }) => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex justify-between items-center px-6 py-4 bg-gray-50 border-t border-gray-200">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white hover:shadow-sm transition-all"
        >
          Previous
        </button>
        <span className="text-sm font-medium text-gray-700">
          Page <span className="font-bold text-gray-900">{currentPage}</span> of <span className="font-bold text-gray-900">{totalPages}</span>
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white hover:shadow-sm transition-all"
        >
          Next
        </button>
      </div>
    );
  };

  const processedBatches = useMemo(() => {
    return data.processingBatches
      .filter(b =>
        b.id.toLowerCase().includes(batchSearch.toLowerCase()) ||
        b.harvestLotId.toLowerCase().includes(batchSearch.toLowerCase()) ||
        b.processType.toLowerCase().includes(batchSearch.toLowerCase()) ||
        b.status.toLowerCase().includes(batchSearch.toLowerCase())
      );
  }, [data.processingBatches, batchSearch]);

  const processedParchmentLots = useMemo(() => {
    const filtered = data.parchmentLots.filter(p =>
      p.id.toLowerCase().includes(parchmentSearch.toLowerCase()) ||
      p.status.toLowerCase().includes(parchmentSearch.toLowerCase())
    );

    return filtered.sort((a, b) => {
      const key = parchmentSortConfig.key;
      if (a[key] < b[key]) return parchmentSortConfig.direction === 'asc' ? -1 : 1;
      if (a[key] > b[key]) return parchmentSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data.parchmentLots, parchmentSearch, parchmentSortConfig]);

  const parchmentPageCount = Math.ceil(processedParchmentLots.length / ITEMS_PER_PAGE);
  const paginatedParchmentLots = processedParchmentLots.slice((parchmentCurrentPage - 1) * ITEMS_PER_PAGE, parchmentCurrentPage * ITEMS_PER_PAGE);

  const enrichedGreenBeanLots = useMemo(() => {
    const qcSessionId = processorUser ? `CS-QC-${processorUser.id}` : '';
    return data.greenBeanLots.map(gbl => {
      const qcScoreData = gbl.cuppingScores.find(cs => cs.sessionId === qcSessionId);
      return { ...gbl, qcScore: qcScoreData?.score };
    });
  }, [data.greenBeanLots, processorUser]);

  const processedGreenBeanLots = useMemo(() => {
    const filtered = enrichedGreenBeanLots.filter(g =>
      g.id.toLowerCase().includes(greenBeanSearch.toLowerCase()) ||
      g.grade.toLowerCase().includes(greenBeanSearch.toLowerCase())
    );

    return filtered.sort((a, b) => {
      const key = greenBeanSortConfig.key as keyof typeof a;
      const aValue = a[key] ?? -1;
      const bValue = b[key] ?? -1;
      if (aValue < bValue) return greenBeanSortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return greenBeanSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [enrichedGreenBeanLots, greenBeanSearch, greenBeanSortConfig]);

  const greenBeanPageCount = Math.ceil(processedGreenBeanLots.length / ITEMS_PER_PAGE);
  const paginatedGreenBeanLots = processedGreenBeanLots.slice((greenBeanCurrentPage - 1) * ITEMS_PER_PAGE, greenBeanCurrentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Processor Workbench</h1>
            <p className="text-gray-600 text-sm mt-1">Manage processing batches, parchment, and green bean inventory</p>
          </div>
          <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg">
            <button onClick={() => setViewMode('kanban')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all duration-200 ${viewMode === 'kanban' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              <LayoutGrid className="h-4 w-4" /> Workflow
            </button>
            <button onClick={() => setViewMode('table')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all duration-200 ${viewMode === 'table' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              <List className="h-4 w-4" /> Data Grid
            </button>
          </div>
        </div>
      </div>

      {/* Statistics Dashboard removed per spec; KPIs now live on main Dashboard */}

      {viewMode === 'kanban' ? <KanbanView /> : <TableView />}

      {viewMode === 'kanban' && (
        <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Parchment Inventory */}
        <div className="bg-white shadow-sm rounded-lg overflow-hidden flex flex-col border border-gray-200">
          <div className="p-4 bg-amber-50 border-b border-amber-200">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-2 bg-amber-600 rounded-lg">
                <Box className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Parchment Stock</h3>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search lots..." value={parchmentSearch} onChange={e => { setParchmentSearch(e.target.value); setParchmentCurrentPage(1); }} className="pl-10 w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
          </div>
          <div className="p-4 space-y-3 flex-grow">
            {paginatedParchmentLots.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Box className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No matching parchment lots found</p>
              </div>
            ) : (
              paginatedParchmentLots.map(p => (
                <div key={p.id} className={`bg-white ${p.status === 'Hulled' ? 'border-l-gray-300' : 'border-l-amber-500'} border-l-4 rounded-lg p-3 border border-gray-200 shadow-sm hover:shadow-md transition-shadow`}>
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-10 h-10 ${p.status === 'Hulled' ? 'bg-gray-100' : 'bg-amber-100'} rounded-lg flex items-center justify-center`}>
                        <Box className={`h-5 w-5 ${p.status === 'Hulled' ? 'text-gray-500' : 'text-amber-600'}`} />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-gray-900">#{p.id.substring(0, 6).toUpperCase()}</p>
                        <p className="text-xs text-gray-500">Parchment Lot</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${p.status === 'Hulled' ? 'bg-gray-50 text-gray-700 border-gray-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                      <div className={`w-2 h-2 rounded-full ${p.status === 'Hulled' ? 'bg-gray-400' : 'bg-green-500'}`}></div>
                      {p.status}
                    </span>
                  </div>

                  {/* Card Body */}
                  <div className="space-y-0 divide-y divide-gray-100 mb-3">
                    <div className="flex items-center justify-between py-2 first:pt-0">
                      <div className="flex items-center gap-1.5">
                        <Scale className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-600">Weight</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{p.currentWeightKg.toFixed(2)} kg</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-1.5">
                        <Droplet className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-600">Moisture</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{p.moistureContent}%</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => openModal('hullAndGrade', p)}
                      disabled={p.status === 'Hulled' || p.currentWeightKg <= 0}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronsRight className="h-4 w-4" /> Hull & Grade
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <Pagination currentPage={parchmentCurrentPage} totalPages={parchmentPageCount} onPageChange={setParchmentCurrentPage} />
        </div>

        {/* Green Bean Inventory */}
        <div className="bg-white shadow-sm rounded-lg overflow-hidden flex flex-col border border-gray-200">
          <div className="p-4 bg-green-50 border-b border-green-200">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-2 bg-green-600 rounded-lg">
                <Coffee className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Green Bean Stock</h3>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search lots..." value={greenBeanSearch} onChange={e => { setGreenBeanSearch(e.target.value); setGreenBeanCurrentPage(1); }} className="pl-10 w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
            </div>
          </div>
          <div className="p-4 space-y-3 flex-grow">
            {paginatedGreenBeanLots.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Coffee className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No matching green bean lots found</p>
              </div>
            ) : (
              paginatedGreenBeanLots.map(g => (
                <div key={g.id} className={`bg-white ${g.availabilityStatus === 'Withdrawn' ? 'border-l-gray-300' : 'border-l-green-500'} border-l-4 rounded-lg p-3 border border-gray-200 shadow-sm hover:shadow-md transition-shadow`}>
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-10 h-10 ${g.availabilityStatus === 'Withdrawn' ? 'bg-gray-100' : 'bg-green-100'} rounded-lg flex items-center justify-center`}>
                        <Coffee className={`h-5 w-5 ${g.availabilityStatus === 'Withdrawn' ? 'text-gray-500' : 'text-green-600'}`} />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-gray-900">#{g.id.substring(0, 6).toUpperCase()}</p>
                        <p className="text-xs text-gray-500">Green Bean Lot</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleAvailability(g.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${g.availabilityStatus === 'Available' ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`}
                    >
                      <div className={`w-2 h-2 rounded-full ${g.availabilityStatus === 'Available' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      {g.availabilityStatus}
                    </button>
                  </div>

                  {/* Card Body */}
                  <div className="space-y-0 divide-y divide-gray-100 mb-3">
                    <div className="flex items-center justify-between py-2 first:pt-0">
                      <div className="flex items-center gap-1.5">
                        <Star className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-600">Grade</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{g.grade}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-1.5">
                        <Scale className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-600">Weight</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{g.currentWeightKg.toFixed(2)} kg</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-600">Price/kg</span>
                      </div>
                      {g.pricePerKg ? (
                        <span className="text-sm font-semibold text-green-600">{g.pricePerKg.toFixed(2)} {g.currency || 'THB'}</span>
                      ) : (
                        <span className="text-sm font-medium text-gray-400">Not set</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-600">QC Score</span>
                      </div>
                      {g.qcScore ? (
                        <span className="text-sm font-semibold text-gray-900">{g.qcScore.toFixed(2)} / 100</span>
                      ) : (
                        <span className="text-sm font-medium text-gray-400">N/A</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-3 border-t border-gray-200">
                    {g.withdrawalHistory && g.withdrawalHistory.length > 0 && (
                      <button
                        onClick={() => setSelectedGreenBeanForHistory(g)}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 transition-colors"
                        title="View Withdrawal History"
                        aria-label="View withdrawal history"
                      >
                        <History className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setScoringLot(g)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 transition-colors"
                    >
                      <Star className="h-4 w-4" /> QC Score
                    </button>
                    <button
                      onClick={() => openModal('withdrawStock', g)}
                      disabled={g.availabilityStatus === 'Withdrawn'}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronsRight className="h-4 w-4" /> Withdraw
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <Pagination currentPage={greenBeanCurrentPage} totalPages={greenBeanPageCount} onPageChange={setGreenBeanCurrentPage} />
        </div>
      </div>
      )}

      {modal && <ModalPortal><div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className={`bg-white rounded-2xl shadow-2xl w-full ${modal === 'completeBatch' ? 'max-w-4xl' : 'max-w-2xl'} max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col`}>
          <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-y-auto p-8">
            {/* Error Display */}
            {formError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800">Error</p>
                  <p className="text-xs text-red-700 mt-1">{formError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormError(null)}
                  className="text-red-600 hover:text-red-800"
                  aria-label="Dismiss error"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            
            {modal === 'startProcessing' && selectedHarvestLot && <>
              <div className="flex items-center gap-4 mb-8">
                <div className="p-4 bg-blue-100 rounded-xl shadow-md">
                  <PlayCircle className="h-10 w-10 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">Record Process</h2>
                  <p className="text-base text-gray-600 mt-1">Lot #{selectedHarvestLot.id}</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-2xl p-8 mb-8 border border-gray-200 shadow-sm">
                <div className="grid grid-cols-3 gap-8">
                  <div className="text-center">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">Variety</p>
                    <p className="text-2xl font-bold text-gray-900">{selectedHarvestLot.cherryVariety}</p>
                  </div>
                  <div className="text-center border-l-2 border-gray-300">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">Weight</p>
                    <p className="text-2xl font-bold text-green-600">{selectedHarvestLot.weightKg} kg</p>
                  </div>
                  <div className="text-center border-l-2 border-gray-300">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">Farmer</p>
                    <p className="text-2xl font-bold text-gray-900">{selectedHarvestLot.farmerName}</p>
                  </div>
                </div>
              </div>
              <div className="mb-6 space-y-4">
                <div>
                  <label htmlFor="processType" className="block text-base font-bold text-gray-700 mb-3">Select Process Type</label>
                  <ProcessTypeDropdown
                    value={selectedProcessType}
                    onChange={setSelectedProcessType}
                    processTypes={processTypeOptions}
                  />
                  <input type="hidden" name="processType" value={selectedProcessType} />
                </div>

                <div>
                  <label htmlFor="cropYear" className="block text-base font-bold text-gray-700 mb-3">Crop Year (Optional)</label>
                  <CustomCropYearDropdown
                    value={cropYearId}
                    onChange={setCropYearId}
                    options={data.cropYears}
                    placeholder="Select crop year..."
                  />
                  <p className="mt-1 text-xs text-gray-500">Associate this batch with a crop year for tracking and reporting</p>
                </div>

                {/* Optional special instructions/note for the chosen process */}
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

                {/* Parchment Weight and Moisture */}
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

                {/* Drying Dates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <DatePicker
                      value={dryingStartDate}
                      onChange={setDryingStartDate}
                      label="Drying Start Date"
                      required
                    />
                  </div>
                  <div>
                    <DatePicker
                      value={dryingEndDate}
                      onChange={setDryingEndDate}
                      label="Drying End Date"
                      required
                    />
                  </div>
                </div>
              </div>
            </>}
            {modal === 'hullAndGrade' && selectedParchment && (() => {
              const totalWeightNum = parseFloat(totalGreenWeight) || 0;
              const weightMismatch = totalWeightNum > 0 && Math.abs(gradedWeightSum - totalWeightNum) > 0.01;
              const weightLossPercent = totalGreenWeight ? (((selectedParchment.currentWeightKg - parseFloat(totalGreenWeight)) / selectedParchment.currentWeightKg) * 100).toFixed(1) : '0';

              return <>
                {/* Modal Header */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-4 bg-green-600 rounded-2xl shadow-lg">
                    <ChevronsRight className="h-10 w-10 text-white" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900">Hull & Grade</h2>
                    <p className="text-base text-gray-600 mt-1">Parchment Lot #{selectedParchment.id}</p>
                  </div>
                </div>

                {/* Parchment Info Card */}
                <div className="bg-amber-50 rounded-2xl p-6 mb-6 border border-amber-200">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Parchment Weight</p>
                      <p className="text-3xl font-bold text-amber-600">{selectedParchment.currentWeightKg.toFixed(2)}</p>
                      <p className="text-xs text-gray-500 mt-1">kilograms</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Moisture</p>
                      <p className="text-3xl font-bold text-blue-600">{selectedParchment.moistureContent}%</p>
                      <p className="text-xs text-gray-500 mt-1">content</p>
                    </div>
                  </div>
                </div>

                {/* Total Green Bean Weight Input */}
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
                    onChange={e => setTotalGreenWeight(e.target.value)}
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

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t-2 border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">Create Graded Lots</span>
                  </div>
                </div>

                {/* Graded Lots Section */}
                <div className="space-y-3 mb-4">
                  {gradedLots.map((lot, index) => (
                    <div key={index} className="bg-green-50 rounded-xl p-4 border border-green-200">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
                          <span className="text-white font-bold text-lg">#{index + 1}</span>
                        </div>
                        <div className="flex-1 grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Grade</label>
                            <GradeDropdown
                              value={lot.grade}
                              onChange={(value) => setGradedLots(gradedLots.map((l, i) => i === index ? { ...l, grade: value } : l))}
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
                              onChange={e => setGradedLots(gradedLots.map((l, i) => i === index ? { ...l, weight: e.target.value } : l))}
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
                              onChange={e => setGradedLots(gradedLots.map((l, i) => i === index ? { ...l, price: e.target.value } : l))}
                              className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-green-500"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGradedLots(gradedLots.filter((_, i) => i !== index))}
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

                {/* Add Grade Button */}
                <button
                  type="button"
                  onClick={() => setGradedLots([...gradedLots, { grade: '', weight: '', price: '' }])}
                  className="w-full py-3 px-4 border border-dashed border-green-300 rounded-xl text-sm font-bold text-green-600 hover:bg-green-50 hover:border-green-400 transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={18} /> Add Another Grade
                </button>

                {/* Total Summary Card */}
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
            })()}
            {modal === 'withdrawStock' && selectedGreenBean && <>
              {/* Modal Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="p-4 bg-indigo-600 rounded-2xl shadow-lg">
                  <ChevronsRight className="h-10 w-10 text-white" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">Withdraw Stock</h2>
                  <p className="text-base text-gray-600 mt-1">Green Bean Lot #{selectedGreenBean.id}</p>
                </div>
              </div>

              {/* Current Stock Info Card */}
              <div className="bg-green-50 rounded-2xl p-6 mb-6 border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Current Stock</p>
                    <p className="text-4xl font-bold text-green-600">{selectedGreenBean.currentWeightKg.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">kilograms available</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Grade</p>
                    <p className="text-2xl font-bold text-gray-900">{selectedGreenBean.grade}</p>
                  </div>
                </div>
              </div>

              {/* Withdrawal Type Dropdown */}
              <div className="mb-6">
                <label className="block text-base font-bold text-gray-700 mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-indigo-600" />
                    Withdrawal Type
                  </div>
                </label>
                <Select
                  value={withdrawalType}
                  onChange={(v) => setWithdrawalType(v as typeof withdrawalType)}
                  options={['Sale', 'Roasting Stock', 'Sample', 'Export', 'Other']}
                  placeholder="Select withdrawal type..."
                  colorTheme="blue"
                />
              </div>

              {/* Conditional Sale Fields */}
              {withdrawalType === 'Sale' && (
                <div className="mb-6 p-5 bg-blue-50 rounded-xl border border-blue-200">
                  <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-blue-600" />
                    Sale Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Customer (Optional)
                      </label>
                      {customers.length > 0 ? (
                        <div className="space-y-2">
                          <Select
                            value={withdrawalCustomerId}
                            onChange={(v) => handleCustomerSelect(v as string)}
                            options={customerOptions}
                            placeholder="Select customer or type name below..."
                            colorTheme="blue"
                          />
                          <input
                            type="text"
                            value={withdrawalCustomerName}
                            onChange={(e) => {
                              setWithdrawalCustomerName(e.target.value);
                              setWithdrawalCustomerId(''); // Clear selection when typing manually
                            }}
                            placeholder="Or type customer name manually..."
                            className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={withdrawalCustomerName}
                          onChange={(e) => setWithdrawalCustomerName(e.target.value)}
                          placeholder="e.g., Roaster ABC"
                          className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      )}
                      {customers.length === 0 && !customersLoading && (currentUser.role === UserRole.Admin || currentUser.role === UserRole.Roaster) && (
                        <p className="mt-1 text-xs text-gray-500">
                          <a href="/customers" target="_blank" className="text-blue-600 hover:underline">
                            Create customers
                          </a> to use dropdown selection
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Delivery Address (Optional)
                      </label>
                      <input
                        type="text"
                        value={withdrawalDeliveryAddress}
                        onChange={(e) => setWithdrawalDeliveryAddress(e.target.value)}
                        placeholder="e.g., 123 Main St, City"
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Price per kg
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={withdrawalSalePrice}
                          onChange={(e) => setWithdrawalSalePrice(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <select
                          value={withdrawalCurrency}
                          onChange={(e) => setWithdrawalCurrency(e.target.value)}
                          className="border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        >
                          <option value="THB">THB</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Withdraw Amount Input */}
              <div className="mb-6">
                <label className="block text-base font-bold text-gray-700 mb-3">
                  <div className="flex items-center gap-2">
                    <Scale className="h-5 w-5 text-indigo-600" />
                    Amount to Withdraw
                  </div>
                </label>
                <input
                  type="number"
                  max={selectedGreenBean.currentWeightKg}
                  step="0.1"
                  name="amountKg"
                  required
                  placeholder="Enter amount in kg"
                  className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-lg font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition-all"
                />
                <p className="text-xs text-gray-500 mt-2">Maximum: {selectedGreenBean.currentWeightKg.toFixed(2)} kg</p>
              </div>

              {/* Purpose Input */}
              <div className="mb-6">
                <label className="block text-base font-bold text-gray-700 mb-3">
                  Purpose / Notes (Optional)
                </label>
                <input
                  type="text"
                  name="purpose"
                  placeholder="e.g., Sample Roast, Order #123, Customer request"
                  className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition-all"
                />
              </div>
            </>}
            {modal === 'editWithdrawal' && editingWithdrawalLotId && editingWithdrawalIndex !== null && (() => {
              const lot = data.greenBeanLots.find(g => g.id === editingWithdrawalLotId);
              const entry = lot?.withdrawalHistory?.[editingWithdrawalIndex];
              if (!entry) return null;

              return <>
                {/* Modal Header */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-4 bg-orange-600 rounded-2xl shadow-lg">
                    <FileText className="h-10 w-10 text-white" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900">Edit Withdrawal</h2>
                    <p className="text-base text-gray-600 mt-1">Lot #{editingWithdrawalLotId} - Entry #{editingWithdrawalIndex + 1}</p>
                  </div>
                </div>

                {/* Info Card */}
                <div className="bg-yellow-50 rounded-2xl p-5 mb-6 border border-yellow-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">Edit Restrictions</p>
                      <p className="text-xs text-gray-700">
                        You can edit the withdrawal type, notes, and sale details. The withdrawal amount ({entry.amountKg.toFixed(2)} kg) and date ({entry.date}) cannot be changed.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Withdrawal Type Dropdown */}
                <div className="mb-6">
                  <label className="block text-base font-bold text-gray-700 mb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-orange-600" />
                      Withdrawal Type
                    </div>
                  </label>
                  <Select
                    value={withdrawalType}
                    onChange={(v) => setWithdrawalType(v as typeof withdrawalType)}
                    options={['Sale', 'Roasting Stock', 'Sample', 'Export', 'Other']}
                    placeholder="Select withdrawal type..."
                    colorTheme="blue"
                  />
                </div>

                {/* Conditional Sale Fields */}
                {withdrawalType === 'Sale' && (
                  <div className="mb-6 p-5 bg-blue-50 rounded-xl border border-blue-200">
                    <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-blue-600" />
                      Sale Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Customer (Optional)
                        </label>
                        {customers.length > 0 ? (
                          <div className="space-y-2">
                            <Select
                              value={withdrawalCustomerId}
                              onChange={(v) => handleCustomerSelect(v as string)}
                              options={customerOptions}
                              placeholder="Select customer or type name below..."
                              colorTheme="blue"
                            />
                            <input
                              type="text"
                              value={withdrawalCustomerName}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                setWithdrawalCustomerName(e.target.value);
                                setWithdrawalCustomerId(''); // Clear selection when typing manually
                              }}
                              placeholder="Or type customer name manually..."
                              className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={withdrawalCustomerName}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWithdrawalCustomerName(e.target.value)}
                            placeholder="e.g., Roaster ABC"
                            className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Delivery Address (Optional)
                        </label>
                        <input
                          type="text"
                          value={withdrawalDeliveryAddress}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWithdrawalDeliveryAddress(e.target.value)}
                          placeholder="e.g., 123 Main St, City"
                          className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Price per kg
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={withdrawalSalePrice}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWithdrawalSalePrice(e.target.value)}
                            placeholder="0.00"
                            className="flex-1 block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <select
                            value={withdrawalCurrency}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setWithdrawalCurrency(e.target.value)}
                            className="border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                          >
                            <option value="THB">THB</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes Input */}
                <div className="mb-6">
                  <label className="block text-base font-bold text-gray-700 mb-3">
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    defaultValue={entry.notes || entry.purpose || ''}
                    placeholder="Add or edit notes about this withdrawal..."
                    className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-base focus:ring-2 focus:ring-orange-500 focus:border-orange-500 shadow-sm transition-all resize-none"
                  />
                </div>
              </>;
            })()}
            <div className="mt-8 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setFormError(null);
                  setSelectedHarvestLot(null);
                  setCropYearId('');
                }} 
                className="px-6 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 border border-transparent shadow-lg text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-all"
                disabled={isSubmitting || (modal === 'hullAndGrade' && (Math.abs(gradedWeightSum - (parseFloat(totalGreenWeight) || 0)) > 0.01 || (parseFloat(totalGreenWeight) || 0) <= 0))}
              >
                <Save className="h-4 w-4" />
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div></ModalPortal>}

      {scoringLot && <ModalPortal><div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col">
          <div className="p-6 sm:p-8 overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-amber-600 rounded-2xl shadow-lg">
                <Star className="h-10 w-10 text-white" />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-gray-900">QC Score</h2>
                <p className="text-base text-gray-600 mt-1">Quality Control for Lot #{scoringLot.id}</p>
              </div>
            </div>

            {/* Lot Info Card */}
            <div className="bg-amber-50 rounded-2xl p-6 mb-6 border border-amber-200">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Grade</p>
                  <p className="text-2xl font-bold text-amber-600">{scoringLot.grade}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Weight</p>
                  <p className="text-2xl font-bold text-gray-900">{scoringLot.currentWeightKg.toFixed(2)} kg</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Current Score</p>
                  <p className="text-2xl font-bold text-purple-600">{scoringLot.qcScore ? scoringLot.qcScore.toFixed(2) : 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Scoring Mode Toggle */}
            <div className="flex bg-gray-100 p-1.5 rounded-xl mb-6 w-full sm:w-2/3 mx-auto">
              <button type="button" onClick={() => setScoringMode('simple')} className={`w-1/2 py-3 text-sm font-bold rounded-lg transition-all ${scoringMode === 'simple' ? 'bg-white shadow-md text-amber-600' : 'text-gray-600 hover:text-gray-900'}`}>
                Simple Score
              </button>
              <button type="button" onClick={() => setScoringMode('detailed')} className={`w-1/2 py-3 text-sm font-bold rounded-lg transition-all ${scoringMode === 'detailed' ? 'bg-white shadow-md text-amber-600' : 'text-gray-600 hover:text-gray-900'}`}>
                Detailed (SCA)
              </button>
            </div>

            {scoringMode === 'simple' ? (
              <div className="max-w-md mx-auto">
                <label className="block text-base font-bold text-gray-700 mb-3">
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-amber-600" />
                    Total Score (0-100)
                  </div>
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={simpleQcScore}
                  onChange={e => setSimpleQcScore(e.target.value)}
                  required
                  placeholder="Enter score"
                  className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-lg font-semibold text-center focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-sm transition-all"
                />
                <p className="text-xs text-gray-500 mt-2 text-center">Score from 0 to 100 (increments of 0.25)</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>{SCA_SENSORY_ATTRIBUTES.map(attr => {
                  const { value, error } = sensoryScores[attr];
                  return (<div key={attr} className="mb-2">
                    <label htmlFor={attr} className="block text-sm font-medium text-gray-700 mb-1">{attr}</label>
                    <input type="number" id={attr} min="1" max="10" step="0.25" value={value}
                      onChange={e => setSensoryScores(prev => ({ ...prev, [attr]: { ...prev[attr], value: e.target.value } }))}
                      onBlur={() => setSensoryScores(prev => ({ ...prev, [attr]: { ...prev[attr], error: validateScore(value).error } }))}
                      className={`w-full p-2 border rounded-md shadow-sm text-sm text-center ${error ? 'border-red-500' : 'border-gray-300'}`} />
                    {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
                  </div>);
                })}</div>
                <div>
                  {SCA_CUP_ATTRIBUTES.map(attr => {
                    const count = cupScores[attr];
                    return (<div key={attr} className="mb-4">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-sm font-medium text-gray-700">{attr}</label>
                        <span className="text-lg font-bold text-gray-800">{count * 2}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <button type="button" key={i} onClick={() => setCupScores(prev => ({ ...prev, [attr]: i + 1 }))}
                            className={`flex-1 h-8 rounded-md border transition-colors ${i < count ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-400 hover:border-indigo-500'}`} />
                        ))}
                      </div>
                    </div>);
                  })}
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                    <label className="text-sm font-medium text-gray-700">Defects (subtract)</label>
                    <div className="flex items-center gap-4 mt-2">
                      <div><label className="text-xs"># of cups</label><input type="number" min="0" value={defects.numCups} onChange={e => setDefects({ ...defects, numCups: e.target.value })} className="w-20 p-2 border rounded-md shadow-sm text-sm" /></div>
                      <span>&times;</span>
                      <div className="flex gap-2"><label className="flex items-center text-sm gap-1"><input type="radio" name="intensity" value="2" checked={defects.intensity === 2} onChange={() => setDefects({ ...defects, intensity: 2 })} /> Taint</label><label className="flex items-center text-sm gap-1"><input type="radio" name="intensity" value="4" checked={defects.intensity === 4} onChange={() => setDefects({ ...defects, intensity: 4 })} /> Fault</label></div>
                      <span>=</span>
                      <span className="text-2xl font-bold text-red-600">{detailedCalculations.defectsTotal}</span>
                    </div>
                  </div>
                  <div className="mt-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200 space-y-2">
                    <div className="flex justify-between items-baseline"><span className="font-semibold text-gray-600">Subtotal</span><span className="font-bold text-xl text-gray-800">{detailedCalculations.subtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between items-baseline"><span className="font-semibold text-red-600">Defects</span><span className="font-bold text-xl text-red-600">&minus; {detailedCalculations.defectsTotal.toFixed(2)}</span></div>
                    <hr className="border-gray-300" />
                    <div className="flex justify-between items-center pt-2"><span className="text-xl font-bold text-indigo-800">Final Score</span><span className="text-4xl font-extrabold text-indigo-600">{detailedCalculations.finalScore.toFixed(2)}</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Tasting Notes */}
            <div className="mt-6">
              <label className="block text-base font-bold text-gray-700 mb-3">
                Tasting Notes & Comments
              </label>
              <textarea
                rows={4}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Describe flavor notes, aroma, body, aftertaste..."
                className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-base focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-sm transition-all resize-none"
              ></textarea>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setScoringLot(null)}
                className="px-6 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveScore}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 border border-transparent shadow-lg text-sm font-semibold rounded-xl text-white bg-amber-600 hover:bg-amber-700 transition-all"
              >
                <Save className="h-4 w-4" />
                Save Score
              </button>
            </div>
          </div>
        </div>
      </div></ModalPortal>}

      {selectedGreenBeanForHistory && (
        <ModalPortal><div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col">
            <div className="p-6 sm:p-8">
              {/* Modal Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="p-4 bg-gray-600 rounded-2xl shadow-lg">
                  <History className="h-10 w-10 text-white" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">Withdrawal History</h2>
                  <p className="text-base text-gray-600 mt-1">Lot #{selectedGreenBeanForHistory.id}</p>
                </div>
              </div>

              {/* Summary Card */}
              <div className="bg-blue-50 rounded-2xl p-6 mb-6 border border-blue-200">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Total Withdrawals</p>
                    <p className="text-3xl font-bold text-blue-600">
                      {selectedGreenBeanForHistory.withdrawalHistory?.length || 0}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">transactions</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Total Amount</p>
                    <p className="text-3xl font-bold text-blue-600">
                      {(selectedGreenBeanForHistory.withdrawalHistory?.reduce((sum, entry) => sum + entry.amountKg, 0) || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">kilograms</p>
                  </div>
                </div>
              </div>

              {/* History List */}
              <div className="overflow-y-auto max-h-96">
                <div className="space-y-3">
                  {selectedGreenBeanForHistory.withdrawalHistory?.map((entry, index) => {
                    // Withdrawal type badge colors
                    const typeBadgeColors = {
                      'Sale': 'bg-green-100 text-green-700 border-green-200',
                      'Roasting Stock': 'bg-orange-100 text-orange-700 border-orange-200',
                      'Sample': 'bg-purple-100 text-purple-700 border-purple-200',
                      'Export': 'bg-blue-100 text-blue-700 border-blue-200',
                      'Other': 'bg-gray-100 text-gray-700 border-gray-200'
                    };
                    const badgeColor = typeBadgeColors[entry.withdrawalType] || typeBadgeColors['Other'];

                    return (
                      <div key={index} className="bg-gray-50 rounded-xl p-4 border border-gray-200 hover:border-blue-300 transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold text-sm">#{index + 1}</span>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Date</p>
                              <p className="text-sm font-bold text-gray-900">{entry.date}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Amount</p>
                            <p className="text-2xl font-bold text-blue-600">{entry.amountKg.toFixed(2)} kg</p>
                          </div>
                        </div>

                        {/* Withdrawal Type Badge */}
                        <div className="mb-3">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${badgeColor}`}>
                            {entry.withdrawalType}
                          </span>
                        </div>

                        {/* Sale Information */}
                        {entry.withdrawalType === 'Sale' && (entry.salePrice || entry.customerName || entry.invoiceNumber) && (
                          <div className="mb-3 p-3 bg-green-50 rounded-lg border border-green-200">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Sale Details</p>
                            <div className="space-y-1">
                              {entry.salePrice && (
                                <p className="text-sm text-gray-900">
                                  <span className="font-semibold">Price:</span> {entry.salePrice.toFixed(2)} {entry.currency || 'THB'}/kg
                                </p>
                              )}
                              {entry.customerName && (
                                <p className="text-sm text-gray-900">
                                  <span className="font-semibold">Customer:</span> {entry.customerName}
                                </p>
                              )}
                              {entry.deliveryAddress && (
                                <p className="text-sm text-gray-900">
                                  <span className="font-semibold">Delivery:</span> {entry.deliveryAddress}
                                </p>
                              )}
                              {entry.invoiceNumber && (
                                <p className="text-sm text-gray-900">
                                  <span className="font-semibold">Invoice #:</span> {entry.invoiceNumber}
                                </p>
                              )}
                              {entry.totalAmount != null && (
                                <p className="text-sm text-gray-900">
                                  <span className="font-semibold">Total:</span> {entry.totalAmount.toFixed(2)} {entry.currency || 'THB'}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Purpose/Notes */}
                        {(entry.purpose || entry.notes) && (
                          <div className="mb-3">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                              {entry.notes ? 'Notes' : 'Purpose'}
                            </p>
                            <p className="text-sm text-gray-900">{entry.notes || entry.purpose}</p>
                          </div>
                        )}

                        {/* Withdrawn By */}
                        {entry.withdrawnByName && (
                          <div className="mb-3">
                            <p className="text-xs text-gray-500">
                              Withdrawn by: <span className="font-semibold text-gray-700">{entry.withdrawnByName}</span>
                            </p>
                          </div>
                        )}

                        {/* Admin Actions */}
                        {/* Actions */}
                        <div className="mt-3 pt-3 border-t border-gray-300 flex gap-2">
                          {entry.withdrawalType === 'Sale' && (
                            <button
                              type="button"
                              onClick={() => {
                                setInvoiceView({ lot: selectedGreenBeanForHistory, entryIndex: index });
                                setSelectedGreenBeanForHistory(null);
                              }}
                              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 transition-all"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Invoice
                            </button>
                          )}
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditWithdrawal(selectedGreenBeanForHistory.id, index)}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWithdrawal(selectedGreenBeanForHistory.id, index)}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Close Button */}
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedGreenBeanForHistory(null)}
                  className="px-6 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div></ModalPortal>
      )}
      {invoiceView && (
        <InvoiceReceipt
          visible={true}
          onClose={() => setInvoiceView(null)}
          lot={invoiceView.lot}
          entry={invoiceView.lot.withdrawalHistory![invoiceView.entryIndex]}
        />
      )}
    </div>
  );
};

export default ProcessorWorkbench;