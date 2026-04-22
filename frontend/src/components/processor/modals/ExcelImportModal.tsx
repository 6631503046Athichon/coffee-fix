import React, { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertTriangle,
  Download,
} from "lucide-react";
import {
  importParchmentFromExcel,
  type ExcelImportResult,
} from "../../../services/parchmentLotService";

interface ExcelImportModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  onSuccess,
  onClose,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ExcelImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (selectedFile: File) => {
    const validExtensions = [".xlsx", ".xls"];
    const name = selectedFile.name.toLowerCase();
    if (!validExtensions.some((ext) => name.endsWith(ext))) {
      setError("Please select a .xlsx or .xls file");
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("File too large. Maximum size is 5MB");
      return;
    }
    setFile(selectedFile);
    setError(null);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleImport = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      const importResult = await importParchmentFromExcel(file);
      setResult(importResult);
      if (importResult.imported > 0) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    // Create a simple CSV template for download
    const headers = [
      "Code",
      "Process",
      "Variety",
      "Source",
      "Weight (kg)",
      "Moisture %",
    ];
    const sampleRow = ["EXT-001", "Washed", "Bourbon", "Mae Ton Luang", "50", "11.5"];
    const csv = [headers.join(","), sampleRow.join(",")].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parchment_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Import Parchment from Excel
            </h2>
            <p className="text-xs text-gray-500">
              Import external parchment stock data from an Excel file
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      {/* Result display */}
      {result && (
        <div
          className={`rounded-lg border p-4 ${
            result.imported > 0
              ? "bg-emerald-50 border-emerald-200"
              : "bg-amber-50 border-amber-200"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            {result.imported > 0 ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            <span className="font-semibold text-gray-900">
              {result.imported > 0
                ? `Successfully imported ${result.imported} lot(s)`
                : "No lots imported"}
            </span>
          </div>
          {result.skipped > 0 && (
            <p className="text-sm text-gray-600 mb-1">
              {result.skipped} row(s) skipped
            </p>
          )}
          {result.errors.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto">
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600">
                  {err}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {error && !result && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* File drop zone */}
      {!result && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? "border-emerald-400 bg-emerald-50"
              : file
                ? "border-emerald-300 bg-emerald-50/50"
                : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
            className="hidden"
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileSpreadsheet className="h-8 w-8 text-emerald-500" />
              <div className="text-left">
                <p className="font-semibold text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setResult(null);
                }}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">
                Drop your Excel file here or click to browse
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Supports .xlsx and .xls (max 5MB)
              </p>
            </>
          )}
        </div>
      )}

      {/* Expected columns info */}
      {!result && (
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 mb-2">
            Expected Columns:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { name: "Code", required: false },
              { name: "Process", required: true },
              { name: "Variety / สายพันธุ์", required: false },
              { name: "Source / แหล่ง", required: false },
              { name: "Weight (kg)", required: true },
              { name: "Moisture %", required: false },
            ].map((col) => (
              <span
                key={col.name}
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                  col.required
                    ? "bg-amber-100 text-amber-700 font-semibold"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {col.name}
                {col.required && " *"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all"
        >
          <Download className="h-3.5 w-3.5" />
          Download Template
        </button>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={!file || isUploading}
              className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isUploading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Import
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExcelImportModal;
