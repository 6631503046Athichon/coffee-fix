import React, { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Microscope, X, CheckCircle, Edit3, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { Button, Input, Modal } from '../common';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Farm, SoilAnalysis, UserRole } from '../../types';
import { generateSoilAnalysisId } from '../../utils/idGenerator';
import { formatDateDisplay } from '../../utils/formatters';
import { addSoilAnalysis, updateSoilAnalysis } from '../../services/soilAnalysisService';
import { generateSoilRecommendations } from '../../services/geminiService';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingRecommendations, setIsGeneratingRecommendations] = useState(false);

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

  const handleGenerateRecommendations = async () => {
    if (!farm) {
      setSoilFormError('กรุณาเลือกฟาร์มก่อนสร้างคำแนะนำ');
      return;
    }

    // Validate required fields first - but allow partial data for better UX
    const requiredFields = ['pH', 'phosphorus', 'potassium', 'nitrogen', 'calcium', 'magnesium'];
    const missingFields = requiredFields.filter(field => !soilForm[field as keyof SoilFormState]?.trim());
    
    if (missingFields.length > 0) {
      setSoilFormError(`กรุณากรอกค่าสารอาหารหลักก่อนสร้างคำแนะนำ (ยังขาด: ${missingFields.join(', ')})`);
      // Scroll to first missing field
      const firstMissingField = document.querySelector(`input[type="number"][value="${soilForm[missingFields[0] as keyof SoilFormState]}"]`);
      if (firstMissingField) {
        (firstMissingField as HTMLElement).focus();
      }
      return;
    }

    // Validate that values are numeric
    const numericFields = ['pH', 'phosphorus', 'potassium', 'nitrogen', 'calcium', 'magnesium'];
    const invalidFields: string[] = [];
    for (const field of numericFields) {
      const value = soilForm[field as keyof SoilFormState]?.trim();
      if (value && isNaN(parseFloat(value))) {
        invalidFields.push(field);
      }
    }
    
    if (invalidFields.length > 0) {
      setSoilFormError(`ค่าต่อไปนี้ไม่ถูกต้อง (ต้องเป็นตัวเลข): ${invalidFields.join(', ')}`);
      return;
    }

    setIsGeneratingRecommendations(true);
    setSoilFormError(null);
    setSoilToast(null);

    try {
      const recommendations = await generateSoilRecommendations({
        pH: parseFloat(soilForm.pH),
        phosphorus: parseFloat(soilForm.phosphorus),
        potassium: parseFloat(soilForm.potassium),
        nitrogen: parseFloat(soilForm.nitrogen),
        calcium: parseFloat(soilForm.calcium),
        magnesium: parseFloat(soilForm.magnesium),
        organicMatter: soilForm.organicMatter?.trim() ? parseFloat(soilForm.organicMatter) : undefined,
        sulfur: soilForm.sulfur?.trim() ? parseFloat(soilForm.sulfur) : undefined,
        zinc: soilForm.zinc?.trim() ? parseFloat(soilForm.zinc) : undefined,
        iron: soilForm.iron?.trim() ? parseFloat(soilForm.iron) : undefined,
        manganese: soilForm.manganese?.trim() ? parseFloat(soilForm.manganese) : undefined,
        copper: soilForm.copper?.trim() ? parseFloat(soilForm.copper) : undefined,
        boron: soilForm.boron?.trim() ? parseFloat(soilForm.boron) : undefined,
        location: farm.location,
        variety: farm.varieties?.[0],
      });

      setSoilForm(prev => ({ ...prev, recommendations }));
      setSoilToast({ type: 'success', message: 'สร้างคำแนะนำจาก AI สำเร็จแล้ว! คำแนะนำถูกเติมลงในช่องคำแนะนำแล้ว' });
      setSoilFormError(null);
      
      // Auto-dismiss success toast after 5 seconds
      setTimeout(() => {
        setSoilToast(null);
      }, 5000);
      
      // Scroll to recommendations field to show the result
      setTimeout(() => {
        const recommendationsField = document.querySelector('textarea[placeholder*="สร้างคำแนะนำ AI"]');
        if (recommendationsField) {
          recommendationsField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } catch (error: any) {
      console.error('Failed to generate recommendations:', error);
      const errorMessage = error?.message || 'ไม่สามารถสร้างคำแนะนำได้ กรุณาลองอีกครั้ง หรือตรวจสอบการเชื่อมต่ออินเทอร์เน็ต';
      setSoilFormError(errorMessage);
      setSoilToast({ type: 'error', message: errorMessage });
    } finally {
      setIsGeneratingRecommendations(false);
    }
  };

  const handleSoilSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    // Prevent double submission
    if (isSubmitting) {
      return;
    }

    if (!farm) {
      return;
    }

    setSoilFormError(null);
    setIsSubmitting(true);

    const trimmedPlot = soilForm.farmPlotLocation.trim();
    if (!trimmedPlot) {
      setSoilFormError('กรอกชื่อแปลงหรือโซนปลูก');
      setIsSubmitting(false);
      return;
    }
    if (!soilForm.testDate) {
      setSoilFormError('เลือกวันที่ตรวจวิเคราะห์ดิน');
      setIsSubmitting(false);
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
        setIsSubmitting(false);
        return;
      }
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        setSoilFormError(`${field.label} ต้องเป็นตัวเลข`);
        setIsSubmitting(false);
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
        setIsSubmitting(false);
        return;
      }
      parsedOptional[field.key] = parsed;
    }

    try {
      const analysisData: Partial<SoilAnalysis> = {
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

      if (editingSoilId) {
        const updatedAnalysis = await updateSoilAnalysis(editingSoilId, analysisData);
        setData(prev => ({
          ...prev,
          soilAnalyses: prev.soilAnalyses.map(analysis => (analysis.id === editingSoilId ? updatedAnalysis : analysis))
        }));
        setSoilToast({ type: 'success', message: 'อัปเดตผลวิเคราะห์ดินเรียบร้อยแล้ว' });
      } else {
        const newAnalysis = await addSoilAnalysis(analysisData);
        setData(prev => ({
          ...prev,
          soilAnalyses: [newAnalysis, ...prev.soilAnalyses],
        }));
        setSoilToast({ type: 'success', message: 'บันทึกผลวิเคราะห์ดินใหม่แล้ว' });
      }

      setEditingSoilId(null);
      setSoilFormError(null);
      setSoilForm(createEmptySoilForm({ farmPlotLocation: farm.location }));
      setIsSubmitting(false);
      
      // Auto-dismiss success toast after 4 seconds
      setTimeout(() => {
        setSoilToast(null);
      }, 4000);
    } catch (error: any) {
      console.error('Failed to save soil analysis:', error);
      const errorMessage = error?.message || 'ไม่สามารถบันทึกผลวิเคราะห์ดินได้ กรุณาลองอีกครั้ง';
      setSoilFormError(errorMessage);
      setSoilToast({ type: 'error', message: errorMessage });
      setIsSubmitting(false);
    }
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
      maxWidth="5xl"
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


          <form onSubmit={handleSoilSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="ชื่อแปลง / พื้นที่ปลูก"
                placeholder="เช่น Plot A, North Field"
                value={soilForm.farmPlotLocation}
                onChange={event => handleSoilFieldChange('farmPlotLocation', event.target.value)}
                required
                fullWidth
                disabled={isSubmitting}
              />
              <Input
                label="วันที่ตรวจ"
                type="date"
                value={soilForm.testDate}
                onChange={event => handleSoilFieldChange('testDate', event.target.value)}
                required
                fullWidth
                disabled={isSubmitting}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="ห้องแล็บที่ตรวจ"
                placeholder="เช่น Chiang Mai Agricultural Testing Laboratory"
                value={soilForm.labName}
                onChange={event => handleSoilFieldChange('labName', event.target.value)}
                fullWidth
                disabled={isSubmitting}
              />
              <Input
                label="เลขที่ใบรับรอง"
                placeholder="เช่น CMATL-2025-0342"
                value={soilForm.certificateNumber}
                onChange={event => handleSoilFieldChange('certificateNumber', event.target.value)}
                fullWidth
                disabled={isSubmitting}
              />
            </div>

            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-emerald-600" />
                  ค่าสารอาหารหลัก (จำเป็น)
                </p>
                <p className="text-xs text-gray-500">
                  กรอกค่าทั้งหมดเพื่อใช้สร้างคำแนะนำ AI
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input 
                  label="pH" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.pH} 
                  onChange={event => handleSoilFieldChange('pH', event.target.value)} 
                  required 
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input 
                  label="ฟอสฟอรัส (ppm)" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.phosphorus} 
                  onChange={event => handleSoilFieldChange('phosphorus', event.target.value)} 
                  required 
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input 
                  label="โพแทสเซียม (ppm)" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.potassium} 
                  onChange={event => handleSoilFieldChange('potassium', event.target.value)} 
                  required 
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input 
                  label="ไนโตรเจน (%)" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.nitrogen} 
                  onChange={event => handleSoilFieldChange('nitrogen', event.target.value)} 
                  required 
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input 
                  label="แคลเซียม (ppm)" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.calcium} 
                  onChange={event => handleSoilFieldChange('calcium', event.target.value)} 
                  required 
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input 
                  label="แมกนีเซียม (ppm)" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.magnesium} 
                  onChange={event => handleSoilFieldChange('magnesium', event.target.value)} 
                  required 
                  fullWidth
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm font-semibold text-gray-800 mb-3">ค่าสารอาหารเพิ่มเติม (ไม่จำเป็น)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input 
                  label="อินทรีย์วัตถุ (%)" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.organicMatter} 
                  onChange={event => handleSoilFieldChange('organicMatter', event.target.value)} 
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input 
                  label="กำมะถัน (ppm)" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.sulfur} 
                  onChange={event => handleSoilFieldChange('sulfur', event.target.value)} 
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input 
                  label="สังกะสี (ppm)" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.zinc} 
                  onChange={event => handleSoilFieldChange('zinc', event.target.value)} 
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input 
                  label="เหล็ก (ppm)" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.iron} 
                  onChange={event => handleSoilFieldChange('iron', event.target.value)} 
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input 
                  label="แมงกานีส (ppm)" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.manganese} 
                  onChange={event => handleSoilFieldChange('manganese', event.target.value)} 
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input 
                  label="ทองแดง (ppm)" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.copper} 
                  onChange={event => handleSoilFieldChange('copper', event.target.value)} 
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input 
                  label="โบรอน (ppm)" 
                  type="number" 
                  step="0.1" 
                  value={soilForm.boron} 
                  onChange={event => handleSoilFieldChange('boron', event.target.value)} 
                  fullWidth
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    คำแนะนำ
                    <span className="text-xs text-gray-500 font-normal ml-2">(สามารถสร้างด้วย AI ได้)</span>
                  </label>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleGenerateRecommendations}
                    disabled={isGeneratingRecommendations || isSubmitting}
                    className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                    title="สร้างคำแนะนำอัตโนมัติจากข้อมูลดินที่กรอก"
                  >
                    {isGeneratingRecommendations ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        กำลังสร้าง...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3 mr-1" />
                        สร้างคำแนะนำ AI
                      </>
                    )}
                  </Button>
                </div>
                <textarea
                  value={soilForm.recommendations}
                  onChange={event => handleSoilFieldChange('recommendations', event.target.value)}
                  rows={4}
                  placeholder="เช่น เพิ่มปุ๋ยอินทรีย์เพื่อรักษาระดับ OM หรือคลิกปุ่ม 'สร้างคำแนะนำ AI' เพื่อสร้างคำแนะนำอัตโนมัติจากข้อมูลดินที่กรอก"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                  disabled={isGeneratingRecommendations}
                />
                {isGeneratingRecommendations && (
                  <p className="mt-1 text-xs text-emerald-600 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    กำลังสร้างคำแนะนำจาก AI... กรุณารอสักครู่
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">บันทึกเพิ่มเติม</label>
                <textarea
                  value={soilForm.notes}
                  onChange={event => handleSoilFieldChange('notes', event.target.value)}
                  rows={4}
                  placeholder="รายละเอียดเพิ่มเติมของการตรวจครั้งนี้"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {soilFormError && (
              <div className="px-4 py-3 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm flex items-start gap-2">
                <X className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold mb-1">เกิดข้อผิดพลาด:</p>
                  <p>{soilFormError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSoilFormError(null)}
                  className="text-red-600 hover:text-red-800 flex-shrink-0"
                  aria-label="ปิดข้อความแจ้งเตือน"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            
            {soilToast && (
              <div className={`px-4 py-3 border rounded-xl text-sm flex items-start gap-2 ${
                soilToast.type === 'success' 
                  ? 'border-green-200 bg-green-50 text-green-700' 
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}>
                {soilToast.type === 'success' ? (
                  <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                ) : (
                  <X className="h-4 w-4 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-semibold mb-1">
                    {soilToast.type === 'success' ? 'สำเร็จ!' : 'เกิดข้อผิดพลาด'}
                  </p>
                  <p>{soilToast.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSoilToast(null)}
                  className={`flex-shrink-0 ${
                    soilToast.type === 'success' 
                      ? 'text-green-600 hover:text-green-800' 
                      : 'text-red-600 hover:text-red-800'
                  }`}
                  aria-label="ปิดข้อความแจ้งเตือน"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex justify-end gap-3">
              {editingSoilId && (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleSoilCancelEdit}
                  disabled={isSubmitting}
                >
                  ยกเลิกการแก้ไข
                </Button>
              )}
              <Button 
                type="submit" 
                variant="primary" 
                icon={isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'กำลังบันทึก...' : (editingSoilId ? 'บันทึกการแก้ไขผลดิน' : 'บันทึกผลดิน')}
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
              <div className="overflow-hidden rounded-lg border border-gray-200">
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
