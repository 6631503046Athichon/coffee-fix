import React, { useState } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { FarmRequest } from '../../types';
import { updateFarmRequest } from '../../services/farmRequestService';
import { fetchWeatherData } from '../../services/weatherApiService';
import { Filter, MapPin, Calendar, User, CheckCircle, XCircle, Clock, Eye, Cloud, AlertCircle, Loader } from 'lucide-react';

const FarmManagement: React.FC = () => {
  const { data, setData } = useDataContext();
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');
  const [reviewingRequest, setReviewingRequest] = useState<FarmRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [weatherData, setWeatherData] = useState<any>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [weatherError, setWeatherError] = useState('');

  const filteredRequests = data.farmRequests.filter(req =>
    statusFilter === 'All' || req.status === statusFilter
  );

  const handleReview = (requestId: string, newStatus: 'Approved' | 'Rejected') => {
    const currentUser = data.users[0]; // In real app, get from auth context

    const requestToUpdate = data.farmRequests.find(req => req.id === requestId);
    if (!requestToUpdate) return;

    const reviewedRequest = {
      ...requestToUpdate,
      status: newStatus,
      adminNotes: adminNotes || undefined,
      reviewDate: new Date().toISOString().split('T')[0],
      reviewedBy: currentUser?.id,
    };

    // Save to localStorage
    updateFarmRequest(reviewedRequest);

    // If approved, create a new farm
    if (newStatus === 'Approved') {
      const newFarm = {
        id: `F${String(data.farms.length + 1).padStart(3, '0')}`,
        farmerName: requestToUpdate.ownerName,
        location: requestToUpdate.location,
        latitude: requestToUpdate.latitude,
        longitude: requestToUpdate.longitude,
        ownerUserId: requestToUpdate.requesterId,
      } as const;
      setData(prev => ({
        ...prev,
        farms: [...prev.farms, newFarm],
      }));
    }

    // Update context state
    const updatedRequests = data.farmRequests.map(req =>
      req.id === requestId ? reviewedRequest : req
    );

    setData(prev => ({
      ...prev,
      farmRequests: updatedRequests,
    }));

    setReviewingRequest(null);
    setAdminNotes('');
  };

  const openReviewModal = (request: FarmRequest) => {
    setReviewingRequest(request);
    setAdminNotes(request.adminNotes || '');
    setWeatherData(null);
    setWeatherError('');
  };

  const fetchWeatherForRequest = async () => {
    if (!reviewingRequest || !reviewingRequest.latitude || !reviewingRequest.longitude) {
      setWeatherError('GPS coordinates are required to fetch weather data');
      return;
    }

    setLoadingWeather(true);
    setWeatherError('');

    try {
      const weather = await fetchWeatherData(reviewingRequest.latitude, reviewingRequest.longitude);
      if (weather) {
        setWeatherData(weather);
      } else {
        setWeatherError('Could not fetch weather data. Please check your internet connection.');
      }
    } catch (error) {
      setWeatherError(error instanceof Error ? error.message : 'Failed to fetch weather data');
    } finally {
      setLoadingWeather(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
            <CheckCircle className="h-3 w-3" />
            Approved
          </span>
        );
      case 'Rejected':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
            <XCircle className="h-3 w-3" />
            Rejected
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Farm Request Management</h1>
          <p className="text-gray-600 mt-2">Review and manage farm registration requests from farmers</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Requests</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{data.farmRequests.length}</p>
            </div>
            <MapPin className="h-10 w-10 text-gray-400" />
          </div>
        </div>
        <div className="bg-yellow-50 rounded-xl shadow-sm border border-yellow-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-yellow-700">Pending</p>
              <p className="text-2xl font-bold text-yellow-900 mt-1">
                {data.farmRequests.filter(r => r.status === 'Pending').length}
              </p>
            </div>
            <Clock className="h-10 w-10 text-yellow-500" />
          </div>
        </div>
        <div className="bg-green-50 rounded-xl shadow-sm border border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-700">Approved</p>
              <p className="text-2xl font-bold text-green-900 mt-1">
                {data.farmRequests.filter(r => r.status === 'Approved').length}
              </p>
            </div>
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
        </div>
        <div className="bg-red-50 rounded-xl shadow-sm border border-red-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-700">Rejected</p>
              <p className="text-2xl font-bold text-red-900 mt-1">
                {data.farmRequests.filter(r => r.status === 'Rejected').length}
              </p>
            </div>
            <XCircle className="h-10 w-10 text-red-500" />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-gray-600" />
          <span className="font-semibold text-gray-700">Filter by Status:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['All', 'Pending', 'Approved', 'Rejected'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                statusFilter === status
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Farm Details
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Owner
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Request Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No farm requests found
                  </td>
                </tr>
              ) : (
                filteredRequests.map(request => (
                  <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <p className="font-semibold text-gray-900">{request.farmName}</p>
                        <p className="text-sm text-gray-600 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {request.location}
                        </p>
                        {request.altitude && (
                          <p className="text-xs text-gray-500">Altitude: {request.altitude}</p>
                        )}
                        {request.size && (
                          <p className="text-xs text-gray-500">Size: {request.size}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">{request.ownerName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        {request.requestDate}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(request.status)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => openReviewModal(request)}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
                      >
                        <Eye className="h-4 w-4" />
                        {request.status === 'Pending' ? 'Review' : 'View Details'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {reviewingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">
                {reviewingRequest.status === 'Pending' ? 'Review Farm Request' : 'Farm Request Details'}
              </h2>
            </div>

            <div className="p-6 space-y-6">
              {/* Farm Details */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Farm Name</label>
                  <p className="text-gray-900">{reviewingRequest.farmName}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Location</label>
                  <p className="text-gray-900">{reviewingRequest.location}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {reviewingRequest.altitude && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Altitude</label>
                      <p className="text-gray-900">{reviewingRequest.altitude}</p>
                    </div>
                  )}
                  {reviewingRequest.size && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Size</label>
                      <p className="text-gray-900">{reviewingRequest.size}</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Latitude</label>
                    <p className="text-gray-900">
                      {reviewingRequest.latitude !== undefined
                        ? reviewingRequest.latitude.toFixed(4)
                        : <span className="text-gray-400 italic">Not provided</span>}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Longitude</label>
                    <p className="text-gray-900">
                      {reviewingRequest.longitude !== undefined
                        ? reviewingRequest.longitude.toFixed(4)
                        : <span className="text-gray-400 italic">Not provided</span>}
                    </p>
                  </div>
                </div>
                {reviewingRequest.latitude && reviewingRequest.longitude && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-700">
                      <CheckCircle className="h-4 w-4 inline mr-1" />
                      GPS coordinates available - Weather data can be fetched for this farm
                    </p>
                  </div>
                )}
                {(!reviewingRequest.latitude || !reviewingRequest.longitude) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm text-amber-700">
                      <AlertCircle className="h-4 w-4 inline mr-1" />
                      GPS coordinates missing - Weather data cannot be fetched
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Owner</label>
                  <p className="text-gray-900">{reviewingRequest.ownerName}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Request Date</label>
                  <p className="text-gray-900">{reviewingRequest.requestDate}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Reason for Request</label>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{reviewingRequest.reason}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Current Status</label>
                  <div className="mt-2">{getStatusBadge(reviewingRequest.status)}</div>
                </div>
              </div>

              {/* Admin Notes */}
              {reviewingRequest.status === 'Pending' ? (
                <div>
                  <label htmlFor="adminNotes" className="block text-sm font-semibold text-gray-700 mb-2">
                    Admin Notes
                  </label>
                  <textarea
                    id="adminNotes"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                    rows={4}
                    placeholder="Add notes or feedback for this request..."
                  />
                </div>
              ) : (
                reviewingRequest.adminNotes && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Admin Notes</label>
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{reviewingRequest.adminNotes}</p>
                    {reviewingRequest.reviewDate && (
                      <p className="text-sm text-gray-500 mt-2">
                        Reviewed on {reviewingRequest.reviewDate}
                      </p>
                    )}
                  </div>
                )
              )}

              {/* Weather Data Section */}
              {reviewingRequest.latitude && reviewingRequest.longitude && (
                <div className="border-t border-gray-200 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <Cloud className="h-5 w-5 text-blue-600" />
                      Weather Information
                    </h3>
                    <button
                      onClick={fetchWeatherForRequest}
                      disabled={loadingWeather}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingWeather ? (
                        <>
                          <Loader className="h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <Cloud className="h-4 w-4" />
                          Check Weather
                        </>
                      )}
                    </button>
                  </div>

                  {weatherError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-red-700 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        {weatherError}
                      </p>
                    </div>
                  )}

                  {weatherData && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs font-semibold text-blue-700 mb-1">Temperature (Avg)</p>
                          <p className="text-xl font-bold text-blue-900">{weatherData.temperatureAvg}°C</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-blue-700 mb-1">Temperature (Min/Max)</p>
                          <p className="text-xl font-bold text-blue-900">
                            {weatherData.temperatureMin}°C / {weatherData.temperatureMax}°C
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-blue-700 mb-1">Humidity</p>
                          <p className="text-xl font-bold text-blue-900">{weatherData.humidity}%</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-blue-700 mb-1">Rainfall</p>
                          <p className="text-xl font-bold text-blue-900">{weatherData.rainfall} mm</p>
                        </div>
                      </div>
                      <p className="text-xs text-blue-600 mt-3">
                        Data from: {weatherData.recordDate}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setReviewingRequest(null);
                  setAdminNotes('');
                }}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition font-medium"
              >
                {reviewingRequest.status === 'Pending' ? 'Cancel' : 'Close'}
              </button>
              {reviewingRequest.status === 'Pending' && (
                <>
                  <button
                    onClick={() => handleReview(reviewingRequest.id, 'Rejected')}
                    className="px-6 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition font-medium flex items-center gap-2"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                  <button
                    onClick={() => handleReview(reviewingRequest.id, 'Approved')}
                    className="px-6 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition font-medium flex items-center gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FarmManagement;
