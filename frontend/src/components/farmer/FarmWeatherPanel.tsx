import React, { useEffect, useMemo, useState } from 'react';
import { Cloud, Thermometer, Droplets, CloudRain, RefreshCw, X, CheckCircle, Edit3, Trash2, Loader2 } from 'lucide-react';
import { Button, Input, Modal } from '../common';
import Select from '../common/Select';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Farm, WeatherRecord, UserRole } from '../../types';
import { addWeatherRecord, updateWeatherRecord, deleteWeatherRecord } from '../../services/weatherService';
import { fetchWeatherData } from '../../services/weatherApiService';
import DatePicker from '../common/DatePicker';
import { formatDateDisplay } from '../../utils/formatters';

interface FarmWeatherPanelProps {
  farm: Farm | null;
  isOpen?: boolean;
  onClose?: () => void;
}

const FarmWeatherPanel: React.FC<FarmWeatherPanelProps> = ({ farm, isOpen = true, onClose }) => {
  const { data, setData } = useDataContext();
  const { currentUser } = useAuth();

  // Form states
  const [recordDate, setRecordDate] = useState(new Date().toISOString().substring(0, 10));
  const [temperatureMin, setTemperatureMin] = useState('');
  const [temperatureMax, setTemperatureMax] = useState('');
  const [rainfall, setRainfall] = useState('');
  const [humidity, setHumidity] = useState('70');
  const [notes, setNotes] = useState('');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [weatherFormError, setWeatherFormError] = useState<string | null>(null);
  const [weatherToast, setWeatherToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // API states
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);
  const [fetchError, setFetchError] = useState('');
  
  // Auto-fetch states
  const [autoFetchEnabled, setAutoFetchEnabled] = useState(false);
  const [autoFetchInterval, setAutoFetchInterval] = useState(5); // minutes
  const [lastAutoFetch, setLastAutoFetch] = useState<Date | null>(null);
  const [nextAutoFetch, setNextAutoFetch] = useState<Date | null>(null);

  // Calculate temperature average automatically
  const temperatureAvg = useMemo(() => {
    if (temperatureMin && temperatureMax) {
      return ((parseFloat(temperatureMin) + parseFloat(temperatureMax)) / 2).toFixed(1);
    }
    return '';
  }, [temperatureMin, temperatureMax]);

  // Auto-fetch effect
  useEffect(() => {
    if (!autoFetchEnabled || !farm || !farm.latitude || !farm.longitude) {
      return;
    }

    // Calculate next fetch time
    const updateNextFetchTime = () => {
      setNextAutoFetch(new Date(Date.now() + autoFetchInterval * 60 * 1000));
    };

    // Initial fetch
    const doAutoFetch = async () => {
      try {
        const weatherData = await fetchWeatherData(farm.latitude!, farm.longitude!, new Date().toISOString().substring(0, 10));
        if (weatherData) {
          // Auto-save the weather record
          const weatherRecord: Partial<WeatherRecord> = {
            farmId: farm.id,
            farmPlotLocation: farm.location,
            recordDate: new Date().toISOString().substring(0, 10),
            temperatureMin: weatherData.temperatureMin,
            temperatureMax: weatherData.temperatureMax,
            temperatureAvg: (weatherData.temperatureMin + weatherData.temperatureMax) / 2,
            rainfall: weatherData.rainfall,
            humidity: weatherData.humidity || 70,
            notes: `ดึงอัตโนมัติจาก Open-Meteo API เมื่อ ${new Date().toLocaleString('th-TH')}`,
          };
          const newRecord = await addWeatherRecord(weatherRecord as Omit<WeatherRecord, 'id'>);
          setData(prev => ({
            ...prev,
            weatherRecords: [newRecord, ...prev.weatherRecords]
          }));
          setLastAutoFetch(new Date());
          setWeatherToast({ type: 'success', message: `ดึงและบันทึกข้อมูลอัตโนมัติสำเร็จ` });
          setTimeout(() => setWeatherToast(null), 3000);
        }
      } catch (error) {
        console.error('Auto-fetch error:', error);
        setWeatherToast({ type: 'error', message: 'ดึงข้อมูลอัตโนมัติล้มเหลว' });
        setTimeout(() => setWeatherToast(null), 3000);
      }
      updateNextFetchTime();
    };

    // Set up interval
    updateNextFetchTime();
    const intervalId = setInterval(doAutoFetch, autoFetchInterval * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [autoFetchEnabled, autoFetchInterval, farm, setData]);

  const selectedFarmRecords = useMemo(() => {
    if (!farm) {
      return [];
    }
    return data.weatherRecords
      .filter(record => record.farmId === farm.id)
      .sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime());
  }, [data.weatherRecords, farm]);

  useEffect(() => {
    if (!farm) {
      resetForm();
      setEditingRecordId(null);
      setWeatherFormError(null);
      setWeatherToast(null);
      return;
    }
    resetForm();
    setEditingRecordId(null);
    setWeatherFormError(null);
    setWeatherToast(null);
  }, [farm]);

  const resetForm = () => {
    setRecordDate(new Date().toISOString().substring(0, 10));
    setTemperatureMin('');
    setTemperatureMax('');
    setRainfall('');
    setHumidity('70');
    setNotes('');
    setFetchError('');
  };

  // Fetch weather from API
  const handleFetchWeather = async () => {
    if (!farm) return;
    
    if (!farm.latitude || !farm.longitude) {
      setFetchError('ฟาร์มนี้ยังไม่มีพิกัด GPS กรุณาเพิ่มพิกัดในข้อมูลฟาร์มก่อน');
      return;
    }

    setIsFetchingWeather(true);
    setFetchError('');

    try {
      const weatherData = await fetchWeatherData(farm.latitude, farm.longitude, recordDate);

      if (weatherData) {
        setTemperatureMin(weatherData.temperatureMin.toString());
        setTemperatureMax(weatherData.temperatureMax.toString());
        setRainfall(weatherData.rainfall.toString());
        if (weatherData.humidity) {
          setHumidity(weatherData.humidity.toString());
        }
        setNotes(`ดึงข้อมูลอัตโนมัติจาก Open-Meteo API เมื่อ ${new Date().toLocaleString('th-TH')}`);
        setWeatherToast({ type: 'success', message: 'ดึงข้อมูลสภาพอากาศสำเร็จ' });
        setTimeout(() => setWeatherToast(null), 3000);
      }
    } catch (error) {
      setFetchError('ไม่สามารถดึงข้อมูลสภาพอากาศได้ กรุณาลองใหม่');
      console.error('Weather fetch error:', error);
    } finally {
      setIsFetchingWeather(false);
    }
  };

  const handleWeatherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!farm) {
      setWeatherFormError('กรุณาเลือกฟาร์ม');
      return;
    }

    setWeatherFormError(null);
    setIsSubmitting(true);

    // Validation
    if (!recordDate) {
      setWeatherFormError('กรุณาเลือกวันที่บันทึก');
      setIsSubmitting(false);
      return;
    }
    if (!temperatureMin || !temperatureMax) {
      setWeatherFormError('กรุณากรอกอุณหภูมิต่ำสุดและสูงสุด');
      setIsSubmitting(false);
      return;
    }
    if (!rainfall || rainfall === '') {
      setWeatherFormError('กรุณากรอกปริมาณฝน');
      setIsSubmitting(false);
      return;
    }
    if (!humidity || humidity === '') {
      setWeatherFormError('กรุณากรอกความชื้น');
      setIsSubmitting(false);
      return;
    }

    try {
      const weatherData: Partial<WeatherRecord> = {
        farmId: farm.id,
        farmPlotLocation: farm.location,
        recordDate,
        temperatureMin: parseFloat(temperatureMin),
        temperatureMax: parseFloat(temperatureMax),
        temperatureAvg: temperatureAvg ? parseFloat(temperatureAvg) : (parseFloat(temperatureMin) + parseFloat(temperatureMax)) / 2,
        rainfall: parseFloat(rainfall),
        humidity: parseFloat(humidity),
        notes: notes.trim() || undefined,
        source: 'Manual',
        recordedBy: currentUser?.id,
      };

      if (editingRecordId) {
        const updatedRecord = await updateWeatherRecord(editingRecordId, weatherData);
        setData(prev => ({
          ...prev,
          weatherRecords: prev.weatherRecords.map(r => r.id === editingRecordId ? updatedRecord : r)
        }));
        setWeatherToast({ type: 'success', message: 'อัปเดตข้อมูลอากาศเรียบร้อยแล้ว' });
      } else {
        const newIdNumber = Math.max(...data.weatherRecords.map(r => parseInt(r.id.replace('WR', '')) || 0), 0) + 1;
        const newId = `WR${String(newIdNumber).padStart(3, '0')}`;

        const newRecord: WeatherRecord = {
          id: newId,
          ...weatherData,
        } as WeatherRecord;

        await addWeatherRecord(newRecord);
        setData(prev => ({ ...prev, weatherRecords: [newRecord, ...prev.weatherRecords] }));
        setWeatherToast({ type: 'success', message: 'บันทึกข้อมูลอากาศใหม่แล้ว' });
      }

      setEditingRecordId(null);
      setWeatherFormError(null);
      resetForm();
      setIsSubmitting(false);
      
      // Auto-dismiss success toast after 4 seconds
      setTimeout(() => {
        setWeatherToast(null);
      }, 4000);
    } catch (error: any) {
      console.error('Failed to save weather record:', error);
      const errorMessage = error?.message || 'ไม่สามารถบันทึกข้อมูลอากาศได้ กรุณาลองอีกครั้ง';
      setWeatherFormError(errorMessage);
      setWeatherToast({ type: 'error', message: errorMessage });
      setIsSubmitting(false);
    }
  };

  const handleWeatherEdit = (record: WeatherRecord) => {
    setEditingRecordId(record.id);
    setWeatherFormError(null);
    setRecordDate(record.recordDate);
    setTemperatureMin(record.temperatureMin.toString());
    setTemperatureMax(record.temperatureMax.toString());
    setRainfall(record.rainfall.toString());
    setHumidity(record.humidity.toString());
    setNotes(record.notes || '');
  };

  const handleWeatherCancelEdit = () => {
    setEditingRecordId(null);
    setWeatherFormError(null);
    resetForm();
  };

  const handleWeatherDelete = async (recordId: string) => {
    if (!confirm('ยืนยันการลบข้อมูลอากาศนี้?')) {
      return;
    }
    try {
      await deleteWeatherRecord(recordId);
      setData(prev => ({
        ...prev,
        weatherRecords: prev.weatherRecords.filter(record => record.id !== recordId),
      }));
      if (editingRecordId === recordId) {
        handleWeatherCancelEdit();
      }
      setWeatherToast({ type: 'success', message: 'ลบข้อมูลอากาศแล้ว' });
      setTimeout(() => setWeatherToast(null), 3000);
    } catch (error: any) {
      console.error('Failed to delete weather record:', error);
      setWeatherToast({ type: 'error', message: 'ไม่สามารถลบข้อมูลอากาศได้' });
      setTimeout(() => setWeatherToast(null), 3000);
    }
  };

  // If not open, don't render anything
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose || (() => {})}
      title="ข้อมูลอากาศของฟาร์ม"
      maxWidth="4xl"
    >
      <div className="space-y-6">
      {!farm ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
          เลือกฟาร์มจากรายการเพื่อเริ่มบันทึกข้อมูลอากาศ
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-full bg-white shadow">
                <Cloud className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-700">{farm.id}</p>
                <h3 className="text-xl font-bold text-gray-900">{farm.name ?? farm.location}</h3>
                <p className="text-sm text-gray-600">{farm.location}</p>
                <p className="text-sm text-gray-600">เจ้าของ: {farm.ownerName ?? farm.farmerName}</p>
                {farm.latitude && farm.longitude && (
                  <p className="text-sm text-gray-600">
                    พิกัด: ({farm.latitude.toFixed(3)}, {farm.longitude.toFixed(3)})
                  </p>
                )}
              </div>
            </div>
            <div className="text-sm text-gray-600">
              บันทึกแล้ว {selectedFarmRecords.length} รายการ
            </div>
          </div>

          {/* Fetch from API Section */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <RefreshCw className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-blue-900">ดึงข้อมูลจาก API</p>
                  <p className="text-xs text-blue-700">
                    {farm.latitude && farm.longitude 
                      ? 'ดึงข้อมูลสภาพอากาศอัตโนมัติจาก Open-Meteo API'
                      : 'ฟาร์มนี้ยังไม่มีพิกัด GPS กรุณาเพิ่มพิกัดก่อน'}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handleFetchWeather}
                disabled={isFetchingWeather || !farm.latitude || !farm.longitude}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isFetchingWeather ? 'animate-spin' : ''}`} />
                {isFetchingWeather ? 'กำลังดึง...' : 'ดึงจาก API'}
              </Button>
            </div>
            {fetchError && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {fetchError}
              </div>
            )}

            {/* Auto-fetch Settings */}
            {farm.latitude && farm.longitude && (
              <div className="mt-4 pt-4 border-t border-blue-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoFetchEnabled}
                        onChange={(e) => setAutoFetchEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                    <div>
                      <p className="text-sm font-medium text-blue-900">ดึงข้อมูลอัตโนมัติ</p>
                      <p className="text-xs text-blue-700">
                        {autoFetchEnabled 
                          ? `ดึงและบันทึกอัตโนมัติทุก ${autoFetchInterval} นาที`
                          : 'เปิดเพื่อดึงข้อมูลอัตโนมัติ'}
                      </p>
                    </div>
                  </div>
                  {autoFetchEnabled && (
                    <Select
                      options={[
                        { value: 1, label: 'ทุก 1 นาที' },
                        { value: 5, label: 'ทุก 5 นาที' },
                        { value: 10, label: 'ทุก 10 นาที' },
                        { value: 15, label: 'ทุก 15 นาที' },
                        { value: 30, label: 'ทุก 30 นาที' },
                        { value: 60, label: 'ทุก 1 ชั่วโมง' },
                      ]}
                      value={autoFetchInterval}
                      onChange={(val) => setAutoFetchInterval(Number(val))}
                      className="w-36"
                    />
                  )}
                </div>
                {autoFetchEnabled && (
                  <div className="mt-3 flex items-center gap-4 text-xs text-blue-600">
                    {lastAutoFetch && (
                      <span>ดึงล่าสุด: {lastAutoFetch.toLocaleTimeString('th-TH')}</span>
                    )}
                    {nextAutoFetch && (
                      <span>ดึงครั้งถัดไป: {nextAutoFetch.toLocaleTimeString('th-TH')}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleWeatherSubmit} className="space-y-6">
            {/* Date Selection */}
            <div>
              <DatePicker
                value={recordDate}
                onChange={setRecordDate}
                label="วันที่บันทึก"
                required
              />
            </div>

            {/* Temperature */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-blue-600" />
                  อุณหภูมิ
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="ต่ำสุด (°C) *"
                  type="number"
                  step="0.1"
                  value={temperatureMin}
                  onChange={(e) => setTemperatureMin(e.target.value)}
                  required
                  placeholder="20"
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input
                  label="สูงสุด (°C) *"
                  type="number"
                  step="0.1"
                  value={temperatureMax}
                  onChange={(e) => setTemperatureMax(e.target.value)}
                  required
                  placeholder="32"
                  fullWidth
                  disabled={isSubmitting}
                />
                <Input
                  label="เฉลี่ย (°C)"
                  type="text"
                  value={temperatureAvg}
                  readOnly
                  placeholder="คำนวณอัตโนมัติ"
                  fullWidth
                  disabled
                />
              </div>
            </div>

            {/* Rainfall & Humidity */}
            <div className="border-t border-gray-200 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <CloudRain className="h-4 w-4 text-gray-500" />
                    ปริมาณฝน (mm) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={rainfall}
                    onChange={(e) => setRainfall(e.target.value)}
                    required
                    placeholder="0"
                    disabled={isSubmitting}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400 text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-gray-500" />
                    ความชื้น (%) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={humidity}
                    onChange={(e) => setHumidity(e.target.value)}
                    required
                    placeholder="70"
                    disabled={isSubmitting}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400 text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">หมายเหตุ</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="บันทึกเพิ่มเติม..."
                disabled={isSubmitting}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400 text-sm resize-none disabled:bg-gray-50 disabled:cursor-not-allowed"
              />
            </div>

            {weatherFormError && (
              <div className="px-4 py-3 border border-red-200 bg-red-50 rounded-xl text-red-700 text-sm flex items-start gap-2">
                <X className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold mb-1">เกิดข้อผิดพลาด:</p>
                  <p>{weatherFormError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setWeatherFormError(null)}
                  className="text-red-600 hover:text-red-800 flex-shrink-0"
                  aria-label="ปิดข้อความแจ้งเตือน"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            
            {weatherToast && (
              <div className={`px-4 py-3 border rounded-xl text-sm flex items-start gap-2 ${
                weatherToast.type === 'success' 
                  ? 'border-green-200 bg-green-50 text-green-700' 
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}>
                {weatherToast.type === 'success' ? (
                  <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                ) : (
                  <X className="h-4 w-4 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-semibold mb-1">
                    {weatherToast.type === 'success' ? 'สำเร็จ!' : 'เกิดข้อผิดพลาด'}
                  </p>
                  <p>{weatherToast.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setWeatherToast(null)}
                  className={`flex-shrink-0 ${
                    weatherToast.type === 'success' 
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
              {editingRecordId && (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleWeatherCancelEdit}
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
                {isSubmitting ? 'กำลังบันทึก...' : (editingRecordId ? 'บันทึกการแก้ไขข้อมูลอากาศ' : 'บันทึกข้อมูลอากาศ')}
              </Button>
            </div>
          </form>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">ประวัติการบันทึกข้อมูลอากาศ</h3>
              <p className="text-sm text-gray-500">มี {selectedFarmRecords.length} รายการที่บันทึกไว้</p>
            </div>
            {selectedFarmRecords.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-gray-500">
                ยังไม่มีการบันทึกข้อมูลอากาศสำหรับฟาร์มนี้
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-900 text-white">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">วันที่บันทึก</th>
                      <th className="px-4 py-3 text-center font-semibold">อุณหภูมิ (°C)</th>
                      <th className="px-4 py-3 text-center font-semibold">ฝน (mm)</th>
                      <th className="px-4 py-3 text-center font-semibold">ความชื้น (%)</th>
                      <th className="px-4 py-3 text-left font-semibold">หมายเหตุ</th>
                      <th className="px-4 py-3 text-center font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {selectedFarmRecords.map(record => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateDisplay(record.recordDate)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-blue-600 font-medium">{record.temperatureMin}</span>
                            <span className="text-gray-400">-</span>
                            <span className="text-red-600 font-medium">{record.temperatureMax}</span>
                            <span className="text-gray-500 ml-1">({record.temperatureAvg})</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-gray-900">{record.rainfall}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{record.humidity}%</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{record.notes || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                handleWeatherEdit(record);
                              }}
                              className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
                              aria-label="แก้ไขข้อมูลอากาศ"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                handleWeatherDelete(record.id);
                              }}
                              className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                              aria-label="ลบข้อมูลอากาศ"
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

export default FarmWeatherPanel;
