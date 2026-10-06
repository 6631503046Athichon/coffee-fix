import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useDataContext } from "../../hooks/useDataContext";
import { formatDateDisplay } from "../../utils/formatters";
import { toDateOnly } from "../../utils/dateOnly";
import { useGradeNames } from "../../hooks/useGradeOptions";
import { useToggleScrollAnchor } from "../../hooks/useToggleScrollAnchor";
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
  CropYear,
} from "../../types";
import type { DryingLogEntry } from "../../types";
import {
  Coffee,
  Wind,
  PackageCheck,
  Sprout,
  Leaf,
  User as UserIcon,
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
  Eye,
  Flame,
  Beaker,
  Globe,
  MoreHorizontal,
  ArrowRight,
  Minus,
  ChevronDown,
  Layers,
  Pencil,
} from "lucide-react";
import {
  addProcessingBatch,
  deleteProcessingBatch,
} from "../../services/processing/processingBatchService";
import type { UpdatedProcessingBatch } from "../../services/processing/processingBatchService";
import {
  updateGreenBeanLotScore,
  updateGreenBeanLotAvailability,
  createWithdrawal,
  deleteGreenBeanLot,
} from "../../services/lots/greenBeanLotService";
import {
  createParchmentWithdrawal,
  deleteParchmentLot,
} from "../../services/lots/parchmentLotService";
import { deleteHarvestLot } from "../../services/lots/harvestLotService";
import type { CuppingDetailUpdate } from "../../services/lots/greenBeanLotService";
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
import SetPriceModal from "./modals/SetPriceModal";
import EditHarvestLotModal from "./modals/EditHarvestLotModal";
import EditProcessingBatchModal from "./modals/EditProcessingBatchModal";
import EditParchmentLotModal from "./modals/EditParchmentLotModal";
import EditGreenBeanLotModal from "./modals/EditGreenBeanLotModal";
import DryingLogModal from "./modals/DryingLogModal";
import HideLotModal from "./modals/HideLotModal";
import ConfirmActionModal from "./modals/ConfirmActionModal";
import { logger } from "../../utils/logger";
import {
  csvDate,
  csvFilename,
  csvFixed,
  downloadCsv,
} from "../../utils/exportCSV";

import {
  ITEMS_PER_PAGE,
  MAX_VISIBLE_PAGES,
  NEW_TAG_DAYS,
  isRecentItem,
  formatParchmentStatus,
  findCurrentCropYearId,
  selectableCropYears,
  getHarvestLotCherryWeight,
  getReadyHarvestLots,
  validateScore,
  initialSensoryScores,
  initialCupScores,
  ModalPortal,
  DebouncedSearchInput,
  ProcessTypeChips,
  ProcessTypePill,
  ProcessTypeDot,
  defaultProcessTypeName,
  processTypeChoices,
  processTypeColors,
  processTypeFilterNames,
  processTypeKey,
  GradeDropdown,
  CropYearChips,
  Pagination,
  ExportCsvButton,
  GradePriceInput,
  GradeSplitValue,
  hasGradePriceError,
  parseGradePrice,
  WithdrawDetailsFields,
  useWithdrawDetails,
  withdrawDetailsError,
  buildWithdrawDetailsPayload,
  withdrawSaleTotal,
  withdrawDetailsForLot,
  formatMoney,
  formatWithdrawTotal,
  greenBeanLotFacts,
  greenBeanSearchFields,
  harvestLotSearchFields,
  matchesLotSearch,
  parchmentLotFacts,
  parchmentSearchFields,
} from "./workbench";
import type {
  ViewMode,
  SortDirection,
  ParchmentSortKeys,
  GreenBeanSortKeys,
  ScoreInput,
  WithdrawalType,
} from "./workbench";
import { canManageGreenBeanLot, isAdminViewer } from "./workbench/stockAccess";
import {
  canManageParchmentLot,
  canManageProcessingBatch,
} from "./workbench/recordAccess";
import {
  availabilityLabel,
  availabilityToggleTitle,
  hideNeedsConfirm,
  isOnSale,
  withdrawBlockedTitle,
} from "./workbench/availability";
import { applyGreenBeanWithdrawal } from "./workbench/roasterStockSync";
import {
  useParchmentWithdrawalHistory,
  useWithdrawalCorrections,
} from "./workbench/useWithdrawalCorrections";
import {
  VoidedNote,
  VoidedTag,
  WithdrawalRowActions,
} from "./workbench/WithdrawalCorrectionControls";
import {
  activeWithdrawals,
  canEditWithdrawalSale,
  canVoidWithdrawal,
  isVoidedWithdrawal,
  madeByHullAndGrade,
  withdrawalTypeLabel,
  withdrawnKgTotal,
} from "./workbench/withdrawalCorrections";

interface ProcessorWorkbenchProps {
  currentUser: User;
}

// Record Process starts on Washed while the admin list is still empty (not
// loaded yet), as it always has; once loaded, on the first active type.
const EMPTY_LIST_PROCESS_TYPE = "Washed";

const ProcessorWorkbench: React.FC<ProcessorWorkbenchProps> = ({
  currentUser,
}) => {
  const MAX_GRADE_OPTIONS = 8;
  const { data, setData, refreshData } = useDataContext();
  const { addToast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  // A super admin counts as an Admin whatever roles the account lists.
  const isAdmin = isAdminViewer(currentUser);
  // Processors may correct or remove a farmer's cherry lot until it is
  // processed; the backend enforces the "unprocessed only" rule.
  const canManageCherryLots =
    isAdmin || (currentUser.roles?.includes(UserRole.Processor) ?? false);
  // Withdraw, Set price, QC Score and the On sale / Hidden switch only
  // where the backend allows them: the lot's creator or an Admin. Another
  // processor's lot (or a roaster's) is still listed, without those
  // controls, instead of refusing with a 403.
  const canManageLot = (lot: GreenBeanLot) =>
    canManageGreenBeanLot(currentUser, lot);
  const greenBeanStockRef = useRef<HTMLDivElement>(null);

  // Modal States
  const [modal, setModal] = useState<string | null>(null);
  const [selectedParchment, setSelectedParchment] =
    useState<ParchmentLot | null>(null);
  const [selectedHarvestLot, setSelectedHarvestLot] =
    useState<HarvestLot | null>(null);
  const [parchmentWeightInput, setParchmentWeightInput] = useState('');
  const [selectedGreenBean, setSelectedGreenBean] =
    useState<GreenBeanLot | null>(null);
  const [openGreenBeanHistory, setSelectedGreenBeanForHistory] =
    useState<GreenBeanLot | null>(null);
  const [openParchmentHistory, setSelectedParchmentForHistory] =
    useState<ParchmentLot | null>(null);
  // The history popups show the stored lot as it is now, so a withdrawal
  // voided or edited from them (merged into the app data) shows at once.
  const selectedGreenBeanForHistory = openGreenBeanHistory
    ? (data.greenBeanLots.find((g) => g.id === openGreenBeanHistory.id) ??
      openGreenBeanHistory)
    : null;
  const selectedParchmentForHistory = openParchmentHistory
    ? (data.parchmentLots.find((p) => p.id === openParchmentHistory.id) ??
      openParchmentHistory)
    : null;
  const [selectedGreenBeanForSource, setSelectedGreenBeanForSource] =
    useState<GreenBeanLot | null>(null);
  const [scoringLot, setScoringLot] = useState<GreenBeanLot | null>(null);
  const [pricingLot, setPricingLot] = useState<GreenBeanLot | null>(null);
  const [editingHarvestLot, setEditingHarvestLot] =
    useState<HarvestLot | null>(null);
  const [deletingHarvestLotId, setDeletingHarvestLotId] = useState<
    string | null
  >(null);

  // Form States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Withdraw Stock Modal State
  const [withdrawalType, setWithdrawalType] =
    useState<WithdrawalType>("Sample");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  // Sale customer/price/address and the Roasting Stock roaster, shared with
  // the Parchment page's Withdraw Stock.
  const withdrawDetails = useWithdrawDetails();

  // Score Modal State (SCA form only; the one-number Simple Score is gone)
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

  // A filter over lots that already exist, so retired grades stay listed —
  // otherwise a lot filed under one would become unreachable.
  const gradeFilterNames = useGradeNames({ includeInactive: true });
  const greenBeanGradeFilterOptions = useMemo(
    () => [
      { value: "all", label: "All Grades" },
      ...gradeFilterNames.map((name) => ({ value: name, label: name })),
    ],
    [gradeFilterNames],
  );

  const [harvestLotSearch, setHarvestLotSearch] = useState("");
  const [harvestLotPage, setHarvestLotPage] = useState(1);
  const HARVEST_LOT_PAGE_SIZE = 5;

  // Stable callbacks for DebouncedSearchInput (must not change reference)
  const onHarvestLotSearch = useCallback((v: string) => {
    setHarvestLotSearch(v);
    setHarvestLotPage(1);
    setHarvestCardPage(1);
  }, []);
  const onParchmentSearch = useCallback((v: string) => {
    setParchmentSearch(v);
    setParchmentCurrentPage(1);
  }, []);
  const onGreenBeanSearch = useCallback((v: string) => {
    setGreenBeanSearch(v);
    setGreenBeanCurrentPage(1);
  }, []);

  // Cherry cards page at the same size as the other two columns, so the
  // three stacks stay in step as you flip through them.
  const [harvestCardPage, setHarvestCardPage] = useState(1);

  // Use the currently logged-in user for QC scoring
  const processorUser = currentUser;

  // (Removed) Top-of-workbench stat tiles were deprecated; relying on detailed sections below.

  // Process types Record Process offers: the active admin types in list
  // order (the classic three only while the list has not loaded).
  const processTypeOptions = useMemo(
    () => processTypeChoices(data.processTypes).map((choice) => choice.name),
    [data.processTypes],
  );

  // Parchment grid filter: every admin type plus any other value on a lot.
  const parchmentProcessFilterOptions = useMemo(
    () =>
      processTypeFilterNames(
        data.processTypes,
        data.parchmentLots.map((p) => p.processType),
      ).map((name) => ({ value: name, label: name })),
    [data.processTypes, data.parchmentLots],
  );

  // Stable row id helper for editor lists (graded lots). Using the
  // array index as a React key here loses input focus when rows are
  // deleted or reordered. Each row gets a uuid at creation time.
  const newRowId = useCallback(
    () =>
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `row-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    [],
  );

  // Hull & Grade Modal State
  const [gradedLots, setGradedLots] = useState<
    { rowKey: string; grade: string; weight: string; price: string; score: string }[]
  >(() => [
    { rowKey: newRowId(), grade: "Grade A", weight: "", price: "", score: "" },
  ]);
  const [totalGreenWeight, setTotalGreenWeight] = useState("");

  const resetHullAndGradeForm = useCallback(() => {
    setSelectedParchment(null);
    setTotalGreenWeight("");
    setGradedLots([
      { rowKey: newRowId(), grade: "Grade A", weight: "", price: "", score: "" },
    ]);
  }, [newRowId]);

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
  const [selectedProcessType, setSelectedProcessType] = useState<string>(() =>
    defaultProcessTypeName(
      data.processTypes,
      data.processTypes.length === 0 ? EMPTY_LIST_PROCESS_TYPE : undefined,
    ),
  );

  // Update selectedProcessType when processTypeOptions changes (ensures it's always valid)
  useEffect(() => {
    if (processTypeOptions.length > 0) {
      const isCurrentValid = processTypeOptions.includes(selectedProcessType);
      if (!isCurrentValid) {
        setSelectedProcessType(processTypeOptions[0]);
      }
    }
  }, [processTypeOptions, selectedProcessType]);

  // Crop Year Selection State
  const [cropYearId, setCropYearId] = useState<string>("");

  // Record Process drying dates
  const [dryingStartDate, setDryingStartDate] = useState("");
  const [dryingEndDate, setDryingEndDate] = useState("");

  const gradedWeightSum = useMemo(() => {
    return gradedLots.reduce(
      (sum, lot) => sum + (parseFloat(lot.weight) || 0),
      0,
    );
  }, [gradedLots]);

  const selectedHullGrades = useMemo(
    () => gradedLots.map((lot) => lot.grade).filter(Boolean),
    [gradedLots],
  );

  const duplicateHullGrades = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    selectedHullGrades.forEach((grade) => {
      if (seen.has(grade)) {
        duplicates.add(grade);
      } else {
        seen.add(grade);
      }
    });

    return Array.from(duplicates);
  }, [selectedHullGrades]);

  const hasDuplicateHullGrades = duplicateHullGrades.length > 0;
  const canAddMoreHullGrades = gradedLots.length < MAX_GRADE_OPTIONS;
  // Optional price per kg on each graded lot: empty is fine (Set price
  // later), anything typed must be valid before Save is allowed.
  const hasHullPriceError = useMemo(
    () => hasGradePriceError(gradedLots),
    [gradedLots],
  );

  const resetAllScoreForms = useCallback(() => {
    setNotes("");
    setSensoryScores(initialSensoryScores);
    setCupScores(initialCupScores);
    setDefects({ numCups: "0", intensity: 2 });
  }, []);

  useEffect(() => {
    if (scoringLot && processorUser) {
      // The notes saved on the lot (qcNotes) win over the in-browser QC
      // session's copy, which is gone after a reload.
      const savedNotes = scoringLot.qcNotes;
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
            // Check if it's a detailed score
            if (Object.keys(scoreEntry.scores).length > 1) {
              setNotes(savedNotes ?? scoreEntry.notes ?? "");
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
              // An old one-number Simple score ({ Overall: total }) has no
              // SCA breakdown, so the SCA form opens empty rather than
              // reading the total as the Overall attribute. Its notes still
              // load, and the header keeps showing the stored total.
              resetAllScoreForms();
              setNotes(savedNotes ?? scoreEntry.notes ?? "");
            }
            return;
          }
        }
      }
      // If no score found, reset everything but the notes saved on the lot
      resetAllScoreForms();
      setNotes(savedNotes ?? "");
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
    logger.debug("handleSaveScore called", { processorUser, scoringLot });

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

    const totalScore = detailedCalculations.finalScore;
    const scoresToSave: { [attribute: string]: number } = {};
    SCA_SENSORY_ATTRIBUTES.forEach((attr) => {
      scoresToSave[attr] = parseFloat(sensoryScores[attr].value);
    });
    SCA_CUP_ATTRIBUTES.forEach((attr) => {
      scoresToSave[attr] = cupScores[attr] * 2;
    });

    const fieldMap: Record<string, keyof CuppingDetailUpdate> = {
      "Fragrance/Aroma": "cuppingFragrance",
      Flavor: "cuppingFlavor",
      Aftertaste: "cuppingAftertaste",
      Acidity: "cuppingAcidity",
      Body: "cuppingBody",
      Balance: "cuppingBalance",
      Overall: "cuppingOverall",
      Uniformity: "cuppingUniformity",
      "Clean Cup": "cuppingCleanCup",
      Sweetness: "cuppingSweetness",
    };
    const cuppingDetailUpdate: CuppingDetailUpdate = {};
    Object.entries(fieldMap).forEach(([label, field]) => {
      const value = scoresToSave[label];
      if (typeof value === "number" && !Number.isNaN(value)) {
        cuppingDetailUpdate[field] = value;
      }
    });

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
            ...cuppingDetailUpdate,
            // Saved on the lot too, so reopening QC Score shows them.
            qcNotes: notes.trim() || undefined,
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
      await updateGreenBeanLotScore(
        scoringLot.id,
        totalScore,
        cuppingDetailUpdate,
        notes,
      );
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

  // Edit and delete for batches, parchment lots and green-bean lots (F24).
  // Only the record's owner or an Admin gets the buttons (recordAccess /
  // stockAccess, as on the backend). A delete removes only that record: the
  // backend refuses (409, with the counts) while anything downstream was
  // drawn from it, Admin included, and those are corrected first.
  const batchById = useMemo(
    () => new Map(data.processingBatches.map((b) => [b.id, b])),
    [data.processingBatches],
  );
  const parchmentLotsByBatch = useMemo(() => {
    const byBatch = new Map<string, ParchmentLot[]>();
    for (const lot of data.parchmentLots) {
      if (!lot.processingBatchId) continue;
      byBatch.set(lot.processingBatchId, [
        ...(byBatch.get(lot.processingBatchId) ?? []),
        lot,
      ]);
    }
    return byBatch;
  }, [data.parchmentLots]);
  const batchOfParchment = (lot: ParchmentLot) =>
    lot.processingBatchId ? batchById.get(lot.processingBatchId) : undefined;
  // The batch's whole output: its weight, moisture and process are the
  // batch's, so it is edited (and deleted) as the batch.
  const isOnlyLotOfBatch = (lot: ParchmentLot) =>
    Boolean(lot.processingBatchId) &&
    (parchmentLotsByBatch.get(lot.processingBatchId as string)?.length ?? 0) <= 1;
  const canManageParchment = (lot: ParchmentLot) =>
    canManageParchmentLot(currentUser, lot, batchOfParchment(lot));

  const [editingBatch, setEditingBatch] = useState<{
    batch: ProcessingBatch;
    lot: ParchmentLot;
  } | null>(null);
  const [editingParchment, setEditingParchment] =
    useState<ParchmentLot | null>(null);
  // The Drying log popup: the batch's readings, opened from its parchment lot.
  const [dryingLogFor, setDryingLogFor] = useState<{
    batchId: string;
    lotId: string;
  } | null>(null);
  const dryingLogBatch = dryingLogFor
    ? batchById.get(dryingLogFor.batchId)
    : undefined;
  const [editingGreenBean, setEditingGreenBean] =
    useState<GreenBeanLot | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(
    null,
  );

  // Void and Edit on the withdrawal history popups (D7). A parchment lot's
  // own withdrawals are loaded when its popup opens.
  const withdrawalCorrections = useWithdrawalCorrections();
  const parchmentHistory = useParchmentWithdrawalHistory(
    selectedParchmentForHistory,
  );
  // The Edit green bean lot popup holds a lot a Hull & Grade made to the
  // parchment that Hull & Grade hulled, which it reads from the parchment
  // lot's withdrawals: bulk-load does not carry them, so load them while the
  // popup is open (the popup reads the stored lot, so the limit shows once
  // they arrive).
  useParchmentWithdrawalHistory(
    editingGreenBean && madeByHullAndGrade(editingGreenBean)
      ? (data.parchmentLots.find(
          (p) => p.id === editingGreenBean.parchmentLotId,
        ) ?? null)
      : null,
  );

  const openParchmentEdit = (lot: ParchmentLot) => {
    const batch = batchOfParchment(lot);
    if (batch && isOnlyLotOfBatch(lot)) setEditingBatch({ batch, lot });
    else setEditingParchment(lot);
  };

  const deleteErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

  // A delete asks first in the site's confirm popup (not window.confirm).
  // `run` does the delete once confirmed; the popup waits while it runs, so
  // a second click cannot send a second request.
  const [pendingDelete, setPendingDelete] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const confirmBusyRef = useRef(false);

  const confirmPendingDelete = async () => {
    if (!pendingDelete || confirmBusyRef.current) return;
    confirmBusyRef.current = true;
    setConfirmBusy(true);
    try {
      await pendingDelete.run();
    } finally {
      confirmBusyRef.current = false;
      setConfirmBusy(false);
      setPendingDelete(null);
    }
  };

  // Deleting a batch undoes its Record Process: its untouched parchment lot
  // goes with it and the cherry lot is ready to process again.
  const handleDeleteBatch = (batchId: string) => {
    if (deletingRecordId) return;
    const batch = batchById.get(batchId) ?? { id: batchId };
    const lots = parchmentLotsByBatch.get(batchId) ?? [];
    const harvestLotId = "harvestLotId" in batch ? batch.harvestLotId : undefined;
    const cherryLot = harvestLotId
      ? data.harvestLots.find((h) => h.id === harvestLotId)
      : undefined;
    const lotPart =
      lots.length === 1
        ? ` and its parchment lot ${formatParchmentId(lots[0])}`
        : lots.length > 1
          ? ` and its ${lots.length} parchment lots`
          : "";
    setPendingDelete({
      title: `Delete processing batch ${formatProcessingBatchId(batch)}${lotPart}?`,
      message:
        `${cherryLot ? `Cherry lot ${formatHarvestLotId(cherryLot)}` : "Its cherry lot"} goes back to Cherry Lots to be processed again. ` +
        "A batch whose parchment was already withdrawn or hulled is not deleted. This cannot be undone.",
      confirmLabel: "Delete batch",
      run: () => deleteBatchNow(batchId),
    });
  };

  const deleteBatchNow = async (batchId: string) => {
    const batch = batchById.get(batchId) ?? { id: batchId };
    const harvestLotId = "harvestLotId" in batch ? batch.harvestLotId : undefined;
    const cherryLot = harvestLotId
      ? data.harvestLots.find((h) => h.id === harvestLotId)
      : undefined;
    setDeletingRecordId(batchId);
    try {
      const { harvestLotReleased } = await deleteProcessingBatch(batchId);
      setData((prev) => ({
        ...prev,
        processingBatches: prev.processingBatches.filter(
          (b) => b.id !== batchId,
        ),
        parchmentLots: prev.parchmentLots.filter(
          (p) => p.processingBatchId !== batchId,
        ),
        harvestLots:
          harvestLotReleased && harvestLotId
            ? prev.harvestLots.map((h) =>
                h.id === harvestLotId
                  ? {
                      ...h,
                      status: "Ready for Processing" as const,
                      remainingWeightKg: undefined,
                    }
                  : h,
              )
            : prev.harvestLots,
      }));
      addToast({
        type: "success",
        message: harvestLotReleased && cherryLot
          ? `Processing batch ${formatProcessingBatchId(batch)} deleted. Cherry lot ${formatHarvestLotId(cherryLot)} is ready to process again.`
          : `Processing batch ${formatProcessingBatchId(batch)} deleted.`,
      });
    } catch (error) {
      console.error("Failed to delete processing batch:", error);
      addToast({
        type: "error",
        message: deleteErrorMessage(error, "Failed to delete processing batch."),
      });
    } finally {
      setDeletingRecordId(null);
    }
  };

  const handleDeleteParchmentLot = (lotId: string) => {
    if (deletingRecordId) return;
    const lot = data.parchmentLots.find((p) => p.id === lotId);
    const label = lot ? formatParchmentId(lot) : "";
    setPendingDelete({
      title: `Delete parchment lot ${label}?`,
      message:
        "A lot that was already withdrawn from or hulled is not deleted. This cannot be undone.",
      confirmLabel: "Delete lot",
      run: () => deleteParchmentLotNow(lotId, label),
    });
  };

  const deleteParchmentLotNow = async (lotId: string, label: string) => {
    setDeletingRecordId(lotId);
    try {
      await deleteParchmentLot(lotId);
      setData((prev) => ({
        ...prev,
        parchmentLots: prev.parchmentLots.filter((p) => p.id !== lotId),
      }));
      addToast({
        type: "success",
        message: `Parchment lot ${label} deleted.`,
      });
    } catch (error) {
      console.error("Failed to delete parchment lot:", error);
      addToast({
        type: "error",
        message: deleteErrorMessage(error, "Failed to delete parchment lot."),
      });
    } finally {
      setDeletingRecordId(null);
    }
  };

  // A batch's only parchment lot is deleted as the batch, so its cherry lot
  // is not stranded as processed with nothing to show for it.
  const handleDeleteParchmentRecord = (lot: ParchmentLot) => {
    if (lot.processingBatchId && isOnlyLotOfBatch(lot)) {
      handleDeleteBatch(lot.processingBatchId);
    } else {
      handleDeleteParchmentLot(lot.id);
    }
  };

  const handleDeleteGreenBeanLot = (lotId: string) => {
    if (deletingRecordId) return;
    const lot = data.greenBeanLots.find((g) => g.id === lotId);
    const label = lot ? formatGreenBeanId(lot) : "";
    // A lot a Hull & Grade made goes by voiding that Hull & Grade, which puts
    // its parchment back too (the backend refuses deleting the lot alone):
    // open the parchment lot's history, where the Void is.
    if (lot && madeByHullAndGrade(lot)) {
      const source = data.parchmentLots.find((p) => p.id === lot.parchmentLotId);
      addToast({
        type: "info",
        message:
          `Green bean lot ${label} was made by a Hull & Grade of ${source ? `parchment lot ${formatParchmentId(source)}` : "its parchment lot"}. ` +
          "To remove it, void that Hull & Grade in the parchment lot's history: that removes the green bean lots it made and puts the parchment back.",
      });
      if (source) setSelectedParchmentForHistory(source);
      return;
    }
    setPendingDelete({
      title: `Delete green bean lot ${label}${lot ? ` (${lot.grade})` : ""}?`,
      message:
        "A lot with a withdrawal that is not void, roaster stock holding kg, a roast, a sale or invoice line, or a cupping sample is not deleted. " +
        "Voided withdrawals and empty roaster stock go with it. This cannot be undone.",
      confirmLabel: "Delete lot",
      run: () => deleteGreenBeanLotNow(lotId, label),
    });
  };

  const deleteGreenBeanLotNow = async (lotId: string, label: string) => {
    setDeletingRecordId(lotId);
    try {
      await deleteGreenBeanLot(lotId);
      // The backend removes the lot's empty roaster stock rows with it.
      setData((prev) => ({
        ...prev,
        greenBeanLots: prev.greenBeanLots.filter((g) => g.id !== lotId),
        roasterInventory: prev.roasterInventory.filter((inv) => inv.greenBeanLotId !== lotId),
      }));
      addToast({
        type: "success",
        message: `Green bean lot ${label} deleted.`,
      });
    } catch (error) {
      console.error("Failed to delete green bean lot:", error);
      addToast({
        type: "error",
        message: deleteErrorMessage(error, "Failed to delete green bean lot."),
      });
    } finally {
      setDeletingRecordId(null);
    }
  };

  // Merge only what the edit can change into the stored records: the PUT and
  // PATCH responses do not carry everything bulk-load does.
  const mergeParchmentWeights = (lot: ParchmentLot, saved: ParchmentLot) => ({
    ...lot,
    initialWeightKg: saved.initialWeightKg,
    currentWeightKg: saved.currentWeightKg,
    moistureContent: saved.moistureContent,
    processType: saved.processType,
    status: saved.status,
  });

  const handleBatchSaved = ({
    processingBatch: saved,
    parchmentLots: savedLots,
  }: UpdatedProcessingBatch) => {
    const savedLotById = new Map(savedLots.map((l) => [l.id, l]));
    setData((prev) => ({
      ...prev,
      processingBatches: prev.processingBatches.map((b) =>
        b.id === saved.id
          ? {
              ...b,
              status: saved.status,
              processType: saved.processType,
              processNotes: saved.processNotes,
              cropYearId: saved.cropYearId,
              parchmentWeightKg: saved.parchmentWeightKg,
              moistureContent: saved.moistureContent,
              baggingDate: saved.baggingDate,
              dryingStartDate: saved.dryingStartDate,
              dryingEndDate: saved.dryingEndDate,
            }
          : b,
      ),
      parchmentLots: prev.parchmentLots.map((p) => {
        const lot = savedLotById.get(p.id);
        return lot ? mergeParchmentWeights(p, lot) : p;
      }),
      // Green beans are grouped by their parchment's process type.
      greenBeanLots: prev.greenBeanLots.map((g) => {
        const lot = g.parchmentLotId ? savedLotById.get(g.parchmentLotId) : undefined;
        return lot ? { ...g, parchmentProcessType: lot.processType } : g;
      }),
    }));
    setEditingBatch(null);
    addToast({
      type: "success",
      message: `Processing batch ${formatProcessingBatchId(saved)} updated.`,
    });
  };

  // The popup saves each reading itself; the batch keeps the list it ends
  // with, so Quality Insights and the card's count show it at once.
  const handleDryingLogChange = (batchId: string, dryingLog: DryingLogEntry[]) => {
    setData((prev) => ({
      ...prev,
      processingBatches: prev.processingBatches.map((b) =>
        b.id === batchId ? { ...b, dryingLog } : b,
      ),
    }));
  };

  // The Drying log entry on a parchment card or row: the reading count, which
  // opens the popup. Bought-in parchment has no batch, so no drying log.
  const dryingLogCount = (lot: ParchmentLot) =>
    batchOfParchment(lot)?.dryingLog?.length ?? 0;
  const canEditDryingLog = (lot: ParchmentLot) =>
    canManageProcessingBatch(currentUser, batchOfParchment(lot));
  const openDryingLog = (lot: ParchmentLot) => {
    const batch = batchOfParchment(lot);
    if (batch) setDryingLogFor({ batchId: batch.id, lotId: lot.id });
  };

  const handleParchmentSaved = (saved: ParchmentLot) => {
    setData((prev) => {
      // For a batch's only lot the backend keeps the batch in step.
      const syncBatch =
        saved.processingBatchId &&
        prev.parchmentLots.filter(
          (p) => p.processingBatchId === saved.processingBatchId,
        ).length === 1;
      return {
        ...prev,
        parchmentLots: prev.parchmentLots.map((p) =>
          p.id === saved.id ? mergeParchmentWeights(p, saved) : p,
        ),
        processingBatches: syncBatch
          ? prev.processingBatches.map((b) =>
              b.id === saved.processingBatchId
                ? {
                    ...b,
                    parchmentWeightKg: saved.initialWeightKg,
                    moistureContent: saved.moistureContent,
                  }
                : b,
            )
          : prev.processingBatches,
      };
    });
    setEditingParchment(null);
    addToast({
      type: "success",
      message: `Parchment lot ${formatParchmentId(saved)} updated.`,
    });
  };

  // The invoice created the lot's public trace link. Keep it on the lot, so
  // a reopened invoice shows that QR rather than offering to create (and so
  // replace) the link again.
  const handleInvoicePublicTraceId = (lotId: string, publicTraceId: string) => {
    setData((prev) => ({
      ...prev,
      greenBeanLots: prev.greenBeanLots.map((g) =>
        g.id === lotId ? { ...g, publicTraceId } : g,
      ),
    }));
    setInvoiceView((prev) =>
      prev && prev.lot.id === lotId
        ? { ...prev, lot: { ...prev.lot, publicTraceId } }
        : prev,
    );
  };

  const handleGreenBeanSaved = (saved: GreenBeanLot) => {
    setData((prev) => ({
      ...prev,
      greenBeanLots: prev.greenBeanLots.map((g) =>
        g.id === saved.id
          ? {
              ...g,
              grade: saved.grade,
              initialWeightKg: saved.initialWeightKg,
              currentWeightKg: saved.currentWeightKg,
              availabilityStatus: saved.availabilityStatus,
            }
          : g,
      ),
    }));
    setEditingGreenBean(null);
    addToast({
      type: "success",
      message: `Green bean lot ${formatGreenBeanId(saved)} updated.`,
    });
  };

  // A refused edit that means the list is stale (the record went away, or
  // changed while the popup was open) reloads it.
  const handleCorrectionError = (message: string) => {
    addToast({ type: "error", message });
    if (/not found|changed while you were editing/i.test(message)) {
      void refreshData();
    }
  };

  // Merge only the edited cherry-lot fields into the stored lot — the PUT
  // response does not carry everything bulk-load does (e.g. farm details),
  // so swapping the whole object in could drop data.
  const handleHarvestLotSaved = (updatedLot: HarvestLot) => {
    setData((prev) => ({
      ...prev,
      harvestLots: prev.harvestLots.map((lot) =>
        lot.id === updatedLot.id
          ? {
              ...lot,
              cherryVariety: updatedLot.cherryVariety,
              weightKg: updatedLot.weightKg,
              farmPlotLocation: updatedLot.farmPlotLocation,
              harvestDate: updatedLot.harvestDate,
              ...(updatedLot.updatedAt && { updatedAt: updatedLot.updatedAt }),
            }
          : lot,
      ),
    }));
    setEditingHarvestLot(null);
    addToast({
      type: "success",
      message: `Cherry lot ${formatHarvestLotId(updatedLot)} updated.`,
    });
  };

  // A refused cherry-lot edit or delete that means the list is stale: the lot
  // was processed (409) or removed (404) since it loaded. Reload so it stops
  // showing as Ready with actions that can only fail again.
  const isStaleCherryLotError = (message: string) =>
    /already been processed|not found/i.test(message);

  const handleHarvestLotEditError = (message: string) => {
    addToast({ type: "error", message });
    if (isStaleCherryLotError(message)) {
      setEditingHarvestLot(null);
      void refreshData();
    }
  };

  const handleDeleteHarvestLot = (lot: HarvestLot) => {
    if (deletingHarvestLotId) return;
    const lotLabel = formatHarvestLotId(lot);
    setPendingDelete({
      title: `Delete cherry lot ${lotLabel}${lot.farmerName ? ` from ${lot.farmerName}` : ""}?`,
      message: "This cannot be undone.",
      confirmLabel: "Delete lot",
      run: () => deleteHarvestLotNow(lot, lotLabel),
    });
  };

  const deleteHarvestLotNow = async (lot: HarvestLot, lotLabel: string) => {
    setDeletingHarvestLotId(lot.id);
    try {
      // The workbench lists only Ready lots, so ask the backend to refuse
      // (not cascade) if this one has been processed since — Admin included.
      await deleteHarvestLot(lot.id, { ifUnprocessed: true });
      setData((prev) => ({
        ...prev,
        harvestLots: prev.harvestLots.filter((h) => h.id !== lot.id),
      }));
      addToast({
        type: "success",
        message: `Cherry lot ${lotLabel} deleted.`,
      });
    } catch (error) {
      console.error("Failed to delete harvest lot:", error);
      const message =
        error instanceof Error ? error.message : "Failed to delete cherry lot.";
      addToast({ type: "error", message });
      if (isStaleCherryLotError(message)) void refreshData();
    } finally {
      setDeletingHarvestLotId(null);
    }
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

        // Sanity check only: the whole cherry lot is consumed regardless of
        // this figure, but parchment can never weigh more than the cherry it
        // came from. Same sentence as the server-side check.
        const cherryWeightKg = getHarvestLotCherryWeight(selectedHarvestLot);
        if (parchmentWeightKg > cherryWeightKg) {
          setFormError(
            `Parchment weight (${parchmentWeightKg.toFixed(2)} kg) cannot exceed the cherry lot weight (${cherryWeightKg.toFixed(2)} kg).`,
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

        // Drying dates are optional now. Only enforce ordering when both
        // sides are filled — partial entry is allowed and the processor
        // can complete the timeline later with Edit on the parchment lot
        // (EditProcessingBatchModal).
        if (
          dryingStartDate &&
          dryingEndDate &&
          new Date(dryingEndDate) < new Date(dryingStartDate)
        ) {
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

          logger.debug("Creating processing batch with payload", { batchPayload });

          const batch = await addProcessingBatch(batchPayload);

          // Hide the source lot even if the following bulk refresh fails.
          setData((prev) => ({
            ...prev,
            harvestLots: prev.harvestLots.map((lot) => lot.id === batch.harvestLotId
              ? { ...lot, status: "Complete", remainingWeightKg: 0 }
              : lot),
            processingBatches: [...prev.processingBatches.filter((item) => item.id !== batch.id), batch],
          }));

          logger.debug("Processing batch created successfully!");

          // Show success toast
          addToast({
            type: "success",
            message: `Processing batch ${formatProcessingBatchId(batch)} recorded.`,
          });

          // Close modal and reset form on success
          setModal(null);
          setSelectedHarvestLot(null);
          setCropYearId("");
          setDryingStartDate("");
          setDryingEndDate("");
          setFormError(null);

          // The save has finished. Load the new parchment stock after closing
          // the form so a slow refresh cannot look like an unfinished process.
          await refreshData();
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
        if (greenWeight > selectedParchment.currentWeightKg) {
          setFormError(
            `Total Green Bean Weight (${greenWeight.toFixed(2)} kg) cannot exceed Parchment Weight (${selectedParchment.currentWeightKg.toFixed(2)} kg)`,
          );
          return;
        }
        if (Math.abs(gradedWeightSum - greenWeight) > 0.01) {
          setFormError(
            "The sum of the weights for the graded lots must exactly match the total green bean weight.",
          );
          return;
        }
        if (
          gradedLots.some(
            (lot) => !lot.grade || (parseFloat(lot.weight) || 0) <= 0,
          )
        ) {
          setFormError("Each graded lot must have a grade and weight greater than 0.");
          return;
        }
        if (hasDuplicateHullGrades) {
          setFormError(
            `Each graded lot must use a different grade. Duplicate grade: ${duplicateHullGrades.join(", ")}`,
          );
          return;
        }
        if (hasHullPriceError) {
          setFormError(
            "Fix the price per kg: leave it empty or enter a number above 0 with at most 2 decimals.",
          );
          return;
        }

        setIsSubmitting(true);
        try {
          const hulledParchmentId = selectedParchment.id;
          const { parchmentLot: hulledParchment, greenBeanLots: newGreenBeanLots } =
            await createParchmentWithdrawal(hulledParchmentId, {
              amountKg: selectedParchment.currentWeightKg,
              withdrawalType: "HullAndGrade",
              purpose: "Hull and grade",
              totalGreenBeanWeight: greenWeight,
              gradedLots: gradedLots.map((lot) => {
                const price = parseGradePrice(lot.price);
                return {
                  grade: lot.grade,
                  weight: parseFloat(lot.weight) || 0,
                  ...(price !== undefined && { price }),
                  score: lot.score ? parseFloat(lot.score) : undefined,
                };
              }),
            });

          // Show the new lots (with any price set here) and the used-up
          // parchment straight away, even if the reload below fails.
          setData((prev) => ({
            ...prev,
            parchmentLots: prev.parchmentLots.map((p) =>
              p.id === hulledParchmentId
                ? {
                    ...p,
                    currentWeightKg: hulledParchment.currentWeightKg,
                    status: hulledParchment.status,
                    withdrawalHistory:
                      hulledParchment.withdrawalHistory ?? p.withdrawalHistory,
                  }
                : p,
            ),
            greenBeanLots: [
              ...prev.greenBeanLots.filter(
                (g) => !newGreenBeanLots.some((n) => n.id === g.id),
              ),
              ...newGreenBeanLots,
            ],
          }));

          addToast({
            type: "success",
            message: "Hull and Grade Finished!",
          });

          setModal(null);
          setSelectedParchment(null);
          setTotalGreenWeight("");
          setGradedLots([
            { rowKey: newRowId(), grade: "Grade A", weight: "", price: "", score: "" },
          ]);
          setFormError(null);

          setTimeout(() => {
            greenBeanStockRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }, 100);

          // The save has finished and the new lots are already on screen.
          // Reload after closing the form so a slow refresh cannot hold the
          // popup open (same as Record Process).
          await refreshData();
        } catch (error: any) {
          console.error("Failed to hull and grade:", error);
          addToast({
            type: "error",
            message: error?.message || "Failed to hull and grade. Please try again.",
          });
          setFormError(error?.message || "Failed to save. Please try again.");
        } finally {
          setIsSubmitting(false);
        }
        break;

      case "withdrawStock": {
        if (!selectedGreenBean) return;
        const amountKg = parseFloat(formData.get("amountKg") as string);
        const purpose =
          (formData.get("purpose") as string) || withdrawalType;

        const detailsError = withdrawDetailsError(
          withdrawalType,
          withdrawDetails.details,
        );
        if (detailsError) {
          setFormError(detailsError);
          return;
        }

        setIsSubmitting(true);
        try {
          const { greenBeanLot: updatedLot, roasterInventoryItem } = await createWithdrawal(selectedGreenBean.id, {
            amountKg,
            withdrawalType,
            purpose,
            ...buildWithdrawDetailsPayload(
              withdrawalType,
              withdrawDetails.details,
            ),
          });
          // The lot's kg and history, and the roaster stock row a Roast
          // filled: stored with its lot's grade, score, variety and process
          // (the response row has none), so the roaster's card does not show
          // "GRADE —" until the next refresh.
          setData((prev) =>
            applyGreenBeanWithdrawal(
              prev,
              updatedLot,
              roasterInventoryItem,
              withdrawalType,
            ),
          );
          const roasterName = data.users.find(u => u.id === withdrawDetails.details.targetRoasterId)?.name;
          const lotLabel = formatGreenBeanId(selectedGreenBean);
          addToast({
            type: "success",
            message: roasterInventoryItem
              ? `Sent ${amountKg} kg of ${lotLabel} to ${roasterName || "the roaster"}.`
              : `Withdrew ${amountKg} kg from ${lotLabel}.`,
          });
          // Reset withdrawal form state
          setWithdrawalType("Sample");
          setWithdrawalAmount("");
          withdrawDetails.reset();
          setSelectedGreenBean(null);
          setFormError(null);
          setModal(null);
        } catch (err: any) {
          const msg =
            err?.message || "Could not withdraw the stock. Please try again.";
          setFormError(msg);
          addToast({ type: "error", message: msg });
          return;
        } finally {
          setIsSubmitting(false);
        }
        break;
      }

    }
  };

  // Record Process keeps its values in workbench state, so a cancelled lot's
  // drying dates, output or process type would otherwise be saved on the next
  // lot. Cleared whenever the popup opens and when it is cancelled.
  const resetRecordProcessForm = () => {
    setParchmentWeightInput('');
    setDryingStartDate("");
    setDryingEndDate("");
    setSelectedProcessType(
      defaultProcessTypeName(
        data.processTypes,
        data.processTypes.length === 0 ? EMPTY_LIST_PROCESS_TYPE : undefined,
      ),
    );
  };

  const openModal = (type: string, item: any) => {
    if (type === "startProcessing") {
      setSelectedHarvestLot(item);
      resetRecordProcessForm();
      setFormError(null);
      // Auto-select crop year from harvest lot if available, otherwise default to current
      if (item?.cropYearId) {
        setCropYearId(item.cropYearId);
      } else {
        setCropYearId(findCurrentCropYearId(data.cropYears));
      }
    }
    if (type === "hullAndGrade") {
      // The backend lets only the batch's processor, or an Admin, draw down
      // a parchment lot (bought-in parchment is Admin-only). The buttons are
      // hidden for anyone else; this keeps the popup shut too.
      if (!item || !canManageParchment(item)) return;
      setSelectedParchment(item);
    }
    if (type === "withdrawStock") {
      setSelectedGreenBean(item);
      setWithdrawalType("Sample");
      setWithdrawalAmount("");
      setFormError(null);
      // A cancelled Sale must not carry its customer or price to the next
      // lot. The Sale price starts at this lot's set price (still editable).
      withdrawDetails.reset(withdrawDetailsForLot(item));
    }
    setModal(type);
  };

  // The On sale / Hidden switch on a green bean card (stored as Available /
  // Withdrawn). Hiding a lot that still has kg asks first in a popup, since
  // a hidden lot cannot be withdrawn or claimed by a roaster; putting one
  // back on sale does not ask.
  const [hidingLot, setHidingLot] = useState<GreenBeanLot | null>(null);
  const [savingAvailability, setSavingAvailability] = useState(false);

  const saveAvailability = async (
    lot: GreenBeanLot,
    newStatus: GreenBeanLot["availabilityStatus"],
  ): Promise<boolean> => {
    setSavingAvailability(true);
    try {
      const updatedLot = await updateGreenBeanLotAvailability(lot.id, newStatus);
      // Only the status: the PUT response does not carry everything
      // bulk-load does, so swapping the whole lot in would drop data.
      setData((prev) => ({
        ...prev,
        greenBeanLots: prev.greenBeanLots.map((g) =>
          g.id === lot.id
            ? { ...g, availabilityStatus: updatedLot.availabilityStatus }
            : g,
        ),
      }));
      addToast({
        type: "success",
        message:
          updatedLot.availabilityStatus === "Available"
            ? `${formatGreenBeanId(lot)} is back on sale.`
            : `${formatGreenBeanId(lot)} is hidden from sale.`,
      });
      return true;
    } catch (err: any) {
      addToast({ type: "error", message: err?.message || "Could not change the lot's availability. Please try again." });
      return false;
    } finally {
      setSavingAvailability(false);
    }
  };

  const handleToggleAvailability = async (lotId: string) => {
    const lot = data.greenBeanLots.find((g) => g.id === lotId);
    if (!lot || savingAvailability) return;
    if (lot.currentWeightKg <= 0) {
      addToast({
        type: "error",
        message: "Cannot change availability for a depleted lot.",
      });
      return;
    }
    if (hideNeedsConfirm(lot)) {
      setHidingLot(lot);
      return;
    }
    await saveAvailability(lot, isOnSale(lot) ? "Withdrawn" : "Available");
  };

  const confirmHideLot = async () => {
    if (!hidingLot || savingAvailability) return;
    if (await saveAvailability(hidingLot, "Withdrawn")) setHidingLot(null);
  };

  // Merge only the price fields into the stored lot — the PUT response does
  // not carry everything bulk-load does, so swapping the whole object in
  // would drop data.
  const handlePriceSaved = (updatedLot: GreenBeanLot) => {
    setData((prev) => ({
      ...prev,
      greenBeanLots: prev.greenBeanLots.map((g) =>
        g.id === updatedLot.id
          ? {
              ...g,
              pricePerKg: updatedLot.pricePerKg,
              currency: updatedLot.currency,
              priceSetDate: updatedLot.priceSetDate,
              priceSetBy: updatedLot.priceSetBy,
            }
          : g,
      ),
    }));
    setPricingLot(null);
    addToast({
      type: "success",
      message: `Price for ${formatGreenBeanId(updatedLot)} set to ${formatMoney(updatedLot.pricePerKg ?? 0)} ${updatedLot.currency || "THB"}/kg`,
    });
  };

  // Whole-lot semantics: a cherry lot is either Ready (listed here) or
  // Complete (consumed by a processing batch and gone from this list).
  const readyForProcessingLots = useMemo(
    () => getReadyHarvestLots(data.harvestLots, data.processingBatches),
    [data.harvestLots, data.processingBatches],
  );

  const selectedCherryWeightKg = selectedHarvestLot
    ? getHarvestLotCherryWeight(selectedHarvestLot)
    : 0;

  const filteredHarvestLots = useMemo(
    () =>
      readyForProcessingLots.filter((lot) =>
        matchesLotSearch(harvestLotSearch, harvestLotSearchFields(lot)),
      ),
    [readyForProcessingLots, harvestLotSearch],
  );

  // The source records the parchment and green bean searches (and their
  // CSV exports) read a lot's farmer, variety and source lot from.
  const harvestLotById = useMemo(
    () => new Map(data.harvestLots.map((h) => [h.id, h])),
    [data.harvestLots],
  );
  const parchmentLotById = useMemo(
    () => new Map(data.parchmentLots.map((p) => [p.id, p])),
    [data.parchmentLots],
  );

  // Reset to page 1 when search changes
  useEffect(() => {
    setHarvestLotPage(1);
  }, [harvestLotSearch]);

  // Paginated harvest lots (newest first)
  const harvestLotTotalPages = Math.ceil(
    filteredHarvestLots.length / HARVEST_LOT_PAGE_SIZE,
  );
  // A delete, edit or Record Process can shrink the list under the current
  // page, so keep the page within it.
  const harvestLotPageSafe = Math.min(
    harvestLotPage,
    Math.max(1, harvestLotTotalPages),
  );
  const paginatedHarvestLots = useMemo(() => {
    // Sort by createdAt (when the lot entered the system) so the row that
    // just shows up with the "NEW" badge actually lands on page 1. Fall back
    // to harvestDate so legacy rows with no createdAt don't all collapse to
    // a single timestamp.
    const sorted = [...filteredHarvestLots].sort((a, b) => {
      const createdDiff =
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime();
      if (createdDiff !== 0) return createdDiff;
      return (
        new Date(b.harvestDate || 0).getTime() -
        new Date(a.harvestDate || 0).getTime()
      );
    });
    const startIndex = (harvestLotPageSafe - 1) * HARVEST_LOT_PAGE_SIZE;
    return sorted.slice(startIndex, startIndex + HARVEST_LOT_PAGE_SIZE);
  }, [filteredHarvestLots, harvestLotPageSafe]);

  // Card View pagination for Incoming Harvest Lots
  const harvestCardTotalPages = Math.ceil(
    filteredHarvestLots.length / ITEMS_PER_PAGE,
  );
  const harvestCardPageSafe = Math.min(
    harvestCardPage,
    Math.max(1, harvestCardTotalPages),
  );
  const paginatedHarvestCards = useMemo(() => {
    // Same sort as paginatedHarvestLots — keep card view + table view in
    // lockstep so NEW-badged rows always sit on page 1 of both.
    const sorted = [...filteredHarvestLots].sort((a, b) => {
      const createdDiff =
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime();
      if (createdDiff !== 0) return createdDiff;
      return (
        new Date(b.harvestDate || 0).getTime() -
        new Date(a.harvestDate || 0).getTime()
      );
    });
    const startIndex = (harvestCardPageSafe - 1) * ITEMS_PER_PAGE;
    return sorted.slice(
      startIndex,
      startIndex + ITEMS_PER_PAGE,
    );
  }, [filteredHarvestLots, harvestCardPageSafe]);




  // Search and sort apply in both views; the status and process filters only
  // exist in the data grid (see processedParchmentLots / kanbanParchmentLots).
  const searchedParchmentLots = useMemo(() => {
    const filtered = data.parchmentLots.filter((p) =>
      matchesLotSearch(
        parchmentSearch,
        parchmentSearchFields(
          p,
          p.harvestLotId ? harvestLotById.get(p.harvestLotId) : undefined,
          p.processingBatchId ? batchById.get(p.processingBatchId) : undefined,
        ),
      ),
    );

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

      const valA = a[key as keyof ParchmentLot];
      const valB = b[key as keyof ParchmentLot];
      if (valA != null && valB != null && valA < valB)
        return parchmentSortConfig.direction === "asc" ? -1 : 1;
      if (valA != null && valB != null && valA > valB)
        return parchmentSortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [data.parchmentLots, parchmentSearch, parchmentSortConfig, harvestLotById, batchById]);

  // Data grid: search plus the status and process filters in its header.
  const processedParchmentLots = useMemo(() => {
    let filtered = searchedParchmentLots;

    // Apply status filter
    if (parchmentStatusFilter !== "all") {
      filtered = filtered.filter((p) => p.status === parchmentStatusFilter);
    }

    // Apply process type filter
    if (parchmentProcessFilter !== "all") {
      const filterKey = processTypeKey(parchmentProcessFilter);
      filtered = filtered.filter(
        (p) => processTypeKey(p.processType) === filterKey,
      );
    }

    return filtered;
  }, [searchedParchmentLots, parchmentStatusFilter, parchmentProcessFilter]);

  const parchmentPageCount = Math.ceil(
    processedParchmentLots.length / ITEMS_PER_PAGE,
  );
  // The page number is shared with the workflow column, whose list can be
  // longer, so keep it within this list's pages.
  const gridParchmentPage = Math.min(
    parchmentCurrentPage,
    Math.max(1, parchmentPageCount),
  );
  const paginatedParchmentLots = processedParchmentLots.slice(
    (gridParchmentPage - 1) * ITEMS_PER_PAGE,
    gridParchmentPage * ITEMS_PER_PAGE,
  );

  // Parchment lots that have been split into green bean lots. The split
  // history button only appears for these; a lot still awaiting hulling has
  // nothing to show.
  const parchmentIdsWithGreenBeans = useMemo(
    () =>
      new Set(
        data.greenBeanLots
          .map((g) => g.parchmentLotId)
          .filter((id): id is string => Boolean(id)),
      ),
    [data.greenBeanLots],
  );

  // For Kanban view — show every parchment lot that still has stock so the
  // Withdraw/Hull & Grade buttons remain reachable. Fully-depleted Hulled lots
  // (currentWeightKg = 0) are hidden because nothing further can be done with
  // them from this card; they're still visible in the main Parchment table.
  // The workflow column has a search box but no status or process controls,
  // so the data grid's filters stay out of it: otherwise they would narrow
  // these cards (and their export) with nothing on screen saying so.
  const kanbanParchmentLots = useMemo(
    () => searchedParchmentLots.filter((p) => (p.currentWeightKg ?? 0) > 0),
    [searchedParchmentLots],
  );
  const kanbanParchmentPageCount = Math.ceil(kanbanParchmentLots.length / ITEMS_PER_PAGE);
  // The page number is shared with the data grid, whose list can be longer.
  const kanbanParchmentPage = Math.min(
    parchmentCurrentPage,
    Math.max(1, kanbanParchmentPageCount),
  );
  const paginatedKanbanParchmentLots = kanbanParchmentLots.slice(
    (kanbanParchmentPage - 1) * ITEMS_PER_PAGE,
    kanbanParchmentPage * ITEMS_PER_PAGE,
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

  // Search and sort apply in both views; the status and grade filters only
  // exist in the data grid (see processedGreenBeanLots / kanbanGreenBeanLots).
  const searchedGreenBeanLots = useMemo(() => {
    const filtered = enrichedGreenBeanLots.filter((g) => {
      const parchment = g.parchmentLotId
        ? parchmentLotById.get(g.parchmentLotId)
        : undefined;
      const harvest = parchment?.harvestLotId
        ? harvestLotById.get(parchment.harvestLotId)
        : undefined;
      return matchesLotSearch(
        greenBeanSearch,
        greenBeanSearchFields(g, parchment, harvest),
      );
    });

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
  }, [enrichedGreenBeanLots, greenBeanSearch, greenBeanSortConfig, parchmentLotById, harvestLotById]);

  // Data grid: search plus the status and grade filters in its header.
  const processedGreenBeanLots = useMemo(() => {
    let filtered = searchedGreenBeanLots;

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

    return filtered;
  }, [searchedGreenBeanLots, greenBeanStatusFilter, greenBeanGradeFilter]);

  // Workflow column: lots still in stock that match its search. It has no
  // status or grade controls, so, like the parchment column, it always shows
  // stock on hand rather than whatever the data grid was last filtered to.
  const kanbanGreenBeanLots = useMemo(
    () => searchedGreenBeanLots.filter((g) => g.currentWeightKg > 0),
    [searchedGreenBeanLots],
  );

  // Aggregate on-hand Green Bean lots by grade so the processor sees one line
  // per grade with total weight + a breakdown of which parchment lots it came
  // from. Deliberately ignores the stock table's search and filters: this
  // panel sits above those controls, so it would otherwise change for no
  // visible reason. Rows follow the admin grade order, like the dropdowns.
  const greenBeanGradeSummary = useMemo(() => {
    type Source = {
      greenBeanId: string;
      greenBeanDisplayId: string;
      parchmentDisplayId: string;
      processType: string;
      weightKg: number;
    };
    type Row = {
      grade: string;
      totalWeight: number;
      lotCount: number;
      sources: Source[];
    };
    const byGrade = new Map<string, Row>();
    const parchmentById = new Map(data.parchmentLots.map((p) => [p.id, p]));
    let totalWeight = 0;

    for (const gbl of enrichedGreenBeanLots) {
      const weightKg = gbl.currentWeightKg ?? 0;
      if (weightKg <= 0) continue;

      const row =
        byGrade.get(gbl.grade) ?? {
          grade: gbl.grade,
          totalWeight: 0,
          lotCount: 0,
          sources: [],
        };
      row.totalWeight += weightKg;
      row.lotCount += 1;
      totalWeight += weightKg;

      const parchment = gbl.parchmentLotId
        ? parchmentById.get(gbl.parchmentLotId)
        : undefined;
      row.sources.push({
        greenBeanId: gbl.id,
        greenBeanDisplayId: formatGreenBeanId(gbl),
        parchmentDisplayId: parchment
          ? formatParchmentId(parchment)
          : gbl.sourceType === "External"
            ? "External"
            : "—",
        processType:
          parchment?.processType ?? gbl.externalSource?.processType ?? "—",
        weightKg,
      });
      byGrade.set(gbl.grade, row);
    }

    const gradeRank = new Map(gradeFilterNames.map((name, i) => [name, i]));
    const rows = Array.from(byGrade.values()).sort((a, b) => {
      const ra = gradeRank.get(a.grade) ?? Number.MAX_SAFE_INTEGER;
      const rb = gradeRank.get(b.grade) ?? Number.MAX_SAFE_INTEGER;
      return ra !== rb ? ra - rb : b.totalWeight - a.totalWeight;
    });

    return { rows, totalWeight };
  }, [enrichedGreenBeanLots, data.parchmentLots, gradeFilterNames]);

  const [expandedGradeSummaries, setExpandedGradeSummaries] = useState<
    Set<string>
  >(new Set());
  // Expanding a grade inserts its source rows below the clicked row; keep
  // that row where it was so the page does not jump.
  const { remember: rememberGradeRow, spacerRef: gradeSpacerRef } =
    useToggleScrollAnchor(expandedGradeSummaries);
  const toggleGradeSummary = useCallback((grade: string, el: HTMLElement) => {
    rememberGradeRow(el);
    setExpandedGradeSummaries((prev) => {
      const next = new Set(prev);
      if (next.has(grade)) next.delete(grade);
      else next.add(grade);
      return next;
    });
  }, [rememberGradeRow]);

  const greenBeanPageCount = Math.ceil(
    processedGreenBeanLots.length / ITEMS_PER_PAGE,
  );
  // Shared with the workflow column too; keep it within this list's pages.
  const gridGreenBeanPage = Math.min(
    greenBeanCurrentPage,
    Math.max(1, greenBeanPageCount),
  );
  const paginatedGreenBeanLots = processedGreenBeanLots.slice(
    (gridGreenBeanPage - 1) * ITEMS_PER_PAGE,
    gridGreenBeanPage * ITEMS_PER_PAGE,
  );
  const kanbanGreenBeanPageCount = Math.ceil(
    kanbanGreenBeanLots.length / ITEMS_PER_PAGE,
  );
  const kanbanGreenBeanPage = Math.min(
    greenBeanCurrentPage,
    Math.max(1, kanbanGreenBeanPageCount),
  );
  const paginatedKanbanGreenBeanLots = kanbanGreenBeanLots.slice(
    (kanbanGreenBeanPage - 1) * ITEMS_PER_PAGE,
    kanbanGreenBeanPage * ITEMS_PER_PAGE,
  );

  // CSV exports hold every lot the section lists under its current search
  // and filters, across all pages, in the order shown. With none, downloadCsv
  // says there is nothing to export instead of saving a header-only file.
  const searchFilterPart = (search: string) =>
    search.trim() ? `search ${search.trim()}` : null;

  const exportParchmentCsv = (
    lots: ParchmentLot[],
    filterParts: (string | null | false)[],
  ) => {
    const harvestById = new Map(data.harvestLots.map((h) => [h.id, h]));
    const batchById = new Map(data.processingBatches.map((b) => [b.id, b]));
    const headers = [
      "Parchment lot",
      "Batch",
      "Source lot",
      "Farmer / supplier",
      "Variety",
      "Process",
      "Status",
      "Initial weight (kg)",
      "Current weight (kg)",
      "Moisture (%)",
      "Created",
    ];
    const rows = lots.map((p) => {
      const harvest = p.harvestLotId ? harvestById.get(p.harvestLotId) : undefined;
      const batch = p.processingBatchId
        ? batchById.get(p.processingBatchId) ?? { id: p.processingBatchId }
        : undefined;
      const facts = parchmentLotFacts(p, harvest);
      return [
        formatParchmentId(p),
        batch ? formatProcessingBatchId(batch) : "",
        facts.sourceLot,
        facts.farmer,
        facts.variety,
        p.processType,
        formatParchmentStatus(p.status),
        csvFixed(p.initialWeightKg),
        csvFixed(p.currentWeightKg),
        p.moistureContent,
        csvDate(p.createdAt),
      ];
    });
    downloadCsv(csvFilename("parchment-stock", filterParts), headers, rows);
  };

  const exportGreenBeanCsv = (
    lots: GreenBeanLot[],
    filterParts: (string | null | false)[],
  ) => {
    const parchmentById = new Map(data.parchmentLots.map((p) => [p.id, p]));
    const harvestById = new Map(data.harvestLots.map((h) => [h.id, h]));
    const headers = [
      "Green bean lot",
      "Source lot",
      "Farmer / supplier",
      "Variety",
      "Process",
      "Grade",
      "Availability",
      "Initial weight (kg)",
      "Current weight (kg)",
      "Price per kg",
      "Currency",
      "Stock value",
      "Price set on",
      "Created",
    ];
    const rows = lots.map((g) => {
      const parchment = g.parchmentLotId
        ? parchmentById.get(g.parchmentLotId)
        : undefined;
      const harvest = parchment?.harvestLotId
        ? harvestById.get(parchment.harvestLotId)
        : undefined;
      const price = g.pricePerKg || undefined;
      const facts = greenBeanLotFacts(g, parchment, harvest);
      return [
        formatGreenBeanId(g),
        facts.sourceLot,
        facts.farmer,
        facts.variety,
        facts.process,
        g.grade,
        availabilityLabel(g),
        csvFixed(g.initialWeightKg),
        csvFixed(g.currentWeightKg ?? 0),
        csvFixed(price),
        price ? g.currency || "THB" : "",
        price ? csvFixed(price * (g.currentWeightKg ?? 0)) : "",
        csvDate(g.priceSetDate),
        csvDate(g.createdAt),
      ];
    });
    downloadCsv(csvFilename("green-bean-stock", filterParts), headers, rows);
  };

  const parchmentStatusLabel: Record<string, string> = {
    AwaitingHulling: "Awaiting Hulling",
    Hulled: "Hulled",
  };
  const greenBeanStatusLabel: Record<string, string> = {
    InStock: "In Stock",
    Depleted: "Depleted",
  };

  const exportParchmentTable = () =>
    exportParchmentCsv(processedParchmentLots, [
      searchFilterPart(parchmentSearch),
      parchmentStatusFilter !== "all" &&
        (parchmentStatusLabel[parchmentStatusFilter] ?? parchmentStatusFilter),
      parchmentProcessFilter !== "all" && parchmentProcessFilter,
    ]);
  const exportParchmentKanban = () =>
    exportParchmentCsv(kanbanParchmentLots, [
      searchFilterPart(parchmentSearch),
      "in stock",
    ]);
  const exportGreenBeanTable = () =>
    exportGreenBeanCsv(processedGreenBeanLots, [
      searchFilterPart(greenBeanSearch),
      greenBeanStatusFilter !== "all" &&
        (greenBeanStatusLabel[greenBeanStatusFilter] ?? greenBeanStatusFilter),
      greenBeanGradeFilter !== "all" && greenBeanGradeFilter,
    ]);
  const exportGreenBeanKanban = () =>
    exportGreenBeanCsv(kanbanGreenBeanLots, [
      searchFilterPart(greenBeanSearch),
      "in stock",
    ]);

  const tableView = (
    <div className="space-y-4">
      {/* Incoming Harvest Lots Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        {/* Header with search */}
        <div className="p-3 bg-green-50 border-b border-green-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-600 rounded-md">
              <Sprout className="h-4 w-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-gray-900">1 · Cherry Lots</h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white text-green-700 border border-green-200">
              {filteredHarvestLots.length}
            </span>
          </div>
          {/* min-h matches the filter selects in the other two headers, so
              all three header bands come out the same height */}
          <div className="relative w-full sm:w-56 sm:min-h-[46px] flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <DebouncedSearchInput
              placeholder="Search lot, farmer, variety..."
              value={harvestLotSearch}
              onSearch={onHarvestLotSearch}
              className="pl-9 w-full border border-green-200 bg-white rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-green-300 focus:border-green-300 outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Lot ID</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Variety</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Weight (kg)</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Farmer</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
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
                paginatedHarvestLots.map((lot) => {
                  const isNewLot = isRecentItem(lot.createdAt ?? lot.harvestDate);
                  const cherryWeight = getHarvestLotCherryWeight(lot);
                  return (
                    <tr
                      key={lot.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        <div className="flex items-center gap-2">
                          <span>{formatHarvestLotId(lot)}</span>
                            {isNewLot && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                              NEW
                            </span>
                          )}
                        </div>
                      </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {lot.cherryVariety}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-green-600">
                      {cherryWeight.toFixed(2)} kg
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {lot.farmerName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        Ready
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openModal("startProcessing", lot)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all"
                        >
                          <PlayCircle size={14} />
                          Record Process
                        </button>
                        {canManageCherryLots && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingHarvestLot(lot)}
                              className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-gray-100 transition-colors"
                              title="Edit cherry lot"
                              aria-label={`Edit cherry lot ${formatHarvestLotId(lot)}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteHarvestLot(lot)}
                              disabled={deletingHarvestLotId === lot.id}
                              className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              title="Delete cherry lot"
                              aria-label={`Delete cherry lot ${formatHarvestLotId(lot)}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={harvestLotPageSafe}
          totalPages={harvestLotTotalPages}
          onPageChange={setHarvestLotPage}
        />
      </div>

      {/* Parchment Stock Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        {/* Header with search and filters */}
        <div className="p-3 bg-amber-50 border-b border-amber-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500 rounded-md">
                <Box className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">2 · Parchment Stock</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white text-amber-700 border border-amber-200">
                {processedParchmentLots.length}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <DebouncedSearchInput
                  placeholder="Search lot, farmer, process..."
                  value={parchmentSearch}
                  onSearch={onParchmentSearch}
                  className="pl-9 w-full border border-amber-200 bg-white rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none"
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
                  className="w-[160px]"
                />
                <Select
                  options={[
                    { value: "all", label: "All Process" },
                    ...parchmentProcessFilterOptions,
                  ]}
                  value={parchmentProcessFilter}
                  onChange={(v) => {
                    setParchmentProcessFilter(v as string);
                    setParchmentCurrentPage(1);
                  }}
                  placeholder="Process"
                  className="w-[160px]"
                />
              </div>
              <ExportCsvButton
                onClick={exportParchmentTable}
                count={processedParchmentLots.length}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Lot ID
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Batch ID
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Weight (kg)
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Moisture (%)
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Process
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
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
                paginatedParchmentLots.map((p) => {
                  const isNewParchment = isRecentItem(p.createdAt);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        <div className="flex items-center gap-2">
                          <span>{formatParchmentId(p)}</span>
                          {isNewParchment && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                              NEW
                            </span>
                          )}
                        </div>
                      </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {formatProcessingBatchId(data.processingBatches.find(b => b.id === p.processingBatchId) || { id: p.processingBatchId ?? '' })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {(p.status === "Hulled"
                        ? (p.initialWeightKg ?? 0)
                        : (p.currentWeightKg ?? 0)
                      ).toFixed(2)}{" "}
                      kg
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {p.moistureContent ?? 0}%
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ProcessTypePill
                        type={p.processType}
                        processTypes={data.processTypes}
                      />
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
                      <div className="flex items-center gap-2">
                        {parchmentIdsWithGreenBeans.has(p.id) ? (
                          <button
                            type="button"
                            onClick={() => setSelectedParchmentForHistory(p)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                            title="View Green Bean Lots"
                            aria-label={`History of parchment lot ${formatParchmentId(p)}`}
                          >
                            <History className="h-4 w-4" />
                          </button>
                        ) : (
                          // Keeps Hull & Grade lined up with the rows above.
                          <span className="w-8 h-8" aria-hidden="true" />
                        )}
                        {batchOfParchment(p) &&
                        (dryingLogCount(p) > 0 || canEditDryingLog(p)) ? (
                          <button
                            type="button"
                            onClick={() => openDryingLog(p)}
                            className="relative inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                            title={`Drying log (${dryingLogCount(p)} reading${dryingLogCount(p) === 1 ? "" : "s"})`}
                            aria-label={`Drying log of ${formatParchmentId(p)}`}
                          >
                            <Wind className="h-4 w-4" />
                            {dryingLogCount(p) > 0 && (
                              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-[10px] font-bold leading-4 text-white">
                                {dryingLogCount(p)}
                              </span>
                            )}
                          </button>
                        ) : (
                          <span className="w-8 h-8" aria-hidden="true" />
                        )}
                        {/* Hull & Grade, Edit and Delete: the lot's
                            processor or an Admin only (recordAccess). */}
                        {canManageParchment(p) && (
                          <>
                            <button
                              onClick={() => openModal("hullAndGrade", p)}
                              disabled={
                                p.status === "Hulled" || p.currentWeightKg <= 0
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md text-white bg-sky-600 hover:bg-sky-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm transition-all"
                              title="Hull & Grade — split this parchment into green bean lots"
                            >
                              <PlayCircle size={14} />
                              Hull &amp; Grade
                            </button>
                            <button
                              type="button"
                              onClick={() => openParchmentEdit(p)}
                              className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-gray-100 transition-colors"
                              title={isOnlyLotOfBatch(p) ? "Edit batch and parchment" : "Edit parchment lot"}
                              aria-label={`Edit parchment lot ${formatParchmentId(p)}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteParchmentRecord(p)}
                              disabled={deletingRecordId !== null}
                              className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              title={isOnlyLotOfBatch(p) ? "Delete batch and parchment" : "Delete parchment lot"}
                              aria-label={`Delete parchment lot ${formatParchmentId(p)}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
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
          currentPage={gridParchmentPage}
          totalPages={parchmentPageCount}
          onPageChange={setParchmentCurrentPage}
        />
      </div>

      {/* Green Bean Grade Summary — on-hand stock per grade with source
          trace. Same shell as the numbered sections around it. */}
      {greenBeanGradeSummary.rows.length > 0 && (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <div className="p-3 bg-teal-50 border-b border-teal-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-teal-500 rounded-md">
                <Layers className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">Green Bean Stock by Grade</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white text-teal-700 border border-teal-200">
                {greenBeanGradeSummary.rows.length}
              </span>
            </div>
            {/* min-h matches the filter selects in the neighbouring headers */}
            <div className="sm:min-h-[46px] flex items-center gap-1.5 text-sm text-gray-600">
              Total in stock
              <span className="font-bold text-teal-700">
                {greenBeanGradeSummary.totalWeight.toFixed(2)} kg
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Grade</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Lots</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Weight (kg)</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Share</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {greenBeanGradeSummary.rows.map((row) => {
                  const isExpanded = expandedGradeSummaries.has(row.grade);
                  const sharePct =
                    greenBeanGradeSummary.totalWeight > 0
                      ? (row.totalWeight / greenBeanGradeSummary.totalWeight) * 100
                      : 0;
                  return (
                    <React.Fragment key={row.grade}>
                      {/* The whole row toggles; the button inside carries
                          keyboard focus and aria-expanded, and its click
                          bubbles up to this handler. */}
                      <tr
                        onClick={(e) => toggleGradeSummary(row.grade, e.currentTarget)}
                        className={`cursor-pointer transition-colors ${isExpanded ? "bg-teal-50/40" : "hover:bg-gray-50"}`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            className="inline-flex items-center gap-2 text-left"
                          >
                            <ChevronDown
                              className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            />
                            {row.grade}
                          </button>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {row.lotCount}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900">
                          {row.totalWeight.toFixed(2)} kg
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {sharePct.toFixed(1)}%
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={4} className="px-4 pb-3 pt-1 bg-teal-50/40">
                            {/* Bounded so a grade with many sources cannot
                                push the rest of the page a full screen down. */}
                            <div className="max-h-72 sm:max-h-80 overflow-y-auto rounded-md border border-gray-200 bg-white">
                              <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-slate-50 sticky top-0">
                                  <tr>
                                    <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Green Bean Lot</th>
                                    <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                                    <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Process</th>
                                    <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Weight (kg)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {row.sources.map((s) => (
                                    <tr key={s.greenBeanId}>
                                      <td className="px-4 py-2 whitespace-nowrap text-sm font-semibold text-gray-900">
                                        {s.greenBeanDisplayId}
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                                        {s.parchmentDisplayId}
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap">
                                        <ProcessTypePill
                                          type={s.processType}
                                          processTypes={data.processTypes}
                                        />
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap text-sm font-semibold text-gray-900">
                                        {s.weightKg.toFixed(2)} kg
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Green Bean Stock Table */}
      <div
        ref={greenBeanStockRef}
        className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200"
      >
        {/* Header with search and filters */}
        <div className="p-3 bg-teal-50 border-b border-teal-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-teal-500 rounded-md">
                <Coffee className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">3 · Green Bean Stock</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white text-teal-700 border border-teal-200">
                {processedGreenBeanLots.length}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <DebouncedSearchInput
                  placeholder="Search lot, farmer, grade..."
                  value={greenBeanSearch}
                  onSearch={onGreenBeanSearch}
                  className="pl-9 w-full border border-teal-200 bg-white rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-teal-300 focus:border-teal-300 outline-none"
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
                className="w-[160px]"
              />
              <Select
                options={greenBeanGradeFilterOptions}
                value={greenBeanGradeFilter}
                onChange={(v) => {
                  setGreenBeanGradeFilter(v as string);
                  setGreenBeanCurrentPage(1);
                }}
                placeholder="Grade"
                className="w-[160px]"
              />
              <ExportCsvButton
                onClick={exportGreenBeanTable}
                count={processedGreenBeanLots.length}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Lot ID
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Grade
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Weight (kg)
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Price/kg
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Total Amount
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  QC Score
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Availability
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
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
                  const isNewGreenBean = isRecentItem(g.createdAt);
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
                        <div className="flex items-center gap-2">
                          <span>{formatGreenBeanId(g)}</span>
                          {isNewGreenBean && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                              NEW
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {g.grade}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {(g.currentWeightKg ?? 0).toFixed(2)} kg
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {g.pricePerKg ? (
                          <span className="text-teal-600">
                            {formatMoney(g.pricePerKg)} {g.currency || "THB"}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900">
                        {g.pricePerKg ? (
                          <span className="text-teal-700">
                            {formatMoney(g.pricePerKg * (g.currentWeightKg ?? 0))}{" "}
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
                          {availabilityLabel(g)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const hasWithdrawalHistory =
                              g.withdrawalHistory &&
                              g.withdrawalHistory.length > 0;
                            return (
                              <>
                          <button
                            type="button"
                            onClick={() => setSelectedGreenBeanForSource(g)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
                            title="View Source Lot"
                            aria-label={`Source of green bean lot ${formatGreenBeanId(g)}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedGreenBeanForHistory(g)}
                            aria-label={`${hasWithdrawalHistory ? "Withdrawal history of" : "No withdrawal history yet for"} green bean lot ${formatGreenBeanId(g)}`}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 transition-colors ${
                              hasWithdrawalHistory
                                ? "text-gray-500 hover:bg-gray-50"
                                : "text-gray-300"
                            }`}
                            title={
                              hasWithdrawalHistory
                                ? "View Withdrawal History"
                                : "No withdrawal history yet"
                            }
                          >
                            <History className="h-4 w-4" />
                          </button>
                          {canManageLot(g) && (
                            <>
                          <button
                            onClick={() => setScoringLot(g)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 transition-colors"
                          >
                            <Star size={14} />
                            QC Score
                          </button>
                          <button
                            type="button"
                            onClick={() => setPricingLot(g)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 transition-colors"
                            title={g.pricePerKg ? "Edit price" : "Set price"}
                          >
                            <DollarSign size={14} />
                            Price
                          </button>
                          <button
                            onClick={() => openModal("withdrawStock", g)}
                            disabled={g.availabilityStatus === "Withdrawn"}
                            title={withdrawBlockedTitle(g)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md text-white bg-sky-600 hover:bg-sky-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm transition-all"
                          >
                            <PlayCircle size={14} />
                            Withdraw
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingGreenBean(g)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-gray-100 transition-colors"
                            title="Edit grade or weight"
                            aria-label={`Edit green bean lot ${formatGreenBeanId(g)}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGreenBeanLot(g.id)}
                            disabled={deletingRecordId !== null}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            title="Delete green bean lot"
                            aria-label={`Delete green bean lot ${formatGreenBeanId(g)}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                            </>
                          )}
                              </>
                            );
                          })()}
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
          currentPage={gridGreenBeanPage}
          totalPages={greenBeanPageCount}
          onPageChange={setGreenBeanCurrentPage}
        />
      </div>

      {/* Holds page height after a grade collapses near the bottom; see
          useToggleScrollAnchor. Inline margin opts out of space-y-4. */}
      <div ref={gradeSpacerRef} aria-hidden="true" style={{ marginTop: 0 }} />
    </div>
  );

  // Three equal columns read left-to-right as the pipeline the header
  // describes: cherry -> parchment -> green bean. Every column shares one
  // shell (header, hint, search, card stack, pager) so nothing on the page
  // is laid out by a different rule than its neighbour. The grid stretches
  // all three to the tallest, and each card stack is flex-1, so the three
  // pagers line up along one bottom edge instead of each column ending
  // wherever its last card happens to.
  const kanbanView = (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* 1 · Cherry Lots */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200 flex flex-col">
        <div className="p-3 bg-green-50 border-b border-green-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-600 rounded-md">
              <Sprout className="h-4 w-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-gray-900">1 · Cherry Lots</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-semibold bg-white text-green-700 border border-green-200">
              {readyForProcessingLots.length}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Record a process to turn these into parchment
          </p>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <DebouncedSearchInput
              placeholder="Search lot, farmer, variety..."
              value={harvestLotSearch}
              onSearch={onHarvestLotSearch}
              className="pl-9 w-full border border-green-200 bg-white rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-green-300 focus:border-green-300 outline-none"
            />
          </div>
        </div>
        <div className="p-3 space-y-2 flex-1">
          {paginatedHarvestCards.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Sprout className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No cherry lots waiting</p>
            </div>
          ) : (
            paginatedHarvestCards.map((lot) => {
              const isNewLot = isRecentItem(lot.createdAt ?? lot.harvestDate);
              const cherryWeight = getHarvestLotCherryWeight(lot);
              return (
                <div
                  key={lot.id}
                  className="bg-white border-l-4 border-l-green-500 rounded-lg p-3 border border-gray-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate" title={formatHarvestLotId(lot)}>
                        {formatHarvestLotId(lot)}
                      </p>
                      {isNewLot && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-green-50 text-green-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        Ready
                      </span>
                      {canManageCherryLots && (
                        <>
                          {/* -my-1 keeps the hit area without making the row taller */}
                          <button
                            type="button"
                            onClick={() => setEditingHarvestLot(lot)}
                            className="ml-1 p-1 -my-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-gray-100 transition-colors"
                            title="Edit cherry lot"
                            aria-label={`Edit cherry lot ${formatHarvestLotId(lot)}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHarvestLot(lot)}
                            disabled={deletingHarvestLotId === lot.id}
                            className="p-1 -my-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            title="Delete cherry lot"
                            aria-label={`Delete cherry lot ${formatHarvestLotId(lot)}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5 text-gray-500 mb-3">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Leaf className="h-3 w-3" />
                        Variety
                      </span>
                      <span className="font-medium text-gray-900">
                        {lot.cherryVariety}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Scale className="h-3 w-3" />
                        Weight
                      </span>
                      <span className="font-medium text-green-600">
                        {cherryWeight.toFixed(2)} kg
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <UserIcon className="h-3 w-3" />
                        Farmer
                      </span>
                      <span className="font-medium text-gray-900 truncate min-w-0 ml-3" title={lot.farmerName}>
                        {lot.farmerName}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        Harvested
                      </span>
                      <span className="font-medium text-gray-900">
                        {formatDateDisplay(toDateOnly(lot.harvestDate), undefined, "-")}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => openModal("startProcessing", lot)}
                    className="w-full py-2 text-xs font-semibold rounded-md text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all inline-flex items-center justify-center gap-1.5"
                  >
                    <PlayCircle size={14} />
                    Record Process
                  </button>
                </div>
              );
            })
          )}
        </div>
        <Pagination
          currentPage={harvestCardPageSafe}
          totalPages={harvestCardTotalPages}
          onPageChange={setHarvestCardPage}
        />
      </div>

      {/* 2 · Parchment Stock */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200 flex flex-col">
        <div className="p-3 bg-amber-50 border-b border-amber-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500 rounded-md">
              <Box className="h-4 w-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-gray-900">2 · Parchment Stock</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-semibold bg-white text-amber-700 border border-amber-200">
              {kanbanParchmentLots.length}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Hull &amp; grade to turn these into green beans
          </p>
          <div className="flex items-stretch gap-2 mt-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <DebouncedSearchInput
                placeholder="Search lot, farmer, process..."
                value={parchmentSearch}
                onSearch={onParchmentSearch}
                className="pl-9 w-full border border-amber-200 bg-white rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none"
              />
            </div>
            <ExportCsvButton
              compact
              onClick={exportParchmentKanban}
              count={kanbanParchmentLots.length}
            />
          </div>
        </div>
        <div className="p-3 space-y-2 flex-1">
          {paginatedKanbanParchmentLots.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Box className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No parchment in stock</p>
            </div>
          ) : (
            paginatedKanbanParchmentLots.map((p) => {
              const isNewParchment = isRecentItem(p.createdAt);
              const sourceLot = p.harvestLotId
                ? data.harvestLots.find((h) => h.id === p.harvestLotId)
                : undefined;
              // The left edge is the process-type colour, as on the Parchment page.
              const edgeClass =
                p.status === "Hulled"
                  ? "border-l-gray-300"
                  : processTypeColors(data.processTypes, p.processType).accent;
              return (
                <div
                  key={p.id}
                  className={`bg-white border-l-4 ${edgeClass} rounded-lg p-3 border border-gray-200 hover:shadow-md transition-all`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate" title={formatParchmentId(p)}>
                        {formatParchmentId(p)}
                      </p>
                      {isNewParchment && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedParchmentForHistory(p)}
                        className="p-1 rounded-md border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                        title="View history"
                        aria-label={`History of parchment lot ${formatParchmentId(p)}`}
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${p.status === "Hulled" ? "bg-gray-100 text-gray-600" : "bg-emerald-50 text-emerald-700"}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${p.status === "Hulled" ? "bg-gray-400" : "bg-emerald-500"}`}
                        ></span>
                        {p.status === "Hulled" ? "Hulled" : "In stock"}
                      </span>
                      {canManageParchment(p) && (
                        <>
                          {/* -my-1 keeps the hit area without making the row taller */}
                          <button
                            type="button"
                            onClick={() => openParchmentEdit(p)}
                            className="p-1 -my-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-gray-100 transition-colors"
                            title={isOnlyLotOfBatch(p) ? "Edit batch and parchment" : "Edit parchment lot"}
                            aria-label={`Edit parchment lot ${formatParchmentId(p)}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteParchmentRecord(p)}
                            disabled={deletingRecordId !== null}
                            className="p-1 -my-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            title={isOnlyLotOfBatch(p) ? "Delete batch and parchment" : "Delete parchment lot"}
                            aria-label={`Delete parchment lot ${formatParchmentId(p)}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5 text-gray-500 mb-3">
                    <div className="flex justify-between items-center gap-2">
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        <Coffee className="h-3 w-3" />
                        Process
                      </span>
                      {/* No nowrap here: a long name wraps inside the narrow column. */}
                      <ProcessTypePill
                        type={p.processType}
                        processTypes={data.processTypes}
                        className="inline-block min-w-0 max-w-full px-2 py-0.5 rounded-full text-xs font-medium border text-right break-words"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Scale className="h-3 w-3" />
                        Weight
                      </span>
                      <span className="font-medium text-gray-900">
                        {(p.status === "Hulled"
                          ? (p.initialWeightKg ?? 0)
                          : (p.currentWeightKg ?? 0)
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
                    {batchOfParchment(p) &&
                      (dryingLogCount(p) > 0 || canEditDryingLog(p)) && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5">
                            <Wind className="h-3 w-3" />
                            Drying log
                          </span>
                          <button
                            type="button"
                            onClick={() => openDryingLog(p)}
                            className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                            title="Drying readings: moisture, temperature and humidity"
                            aria-label={`Drying log of ${formatParchmentId(p)}`}
                          >
                            {dryingLogCount(p) > 0
                              ? `${dryingLogCount(p)} reading${dryingLogCount(p) === 1 ? "" : "s"}`
                              : "Add readings"}
                          </button>
                        </div>
                      )}
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Sprout className="h-3 w-3" />
                        Source
                      </span>
                      <span className="font-medium text-gray-900 truncate min-w-0 ml-3">
                        {sourceLot
                          ? formatHarvestLotId(sourceLot)
                          : p.externalSource
                            ? "External"
                            : "-"}
                      </span>
                    </div>
                  </div>

                  {/* Another processor's lot (or bought-in parchment) is
                      listed without it: the backend would refuse (403). */}
                  {canManageParchment(p) && (
                    <button
                      onClick={() => openModal("hullAndGrade", p)}
                      disabled={p.status === "Hulled" || p.currentWeightKg <= 0}
                      className="w-full py-2 text-xs font-semibold rounded-md text-white bg-sky-600 hover:bg-sky-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm transition-all inline-flex items-center justify-center gap-1.5"
                      title="Hull & Grade — split this parchment into green bean lots"
                    >
                      <PlayCircle size={14} />
                      Hull &amp; Grade
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
        <Pagination
          currentPage={kanbanParchmentPage}
          totalPages={kanbanParchmentPageCount}
          onPageChange={setParchmentCurrentPage}
        />
      </div>

      {/* 3 · Green Bean Stock */}
      <div
        ref={greenBeanStockRef}
        className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200 flex flex-col"
      >
        <div className="p-3 bg-teal-50 border-b border-teal-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-teal-500 rounded-md">
              <Coffee className="h-4 w-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-gray-900">3 · Green Bean Stock</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-semibold bg-white text-teal-700 border border-teal-200">
              {kanbanGreenBeanLots.length}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Withdraw to sell, or send for roasting
          </p>
          <div className="flex items-stretch gap-2 mt-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <DebouncedSearchInput
                placeholder="Search lot, farmer, grade..."
                value={greenBeanSearch}
                onSearch={onGreenBeanSearch}
                className="pl-9 w-full border border-teal-200 bg-white rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-teal-300 focus:border-teal-300 outline-none"
              />
            </div>
            <ExportCsvButton
              compact
              onClick={exportGreenBeanKanban}
              count={kanbanGreenBeanLots.length}
            />
          </div>
        </div>
        <div className="p-3 space-y-2 flex-1">
          {paginatedKanbanGreenBeanLots.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Coffee className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No green bean lots</p>
            </div>
          ) : (
            paginatedKanbanGreenBeanLots.map((g) => {
              const isNewGreenBean = isRecentItem(g.createdAt);
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
              const hasWithdrawalHistory =
                g.withdrawalHistory && g.withdrawalHistory.length > 0;

              return (
                <div
                  key={g.id}
                  className={`bg-white border-l-4 ${g.availabilityStatus === "Withdrawn" ? "border-l-gray-300" : "border-l-teal-500"} rounded-lg p-3 border border-gray-200 hover:shadow-md transition-all`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate" title={formatGreenBeanId(g)}>
                        {formatGreenBeanId(g)}
                      </p>
                      {isNewGreenBean && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedGreenBeanForSource(g)}
                        className="p-1 rounded-md border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                        title="Source"
                        aria-label={`Source of green bean lot ${formatGreenBeanId(g)}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedGreenBeanForHistory(g)}
                        className={`p-1 rounded-md border transition-colors ${
                          hasWithdrawalHistory
                            ? "border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                            : "border-gray-100 text-gray-300"
                        }`}
                        title={hasWithdrawalHistory ? "History" : "No history yet"}
                        aria-label={`${hasWithdrawalHistory ? "Withdrawal history of" : "No withdrawal history yet for"} green bean lot ${formatGreenBeanId(g)}`}
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                      {/* The switch saves through the same owner-only PUT
                          as the price, so on another user's lot the status
                          shows without it. */}
                      {canManageLot(g) ? (
                        <button
                          type="button"
                          onClick={() => handleToggleAvailability(g.id)}
                          disabled={g.currentWeightKg <= 0 || savingAvailability}
                          title={availabilityToggleTitle(g)}
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${g.availabilityStatus === "Available" ? "bg-teal-50 text-teal-700 hover:bg-teal-100" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${g.availabilityStatus === "Available" ? "bg-teal-500" : "bg-gray-400"}`}
                          ></span>
                          {availabilityLabel(g)}
                        </button>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${g.availabilityStatus === "Available" ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-600"}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${g.availabilityStatus === "Available" ? "bg-teal-500" : "bg-gray-400"}`}
                          ></span>
                          {availabilityLabel(g)}
                        </span>
                      )}
                      {canManageLot(g) && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingGreenBean(g)}
                            className="p-1 -my-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-gray-100 transition-colors"
                            title="Edit grade or weight"
                            aria-label={`Edit green bean lot ${formatGreenBeanId(g)}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGreenBeanLot(g.id)}
                            disabled={deletingRecordId !== null}
                            className="p-1 -my-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            title="Delete green bean lot"
                            aria-label={`Delete green bean lot ${formatGreenBeanId(g)}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5 text-gray-500 mb-3">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Star className="h-3 w-3" />
                        Grade
                      </span>
                      <span className="font-medium text-gray-900">{g.grade}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Scale className="h-3 w-3" />
                        Weight
                      </span>
                      <span className="font-medium text-gray-900">
                        {(g.currentWeightKg ?? 0).toFixed(2)} kg
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <DollarSign className="h-3 w-3" />
                        Price
                      </span>
                      {g.pricePerKg ? (
                        <span className="flex items-center gap-1 min-w-0">
                          <span className="font-medium text-teal-600 truncate">
                            {formatMoney(g.pricePerKg)} {g.currency || "THB"}/kg
                            <span className="font-normal text-gray-400">
                              {" "}· {formatMoney(g.pricePerKg * (g.currentWeightKg ?? 0))} total
                            </span>
                          </span>
                          {canManageLot(g) && (
                            <button
                              type="button"
                              onClick={() => setPricingLot(g)}
                              className="p-0.5 rounded text-gray-400 hover:text-blue-600 hover:bg-gray-100 transition-colors flex-shrink-0"
                              title="Edit price"
                              aria-label={`Edit price of ${formatGreenBeanId(g)}`}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ) : canManageLot(g) ? (
                        <button
                          type="button"
                          onClick={() => setPricingLot(g)}
                          className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                          aria-label={`Set price of ${formatGreenBeanId(g)}`}
                        >
                          Set price
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Activity className="h-3 w-3" />
                        QC Score
                      </span>
                      {displayScore ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-900">{displayScore}</span>
                          {scoreValue >= 80 && (
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </div>
                  </div>

                  {canManageLot(g) && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setScoringLot(g)}
                        className="flex-1 py-2 text-xs font-medium rounded-md text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <Star size={14} />
                        QC Score
                      </button>
                      <button
                        onClick={() => openModal("withdrawStock", g)}
                        disabled={g.availabilityStatus === "Withdrawn"}
                        title={withdrawBlockedTitle(g)}
                        className="flex-1 py-2 text-xs font-semibold rounded-md text-white bg-sky-600 hover:bg-sky-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm transition-all inline-flex items-center justify-center gap-1.5"
                      >
                        <PlayCircle size={14} />
                        Withdraw
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <Pagination
          currentPage={kanbanGreenBeanPage}
          totalPages={kanbanGreenBeanPageCount}
          onPageChange={setGreenBeanCurrentPage}
        />
      </div>
    </div>
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
                Cherry → process → parchment → hull &amp; grade → green bean.
                Roasting is over in the Roaster workbench.
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

      {viewMode === "kanban" ? kanbanView : tableView}

      {modal && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col"
            >
              {/* Any edit clears the error banner: it described the values
                  as they were at the last Save. */}
              <form
                onSubmit={handleSubmit}
                onChange={() => setFormError(null)}
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
                    {/* Compact Header */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-600 rounded-xl shadow-md">
                          <PlayCircle className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">Record Process</h2>
                          <p className="text-xs text-gray-500">
                            Lot #{formatHarvestLotId(selectedHarvestLot)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-right">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Variety</p>
                          <p className="text-sm font-bold text-gray-800 leading-tight">{selectedHarvestLot.cherryVariety}</p>
                        </div>
                        <div className="w-px h-8 bg-gray-200" />
                        <div className="text-right">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Whole Lot Weight</p>
                          <p className="text-sm font-bold text-green-600 leading-tight">{selectedCherryWeightKg.toFixed(2)} kg</p>
                        </div>
                        <div className="w-px h-8 bg-gray-200" />
                        <div className="text-right">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Farmer</p>
                          <p className="text-sm font-bold text-gray-800 leading-tight">{selectedHarvestLot.farmerName}</p>
                        </div>
                      </div>
                    </div>


                    <div className="space-y-4">
                      {/* Process Type */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Process Type
                        </label>
                        <ProcessTypeChips
                          value={selectedProcessType}
                          onChange={(v) => {
                            setSelectedProcessType(v);
                            setFormError(null);
                          }}
                          processTypes={data.processTypes}
                        />
                        <input type="hidden" name="processType" value={selectedProcessType} />
                      </div>

                      {/* Crop Year */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Crop Year
                        </label>
                        <CropYearChips
                          // The lot's own year stays a choice after another is picked.
                          years={selectableCropYears(data.cropYears, [
                            selectedHarvestLot?.cropYearId,
                            cropYearId,
                          ])}
                          value={cropYearId}
                          onChange={(v) => {
                            setCropYearId(v);
                            setFormError(null);
                          }}
                        />
                      </div>

                      {/* Process Notes */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Process Notes
                        </label>
                        <textarea
                          id="processNotes"
                          name="processNotes"
                          rows={2}
                          placeholder="e.g., Ferment 24h in sealed tank, raised-bed drying..."
                          className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                        />
                      </div>

                      {/* Parchment Weight + Moisture Row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            Parchment Output (kg)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            name="parchmentWeightKg"
                            placeholder="e.g., 85.0"
                            required
                            value={parchmentWeightInput}
                            onChange={(e) => setParchmentWeightInput(e.target.value)}
                            className="block w-full h-[46px] border border-gray-300 rounded-xl px-4 text-lg font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            Coffee Moisture (%)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            name="moistureContent"
                            placeholder="e.g., 12.0"
                            required
                            className="block w-full h-[46px] border border-gray-300 rounded-xl px-4 text-lg font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                        </div>
                      </div>

                      {/* Drying Dates Row — both optional */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <DatePicker
                            value={dryingStartDate}
                            onChange={(v) => {
                              setDryingStartDate(v);
                              setFormError(null);
                            }}
                            label="Drying Start Date"
                          />
                          <input type="hidden" name="dryingStartDate" value={dryingStartDate} />
                        </div>
                        <div>
                          <DatePicker
                            value={dryingEndDate}
                            onChange={(v) => {
                              setDryingEndDate(v);
                              setFormError(null);
                            }}
                            label="Drying End Date"
                          />
                          <input type="hidden" name="dryingEndDate" value={dryingEndDate} />
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
                        {/* Compact Header */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-amber-600 rounded-xl shadow-md">
                              <PackageCheck className="h-6 w-6 text-white" />
                            </div>
                            <div>
                              <h2 className="text-xl font-bold text-gray-900">Hull & Grade</h2>
                              <p className="text-xs text-gray-500">
                                Parchment #{formatParchmentId(selectedParchment)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="text-right">
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Weight</p>
                              <p className="text-lg font-bold text-amber-600 leading-tight">
                                {selectedParchment.currentWeightKg.toFixed(2)}
                                <span className="text-xs font-normal text-gray-400 ml-1">kg</span>
                              </p>
                            </div>
                            <div className="w-px h-8 bg-gray-200" />
                            <div className="text-right">
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Moisture</p>
                              <p className="text-lg font-bold text-blue-600 leading-tight">
                                {selectedParchment.moistureContent}%
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Hulling-loss banner (only when over-allocated) */}
                        {exceedsParchmentWeight && (
                          <div className="mb-4 flex items-center gap-2 bg-red-50 rounded-lg p-2.5 border border-red-200">
                            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                            <p className="text-xs font-semibold text-red-700">
                              Total exceeds parchment weight ({selectedParchment.currentWeightKg.toFixed(2)} kg)
                            </p>
                          </div>
                        )}

                        {/* Divider */}
                        <div className="relative mb-3">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200"></div>
                          </div>
                          <div className="relative flex justify-center">
                            <span className="bg-white px-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                              Graded Lots
                            </span>
                          </div>
                        </div>

                        {/* Column headers (phones label each field instead) */}
                        <div className="hidden sm:grid grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 px-3 mb-1">
                          <span />
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Grade</span>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Weight (kg)</span>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            Price / kg <span className="normal-case font-semibold tracking-normal">(optional)</span>
                          </span>
                          <span />
                        </div>

                        {/* Graded Lots — # | Grade | Weight | Price / kg | delete.
                            On phones: # | Grade | delete, then Weight | Price. */}
                        <div className="space-y-2 mb-3">
                          {gradedLots.map((lot, index) => (
                            <div
                              key={lot.rowKey}
                              className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_2rem] sm:grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 items-start bg-gray-50 rounded-xl p-3 border border-gray-200"
                            >
                              <div className="col-start-1 row-start-1 h-[38px] flex items-center">
                                <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                                  <span className="text-white font-bold text-sm">
                                    {index + 1}
                                  </span>
                                </div>
                              </div>
                              <div className="col-start-2 col-span-2 row-start-1 sm:col-span-1 min-w-0">
                                <GradeDropdown
                                  value={lot.grade}
                                  onChange={(value) => {
                                    // A button list, not a native input: the
                                    // form's onChange never sees this pick.
                                    setFormError(null);
                                    setGradedLots(
                                      gradedLots.map((l, i) =>
                                        i === index ? { ...l, grade: value } : l,
                                      ),
                                    );
                                  }}
                                  index={index}
                                  usedGrades={selectedHullGrades}
                                />
                              </div>
                              <div className="col-start-1 col-span-2 row-start-2 sm:col-start-3 sm:col-span-1 sm:row-start-1 min-w-0">
                                <span className="sm:hidden block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                                  Weight (kg)
                                </span>
                                <input
                                  type="number"
                                  step="0.1"
                                  placeholder="0.00"
                                  aria-label={`Weight (kg), row ${index + 1}`}
                                  value={lot.weight}
                                  onChange={(e) =>
                                    setGradedLots(
                                      gradedLots.map((l, i) =>
                                        i === index ? { ...l, weight: e.target.value } : l,
                                      ),
                                    )
                                  }
                                  required
                                  className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                                />
                              </div>
                              <div className="col-start-3 col-span-2 row-start-2 sm:col-start-4 sm:col-span-1 sm:row-start-1 min-w-0">
                                <span className="sm:hidden block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                                  Price / kg <span className="normal-case font-semibold tracking-normal">(optional)</span>
                                </span>
                                <GradePriceInput
                                  value={lot.price}
                                  onChange={(value) =>
                                    setGradedLots(
                                      gradedLots.map((l, i) =>
                                        i === index ? { ...l, price: value } : l,
                                      ),
                                    )
                                  }
                                  row={index + 1}
                                />
                              </div>
                              <div className="col-start-4 row-start-1 sm:col-start-5 h-[38px] flex items-center justify-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormError(null);
                                    setGradedLots(gradedLots.filter((_, i) => i !== index));
                                  }}
                                  disabled={gradedLots.length <= 1}
                                  aria-label={`Remove row ${index + 1}`}
                                  className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Add Grade Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setFormError(null);
                            setGradedLots([
                              ...gradedLots,
                              { rowKey: newRowId(), grade: "", weight: "", price: "", score: "" },
                            ]);
                          }}
                          disabled={!canAddMoreHullGrades}
                          className="w-full py-2.5 border border-dashed border-green-300 rounded-xl text-xs font-bold text-green-600 hover:bg-green-50 hover:border-green-400 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Plus size={14} /> Add Grade
                        </button>

                        {hasDuplicateHullGrades && (
                          <div className="mt-3 flex items-start gap-2 bg-red-50 rounded-lg p-3 border border-red-200">
                            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs font-semibold text-red-700">
                              Each graded lot must use a different grade. Duplicate grade:{" "}
                              {duplicateHullGrades.join(", ")}
                            </p>
                          </div>
                        )}

                        {/* Summary Bar — Total + Yield vs Parchment */}
                        {(() => {
                          const parchmentKg = selectedParchment.currentWeightKg;
                          const yieldPct = parchmentKg > 0
                            ? (gradedWeightSum / parchmentKg) * 100
                            : 0;
                          const hasError =
                            exceedsParchmentWeight || hasDuplicateHullGrades;
                          // A bad price is flagged on its own row; it only
                          // holds back "Ready to confirm" here.
                          const isComplete =
                            !hasError && !hasHullPriceError && gradedWeightSum > 0;
                          return (
                            <div className={`mt-4 rounded-xl p-3 border transition-colors ${hasError ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                              {/* Yield bar (sum vs parchment) */}
                              <div className="h-1.5 w-full bg-gray-200 rounded-full mb-2.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${hasError ? "bg-red-400" : isComplete ? "bg-green-400" : "bg-yellow-400"}`}
                                  style={{ width: `${Math.min(100, yieldPct)}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Total</span>
                                  <span className={`text-2xl font-extrabold ${hasError ? "text-red-600" : "text-green-600"}`}>
                                    {gradedWeightSum.toFixed(2)}
                                  </span>
                                  <span className="text-sm font-bold text-gray-500">kg</span>
                                  <span className="text-xs text-gray-400 ml-2">
                                    yield {yieldPct.toFixed(1)}%
                                  </span>
                                </div>
                                {isComplete && <Check className="h-5 w-5 text-green-500" />}
                                {hasError && <AlertCircle className="h-5 w-5 text-red-500" />}
                              </div>
                              <GradeSplitValue rows={gradedLots} />
                              {exceedsParchmentWeight && (
                                <p className="text-[11px] font-semibold text-red-600 mt-1">
                                  Total exceeds parchment weight ({parchmentKg.toFixed(2)} kg)
                                </p>
                              )}
                              {isComplete && (
                                <p className="text-[11px] font-semibold text-green-600 mt-1">
                                  Ready to confirm
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}
                {modal === "withdrawStock" && selectedGreenBean && (
                  <>
                    {/* Compact Header */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-600 rounded-xl shadow-md">
                          <Minus className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">
                            Withdraw Stock
                          </h2>
                          <p className="text-xs text-gray-500">
                            Lot #{formatGreenBeanId(selectedGreenBean)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-right">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Stock</p>
                          <p className="text-lg font-bold text-green-600 leading-tight">
                            {selectedGreenBean.currentWeightKg.toFixed(2)}
                            <span className="text-xs font-normal text-gray-400 ml-1">kg</span>
                          </p>
                        </div>
                        <div className="w-px h-8 bg-gray-200" />
                        <div className="text-right">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Grade</p>
                          <p className="text-lg font-bold text-gray-800 leading-tight">{selectedGreenBean.grade}</p>
                        </div>
                      </div>
                    </div>

                    {/* Withdrawal Type - Visual Cards */}
                    <div className="mb-5">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                        Withdrawal Type
                      </label>
                      <div className="grid grid-cols-5 gap-2">
                        {([
                          { value: "Sale", icon: DollarSign, color: "blue", label: "Sale" },
                          { value: "Roasting Stock", icon: Flame, color: "orange", label: "Roast" },
                          { value: "Sample", icon: Beaker, color: "purple", label: "Sample" },
                          { value: "Export", icon: Globe, color: "emerald", label: "Export" },
                          { value: "Other", icon: MoreHorizontal, color: "gray", label: "Other" },
                        ] as const).map((type) => {
                          const isActive = withdrawalType === type.value;
                          const colorMap: Record<string, { active: string; ring: string }> = {
                            blue: { active: "bg-blue-50 border-blue-400 text-blue-700", ring: "ring-blue-200" },
                            orange: { active: "bg-orange-50 border-orange-400 text-orange-700", ring: "ring-orange-200" },
                            purple: { active: "bg-purple-50 border-purple-400 text-purple-700", ring: "ring-purple-200" },
                            emerald: { active: "bg-emerald-50 border-emerald-400 text-emerald-700", ring: "ring-emerald-200" },
                            gray: { active: "bg-gray-100 border-gray-400 text-gray-700", ring: "ring-gray-200" },
                          };
                          const c = colorMap[type.color];
                          return (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => {
                                setWithdrawalType(type.value as typeof withdrawalType);
                                setFormError(null);
                              }}
                              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                                isActive
                                  ? `${c.active} ring-2 ${c.ring} shadow-sm`
                                  : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"
                              }`}
                            >
                              <type.icon className="h-5 w-5" />
                              <span className="text-[11px] font-semibold leading-tight">{type.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sale / Roasting Stock fields (shared with the Parchment page) */}
                    <WithdrawDetailsFields
                      type={withdrawalType}
                      {...withdrawDetails.fieldsProps}
                      onChange={(details) => {
                        withdrawDetails.fieldsProps.onChange(details);
                        setFormError(null);
                      }}
                      className="mb-5"
                    />

                    {/* Amount + Purpose Row */}
                    <div className="grid grid-cols-5 gap-3 mb-5">
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Amount (kg){" "}
                          <span className="font-normal normal-case tracking-normal text-gray-400">
                            max {selectedGreenBean.currentWeightKg.toFixed(2)}
                          </span>
                        </label>
                        <input
                          type="number"
                          max={selectedGreenBean.currentWeightKg}
                          step="0.1"
                          name="amountKg"
                          required
                          value={withdrawalAmount}
                          onChange={(e) => setWithdrawalAmount(e.target.value)}
                          placeholder="0.0"
                          className="block w-full h-[46px] border border-gray-300 rounded-xl px-4 text-lg font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Purpose / Notes
                        </label>
                        <input
                          type="text"
                          name="purpose"
                          placeholder="e.g., Order #123, Sample roast..."
                          className="block w-full h-[46px] border border-gray-300 rounded-xl px-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>

                    {/* Live Preview Bar */}
                    {(() => {
                      const amt = parseFloat(withdrawalAmount) || 0;
                      const remaining = Math.max(0, selectedGreenBean.currentWeightKg - amt);
                      const pct = selectedGreenBean.currentWeightKg > 0
                        ? (remaining / selectedGreenBean.currentWeightKg) * 100
                        : 0;
                      const total = withdrawSaleTotal(
                        withdrawalType,
                        amt,
                        withdrawDetails.details,
                      );
                      const isOver = amt > selectedGreenBean.currentWeightKg;
                      return (
                        <div className={`rounded-xl p-3 border transition-colors ${isOver ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                          {/* Progress bar */}
                          <div className="h-1.5 w-full bg-gray-200 rounded-full mb-3 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${isOver ? "bg-red-400" : pct > 30 ? "bg-green-400" : pct > 0 ? "bg-yellow-400" : "bg-red-400"}`}
                              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 text-sm">
                              <div>
                                <span className="text-gray-400 text-[10px] uppercase tracking-wider">Before</span>
                                <p className="font-bold text-gray-600">{selectedGreenBean.currentWeightKg.toFixed(2)} kg</p>
                              </div>
                              <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
                              <div>
                                <span className="text-gray-400 text-[10px] uppercase tracking-wider">After</span>
                                <p className={`font-bold ${isOver ? "text-red-600" : "text-green-600"}`}>
                                  {isOver ? "Exceeds stock!" : `${remaining.toFixed(2)} kg`}
                                </p>
                              </div>
                            </div>
                            {total !== null && (
                              <div className="text-right">
                                <span className="text-gray-400 text-[10px] uppercase tracking-wider">Total</span>
                                <p className="font-bold text-blue-600">
                                  {formatWithdrawTotal(total, withdrawDetails.details.currency)}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
                <div className="mt-8 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setModal(null);
                      setFormError(null);
                      setSelectedHarvestLot(null);
                      setCropYearId("");
                      if (modal === "startProcessing") {
                        resetRecordProcessForm();
                      }
                      if (modal === "hullAndGrade") {
                        resetHullAndGradeForm();
                      }
                    }}
                    className="px-6 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 border border-transparent shadow-sm text-sm font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-all"
                    disabled={
                      isSubmitting ||
                      (modal === "hullAndGrade" &&
                        (Math.abs(
                          gradedWeightSum - (parseFloat(totalGreenWeight) || 0),
                        ) > 0.01 ||
                          hasDuplicateHullGrades ||
                          hasHullPriceError ||
                          gradedLots.some(
                            (lot) =>
                              !lot.grade ||
                              (parseFloat(lot.weight) || 0) <= 0,
                          ) ||
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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col">
              <div className="p-5 sm:p-6 overflow-y-auto">
                {/* Header — title left, the lot's figures inline on the right,
                    matching the Hull & Grade modal in this file. They used to
                    sit in a separate amber card below, which cost a screen of
                    height before the first input. */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-600 rounded-xl shadow-md">
                      <Star className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        QC Score
                      </h2>
                      <p className="text-xs text-gray-500">
                        Lot #{formatGreenBeanId(scoringLot)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Grade
                      </p>
                      <p className="text-lg font-bold text-gray-900 leading-tight">
                        {scoringLot.grade}
                      </p>
                    </div>
                    <div className="w-px h-8 bg-gray-200" />
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Weight
                      </p>
                      <p className="text-lg font-bold text-gray-900 leading-tight">
                        {scoringLot.currentWeightKg.toFixed(2)}
                        <span className="text-xs font-normal text-gray-400 ml-1">
                          kg
                        </span>
                      </p>
                    </div>
                    <div className="w-px h-8 bg-gray-200" />
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Current Score
                      </p>
                      <p className="text-lg font-bold text-amber-600 leading-tight">
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

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] gap-5">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-bold text-gray-800">Sensory Scores</h3>
                        <p className="text-xs text-gray-500">Rate each attribute from 1 to 10</p>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">SCA</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SCA_SENSORY_ATTRIBUTES.map((attr) => {
                      const { value, error } = sensoryScores[attr];
                      return (
                        <div key={attr}>
                          <label
                            htmlFor={attr}
                            className="block text-xs font-semibold text-gray-600 mb-1"
                          >
                            {attr}
                          </label>
                          <input
                            type="number"
                            id={attr}
                            aria-label={`${attr} score`}
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
                            onWheel={(e) => e.currentTarget.blur()}
                            className={`w-full h-10 px-3 border rounded-lg shadow-sm text-sm text-center ${error ? "border-red-500" : "border-gray-300"}`}
                          />
                          {error && (
                            <p className="text-xs text-red-600 mt-1">{error}</p>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                  <div className="space-y-5">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-sm font-bold text-gray-800">Cup Quality</h3>
                          <p className="text-xs text-gray-500">Select cups scored as good</p>
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">5 cups</span>
                      </div>
                      {SCA_CUP_ATTRIBUTES.map((attr) => {
                        const count = cupScores[attr];
                        return (
                          <div key={attr} className="mb-3 last:mb-0">
                            <div className="flex justify-between items-center mb-1.5">
                              <label className="text-xs font-semibold text-gray-600">
                                {attr}
                              </label>
                              <span className="text-sm font-bold text-gray-800">
                                {count * 2}/10
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <button
                                  type="button"
                                  key={`${attr}-rating-${i + 1}`}
                                  aria-label={`${attr}: ${(i + 1) * 2} of 10`}
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
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <label className="text-sm font-medium text-gray-700">
                        Defects (subtract)
                      </label>
                      <div className="flex items-center gap-4 mt-2">
                        <div>
                          <label className="text-xs"># of cups</label>
                          <input
                            type="number"
                            min="0"
                            aria-label="Number of defective cups"
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
                    <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200 space-y-2">
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
                          &minus; {detailedCalculations.defectsTotal.toFixed(2)}
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
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Tasting Notes & Comments
                      </label>
                      <textarea
                        rows={5}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        maxLength={2000}
                        placeholder="Describe flavor notes, aroma, body, aftertaste..."
                        className="block w-full border border-gray-300 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-sm transition-all resize-none"
                      ></textarea>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-5 pt-4 border-t border-gray-100 flex justify-end space-x-3">
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

      {selectedGreenBeanForSource && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col">
              <div className="p-6 sm:p-8">
                {/* Header — same compact shape as the QC Score modal */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 bg-teal-500 rounded-xl shadow-md">
                    <Eye className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Green Bean Source
                    </h2>
                    <p className="text-xs text-gray-500">
                      Lot {formatGreenBeanId(selectedGreenBeanForSource)}
                    </p>
                  </div>
                </div>

                {(() => {
                  const sourceParchment = data.parchmentLots.find(
                    (p) => p.id === selectedGreenBeanForSource.parchmentLotId,
                  );
                  const sourceHarvest = data.harvestLots.find(
                    (h) => h.id === sourceParchment?.harvestLotId,
                  );
                  const sourceBatch = data.processingBatches.find(
                    (b) => b.id === sourceParchment?.processingBatchId,
                  );
                  const externalSource =
                    selectedGreenBeanForSource.sourceType === "External"
                      ? selectedGreenBeanForSource.externalSource
                      : null;

                  return (
                    <>
                      {externalSource ? (
                        <div className="bg-blue-50 rounded-xl p-4 mb-5 border border-blue-100">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            External Source
                          </p>
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                Origin
                              </p>
                              <p className="font-semibold text-gray-900">
                                {externalSource.originName}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                Process
                              </p>
                              <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                                <ProcessTypeDot
                                  type={externalSource.processType}
                                  processTypes={data.processTypes}
                                />
                                {externalSource.processType}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                Variety
                              </p>
                              <p className="font-semibold text-gray-900">
                                {externalSource.variety}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                Purchase Date
                              </p>
                              <p className="font-semibold text-gray-900">
                                {formatDateDisplay(toDateOnly(externalSource.purchaseDate), undefined, "-")}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                Price
                              </p>
                              <p className="font-semibold text-gray-900">
                                {formatMoney(externalSource.pricePerKg)} {externalSource.currency}
                              </p>
                            </div>
                            {externalSource.producerName && (
                              <div>
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                  Producer
                                </p>
                                <p className="font-semibold text-gray-900">
                                  {externalSource.producerName}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : sourceParchment ? (
                        <>
                          <div className="bg-amber-50 rounded-xl p-4 mb-5 border border-amber-100">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                  Parchment Lot
                                </p>
                                <p className="text-xl font-bold text-amber-700">
                                  {formatParchmentId(sourceParchment)}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  Batch {formatProcessingBatchId(sourceBatch || { id: sourceParchment.processingBatchId ?? '' })}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                  Process
                                </p>
                                <p className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                  <ProcessTypeDot
                                    type={sourceParchment.processType}
                                    processTypes={data.processTypes}
                                  />
                                  {sourceParchment.processType}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {formatParchmentStatus(sourceParchment.status)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                Weight (kg)
                              </p>
                              <p className="font-semibold text-gray-900">
                                {(sourceParchment.status === "Hulled"
                                  ? sourceParchment.initialWeightKg
                                  : sourceParchment.currentWeightKg
                                ).toFixed(2)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                Moisture
                              </p>
                              <p className="font-semibold text-gray-900">
                                {sourceParchment.moistureContent}%
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                Harvest Lot
                              </p>
                              <p className="font-semibold text-gray-900">
                                {sourceHarvest?.displayId || sourceHarvest?.id?.substring(0, 8).toUpperCase() || "-"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                Farmer
                              </p>
                              <p className="font-semibold text-gray-900">
                                {sourceHarvest?.farmerName || "-"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-5 flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedGreenBeanForSource(null);
                                setSelectedParchmentForHistory(sourceParchment);
                              }}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all"
                            >
                              <History className="h-4 w-4" />
                              View Parchment History
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-10 text-gray-400">
                          <Box className="h-12 w-12 mx-auto mb-2 opacity-30" />
                          <p className="text-sm font-medium">
                            No parchment source found for this lot
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Close Button */}
                <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedGreenBeanForSource(null)}
                    className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {selectedParchmentForHistory && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col">
              {/* Scrolls as a whole on short screens: the lot's own
                  withdrawals sit under its green bean lots. */}
              <div className="p-6 sm:p-8 min-h-0 overflow-y-auto">
                {(() => {
                  const relatedGreenBeans = data.greenBeanLots.filter(
                    (g) => g.parchmentLotId === selectedParchmentForHistory.id,
                  );
                  const totalCurrentWeight = relatedGreenBeans.reduce(
                    (sum, g) => sum + g.currentWeightKg,
                    0,
                  );
                  // The parchment lot's own withdrawals (Hull & Grade, and
                  // any Sale, Roasting Stock or Sample), loaded on open.
                  const parchmentWithdrawals =
                    selectedParchmentForHistory.withdrawalHistory ?? [];
                  const parchmentManaged = canManageParchment(
                    selectedParchmentForHistory,
                  );

                  return (
                    <>
                      {/* Header — title left, this lot's split totals
                          inline on the right, like the QC Score modal. */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mb-5">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-amber-500 rounded-xl shadow-md">
                            <History className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-gray-900">
                              Green Bean Split History
                            </h2>
                            <p className="text-xs text-gray-500">
                              Lot {formatParchmentId(selectedParchmentForHistory)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="text-right">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                              Lots created
                            </p>
                            <p className="text-lg font-bold text-gray-900 leading-tight">
                              {relatedGreenBeans.length}
                            </p>
                          </div>
                          <div className="w-px h-8 bg-gray-200" />
                          <div className="text-right">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                              Total weight
                            </p>
                            <p className="text-lg font-bold text-gray-900 leading-tight">
                              {totalCurrentWeight.toFixed(2)}
                              <span className="text-xs font-normal text-gray-400 ml-1">kg</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* History List */}
                      <div className="overflow-y-auto max-h-72 sm:max-h-80">
                        {relatedGreenBeans.length === 0 ? (
                          <div className="text-center py-10 text-gray-400">
                            <Coffee className="h-12 w-12 mx-auto mb-2 opacity-30" />
                            <p className="text-sm font-medium">
                              No green bean lots found for this parchment lot
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {relatedGreenBeans.map((g, index) => {
                              const displayScore = g.processorScore
                                ? g.processorScore.toFixed(1)
                                : g.cuppingScores?.length > 0
                                  ? (
                                      g.cuppingScores.reduce(
                                        (sum, c) => sum + c.score,
                                        0,
                                      ) / g.cuppingScores.length
                                    ).toFixed(1)
                                  : null;
                              const scoreValue = g.processorScore
                                ? g.processorScore
                                : g.cuppingScores?.length > 0
                                  ? g.cuppingScores.reduce(
                                      (sum, c) => sum + c.score,
                                      0,
                                    ) / g.cuppingScores.length
                                  : 0;

                              return (
                                <div
                                  key={g.id}
                                  className="bg-white rounded-xl p-4 border border-gray-200 hover:border-teal-300 transition-colors"
                                >
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <span className="text-white font-bold text-sm">
                                          #{index + 1}
                                        </span>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                                          Lot ID
                                        </p>
                                        <p className="text-sm font-bold text-gray-900">
                                          {formatGreenBeanId(g)}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                                        Weight
                                      </p>
                                      <p className="text-lg font-bold text-teal-700">
                                        {g.currentWeightKg.toFixed(2)} kg
                                      </p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
                                    <div>
                                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                        Grade
                                      </p>
                                      <p className="font-semibold text-gray-900">
                                        {g.grade}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                        Availability
                                      </p>
                                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full ${g.availabilityStatus === "Available" ? "bg-green-500" : "bg-gray-300"}`}
                                        ></span>
                                        {availabilityLabel(g)}
                                      </span>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                        QC Score
                                      </p>
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
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                        Price
                                      </p>
                                      {g.pricePerKg ? (
                                        <span className="text-sm font-semibold text-gray-900">
                                          {formatMoney(g.pricePerKg)} {g.currency || "THB"}/kg
                                        </span>
                                      ) : (
                                        <span className="text-sm text-gray-400">-</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                                    {g.withdrawalHistory &&
                                      g.withdrawalHistory.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedParchmentForHistory(null);
                                            setSelectedGreenBeanForHistory(g);
                                          }}
                                          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 transition-all"
                                          title="View Withdrawal History"
                                        >
                                          <History className="h-3.5 w-3.5" />
                                          History
                                        </button>
                                      )}
                                    {canManageLot(g) && (
                                      <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedParchmentForHistory(null);
                                        setScoringLot(g);
                                      }}
                                      className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 transition-all"
                                      title="QC Score"
                                    >
                                      <ClipboardCheck className="h-3.5 w-3.5" />
                                      QC Score
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedParchmentForHistory(null);
                                        setPricingLot(g);
                                      }}
                                      className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 transition-all"
                                      title={g.pricePerKg ? "Edit price" : "Set price"}
                                    >
                                      <DollarSign className="h-3.5 w-3.5" />
                                      Price
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedParchmentForHistory(null);
                                        openModal("withdrawStock", g);
                                      }}
                                      disabled={g.availabilityStatus === "Withdrawn"}
                                      className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-white bg-sky-600 hover:bg-sky-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all"
                                      title={withdrawBlockedTitle(g) ?? "Withdraw"}
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                      Withdraw
                                    </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* The lot's own withdrawals. Its owner and Admin
                          may Void one (a Hull & Grade also removes the green
                          bean lots it made) or edit a Sale (D7). A voided
                          one stays, struck through, and does not count. */}
                      <div
                        className="mt-5 pt-4 border-t border-gray-100"
                        data-testid="parchment-withdrawals"
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                            Parchment withdrawals ({parchmentWithdrawals.length})
                          </p>
                          {parchmentWithdrawals.length > 0 && (
                            <p className="text-[11px] text-gray-500">
                              Withdrawn{" "}
                              <span className="font-semibold text-gray-700">
                                {withdrawnKgTotal(parchmentWithdrawals).toFixed(2)} kg
                              </span>
                            </p>
                          )}
                        </div>
                        {parchmentHistory.status === "loading" ? (
                          <p className="text-xs text-gray-400 italic">
                            Loading withdrawals...
                          </p>
                        ) : parchmentHistory.status === "error" ? (
                          <p className="text-xs text-red-600">
                            Could not load this lot&apos;s withdrawals.{" "}
                            <button
                              type="button"
                              onClick={parchmentHistory.retry}
                              className="font-semibold text-sky-600 hover:text-sky-700"
                            >
                              Try again
                            </button>
                          </p>
                        ) : parchmentWithdrawals.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">
                            No withdrawals from this lot yet.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {parchmentWithdrawals.map((w, index) => {
                              const voided = isVoidedWithdrawal(w);
                              const target = {
                                kind: "parchment" as const,
                                lot: selectedParchmentForHistory,
                                withdrawal: w,
                              };
                              const madeLots =
                                w.withdrawalType === "HullAndGrade" && w.id
                                  ? data.greenBeanLots.filter(
                                      (g) => g.parchmentWithdrawalId === w.id,
                                    ).length
                                  : 0;
                              const sale =
                                w.withdrawalType === "Sale" && !w.saleDetailsHidden
                                  ? [
                                      w.customerName,
                                      w.salePrice
                                        ? `${formatMoney(w.salePrice)} ${w.currency || "THB"}/kg`
                                        : undefined,
                                      w.invoiceNumber ? `Invoice ${w.invoiceNumber}` : undefined,
                                    ].filter(Boolean)
                                  : [];
                              return (
                                <div
                                  key={w.id ?? `${w.date}-${w.withdrawalType}-${w.amountKg}-${index}`}
                                  data-testid="parchment-withdrawal-row"
                                  className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
                                    voided
                                      ? "bg-gray-50 border-gray-200 opacity-80"
                                      : "bg-white border-gray-200"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-gray-900">
                                        {withdrawalTypeLabel(w.withdrawalType)}
                                      </span>
                                      {voided && <VoidedTag />}
                                      <span className="text-gray-400">
                                        {formatDateDisplay(toDateOnly(w.date), undefined, "-")}
                                      </span>
                                    </div>
                                    {sale.length > 0 && (
                                      <p className="text-gray-600 truncate">
                                        {sale.join(" · ")}
                                      </p>
                                    )}
                                    {madeLots > 0 && (
                                      <p className="text-gray-500">
                                        Made {madeLots} green bean lot
                                        {madeLots === 1 ? "" : "s"}
                                      </p>
                                    )}
                                    {voided && (
                                      <VoidedNote
                                        voidedAt={w.voidedAt}
                                        voidedByName={
                                          data.users.find((u) => u.id === w.voidedById)?.name
                                        }
                                        voidReason={w.voidReason}
                                      />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span
                                      className={
                                        voided
                                          ? "font-semibold text-gray-400 line-through"
                                          : "font-bold text-amber-700"
                                      }
                                    >
                                      {w.amountKg.toFixed(2)} kg
                                    </span>
                                    <WithdrawalRowActions
                                      variant="compact"
                                      onEdit={
                                        canEditWithdrawalSale(parchmentManaged, w)
                                          ? () => withdrawalCorrections.openEdit(target)
                                          : undefined
                                      }
                                      onVoid={
                                        canVoidWithdrawal(parchmentManaged, w)
                                          ? () => withdrawalCorrections.openVoid(target)
                                          : undefined
                                      }
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                {/* Close Button */}
                <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedParchmentForHistory(null)}
                    className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Close
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
                {/* Header — title left, totals inline on the right, like
                    the QC Score modal. */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-teal-500 rounded-xl shadow-md">
                      <History className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        Withdrawal History
                      </h2>
                      <p className="text-xs text-gray-500">
                        Lot {formatGreenBeanId(selectedGreenBeanForHistory)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Withdrawals
                      </p>
                      {/* Voided rows stay listed but no longer count. */}
                      <p className="text-lg font-bold text-gray-900 leading-tight">
                        {activeWithdrawals(selectedGreenBeanForHistory.withdrawalHistory).length}
                      </p>
                      {(() => {
                        const voided =
                          (selectedGreenBeanForHistory.withdrawalHistory?.length || 0) -
                          activeWithdrawals(selectedGreenBeanForHistory.withdrawalHistory).length;
                        return voided > 0 ? (
                          <p className="text-[10px] text-red-600 leading-tight">
                            +{voided} voided
                          </p>
                        ) : null;
                      })()}
                    </div>
                    <div className="w-px h-8 bg-gray-200" />
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Total
                      </p>
                      <p className="text-lg font-bold text-gray-900 leading-tight">
                        {withdrawnKgTotal(
                          selectedGreenBeanForHistory.withdrawalHistory,
                        ).toFixed(2)}
                        <span className="text-xs font-normal text-gray-400 ml-1">kg</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* History List */}
                <div className="overflow-y-auto max-h-80">
                  {!selectedGreenBeanForHistory.withdrawalHistory ||
                  selectedGreenBeanForHistory.withdrawalHistory.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                      <History className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">
                        No withdrawal history yet
                      </p>
                    </div>
                  ) : (
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
                          // A voided row stays, greyed and struck through,
                          // and no longer counts in the totals above.
                          const voided = isVoidedWithdrawal(entry);
                          const lotManaged = canManageLot(selectedGreenBeanForHistory);
                          const correctionTarget = {
                            kind: "greenBean" as const,
                            lot: selectedGreenBeanForHistory,
                            withdrawal: entry,
                          };
                          const offerInvoice =
                            entry.withdrawalType === "Sale" &&
                            !entry.saleDetailsHidden &&
                            !voided;
                          const onEdit = canEditWithdrawalSale(lotManaged, entry)
                            ? () => withdrawalCorrections.openEdit(correctionTarget)
                            : undefined;
                          const onVoid = canVoidWithdrawal(lotManaged, entry)
                            ? () => withdrawalCorrections.openVoid(correctionTarget)
                            : undefined;

                          return (
                            <div
                              // Older records (and tests) may lack the
                              // backend id; then compose a content-stable key.
                              key={entry.id ?? `${selectedGreenBeanForHistory.id}-${entry.date}-${entry.withdrawalType}-${entry.amountKg}-${index}`}
                              data-testid="withdrawal-history-row"
                              className={
                                voided
                                  ? "bg-gray-50 rounded-xl p-4 border border-gray-200 opacity-80"
                                  : "bg-white rounded-xl p-4 border border-gray-200 hover:border-teal-300 transition-colors"
                              }
                            >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-8 h-8 ${voided ? "bg-gray-300" : "bg-teal-500"} rounded-lg flex items-center justify-center flex-shrink-0`}
                                >
                                  <span className="text-white font-bold text-sm">
                                    #{index + 1}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                                    Date
                                  </p>
                                  <p className="text-sm font-bold text-gray-900">
                                    {formatDateDisplay(toDateOnly(entry.date), undefined, "-")}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                                  Amount
                                </p>
                                <p
                                  className={
                                    voided
                                      ? "text-lg font-bold text-gray-400 line-through"
                                      : "text-lg font-bold text-teal-700"
                                  }
                                >
                                  {entry.amountKg.toFixed(2)} kg
                                </p>
                              </div>
                            </div>

                            {/* Withdrawal Type Badge */}
                            <div className="mb-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${badgeColor}`}
                                >
                                  {entry.withdrawalType}
                                </span>
                                {voided && <VoidedTag />}
                              </div>
                              {voided && (
                                <VoidedNote
                                  className="mt-1.5"
                                  voidedAt={entry.voidedAt}
                                  voidedByName={
                                    data.users.find((u) => u.id === entry.voidedById)?.name
                                  }
                                  voidReason={entry.voidReason}
                                />
                              )}
                            </div>

                            {/* Sale Information */}
                            {entry.withdrawalType === "Sale" &&
                              (entry.salePrice ||
                                entry.customerName ||
                                entry.invoiceNumber) && (
                                <div className="mb-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                                    Sale Details
                                  </p>
                                  <div className="space-y-1">
                                    {entry.salePrice && (
                                      <p className="text-sm text-gray-900">
                                        <span className="font-semibold">
                                          Price:
                                        </span>{" "}
                                        {formatMoney(entry.salePrice)}{" "}
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
                                        {formatMoney(entry.totalAmount)}{" "}
                                        {entry.currency || "THB"}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}

                            {/* Purpose/Notes. On someone else's lot the
                                backend withholds the purpose with the sale
                                (people type customer names into it), so the
                                row shows a dash. */}
                            {(entry.purpose ||
                              entry.notes ||
                              entry.saleDetailsHidden) && (
                              <div className="mb-3">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                                  {entry.notes ? "Notes" : "Purpose"}
                                </p>
                                <p className="text-sm text-gray-900">
                                  {entry.notes || entry.purpose || "—"}
                                </p>
                              </div>
                            )}

                            {/* Withdrawn By */}
                            {entry.withdrawnByName && (
                              <div className="mb-3">
                                <p className="text-xs text-gray-500">
                                  Withdrawn:{" "}
                                  <span className="font-semibold text-gray-700">
                                    {entry.withdrawnByName}
                                  </span>
                                </p>
                              </div>
                            )}

                            {/* Sale withdrawals link to their invoice. Not on
                                someone else's lot: the backend withheld the
                                sale, so the invoice would be a blank draft.
                                Nor on a voided sale, which never happened.
                                The lot's owner and Admin also get Edit (a
                                Sale's customer, price, invoice number) and
                                Void (D7). */}
                            {(offerInvoice || onEdit || onVoid) && (
                              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end gap-2">
                                {offerInvoice && (
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
                                <WithdrawalRowActions onEdit={onEdit} onVoid={onVoid} />
                              </div>
                            )}
                          </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </div>

                {/* Close Button */}
                <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedGreenBeanForHistory(null)}
                    className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {/* Rendered outside the workbench <form>: React bubbles a submit through
          portals, so inside it saving a customer would also submit the
          withdrawal. Its overlay sits above the Withdraw Stock popup. */}
      {withdrawDetails.newCustomerModal}
      {/* Void / Edit a withdrawal, above the history popup they open from. */}
      {withdrawalCorrections.modals}
      {pricingLot && (
        <SetPriceModal
          lot={pricingLot}
          onClose={() => setPricingLot(null)}
          onSaved={handlePriceSaved}
          onError={(message) => addToast({ type: "error", message })}
        />
      )}
      {editingHarvestLot && (
        <EditHarvestLotModal
          lot={editingHarvestLot}
          onClose={() => setEditingHarvestLot(null)}
          onSaved={handleHarvestLotSaved}
          onError={handleHarvestLotEditError}
        />
      )}
      {editingBatch && (
        <EditProcessingBatchModal
          batch={editingBatch.batch}
          parchmentLot={editingBatch.lot}
          cherryLot={data.harvestLots.find(
            (h) => h.id === editingBatch.batch.harvestLotId,
          )}
          processTypes={data.processTypes}
          onClose={() => setEditingBatch(null)}
          onSaved={handleBatchSaved}
          onError={handleCorrectionError}
        />
      )}
      {dryingLogFor && dryingLogBatch && (
        <DryingLogModal
          batch={dryingLogBatch}
          parchmentLot={data.parchmentLots.find(
            (p) => p.id === dryingLogFor.lotId,
          )}
          canEdit={canManageProcessingBatch(currentUser, dryingLogBatch)}
          onClose={() => setDryingLogFor(null)}
          onLogsChange={handleDryingLogChange}
          onError={handleCorrectionError}
        />
      )}
      {pendingDelete && (
        <ConfirmActionModal
          title={pendingDelete.title}
          message={pendingDelete.message}
          confirmLabel={pendingDelete.confirmLabel}
          cancelLabel="Keep"
          busy={confirmBusy}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmPendingDelete}
        />
      )}
      {hidingLot && (
        <HideLotModal
          lot={hidingLot}
          saving={savingAvailability}
          onCancel={() => setHidingLot(null)}
          onConfirm={confirmHideLot}
        />
      )}
      {editingParchment && (
        <EditParchmentLotModal
          lot={editingParchment}
          batch={batchOfParchment(editingParchment)}
          onClose={() => setEditingParchment(null)}
          onSaved={handleParchmentSaved}
          onError={handleCorrectionError}
        />
      )}
      {editingGreenBean && (
        <EditGreenBeanLotModal
          lot={editingGreenBean}
          parchmentLot={
            editingGreenBean.parchmentLotId
              ? data.parchmentLots.find(
                  (p) => p.id === editingGreenBean.parchmentLotId,
                )
              : undefined
          }
          greenBeanLots={data.greenBeanLots}
          onClose={() => setEditingGreenBean(null)}
          onSaved={handleGreenBeanSaved}
          onError={handleCorrectionError}
        />
      )}
      {invoiceView && (
        <InvoiceReceipt
          visible={true}
          onClose={() => setInvoiceView(null)}
          lot={invoiceView.lot}
          entry={invoiceView.lot.withdrawalHistory![invoiceView.entryIndex]}
          sellerName={
            data.users.find((u) => u.id === invoiceView.lot.createdById)?.name
          }
          canGeneratePublicLink={canManageLot(invoiceView.lot)}
          onPublicTraceIdGenerated={(publicTraceId) =>
            handleInvoicePublicTraceId(invoiceView.lot.id, publicTraceId)
          }
        />
      )}
    </div>
  );
};

export default ProcessorWorkbench;
