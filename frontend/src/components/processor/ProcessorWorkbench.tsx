import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import ReactDOM from "react-dom";
import { useDataContext } from "../../hooks/useDataContext";
import {
  ProcessingBatch,
  ProcessingBatchStatus,
  ParchmentLot,
  GreenBeanLot,
  HarvestLot,
  User,
  UserRole,
  CuppingSessionType,
  JudgeScore,
  SCA_SENSORY_ATTRIBUTES,
  SCA_CUP_ATTRIBUTES,
  PricingHistory,
  Customer,
  CropYear,
} from "../../types";
import {
  Coffee,
  Wind,
  PackageCheck,
  Sprout,
  ChevronsRight,
  CheckCircle,
  Archive,
  PlayCircle,
  TestTube,
  Plus,
  Trash2,
  LayoutGrid,
  List,
  AlertCircle,
  History,
  Save,
  Search,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Microscope,
  Star,
  TrendingUp,
  Box,
  Droplet,
  Scale,
  Calendar,
  Package,
  Activity,
  DollarSign,
  FileText,
  X,
  Play,
  Download,
  ClipboardCheck,
  Pencil,
  Eye,
} from "lucide-react";
import { addPricingHistory } from "../../services/salesService";
import { getAllCustomers } from "../../services/customerService";
import {
  addProcessingBatch,
  updateProcessingBatch,
} from "../../services/processingBatchService";
import {
  createGreenBeanLot,
  updateGreenBeanLotScore,
} from "../../services/greenBeanLotService";
import { updateParchmentLot } from "../../services/parchmentLotService";
import DatePicker from "../common/DatePicker";
import InvoiceReceipt from "./InvoiceReceipt";
import Select from "../common/Select";
import { useToast } from "../../contexts/ToastContext";
import {
  formatGreenBeanId,
  formatParchmentId,
  formatProcessingBatchId,
  formatHarvestLotId,
} from "../../utils/formatDisplayId";
import StartProcessingModal from "./modals/StartProcessingModal";
import HullAndGradeModal from "./modals/HullAndGradeModal";
import CompleteBatchModal from "./modals/CompleteBatchModal";

type ViewMode = "kanban" | "table";
type SortDirection = "asc" | "desc";
type ParchmentSortKeys = keyof ParchmentLot | "id";
type GreenBeanSortKeys = keyof GreenBeanLot | "id" | "qcScore";

const ITEMS_PER_PAGE = 3;
const MAX_VISIBLE_PAGES = 5;

// Custom Dropdown Component for Process Type Selection
const ProcessTypeDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  processTypes: { value: string; label: string }[];
}> = ({ value, onChange, processTypes }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const options = processTypes || [];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Find selected option or use first option as fallback
  const selectedOption = options.find((opt) => opt.value === value) ||
    options[0] || { value: "", label: "No process types available" };

  // If no options available, disable dropdown
  const hasOptions = options.length > 0;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => hasOptions && setIsOpen(!isOpen)}
        disabled={!hasOptions}
        className={`w-full border border-gray-300 rounded-xl px-4 py-3 text-base font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-gray-400 flex items-center justify-between gap-2 shadow-sm ${
          !hasOptions ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        <span className="text-gray-900">{selectedOption.label}</span>
        <ChevronDown
          className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
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
                  className={`w-full text-left px-5 py-3 transition-all text-base font-medium ${
                    option.value === value
                      ? "bg-gray-100 text-gray-900 font-semibold"
                      : "text-gray-700 hover:bg-gray-50"
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

// Helper function to format parchment status for display
const formatParchmentStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    AwaitingHulling: "Awaiting Hulling",
    Hulled: "Hulled",
  };
  return statusMap[status] || status;
};

// Custom Dropdown Component for Grade Selection
const GradeDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  index: number;
  usedGrades?: string[];
}> = ({ value, onChange, index, usedGrades = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allOptions = [
    { value: "Grade A", label: "Grade A" },
    { value: "Grade B", label: "Grade B" },
    { value: "Grade C", label: "Grade C" },
    { value: "Peaberry", label: "Peaberry" },
    { value: "Screen 18", label: "Screen 18" },
    { value: "Screen 17", label: "Screen 17" },
    { value: "Screen 16", label: "Screen 16" },
    { value: "Screen 15", label: "Screen 15" },
  ];

  // Filter out grades that are already used by other rows (keep current selection available)
  const options = allOptions.filter(
    (opt) => !usedGrades.includes(opt.value) || opt.value === value,
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = allOptions.find((opt) => opt.value === value);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 transition-all hover:border-gray-300 flex items-center justify-between gap-2"
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>
          {selectedOption ? selectedOption.label : "Select Grade"}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
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
                className={`w-full text-left px-4 py-2.5 transition-all text-sm font-medium ${
                  value === option.value
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-700 hover:bg-gray-50"
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

// Crop Year Chips Component (เหมือนใน HarvestLotModal)
const CropYearChips: React.FC<{
  years: CropYear[];
  value: string;
  onChange: (value: string) => void;
  maxVisible?: number;
}> = ({ years, value, onChange, maxVisible = 5 }) => {
  const [offset, setOffset] = useState(0);
  const initializedRef = useRef(false);

  // หาปีปัจจุบันจาก today
  const currentYearId = useMemo(() => {
    const today = new Date();
    return (
      years.find((y) => {
        const start = new Date(y.startDate);
        const end = new Date(y.endDate);
        return today >= start && today <= end;
      })?.id || ""
    );
  }, [years]);

  // Initialize offset ให้อยู่รอบๆ ปีปัจจุบัน (แค่ครั้งแรกเท่านั้น)
  useEffect(() => {
    if (initializedRef.current) return; // ไม่ reset ถ้า initialize แล้ว
    if (years.length > maxVisible && currentYearId) {
      const currentIndex = years.findIndex((y) => y.id === currentYearId);
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

  const baseChipClass =
    "relative flex items-center justify-center py-3 px-4 rounded-xl border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer";
  const selectedClass = "bg-blue-600 text-white border-blue-600 shadow-lg";
  const unselectedClass =
    "bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:bg-blue-50";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {/* ปุ่ม "None" */}
        <button
          type="button"
          onClick={() => onChange("")}
          className={`${baseChipClass} ${!value ? selectedClass : unselectedClass}`}
        >
          <span className="text-sm font-semibold">None</span>
        </button>

        {/* ปุ่มแต่ละปี (จำกัดจำนวน) */}
        {visibleYears.map((year) => {
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
                <span
                  className={`absolute -top-2 -right-2 px-2 py-0.5 text-[10px] font-bold rounded-full shadow-sm ${
                    isSelected
                      ? "bg-white text-blue-600"
                      : "bg-blue-500 text-white"
                  }`}
                >
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
            className={`p-2 rounded-full transition-all duration-200 ${canGoBack ? "hover:bg-blue-100 text-gray-700" : "text-gray-300 cursor-not-allowed"}`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() =>
              setOffset(Math.min(years.length - maxVisible, offset + 1))
            }
            disabled={!canGoForward}
            className={`p-2 rounded-full transition-all duration-200 ${canGoForward ? "hover:bg-blue-100 text-gray-700" : "text-gray-300 cursor-not-allowed"}`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
            </svg>
          </button>
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

const validateScore = (
  value: string,
): { formattedValue: string; error: string | null } => {
  if (value.trim() === "") return { formattedValue: value, error: "Required." };
  const numValue = parseFloat(value);
  if (isNaN(numValue))
    return { formattedValue: value, error: "Invalid number." };
  if (numValue < 1 || numValue > 10)
    return { formattedValue: value, error: "Must be 1-10." };
  return { formattedValue: numValue.toFixed(2), error: null };
};

const initialSensoryScores = SCA_SENSORY_ATTRIBUTES.reduce(
  (acc, attr) => {
    acc[attr] = { value: "", error: null };
    return acc;
  },
  {} as Record<string, ScoreInput>,
);

const initialCupScores = SCA_CUP_ATTRIBUTES.reduce(
  (acc, attr) => {
    acc[attr] = 5; // All 5 cups are good by default
    return acc;
  },
  {} as Record<string, number>,
);
// --- End Detailed Scoring Helpers ---

// Modal Portal Component
const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return ReactDOM.createPortal(children, document.body);
};

const KanbanCard: React.FC<{ batch: ProcessingBatch }> = ({ batch }) => {
  const processColors = {
    Washed: { border: "border-l-sky-500", badge: "bg-sky-50 text-sky-700" },
    Natural: {
      border: "border-l-amber-500",
      badge: "bg-amber-50 text-amber-700",
    },
    Honey: {
      border: "border-l-yellow-500",
      badge: "bg-yellow-50 text-yellow-700",
    },
  };
  const colors =
    processColors[batch.processType as keyof typeof processColors] ||
    processColors["Washed"];

  return (
    <div
      className={`bg-white border-l-4 ${colors.border} rounded-lg p-3 border border-gray-200 hover:shadow-md transition-all duration-200 mb-2`}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-900">
          {formatProcessingBatchId(batch)}
        </p>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}
        >
          {batch.processType}
        </span>
      </div>

      {/* Card Body - Compact */}
      <div className="text-xs space-y-1.5 text-gray-500">
        <div className="flex justify-between">
          <span>Weight</span>
          <span className="font-medium text-gray-900">
            {batch.parchmentWeightKg ? `${batch.parchmentWeightKg} kg` : "-"}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Moisture</span>
          <span className="font-medium text-gray-900">
            {batch.moistureContent ? `${batch.moistureContent}%` : "-"}
          </span>
        </div>
        {batch.processNotes && (
          <div className="flex justify-between">
            <span>Notes</span>
            <span
              className="font-medium text-gray-700 truncate max-w-[100px]"
              title={batch.processNotes}
            >
              {batch.processNotes.substring(0, 15)}...
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const KanbanColumn: React.FC<{
  title: string;
  batches: ProcessingBatch[];
  icon: React.ReactNode;
  color: string;
}> = ({ title, batches, icon, color }) => {
  const columnStyles = {
    "border-amber-400": {
      iconBg: "bg-amber-500",
      iconColor: "text-white",
      countColor: "text-amber-600",
    },
    "border-blue-400": {
      iconBg: "bg-blue-500",
      iconColor: "text-white",
      countColor: "text-blue-600",
    },
    "border-green-400": {
      iconBg: "bg-green-500",
      iconColor: "text-white",
      countColor: "text-green-600",
    },
  };
  const styles =
    columnStyles[color as keyof typeof columnStyles] ||
    columnStyles["border-amber-400"];

  return (
    <div className="bg-white rounded-2xl p-4 w-full flex flex-col border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-10 h-10 ${styles.iconBg} rounded-xl flex items-center justify-center shadow-md`}
          >
            <span className={styles.iconColor}>{icon}</span>
          </div>
          <div>
            <h3 className="font-semibold text-base text-gray-900">{title}</h3>
            <p className={`text-sm ${styles.countColor}`}>
              {batches.length} {batches.length === 1 ? "batch" : "batches"}
            </p>
          </div>
        </div>
      </div>
      <div
        className="flex-grow overflow-y-auto pr-2 custom-scrollbar"
        style={{ maxHeight: "500px" }}
      >
        {batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors">
            <PackageCheck className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium text-gray-500">
              No completed batches yet
            </p>
          </div>
        ) : (
          batches.map((batch) => <KanbanCard key={batch.id} batch={batch} />)
        )}
      </div>
    </div>
  );
};

interface ProcessorWorkbenchProps {
  currentUser: User;
}

const ProcessorWorkbench: React.FC<ProcessorWorkbenchProps> = ({
  currentUser,
}) => {
  const { data, setData, refreshData } = useDataContext();
  const { addToast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const isAdmin = currentUser.roles?.includes(UserRole.Admin);
  const greenBeanStockRef = useRef<HTMLDivElement>(null);

  // Modal States
  const [modal, setModal] = useState<string | null>(null);
  const [selectedParchment, setSelectedParchment] =
    useState<ParchmentLot | null>(null);
  const [selectedHarvestLot, setSelectedHarvestLot] =
    useState<HarvestLot | null>(null);
  const [selectedGreenBean, setSelectedGreenBean] =
    useState<GreenBeanLot | null>(null);
  const [selectedGreenBeanForHistory, setSelectedGreenBeanForHistory] =
    useState<GreenBeanLot | null>(null);
  const [scoringLot, setScoringLot] = useState<GreenBeanLot | null>(null);

  // Form States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Customer Management State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  // Withdraw Stock Modal State
  const [withdrawalType, setWithdrawalType] = useState<
    "Sale" | "Roasting Stock" | "Sample" | "Export" | "Other"
  >("Sample");
  const [withdrawalSalePrice, setWithdrawalSalePrice] = useState("");
  const [withdrawalCurrency, setWithdrawalCurrency] = useState("THB");
  const [withdrawalCustomerId, setWithdrawalCustomerId] = useState<string>("");
  const [withdrawalCustomerName, setWithdrawalCustomerName] = useState("");
  const [withdrawalDeliveryAddress, setWithdrawalDeliveryAddress] =
    useState("");

  // Edit Withdrawal Modal State
  const [editingWithdrawalIndex, setEditingWithdrawalIndex] = useState<
    number | null
  >(null);
  const [editingWithdrawalLotId, setEditingWithdrawalLotId] = useState<
    string | null
  >(null);

  // Score Modal State
  const [scoringMode, setScoringMode] = useState<"simple" | "detailed">(
    "simple",
  );
  const [simpleQcScore, setSimpleQcScore] = useState("");
  const [notes, setNotes] = useState("");
  const [sensoryScores, setSensoryScores] =
    useState<Record<string, ScoreInput>>(initialSensoryScores);
  const [cupScores, setCupScores] =
    useState<Record<string, number>>(initialCupScores);
  const [defects, setDefects] = useState({ numCups: "0", intensity: 2 });
  // Invoice viewing state
  const [invoiceView, setInvoiceView] = useState<{
    lot: GreenBeanLot;
    entryIndex: number;
  } | null>(null);

  // Table Control States
  const [parchmentSearch, setParchmentSearch] = useState("");
  const [parchmentSortConfig, setParchmentSortConfig] = useState<{
    key: ParchmentSortKeys;
    direction: SortDirection;
  }>({ key: "id", direction: "desc" });
  const [parchmentCurrentPage, setParchmentCurrentPage] = useState(1);
  const [parchmentStatusFilter, setParchmentStatusFilter] =
    useState<string>("all");
  const [parchmentProcessFilter, setParchmentProcessFilter] =
    useState<string>("all");

  const [greenBeanSearch, setGreenBeanSearch] = useState("");
  const [greenBeanSortConfig, setGreenBeanSortConfig] = useState<{
    key: GreenBeanSortKeys;
    direction: SortDirection;
  }>({ key: "id", direction: "desc" });
  const [greenBeanCurrentPage, setGreenBeanCurrentPage] = useState(1);
  const [greenBeanStatusFilter, setGreenBeanStatusFilter] =
    useState<string>("InStock");
  const [greenBeanGradeFilter, setGreenBeanGradeFilter] =
    useState<string>("all");

  const [harvestLotSearch, setHarvestLotSearch] = useState("");
  const [harvestLotPage, setHarvestLotPage] = useState(1);
  const HARVEST_LOT_PAGE_SIZE = 5;

  const [completedBatchSearch, setCompletedBatchSearch] = useState("");
  const [completedBatchPage, setCompletedBatchPage] = useState(1);
  const COMPLETED_BATCH_PAGE_SIZE = 5;

  // Card View pagination state
  const [harvestCardPage, setHarvestCardPage] = useState(1);
  const [completedCardPage, setCompletedCardPage] = useState(1);
  const CARD_PAGE_SIZE = 3;

  // Use the currently logged-in user for QC scoring
  const processorUser = currentUser;

  // (Removed) Top-of-workbench stat tiles were deprecated; relying on detailed sections below.

  // Get process types for dropdown with safe mock baseline
  const processTypeOptions = useMemo(() => {
    const BASE_OPTIONS = [
      { value: "Washed", label: "Washed Process" },
      { value: "Natural", label: "Natural Process" },
      { value: "Honey", label: "Honey Process" },
    ];

    const activeTypes = data.processTypes.filter((pt) => pt.isActive);
    let options = activeTypes.map((pt) => ({
      value: pt.name,
      label: `${pt.name} Process`,
    }));

    // If nothing is active/loaded yet, use the mock baseline
    if (options.length === 0) return BASE_OPTIONS;

    // Ensure the three defaults are always present (mock safety net)
    const existing = new Set(options.map((o) => o.value.toLowerCase()));
    BASE_OPTIONS.forEach((base) => {
      if (!existing.has(base.value.toLowerCase())) {
        options.push(base);
      }
    });

    return options;
  }, [data.processTypes]);

  // Hull & Grade Modal State
  const [gradedLots, setGradedLots] = useState<
    { grade: string; weight: string; price: string; score: string }[]
  >([{ grade: "Grade A", weight: "", price: "", score: "" }]);
  const [totalGreenWeight, setTotalGreenWeight] = useState("");

  // Auto-calculate total green weight from graded lots
  useEffect(() => {
    const total = gradedLots.reduce((sum, lot) => {
      const weight = parseFloat(lot.weight) || 0;
      return sum + weight;
    }, 0);
    if (total > 0) {
      setTotalGreenWeight(total.toFixed(2));
    } else {
      setTotalGreenWeight("");
    }
  }, [gradedLots]);

  // Process Type Selection State - initialize with first active process type
  const [selectedProcessType, setSelectedProcessType] = useState<string>(() => {
    const activeTypes = data.processTypes.filter((pt) => pt.isActive);
    if (activeTypes.length > 0) {
      return activeTypes[0].name;
    }
    return "Washed"; // Default fallback
  });

  // Load customers on component mount
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        setCustomersLoading(true);
        const customersList = await getAllCustomers();
        setCustomers(customersList);
      } catch (error) {
        console.error("Failed to load customers:", error);
        // Fallback to empty array - user can still type customer name manually
        setCustomers([]);
      } finally {
        setCustomersLoading(false);
      }
    };

    // Only load customers if user has access (Admin or Roaster)
    if (
      currentUser.roles?.includes(UserRole.Admin) ||
      currentUser.roles?.includes(UserRole.Roaster)
    ) {
      loadCustomers();
    }
  }, [currentUser.roles]);

  // Customer options for dropdown
  const customerOptions = useMemo(() => {
    return customers.map((customer) => ({
      value: customer.id,
      label: `${customer.name} (${customer.type})`,
    }));
  }, [customers]);

  // Handle customer selection - auto-fill name and address
  const handleCustomerSelect = (customerId: string) => {
    setWithdrawalCustomerId(customerId);
    const selectedCustomer = customers.find((c) => c.id === customerId);
    if (selectedCustomer) {
      setWithdrawalCustomerName(selectedCustomer.name);
      if (selectedCustomer.address) {
        setWithdrawalDeliveryAddress(selectedCustomer.address);
      }
    } else {
      setWithdrawalCustomerName("");
      setWithdrawalDeliveryAddress("");
    }
  };

  // Update selectedProcessType when processTypeOptions changes (ensures it's always valid)
  useEffect(() => {
    if (processTypeOptions.length > 0) {
      const isCurrentValid = processTypeOptions.some(
        (opt) => opt.value === selectedProcessType,
      );
      if (!isCurrentValid) {
        setSelectedProcessType(processTypeOptions[0].value);
      }
    }
  }, [processTypeOptions, selectedProcessType]);

  // Crop Year Selection State
  const [cropYearId, setCropYearId] = useState<string>("");

  // Date States for Complete Batch Modal
  const [dryingStartDate, setDryingStartDate] = useState("");
  const [dryingEndDate, setDryingEndDate] = useState("");

  const gradedWeightSum = useMemo(() => {
    return gradedLots.reduce(
      (sum, lot) => sum + (parseFloat(lot.weight) || 0),
      0,
    );
  }, [gradedLots]);

  const resetAllScoreForms = useCallback(() => {
    setSimpleQcScore("");
    setNotes("");
    setSensoryScores(initialSensoryScores);
    setCupScores(initialCupScores);
    setDefects({ numCups: "0", intensity: 2 });
    setScoringMode("simple");
  }, []);

  useEffect(() => {
    if (scoringLot && processorUser) {
      const qcSessionId = `CS-QC-${processorUser.id}`;
      const qcSession = data.cuppingSessions.find((s) => s.id === qcSessionId);
      if (qcSession) {
        const sampleInSession = qcSession.samples.find(
          (s) => s.greenBeanLotId === scoringLot.id,
        );
        if (sampleInSession) {
          const scoreEntry = (qcSession.scores[sampleInSession.id] || []).find(
            (s) => s.judgeId === processorUser.id,
          );
          if (scoreEntry) {
            setNotes(scoreEntry.notes);
            // Check if it's a detailed score
            if (Object.keys(scoreEntry.scores).length > 1) {
              setScoringMode("detailed");
              const newSensoryScores = { ...initialSensoryScores };
              SCA_SENSORY_ATTRIBUTES.forEach((attr) => {
                if (scoreEntry.scores[attr] !== undefined) {
                  newSensoryScores[attr] = {
                    value: scoreEntry.scores[attr].toFixed(2),
                    error: null,
                  };
                }
              });
              setSensoryScores(newSensoryScores);

              const newCupScores = { ...initialCupScores };
              SCA_CUP_ATTRIBUTES.forEach((attr) => {
                if (scoreEntry.scores[attr] !== undefined) {
                  newCupScores[attr] = scoreEntry.scores[attr] / 2;
                }
              });
              setCupScores(newCupScores);
              // Note: Defects are not saved in the score object, so they reset. This is a simplification.
            } else {
              // It's a simple score
              setScoringMode("simple");
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
    const cupsTotal = SCA_CUP_ATTRIBUTES.reduce(
      (sum, attr) => sum + cupScores[attr] * 2,
      0,
    );
    const subtotal = sensoryTotal + cupsTotal;
    const defectCups = parseInt(defects.numCups, 10);
    const defectsTotal =
      isNaN(defectCups) || defectCups < 0 ? 0 : defectCups * defects.intensity;
    const finalScore = subtotal - defectsTotal;
    return { subtotal, defectsTotal, finalScore };
  }, [sensoryScores, cupScores, defects]);

  const handleSaveScore = async () => {
    console.log("handleSaveScore called", { processorUser, scoringLot });

    if (!processorUser) {
      alert(
        "Error: No processor user found. Please ensure you are logged in as a processor.",
      );
      return;
    }

    if (!scoringLot) {
      alert("Error: No scoring lot selected.");
      return;
    }

    let totalScore: number;
    let scoresToSave: { [attribute: string]: number };

    if (scoringMode === "simple") {
      totalScore = parseFloat(simpleQcScore);
      if (isNaN(totalScore) || totalScore < 0 || totalScore > 100) {
        alert("Please enter a valid score between 0 and 100.");
        return;
      }
      scoresToSave = { Overall: totalScore };
    } else {
      // detailed mode
      let isValid = true;
      const tempSensoryScores = { ...sensoryScores };
      SCA_SENSORY_ATTRIBUTES.forEach((attr) => {
        const result = validateScore(tempSensoryScores[attr].value);
        tempSensoryScores[attr] = {
          ...tempSensoryScores[attr],
          error: result.error,
        };
        if (result.error) isValid = false;
      });
      setSensoryScores(tempSensoryScores);
      if (!isValid)
        return alert("Please correct the errors in the detailed scores.");

      totalScore = detailedCalculations.finalScore;
      scoresToSave = {};
      SCA_SENSORY_ATTRIBUTES.forEach((attr) => {
        scoresToSave[attr] = parseFloat(sensoryScores[attr].value);
      });
      SCA_CUP_ATTRIBUTES.forEach((attr) => {
        scoresToSave[attr] = cupScores[attr] * 2;
      });
    }

    setData((prev) => {
      const qcSessionId = `CS-QC-${processorUser.id}`;
      let qcSession = prev.cuppingSessions.find((s) => s.id === qcSessionId);
      let newSessions = [...prev.cuppingSessions];

      if (!qcSession) {
        qcSession = {
          id: qcSessionId,
          name: `${processorUser.name}'s Internal QC`,
          date: new Date().toISOString().substring(0, 10),
          type: CuppingSessionType.QC,
          samples: [],
          judges: [
            {
              id: processorUser.id,
              name: processorUser.name,
              role: UserRole.Processor,
            },
          ],
          scores: {},
          status: "Finalized",
        };
        newSessions.push(qcSession);
      } else {
        newSessions = newSessions.map((s) =>
          s.id === qcSessionId ? { ...s } : s,
        );
        qcSession = newSessions.find((s) => s.id === qcSessionId)!;
      }

      let sampleInSession = qcSession.samples.find(
        (s) => s.greenBeanLotId === scoringLot.id,
      );
      if (!sampleInSession) {
        const parchmentLot = prev.parchmentLots.find(
          (p) => p.id === scoringLot.parchmentLotId,
        );
        const harvestLot = prev.harvestLots.find(
          (h) => h.id === parchmentLot?.harvestLotId,
        );
        sampleInSession = {
          id: `S${qcSession.samples.length + 1}`,
          blindCode: scoringLot.id,
          greenBeanLotId: scoringLot.id,
          submitterInfo: { name: harvestLot?.farmerName || "N/A" },
          originInfo: { farm: harvestLot?.farmPlotLocation || "N/A" },
          lotInfo: { process: parchmentLot?.processType || "N/A" },
        };
        qcSession.samples.push(sampleInSession);
      }

      const newScoreEntry: JudgeScore = {
        judgeId: processorUser.id,
        judgeName: processorUser.name,
        scores: scoresToSave,
        notes: notes,
        totalScore,
      };

      const existingScores = qcSession.scores[sampleInSession.id] || [];
      const scoreIndex = existingScores.findIndex(
        (s) => s.judgeId === processorUser.id,
      );
      if (scoreIndex > -1) existingScores[scoreIndex] = newScoreEntry;
      else existingScores.push(newScoreEntry);
      qcSession.scores[sampleInSession.id] = existingScores;

      const updatedGreenBeanLots = prev.greenBeanLots.map((gbl) => {
        if (gbl.id === scoringLot.id) {
          const newCuppingScores = [...gbl.cuppingScores];
          const existingScoreIndex = newCuppingScores.findIndex(
            (cs) => cs.sessionId === qcSessionId,
          );
          if (existingScoreIndex > -1)
            newCuppingScores[existingScoreIndex] = {
              sessionId: qcSessionId,
              score: totalScore,
            };
          else
            newCuppingScores.push({
              sessionId: qcSessionId,
              score: totalScore,
            });
          // Update processorScore field for display in green bean stock
          return {
            ...gbl,
            cuppingScores: newCuppingScores,
            processorScore: totalScore,
          };
        }
        return gbl;
      });

      return {
        ...prev,
        cuppingSessions: newSessions,
        greenBeanLots: updatedGreenBeanLots,
      };
    });

    // Save processor score to backend
    try {
      await updateGreenBeanLotScore(scoringLot.id, totalScore);
      addToast({
        type: "success",
        message: `QC Score ${totalScore.toFixed(1)} saved successfully!`,
      });
    } catch (error) {
      console.error("Failed to save QC score to backend:", error);
      addToast({
        type: "error",
        message: "Score saved locally but failed to sync to server.",
      });
    }

    setScoringLot(null);
  };

  // Delete handlers for Admin
  const handleDeleteBatch = (batchId: string) => {
    if (
      window.confirm(
        "Are you sure you want to delete this processing batch? This will also delete related parchment and green bean lots.",
      )
    ) {
      setData((prev) => ({
        ...prev,
        processingBatches: prev.processingBatches.filter(
          (b) => b.id !== batchId,
        ),
        parchmentLots: prev.parchmentLots.filter(
          (p) => p.processingBatchId !== batchId,
        ),
        greenBeanLots: prev.greenBeanLots.filter((g) => {
          const parchment = prev.parchmentLots.find(
            (p) => p.id === g.parchmentLotId,
          );
          return parchment?.processingBatchId !== batchId;
        }),
      }));
    }
  };

  const handleDeleteParchmentLot = (lotId: string) => {
    if (
      window.confirm(
        "Are you sure you want to delete this parchment lot? This will also delete related green bean lots.",
      )
    ) {
      setData((prev) => ({
        ...prev,
        parchmentLots: prev.parchmentLots.filter((p) => p.id !== lotId),
        greenBeanLots: prev.greenBeanLots.filter(
          (g) => g.parchmentLotId !== lotId,
        ),
      }));
    }
  };

  const handleDeleteGreenBeanLot = (lotId: string) => {
    if (
      window.confirm("Are you sure you want to delete this green bean lot?")
    ) {
      setData((prev) => ({
        ...prev,
        greenBeanLots: prev.greenBeanLots.filter((g) => g.id !== lotId),
      }));
    }
  };

  const handleDeleteWithdrawal = (lotId: string, index: number) => {
    const lot = data.greenBeanLots.find((g) => g.id === lotId);
    const withdrawal = lot?.withdrawalHistory?.[index];
    if (!withdrawal) return;

    if (
      window.confirm(
        `Are you sure you want to delete this withdrawal entry?\n\nAmount: ${withdrawal.amountKg} kg\nType: ${withdrawal.withdrawalType}\nDate: ${withdrawal.date}\n\nNote: The withdrawn amount (${withdrawal.amountKg} kg) will be returned to current stock.`,
      )
    ) {
      setData((prev) => ({
        ...prev,
        greenBeanLots: prev.greenBeanLots.map((gbl) => {
          if (gbl.id !== lotId) return gbl;
          const newHistory = [...(gbl.withdrawalHistory || [])];
          const deletedEntry = newHistory.splice(index, 1)[0];
          return {
            ...gbl,
            currentWeightKg: gbl.currentWeightKg + deletedEntry.amountKg, // Return stock
            withdrawalHistory: newHistory,
          };
        }),
      }));
    }
  };

  const handleEditWithdrawal = (lotId: string, index: number) => {
    const lot = data.greenBeanLots.find((g) => g.id === lotId);
    const withdrawal = lot?.withdrawalHistory?.[index];
    if (!withdrawal) return;

    // Populate edit form with existing values
    setEditingWithdrawalLotId(lotId);
    setEditingWithdrawalIndex(index);
    setWithdrawalType(withdrawal.withdrawalType);
    setWithdrawalSalePrice(withdrawal.salePrice?.toString() || "");
    setWithdrawalCurrency(withdrawal.currency || "THB");
    // Try to find customer by name
    const matchingCustomer = customers.find(
      (c) => c.name === withdrawal.customerName,
    );
    setWithdrawalCustomerId(matchingCustomer?.id || "");
    setWithdrawalCustomerName(withdrawal.customerName || "");
    setWithdrawalDeliveryAddress(withdrawal.deliveryAddress || "");
    setModal("editWithdrawal");
  };

  const handleSaveEditWithdrawal = (formData: FormData) => {
    if (editingWithdrawalLotId === null || editingWithdrawalIndex === null)
      return;

    const notes = (formData.get("notes") as string) || "";

    setData((prev) => ({
      ...prev,
      greenBeanLots: prev.greenBeanLots.map((gbl) => {
        if (gbl.id !== editingWithdrawalLotId) return gbl;
        const newHistory = [...(gbl.withdrawalHistory || [])];
        const existing = newHistory[editingWithdrawalIndex];

        // Update only editable fields (not amount!)
        newHistory[editingWithdrawalIndex] = {
          ...existing,
          withdrawalType,
          notes,
          ...(withdrawalType === "Sale" && {
            salePrice: withdrawalSalePrice
              ? parseFloat(withdrawalSalePrice)
              : undefined,
            currency: withdrawalCurrency,
            customerName: withdrawalCustomerName || undefined,
            deliveryAddress: withdrawalDeliveryAddress || undefined,
            totalAmount: withdrawalSalePrice
              ? existing.amountKg * parseFloat(withdrawalSalePrice)
              : existing.totalAmount,
          }),
          // Clear sale fields if type changed from Sale
          ...(withdrawalType !== "Sale" && {
            salePrice: undefined,
            currency: undefined,
            customerName: undefined,
            deliveryAddress: undefined,
            totalAmount: undefined,
          }),
        };

        return {
          ...gbl,
          withdrawalHistory: newHistory,
        };
      }),
    }));

    // Reset edit state
    setEditingWithdrawalLotId(null);
    setEditingWithdrawalIndex(null);
    setWithdrawalType("Sample");
    setWithdrawalSalePrice("");
    setWithdrawalCurrency("THB");
    setWithdrawalCustomerName("");
    setWithdrawalDeliveryAddress("");
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
      case "startProcessing":
        if (!selectedHarvestLot) {
          setFormError("Please select a harvest lot");
          return;
        }

        const processType = formData.get("processType") as string;
        if (!processType || processType.trim() === "") {
          setFormError("Please select a process type");
          return;
        }

        const processNotes =
          (formData.get("processNotes") as string) || undefined;

        // Validate parchment data
        const parchmentWeightKg = parseFloat(
          formData.get("parchmentWeightKg") as string,
        );
        const moistureContent = parseFloat(
          formData.get("moistureContent") as string,
        );

        if (isNaN(parchmentWeightKg) || parchmentWeightKg <= 0) {
          setFormError(
            "Please enter a valid parchment weight in kg (greater than 0).",
          );
          return;
        }

        // Validate against remaining weight in harvest lot
        const availableWeight =
          selectedHarvestLot.remainingWeightKg ?? selectedHarvestLot.weightKg;

        console.log("Validation check:", {
          parchmentWeightKg,
          availableWeight,
          remainingWeightKg: selectedHarvestLot.remainingWeightKg,
          originalWeightKg: selectedHarvestLot.weightKg,
        });

        if (parchmentWeightKg > availableWeight) {
          setFormError(
            `Parchment weight (${parchmentWeightKg} kg) cannot exceed available harvest lot weight (${availableWeight.toFixed(2)} kg).`,
          );
          return;
        }
        if (
          isNaN(moistureContent) ||
          moistureContent < 0 ||
          moistureContent > 100
        ) {
          setFormError(
            "Please enter a valid coffee moisture between 0 and 100%.",
          );
          return;
        }

        if (!dryingStartDate || !dryingEndDate) {
          setFormError("Please select both drying start and end dates.");
          return;
        }

        if (new Date(dryingEndDate) < new Date(dryingStartDate)) {
          setFormError("Drying End Date cannot be before Drying Start Date.");
          return;
        }

        setIsSubmitting(true);
        try {
          // Create processing batch via API with status Completed
          const batchPayload = {
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
          };

          console.log("Creating processing batch with payload:", batchPayload);

          await addProcessingBatch(batchPayload);

          console.log("Processing batch created successfully!");

          // Refresh data from backend to get the updated batch and parchment lot
          await refreshData();

          console.log("Data refreshed successfully!");

          // Update selected harvest lot with fresh data from context
          // Note: After refreshData(), the context will be updated automatically
          // We just need to close the modal and the table will show updated data

          // Show success toast
          addToast({
            type: "success",
            message: "สร้าง Processing Batch สำเร็จ!",
          });

          // Close modal and reset form on success
          setModal(null);
          setSelectedHarvestLot(null);
          setCropYearId("");
          setDryingStartDate("");
          setDryingEndDate("");
          setFormError(null);
        } catch (error: any) {
          console.error("Failed to create processing batch:", error);
          const errorMessage =
            error?.response?.data?.error ||
            error?.message ||
            "Failed to create processing batch. Please try again.";
          setFormError(errorMessage);
        } finally {
          setIsSubmitting(false);
        }
        break;

      case "hullAndGrade":
        if (!selectedParchment) return;
        const greenWeight = parseFloat(totalGreenWeight);
        if (isNaN(greenWeight) || greenWeight <= 0) {
          setFormError("Please enter weights for the graded lots.");
          return;
        }
        // Validation: Total Green Bean Weight must not exceed Parchment Weight
        if (greenWeight > selectedParchment.currentWeightKg) {
          setFormError(
            `Total Green Bean Weight (${greenWeight.toFixed(2)} kg) ไม่สามารถเกิน Parchment Weight (${selectedParchment.currentWeightKg.toFixed(2)} kg)`,
          );
          return;
        }
        if (Math.abs(gradedWeightSum - greenWeight) > 0.01) {
          setFormError(
            "The sum of the weights for the graded lots must exactly match the total green bean weight.",
          );
          return;
        }

        setIsSubmitting(true);
        try {
          // Create green bean lots via API and collect created lot info
          const createdLots: { id: string; grade: string }[] = [];
          for (const gl of gradedLots) {
            const weight = parseFloat(gl.weight);
            if (isNaN(weight) || weight <= 0) continue;
            const score = gl.score ? parseFloat(gl.score) : undefined;
            const price = gl.price ? parseFloat(gl.price) : undefined;

            const createdLot = await createGreenBeanLot({
              sourceType: "Internal",
              parchmentLotId: selectedParchment.id,
              grade: gl.grade,
              initialWeightKg: weight,
              currentWeightKg: weight,
              availabilityStatus: "Available",
              processorScore: score,
              pricePerKg: price,
              currency: price !== undefined ? "THB" : undefined,
            });

            if (createdLot?.id) {
              createdLots.push({ id: createdLot.id, grade: gl.grade });
            }
          }

          // Calculate remaining parchment weight
          // Direct 1:1 subtraction: if you hull 20 kg, subtract 20 kg from parchment
          const currentParchmentWeight =
            selectedParchment.currentWeightKg ||
            selectedParchment.initialWeightKg;
          const remainingWeight = Math.max(
            0,
            currentParchmentWeight - greenWeight,
          );

          // Update parchment lot status based on remaining weight
          // If remaining_weight > 0 → status = Awaiting Hulling
          // If remaining_weight == 0 → status = Hulled
          const newStatus: "Awaiting Hulling" | "Hulled" =
            remainingWeight > 0 ? "Awaiting Hulling" : "Hulled";
          await updateParchmentLot(selectedParchment.id, {
            status: newStatus,
            currentWeightKg: Math.round(remainingWeight * 100) / 100,
          });

          // Refresh data from backend
          await refreshData();

          // Show finished toast
          addToast({
            type: "success",
            message: "Hull and Grade Finished!",
          });

          // Close modal and reset form
          setModal(null);
          setSelectedParchment(null);
          setTotalGreenWeight("");
          setGradedLots([
            { grade: "Grade A", weight: "", price: "", score: "" },
          ]);
          setFormError(null);

          // Scroll to Green Bean Stock section
          setTimeout(() => {
            greenBeanStockRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }, 100);
        } catch (error: any) {
          console.error("Failed to hull and grade:", error);
          addToast({
            type: "error",
            message: "Failed to update parchment lot status. Please try again.",
          });
          setFormError(error?.message || "Failed to save. Please try again.");
          // Don't close modal on error so user can retry
        } finally {
          setIsSubmitting(false);
        }
        break;

      case "withdrawStock":
        if (!selectedGreenBean) return;
        const amountKg = parseFloat(formData.get("amountKg") as string);
        const purpose = (formData.get("purpose") as string) || "";

        setData((prev) => ({
          ...prev,
          greenBeanLots: prev.greenBeanLots.map((gbl) => {
            if (gbl.id !== selectedGreenBean.id) return gbl;

            // Generate invoice number for Sale type
            const invoiceNumber =
              withdrawalType === "Sale"
                ? (() => {
                    const year = new Date().getFullYear();
                    const allWithdrawals = prev.greenBeanLots.flatMap(
                      (g) => g.withdrawalHistory || [],
                    );
                    const invoicesThisYear = allWithdrawals.filter((w) =>
                      w.invoiceNumber?.startsWith(`INV-${year}-`),
                    );
                    const nextNum = invoicesThisYear.length + 1;
                    return `INV-${year}-${String(nextNum).padStart(3, "0")}`;
                  })()
                : undefined;

            // Calculate total amount for Sale type
            const salePrice = withdrawalSalePrice
              ? parseFloat(withdrawalSalePrice)
              : 0;
            const totalAmount =
              withdrawalType === "Sale" && salePrice > 0
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
              ...(withdrawalType === "Sale" && {
                salePrice: salePrice || undefined,
                currency: withdrawalCurrency,
                customerName: withdrawalCustomerName || undefined,
                deliveryAddress: withdrawalDeliveryAddress || undefined,
                invoiceNumber,
                totalAmount,
              }),
            };
            return {
              ...gbl,
              currentWeightKg: gbl.currentWeightKg - amountKg,
              withdrawalHistory: [...(gbl.withdrawalHistory || []), withdrawal],
            };
          }),
        }));
        // Show success toast
        addToast({
          type: "success",
          message: `Withdraw ${amountKg} kg สำเร็จ!`,
        });
        // Reset withdrawal form state
        setWithdrawalType("Sample");
        setWithdrawalSalePrice("");
        setWithdrawalCurrency("THB");
        setWithdrawalCustomerId("");
        setWithdrawalCustomerName("");
        setWithdrawalDeliveryAddress("");
        break;

      case "editWithdrawal":
        handleSaveEditWithdrawal(formData);
        break;
    }
    setModal(null);
  };

  const openModal = (type: string, item: any) => {
    if (type === "startProcessing") {
      setSelectedHarvestLot(item);
      // Auto-select crop year from harvest lot if available
      if (item?.cropYearId) {
        setCropYearId(item.cropYearId);
      } else {
        setCropYearId("");
      }
    }
    if (type === "hullAndGrade") setSelectedParchment(item);
    if (type === "withdrawStock") setSelectedGreenBean(item);
    setModal(type);
  };

  const handleToggleAvailability = (lotId: string) => {
    setData((prev) => ({
      ...prev,
      greenBeanLots: prev.greenBeanLots.map((lot) =>
        lot.id === lotId
          ? {
              ...lot,
              availabilityStatus:
                lot.availabilityStatus === "Available"
                  ? "Withdrawn"
                  : "Available",
            }
          : lot,
      ),
    }));
  };

  // Only show lots that are ready for processing (not yet processed)
  const readyForProcessingLots = data.harvestLots.filter(
    (lot) => lot.status === "Ready for Processing",
  );

  const filteredHarvestLots = useMemo(() => {
    return readyForProcessingLots.filter(
      (lot) =>
        lot.id.toLowerCase().includes(harvestLotSearch.toLowerCase()) ||
        lot.cherryVariety
          .toLowerCase()
          .includes(harvestLotSearch.toLowerCase()),
    );
  }, [readyForProcessingLots, harvestLotSearch]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setHarvestLotPage(1);
  }, [harvestLotSearch]);

  // Paginated harvest lots (newest first)
  const harvestLotTotalPages = Math.ceil(
    filteredHarvestLots.length / HARVEST_LOT_PAGE_SIZE,
  );
  const paginatedHarvestLots = useMemo(() => {
    const sorted = [...filteredHarvestLots].sort(
      (a, b) =>
        new Date(b.harvestDate || 0).getTime() -
        new Date(a.harvestDate || 0).getTime(),
    );
    const startIndex = (harvestLotPage - 1) * HARVEST_LOT_PAGE_SIZE;
    return sorted.slice(startIndex, startIndex + HARVEST_LOT_PAGE_SIZE);
  }, [filteredHarvestLots, harvestLotPage]);

  // Card View pagination for Incoming Harvest Lots
  const harvestCardTotalPages = Math.ceil(
    readyForProcessingLots.length / CARD_PAGE_SIZE,
  );
  const paginatedHarvestCards = useMemo(() => {
    const startIndex = (harvestCardPage - 1) * CARD_PAGE_SIZE;
    return readyForProcessingLots.slice(
      startIndex,
      startIndex + CARD_PAGE_SIZE,
    );
  }, [readyForProcessingLots, harvestCardPage]);

  // Card View pagination for Completed Batches
  const completedBatchesForCard = useMemo(
    () =>
      data.processingBatches.filter(
        (b) => b.status === ProcessingBatchStatus.Completed,
      ),
    [data.processingBatches],
  );
  const completedCardTotalPages = Math.ceil(
    completedBatchesForCard.length / CARD_PAGE_SIZE,
  );
  const paginatedCompletedCards = useMemo(() => {
    const startIndex = (completedCardPage - 1) * CARD_PAGE_SIZE;
    return completedBatchesForCard.slice(
      startIndex,
      startIndex + CARD_PAGE_SIZE,
    );
  }, [completedBatchesForCard, completedCardPage]);

  const TableView = () => (
    <div className="space-y-4">
      {/* Processing Summary - Compact */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-sky-600 uppercase">
                Completed
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {
                  data.processingBatches.filter(
                    (b) => b.status === ProcessingBatchStatus.Completed,
                  ).length
                }
              </p>
            </div>
            <div className="p-2 bg-sky-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-sky-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase">
                Parchment
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.parchmentLots.length}
              </p>
            </div>
            <div className="p-2 bg-amber-50 rounded-lg">
              <Box className="h-5 w-5 text-amber-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-teal-600 uppercase">
                Green Bean
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.greenBeanLots.length}
              </p>
            </div>
            <div className="p-2 bg-teal-50 rounded-lg">
              <Coffee className="h-5 w-5 text-teal-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase">
                Ready
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {readyForProcessingLots.length}
              </p>
            </div>
            <div className="p-2 bg-green-50 rounded-lg">
              <Sprout className="h-5 w-5 text-green-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Incoming Harvest Lots Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        {/* Header with search */}
        <div className="px-4 py-3 bg-green-50 border-b border-green-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-600 rounded-lg">
              <Sprout className="h-4 w-4 text-white" />
            </div>
            <h3 className="text-base font-bold text-gray-900">
              Incoming Harvest Lots
            </h3>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search lots..."
              value={harvestLotSearch}
              onChange={(e) => setHarvestLotSearch(e.target.value)}
              className="pl-9 w-full border border-green-200 bg-white rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-green-300 focus:border-green-300 outline-none"
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
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredHarvestLots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    <Coffee className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">
                      No harvest lots available
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedHarvestLots.map((lot) => (
                  <tr
                    key={lot.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {formatHarvestLotId(lot)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {lot.cherryVariety}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-green-600">
                      {lot.remainingWeightKg !== undefined &&
                      lot.remainingWeightKg !== lot.weightKg
                        ? `${lot.remainingWeightKg.toFixed(2)} kg (of ${lot.weightKg} kg)`
                        : `${lot.weightKg} kg`}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {lot.farmerName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Ready
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => openModal("startProcessing", lot)}
                        className="p-2 rounded-lg text-white bg-sky-600 hover:bg-sky-700 shadow-md hover:shadow-lg transition-all"
                        title="Record Process"
                      >
                        <PlayCircle size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredHarvestLots.length > HARVEST_LOT_PAGE_SIZE && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-center">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setHarvestLotPage((p) => Math.max(1, p - 1))}
                disabled={harvestLotPage === 1}
                className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {(() => {
                const TOTAL_SLOTS = 7;
                const tp = harvestLotTotalPages;
                const cp = harvestLotPage;
                let slots: (number | "ellipsis")[] = [];
                if (tp <= TOTAL_SLOTS) {
                  slots = Array.from({ length: tp }, (_, i) => i + 1);
                } else if (cp <= 4) {
                  slots = [1, 2, 3, 4, 5, "ellipsis", tp];
                } else if (cp >= tp - 3) {
                  slots = [1, "ellipsis", tp - 4, tp - 3, tp - 2, tp - 1, tp];
                } else {
                  slots = [1, "ellipsis", cp - 1, cp, cp + 1, "ellipsis", tp];
                }
                return slots.map((slot, idx) =>
                  slot === "ellipsis" ? (
                    <span
                      key={`e-${idx}`}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={slot}
                      onClick={() => setHarvestLotPage(slot)}
                      className={`w-8 h-8 text-sm font-medium rounded-md transition-colors flex items-center justify-center ${cp === slot ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
                    >
                      {slot}
                    </button>
                  ),
                );
              })()}
              <button
                onClick={() =>
                  setHarvestLotPage((p) =>
                    Math.min(harvestLotTotalPages, p + 1),
                  )
                }
                disabled={harvestLotPage === harvestLotTotalPages}
                className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Completed Batches Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <div className="p-4 bg-sky-50 border-b border-sky-200">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2 bg-sky-600 rounded-lg">
              <PackageCheck className="h-5 w-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              Completed Batches
            </h3>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search batches..."
              value={completedBatchSearch}
              onChange={(e) => {
                setCompletedBatchSearch(e.target.value);
                setCompletedBatchPage(1);
              }}
              className="pl-10 w-full border border-sky-200 bg-white rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-sky-300 focus:border-sky-300 outline-none"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-900">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Batch ID
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Harvest Lot
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Process
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Notes
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Drying Duration
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {(() => {
                const filteredBatches = data.processingBatches
                  .filter((b) => b.status === ProcessingBatchStatus.Completed)
                  .filter(
                    (b) =>
                      b.id
                        .toLowerCase()
                        .includes(completedBatchSearch.toLowerCase()) ||
                      b.harvestLotId
                        .toLowerCase()
                        .includes(completedBatchSearch.toLowerCase()) ||
                      b.processType
                        .toLowerCase()
                        .includes(completedBatchSearch.toLowerCase()) ||
                      (b.processNotes || "")
                        .toLowerCase()
                        .includes(completedBatchSearch.toLowerCase()),
                  );
                const totalPages = Math.ceil(
                  filteredBatches.length / COMPLETED_BATCH_PAGE_SIZE,
                );
                const paginatedBatches = filteredBatches.slice(
                  (completedBatchPage - 1) * COMPLETED_BATCH_PAGE_SIZE,
                  completedBatchPage * COMPLETED_BATCH_PAGE_SIZE,
                );
                return paginatedBatches.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-8 text-center text-gray-400"
                    >
                      <PackageCheck className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">
                        No completed batches found
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedBatches.map((batch) => {
                    const duration =
                      batch.dryingStartDate && batch.dryingEndDate
                        ? `${Math.max(1, Math.round((new Date(batch.dryingEndDate).getTime() - new Date(batch.dryingStartDate).getTime()) / (1000 * 3600 * 24)))} days`
                        : "N/A";
                    return (
                      <tr
                        key={batch.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {formatProcessingBatchId(batch)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          #{batch.harvestLotId.substring(0, 6).toUpperCase()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              batch.processType === "Washed"
                                ? "bg-sky-50 text-sky-700"
                                : batch.processType === "Natural"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-yellow-50 text-yellow-700"
                            }`}
                          >
                            {batch.processType}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap max-w-xs">
                          <span
                            className="text-sm text-gray-700 truncate block"
                            title={batch.processNotes || ""}
                          >
                            {batch.processNotes || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-700">
                            {duration}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                );
              })()}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {(() => {
          const filteredBatches = data.processingBatches
            .filter((b) => b.status === ProcessingBatchStatus.Completed)
            .filter(
              (b) =>
                b.id
                  .toLowerCase()
                  .includes(completedBatchSearch.toLowerCase()) ||
                b.harvestLotId
                  .toLowerCase()
                  .includes(completedBatchSearch.toLowerCase()) ||
                b.processType
                  .toLowerCase()
                  .includes(completedBatchSearch.toLowerCase()) ||
                (b.processNotes || "")
                  .toLowerCase()
                  .includes(completedBatchSearch.toLowerCase()),
            );
          const totalPages = Math.ceil(
            filteredBatches.length / COMPLETED_BATCH_PAGE_SIZE,
          );
          if (totalPages <= 1) return null;
          const TOTAL_SLOTS = 7;
          const tp = totalPages;
          const cp = completedBatchPage;
          let slots: (number | "ellipsis")[] = [];
          if (tp <= TOTAL_SLOTS) {
            slots = Array.from({ length: tp }, (_, i) => i + 1);
          } else if (cp <= 4) {
            slots = [1, 2, 3, 4, 5, "ellipsis", tp];
          } else if (cp >= tp - 3) {
            slots = [1, "ellipsis", tp - 4, tp - 3, tp - 2, tp - 1, tp];
          } else {
            slots = [1, "ellipsis", cp - 1, cp, cp + 1, "ellipsis", tp];
          }
          return (
            <div className="flex justify-center items-center px-4 py-3 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setCompletedBatchPage((p) => Math.max(1, p - 1))
                  }
                  disabled={completedBatchPage === 1}
                  className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {slots.map((slot, idx) =>
                  slot === "ellipsis" ? (
                    <span
                      key={`e-${idx}`}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={slot}
                      onClick={() => setCompletedBatchPage(slot)}
                      className={`w-8 h-8 text-sm font-medium rounded-md transition-colors flex items-center justify-center ${cp === slot ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
                    >
                      {slot}
                    </button>
                  ),
                )}
                <button
                  onClick={() =>
                    setCompletedBatchPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={completedBatchPage === totalPages}
                  className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Parchment Stock Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        {/* Header with search and filters */}
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500 rounded-lg">
                <Box className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                Parchment Stock
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[180px] max-w-[260px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={parchmentSearch}
                  onChange={(e) => {
                    setParchmentSearch(e.target.value);
                    setParchmentCurrentPage(1);
                  }}
                  className="pl-9 w-full border border-gray-200 bg-white rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-amber-200 focus:border-amber-300 outline-none transition-all"
                />
              </div>
              <div className="flex items-center gap-2">
                <Select
                  options={[
                    { value: "all", label: "All Status" },
                    { value: "AwaitingHulling", label: "Awaiting Hulling" },
                    { value: "Hulled", label: "Hulled" },
                  ]}
                  value={parchmentStatusFilter}
                  onChange={(v) => {
                    setParchmentStatusFilter(v as string);
                    setParchmentCurrentPage(1);
                  }}
                  placeholder="Status"
                  className="w-[175px]"
                />
                <Select
                  options={[
                    { value: "all", label: "All Process" },
                    { value: "Washed", label: "Washed" },
                    { value: "Natural", label: "Natural" },
                    { value: "Honey", label: "Honey" },
                  ]}
                  value={parchmentProcessFilter}
                  onChange={(v) => {
                    setParchmentProcessFilter(v as string);
                    setParchmentCurrentPage(1);
                  }}
                  placeholder="Process"
                  className="w-[135px]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-900">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Lot ID
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Batch ID
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Weight (kg)
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Moisture (%)
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Process
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {paginatedParchmentLots.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-8 text-center text-gray-400"
                  >
                    <Box className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">
                      No matching parchment lots found
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedParchmentLots.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {formatParchmentId(p)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      #{p.processingBatchId.substring(0, 6).toUpperCase()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {(p.status === "Hulled"
                        ? p.initialWeightKg
                        : p.currentWeightKg
                      ).toFixed(2)}{" "}
                      kg
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {p.moistureContent}%
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.processType === "Washed"
                            ? "bg-sky-50 text-sky-700"
                            : p.processType === "Natural"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-yellow-50 text-yellow-700"
                        }`}
                      >
                        {p.processType}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${p.status === "Hulled" ? "bg-gray-300" : "bg-green-500"}`}
                        ></span>
                        {formatParchmentStatus(p.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => openModal("hullAndGrade", p)}
                        disabled={
                          p.status === "Hulled" || p.currentWeightKg <= 0
                        }
                        className="p-2 rounded-lg text-white bg-sky-600 hover:bg-sky-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
                        title="Hull & Grade"
                      >
                        <PlayCircle size={18} />
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
      <div
        ref={greenBeanStockRef}
        className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200"
      >
        {/* Header with search and filters */}
        <div className="px-4 py-3 bg-teal-50 border-b border-teal-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-teal-600 rounded-lg">
                <Coffee className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                Green Bean Stock
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={greenBeanSearch}
                  onChange={(e) => {
                    setGreenBeanSearch(e.target.value);
                    setGreenBeanCurrentPage(1);
                  }}
                  className="pl-9 w-full border border-teal-200 bg-white rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-teal-300 focus:border-teal-300 outline-none"
                />
              </div>
              <Select
                options={[
                  { value: "all", label: "All" },
                  { value: "InStock", label: "In Stock" },
                  { value: "Depleted", label: "Depleted" },
                ]}
                value={greenBeanStatusFilter}
                onChange={(v) => {
                  setGreenBeanStatusFilter(v as string);
                  setGreenBeanCurrentPage(1);
                }}
                placeholder="Status"
                className="w-[130px]"
              />
              <Select
                options={[
                  { value: "all", label: "All Grades" },
                  { value: "Grade A", label: "Grade A" },
                  { value: "Grade B", label: "Grade B" },
                  { value: "Grade C", label: "Grade C" },
                  { value: "Peaberry", label: "Peaberry" },
                  { value: "Screen 18", label: "Screen 18" },
                  { value: "Screen 17", label: "Screen 17" },
                  { value: "Screen 16", label: "Screen 16" },
                  { value: "Screen 15", label: "Screen 15" },
                ]}
                value={greenBeanGradeFilter}
                onChange={(v) => {
                  setGreenBeanGradeFilter(v as string);
                  setGreenBeanCurrentPage(1);
                }}
                placeholder="Grade"
                className="w-[130px]"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-900">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Lot ID
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Grade
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Weight (kg)
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Price/kg
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Total Amount
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  QC Score
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Availability
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {paginatedGreenBeanLots.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-8 text-center text-gray-400"
                  >
                    <Coffee className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">
                      No matching green bean lots found
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedGreenBeanLots.map((g) => {
                  // Prioritize processor score over cupping scores
                  const displayScore = g.processorScore
                    ? g.processorScore.toFixed(1)
                    : g.cuppingScores?.length > 0
                      ? (
                          g.cuppingScores.reduce((sum, c) => sum + c.score, 0) /
                          g.cuppingScores.length
                        ).toFixed(1)
                      : null;
                  const scoreValue = g.processorScore
                    ? g.processorScore
                    : g.cuppingScores?.length > 0
                      ? g.cuppingScores.reduce((sum, c) => sum + c.score, 0) /
                        g.cuppingScores.length
                      : 0;

                  return (
                    <tr
                      key={g.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {formatGreenBeanId(g)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {g.grade}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {g.currentWeightKg.toFixed(2)} kg
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {g.pricePerKg ? (
                          <span className="text-teal-600">
                            {g.pricePerKg.toFixed(2)} {g.currency || "THB"}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900">
                        {g.pricePerKg ? (
                          <span className="text-teal-700">
                            {(g.pricePerKg * g.currentWeightKg).toFixed(2)}{" "}
                            {g.currency || "THB"}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {displayScore ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-gray-900">
                              {displayScore}
                            </span>
                            {scoreValue >= 80 && (
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${g.availabilityStatus === "Available" ? "bg-green-500" : "bg-gray-300"}`}
                          ></span>
                          {g.availabilityStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {g.withdrawalHistory &&
                            g.withdrawalHistory.length > 0 && (
                              <button
                                onClick={() =>
                                  setSelectedGreenBeanForHistory(g)
                                }
                                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
                                title="View Withdrawal History"
                              >
                                <History className="h-4 w-4" />
                              </button>
                            )}
                          <button
                            onClick={() => setScoringLot(g)}
                            className="p-2 rounded-lg text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 transition-colors"
                            title="QC Score"
                          >
                            <ClipboardCheck size={16} />
                          </button>
                          <button
                            onClick={() => openModal("withdrawStock", g)}
                            disabled={g.availabilityStatus === "Withdrawn"}
                            className="p-2 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                            title="Withdraw"
                          >
                            <Download size={16} />
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
      {/* Processing Summary Bar - Compact */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-sky-600 uppercase">
                Completed
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {
                  data.processingBatches.filter(
                    (b) => b.status === ProcessingBatchStatus.Completed,
                  ).length
                }
              </p>
            </div>
            <div className="p-2 bg-sky-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-sky-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase">
                Parchment
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.parchmentLots.length}
              </p>
            </div>
            <div className="p-2 bg-amber-50 rounded-lg">
              <Box className="h-5 w-5 text-amber-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-teal-600 uppercase">
                Green Bean
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.greenBeanLots.length}
              </p>
            </div>
            <div className="p-2 bg-teal-50 rounded-lg">
              <Coffee className="h-5 w-5 text-teal-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase">
                Ready
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {readyForProcessingLots.length}
              </p>
            </div>
            <div className="p-2 bg-green-50 rounded-lg">
              <Sprout className="h-5 w-5 text-green-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Incoming Lots + Completed Batches */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Incoming Harvest Lots */}
        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200 flex flex-col">
          <div className="p-3 bg-green-50 border-b border-green-200">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-green-600 rounded-md">
                <Sprout className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">
                Incoming Harvest Lots
              </h3>
              <span className="ml-auto text-xs text-green-600 font-semibold">
                {readyForProcessingLots.length}
              </span>
            </div>
          </div>
          <div className="p-3 h-[400px] overflow-y-auto">
            {readyForProcessingLots.length > 0 ? (
              <div className="space-y-2">
                {paginatedHarvestCards.map((lot) => (
                  <div
                    key={lot.id}
                    className="bg-white border-l-4 border-l-green-500 rounded-lg p-3 border border-gray-200 hover:shadow-md transition-all"
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatHarvestLotId(lot)}
                      </p>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        Ready
                      </span>
                    </div>

                    {/* Card Body - Compact */}
                    <div className="text-xs space-y-1.5 text-gray-500 mb-3">
                      <div className="flex justify-between">
                        <span>Variety</span>
                        <span className="font-medium text-gray-900">
                          {lot.cherryVariety}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Weight</span>
                        <span className="font-medium text-green-600">
                          {lot.remainingWeightKg !== undefined &&
                          lot.remainingWeightKg !== lot.weightKg
                            ? `${lot.remainingWeightKg.toFixed(2)} kg (of ${lot.weightKg} kg)`
                            : `${lot.weightKg} kg`}
                        </span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => openModal("startProcessing", lot)}
                      className="w-full py-2 text-xs font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 shadow-md hover:shadow-lg transition-all inline-flex items-center justify-center gap-1.5"
                    >
                      <PlayCircle size={14} />
                      Record Process
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Coffee className="h-10 w-10 opacity-30 mb-2" />
                <p className="text-sm font-medium text-gray-500">
                  No harvest lots available
                </p>
              </div>
            )}
          </div>
          {/* Pagination */}
          {harvestCardTotalPages > 1 && (
            <div className="mt-auto flex justify-center items-center py-3 border-t border-gray-200">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setHarvestCardPage((p) => Math.max(1, p - 1))}
                  disabled={harvestCardPage === 1}
                  className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {(() => {
                  const TOTAL_SLOTS = 7;
                  const tp = harvestCardTotalPages;
                  const cp = harvestCardPage;
                  let slots: (number | "ellipsis")[] = [];
                  if (tp <= TOTAL_SLOTS) {
                    slots = Array.from({ length: tp }, (_, i) => i + 1);
                  } else if (cp <= 4) {
                    slots = [1, 2, 3, 4, 5, "ellipsis", tp];
                  } else if (cp >= tp - 3) {
                    slots = [1, "ellipsis", tp - 4, tp - 3, tp - 2, tp - 1, tp];
                  } else {
                    slots = [1, "ellipsis", cp - 1, cp, cp + 1, "ellipsis", tp];
                  }
                  return slots.map((slot, idx) =>
                    slot === "ellipsis" ? (
                      <span
                        key={`e-${idx}`}
                        className="w-7 h-7 flex items-center justify-center text-gray-400 text-xs"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={slot}
                        onClick={() => setHarvestCardPage(slot)}
                        className={`w-7 h-7 text-xs font-medium rounded-md transition-colors flex items-center justify-center ${cp === slot ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
                      >
                        {slot}
                      </button>
                    ),
                  );
                })()}
                <button
                  onClick={() =>
                    setHarvestCardPage((p) =>
                      Math.min(harvestCardTotalPages, p + 1),
                    )
                  }
                  disabled={harvestCardPage === harvestCardTotalPages}
                  className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Completed Batches */}
        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200 flex flex-col">
          <div className="p-3 bg-sky-50 border-b border-sky-200">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-sky-600 rounded-md">
                <PackageCheck className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">
                Completed Batches
              </h3>
              <span className="ml-auto text-xs text-sky-600 font-semibold">
                {completedBatchesForCard.length}
              </span>
            </div>
          </div>
          <div className="p-3 h-[400px] overflow-y-auto">
            {completedBatchesForCard.length > 0 ? (
              <div className="space-y-2">
                {paginatedCompletedCards.map((batch) => (
                  <KanbanCard key={batch.id} batch={batch} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-gray-400">
                <PackageCheck className="h-8 w-8 opacity-30 mb-2" />
                <p className="text-sm font-medium text-gray-500">
                  No completed batches yet
                </p>
              </div>
            )}
          </div>
          {/* Pagination */}
          {completedCardTotalPages > 1 && (
            <div className="mt-auto flex justify-center items-center py-3 border-t border-gray-200">
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setCompletedCardPage((p) => Math.max(1, p - 1))
                  }
                  disabled={completedCardPage === 1}
                  className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {(() => {
                  const TOTAL_SLOTS = 7;
                  const tp = completedCardTotalPages;
                  const cp = completedCardPage;
                  let slots: (number | "ellipsis")[] = [];
                  if (tp <= TOTAL_SLOTS) {
                    slots = Array.from({ length: tp }, (_, i) => i + 1);
                  } else if (cp <= 4) {
                    slots = [1, 2, 3, 4, 5, "ellipsis", tp];
                  } else if (cp >= tp - 3) {
                    slots = [1, "ellipsis", tp - 4, tp - 3, tp - 2, tp - 1, tp];
                  } else {
                    slots = [1, "ellipsis", cp - 1, cp, cp + 1, "ellipsis", tp];
                  }
                  return slots.map((slot, idx) =>
                    slot === "ellipsis" ? (
                      <span
                        key={`e-${idx}`}
                        className="w-7 h-7 flex items-center justify-center text-gray-400 text-xs"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={slot}
                        onClick={() => setCompletedCardPage(slot)}
                        className={`w-7 h-7 text-xs font-medium rounded-md transition-colors flex items-center justify-center ${cp === slot ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
                      >
                        {slot}
                      </button>
                    ),
                  );
                })()}
                <button
                  onClick={() =>
                    setCompletedCardPage((p) =>
                      Math.min(completedCardTotalPages, p + 1),
                    )
                  }
                  disabled={completedCardPage === completedCardTotalPages}
                  className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
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
  const SortableHeader = <T,>({
    column,
    label,
    sortConfig,
    requestSort,
  }: {
    column: T;
    label: string;
    sortConfig: { key: T; direction: SortDirection };
    requestSort: (key: T) => void;
  }) => (
    <th
      scope="col"
      className="px-6 py-4 text-left text-xs font-bold text-gray-900 uppercase tracking-wider"
    >
      <button
        onClick={() => requestSort(column)}
        className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
      >
        {label}
        {sortConfig.key === column &&
          (sortConfig.direction === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </th>
  );

  const Pagination = ({
    currentPage,
    totalPages,
    onPageChange,
  }: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  }) => {
    if (totalPages <= 1) return null;

    const TOTAL_SLOTS = 7; // Fixed number of slots to prevent layout shift

    // Generate fixed slots array
    const getSlots = (): (number | "ellipsis")[] => {
      if (totalPages <= TOTAL_SLOTS) {
        // If total pages fit, show all with empty slots filled
        return Array.from({ length: TOTAL_SLOTS }, (_, i) =>
          i < totalPages ? i + 1 : 0,
        ).filter((n) => n > 0) as number[];
      }

      // For many pages, use: [1] [...] [middle pages] [...] [last]
      const slots: (number | "ellipsis")[] = [];

      if (currentPage <= 4) {
        // Near start: 1 2 3 4 5 ... last
        slots.push(1, 2, 3, 4, 5, "ellipsis", totalPages);
      } else if (currentPage >= totalPages - 3) {
        // Near end: 1 ... last-4 last-3 last-2 last-1 last
        slots.push(
          1,
          "ellipsis",
          totalPages - 4,
          totalPages - 3,
          totalPages - 2,
          totalPages - 1,
          totalPages,
        );
      } else {
        // Middle: 1 ... current-1 current current+1 ... last
        slots.push(
          1,
          "ellipsis",
          currentPage - 1,
          currentPage,
          currentPage + 1,
          "ellipsis",
          totalPages,
        );
      }

      return slots;
    };

    const slots = getSlots();

    return (
      <div className="flex justify-center items-center px-4 py-2 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center gap-1">
          {/* Previous Button - Fixed width */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Page Slots - All fixed width */}
          {slots.map((slot, index) =>
            slot === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="w-8 h-8 flex items-center justify-center text-gray-400 text-xs"
              >
                ...
              </span>
            ) : (
              <button
                key={slot}
                onClick={() => onPageChange(slot)}
                className={`w-8 h-8 text-xs font-medium rounded-md transition-colors flex items-center justify-center ${
                  currentPage === slot
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {slot}
              </button>
            ),
          )}

          {/* Next Button - Fixed width */}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const processedParchmentLots = useMemo(() => {
    let filtered = data.parchmentLots.filter(
      (p) =>
        p.id.toLowerCase().includes(parchmentSearch.toLowerCase()) ||
        p.status.toLowerCase().includes(parchmentSearch.toLowerCase()),
    );

    // Apply status filter
    if (parchmentStatusFilter !== "all") {
      filtered = filtered.filter((p) => p.status === parchmentStatusFilter);
    }

    // Apply process type filter
    if (parchmentProcessFilter !== "all") {
      filtered = filtered.filter(
        (p) => p.processType === parchmentProcessFilter,
      );
    }

    return filtered.sort((a, b) => {
      const key = parchmentSortConfig.key;

      // Default sort by createdAt (newest first) if sorting by id
      if (key === "id") {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return parchmentSortConfig.direction === "desc"
          ? dateB - dateA
          : dateA - dateB;
      }

      if (a[key] < b[key])
        return parchmentSortConfig.direction === "asc" ? -1 : 1;
      if (a[key] > b[key])
        return parchmentSortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [
    data.parchmentLots,
    parchmentSearch,
    parchmentSortConfig,
    parchmentStatusFilter,
    parchmentProcessFilter,
  ]);

  const parchmentPageCount = Math.ceil(
    processedParchmentLots.length / ITEMS_PER_PAGE,
  );
  const paginatedParchmentLots = processedParchmentLots.slice(
    (parchmentCurrentPage - 1) * ITEMS_PER_PAGE,
    parchmentCurrentPage * ITEMS_PER_PAGE,
  );

  // For Kanban view - only show lots awaiting hulling
  const kanbanParchmentLots = processedParchmentLots.filter(p => p.status !== "Hulled");
  const kanbanParchmentPageCount = Math.ceil(kanbanParchmentLots.length / ITEMS_PER_PAGE);
  const paginatedKanbanParchmentLots = kanbanParchmentLots.slice(
    (parchmentCurrentPage - 1) * ITEMS_PER_PAGE,
    parchmentCurrentPage * ITEMS_PER_PAGE,
  );

  const enrichedGreenBeanLots = useMemo(() => {
    const qcSessionId = processorUser ? `CS-QC-${processorUser.id}` : "";
    return data.greenBeanLots.map((gbl) => {
      const qcScoreData = gbl.cuppingScores.find(
        (cs) => cs.sessionId === qcSessionId,
      );
      return { ...gbl, qcScore: qcScoreData?.score };
    });
  }, [data.greenBeanLots, processorUser]);

  const processedGreenBeanLots = useMemo(() => {
    let filtered = enrichedGreenBeanLots.filter(
      (g) =>
        g.id.toLowerCase().includes(greenBeanSearch.toLowerCase()) ||
        g.grade.toLowerCase().includes(greenBeanSearch.toLowerCase()),
    );

    // Apply status filter (InStock = weight > 0, Depleted = weight <= 0)
    if (greenBeanStatusFilter === "InStock") {
      filtered = filtered.filter((g) => g.currentWeightKg > 0);
    } else if (greenBeanStatusFilter === "Depleted") {
      filtered = filtered.filter((g) => g.currentWeightKg <= 0);
    }

    // Apply grade filter
    if (greenBeanGradeFilter !== "all") {
      filtered = filtered.filter((g) => g.grade === greenBeanGradeFilter);
    }

    return filtered.sort((a, b) => {
      const key = greenBeanSortConfig.key as keyof typeof a;

      // Default sort by createdAt (newest first) if sorting by id
      if (key === "id") {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return greenBeanSortConfig.direction === "desc"
          ? dateB - dateA
          : dateA - dateB;
      }

      const aValue = a[key] ?? -1;
      const bValue = b[key] ?? -1;
      if (aValue < bValue)
        return greenBeanSortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue)
        return greenBeanSortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [
    enrichedGreenBeanLots,
    greenBeanSearch,
    greenBeanSortConfig,
    greenBeanStatusFilter,
    greenBeanGradeFilter,
  ]);

  const greenBeanPageCount = Math.ceil(
    processedGreenBeanLots.length / ITEMS_PER_PAGE,
  );
  const paginatedGreenBeanLots = processedGreenBeanLots.slice(
    (greenBeanCurrentPage - 1) * ITEMS_PER_PAGE,
    greenBeanCurrentPage * ITEMS_PER_PAGE,
  );

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white rounded-xl px-5 py-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 rounded-xl">
              <Coffee className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                Processor Workbench
              </h1>
              <p className="text-gray-500 text-xs mt-0.5">
                Manage processing batches, parchment, and green bean inventory
              </p>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
                viewMode === "kanban"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span>Workflow</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
                viewMode === "table"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <List className="h-4 w-4" />
              <span>Data Grid</span>
            </button>
          </div>
        </div>
      </div>

      {/* Statistics Dashboard removed per spec; KPIs now live on main Dashboard */}

      {viewMode === "kanban" ? <KanbanView /> : <TableView />}

      {viewMode === "kanban" && (
        <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Parchment Inventory */}
          <div className="bg-white shadow-sm rounded-lg overflow-hidden flex flex-col border border-gray-200">
            <div className="p-3 bg-amber-50 border-b border-amber-100">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-amber-500 rounded-md">
                  <Box className="h-4 w-4 text-white" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">
                  Parchment Stock
                </h3>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={parchmentSearch}
                  onChange={(e) => {
                    setParchmentSearch(e.target.value);
                    setParchmentCurrentPage(1);
                  }}
                  className="pl-9 w-full border border-amber-200 bg-white rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none"
                />
              </div>
            </div>
            <div className="p-3 space-y-2 h-[400px] overflow-y-auto">
              {paginatedKanbanParchmentLots.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Box className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">
                    No matching parchment lots found
                  </p>
                </div>
              ) : (
                paginatedKanbanParchmentLots.map((p) => (
                  <div
                    key={p.id}
                    className={`bg-white border-l-4 ${p.status === "Hulled" ? "border-l-gray-300" : "border-l-amber-500"} rounded-lg p-3 border border-gray-200 hover:shadow-md transition-all`}
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatParchmentId(p)}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${p.status === "Hulled" ? "bg-gray-100 text-gray-600" : "bg-emerald-50 text-emerald-700"}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${p.status === "Hulled" ? "bg-gray-400" : "bg-emerald-500"}`}
                        ></span>
                        {formatParchmentStatus(p.status)}
                      </span>
                    </div>

                    {/* Card Body - Compact */}
                    <div className="text-xs space-y-1.5 text-gray-500 mb-3">
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5">
                          <Coffee className="h-3 w-3" />
                          Process
                        </span>
                        <span className="font-medium text-gray-900">
                          {p.processType}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5">
                          <Scale className="h-3 w-3" />
                          Weight
                        </span>
                        <span className="font-medium text-gray-900">
                          {(p.status === "Hulled"
                            ? p.initialWeightKg
                            : p.currentWeightKg
                          ).toFixed(2)}{" "}
                          kg
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5">
                          <Droplet className="h-3 w-3" />
                          Moisture
                        </span>
                        <span className="font-medium text-gray-900">
                          {p.moistureContent}%
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => openModal("hullAndGrade", p)}
                      disabled={p.status === "Hulled" || p.currentWeightKg <= 0}
                      className="w-full py-2 text-xs font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all inline-flex items-center justify-center gap-1.5"
                    >
                      <PlayCircle size={14} />
                      Hull & Grade
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="mt-auto">
              <Pagination
                currentPage={parchmentCurrentPage}
                totalPages={kanbanParchmentPageCount}
                onPageChange={setParchmentCurrentPage}
              />
            </div>
          </div>

          {/* Green Bean Inventory */}
          <div
            ref={greenBeanStockRef}
            className="bg-white shadow-sm rounded-lg overflow-hidden flex flex-col border border-gray-200"
          >
            <div className="p-3 bg-teal-50 border-b border-teal-100">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-teal-500 rounded-md">
                  <Coffee className="h-4 w-4 text-white" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">
                  Green Bean Stock
                </h3>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search lots..."
                  value={greenBeanSearch}
                  onChange={(e) => {
                    setGreenBeanSearch(e.target.value);
                    setGreenBeanCurrentPage(1);
                  }}
                  className="pl-9 w-full border border-teal-200 bg-white rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-teal-300 focus:border-teal-300 outline-none"
                />
              </div>
            </div>
            <div className="p-3 space-y-2 h-[400px] overflow-y-auto">
              {paginatedGreenBeanLots.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Coffee className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">
                    No matching green bean lots found
                  </p>
                </div>
              ) : (
                paginatedGreenBeanLots.map((g) => {
                  // Prioritize processor score over cupping scores
                  const displayScore = g.processorScore
                    ? g.processorScore.toFixed(1)
                    : g.cuppingScores?.length > 0
                      ? (
                          g.cuppingScores.reduce((sum, c) => sum + c.score, 0) /
                          g.cuppingScores.length
                        ).toFixed(1)
                      : null;
                  const scoreValue = g.processorScore
                    ? g.processorScore
                    : g.cuppingScores?.length > 0
                      ? g.cuppingScores.reduce((sum, c) => sum + c.score, 0) /
                        g.cuppingScores.length
                      : 0;

                  return (
                    <div
                      key={g.id}
                      className={`bg-white border-l-4 ${g.availabilityStatus === "Withdrawn" ? "border-l-gray-300" : "border-l-teal-500"} rounded-lg p-3 border border-gray-200 hover:shadow-md transition-all`}
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-teal-500 rounded-md">
                            <Coffee className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatGreenBeanId(g)}
                            </p>
                            <p className="text-xs text-teal-600">
                              Green Bean Lot
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleToggleAvailability(g.id)}
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${g.availabilityStatus === "Available" ? "bg-teal-50 text-teal-700 hover:bg-teal-100" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${g.availabilityStatus === "Available" ? "bg-teal-500" : "bg-gray-400"}`}
                          ></span>
                          {g.availabilityStatus}
                        </button>
                      </div>

                      {/* Card Body */}
                      <div className="text-xs space-y-1.5 text-gray-500 mb-3">
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5">
                            <Star className="h-3 w-3" />
                            Grade
                          </span>
                          <span className="font-medium text-gray-900">
                            {g.grade}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5">
                            <Scale className="h-3 w-3" />
                            Weight
                          </span>
                          <span className="font-medium text-gray-900">
                            {g.currentWeightKg.toFixed(2)} kg
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5">
                            <DollarSign className="h-3 w-3" />
                            Price/kg
                          </span>
                          {g.pricePerKg ? (
                            <span className="font-medium text-teal-600">
                              {g.pricePerKg.toFixed(2)} {g.currency || "THB"}
                            </span>
                          ) : (
                            <span className="text-gray-400">Not set</span>
                          )}
                        </div>
                        {g.pricePerKg && (
                          <div className="flex justify-between items-center">
                            <span className="flex items-center gap-1.5">
                              <DollarSign className="h-3 w-3" />
                              Total Amount
                            </span>
                            <span className="font-bold text-teal-700">
                              {(g.pricePerKg * g.currentWeightKg).toFixed(2)}{" "}
                              {g.currency || "THB"}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5">
                            <Activity className="h-3 w-3" />
                            QC Score
                          </span>
                          {displayScore ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-gray-900">
                                {displayScore}
                              </span>
                              {scoreValue >= 80 && (
                                <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">N/A</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        {g.withdrawalHistory &&
                          g.withdrawalHistory.length > 0 && (
                            <button
                              onClick={() => setSelectedGreenBeanForHistory(g)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
                              title="History"
                            >
                              <History className="h-4 w-4" />
                            </button>
                          )}
                        <button
                          onClick={() => setScoringLot(g)}
                          className="flex-1 py-2 text-xs font-medium rounded-md text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors inline-flex items-center justify-center gap-1.5"
                        >
                          <Star className="h-3 w-3" />
                          QC Score
                        </button>
                        <button
                          onClick={() => openModal("withdrawStock", g)}
                          disabled={g.availabilityStatus === "Withdrawn"}
                          className="flex-1 py-2 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all inline-flex items-center justify-center gap-1.5"
                        >
                          <PlayCircle className="h-3 w-3" />
                          Withdraw
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-auto">
              <Pagination
                currentPage={greenBeanCurrentPage}
                totalPages={greenBeanPageCount}
                onPageChange={setGreenBeanCurrentPage}
              />
            </div>
          </div>
        </div>
      )}

      {modal && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div
              className={`bg-white rounded-2xl shadow-2xl w-full ${modal === "completeBatch" ? "max-w-4xl" : "max-w-2xl"} max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col`}
            >
              <form
                onSubmit={handleSubmit}
                className="flex flex-col h-full overflow-y-auto p-8"
              >
                {/* Error Display */}
                {formError && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-red-800">
                        Error
                      </p>
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

                {modal === "startProcessing" && selectedHarvestLot && (
                  <>
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-4 bg-blue-100 rounded-xl shadow-md">
                        <PlayCircle className="h-10 w-10 text-blue-600" />
                      </div>
                      <div>
                        <h2 className="text-3xl font-bold text-gray-900">
                          Record Process
                        </h2>
                        <p className="text-base text-gray-600 mt-1">
                          Lot #{selectedHarvestLot.id}
                        </p>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-8 mb-8 border border-gray-200 shadow-sm">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
                        <div className="text-center">
                          <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">
                            Variety
                          </p>
                          <p className="text-2xl font-bold text-gray-900">
                            {selectedHarvestLot.cherryVariety}
                          </p>
                        </div>
                        <div className="text-center sm:border-l-2 sm:border-gray-300">
                          <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">
                            {selectedHarvestLot.remainingWeightKg !== undefined
                              ? "Remaining Weight"
                              : "Weight"}
                          </p>
                          <p className="text-2xl font-bold text-green-600">
                            {selectedHarvestLot.remainingWeightKg !== undefined
                              ? `${selectedHarvestLot.remainingWeightKg.toFixed(2)} kg`
                              : `${selectedHarvestLot.weightKg} kg`}
                          </p>
                          {selectedHarvestLot.remainingWeightKg !== undefined &&
                            selectedHarvestLot.remainingWeightKg <
                              selectedHarvestLot.weightKg && (
                              <p className="text-xs text-gray-500 mt-1">
                                of {selectedHarvestLot.weightKg} kg original
                              </p>
                            )}
                        </div>
                        <div className="text-center sm:border-l-2 sm:border-gray-300">
                          <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">
                            Farmer
                          </p>
                          <p className="text-2xl font-bold text-gray-900">
                            {selectedHarvestLot.farmerName}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mb-6 space-y-4">
                      <div>
                        <label
                          htmlFor="processType"
                          className="block text-base font-bold text-gray-700 mb-3"
                        >
                          Select Process Type
                        </label>
                        <ProcessTypeDropdown
                          value={selectedProcessType}
                          onChange={setSelectedProcessType}
                          processTypes={processTypeOptions}
                        />
                        <input
                          type="hidden"
                          name="processType"
                          value={selectedProcessType}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="cropYear"
                          className="block text-base font-bold text-gray-700 mb-3"
                        >
                          Crop Year (Optional)
                        </label>
                        <CropYearChips
                          years={data.cropYears}
                          value={cropYearId}
                          onChange={setCropYearId}
                        />
                        <p className="mt-2 text-xs text-gray-500">
                          Associate this batch with a crop year for tracking and
                          reporting
                        </p>
                      </div>

                      {/* Optional special instructions/note for the chosen process */}
                      <div>
                        <label
                          htmlFor="processNotes"
                          className="block text-sm font-semibold text-gray-700 mb-2"
                        >
                          Process Notes (Optional)
                        </label>
                        <textarea
                          id="processNotes"
                          name="processNotes"
                          rows={2}
                          placeholder="e.g., Ferment 24h in sealed tank, raised-bed drying, frequent turning"
                          className="w-full border border-gray-300 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 shadow-sm transition-all resize-none"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Use this to capture special steps or parameters for
                          this batch.
                        </p>
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
                          <p className="mt-2 text-xs text-gray-500">
                            Measured on parchment at end of drying (workers
                            input).
                          </p>
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
                          <input
                            type="hidden"
                            name="dryingStartDate"
                            value={dryingStartDate}
                          />
                        </div>
                        <div>
                          <DatePicker
                            value={dryingEndDate}
                            onChange={setDryingEndDate}
                            label="Drying End Date"
                            required
                          />
                          <input
                            type="hidden"
                            name="dryingEndDate"
                            value={dryingEndDate}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
                {modal === "hullAndGrade" &&
                  selectedParchment &&
                  (() => {
                    const totalWeightNum = parseFloat(totalGreenWeight) || 0;
                    const exceedsParchmentWeight =
                      totalWeightNum > selectedParchment.currentWeightKg;
                    const weightMismatch =
                      totalWeightNum > 0 &&
                      Math.abs(gradedWeightSum - totalWeightNum) > 0.01;
                    const weightLossPercent = totalGreenWeight
                      ? (
                          ((selectedParchment.currentWeightKg -
                            parseFloat(totalGreenWeight)) /
                            selectedParchment.currentWeightKg) *
                          100
                        ).toFixed(1)
                      : "0";

                    return (
                      <>
                        {/* Modal Header */}
                        <div className="flex items-center gap-4 mb-6">
                          <div className="p-4 bg-amber-500 rounded-2xl shadow-lg">
                            <PlayCircle className="h-10 w-10 text-white" />
                          </div>
                          <div>
                            <h2 className="text-3xl font-bold text-gray-900">
                              Hull & Grade
                            </h2>
                            <p className="text-base text-gray-600 mt-1">
                              Parchment Lot #{selectedParchment.id}
                            </p>
                          </div>
                        </div>

                        {/* Parchment Info Card */}
                        <div className="bg-amber-50 rounded-2xl p-6 mb-6 border border-amber-200">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                                Parchment Weight
                              </p>
                              <p className="text-3xl font-bold text-amber-600">
                                {selectedParchment.currentWeightKg.toFixed(2)}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                kilograms
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                                Moisture
                              </p>
                              <p className="text-3xl font-bold text-blue-600">
                                {selectedParchment.moistureContent}%
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                content
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Total Green Bean Weight Input */}
                        <div className="mb-6">
                          <label className="block text-base font-bold text-gray-700 mb-3">
                            <div className="flex items-center gap-2">
                              <Scale className="h-5 w-5 text-green-600" />
                              Total Green Bean Weight
                              <span className="text-xs font-normal text-gray-500">
                                (auto-calculated)
                              </span>
                            </div>
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={totalGreenWeight}
                            readOnly
                            placeholder="Enter weights below"
                            className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-lg font-semibold bg-gray-50 text-green-700 cursor-not-allowed shadow-sm"
                          />
                          {totalGreenWeight && !exceedsParchmentWeight && (
                            <div className="mt-3 flex items-center justify-between bg-blue-50 rounded-xl p-4 border border-blue-200">
                              <span className="text-sm font-semibold text-gray-700">
                                Weight Loss from Hulling
                              </span>
                              <span className="text-2xl font-bold text-blue-600">
                                {weightLossPercent}%
                              </span>
                            </div>
                          )}
                          {exceedsParchmentWeight && (
                            <div className="mt-3 flex items-start gap-2 bg-red-50 rounded-xl p-4 border border-red-200">
                              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-semibold text-red-800">
                                  น้ำหนักเกินกว่า Parchment Weight
                                </p>
                                <p className="text-xs text-red-600 mt-1">
                                  Total Green Bean Weight (
                                  {totalWeightNum.toFixed(2)} kg) ไม่สามารถเกิน
                                  Parchment Weight (
                                  {selectedParchment.currentWeightKg.toFixed(2)}{" "}
                                  kg)
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Divider */}
                        <div className="relative my-6">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t-2 border-gray-300"></div>
                          </div>
                          <div className="relative flex justify-center">
                            <span className="bg-white px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">
                              Create Graded Lots
                            </span>
                          </div>
                        </div>

                        {/* Graded Lots Section */}
                        <div className="space-y-3 mb-4">
                          {gradedLots.map((lot, index) => (
                            <div
                              key={index}
                              className="bg-green-50 rounded-xl p-4 border border-green-200"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
                                  <span className="text-white font-bold text-lg">
                                    #{index + 1}
                                  </span>
                                </div>
                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                  <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                                      Grade
                                    </label>
                                    <GradeDropdown
                                      value={lot.grade}
                                      onChange={(value) =>
                                        setGradedLots(
                                          gradedLots.map((l, i) =>
                                            i === index
                                              ? { ...l, grade: value }
                                              : l,
                                          ),
                                        )
                                      }
                                      index={index}
                                      usedGrades={gradedLots
                                        .map((l) => l.grade)
                                        .filter((g) => g)}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                                      Weight (kg)
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      placeholder="0.00"
                                      value={lot.weight}
                                      onChange={(e) =>
                                        setGradedLots(
                                          gradedLots.map((l, i) =>
                                            i === index
                                              ? { ...l, weight: e.target.value }
                                              : l,
                                          ),
                                        )
                                      }
                                      required
                                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                                      <div className="flex items-center gap-1">
                                        <Star
                                          size={12}
                                          className="text-gray-500"
                                        />
                                        Score
                                      </div>
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      max="100"
                                      placeholder="Optional"
                                      value={lot.score}
                                      onChange={(e) =>
                                        setGradedLots(
                                          gradedLots.map((l, i) =>
                                            i === index
                                              ? { ...l, score: e.target.value }
                                              : l,
                                          ),
                                        )
                                      }
                                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                                      <div className="flex items-center gap-1">
                                        <DollarSign
                                          size={12}
                                          className="text-gray-500"
                                        />
                                        Price/kg (THB)
                                      </div>
                                    </label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      placeholder="Optional"
                                      value={lot.price}
                                      onChange={(e) =>
                                        setGradedLots(
                                          gradedLots.map((l, i) =>
                                            i === index
                                              ? { ...l, price: e.target.value }
                                              : l,
                                          ),
                                        )
                                      }
                                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    />
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setGradedLots(
                                      gradedLots.filter((_, i) => i !== index),
                                    )
                                  }
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
                          onClick={() =>
                            setGradedLots([
                              ...gradedLots,
                              { grade: "", weight: "", price: "", score: "" },
                            ])
                          }
                          className="w-full py-3 px-4 border border-dashed border-green-300 rounded-xl text-sm font-bold text-green-600 hover:bg-green-50 hover:border-green-400 transition-all flex items-center justify-center gap-2"
                        >
                          <Plus size={18} /> Add Another Grade
                        </button>

                        {/* Total Summary Card */}
                        <div
                          className={`mt-6 rounded-2xl p-6 border shadow-lg transition-all ${weightMismatch || exceedsParchmentWeight ? "bg-red-50 border-red-300" : "bg-green-50 border-green-300"}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                              Total Accounted For
                            </span>
                            {weightMismatch || exceedsParchmentWeight ? (
                              <AlertCircle className="h-6 w-6 text-red-600" />
                            ) : (
                              <Check className="h-6 w-6 text-green-600" />
                            )}
                          </div>
                          <div className="flex items-baseline gap-2 mb-2">
                            <span
                              className={`text-4xl font-extrabold ${weightMismatch || exceedsParchmentWeight ? "text-red-600" : "text-green-600"}`}
                            >
                              {gradedWeightSum.toFixed(2)}
                            </span>
                            <span className="text-2xl font-bold text-gray-400">
                              /
                            </span>
                            <span className="text-2xl font-bold text-gray-600">
                              {totalWeightNum.toFixed(2)} kg
                            </span>
                          </div>
                          {weightMismatch && (
                            <div className="mt-3 flex items-start gap-2 bg-red-100 rounded-lg p-3 border border-red-200">
                              <AlertCircle
                                size={16}
                                className="text-red-600 flex-shrink-0 mt-0.5"
                              />
                              <p className="text-xs font-semibold text-red-800">
                                The sum of graded lots must exactly match the
                                total green bean weight.
                              </p>
                            </div>
                          )}
                          {exceedsParchmentWeight && !weightMismatch && (
                            <div className="mt-3 flex items-start gap-2 bg-red-100 rounded-lg p-3 border border-red-200">
                              <AlertCircle
                                size={16}
                                className="text-red-600 flex-shrink-0 mt-0.5"
                              />
                              <p className="text-xs font-semibold text-red-800">
                                น้ำหนักรวมเกินกว่า Parchment Weight (
                                {selectedParchment.currentWeightKg.toFixed(2)}{" "}
                                kg)
                              </p>
                            </div>
                          )}
                          {!weightMismatch &&
                            !exceedsParchmentWeight &&
                            totalWeightNum > 0 && (
                              <div className="mt-3 flex items-center gap-2 bg-green-100 rounded-lg p-3 border border-green-200">
                                <Check
                                  size={16}
                                  className="text-green-600 flex-shrink-0"
                                />
                                <p className="text-xs font-semibold text-green-800">
                                  Perfect! All weights are accounted for.
                                </p>
                              </div>
                            )}
                        </div>
                      </>
                    );
                  })()}
                {modal === "withdrawStock" && selectedGreenBean && (
                  <>
                    {/* Modal Header */}
                    <div className="flex items-center gap-4 mb-6">
                      <div className="p-4 bg-blue-600 rounded-2xl shadow-lg">
                        <PlayCircle className="h-10 w-10 text-white" />
                      </div>
                      <div>
                        <h2 className="text-3xl font-bold text-gray-900">
                          Withdraw Stock
                        </h2>
                        <p className="text-base text-gray-600 mt-1">
                          Green Bean Lot #{selectedGreenBean.id}
                        </p>
                      </div>
                    </div>

                    {/* Current Stock Info Card */}
                    <div className="bg-green-50 rounded-2xl p-6 mb-6 border border-green-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                            Current Stock
                          </p>
                          <p className="text-4xl font-bold text-green-600">
                            {selectedGreenBean.currentWeightKg.toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            kilograms available
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                            Grade
                          </p>
                          <p className="text-2xl font-bold text-gray-900">
                            {selectedGreenBean.grade}
                          </p>
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
                        onChange={(v) =>
                          setWithdrawalType(v as typeof withdrawalType)
                        }
                        options={[
                          "Sale",
                          "Roasting Stock",
                          "Sample",
                          "Export",
                          "Other",
                        ]}
                        placeholder="Select withdrawal type..."
                        colorTheme="blue"
                      />
                    </div>

                    {/* Conditional Sale Fields */}
                    {withdrawalType === "Sale" && (
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
                                  onChange={(v) =>
                                    handleCustomerSelect(v as string)
                                  }
                                  options={customerOptions}
                                  placeholder="Select customer or type name below..."
                                  colorTheme="blue"
                                />
                                <input
                                  type="text"
                                  value={withdrawalCustomerName}
                                  onChange={(e) => {
                                    setWithdrawalCustomerName(e.target.value);
                                    setWithdrawalCustomerId(""); // Clear selection when typing manually
                                  }}
                                  placeholder="Or type customer name manually..."
                                  className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={withdrawalCustomerName}
                                onChange={(e) =>
                                  setWithdrawalCustomerName(e.target.value)
                                }
                                placeholder="e.g., Roaster ABC"
                                className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            )}
                            {customers.length === 0 &&
                              !customersLoading &&
                              (currentUser.roles?.includes(UserRole.Admin) ||
                                currentUser.roles?.includes(
                                  UserRole.Roaster,
                                )) && (
                                <p className="mt-1 text-xs text-gray-500">
                                  <a
                                    href="/customers"
                                    target="_blank"
                                    className="text-blue-600 hover:underline"
                                  >
                                    Create customers
                                  </a>{" "}
                                  to use dropdown selection
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
                              onChange={(e) =>
                                setWithdrawalDeliveryAddress(e.target.value)
                              }
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
                                onChange={(e) =>
                                  setWithdrawalSalePrice(e.target.value)
                                }
                                placeholder="0.00"
                                className="flex-1 block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <Select
                                value={withdrawalCurrency}
                                onChange={(v) =>
                                  setWithdrawalCurrency(v as string)
                                }
                                options={["THB", "USD", "EUR"]}
                                colorTheme="blue"
                              />
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
                      <p className="text-xs text-gray-500 mt-2">
                        Maximum: {selectedGreenBean.currentWeightKg.toFixed(2)}{" "}
                        kg
                      </p>
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
                  </>
                )}
                {modal === "editWithdrawal" &&
                  editingWithdrawalLotId &&
                  editingWithdrawalIndex !== null &&
                  (() => {
                    const lot = data.greenBeanLots.find(
                      (g) => g.id === editingWithdrawalLotId,
                    );
                    const entry =
                      lot?.withdrawalHistory?.[editingWithdrawalIndex];
                    if (!entry) return null;

                    return (
                      <>
                        {/* Modal Header */}
                        <div className="flex items-center gap-4 mb-6">
                          <div className="p-4 bg-orange-600 rounded-2xl shadow-lg">
                            <FileText className="h-10 w-10 text-white" />
                          </div>
                          <div>
                            <h2 className="text-3xl font-bold text-gray-900">
                              Edit Withdrawal
                            </h2>
                            <p className="text-base text-gray-600 mt-1">
                              Lot #{editingWithdrawalLotId} - Entry #
                              {editingWithdrawalIndex + 1}
                            </p>
                          </div>
                        </div>

                        {/* Info Card */}
                        <div className="bg-yellow-50 rounded-2xl p-5 mb-6 border border-yellow-200">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-gray-900 mb-1">
                                Edit Restrictions
                              </p>
                              <p className="text-xs text-gray-700">
                                You can edit the withdrawal type, notes, and
                                sale details. The withdrawal amount (
                                {entry.amountKg.toFixed(2)} kg) and date (
                                {entry.date}) cannot be changed.
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
                            onChange={(v) =>
                              setWithdrawalType(v as typeof withdrawalType)
                            }
                            options={[
                              "Sale",
                              "Roasting Stock",
                              "Sample",
                              "Export",
                              "Other",
                            ]}
                            placeholder="Select withdrawal type..."
                            colorTheme="blue"
                          />
                        </div>

                        {/* Conditional Sale Fields */}
                        {withdrawalType === "Sale" && (
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
                                      onChange={(v) =>
                                        handleCustomerSelect(v as string)
                                      }
                                      options={customerOptions}
                                      placeholder="Select customer or type name below..."
                                      colorTheme="blue"
                                    />
                                    <input
                                      type="text"
                                      value={withdrawalCustomerName}
                                      onChange={(
                                        e: React.ChangeEvent<HTMLInputElement>,
                                      ) => {
                                        setWithdrawalCustomerName(
                                          e.target.value,
                                        );
                                        setWithdrawalCustomerId(""); // Clear selection when typing manually
                                      }}
                                      placeholder="Or type customer name manually..."
                                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    value={withdrawalCustomerName}
                                    onChange={(
                                      e: React.ChangeEvent<HTMLInputElement>,
                                    ) =>
                                      setWithdrawalCustomerName(e.target.value)
                                    }
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
                                  onChange={(
                                    e: React.ChangeEvent<HTMLInputElement>,
                                  ) =>
                                    setWithdrawalDeliveryAddress(e.target.value)
                                  }
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
                                    onChange={(
                                      e: React.ChangeEvent<HTMLInputElement>,
                                    ) => setWithdrawalSalePrice(e.target.value)}
                                    placeholder="0.00"
                                    className="flex-1 block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                  <Select
                                    value={withdrawalCurrency}
                                    onChange={(v) =>
                                      setWithdrawalCurrency(v as string)
                                    }
                                    options={["THB", "USD", "EUR"]}
                                    colorTheme="blue"
                                  />
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
                            defaultValue={entry.notes || entry.purpose || ""}
                            placeholder="Add or edit notes about this withdrawal..."
                            className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-base focus:ring-2 focus:ring-orange-500 focus:border-orange-500 shadow-sm transition-all resize-none"
                          />
                        </div>
                      </>
                    );
                  })()}
                <div className="mt-8 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setModal(null);
                      setFormError(null);
                      setSelectedHarvestLot(null);
                      setCropYearId("");
                    }}
                    className="px-6 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 border border-transparent shadow-lg text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-all"
                    disabled={
                      isSubmitting ||
                      (modal === "hullAndGrade" &&
                        (Math.abs(
                          gradedWeightSum - (parseFloat(totalGreenWeight) || 0),
                        ) > 0.01 ||
                          (parseFloat(totalGreenWeight) || 0) <= 0 ||
                          (parseFloat(totalGreenWeight) || 0) >
                            (selectedParchment?.currentWeightKg || 0)))
                    }
                  >
                    <Save className="h-4 w-4" />
                    {isSubmitting ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {scoringLot && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col">
              <div className="p-6 sm:p-8 overflow-y-auto">
                {/* Modal Header */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-4 bg-amber-600 rounded-2xl shadow-lg">
                    <Star className="h-10 w-10 text-white" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900">
                      QC Score
                    </h2>
                    <p className="text-base text-gray-600 mt-1">
                      Quality Control for Lot #{scoringLot.id}
                    </p>
                  </div>
                </div>

                {/* Lot Info Card */}
                <div className="bg-amber-50 rounded-2xl p-6 mb-6 border border-amber-200">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                        Grade
                      </p>
                      <p className="text-2xl font-bold text-amber-600">
                        {scoringLot.grade}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                        Weight
                      </p>
                      <p className="text-2xl font-bold text-gray-900">
                        {scoringLot.currentWeightKg.toFixed(2)} kg
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                        Current Score
                      </p>
                      <p className="text-2xl font-bold text-purple-600">
                        {scoringLot.cuppingScores?.length > 0
                          ? (
                              scoringLot.cuppingScores.reduce(
                                (sum, s) => sum + s.score,
                                0,
                              ) / scoringLot.cuppingScores.length
                            ).toFixed(2)
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Scoring Mode Toggle */}
                <div className="flex bg-gray-100 p-1.5 rounded-xl mb-6 w-full sm:w-2/3 mx-auto">
                  <button
                    type="button"
                    onClick={() => setScoringMode("simple")}
                    className={`w-1/2 py-3 text-sm font-bold rounded-lg transition-all ${scoringMode === "simple" ? "bg-white shadow-md text-amber-600" : "text-gray-600 hover:text-gray-900"}`}
                  >
                    Simple Score
                  </button>
                  <button
                    type="button"
                    onClick={() => setScoringMode("detailed")}
                    className={`w-1/2 py-3 text-sm font-bold rounded-lg transition-all ${scoringMode === "detailed" ? "bg-white shadow-md text-amber-600" : "text-gray-600 hover:text-gray-900"}`}
                  >
                    Detailed (SCA)
                  </button>
                </div>

                {scoringMode === "simple" ? (
                  <div className="max-w-md mx-auto">
                    <label className="block text-base font-bold text-gray-700 mb-3">
                      <div className="flex items-center gap-2 justify-center">
                        <Star className="h-5 w-5 text-amber-600" />
                        Total Score (0-100)
                      </div>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        max="100"
                        value={simpleQcScore}
                        onChange={(e) => setSimpleQcScore(e.target.value)}
                        required
                        placeholder="Enter score"
                        className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-lg font-semibold text-center focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-sm transition-all"
                      />
                      {parseFloat(simpleQcScore) >= 80 && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <Star className="h-6 w-6 text-yellow-500 fill-yellow-500" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      Score from 0 to 100 (increments of 0.25)
                      {parseFloat(simpleQcScore) >= 80 && (
                        <span className="text-yellow-600 font-semibold ml-2">
                          ⭐ Excellent Quality!
                        </span>
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                      {SCA_SENSORY_ATTRIBUTES.map((attr) => {
                        const { value, error } = sensoryScores[attr];
                        return (
                          <div key={attr} className="mb-2">
                            <label
                              htmlFor={attr}
                              className="block text-sm font-medium text-gray-700 mb-1"
                            >
                              {attr}
                            </label>
                            <input
                              type="number"
                              id={attr}
                              min="1"
                              max="10"
                              step="0.25"
                              value={value}
                              onChange={(e) =>
                                setSensoryScores((prev) => ({
                                  ...prev,
                                  [attr]: {
                                    ...prev[attr],
                                    value: e.target.value,
                                  },
                                }))
                              }
                              onBlur={() =>
                                setSensoryScores((prev) => ({
                                  ...prev,
                                  [attr]: {
                                    ...prev[attr],
                                    error: validateScore(value).error,
                                  },
                                }))
                              }
                              className={`w-full p-2 border rounded-md shadow-sm text-sm text-center ${error ? "border-red-500" : "border-gray-300"}`}
                            />
                            {error && (
                              <p className="text-xs text-red-600 mt-1">
                                {error}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div>
                      {SCA_CUP_ATTRIBUTES.map((attr) => {
                        const count = cupScores[attr];
                        return (
                          <div key={attr} className="mb-4">
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-sm font-medium text-gray-700">
                                {attr}
                              </label>
                              <span className="text-lg font-bold text-gray-800">
                                {count * 2}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <button
                                  type="button"
                                  key={i}
                                  onClick={() =>
                                    setCupScores((prev) => ({
                                      ...prev,
                                      [attr]: i + 1,
                                    }))
                                  }
                                  className={`flex-1 h-8 rounded-md border transition-colors ${i < count ? "bg-indigo-600 border-indigo-600" : "bg-white border-gray-400 hover:border-indigo-500"}`}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                        <label className="text-sm font-medium text-gray-700">
                          Defects (subtract)
                        </label>
                        <div className="flex items-center gap-4 mt-2">
                          <div>
                            <label className="text-xs"># of cups</label>
                            <input
                              type="number"
                              min="0"
                              value={defects.numCups}
                              onChange={(e) =>
                                setDefects({
                                  ...defects,
                                  numCups: e.target.value,
                                })
                              }
                              className="w-20 p-2 border rounded-md shadow-sm text-sm"
                            />
                          </div>
                          <span>&times;</span>
                          <div className="flex gap-2">
                            <label className="flex items-center text-sm gap-1">
                              <input
                                type="radio"
                                name="intensity"
                                value="2"
                                checked={defects.intensity === 2}
                                onChange={() =>
                                  setDefects({ ...defects, intensity: 2 })
                                }
                              />{" "}
                              Taint
                            </label>
                            <label className="flex items-center text-sm gap-1">
                              <input
                                type="radio"
                                name="intensity"
                                value="4"
                                checked={defects.intensity === 4}
                                onChange={() =>
                                  setDefects({ ...defects, intensity: 4 })
                                }
                              />{" "}
                              Fault
                            </label>
                          </div>
                          <span>=</span>
                          <span className="text-2xl font-bold text-red-600">
                            {detailedCalculations.defectsTotal}
                          </span>
                        </div>
                      </div>
                      <div className="mt-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200 space-y-2">
                        <div className="flex justify-between items-baseline">
                          <span className="font-semibold text-gray-600">
                            Subtotal
                          </span>
                          <span className="font-bold text-xl text-gray-800">
                            {detailedCalculations.subtotal.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="font-semibold text-red-600">
                            Defects
                          </span>
                          <span className="font-bold text-xl text-red-600">
                            &minus;{" "}
                            {detailedCalculations.defectsTotal.toFixed(2)}
                          </span>
                        </div>
                        <hr className="border-gray-300" />
                        <div className="flex justify-between items-center pt-2">
                          <span className="text-xl font-bold text-indigo-800">
                            Final Score
                          </span>
                          <span className="text-4xl font-extrabold text-indigo-600">
                            {detailedCalculations.finalScore.toFixed(2)}
                          </span>
                        </div>
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
                    onChange={(e) => setNotes(e.target.value)}
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
          </div>
        </ModalPortal>
      )}

      {selectedGreenBeanForHistory && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col">
              <div className="p-6 sm:p-8">
                {/* Modal Header */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-4 bg-gray-600 rounded-2xl shadow-lg">
                    <History className="h-10 w-10 text-white" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900">
                      Withdrawal History
                    </h2>
                    <p className="text-base text-gray-600 mt-1">
                      Lot #{selectedGreenBeanForHistory.id}
                    </p>
                  </div>
                </div>

                {/* Summary Card */}
                <div className="bg-blue-50 rounded-2xl p-6 mb-6 border border-blue-200">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                        Total Withdrawals
                      </p>
                      <p className="text-3xl font-bold text-blue-600">
                        {selectedGreenBeanForHistory.withdrawalHistory
                          ?.length || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">transactions</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                        Total Amount
                      </p>
                      <p className="text-3xl font-bold text-blue-600">
                        {(
                          selectedGreenBeanForHistory.withdrawalHistory?.reduce(
                            (sum, entry) => sum + entry.amountKg,
                            0,
                          ) || 0
                        ).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">kilograms</p>
                    </div>
                  </div>
                </div>

                {/* History List */}
                <div className="overflow-y-auto max-h-96">
                  <div className="space-y-3">
                    {selectedGreenBeanForHistory.withdrawalHistory?.map(
                      (entry, index) => {
                        // Withdrawal type badge colors
                        const typeBadgeColors = {
                          Sale: "bg-green-100 text-green-700 border-green-200",
                          "Roasting Stock":
                            "bg-orange-100 text-orange-700 border-orange-200",
                          Sample:
                            "bg-purple-100 text-purple-700 border-purple-200",
                          Export: "bg-blue-100 text-blue-700 border-blue-200",
                          Other: "bg-gray-100 text-gray-700 border-gray-200",
                        };
                        const badgeColor =
                          typeBadgeColors[entry.withdrawalType] ||
                          typeBadgeColors["Other"];

                        return (
                          <div
                            key={index}
                            className="bg-gray-50 rounded-xl p-4 border border-gray-200 hover:border-blue-300 transition-all"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <span className="text-white font-bold text-sm">
                                    #{index + 1}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                    Date
                                  </p>
                                  <p className="text-sm font-bold text-gray-900">
                                    {entry.date}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                  Amount
                                </p>
                                <p className="text-2xl font-bold text-blue-600">
                                  {entry.amountKg.toFixed(2)} kg
                                </p>
                              </div>
                            </div>

                            {/* Withdrawal Type Badge */}
                            <div className="mb-3">
                              <span
                                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${badgeColor}`}
                              >
                                {entry.withdrawalType}
                              </span>
                            </div>

                            {/* Sale Information */}
                            {entry.withdrawalType === "Sale" &&
                              (entry.salePrice ||
                                entry.customerName ||
                                entry.invoiceNumber) && (
                                <div className="mb-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                                    Sale Details
                                  </p>
                                  <div className="space-y-1">
                                    {entry.salePrice && (
                                      <p className="text-sm text-gray-900">
                                        <span className="font-semibold">
                                          Price:
                                        </span>{" "}
                                        {entry.salePrice.toFixed(2)}{" "}
                                        {entry.currency || "THB"}/kg
                                      </p>
                                    )}
                                    {entry.customerName && (
                                      <p className="text-sm text-gray-900">
                                        <span className="font-semibold">
                                          Customer:
                                        </span>{" "}
                                        {entry.customerName}
                                      </p>
                                    )}
                                    {entry.deliveryAddress && (
                                      <p className="text-sm text-gray-900">
                                        <span className="font-semibold">
                                          Delivery:
                                        </span>{" "}
                                        {entry.deliveryAddress}
                                      </p>
                                    )}
                                    {entry.invoiceNumber && (
                                      <p className="text-sm text-gray-900">
                                        <span className="font-semibold">
                                          Invoice #:
                                        </span>{" "}
                                        {entry.invoiceNumber}
                                      </p>
                                    )}
                                    {entry.totalAmount != null && (
                                      <p className="text-sm text-gray-900">
                                        <span className="font-semibold">
                                          Total:
                                        </span>{" "}
                                        {entry.totalAmount.toFixed(2)}{" "}
                                        {entry.currency || "THB"}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}

                            {/* Purpose/Notes */}
                            {(entry.purpose || entry.notes) && (
                              <div className="mb-3">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                                  {entry.notes ? "Notes" : "Purpose"}
                                </p>
                                <p className="text-sm text-gray-900">
                                  {entry.notes || entry.purpose}
                                </p>
                              </div>
                            )}

                            {/* Withdrawn By */}
                            {entry.withdrawnByName && (
                              <div className="mb-3">
                                <p className="text-xs text-gray-500">
                                  Withdrawn by:{" "}
                                  <span className="font-semibold text-gray-700">
                                    {entry.withdrawnByName}
                                  </span>
                                </p>
                              </div>
                            )}

                            {/* Admin Actions */}
                            {/* Actions */}
                            <div className="mt-3 pt-3 border-t border-gray-300 flex gap-2">
                              {entry.withdrawalType === "Sale" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInvoiceView({
                                      lot: selectedGreenBeanForHistory,
                                      entryIndex: index,
                                    });
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
                                    onClick={() =>
                                      handleEditWithdrawal(
                                        selectedGreenBeanForHistory.id,
                                        index,
                                      )
                                    }
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all"
                                    title="Edit"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteWithdrawal(
                                        selectedGreenBeanForHistory.id,
                                        index,
                                      )
                                    }
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
                      },
                    )}
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
          </div>
        </ModalPortal>
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
