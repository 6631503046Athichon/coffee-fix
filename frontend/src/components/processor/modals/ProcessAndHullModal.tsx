import React, { useState, useMemo } from "react";
import { HarvestLot, CropYear } from "../../../types";
import {
  PlayCircle,
  Scale,
  Droplet,
  ChevronsRight,
  DollarSign,
  AlertCircle,
  Check,
  Plus,
  Trash2,
  ChevronDown,
} from "lucide-react";
import DatePicker from "../../common/DatePicker";

const GRADE_OPTIONS = [
  { value: "Grade A", label: "Grade A" },
  { value: "Grade B", label: "Grade B" },
  { value: "Grade C", label: "Grade C" },
  { value: "Peaberry", label: "Peaberry" },
  { value: "Screen 18", label: "Screen 18" },
  { value: "Screen 17", label: "Screen 17" },
  { value: "Screen 16", label: "Screen 16" },
  { value: "Screen 15", label: "Screen 15" },
];

// --- Inline sub-components (copied from StartProcessingModal / HullAndGradeModal) ---

// Custom Dropdown Component for Process Type Selection
const ProcessTypeDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  processTypes: { value: string; label: string }[];
}> = ({ value, onChange, processTypes }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const options = processTypes || [];

  React.useEffect(() => {
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

  const selectedOption =
    options.find((opt) => opt.value === value) ||
    options[0] ||
    { value: "", label: "No process types available" };

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
        <svg
          className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
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
                  className={`w-full text-left px-5 py-3 transition-all text-base font-medium ${
                    option.value === value
                      ? "bg-indigo-100 text-indigo-700 font-bold"
                      : "text-gray-900 hover:bg-indigo-50 hover:text-indigo-700"
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

// Crop Year Chips Component
const CropYearChips: React.FC<{
  years: CropYear[];
  value: string;
  onChange: (value: string) => void;
}> = ({ years, value, onChange }) => {
  const currentYearId = React.useMemo(() => {
    const today = new Date();
    return (
      years.find((y) => {
        const start = new Date(y.startDate);
        const end = new Date(y.endDate);
        return today >= start && today <= end;
      })?.id || ""
    );
  }, [years]);

  const baseChipClass =
    "relative flex items-center justify-center py-3 px-4 rounded-xl border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer";
  const selectedClass =
    "bg-blue-600 text-white border-blue-600 shadow-lg";
  const unselectedClass =
    "bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:bg-blue-50";

  return (
    <div className="grid grid-cols-3 gap-3">
      {years.map((year) => {
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
  );
};

// Custom Dropdown Component for Grade Selection
const GradeDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  usedGrades?: string[];
}> = ({ value, onChange, usedGrades = [] }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const options = GRADE_OPTIONS.filter(
    (option) => !usedGrades.includes(option.value) || option.value === value,
  );

  React.useEffect(() => {
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

  const selectedOption = GRADE_OPTIONS.find((opt) => opt.value === value);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all hover:border-gray-400 flex items-center justify-between gap-2"
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>
          {selectedOption ? selectedOption.label : "Select Grade"}
        </span>
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
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
                className={`w-full text-left px-4 py-2.5 transition-all text-sm font-medium ${
                  value === option.value
                    ? "bg-green-50 text-green-700"
                    : "text-gray-900 hover:bg-green-50 hover:text-green-700"
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

// --- Harvest Lot Dropdown ---

const HarvestLotDropdown: React.FC<{
  harvestLots: HarvestLot[];
  value: string;
  onChange: (value: string) => void;
}> = ({ harvestLots, value, onChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
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

  const hasOptions = harvestLots.length > 0;
  const selectedLot = harvestLots.find((lot) => lot.id === value);

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
        <span className={value ? "text-gray-900" : "text-gray-400"}>
          {selectedLot
            ? `Lot #${selectedLot.displayId || selectedLot.id} - ${selectedLot.cherryVariety} (${selectedLot.farmerName})`
            : hasOptions
              ? "Select a harvest lot..."
              : "No harvest lots available"}
        </span>
        <ChevronDown
          className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && hasOptions && (
        <div className="absolute z-20 mt-3 left-0 right-0 bg-white border border-gray-300 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
          <div className="py-2">
            {harvestLots.map((lot) => (
              <button
                key={lot.id}
                type="button"
                onClick={() => {
                  onChange(lot.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-5 py-3 transition-all text-sm font-medium ${
                  lot.id === value
                    ? "bg-indigo-100 text-indigo-700 font-bold"
                    : "text-gray-900 hover:bg-indigo-50 hover:text-indigo-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>
                    Lot #{lot.displayId || lot.id} - {lot.cherryVariety}
                  </span>
                  <span className="text-xs text-gray-500">
                    {(lot.remainingWeightKg ?? lot.weightKg).toFixed(2)} kg
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {lot.farmerName}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main Component ---

export interface ProcessAndHullModalProps {
  harvestLots: HarvestLot[];
  processTypes: { value: string; label: string }[];
  cropYears: CropYear[];
  onSubmit: (data: {
    harvestLotId: string;
    processType: string;
    processNotes: string;
    cropYearId: string;
    parchmentWeightKg: number;
    moistureContent: number;
    dryingStartDate: string;
    dryingEndDate: string;
    gradedLots: {
      grade: string;
      weight: number;
      price?: number;
      score?: number;
    }[];
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

const ProcessAndHullModal: React.FC<ProcessAndHullModalProps> = ({
  harvestLots,
  processTypes,
  cropYears,
  onSubmit,
  onCancel,
  isSubmitting,
}) => {
  // ---- Form State ----
  const [harvestLotId, setHarvestLotId] = useState("");
  const [processType, setProcessType] = useState(
    processTypes.length > 0 ? processTypes[0].value : "",
  );
  const [processNotes, setProcessNotes] = useState("");
  const [cropYearId, setCropYearId] = useState("");
  const [parchmentWeight, setParchmentWeight] = useState("");
  const [moistureContent, setMoistureContent] = useState("");
  const [dryingStartDate, setDryingStartDate] = useState("");
  const [dryingEndDate, setDryingEndDate] = useState("");
  const [totalGreenWeight, setTotalGreenWeight] = useState("");
  const [gradedLots, setGradedLots] = useState<
    { grade: string; weight: string; price: string; score: string }[]
  >([{ grade: "", weight: "", price: "", score: "" }]);

  // ---- Derived Values ----
  const selectedLot = useMemo(
    () => harvestLots.find((lot) => lot.id === harvestLotId),
    [harvestLots, harvestLotId],
  );

  const lotMaxWeight = selectedLot
    ? selectedLot.remainingWeightKg ?? selectedLot.weightKg
    : 0;

  const parchmentWeightNum = parseFloat(parchmentWeight) || 0;
  const moistureContentNum = parseFloat(moistureContent) || 0;
  const totalGreenWeightNum = parseFloat(totalGreenWeight) || 0;

  const gradedWeightSum = useMemo(
    () =>
      gradedLots.reduce((sum, lot) => sum + (parseFloat(lot.weight) || 0), 0),
    [gradedLots],
  );

  const exceedsParchmentWeight = totalGreenWeightNum > parchmentWeightNum;
  const weightMismatch =
    totalGreenWeightNum > 0 &&
    Math.abs(gradedWeightSum - totalGreenWeightNum) > 0.01;

  const weightLossPercent =
    totalGreenWeight && parchmentWeightNum > 0
      ? (
          ((parchmentWeightNum - totalGreenWeightNum) / parchmentWeightNum) *
          100
        ).toFixed(1)
      : "0";

  const hasInvalidDryingRange =
    Boolean(dryingStartDate) &&
    Boolean(dryingEndDate) &&
    new Date(dryingEndDate) < new Date(dryingStartDate);

  const selectedGrades = useMemo(
    () => gradedLots.map((lot) => lot.grade).filter(Boolean),
    [gradedLots],
  );

  const duplicateGrades = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    selectedGrades.forEach((grade) => {
      if (seen.has(grade)) {
        duplicates.add(grade);
      } else {
        seen.add(grade);
      }
    });

    return Array.from(duplicates);
  }, [selectedGrades]);

  const hasDuplicateGrades = duplicateGrades.length > 0;
  const canAddMoreGrades = gradedLots.length < GRADE_OPTIONS.length;

  // ---- Validation ----
  const isValid = useMemo(() => {
    if (!harvestLotId) return false;
    if (!processType) return false;
    if (parchmentWeightNum <= 0) return false;
    if (parchmentWeightNum > lotMaxWeight) return false;
    if (moistureContentNum < 0 || moistureContentNum > 100) return false;
    if (!dryingStartDate || !dryingEndDate) return false;
    if (hasInvalidDryingRange) return false;
    if (gradedLots.length < 1) return false;
    if (totalGreenWeightNum <= 0) return false;
    if (totalGreenWeightNum > parchmentWeightNum) return false;
    // All graded lots must have a grade and weight
    const allGradesValid = gradedLots.every(
      (lot) => lot.grade && parseFloat(lot.weight) > 0,
    );
    if (!allGradesValid) return false;
    if (hasDuplicateGrades) return false;
    // Sum of graded lot weights must match total green bean weight
    if (Math.abs(gradedWeightSum - totalGreenWeightNum) > 0.01) return false;
    return true;
  }, [
    harvestLotId,
    processType,
    parchmentWeightNum,
    lotMaxWeight,
    moistureContentNum,
    dryingStartDate,
    dryingEndDate,
    hasInvalidDryingRange,
    gradedLots,
    hasDuplicateGrades,
    totalGreenWeightNum,
    gradedWeightSum,
  ]);

  // ---- Submit Handler ----
  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;

    await onSubmit({
      harvestLotId,
      processType,
      processNotes,
      cropYearId,
      parchmentWeightKg: parchmentWeightNum,
      moistureContent: moistureContentNum,
      dryingStartDate,
      dryingEndDate,
      gradedLots: gradedLots.map((lot) => ({
        grade: lot.grade,
        weight: parseFloat(lot.weight),
        price: lot.price ? parseFloat(lot.price) : undefined,
        score: lot.score ? parseFloat(lot.score) : undefined,
      })),
    });
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="p-4 bg-blue-100 rounded-xl shadow-md">
          <PlayCircle className="h-10 w-10 text-blue-600" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-900">
            Record Process & Hull
          </h2>
          <p className="text-base text-gray-600 mt-1">
            Combined processing and hulling form
          </p>
        </div>
      </div>

      {/* Step 1 - Select Harvest Lot */}
      <div className="mb-6">
        <label className="block text-base font-bold text-gray-700 mb-3">
          Select Harvest Lot
        </label>
        <HarvestLotDropdown
          harvestLots={harvestLots}
          value={harvestLotId}
          onChange={setHarvestLotId}
        />
      </div>

      {/* Selected lot info */}
      {selectedLot && (
        <div className="bg-gray-50 rounded-2xl p-8 mb-8 border border-gray-200 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
            <div className="text-center">
              <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">
                Variety
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {selectedLot.cherryVariety}
              </p>
            </div>
            <div className="text-center sm:border-l-2 sm:border-gray-300">
              <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">
                Weight
              </p>
              <p className="text-2xl font-bold text-green-600">
                {(selectedLot.remainingWeightKg ?? selectedLot.weightKg).toFixed(
                  2,
                )}{" "}
                kg
              </p>
            </div>
            <div className="text-center sm:border-l-2 sm:border-gray-300">
              <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">
                Farmer
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {selectedLot.farmerName}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 - Process Details */}
      <div className="mb-6 space-y-4">
        <div>
          <label className="block text-base font-bold text-gray-700 mb-3">
            Select Process Type
          </label>
          <ProcessTypeDropdown
            value={processType}
            onChange={setProcessType}
            processTypes={processTypes}
          />
        </div>

        <div>
          <label className="block text-base font-bold text-gray-700 mb-3">
            Crop Year (Optional)
          </label>
          <CropYearChips
            years={cropYears}
            value={cropYearId}
            onChange={setCropYearId}
          />
          <p className="mt-2 text-xs text-gray-500">
            Associate this batch with a crop year for tracking and reporting
          </p>
        </div>

        <div>
          <label
            htmlFor="processNotes"
            className="block text-sm font-semibold text-gray-700 mb-2"
          >
            Process Notes (Optional)
          </label>
          <textarea
            id="processNotes"
            rows={2}
            value={processNotes}
            onChange={(e) => setProcessNotes(e.target.value)}
            placeholder="e.g., Ferment 24h in sealed tank, raised-bed drying, frequent turning"
            className="w-full border border-gray-300 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all resize-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            Use this to capture special steps or parameters for this batch.
          </p>
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
              max={lotMaxWeight}
              value={parchmentWeight}
              onChange={(e) => setParchmentWeight(e.target.value)}
              placeholder={
                selectedLot
                  ? `Max: ${lotMaxWeight.toFixed(2)} kg`
                  : "e.g., 85.0"
              }
              required
              className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-base focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 shadow-sm"
            />
            {parchmentWeightNum > lotMaxWeight && selectedLot && (
              <p className="mt-2 text-xs text-red-600 font-semibold">
                Exceeds remaining lot weight ({lotMaxWeight.toFixed(2)} kg)
              </p>
            )}
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
              value={moistureContent}
              onChange={(e) => setMoistureContent(e.target.value)}
              placeholder="e.g., 12.0"
              required
              className="mt-1 block w-full border border-gray-300 rounded-xl py-3 px-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
            />
            <p className="mt-2 text-xs text-gray-500">
              Measured on parchment at end of drying (workers input).
            </p>
          </div>
        </div>

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
        {hasInvalidDryingRange && (
          <div className="mt-3 flex items-start gap-2 bg-red-50 rounded-xl p-4 border border-red-200">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-red-800">
              Drying End Date cannot be before Drying Start Date.
            </p>
          </div>
        )}
      </div>

      {/* Visual Divider - Hull & Grade */}
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t-2 border-gray-300"></div>
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-4 text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <ChevronsRight className="h-5 w-5 text-green-600" />
            Hull & Grade
          </span>
        </div>
      </div>

      {/* Step 3 - Hull & Grade */}
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
          max={parchmentWeightNum}
          value={totalGreenWeight}
          onChange={(e) => setTotalGreenWeight(e.target.value)}
          required
          placeholder={
            parchmentWeightNum > 0
              ? `Max: ${parchmentWeightNum.toFixed(2)} kg`
              : "Enter parchment weight first"
          }
          className={`mt-1 block w-full border rounded-xl py-3 px-4 text-lg font-semibold focus:ring-2 shadow-sm transition-all ${
            exceedsParchmentWeight
              ? "border-red-500 focus:ring-red-500 focus:border-red-500 bg-red-50"
              : "border-gray-300 focus:ring-green-500 focus:border-green-500"
          }`}
        />
        {exceedsParchmentWeight && (
          <div className="mt-3 flex items-start gap-2 bg-red-50 rounded-xl p-4 border border-red-200">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                Weight exceeds Parchment Weight
              </p>
              <p className="text-xs text-red-600 mt-1">
                Total Green Bean Weight ({totalGreenWeightNum.toFixed(2)} kg)
                cannot exceed Parchment Weight (
                {parchmentWeightNum.toFixed(2)} kg)
              </p>
            </div>
          </div>
        )}
        {totalGreenWeight && !exceedsParchmentWeight && parchmentWeightNum > 0 && (
          <div className="mt-3 flex items-center justify-between bg-blue-50 rounded-xl p-4 border border-blue-200">
            <span className="text-sm font-semibold text-gray-700">
              Weight Loss from Hulling
            </span>
            <span className="text-2xl font-bold text-blue-600">
              {weightLossPercent}%
            </span>
          </div>
        )}
      </div>

      {/* Graded Lots Divider */}
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

      {/* Graded Lots List */}
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
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                    Grade
                  </label>
                  <GradeDropdown
                    value={lot.grade}
                    onChange={(value) =>
                      setGradedLots(
                        gradedLots.map((l, i) =>
                          i === index ? { ...l, grade: value } : l,
                        ),
                      )
                    }
                    usedGrades={selectedGrades}
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
                          i === index ? { ...l, weight: e.target.value } : l,
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
                      <DollarSign size={12} className="text-gray-500" />
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
                          i === index ? { ...l, price: e.target.value } : l,
                        ),
                      )
                    }
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                    Score
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
                          i === index ? { ...l, score: e.target.value } : l,
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
                  setGradedLots(gradedLots.filter((_, i) => i !== index))
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

      {/* Add Another Grade Button */}
      <button
        type="button"
        onClick={() =>
          setGradedLots([
            ...gradedLots,
            { grade: "", weight: "", price: "", score: "" },
          ])
        }
        disabled={!canAddMoreGrades}
        className="w-full py-3 px-4 border border-dashed border-green-300 rounded-xl text-sm font-bold text-green-600 hover:bg-green-50 hover:border-green-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        title={
          canAddMoreGrades
            ? "Add another graded lot"
            : "All available grades have already been used"
        }
      >
        <Plus size={18} /> Add Another Grade
      </button>

      {hasDuplicateGrades && (
        <div className="mt-4 flex items-start gap-2 bg-red-50 rounded-xl p-4 border border-red-200">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-red-800">
            Each graded lot must use a different grade. Duplicate grade:{" "}
            {duplicateGrades.join(", ")}
          </p>
        </div>
      )}

      {/* Weight Validation Summary */}
      <div
        className={`mt-6 rounded-2xl p-6 border shadow-lg transition-all ${
          weightMismatch
            ? "bg-red-50 border-red-300"
            : "bg-green-50 border-green-300"
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">
            Total Accounted For
          </span>
          {weightMismatch ? (
            <AlertCircle className="h-6 w-6 text-red-600" />
          ) : (
            <Check className="h-6 w-6 text-green-600" />
          )}
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span
            className={`text-4xl font-extrabold ${
              weightMismatch ? "text-red-600" : "text-green-600"
            }`}
          >
            {gradedWeightSum.toFixed(2)}
          </span>
          <span className="text-2xl font-bold text-gray-400">/</span>
          <span className="text-2xl font-bold text-gray-600">
            {totalGreenWeightNum.toFixed(2)} kg
          </span>
        </div>
        {weightMismatch && (
          <div className="mt-3 flex items-start gap-2 bg-red-100 rounded-lg p-3 border border-red-200">
            <AlertCircle
              size={16}
              className="text-red-600 flex-shrink-0 mt-0.5"
            />
            <p className="text-xs font-semibold text-red-800">
              The sum of graded lots must exactly match the total green bean
              weight.
            </p>
          </div>
        )}
        {!weightMismatch && totalGreenWeightNum > 0 && (
          <div className="mt-3 flex items-center gap-2 bg-green-100 rounded-lg p-3 border border-green-200">
            <Check size={16} className="text-green-600 flex-shrink-0" />
            <p className="text-xs font-semibold text-green-800">
              Perfect! All weights are accounted for.
            </p>
          </div>
        )}
      </div>

      {/* Footer Buttons */}
      <div className="flex items-center justify-end gap-4 mt-8 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-6 py-3 text-base font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className="px-8 py-3 text-base font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <svg
                className="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Submitting...
            </>
          ) : (
            <>
              <Check className="h-5 w-5" />
              Submit Process & Hull
            </>
          )}
        </button>
      </div>
    </>
  );
};

export default ProcessAndHullModal;
