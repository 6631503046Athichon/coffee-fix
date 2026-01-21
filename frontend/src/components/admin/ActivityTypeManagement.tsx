import React, { useState } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { ActivityType } from '../../types';
import { addActivityType, updateActivityType, deleteActivityType, activityTypeNameExists } from '../../services/activityTypeService';
import { Plus, Edit, Trash2, CheckCircle, XCircle, AlertCircle, X, Save, Tag } from 'lucide-react';

const ActivityTypeManagement: React.FC = () => {
  const { data, setData } = useDataContext();
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<ActivityType | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const resetForm = () => {
    setFormData({ name: '', description: '', isActive: true });
    setEditingType(null);
    setErrorMessage('');
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (activityType: ActivityType) => {
    setEditingType(activityType);
    setFormData({
      name: activityType.name,
      description: activityType.description || '',
      isActive: activityType.isActive,
    });
    setErrorMessage('');
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Validation
    if (!formData.name.trim()) {
      setErrorMessage('Activity type name is required');
      return;
    }

    // Check duplicate name
    if (activityTypeNameExists(formData.name.trim(), editingType?.id)) {
      setErrorMessage('Activity type with this name already exists');
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    if (editingType) {
      // Update existing
      const updated: ActivityType = {
        ...editingType,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        isActive: formData.isActive,
      };
      updateActivityType(updated);
      setData(prev => ({
        ...prev,
        activityTypes: prev.activityTypes.map(t => t.id === updated.id ? updated : t),
      }));
    } else {
      // Create new
      const newType: ActivityType = {
        id: `AT${String(data.activityTypes.length + 1).padStart(3, '0')}`,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        createdDate: today,
        isActive: formData.isActive,
      };
      addActivityType(newType);
      setData(prev => ({
        ...prev,
        activityTypes: [newType, ...prev.activityTypes],
      }));
    }

    setShowModal(false);
    resetForm();
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleDelete = (id: string) => {
    const typeToDelete = data.activityTypes.find(t => t.id === id);
    if (!typeToDelete) return;

    // Check if activity type is used in any GAP logs
    const isUsed = data.gapLogs.some(log => log.activityType === typeToDelete.name);

    if (isUsed) {
      if (!confirm(`"${typeToDelete.name}" is currently used in GAP logs. Are you sure you want to delete it?`)) {
        return;
      }
    } else {
      if (!confirm(`Are you sure you want to delete "${typeToDelete.name}"?`)) {
        return;
      }
    }

    deleteActivityType(id);
    setData(prev => ({
      ...prev,
      activityTypes: prev.activityTypes.filter(t => t.id !== id),
    }));
  };

  const handleToggleStatus = (activityType: ActivityType) => {
    const updated = { ...activityType, isActive: !activityType.isActive };
    updateActivityType(updated);
    setData(prev => ({
      ...prev,
      activityTypes: prev.activityTypes.map(t => t.id === updated.id ? updated : t),
    }));
  };

  const activeTypes = data.activityTypes.filter(t => t.isActive);
  const inactiveTypes = data.activityTypes.filter(t => !t.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Activity Type Management</h1>
          <p className="text-gray-600 mt-2">Manage GAP activity types for farm operations</p>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-5 w-5" />
          Add Activity Type
        </button>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-3 rounded-lg border border-green-200">
          <CheckCircle className="h-5 w-5" />
          <span className="font-semibold">
            Activity type {editingType ? 'updated' : 'added'} successfully!
          </span>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-l-blue-500 border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">Total Activity Types</p>
              <p className="text-3xl font-bold text-gray-900">{data.activityTypes.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Tag className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-l-green-500 border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">Active Types</p>
              <p className="text-3xl font-bold text-gray-900">{activeTypes.length}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-l-gray-500 border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">Inactive Types</p>
              <p className="text-3xl font-bold text-gray-900">{inactiveTypes.length}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <XCircle className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Activity Types Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-900">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">
                  Description
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">
                  Created Date
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-white uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {data.activityTypes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <Tag className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No activity types found</p>
                    <p className="text-xs mt-1">Click "Add Activity Type" to create one</p>
                  </td>
                </tr>
              ) : (
                data.activityTypes.map((type) => (
                  <tr key={type.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${type.isActive ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                        <span className="text-sm font-semibold text-gray-900">{type.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-700">{type.description || '-'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {type.createdDate}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleStatus(type)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                          type.isActive
                            ? 'bg-green-100 text-green-800 border border-green-200 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        {type.isActive ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {type.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(type)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                          <span className="text-xs font-semibold">Edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(type.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="text-xs font-semibold">Delete</span>
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100">
            <form onSubmit={handleSubmit} className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Tag className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {editingType ? 'Edit Activity Type' : 'Add Activity Type'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {editingType ? 'Update activity type details' : 'Create a new activity type for GAP logging'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="mb-4 flex items-start gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold">{errorMessage}</span>
                </div>
              )}

              {/* Form Fields */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Activity Type Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Fertilizer, Pruning, Harvesting"
                    required
                    className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of this activity type"
                    rows={3}
                    className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                    Active (available for selection in GAP logs)
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  <Save className="h-4 w-4" />
                  {editingType ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityTypeManagement;
