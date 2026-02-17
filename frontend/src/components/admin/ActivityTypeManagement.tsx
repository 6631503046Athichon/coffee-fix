import React, { useState } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { ActivityType } from '../../types';
import { addActivityType, updateActivityType, deleteActivityType } from '../../services/activityTypeService';
import { Plus, Edit, Trash2, CheckCircle, XCircle, AlertCircle, X, Save, Tag, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 10;

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
  const [successAction, setSuccessAction] = useState<'added' | 'updated'>('added');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Validation
    if (!formData.name.trim()) {
      setErrorMessage('Activity type name is required');
      return;
    }

    // Check duplicate name locally
    const duplicate = data.activityTypes.some(
      t => t.name.toLowerCase() === formData.name.trim().toLowerCase() && t.id !== editingType?.id
    );
    if (duplicate) {
      setErrorMessage('Activity type with this name already exists');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingType) {
        // Update existing via API
        const updated = await updateActivityType(editingType.id, {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          isActive: formData.isActive,
        });
        if (updated) {
          setData(prev => ({
            ...prev,
            activityTypes: prev.activityTypes.map(t => t.id === updated.id ? updated : t),
          }));
        }
        setSuccessAction('updated');
      } else {
        // Create new via API
        const created = await addActivityType({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          isActive: formData.isActive,
        });
        if (created) {
          setData(prev => ({
            ...prev,
            activityTypes: [created, ...prev.activityTypes],
          }));
        }
        setSuccessAction('added');
      }

      setShowModal(false);
      resetForm();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save activity type');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const typeToDelete = data.activityTypes.find(t => t.id === id);
    if (!typeToDelete) return;

    if (!confirm(`Are you sure you want to delete "${typeToDelete.name}"?`)) {
      return;
    }

    try {
      await deleteActivityType(id);
      setData(prev => ({
        ...prev,
        activityTypes: prev.activityTypes.filter(t => t.id !== id),
      }));
    } catch (err: any) {
      alert(err instanceof Error ? err.message : 'Failed to delete activity type');
    }
  };

  const handleToggleStatus = async (activityType: ActivityType) => {
    try {
      const updated = await updateActivityType(activityType.id, {
        isActive: !activityType.isActive,
      });
      if (updated) {
        setData(prev => ({
          ...prev,
          activityTypes: prev.activityTypes.map(t => t.id === updated.id ? updated : t),
        }));
      }
    } catch (err: any) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const activeTypes = data.activityTypes.filter(t => t.isActive);
  const inactiveTypes = data.activityTypes.filter(t => !t.isActive);

  // Pagination logic
  const totalPages = Math.ceil(data.activityTypes.length / PAGE_SIZE);
  const paginatedTypes = data.activityTypes.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  return (
    <div className="space-y-6 min-h-full">
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
            Activity type {successAction} successfully!
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
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Description
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Created Date
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {paginatedTypes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <Tag className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No activity types found</p>
                    <p className="text-xs mt-1">Click "Add Activity Type" to create one</p>
                  </td>
                </tr>
              ) : (
                paginatedTypes.map((type) => (
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
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center px-4 py-3 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {(() => {
                const TOTAL_SLOTS = 7;
                const tp = totalPages;
                const cp = currentPage;
                let slots: (number | 'ellipsis')[] = [];
                if (tp <= TOTAL_SLOTS) {
                  slots = Array.from({ length: tp }, (_, i) => i + 1);
                } else if (cp <= 4) {
                  slots = [1, 2, 3, 4, 5, 'ellipsis', tp];
                } else if (cp >= tp - 3) {
                  slots = [1, 'ellipsis', tp - 4, tp - 3, tp - 2, tp - 1, tp];
                } else {
                  slots = [1, 'ellipsis', cp - 1, cp, cp + 1, 'ellipsis', tp];
                }
                return slots.map((slot, idx) => (
                  slot === 'ellipsis' ? (
                    <span key={`e-${idx}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-xs">...</span>
                  ) : (
                    <button key={slot} onClick={() => setCurrentPage(slot)} className={`w-8 h-8 text-xs font-medium rounded-md transition-colors flex items-center justify-center ${cp === slot ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>{slot}</button>
                  )
                ));
              })()}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
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
                  disabled={isSubmitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  <Save className="h-4 w-4" />
                  {isSubmitting ? 'Saving...' : editingType ? 'Update' : 'Create'}
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
