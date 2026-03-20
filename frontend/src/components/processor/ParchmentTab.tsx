import React, { useState, useMemo, useCallback } from "react";
import ReactDOM from "react-dom";
import {
  User,
  ParchmentLot,
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
} from "lucide-react";
import { formatParchmentId } from "../../utils/formatDisplayId";
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

  // Modal states
  const [showProcessAndHullModal, setShowProcessAndHullModal] = useState(false);
  const [selectedParchmentForWithdraw, setSelectedParchmentForWithdraw] =
    useState<ParchmentLot | null>(null);
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

  const totalCherryWeight = useMemo(
    () =>
      data.harvestLots
        .filter((h) => h.status === "Ready for Processing")
        .reduce((sum, h) => sum + (h.weightKg || 0), 0),
    [data.harvestLots],
  );

  const totalParchmentWeight = useMemo(
    () => data.parchmentLots.reduce((s, p) => s + p.currentWeightKg, 0),
    [data.parchmentLots],
  );

  // Filter + search
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
          p.processType.toLowerCase().includes(q),
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
    // Sort keys alphabetically
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredLots]);

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

  // ---- Handlers ----

  const handleProcessAndHull = useCallback(
    async (formData: ProcessAndHullInput) => {
      setIsSubmitting(true);
      try {
        await processAndHull(formData);
        addToast({ type: "success", message: "Process recorded and hulled successfully!" });
        await refreshData();
        setShowProcessAndHullModal(false);
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

  // ---- Helpers ----

  const formatStatus = (s: string) =>
    s === "Hulled" ? "Hulled" : "Awaiting Hulling";

  const statusBadge = (s: string) =>
    s === "Hulled"
      ? "bg-gray-100 text-gray-600"
      : "bg-emerald-50 text-emerald-700";

  const statusDot = (s: string) =>
    s === "Hulled" ? "bg-gray-400" : "bg-emerald-500";

  // Process type colors
  const processColor = (type: string) => {
    const colors: Record<string, string> = {
      Washed: "bg-sky-100 text-sky-700 border-sky-200",
      Natural: "bg-amber-100 text-amber-700 border-amber-200",
      Honey: "bg-yellow-100 text-yellow-700 border-yellow-200",
    };
    return colors[type] || "bg-purple-100 text-purple-700 border-purple-200";
  };

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
              Manage parchment inventory, record processes, and track withdrawals
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {/* Record Process & Hull */}
          <button
            onClick={() => setShowProcessAndHullModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-all shadow-sm whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Record Process & Hull
          </button>
        </div>
      </div>

      {/* Grouped Parchment Lots */}
      {grouped.length === 0 ? (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-12 text-center">
          <Box className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">
            No parchment lots found
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Record a process to get started
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
                        return (
                          <tr
                            key={lot.id}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-4 py-3 font-semibold text-gray-900">
                              {formatParchmentId(lot)}
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
                              {historyCount > 0 ? (
                                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                  <History className="h-3 w-3" />
                                  {historyCount}
                                </span>
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
                  harvestLots={readyHarvestLots}
                  processTypes={processTypeOptions}
                  cropYears={data.cropYears}
                  onSubmit={handleProcessAndHull}
                  onCancel={() => setShowProcessAndHullModal(false)}
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
    </div>
  );
};

export default ParchmentTab;
