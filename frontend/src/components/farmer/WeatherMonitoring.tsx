import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { WeatherRecord, Farm } from '../../types';
import { addWeatherRecord, updateWeatherRecord, deleteWeatherRecord } from '../../services/weatherService';
import { fetchWeatherData } from '../../services/weatherApiService';
import { Cloud, Droplets, Thermometer, Wind, Calendar, Edit, Trash2, CheckCircle, ChevronDown, Check, TrendingUp, TrendingDown, Download, X } from 'lucide-react';
import DatePicker from '../common/DatePicker';

// Custom Dropdown Component for Farm Selection
const CustomFarmDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: Farm[];
  placeholder: string;
}> = ({ value, onChange, options, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedFarm = options.find(farm => farm.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors hover:border-gray-400"
      >
        <div className="flex items-center justify-between">
          <span className={selectedFarm ? "text-gray-900 font-medium" : "text-gray-500"}>
            {selectedFarm ? `${selectedFarm.farmerName} - ${selectedFarm.location}` : placeholder}
          </span>
          <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          <div className="py-2">
            {options.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                No farms available
              </div>
            ) : (
              options.map((farm) => (
                <button
                  key={farm.id}
                  type="button"
                  onClick={() => {
                    onChange(farm.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${
                    value === farm.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{farm.farmerName}</p>
                      <p className="text-xs text-gray-500">{farm.location}</p>
                    </div>
                    {value === farm.id && (
                      <Check className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{
  icon: React.ElementType;
  title: string;
  value: string | number;
  borderColor: string;
  iconBg: string;
  iconColor: string;
  trend?: 'up' | 'down' | 'neutral';
}> = ({ icon: Icon, title, value, borderColor, iconBg, iconColor, trend }) => (
  <div className={`bg-white p-6 rounded-lg shadow-sm border border-gray-200 ${borderColor} hover:shadow-md transition-shadow`}>
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-600 mb-2">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
      <div className={`p-3 rounded-lg ${iconBg}`}>
        <Icon className={`h-6 w-6 ${iconColor}`} />
      </div>
    </div>
    {trend && (
      <div className="mt-2 flex items-center text-xs">
        {trend === 'up' && <TrendingUp className="h-3 w-3 text-green-600 mr-1" />}
        {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-600 mr-1" />}
        <span className={trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'}>
          {trend === 'up' ? 'Above average' : trend === 'down' ? 'Below average' : 'Normal'}
        </span>
      </div>
    )}
  </div>
);

const WeatherMonitoring: React.FC = () => {
  const { data, setData } = useDataContext();
  const { currentUser } = useAuth();
  const formRef = useRef<HTMLDivElement>(null);

  // Form states
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [recordDate, setRecordDate] = useState(new Date().toISOString().substring(0, 10));
  const [temperatureMin, setTemperatureMin] = useState('');
  const [temperatureMax, setTemperatureMax] = useState('');
  const [rainfall, setRainfall] = useState('');
  const [humidity, setHumidity] = useState('70');
  const [notes, setNotes] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [editingRecord, setEditingRecord] = useState<WeatherRecord | null>(null);

  // API states
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);

  // Filter states
  const [farmFilter, setFarmFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Calculate temperature average automatically
  const temperatureAvg = useMemo(() => {
    if (temperatureMin && temperatureMax) {
      return ((parseFloat(temperatureMin) + parseFloat(temperatureMax)) / 2).toFixed(1);
    }
    return '';
  }, [temperatureMin, temperatureMax]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedFarm = data.farms.find(f => f.id === selectedFarmId);
    if (!selectedFarm) return alert("Please select a valid farm.");

    try {
      if (editingRecord) {
        // Update existing record
        const recordData: Partial<WeatherRecord> = {
          farmId: selectedFarmId,
          farmPlotLocation: selectedFarm.location,
          recordDate,
          temperatureMin: parseFloat(temperatureMin),
          temperatureMax: parseFloat(temperatureMax),
          temperatureAvg: temperatureAvg ? parseFloat(temperatureAvg) : (parseFloat(temperatureMin) + parseFloat(temperatureMax)) / 2,
          rainfall: parseFloat(rainfall),
          humidity: parseFloat(humidity),
          notes: notes || undefined,
        };
        const updatedRecord = await updateWeatherRecord(editingRecord.id, recordData);
        setData(prev => ({
          ...prev,
          weatherRecords: prev.weatherRecords.map(r => r.id === editingRecord.id ? updatedRecord : r)
        }));
        setEditingRecord(null);
      } else {
        // Create new record
        const recordData: Partial<WeatherRecord> = {
          farmId: selectedFarmId,
          farmPlotLocation: selectedFarm.location,
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

        const newRecord = await addWeatherRecord(recordData);
        setData(prev => ({ ...prev, weatherRecords: [newRecord, ...prev.weatherRecords] }));
      }

      // Reset form
      setSelectedFarmId('');
      setRecordDate(new Date().toISOString().substring(0, 10));
      setTemperatureMin('');
      setTemperatureMax('');
      setRainfall('');
      setHumidity('70');
      setNotes('');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save weather record:', error);
      alert('Failed to save weather record. Please try again.');
    }
  };

  const handleEdit = (record: WeatherRecord) => {
    setEditingRecord(record);
    setSelectedFarmId(record.farmId);
    setRecordDate(record.recordDate);
    setTemperatureMin(record.temperatureMin.toString());
    setTemperatureMax(record.temperatureMax.toString());
    setRainfall(record.rainfall.toString());
    setHumidity(record.humidity.toString());
    setNotes(record.notes || '');

    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleCancelEdit = () => {
    setEditingRecord(null);
    setSelectedFarmId('');
    setRecordDate(new Date().toISOString().substring(0, 10));
    setTemperatureMin('');
    setTemperatureMax('');
    setRainfall('');
    setHumidity('70');
    setNotes('');
  };

  const handleDelete = (recordId: string) => {
    if (confirm('Are you sure you want to delete this weather record?')) {
      deleteWeatherRecord(recordId);
      setData(prev => ({
        ...prev,
        weatherRecords: prev.weatherRecords.filter(r => r.id !== recordId)
      }));
    }
  };

  const handleFetchWeatherData = async () => {
    if (!selectedFarmId) {
      alert('Please select a farm first');
      return;
    }

    const selectedFarm = data.farms.find(f => f.id === selectedFarmId);
    if (!selectedFarm) return;

    if (!selectedFarm.latitude || !selectedFarm.longitude) {
      alert('This farm does not have GPS coordinates configured. Please add latitude and longitude to use weather API.');
      return;
    }

    setIsFetchingWeather(true);

    try {
      const weatherData = await fetchWeatherData(selectedFarm.latitude, selectedFarm.longitude);

      if (weatherData) {
        // Auto-fill form with API data
        setTemperatureMin(weatherData.temperatureMin.toString());
        setTemperatureMax(weatherData.temperatureMax.toString());
        setRainfall(weatherData.rainfall.toString());
        setHumidity(weatherData.humidity.toString());
        setRecordDate(weatherData.recordDate);
        setNotes('Data fetched from Open-Meteo API (free weather data)');

        alert('Weather data fetched successfully! Review the data and submit the form.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch weather data';
      alert(errorMessage);
    } finally {
      setIsFetchingWeather(false);
    }
  };

  // Filtered records
  const filteredRecords = useMemo(() => {
    return data.weatherRecords.filter(record => {
      const farmMatch = farmFilter === 'All' || record.farmId === farmFilter;
      const dateFromMatch = !dateFrom || record.recordDate >= dateFrom;
      const dateToMatch = !dateTo || record.recordDate <= dateTo;
      return farmMatch && dateFromMatch && dateToMatch;
    });
  }, [data.weatherRecords, farmFilter, dateFrom, dateTo]);

  // Statistics
  const stats = useMemo(() => {
    if (filteredRecords.length === 0) {
      return {
        avgTemp: 0,
        totalRainfall: 0,
        avgHumidity: 0,
        recordCount: 0,
      };
    }

    const avgTemp = filteredRecords.reduce((sum, r) => sum + r.temperatureAvg, 0) / filteredRecords.length;
    const totalRainfall = filteredRecords.reduce((sum, r) => sum + r.rainfall, 0);
    const avgHumidity = filteredRecords.reduce((sum, r) => sum + r.humidity, 0) / filteredRecords.length;

    return {
      avgTemp: avgTemp.toFixed(1),
      totalRainfall: totalRainfall.toFixed(1),
      avgHumidity: avgHumidity.toFixed(0),
      recordCount: filteredRecords.length,
    };
  }, [filteredRecords]);

  const uniqueFarms = useMemo(() => {
    const farms = new Set(data.weatherRecords.map(r => r.farmId));
    return [
      { id: 'All', farmerName: 'All Farms', location: '' },
      ...data.farms.filter(f => farms.has(f.id))
    ];
  }, [data.farms, data.weatherRecords]);

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Cloud className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Weather Monitoring</h1>
            <p className="text-gray-600 text-sm">Record and track weather conditions for your farms</p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          icon={Thermometer}
          title="Avg Temperature"
          value={`${stats.avgTemp}°C`}
          borderColor="border-l-4 border-l-red-500"
          iconBg="bg-red-100"
          iconColor="text-red-600"
        />
        <StatCard
          icon={Droplets}
          title="Total Rainfall"
          value={`${stats.totalRainfall} mm`}
          borderColor="border-l-4 border-l-blue-500"
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatCard
          icon={Wind}
          title="Avg Humidity"
          value={`${stats.avgHumidity}%`}
          borderColor="border-l-4 border-l-green-500"
          iconBg="bg-green-100"
          iconColor="text-green-600"
        />
        <StatCard
          icon={Calendar}
          title="Total Records"
          value={stats.recordCount}
          borderColor="border-l-4 border-l-gray-500"
          iconBg="bg-gray-100"
          iconColor="text-gray-600"
        />
      </div>

      {/* Recording Form */}
      <div ref={formRef} className="bg-white shadow-sm rounded-lg p-8 border border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Cloud className="h-5 w-5 text-blue-600" />
            </div>
            {editingRecord ? 'Edit Weather Record' : 'Record Weather Data'}
          </h2>
          {editingRecord && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-colors"
            >
              Cancel Edit
            </button>
          )}
        </div>

        {/* API Fetch Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Download className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Fetch Weather Data from API</p>
                <p className="text-xs text-gray-600">Auto-fill weather data using Open-Meteo (free, no API key required)</p>
              </div>
            </div>
            <button
                type="button"
                onClick={handleFetchWeatherData}
                disabled={isFetchingWeather || !selectedFarmId}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isFetchingWeather ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Fetching...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Fetch Data
                  </>
                )}
              </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Select Farm</label>
              <CustomFarmDropdown
                value={selectedFarmId}
                onChange={setSelectedFarmId}
                options={data.farms}
                placeholder="Select a farm..."
              />
            </div>
            <div>
              <DatePicker
                value={recordDate}
                onChange={setRecordDate}
                label="Record Date"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Min Temperature (°C)</label>
              <input
                type="number"
                step="0.1"
                value={temperatureMin}
                onChange={(e) => setTemperatureMin(e.target.value)}
                required
                className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="15.0"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Max Temperature (°C)</label>
              <input
                type="number"
                step="0.1"
                value={temperatureMax}
                onChange={(e) => setTemperatureMax(e.target.value)}
                required
                className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="28.0"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Avg Temperature (°C)</label>
              <input
                type="text"
                value={temperatureAvg}
                disabled
                className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 bg-gray-50 text-gray-600 font-semibold"
                placeholder="Auto-calculated"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Rainfall (mm)</label>
              <input
                type="number"
                step="0.1"
                value={rainfall}
                onChange={(e) => setRainfall(e.target.value)}
                required
                className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="0.0"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Humidity (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={humidity}
                onChange={(e) => setHumidity(e.target.value)}
                required
                className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="70"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional observations or notes..."
              className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
            ></textarea>
          </div>

          <div className="flex items-center justify-between pt-2">
            {showSuccess && (
              <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg border border-green-200">
                <CheckCircle className="h-5 w-5" />
                <span className="font-semibold">
                  {editingRecord ? 'Weather record updated successfully!' : 'Weather record saved successfully!'}
                </span>
              </div>
            )}
            <button
              type="submit"
              className="ml-auto inline-flex items-center gap-2 justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <Cloud className="h-4 w-4" />
              {editingRecord ? 'Update Record' : 'Save Record'}
            </button>
          </div>
        </form>
      </div>

      {/* Weather History */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <div className="bg-gray-50 p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Weather History</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Filter by Farm</label>
              <CustomFarmDropdown
                value={farmFilter}
                onChange={setFarmFilter}
                options={uniqueFarms}
                placeholder="All Farms"
              />
            </div>
            <div>
              <DatePicker
                value={dateFrom}
                onChange={setDateFrom}
                label="Date From"
              />
            </div>
            <div>
              <DatePicker
                value={dateTo}
                onChange={setDateTo}
                label="Date To"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Farm Location</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Temp (°C)</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Rainfall (mm)</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Humidity (%)</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Source</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Notes</th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">
                    No weather records found. Start recording weather data above.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{record.recordDate}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{record.farmPlotLocation}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex items-center gap-1">
                        <span className="text-blue-600 font-medium">{record.temperatureMin}</span>
                        <span className="text-gray-400">-</span>
                        <span className="text-red-600 font-medium">{record.temperatureMax}</span>
                        <span className="text-gray-500 ml-1">({record.temperatureAvg})</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{record.rainfall}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{record.humidity}%</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        record.source === 'Manual' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {record.source}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{record.notes || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(record)}
                          className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(record.id)}
                          className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WeatherMonitoring;
