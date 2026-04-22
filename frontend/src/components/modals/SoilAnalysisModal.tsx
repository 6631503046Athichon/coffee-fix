import * as React from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { SoilAnalysis, Farm, UserRole } from '../../types';
import { Microscope, FlaskConical, Beaker } from 'lucide-react';
import DatePicker from '../common/DatePicker';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { generateSoilAnalysisId } from '../../utils/idGenerator';

interface SoilAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  farm: Farm;
  currentUser: { id: string; name: string; roles: UserRole[] };
  editingAnalysis?: SoilAnalysis | null;
}

export const SoilAnalysisModal: React.FC<SoilAnalysisModalProps> = ({
  isOpen,
  onClose,
  farm,
  currentUser,
  editingAnalysis = null,
}) => {
  const { data, setData } = useDataContext();

  // Form state
  const [farmPlotLocation, setFarmPlotLocation] = React.useState('');
  const [testDate, setTestDate] = React.useState(new Date().toISOString().substring(0, 10));
  const [labName, setLabName] = React.useState('');
  const [certificateNumber, setCertificateNumber] = React.useState('');

  // Core nutrients (required)
  const [pH, setPH] = React.useState<string>('');
  const [phosphorus, setPhosphorus] = React.useState<string>('');
  const [potassium, setPotassium] = React.useState<string>('');
  const [nitrogen, setNitrogen] = React.useState<string>('');
  const [calcium, setCalcium] = React.useState<string>('');
  const [magnesium, setMagnesium] = React.useState<string>('');

  // Optional nutrients
  const [organicMatter, setOrganicMatter] = React.useState<string>('');
  const [sulfur, setSulfur] = React.useState<string>('');
  const [zinc, setZinc] = React.useState<string>('');
  const [iron, setIron] = React.useState<string>('');
  const [manganese, setManganese] = React.useState<string>('');
  const [copper, setCopper] = React.useState<string>('');
  const [boron, setBoron] = React.useState<string>('');

  const [notes, setNotes] = React.useState('');
  const [recommendations, setRecommendations] = React.useState('');

  // Load editing data
  React.useEffect(() => {
    if (editingAnalysis) {
      setFarmPlotLocation(editingAnalysis.farmPlotLocation);
      setTestDate(editingAnalysis.testDate);
      setLabName(editingAnalysis.labName || '');
      setCertificateNumber(editingAnalysis.certificateNumber || '');
      setPH(editingAnalysis.pH?.toString() || '');
      setPhosphorus(editingAnalysis.phosphorus?.toString() || '');
      setPotassium(editingAnalysis.potassium?.toString() || '');
      setNitrogen(editingAnalysis.nitrogen?.toString() || '');
      setCalcium(editingAnalysis.calcium?.toString() || '');
      setMagnesium(editingAnalysis.magnesium?.toString() || '');
      setOrganicMatter(editingAnalysis.organicMatter?.toString() || '');
      setSulfur(editingAnalysis.sulfur?.toString() || '');
      setZinc(editingAnalysis.zinc?.toString() || '');
      setIron(editingAnalysis.iron?.toString() || '');
      setManganese(editingAnalysis.manganese?.toString() || '');
      setCopper(editingAnalysis.copper?.toString() || '');
      setBoron(editingAnalysis.boron?.toString() || '');
      setNotes(editingAnalysis.notes || '');
      setRecommendations(editingAnalysis.recommendations || '');
    } else {
      resetForm();
    }
  }, [editingAnalysis, isOpen]);

  const resetForm = () => {
    setFarmPlotLocation(farm.location || '');
    setTestDate(new Date().toISOString().substring(0, 10));
    setLabName('');
    setCertificateNumber('');
    setPH('');
    setPhosphorus('');
    setPotassium('');
    setNitrogen('');
    setCalcium('');
    setMagnesium('');
    setOrganicMatter('');
    setSulfur('');
    setZinc('');
    setIron('');
    setManganese('');
    setCopper('');
    setBoron('');
    setNotes('');
    setRecommendations('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const analysisData: Omit<SoilAnalysis, 'id'> = {
      farmId: farm.id,
      farmPlotLocation,
      testDate,
      labName: labName || undefined,
      certificateNumber: certificateNumber || undefined,
      pH: parseFloat(pH),
      phosphorus: parseFloat(phosphorus),
      potassium: parseFloat(potassium),
      nitrogen: nitrogen ? parseFloat(nitrogen) : undefined,
      calcium: parseFloat(calcium),
      magnesium: parseFloat(magnesium),
      organicMatter: organicMatter ? parseFloat(organicMatter) : undefined,
      sulfur: sulfur ? parseFloat(sulfur) : undefined,
      zinc: zinc ? parseFloat(zinc) : undefined,
      iron: iron ? parseFloat(iron) : undefined,
      manganese: manganese ? parseFloat(manganese) : undefined,
      copper: copper ? parseFloat(copper) : undefined,
      boron: boron ? parseFloat(boron) : undefined,
      notes: notes || undefined,
      recommendations: recommendations || undefined,
      createdBy: currentUser.id,
      createdByRole: currentUser.roles[0],
    };

    if (editingAnalysis) {
      setData(prev => ({
        ...prev,
        soilAnalyses: prev.soilAnalyses.map(analysis =>
          analysis.id === editingAnalysis.id
            ? { ...analysisData, id: editingAnalysis.id }
            : analysis
        )
      }));
    } else {
      const newAnalysis: SoilAnalysis = {
        id: generateSoilAnalysisId(data.soilAnalyses.map(a => a.id)),
        ...analysisData
      };
      setData(prev => ({ ...prev, soilAnalyses: [newAnalysis, ...prev.soilAnalyses] }));
    }

    onClose();
  };

  const inputClass = "block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400 text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingAnalysis ? 'แก้ไขข้อมูลดิน' : 'เพิ่มข้อมูลดิน'}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Farm Info Banner */}
        <div className="bg-emerald-50 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Microscope className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-emerald-900">{farm.farmerName}</p>
            <p className="text-sm text-emerald-700">{farm.location}</p>
          </div>
        </div>

        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-gray-500" />
            ข้อมูลพื้นฐาน
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>ชื่อแปลง / พื้นที่ปลูก *</label>
              <input
                type="text"
                value={farmPlotLocation}
                onChange={e => setFarmPlotLocation(e.target.value)}
                required
                placeholder="เช่น แปลง A, ไร่เหนือ"
                className={inputClass}
              />
            </div>
            <div>
              <DatePicker
                value={testDate}
                onChange={setTestDate}
                label="วันที่ตรวจ"
                required
              />
            </div>
            <div>
              <label className={labelClass}>ห้องแล็บที่ตรวจ</label>
              <input
                type="text"
                value={labName}
                onChange={e => setLabName(e.target.value)}
                placeholder="เช่น ห้องปฏิบัติการเกษตรเชียงใหม่"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>เลขที่ใบรับรอง</label>
              <input
                type="text"
                value={certificateNumber}
                onChange={e => setCertificateNumber(e.target.value)}
                placeholder="เช่น CMATL-2025-0342"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Core Nutrients */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Beaker className="h-4 w-4 text-gray-500" />
            ค่าสารอาหารหลัก (จำเป็น)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>pH *</label>
              <input
                type="number"
                step="0.1"
                value={pH}
                onChange={e => setPH(e.target.value)}
                required
                placeholder="6.5"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ฟอสฟอรัส (ppm) *</label>
              <input
                type="number"
                step="0.1"
                value={phosphorus}
                onChange={e => setPhosphorus(e.target.value)}
                required
                placeholder="45"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>โพแทสเซียม (ppm) *</label>
              <input
                type="number"
                step="0.1"
                value={potassium}
                onChange={e => setPotassium(e.target.value)}
                required
                placeholder="180"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>แคลเซียม (ppm) *</label>
              <input
                type="number"
                step="0.1"
                value={calcium}
                onChange={e => setCalcium(e.target.value)}
                required
                placeholder="1200"
                className={inputClass}
              />
            </div>
            <div className="md:col-start-2">
              <label className={labelClass}>แมกนีเซียม (ppm) *</label>
              <input
                type="number"
                step="0.1"
                value={magnesium}
                onChange={e => setMagnesium(e.target.value)}
                required
                placeholder="150"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Optional Nutrients - Collapsed by default */}
        <details className="group">
          <summary className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-gray-900 flex items-center gap-2">
            <span className="group-open:rotate-90 transition-transform">▶</span>
            ค่าสารอาหารเสริม (ไม่จำเป็น)
          </summary>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>อินทรียวัตถุ (%)</label>
              <input
                type="number"
                step="0.1"
                value={organicMatter}
                onChange={e => setOrganicMatter(e.target.value)}
                placeholder="4.5"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>กำมะถัน (ppm)</label>
              <input
                type="number"
                step="0.1"
                value={sulfur}
                onChange={e => setSulfur(e.target.value)}
                placeholder="20"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>สังกะสี (ppm)</label>
              <input
                type="number"
                step="0.1"
                value={zinc}
                onChange={e => setZinc(e.target.value)}
                placeholder="3.5"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>เหล็ก (ppm)</label>
              <input
                type="number"
                step="0.1"
                value={iron}
                onChange={e => setIron(e.target.value)}
                placeholder="85"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>แมงกานีส (ppm)</label>
              <input
                type="number"
                step="0.1"
                value={manganese}
                onChange={e => setManganese(e.target.value)}
                placeholder="25"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ทองแดง (ppm)</label>
              <input
                type="number"
                step="0.1"
                value={copper}
                onChange={e => setCopper(e.target.value)}
                placeholder="2.0"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>โบรอน (ppm)</label>
              <input
                type="number"
                step="0.1"
                value={boron}
                onChange={e => setBoron(e.target.value)}
                placeholder="0.8"
                className={inputClass}
              />
            </div>
          </div>
        </details>

        {/* Notes & Recommendations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>หมายเหตุ</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="บันทึกเพิ่มเติม..."
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>คำแนะนำ</label>
            <textarea
              value={recommendations}
              onChange={e => setRecommendations(e.target.value)}
              rows={3}
              placeholder="คำแนะนำจากห้องแล็บ..."
              className={inputClass}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose} type="button">
            ยกเลิก
          </Button>
          <Button variant="primary" type="submit">
            {editingAnalysis ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default SoilAnalysisModal;
