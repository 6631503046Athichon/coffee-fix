import React, { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Microscope, X, CheckCircle, Edit3, Trash2 } from 'lucide-react';
import { Button, Input, Modal } from '../common';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Farm, SoilAnalysis, UserRole } from '../../types';
import { generateSoilAnalysisId } from '../../utils/idGenerator';
import { formatDateDisplay } from '../../utils/formatters';

export type SoilFormState = {
  farmPlotLocation: string;
  testDate: string;
  labName: string;
  certificateNumber: string;
  pH: string;
  phosphorus: string;
  potassium: string;
  nitrogen: string;
  calcium: string;
  magnesium: string;
  organicMatter: string;
  sulfur: string;
  zinc: string;
  iron: string;
  manganese: string;
  copper: string;
  boron: string;
  recommendations: string;
  notes: string;
};

const createEmptySoilForm = (defaults: Partial<SoilFormState> = {}): SoilFormState => ({
  farmPlotLocation: '',
  testDate: new Date().toISOString().substring(0, 10),
  labName: '',
  certificateNumber: '',
  pH: '',
  phosphorus: '',
  potassium: '',
  nitrogen: '',
  calcium: '',
  magnesium: '',
  organicMatter: '',
  sulfur: '',
  zinc: '',
  iron: '',
  manganese: '',
  copper: '',
  boron: '',
  recommendations: '',
  notes: '',
  ...defaults,
});

interface FarmSoilPanelProps {
  farm: Farm | null;
  isOpen?: boolean;
  onClose?: () => void;
}

const FarmSoilPanel: React.FC<FarmSoilPanelProps> = ({ farm, isOpen = true, onClose }) => {
  const { data, setData } = useDataContext();
  const { currentUser } = useAuth();

  const [soilForm, setSoilForm] = useState<SoilFormState>(() => createEmptySoilForm());
  const [editingSoilId, setEditingSoilId] = useState<string | null>(null);
  const [soilFormError, setSoilFormError] = useState<string | null>(null);
  const [soilToast, setSoilToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const selectedFarmAnalyses = useMemo(() => {
    if (!farm) {
      return [];
    }
    return data.soilAnalyses
      .filter(analysis => analysis.farmId === farm.id)
      .sort((a, b) => new Date(b.testDate).getTime() - new Date(a.testDate).getTime());
  }, [data.soilAnalyses, farm]);

  useEffect(() => {
    if (!farm) {
      setSoilForm(createEmptySoilForm());
      setEditingSoilId(null);
      setSoilFormError(null);
      setSoilToast(null);
      return;
    }
    setSoilForm(createEmptySoilForm({ farmPlotLocation: farm.location }));
    setEditingSoilId(null);
    setSoilFormError(null);
    setSoilToast(null);
  }, [farm]);

  const handleSoilFieldChange = (field: keyof SoilFormState, value: string) => {
    setSoilForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSoilCancelEdit = () => {
    setEditingSoilId(null);
    setSoilFormError(null);
    setSoilForm(createEmptySoilForm({ farmPlotLocation: farm?.location ?? '' }));
  };

  const handleSoilSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!farm) {
      return;
    }

    const trimmedPlot = soilForm.farmPlotLocation.trim();
    if (!trimmedPlot) {
      setSoilFormError('กรอกชื่อแปลงหรือโซนปลูก');
      return;
    }
    if (!soilForm.testDate) {
      setSoilFormError('เลือกวันที่ตรวจวิเคราะห์ดิน');
      return;
    }

    const requiredNumericFields: Array<{ key: keyof SoilFormState; label: string }> = [
      { key: 'pH', label: 'pH' },
      { key: 'phosphorus', label: 'ฟอสฟอรัส (P)' },
      { key: 'potassium', label: 'โพแทสเซียม (K)' },
      { key: 'nitrogen', label: 'ไนโตรเจน (N)' },
      { key: 'calcium', label: 'แคลเซียม (Ca)' },
      { key: 'magnesium', label: 'แมกนีเซียม (Mg)' },
    ];

    const parsedRequired: Record<string, number> = {};
    for (const field of requiredNumericFields) {
      const value = soilForm[field.key].trim();
      if (!value) {
        setSoilFormError(`กรอกค่า ${field.label}`);
        return;
      }
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        setSoilFormError(`${field.label} ต้องเป็นตัวเลข`);
        return;
      }
      parsedRequired[field.key] = parsed;
    }

    const optionalNumericFields: Array<{ key: keyof SoilFormState; label: string }> = [
      { key: 'organicMatter', label: 'อินทรีย์วัตถุ (OM)' },
      { key: 'sulfur', label: 'กำมะถัน (S)' },
      { key: 'zinc', label: 'สังกะสี (Zn)' },
      { key: 'iron', label: 'เหล็ก (Fe)' },
      { key: 'manganese', label: 'แมงกานีส (Mn)' },
      { key: 'copper', label: 'ทองแดง (Cu)' },
      { key: 'boron', label: 'โบรอน (B)' },
    ];

    const parsedOptional: Partial<Record<keyof SoilFormState, number>> = {};
    for (const field of optionalNumericFields) {
      const value = soilForm[field.key].trim();
      if (!value) {
        continue;
      }
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        setSoilFormError(`${field.label} ต้องเป็นตัวเลข`);
        return;
      }
      parsedOptional[field.key] = parsed;
    }

    const payload: SoilAnalysis = {
      id: editingSoilId ?? generateSoilAnalysisId(data.soilAnalyses.map(a => a.id)),
      farmId: farm.id,
      farmPlotLocation: trimmedPlot,
      testDate: soilForm.testDate,
      labName: soilForm.labName.trim() || undefined,
      certificateNumber: soilForm.certificateNumber.trim() || undefined,
      pH: parsedRequired.pH,
      phosphorus: parsedRequired.phosphorus,
      potassium: parsedRequired.potassium,
      nitrogen: parsedRequired.nitrogen,
      calcium: parsedRequired.calcium,
      magnesium: parsedRequired.magnesium,
      organicMatter: parsedOptional.organicMatter,
      sulfur: parsedOptional.sulfur,
      zinc: parsedOptional.zinc,
      iron: parsedOptional.iron,
      manganese: parsedOptional.manganese,
      copper: parsedOptional.copper,
      boron: parsedOptional.boron,
      recommendations: soilForm.recommendations.trim() || undefined,
      notes: soilForm.notes.trim() || undefined,
      createdBy: currentUser?.id ?? 'system',
      createdByRole: currentUser?.roles?.[0] ?? UserRole.Farmer,
    };

    setData(prev => ({
      ...prev,
      soilAnalyses: editingSoilId
        ? prev.soilAnalyses.map(analysis => (analysis.id === editingSoilId ? payload : analysis))
        : [payload, ...prev.soilAnalyses],
    }));

    setSoilToast({ type: 'success', message: editingSoilId ? 'อัปเดตผลวิเคราะห์ดินเรียบร้อยแล้ว' : 'บันทึกผลวิเคราะห์ดินใหม่แล้ว' });
    setEditingSoilId(null);
    setSoilFormError(null);
    setSoilForm(createEmptySoilForm({ farmPlotLocation: farm.location }));
  };

  const handleSoilEdit = (analysis: SoilAnalysis) => {
    setEditingSoilId(analysis.id);
    setSoilFormError(null);
    setSoilForm(createEmptySoilForm({
      farmPlotLocation: analysis.farmPlotLocation,
      testDate: analysis.testDate,
      labName: analysis.labName ?? '',
      certificateNumber: analysis.certificateNumber ?? '',
      pH: analysis.pH.toString(),
      phosphorus: analysis.phosphorus.toString(),
      potassium: analysis.potassium.toString(),
      nitrogen: analysis.nitrogen.toString(),
      calcium: analysis.calcium.toString(),
      magnesium: analysis.magnesium.toString(),
      organicMatter: analysis.organicMatter?.toString() ?? '',
      sulfur: analysis.sulfur?.toString() ?? '',
      zinc: analysis.zinc?.toString() ?? '',
      iron: analysis.iron?.toString() ?? '',
      manganese: analysis.manganese?.toString() ?? '',
      copper: analysis.copper?.toString() ?? '',
      boron: analysis.boron?.toString() ?? '',
      recommendations: analysis.recommendations ?? '',
      notes: analysis.notes ?? '',
    }));
  };

  const handleSoilDelete = (analysisId: string) => {
    if (!confirm('ยืนยันการลบผลวิเคราะห์ดินนี้?')) {
      return;
    }
    setData(prev => ({
      ...prev,
      soilAnalyses: prev.soilAnalyses.filter(analysis => analysis.id !== analysisId),
    }));
    if (editingSoilId === analysisId) {
      handleSoilCancelEdit();
    }
    setSoilToast({ type: 'success', message: 'ลบผลวิเคราะห์แล้ว' });
  };

  // If not open, don't render anything
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose || (() => {})}
      title="ข้อมูลดินของฟาร์ม"
      maxWidth="4xl"
    >
      <div className="space-y-6">
      {!farm ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
          เลือกฟาร์มจากรายการเพื่อเริ่มบันทึกผลวิเคราะห์ดิน
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-full bg-white shadow">
                <Microscope className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-700">{farm.id}</p>
                <h3 className="text-xl font-bold text-gray-900">{farm.name ?? farm.location}</h3>
                <p className="text-sm text-gray-600">{farm.location}</p>
                <p className="text-sm text-gray-600">เจ้าของ: {farm.ownerName ?? farm.farmerName}</p>
                {farm.caretakerName && <p className="text-sm text-gray-600">ผู้ดูแล: {farm.caretakerName}</p>}
              </div>
            </div>
            <div className="text-sm text-gray-600">
              บันทึกแล้ว {selectedFarmAnalyses.length} รายการ
            </div>
          </div>

          {soilToast && (
            <div className={`flex items-center justify-between px-4 py-3 border rounded-xl ${soilToast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
              <span className="font-semibold">{soilToast.message}</span>
              <button className="p-1 rounded-full hover:bg-black/5" onClick={() => setSoilToast(null)} aria-label="ปิดข้อความ">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <form onSubmit={handleSoilSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="ชื่อแปลง / พื้นที่ปลูก"
                placeholder="เช่น Plot A, North Field"
                value={soilForm.farmPlotLocation}
                onChange={event => handleSoilFieldChange('farmPlotLocation', event.target.value)}
                required
                fullWidth
              />
              <Input
                label="วันที่ตรวจ"
                type="date"
                value={soilForm.testDate}
                onChange={event => handleSoilFieldChange('testDate', event.target.value)}
                required
                fullWidth
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="ห้องแล็บที่ตรวจ"
                placeholder="เช่น Chiang Mai Agricultural Testing Laboratory"
                value={soilForm.labName}
                onChange={event => handleSoilFieldChange('labName', event.target.value)}
                fullWidth
              />
              <Input
                label="เลขที่ใบรับรอง"
                placeholder="เช่น CMATL-2025-0342"
                value={soilForm.certificateNumber}
                onChange={event => handleSoilFieldChange('certificateNumber', event.target.value)}
                fullWidth
              />
            </div>

            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-emerald-600" />
                ค่าสารอาหารหลัก (จำเป็น)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="pH" type="number" step="0.1" value={soilForm.pH} onChange={event => handleSoilFieldChange('pH', event.target.value)} required fullWidth />
                <Input label="ฟอสฟอรัส (ppm)" type="number" step="0.1" value={soilForm.phosphorus} onChange={event => handleSoilFieldChange('phosphorus', event.target.value)} required fullWidth />
                <Input label="โพแทสเซียม (ppm)" type="number" step="0.1" value={soilForm.potassium} onChange={event => handleSoilFieldChange('potassium', event.target.value)} required fullWidth />
                <Input label="ไนโตรเจน (%)" type="number" step="0.1" value={soilForm.nitrogen} onChange={event => handleSoilFieldChange('nitrogen', event.target.value)} required fullWidth />
                <Input label="แคลเซียม (ppm)" type="number" step="0.1" value={soilForm.calcium} onChange={event => handleSoilFieldChange('calcium', event.target.value)} required fullWidth />
                <Input label="แมกนีเซียม (ppm)" type="number" step="0.1" value={soilForm.magnesium} onChange={event => handleSoilFieldChange('magnesium', event.target.value)} required fullWidth />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm font-semibold text-gray-800 mb-3">ค่าสารอาหารเพิ่มเติม (ไม่จำเป็น)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="อินทรีย์วัตถุ (%)" type="number" step="0.1" value={soilForm.organicMatter} onChange={event => handleSoilFieldChange('organicMatter', event.target.value)} fullWidth />
                <Input label="กำมะถัน (ppm)" type="number" step="0.1" value={soilForm.sulfur} onChange={event => handleSoilFieldChange('sulfur', event.target.value)} fullWidth />
                <Input label="สังกะสี (ppm)" type="number" step="0.1" value={soilForm.zinc} onChange={event => handleSoilFieldChange('zinc', event.target.value)} fullWidth />
                <Input label="เหล็ก (ppm)" type="number" step="0.1" value={soilForm.iron} onChange={event => handleSoilFieldChange('iron', event.target.value)} fullWidth />
                <Input label="แมงกานีส (ppm)" type="number" step="0.1" value={soilForm.manganese} onChange={event => handleSoilFieldChange('manganese', event.target.value)} fullWidth />
                <Input label="ทองแดง (ppm)" type="number" step="0.1" value={soilForm.copper} onChange={event => handleSoilFieldChange('copper', event.target.value)} fullWidth />
                <Input label="โบรอน (ppm)" type="number" step="0.1" value={soilForm.boron} onChange={event => handleSoilFieldChange('boron', event.target.value)} fullWidth />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">คำแนะนำ</label>
                <textarea
                  value={soilForm.recommendations}
                  onChange={event => handleSoilFieldChange('recommendations', event.target.value)}
                  rows={4}
                  placeholder="เช่น เพิ่มปุ๋ยอินทรีย์เพื่อรักษาระดับ OM"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">บันทึกเพิ่มเติม</label>
                <textarea
                  value={soilForm.notes}
                  onChange={event => handleSoilFieldChange('notes', event.target.value)}
                  rows={4}
                  placeholder="รายละเอียดเพิ่มเติมของการตรวจครั้งนี้"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {soilFormError && (
              <div className="px-4 py-3 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm">
                {soilFormError}
              </div>
            )}

            <div className="flex justify-end gap-3">
              {editingSoilId && (
                <Button type="button" variant="outline" onClick={handleSoilCancelEdit}>
                  ยกเลิกการแก้ไข
                </Button>
              )}
              <Button type="submit" variant="primary" icon={<CheckCircle className="h-4 w-4" />}>
                {editingSoilId ? 'บันทึกการแก้ไขผลดิน' : 'บันทึกผลดิน'}
              </Button>
            </div>
          </form>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">ประวัติผลวิเคราะห์</h3>
              <p className="text-sm text-gray-500">มี {selectedFarmAnalyses.length} รายการที่บันทึกไว้</p>
            </div>
            {selectedFarmAnalyses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-gray-500">
                ยังไม่มีการบันทึกผลวิเคราะห์ดินสำหรับฟาร์มนี้
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-900 text-white">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">วันที่ตรวจ</th>
                      <th className="px-4 py-3 text-left font-semibold">แปลง</th>
                      <th className="px-4 py-3 text-center font-semibold">pH</th>
                      <th className="px-4 py-3 text-center font-semibold">N (%)</th>
                      <th className="px-4 py-3 text-center font-semibold">P (ppm)</th>
                      <th className="px-4 py-3 text-center font-semibold">K (ppm)</th>
                      <th className="px-4 py-3 text-center font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {selectedFarmAnalyses.map(analysis => (
                      <tr key={analysis.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateDisplay(analysis.testDate)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{analysis.farmPlotLocation}</p>
                          {analysis.labName && <p className="text-xs text-gray-500">Lab: {analysis.labName}</p>}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-900">{analysis.pH}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{analysis.nitrogen}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{analysis.phosphorus}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{analysis.potassium}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                handleSoilEdit(analysis);
                              }}
                              className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
                              aria-label="แก้ไขผลดิน"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                handleSoilDelete(analysis.id);
                              }}
                              className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                              aria-label="ลบผลดิน"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </Modal>
  );
};

export default FarmSoilPanel;
