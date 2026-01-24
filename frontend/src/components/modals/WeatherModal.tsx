import React, { useState, useMemo, useEffect } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { WeatherRecord, Farm } from '../../types';
import { addWeatherRecord, updateWeatherRecord } from '../../services/weatherService';
import { fetchWeatherData } from '../../services/weatherApiService';
import { Cloud, Thermometer, Droplets, CloudRain, RefreshCw } from 'lucide-react';
import DatePicker from '../common/DatePicker';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

interface WeatherModalProps {
  isOpen: boolean;
  onClose: () => void;
  farm: Farm;
  editingRecord?: WeatherRecord | null;
}

export const WeatherModal: React.FC<WeatherModalProps> = ({
  isOpen,
  onClose,
  farm,
  editingRecord = null,
}) => {
  const { data, setData } = useDataContext();
  const { currentUser } = useAuth();

  // Form states
  const [recordDate, setRecordDate] = useState(new Date().toISOString().substring(0, 10));
  const [temperatureMin, setTemperatureMin] = useState('');
  const [temperatureMax, setTemperatureMax] = useState('');
  const [rainfall, setRainfall] = useState('');
  const [humidity, setHumidity] = useState('70');
  const [notes, setNotes] = useState('');

  // API states
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Calculate temperature average automatically
  const temperatureAvg = useMemo(() => {
    if (temperatureMin && temperatureMax) {
      return ((parseFloat(temperatureMin) + parseFloat(temperatureMax)) / 2).toFixed(1);
    }
    return '';
  }, [temperatureMin, temperatureMax]);

  // Load editing data
  useEffect(() => {
    if (editingRecord) {
      setRecordDate(editingRecord.recordDate);
      setTemperatureMin(editingRecord.temperatureMin.toString());
      setTemperatureMax(editingRecord.temperatureMax.toString());
      setRainfall(editingRecord.rainfall.toString());
      setHumidity(editingRecord.humidity.toString());
      setNotes(editingRecord.notes || '');
    } else {
      resetForm();
    }
  }, [editingRecord, isOpen]);

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
      }
    } catch (error) {
      setFetchError('ไม่สามารถดึงข้อมูลสภาพอากาศได้ กรุณาลองใหม่');
      console.error('Weather fetch error:', error);
    } finally {
      setIsFetchingWeather(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingRecord) {
      // Update existing record
      const updatedRecord: WeatherRecord = {
        ...editingRecord,
        farmId: farm.id,
        farmPlotLocation: farm.location,
        recordDate,
        temperatureMin: parseFloat(temperatureMin),
        temperatureMax: parseFloat(temperatureMax),
        temperatureAvg: temperatureAvg ? parseFloat(temperatureAvg) : (parseFloat(temperatureMin) + parseFloat(temperatureMax)) / 2,
        rainfall: parseFloat(rainfall),
        humidity: parseFloat(humidity),
        notes: notes || undefined,
      };
      updateWeatherRecord(updatedRecord);
      setData(prev => ({
        ...prev,
        weatherRecords: prev.weatherRecords.map(r => r.id === editingRecord.id ? updatedRecord : r)
      }));
    } else {
      // Create new record
      const newIdNumber = Math.max(...data.weatherRecords.map(r => parseInt(r.id.replace('WR', '')) || 0), 0) + 1;
      const newId = `WR${String(newIdNumber).padStart(3, '0')}`;

      const newRecord: WeatherRecord = {
        id: newId,
        farmId: farm.id,
        farmPlotLocation: farm.location,
        recordDate,
        temperatureMin: parseFloat(temperatureMin),
        temperatureMax: parseFloat(temperatureMax),
        temperatureAvg: temperatureAvg ? parseFloat(temperatureAvg) : (parseFloat(temperatureMin) + parseFloat(temperatureMax)) / 2,
        rainfall: parseFloat(rainfall),
        humidity: parseFloat(humidity),
        source: 'Manual',
        recordedBy: currentUser?.id,
        notes: notes || undefined,
      };

      addWeatherRecord(newRecord);
      setData(prev => ({ ...prev, weatherRecords: [newRecord, ...prev.weatherRecords] }));
    }

    onClose();
  };

  const inputClass = "block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white hover:border-gray-400 placeholder-gray-400 text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingRecord ? 'แก้ไขข้อมูลอากาศ' : 'บันทึกสภาพอากาศ'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Farm Info Banner */}
        <div className="bg-blue-50 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Cloud className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-blue-900">{farm.farmerName}</p>
              <p className="text-sm text-blue-700">
                {farm.location}
                {farm.latitude && farm.longitude && (
                  <span className="ml-2 text-xs">
                    ({farm.latitude.toFixed(3)}, {farm.longitude.toFixed(3)})
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Fetch from API Button */}
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
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">
            {fetchError}
          </div>
        )}

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
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-gray-500" />
            อุณหภูมิ
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>ต่ำสุด (°C) *</label>
              <input
                type="number"
                step="0.1"
                value={temperatureMin}
                onChange={e => setTemperatureMin(e.target.value)}
                required
                placeholder="20"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>สูงสุด (°C) *</label>
              <input
                type="number"
                step="0.1"
                value={temperatureMax}
                onChange={e => setTemperatureMax(e.target.value)}
                required
                placeholder="32"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>เฉลี่ย (°C)</label>
              <input
                type="text"
                value={temperatureAvg}
                readOnly
                className={`${inputClass} bg-gray-50`}
                placeholder="คำนวณอัตโนมัติ"
              />
            </div>
          </div>
        </div>

        {/* Rainfall & Humidity */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              <span className="flex items-center gap-1">
                <CloudRain className="h-4 w-4 text-gray-500" />
                ปริมาณฝน (mm) *
              </span>
            </label>
            <input
              type="number"
              step="0.1"
              value={rainfall}
              onChange={e => setRainfall(e.target.value)}
              required
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              <span className="flex items-center gap-1">
                <Droplets className="h-4 w-4 text-gray-500" />
                ความชื้น (%) *
              </span>
            </label>
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={humidity}
              onChange={e => setHumidity(e.target.value)}
              required
              placeholder="70"
              className={inputClass}
            />
          </div>
        </div>

        {/* Notes */}
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

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose} type="button">
            ยกเลิก
          </Button>
          <Button variant="primary" type="submit">
            {editingRecord ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default WeatherModal;
