import React, { useState, useMemo, useCallback } from "react";
import ReactDOM from "react-dom";
import {
  User,
  ParchmentLot,
  HarvestLot,
} from "../../types";
import {
  Box,
  Search,
  Plus,
  Scale,
  Droplet,
  Package,
  History,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Leaf,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import {
  formatGreenBeanId,
  formatParchmentId,
} from "../../utils/formatDisplayId";
import {
  createParchmentWithdrawal,
  processAndHull,
} from "../../services/parchmentLotService";
import type {
  CreateParchmentWithdrawalInput,
  ProcessAndHullInput,
} from "../../services/parchmentLotService";
import ProcessAndHullModal from "./modals/ProcessAndHullModal";
import ParchmentWithdrawModal from "./modals/ParchmentWithdrawModal";
import ExcelImportModal from "./modals/ExcelImportModal";
import { useToast } from "../../contexts/ToastContext";
import { useDataContext } from "../../hooks/useDataContext";

// ---------------------------------------------------------------------------
// Portal helper
// ---------------------------------------------------------------------------
const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  ReactDOM.createPortal(children, document.body);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface ParchmentTabProps {
  currentUser: User;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const ParchmentTab: React.FC<ParchmentTabProps> = ({ currentUser }) => {
  const { data, refreshData } = useDataContext();
  const { addToast } = useToast();

  // Derive processTypeOptions (same logic as ProcessorWorkbench)
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
    if (options.length === 0) return BASE_OPTIONS;
    const existing = new Set(options.map((o) => o.value.toLowerCase()));
    BASE_OPTIONS.forEach((base) => {
      if (!existing.has(base.value.toLowerCase())) {
        options.push(base);
      }
    });
    return options;
  }, [data.processTypes]);

  // Filters
  const [processFilter, setProcessFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "inStock" | "Hulled">("inStock");
  const [searchText, setSearchText] = useState("");
  const [harvestSearchText, setHarvestSearchText] = useState("");

  // Modal states
  const [showProcessAndHullModal, setShowProcessAndHullModal] = useState(false);
  const [preSelectedHarvestLotId, setPreSelectedHarvestLotId] = useState<string | undefined>();
  const [selectedParchmentForWithdraw, setSelectedParchmentForWithdraw] =
    useState<ParchmentLot | null>(null);
  const [selectedParchmentForHistory, setSelectedParchmentForHistory] =
    useState<ParchmentLot | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Collapsed sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ---- Derived data ----

  // Harvest lots ready for processing
  const readyHarvestLots = useMemo(
    () =>
      data.harvestLots.filter((lot) => {
        if (lot.status === "Ready for Processing") {
          return (lot.weightKg || 0) > 0;
        }
        if (lot.status === "Complete") {
          return typeof lot.remainingWeightKg === "number"
            ? lot.remainingWeightKg > 0
            : false;
        }
        return false;
      }),
    [data.harvestLots],
  );

  const totalCherryWeight = useMemo(
    () => readyHarvestLots.reduce((sum, h) => sum + (h.remainingWeightKg ?? (h.weightKg || 0)), 0),
    [readyHarvestLots],
  );

  const totalParchmentWeight = useMemo(
    () => data.parchmentLots.reduce((s, p) => s + p.currentWeightKg, 0),
    [data.parchmentLots],
  );

  const externalLotCount = useMemo(
    () => data.parchmentLots.filter((p) => p.sourceType === "External").length,
    [data.parchmentLots],
  );

  // Filtered harvest lots for incoming section
  const filteredHarvestLots = useMemo(() => {
    if (!harvestSearchText.trim()) return readyHarvestLots;
    const q = harvestSearchText.toLowerCase();
    return readyHarvestLots.filter(
      (h) =>
        (h.displayId || "").toLowerCase().includes(q) ||
        h.farmerName.toLowerCase().includes(q) ||
        h.cherryVariety.toLowerCase().includes(q),
    );
  }, [readyHarvestLots, harvestSearchText]);

  // Filter + search parchment lots
  const filteredLots = useMemo(() => {
    let lots = data.parchmentLots;

    // Status filter
    if (statusFilter === "inStock") {
      lots = lots.filter((p) => p.currentWeightKg > 0);
    } else if (statusFilter === "Hulled") {
      lots = lots.filter((p) => p.status === "Hulled");
    }

    if (processFilter !== "all") {
      lots = lots.filter((p) => p.processType === processFilter);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      lots = lots.filter(
        (p) =>
          formatParchmentId(p).toLowerCase().includes(q) ||
          p.processType.toLowerCase().includes(q) ||
          (p.externalSource?.code || "").toLowerCase().includes(q) ||
          (p.externalSource?.origin || "").toLowerCase().includes(q),
      );
    }
    return lots;
  }, [data.parchmentLots, statusFilter, processFilter, searchText]);

  // Group by process type
  const grouped = useMemo(() => {
    const map: Record<string, ParchmentLot[]> = {};
    for (const lot of filteredLots) {
      const key = lot.processType || "Unknown";
      if (!map[key]) map[key] = [];
      map[key].push(lot);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredLots]);

  const greenBeansByParchmentLotId = useMemo(() => {
    return data.greenBeanLots.reduce<Record<string, typeof data.greenBeanLots>>(
      (acc, lot) => {
        if (!lot.parchmentLotId) return acc;
        if (!acc[lot.parchmentLotId]) {
          acc[lot.parchmentLotId] = [];
        }
        acc[lot.parchmentLotId].push(lot);
        return acc;
      },
      {},
    );
  }, [data.greenBeanLots]);

  // Aggregate parchment stock by process type: one summary row per
  // Honey/Natural/Washed/... with total weight currently on hand and a
  // collapsible trace showing every lot + its harvest origin.
  //
  // Uses `filteredLots` so the summary respects whichever tab/status/search
  // the user has selected — "In Stock" shows live inventory, "Hulled" shows
  // depleted batches, "All" shows both.
  const parchmentProcessSummary = useMemo(() => {
    type Source = {
      lot: ParchmentLot;
      parchmentDisplayId: string;
      harvestDisplayId: string;
      status: ParchmentLot["status"];
      currentWeightKg: number;
      initialWeightKg: number;
    };
    type Row = {
      processType: string;
      totalCurrentWeight: number;
      totalInitialWeight: number;
      lotCount: number;
      sources: Source[];
    };
    const byType = new Map<string, Row>();

    for (const lot of filteredLots) {
      const key = lot.processType || "Unknown";
      const row =
        byType.get(key) ?? {
          processType: key,
          totalCurrentWeight: 0,
          totalInitialWeight: 0,
          lotCount: 0,
          sources: [],
        };
      row.totalCurrentWeight += lot.currentWeightKg ?? 0;
      row.totalInitialWeight += lot.initialWeightKg ?? 0;
      row.lotCount += 1;

      const harvest = lot.harvestLotId
        ? data.harvestLots.find((h) => h.id === lot.harvestLotId)
        : undefined;
      row.sources.push({
        lot,
        parchmentDisplayId:
          lot.displayId ?? lot.id.substring(0, 8).toUpperCase(),
        harvestDisplayId:
          harvest?.displayId ??
          lot.externalSource?.origin ??
          "—",
        status: lot.status,
        currentWeightKg: lot.currentWeightKg ?? 0,
        initialWeightKg: lot.initialWeightKg ?? 0,
      });
      byType.set(key, row);
    }
    return Array.from(byType.values()).sort(
      (a, b) => b.totalCurrentWeight - a.totalCurrentWeight,
    );
  }, [filteredLots, data.harvestLots]);

  const [expandedProcessSummaries, setExpandedProcessSummaries] = useState<
    Set<string>
  >(new Set());
  const toggleProcessSummary = useCallback((processType: string) => {
    setExpandedProcessSummaries((prev) => {
      const next = new Set(prev);
      if (next.has(processType)) next.delete(processType);
      else next.add(processType);
      return next;
    });
  }, []);

  // ---- Handlers ----

  const handleProcessFromHarvestLot = useCallback((lot: HarvestLot) => {
    setPreSelectedHarvestLotId(lot.id);
    setShowProcessAndHullModal(true);
  }, []);

  const handleProcessAndHull = useCallback(
    async (formData: ProcessAndHullInput) => {
      setIsSubmitting(true);
      try {
        await processAndHull(formData);
        addToast({ type: "success", message: "Process recorded and hulled successfully!" });
        await refreshData();
        setShowProcessAndHullModal(false);
        setPreSelectedHarvestLotId(undefined);
      } catch (error: any) {
        addToast({ type: "error", message: error.message || "Failed to process and hull" });
      } finally {
        setIsSubmitting(false);
      }
    },
    [addToast, refreshData],
  );

  const handleParchmentWithdraw = useCallback(
    async (formData: CreateParchmentWithdrawalInput) => {
      if (!selectedParchmentForWithdraw) return;
      setIsSubmitting(true);
      try {
        await createParchmentWithdrawal(
          selectedParchmentForWithdraw.id,
          formData,
        );
        addToast({ type: "success", message: "Parchment withdrawal recorded!" });
        await refreshData();
        setSelectedParchmentForWithdraw(null);
      } catch (error: any) {
        addToast({ type: "error", message: error.message || "Failed to withdraw parchment" });
      } finally {
        setIsSubmitting(false);
      }
    },
    [addToast, refreshData, selectedParchmentForWithdraw],
  );

  const handleImportSuccess = useCallback(async () => {
    await refreshData();
    addToast({ type: "success", message: "Parchment lots imported from Excel!" });
  }, [refreshData, addToast]);

  // ---- Helpers ----

  const formatStatus = (s: string) =>
    s === "Hulled" ? "Hulled" : "Awaiting Hulling";

  const statusBadge = (s: string) =>
    s === "Hulled"
      ? "bg-gray-100 text-gray-600"
      : "bg-emerald-50 text-emerald-700";

  const statusDot = (s: string) =>
    s === "Hulled" ? "bg-gray-400" : "bg-emerald-500";

  const processColor = (type: string) => {
    const colors: Record<string, string> = {
      Washed: "bg-sky-100 text-sky-700 border-sky-200",
      Natural: "bg-amber-100 text-amber-700 border-amber-200",
      Honey: "bg-yellow-100 text-yellow-700 border-yellow-200",
    };
    return colors[type] || "bg-purple-100 text-purple-700 border-purple-200";
  };

  const isIncomingCollapsed = collapsedSections.has("__incoming__");

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-xl px-5 py-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500 rounded-xl">
            <Box className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Parchment Stock
            </h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Manage parchment inventory, record processes, import external stock, and track withdrawals
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-4 flex items-center gap-4">
          <div className="p-2.5 bg-red-100 rounded-xl">
            <Scale className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Incoming Cherry
            </p>
            <p className="text-xl font-bold text-gray-900">
              {totalCherryWeight.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{" "}
              kg
            </p>
            <p className="text-[10px] text-gray-400">
              {readyHarvestLots.length} lot{readyHarvestLots.length !== 1 ? "s" : ""} ready
            </p>
          </div>
        </div>
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-4 flex items-center gap-4">
          <div className="p-2.5 bg-amber-100 rounded-xl">
            <Box className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Parchment Stock
            </p>
            <p className="text-xl font-bold text-gray-900">
              {totalParchmentWeight.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{" "}
              kg
            </p>
            <p className="text-[10px] text-gray-400">
              {data.parchmentLots.length} lot
              {data.parchmentLots.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-4 flex items-center gap-4">
          <div className="p-2.5 bg-blue-100 rounded-xl">
            <ExternalLink className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              External Lots
            </p>
            <p className="text-xl font-bold text-gray-900">
              {externalLotCount}
            </p>
            <p className="text-[10px] text-gray-400">
              Imported from Excel
            </p>
          </div>
        </div>
      </div>

      {/* ─── Incoming Harvest Lots Section ─── */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <button
          onClick={() => toggleSection("__incoming__")}
          className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            {isIncomingCollapsed ? (
              <ChevronRight className="h-4 w-4 text-red-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-red-400" />
            )}
            <Leaf className="h-4 w-4 text-red-500" />
            <span className="text-sm font-bold text-gray-800">
              Incoming Harvest Lots
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
              {readyHarvestLots.length}
            </span>
          </div>
          <span className="text-sm font-semibold text-gray-700">
            {totalCherryWeight.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg
          </span>
        </button>

        {!isIncomingCollapsed && (
          <div>
            {readyHarvestLots.length === 0 ? (
              <div className="p-8 text-center">
                <Leaf className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-500">No harvest lots ready for processing</p>
              </div>
            ) : (
              <>
                {/* Search bar for harvest lots */}
                {readyHarvestLots.length > 5 && (
                  <div className="px-4 py-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={harvestSearchText}
                        onChange={(e) => setHarvestSearchText(e.target.value)}
                        placeholder="Search harvest lots..."
                        className="pl-8 w-full sm:w-64 border border-gray-200 bg-white rounded-lg py-1.5 px-3 text-xs focus:ring-1 focus:ring-red-300 focus:border-red-300 outline-none"
                      />
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Lot ID
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Farmer
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Variety
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Weight (kg)
                        </th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Harvest Date
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredHarvestLots.map((lot) => {
                        const availableWeight = lot.remainingWeightKg ?? lot.weightKg;
                        return (
                          <tr key={lot.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-semibold text-gray-900">
                              {lot.displayId || lot.id.slice(0, 8)}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {lot.farmerName}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                {lot.cherryVariety}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-gray-900">
                              {availableWeight.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-center text-gray-600 text-xs">
                              {lot.harvestDate
                                ? new Date(lot.harvestDate).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleProcessFromHarvestLot(lot)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-all"
                              >
                                <ArrowRight className="h-3.5 w-3.5" />
                                Process
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Process Type filter pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setProcessFilter("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                processFilter === "all"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {processTypeOptions.map((pt) => (
              <button
                key={pt.value}
                onClick={() => setProcessFilter(pt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  processFilter === pt.value
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {pt.value}
              </button>
            ))}
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Status:</span>
            {([
              { key: "inStock" as const, label: "In Stock" },
              { key: "Hulled" as const, label: "Hulled" },
              { key: "all" as const, label: "All" },
            ]).map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  statusFilter === s.key
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search lots..."
              className="pl-9 w-full sm:w-52 border border-gray-200 bg-white rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none"
            />
          </div>

          {/* Import from Excel */}
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-sm whitespace-nowrap"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Excel
          </button>

          {/* Record Process & Hull */}
          <button
            onClick={() => {
              setPreSelectedHarvestLotId(undefined);
              setShowProcessAndHullModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-all shadow-sm whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Record Process & Hull
          </button>
        </div>
      </div>

      {/* Parchment Stock Summary — aggregated by process type with trace */}
      {parchmentProcessSummary.length > 0 && (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <div className="p-1.5 bg-amber-600 rounded-lg">
              <Box className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Parchment Stock — Process Type Summary
              </h3>
              <p className="text-[11px] text-gray-500">
                Total weight per process type with origin trace. Respects the
                filters above. Click a row to expand.
              </p>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {parchmentProcessSummary.map((row) => {
              const isExpanded = expandedProcessSummaries.has(row.processType);
              return (
                <div key={row.processType}>
                  <button
                    type="button"
                    onClick={() => toggleProcessSummary(row.processType)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronDown
                        className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                      />
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                        {row.processType}
                      </span>
                      <span className="text-xs text-gray-500">
                        {row.lotCount} lot{row.lotCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-amber-700">
                        {row.totalCurrentWeight.toFixed(2)}
                      </span>
                      <span className="text-xs font-normal text-gray-500 ml-1">
                        / {row.totalInitialWeight.toFixed(2)} kg
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-1 bg-gray-50/60">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 pl-6">
                        Sources
                      </div>
                      <div className="space-y-1 pl-6">
                        {row.sources.map((s, idx) => {
                          const canWithdraw = s.currentWeightKg > 0;
                          return (
                            <div
                              key={`${row.processType}-${idx}`}
                              className="flex items-center justify-between text-xs bg-white rounded-md px-3 py-2 border border-gray-200"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-gray-800">
                                  {s.parchmentDisplayId}
                                </span>
                                <span className="text-gray-400">←</span>
                                <span className="font-mono text-gray-600">
                                  {s.harvestDisplayId}
                                </span>
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    s.status === "Hulled"
                                      ? "bg-gray-100 text-gray-600 border border-gray-200"
                                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  }`}
                                >
                                  {s.status === "Hulled"
                                    ? "Hulled"
                                    : "Awaiting Hulling"}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-semibold text-gray-700">
                                  {s.currentWeightKg.toFixed(2)}
                                  <span className="text-gray-400 font-normal text-[10px] ml-1">
                                    / {s.initialWeightKg.toFixed(2)} kg
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedParchmentForWithdraw(s.lot)
                                  }
                                  disabled={!canWithdraw}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md border border-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                  title={
                                    canWithdraw
                                      ? "Withdraw from this parchment lot"
                                      : "No stock remaining"
                                  }
                                >
                                  <Package className="h-3 w-3" />
                                  Withdraw
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grouped Parchment Lots */}
      {grouped.length === 0 ? (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-12 text-center">
          <Box className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">
            No parchment lots found
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Record a process or import from Excel to get started
          </p>
        </div>
      ) : (
        grouped.map(([processType, lots]) => {
          const isCollapsed = collapsedSections.has(processType);
          const sectionWeight = lots.reduce(
            (s, l) => s + l.currentWeightKg,
            0,
          );
          return (
            <div
              key={processType}
              className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden"
            >
              {/* Section Header */}
              <button
                onClick={() => toggleSection(processType)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${processColor(processType)}`}
                  >
                    {processType}
                  </span>
                  <span className="text-sm text-gray-500">
                    {lots.length} lot{lots.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-sm font-semibold text-gray-700">
                  {sectionWeight.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{" "}
                  kg
                </span>
              </button>

              {/* Table */}
              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Lot ID
                        </th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Source
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Weight (kg)
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Moisture %
                        </th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          History
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lots.map((lot) => {
                        const historyCount =
                          lot.withdrawalHistory?.length || 0;
                        const relatedGreenBeanLots =
                          greenBeansByParchmentLotId[lot.id] || [];
                        const hasHistory =
                          historyCount > 0 || relatedGreenBeanLots.length > 0;
                        const historyBadgeCount =
                          historyCount > 0
                            ? historyCount
                            : relatedGreenBeanLots.length;
                        const isExternal = lot.sourceType === "External";
                        return (
                          <tr
                            key={lot.id}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="font-semibold text-gray-900">
                                {formatParchmentId(lot)}
                              </div>
                              {isExternal && lot.externalSource?.code && (
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  Code: {lot.externalSource.code}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isExternal ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                  <ExternalLink className="h-2.5 w-2.5" />
                                  External
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                  <Leaf className="h-2.5 w-2.5" />
                                  Internal
                                </span>
                              )}
                              {isExternal && lot.externalSource?.origin && (
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  {lot.externalSource.origin}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-bold text-gray-900">
                                {lot.currentWeightKg.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                              <span className="text-gray-400 text-xs ml-1">
                                / {lot.initialWeightKg.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Droplet className="h-3 w-3 text-blue-400" />
                                <span className="text-gray-700">
                                  {lot.moistureContent}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(lot.status)}`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${statusDot(lot.status)}`}
                                />
                                {formatStatus(lot.status)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {hasHistory ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedParchmentForHistory(lot)
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
                                  title="View lot history"
                                >
                                  <History className="h-3 w-3" />
                                  {historyBadgeCount}
                                </button>
                              ) : (
                                <span className="text-xs text-gray-300">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {lot.currentWeightKg > 0 && (
                                <button
                                  onClick={() =>
                                    setSelectedParchmentForWithdraw(lot)
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all"
                                >
                                  <Package className="h-3.5 w-3.5" />
                                  Withdraw
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* ─── Process & Hull Modal ─── */}
      {showProcessAndHullModal && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col">
              <div className="flex flex-col h-full overflow-y-auto p-8">
                <ProcessAndHullModal
                  harvestLots={
                    preSelectedHarvestLotId
                      ? readyHarvestLots.filter((l) => l.id === preSelectedHarvestLotId)
                      : readyHarvestLots
                  }
                  processTypes={processTypeOptions}
                  cropYears={data.cropYears}
                  onSubmit={handleProcessAndHull}
                  onCancel={() => {
                    setShowProcessAndHullModal(false);
                    setPreSelectedHarvestLotId(undefined);
                  }}
                  isSubmitting={isSubmitting}
                />
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ─── Parchment Withdraw Modal ─── */}
      {selectedParchmentForWithdraw && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col">
              <div className="flex flex-col h-full overflow-y-auto p-8">
                <ParchmentWithdrawModal
                  parchmentLot={selectedParchmentForWithdraw}
                  users={data.users}
                  onSubmit={handleParchmentWithdraw}
                  onCancel={() => setSelectedParchmentForWithdraw(null)}
                  isSubmitting={isSubmitting}
                />
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ─── Excel Import Modal ─── */}
      {selectedParchmentForHistory && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col">
              <div className="flex flex-col h-full overflow-y-auto p-8">
                {(() => {
                  const withdrawalHistory =
                    selectedParchmentForHistory.withdrawalHistory || [];
                  const relatedGreenBeanLots =
                    greenBeansByParchmentLotId[
                      selectedParchmentForHistory.id
                    ] || [];

                  return (
                    <>
                      <div className="flex items-center gap-4 mb-8">
                        <div className="p-4 bg-amber-500 rounded-2xl shadow-lg">
                          <History className="h-10 w-10 text-white" />
                        </div>
                        <div>
                          <h2 className="text-3xl font-bold text-gray-900">
                            Parchment Lot History
                          </h2>
                          <p className="text-base text-gray-600 mt-1">
                            Lot {formatParchmentId(selectedParchmentForHistory)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                        <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                            Status
                          </p>
                          <p className="text-2xl font-bold text-amber-700">
                            {formatStatus(selectedParchmentForHistory.status)}
                          </p>
                        </div>
                        <div className="bg-blue-50 rounded-2xl p-5 border border-blue-200">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                            Withdrawal Records
                          </p>
                          <p className="text-2xl font-bold text-blue-700">
                            {withdrawalHistory.length}
                          </p>
                        </div>
                        <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-200">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                            Green Bean Lots
                          </p>
                          <p className="text-2xl font-bold text-emerald-700">
                            {relatedGreenBeanLots.length}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-8">
                        <section>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-bold text-gray-900">
                              Withdrawal Activity
                            </h3>
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                              {withdrawalHistory.length} record
                              {withdrawalHistory.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {withdrawalHistory.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                              No parchment withdrawal records were saved for this lot.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {withdrawalHistory.map((entry) => {
                                const roasterName = entry.targetRoasterId
                                  ? data.users.find(
                                      (user) =>
                                        user.id === entry.targetRoasterId,
                                    )?.name
                                  : undefined;
                                const destination =
                                  entry.customerName ||
                                  roasterName ||
                                  (entry.withdrawalType === "HullAndGrade"
                                    ? "Split into green bean lots"
                                    : entry.purpose);

                                return (
                                  <div
                                    key={entry.id}
                                    className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                      <div>
                                        <div className="flex items-center gap-2 mb-1.5">
                                          <span className="inline-flex items-center rounded-full bg-white border border-gray-200 px-2.5 py-0.5 text-xs font-bold text-gray-700">
                                            {entry.withdrawalType}
                                          </span>
                                          <span className="text-xs text-gray-500">
                                            {new Date(entry.date).toLocaleString()}
                                          </span>
                                        </div>
                                        <p className="text-sm font-semibold text-gray-900">
                                          {destination || "Recorded activity"}
                                        </p>
                                        {entry.notes && (
                                          <p className="text-xs text-gray-500 mt-1">
                                            {entry.notes}
                                          </p>
                                        )}
                                      </div>
                                      <div className="text-left sm:text-right">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                          Amount
                                        </p>
                                        <p className="text-lg font-bold text-gray-900">
                                          {entry.amountKg.toLocaleString(
                                            undefined,
                                            {
                                              maximumFractionDigits: 2,
                                            },
                                          )}{" "}
                                          kg
                                        </p>
                                        {entry.totalAmount && (
                                          <p className="text-xs text-gray-500 mt-1">
                                            {entry.totalAmount.toLocaleString(
                                              undefined,
                                              {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                              },
                                            )}{" "}
                                            {entry.currency || "THB"}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>

                        <section>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-bold text-gray-900">
                              Green Bean Lots Created
                            </h3>
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                              {relatedGreenBeanLots.length} lot
                              {relatedGreenBeanLots.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {relatedGreenBeanLots.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                              No green bean lots linked to this parchment lot yet.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {relatedGreenBeanLots.map((greenBeanLot) => (
                                <div
                                  key={greenBeanLot.id}
                                  className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    <div>
                                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                                        Lot ID
                                      </p>
                                      <p className="text-sm font-bold text-gray-900">
                                        {formatGreenBeanId(greenBeanLot)}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-2 mt-2">
                                        <span className="inline-flex items-center rounded-full bg-white border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                          {greenBeanLot.grade}
                                        </span>
                                        <span className="inline-flex items-center rounded-full bg-white border border-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                                          {greenBeanLot.availabilityStatus}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-left sm:text-right">
                                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                        Current Weight
                                      </p>
                                      <p className="text-lg font-bold text-emerald-700">
                                        {greenBeanLot.currentWeightKg.toLocaleString(
                                          undefined,
                                          {
                                            maximumFractionDigits: 2,
                                          },
                                        )}{" "}
                                        kg
                                      </p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        Initial{" "}
                                        {greenBeanLot.initialWeightKg.toLocaleString(
                                          undefined,
                                          {
                                            maximumFractionDigits: 2,
                                          },
                                        )}{" "}
                                        kg
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>

                      <div className="sticky bottom-0 mt-8 bg-white pt-4 border-t border-gray-100 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setSelectedParchmentForHistory(null)}
                          className="px-6 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all"
                        >
                          Close
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {showImportModal && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden border border-gray-100 flex flex-col">
              <div className="flex flex-col h-full overflow-y-auto p-8">
                <ExcelImportModal
                  onSuccess={handleImportSuccess}
                  onClose={() => setShowImportModal(false)}
                />
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};

export default ParchmentTab;
