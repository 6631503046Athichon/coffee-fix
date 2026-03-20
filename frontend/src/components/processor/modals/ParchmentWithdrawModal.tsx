import React, { useState, useMemo } from "react";
import { ParchmentLot, User, UserRole } from "../../../types";
import {
  Package,
  DollarSign,
  Flame,
  ChevronsRight,
  Beaker,
  Globe,
  MoreHorizontal,
  ArrowRight,
  Scale,
  AlertCircle,
  Check,
  Plus,
  Trash2,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// GradeDropdown (inlined from HullAndGradeModal pattern)
// ---------------------------------------------------------------------------
const GradeDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  index: number;
}> = ({ value, onChange, index }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const options = [
    { value: "Grade A", label: "Grade A" },
    { value: "Grade B", label: "Grade B" },
    { value: "Grade C", label: "Grade C" },
    { value: "Peaberry", label: "Peaberry" },
    { value: "Screen 18", label: "Screen 18" },
    { value: "Screen 17", label: "Screen 17" },
    { value: "Screen 16", label: "Screen 16" },
    { value: "Screen 15", label: "Screen 15" },
  ];

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

  const selectedOption = options.find((opt) => opt.value === value);

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ParchmentWithdrawModalProps {
  parchmentLot: ParchmentLot;
  users: User[];
  onSubmit: (data: {
    amountKg: number;
    withdrawalType: string;
    purpose: string;
    notes?: string;
    salePrice?: number;
    currency?: string;
    customerName?: string;
    deliveryAddress?: string;
    targetRoasterId?: string;
    roastProfileNotes?: string;
    cuppingScore?: number;
    gradedLots?: { grade: string; weight: number; price?: number; score?: number }[];
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

type WithdrawalType =
  | "RoastingStock"
  | "Sale"
  | "HullAndGrade"
  | "Sample"
  | "Export"
  | "Other";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const ParchmentWithdrawModal: React.FC<ParchmentWithdrawModalProps> = ({
  parchmentLot,
  users,
  onSubmit,
  onCancel,
  isSubmitting,
}) => {
  // ---- form state ----
  const [withdrawalType, setWithdrawalType] = useState<WithdrawalType>("RoastingStock");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");

  // Sale fields
  const [customerName, setCustomerName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [currency, setCurrency] = useState("THB");

  // Roasting Stock fields
  const [targetRoasterId, setTargetRoasterId] = useState("");
  const [roastProfileNotes, setRoastProfileNotes] = useState("");
  const [cuppingScore, setCuppingScore] = useState("");

  // Hull & Grade fields
  const [totalGreenWeight, setTotalGreenWeight] = useState("");
  const [gradedLots, setGradedLots] = useState<
    { grade: string; weight: string; price: string; score: string }[]
  >([{ grade: "", weight: "", price: "", score: "" }]);

  // ---- derived values ----
  const roasters = useMemo(
    () => users.filter((u) => u.roles?.includes(UserRole.Roaster)),
    [users],
  );

  const amtNum = parseFloat(amount) || 0;
  const remaining = Math.max(0, parchmentLot.currentWeightKg - amtNum);
  const pct =
    parchmentLot.currentWeightKg > 0
      ? (remaining / parchmentLot.currentWeightKg) * 100
      : 0;
  const priceNum = parseFloat(salePrice) || 0;
  const totalSale = amtNum * priceNum;
  const isOver = amtNum > parchmentLot.currentWeightKg;

  const totalGreenNum = parseFloat(totalGreenWeight) || 0;
  const gradedWeightSum = gradedLots.reduce(
    (sum, l) => sum + (parseFloat(l.weight) || 0),
    0,
  );
  const weightMismatch =
    totalGreenNum > 0 && Math.abs(gradedWeightSum - totalGreenNum) > 0.01;
  const exceedsParchmentWeight = totalGreenNum > parchmentLot.currentWeightKg;

  const lotId =
    parchmentLot.displayId || parchmentLot.id.substring(0, 8).toUpperCase();

  // ---- submission ----
  const canSubmit = (() => {
    if (isSubmitting || amtNum <= 0 || isOver) return false;
    if (withdrawalType === "HullAndGrade") {
      if (totalGreenNum <= 0 || exceedsParchmentWeight || weightMismatch)
        return false;
    }
    return true;
  })();

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const base: Parameters<typeof onSubmit>[0] = {
      amountKg: amtNum,
      withdrawalType,
      purpose,
      notes: purpose || undefined,
    };

    if (withdrawalType === "Sale") {
      base.salePrice = priceNum || undefined;
      base.currency = currency;
      base.customerName = customerName || undefined;
      base.deliveryAddress = deliveryAddress || undefined;
    }

    if (withdrawalType === "RoastingStock") {
      base.targetRoasterId = targetRoasterId || undefined;
      base.roastProfileNotes = roastProfileNotes || undefined;
      base.cuppingScore = parseFloat(cuppingScore) || undefined;
    }

    if (withdrawalType === "HullAndGrade") {
      base.gradedLots = gradedLots.map((l) => ({
        grade: l.grade,
        weight: parseFloat(l.weight) || 0,
        price: parseFloat(l.price) || undefined,
        score: parseFloat(l.score) || undefined,
      }));
    }

    await onSubmit(base);
  };

  // ---- withdrawal type cards config ----
  const typeCards: {
    value: WithdrawalType;
    icon: React.FC<{ className?: string }>;
    color: string;
    label: string;
  }[] = [
    { value: "RoastingStock", icon: Flame, color: "orange", label: "Roast" },
    { value: "Sale", icon: DollarSign, color: "blue", label: "Sale" },
    { value: "HullAndGrade", icon: ChevronsRight, color: "green", label: "Hull" },
    { value: "Sample", icon: Beaker, color: "purple", label: "Sample" },
    { value: "Export", icon: Globe, color: "emerald", label: "Export" },
    { value: "Other", icon: MoreHorizontal, color: "gray", label: "Other" },
  ];

  const colorMap: Record<string, { active: string; ring: string }> = {
    blue: { active: "bg-blue-50 border-blue-400 text-blue-700", ring: "ring-blue-200" },
    orange: { active: "bg-orange-50 border-orange-400 text-orange-700", ring: "ring-orange-200" },
    green: { active: "bg-green-50 border-green-400 text-green-700", ring: "ring-green-200" },
    purple: { active: "bg-purple-50 border-purple-400 text-purple-700", ring: "ring-purple-200" },
    emerald: { active: "bg-emerald-50 border-emerald-400 text-emerald-700", ring: "ring-emerald-200" },
    gray: { active: "bg-gray-100 border-gray-400 text-gray-700", ring: "ring-gray-200" },
  };

  // ---- render ----
  return (
    <>
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl shadow-md">
            <Package className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Withdraw Parchment
            </h2>
            <p className="text-xs text-gray-500">
              Lot #{lotId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Stock</p>
            <p className="text-lg font-bold text-green-600 leading-tight">
              {parchmentLot.currentWeightKg.toFixed(2)}
              <span className="text-xs font-normal text-gray-400 ml-1">kg</span>
            </p>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="text-right">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Process</p>
            <p className="text-lg font-bold text-gray-800 leading-tight">
              {parchmentLot.processType}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Withdrawal Type Cards ─── */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
          Withdrawal Type
        </label>
        <div className="grid grid-cols-6 gap-2">
          {typeCards.map((type) => {
            const isActive = withdrawalType === type.value;
            const c = colorMap[type.color];
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => setWithdrawalType(type.value)}
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

      {/* ─── Conditional: Sale Fields ─── */}
      {withdrawalType === "Sale" && (
        <div className="mb-5 p-4 bg-blue-50/70 rounded-xl border border-blue-200 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Customer
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name..."
                className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Delivery Address
              </label>
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="123 Main St, City"
                className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Price per kg
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="0.00"
                className="flex-1 block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="border border-gray-300 rounded-lg py-2 px-3 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="THB">THB</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          {priceNum > 0 && amtNum > 0 && (
            <div className="flex items-center justify-between bg-blue-100/60 rounded-lg p-3 border border-blue-200">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Amount</span>
              <span className="text-lg font-bold text-blue-700">
                {totalSale.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ─── Conditional: Roasting Stock Fields ─── */}
      {withdrawalType === "RoastingStock" && (
        <div className="mb-5 p-4 bg-orange-50/70 rounded-xl border border-orange-200 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Target Roaster
            </label>
            <select
              value={targetRoasterId}
              onChange={(e) => setTargetRoasterId(e.target.value)}
              className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="">Select Roaster...</option>
              {roasters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Roast Profile Notes
            </label>
            <textarea
              value={roastProfileNotes}
              onChange={(e) => setRoastProfileNotes(e.target.value)}
              placeholder="e.g., Medium roast, City+ for espresso..."
              rows={2}
              className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Cupping Score (0-100)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={cuppingScore}
              onChange={(e) => setCuppingScore(e.target.value)}
              placeholder="e.g., 85"
              className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
        </div>
      )}

      {/* ─── Conditional: Hull & Grade Fields ─── */}
      {withdrawalType === "HullAndGrade" && (
        <div className="mb-5 p-4 bg-green-50/70 rounded-xl border border-green-200 space-y-4">
          {/* Total Green Bean Weight */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <div className="flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5 text-green-600" />
                Total Green Bean Weight (kg)
              </div>
            </label>
            <input
              type="number"
              step="0.1"
              max={parchmentLot.currentWeightKg}
              value={totalGreenWeight}
              onChange={(e) => setTotalGreenWeight(e.target.value)}
              placeholder={`Max: ${parchmentLot.currentWeightKg.toFixed(2)} kg`}
              className={`block w-full border rounded-lg py-2 px-3 text-sm font-semibold focus:outline-none focus:ring-1 transition-all ${
                exceedsParchmentWeight
                  ? "border-red-500 focus:ring-red-500 focus:border-red-500 bg-red-50"
                  : "border-gray-300 focus:ring-green-500 focus:border-green-500"
              }`}
            />
            {exceedsParchmentWeight && (
              <div className="mt-2 flex items-start gap-2 bg-red-50 rounded-lg p-3 border border-red-200">
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-red-800">
                  Total Green Bean Weight ({totalGreenNum.toFixed(2)} kg) cannot exceed
                  Parchment Weight ({parchmentLot.currentWeightKg.toFixed(2)} kg)
                </p>
              </div>
            )}
          </div>

          {/* Graded Lots */}
          <div>
            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-green-50 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  Graded Lots
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {gradedLots.map((lot, index) => (
                <div
                  key={index}
                  className="bg-white rounded-lg p-3 border border-green-200"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-xs">
                        #{index + 1}
                      </span>
                    </div>
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 mb-0.5 uppercase tracking-wide">
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
                          index={index}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 mb-0.5 uppercase tracking-wide">
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
                          className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 mb-0.5 uppercase tracking-wide">
                          <div className="flex items-center gap-1">
                            <DollarSign size={10} className="text-gray-500" />
                            Price/kg
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
                        <label className="block text-[10px] font-bold text-gray-600 mb-0.5 uppercase tracking-wide">
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
                      className="flex-shrink-0 p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      title="Remove this grade"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                setGradedLots([
                  ...gradedLots,
                  { grade: "", weight: "", price: "", score: "" },
                ])
              }
              className="w-full mt-2 py-2 px-3 border border-dashed border-green-300 rounded-lg text-xs font-bold text-green-600 hover:bg-green-50 hover:border-green-400 transition-all flex items-center justify-center gap-1.5"
            >
              <Plus size={14} /> Add Another Grade
            </button>

            {/* Weight validation summary */}
            <div
              className={`mt-3 rounded-lg p-3 border transition-all ${
                weightMismatch
                  ? "bg-red-50 border-red-300"
                  : "bg-green-50 border-green-300"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-700 uppercase tracking-wide">
                  Total Accounted For
                </span>
                {weightMismatch ? (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                ) : (
                  <Check className="h-4 w-4 text-green-600" />
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-xl font-extrabold ${
                    weightMismatch ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {gradedWeightSum.toFixed(2)}
                </span>
                <span className="text-sm font-bold text-gray-400">/</span>
                <span className="text-sm font-bold text-gray-600">
                  {totalGreenNum.toFixed(2)} kg
                </span>
              </div>
              {weightMismatch && (
                <div className="mt-2 flex items-start gap-1.5 bg-red-100 rounded-md p-2 border border-red-200">
                  <AlertCircle size={12} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] font-semibold text-red-800">
                    The sum of graded lots must exactly match the total green bean weight.
                  </p>
                </div>
              )}
              {!weightMismatch && totalGreenNum > 0 && (
                <div className="mt-2 flex items-center gap-1.5 bg-green-100 rounded-md p-2 border border-green-200">
                  <Check size={12} className="text-green-600 flex-shrink-0" />
                  <p className="text-[10px] font-semibold text-green-800">
                    All weights are accounted for.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Common Fields: Amount + Purpose ─── */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Amount (kg){" "}
            <span className="font-normal normal-case tracking-normal text-gray-400">
              max {parchmentLot.currentWeightKg.toFixed(2)}
            </span>
          </label>
          <input
            type="number"
            max={parchmentLot.currentWeightKg}
            step="0.1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="block w-full h-[46px] border border-gray-300 rounded-xl px-4 text-lg font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
        </div>
        <div className="col-span-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Purpose / Notes
          </label>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g., Order #123, Sample roast..."
            rows={1}
            className="block w-full h-[46px] border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none"
          />
        </div>
      </div>

      {/* ─── Live Preview Bar ─── */}
      <div
        className={`rounded-xl p-3 border transition-colors ${
          isOver ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"
        }`}
      >
        {/* Progress bar */}
        <div className="h-1.5 w-full bg-gray-200 rounded-full mb-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isOver
                ? "bg-red-400"
                : pct > 30
                  ? "bg-green-400"
                  : pct > 0
                    ? "bg-yellow-400"
                    : "bg-red-400"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-400 text-[10px] uppercase tracking-wider">Before</span>
              <p className="font-bold text-gray-600">
                {parchmentLot.currentWeightKg.toFixed(2)} kg
              </p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
            <div>
              <span className="text-gray-400 text-[10px] uppercase tracking-wider">After</span>
              <p className={`font-bold ${isOver ? "text-red-600" : "text-green-600"}`}>
                {isOver ? "Exceeds stock!" : `${remaining.toFixed(2)} kg`}
              </p>
            </div>
          </div>
          {withdrawalType === "Sale" && priceNum > 0 && amtNum > 0 && (
            <div className="text-right">
              <span className="text-gray-400 text-[10px] uppercase tracking-wider">Total</span>
              <p className="font-bold text-blue-600">
                {totalSale.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                {currency}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Footer ─── */}
      <div className="mt-6 flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 border border-transparent shadow-lg text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-all"
        >
          <Package className="h-4 w-4" />
          {isSubmitting ? "Processing..." : "Confirm Withdrawal"}
        </button>
      </div>
    </>
  );
};

export default ParchmentWithdrawModal;
