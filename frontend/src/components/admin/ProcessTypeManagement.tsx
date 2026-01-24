import React, { useState } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { ProcessType } from '../../types';
import { addProcessType, updateProcessType, deleteProcessType, processTypeNameExists } from '../../services/processTypeService';
import { Plus, Edit, Trash2, CheckCircle, XCircle, AlertCircle, X, Save, Coffee } from 'lucide-react';

// Predefined color schemes for process types
const COLOR_SCHEMES = [
  {
    name: 'Blue',
    borderColor: 'border-l-blue-500',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    badgeColor: 'bg-blue-100 text-blue-700 border-blue-200'
  },
  {
    name: 'Amber',
    borderColor: 'border-l-amber-500',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    badgeColor: 'bg-amber-100 text-amber-700 border-amber-200'
  },
  {
    name: 'Yellow',
    borderColor: 'border-l-yellow-500',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    badgeColor: 'bg-yellow-100 text-yellow-700 border-yellow-200'
  },
  {
    name: 'Green',
    borderColor: 'border-l-green-500',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    badgeColor: 'bg-green-100 text-green-700 border-green-200'
  },
  {
    name: 'Purple',
    borderColor: 'border-l-purple-500',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    badgeColor: 'bg-purple-100 text-purple-700 border-purple-200'
  },
  {
    name: 'Pink',
    borderColor: 'border-l-pink-500',
    iconBg: 'bg-pink-100',
    iconColor: 'text-pink-600',
    badgeColor: 'bg-pink-100 text-pink-700 border-pink-200'
  },
  {
    name: 'Indigo',
    borderColor: 'border-l-indigo-500',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    badgeColor: 'bg-indigo-100 text-indigo-700 border-indigo-200'
  },
  {
    name: 'Teal',
    borderColor: 'border-l-teal-500',
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600',
    badgeColor: 'bg-teal-100 text-teal-700 border-teal-200'
  },
];

const ProcessTypeManagement: React.FC = () => {
  const { data, setData } = useDataContext();
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<ProcessType | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    colorScheme: COLOR_SCHEMES[0],
    isActive: true,
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const resetForm = () => {
    setFormData({ name: '', description: '', colorScheme: COLOR_SCHEMES[0], isActive: true });
    setEditingType(null);
    setErrorMessage('');
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (processType: ProcessType) => {
    setEditingType(processType);
    // Find matching color scheme or use first one
    const matchingScheme = COLOR_SCHEMES.find(
      scheme => scheme.borderColor === processType.colorScheme.borderColor
    ) || COLOR_SCHEMES[0];

    setFormData({
      name: processType.name,
      description: processType.description || '',
      colorScheme: matchingScheme,
      isActive: processType.isActive,
    });
    setErrorMessage('');
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    

    // Validation
    if (!formData.name.trim()) {
      setErrorMessage('Process type name is required');
      return;
    }

    // Check duplicate name
    if (processTypeNameExists(formData.name.trim(), editingType?.id)) {
      setErrorMessage('Process type with this name already exists');
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    if (editingType) {
      // Update existing
      const updated: ProcessType = {
        ...editingType,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        colorScheme: formData.colorScheme,
        isActive: formData.isActive,
      };
      updateProcessType(updated);
      // Immediately sync DataContext from localStorage to avoid race conditions
      try {
        const latest = JSON.parse(localStorage.getItem('coffee_lab_process_types') || '[]');
        setData(prev => ({ ...prev, processTypes: latest }));
      } catch {}
    } else {
      // Create new
      const newType: ProcessType = {
        // Generate id from localStorage to avoid collisions
        id: (() => {
          try {
            const current = JSON.parse(localStorage.getItem('coffee_lab_process_types') || '[]');
            return `PT${String(current.length + 1).padStart(3, '0')}`;
          } catch {
            return `PT${String(data.processTypes.length + 1).padStart(3, '0')}`;
          }
        })(),
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        colorScheme: formData.colorScheme,
        createdDate: today,
        isActive: formData.isActive,
      };
      addProcessType(newType);
      // Immediately sync DataContext from localStorage to avoid race conditions
      try {
        const latest = JSON.parse(localStorage.getItem('coffee_lab_process_types') || '[]');
        setData(prev => ({ ...prev, processTypes: latest }));
      } catch {}
    }

    setShowModal(false);
    resetForm();
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleDelete = (id: string) => {
    const typeToDelete = data.processTypes.find(t => t.id === id);
    if (!typeToDelete) return;

    // Check if process type is used in any processing batches or parchment lots
    const usedInBatches = data.processingBatches.some(batch => batch.processType === typeToDelete.name);
    const usedInParchment = data.parchmentLots.some(lot => lot.processType === typeToDelete.name);
    const isUsed = usedInBatches || usedInParchment;

    if (isUsed) {
      if (!confirm(`"${typeToDelete.name}" is currently used in processing batches or parchment lots. Are you sure you want to delete it?`)) {
        return;
      }
    } else {
      if (!confirm(`Are you sure you want to delete "${typeToDelete.name}"?`)) {
        return;
      }
    }

    deleteProcessType(id);
    // Immediately sync DataContext from localStorage
    try {
      const latest = JSON.parse(localStorage.getItem('coffee_lab_process_types') || '[]');
      setData(prev => ({ ...prev, processTypes: latest }));
    } catch {}
  };

  const handleToggleStatus = (processType: ProcessType) => {
    const updated = { ...processType, isActive: !processType.isActive };
    updateProcessType(updated);
    // Immediately sync DataContext from localStorage
    try {
      const latest = JSON.parse(localStorage.getItem('coffee_lab_process_types') || '[]');
      setData(prev => ({ ...prev, processTypes: latest }));
    } catch {}
  };

  const activeTypes = data.processTypes.filter(t => t.isActive);
  const inactiveTypes = data.processTypes.filter(t => !t.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Process Type Management</h1>
          <p className="text-gray-600 mt-2">Manage coffee processing methods and their display settings</p>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-5 w-5" />
          Add Process Type
        </button>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-3 rounded-lg border border-green-200">
          <CheckCircle className="h-5 w-5" />
          <span className="font-semibold">
            Process type {editingType ? 'updated' : 'added'} successfully!
          </span>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-l-blue-500 border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">Total Process Types</p>
              <p className="text-3xl font-bold text-gray-900">{data.processTypes.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Coffee className="h-6 w-6 text-blue-600" />
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

      {/* Process Types Table */}
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
                  Color Preview
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
              {data.processTypes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <Coffee className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No process types found</p>
                    <p className="text-xs mt-1">Click "Add Process Type" to create one</p>
                  </td>
                </tr>
              ) : (
                data.processTypes.map((type) => (
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className={`w-1 h-8 rounded ${type.colorScheme.borderColor.replace('border-l-', 'bg-')}`}></div>
                        <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${type.colorScheme.badgeColor}`}>
                          {type.name}
                        </div>
                      </div>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100 max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit} className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Coffee className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {editingType ? 'Edit Process Type' : 'Add Process Type'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {editingType ? 'Update process type details' : 'Create a new coffee processing method'}
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
                    Process Type Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Washed, Natural, Honey, Anaerobic"
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
                    placeholder="Brief description of this processing method"
                    rows={3}
                    className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Color Scheme <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {COLOR_SCHEMES.map((scheme) => (
                      <button
                        key={scheme.name}
                        type="button"
                        onClick={() => setFormData({ ...formData, colorScheme: scheme })}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          formData.colorScheme.name === scheme.name
                            ? 'border-blue-500 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className={`w-full h-8 rounded ${scheme.iconBg} flex items-center justify-center`}>
                          <Coffee className={`h-5 w-5 ${scheme.iconColor}`} />
                        </div>
                        <p className="text-xs font-medium text-gray-600 mt-1 text-center">{scheme.name}</p>
                      </button>
                    ))}
                  </div>
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
                    Active (available for selection in processor)
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

export default ProcessTypeManagement;
