import React, { useState } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { CoffeeGrade } from '../../types';
import { addCoffeeGrade, updateCoffeeGrade, deleteCoffeeGrade } from '../../services/reference/coffeeGradeService';
import { Plus, Edit, Trash2, CheckCircle, XCircle, AlertCircle, X, Save, Bean, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';

const PAGE_SIZE = 10;

// Grades are spaced 10 apart so a new one can always be slotted between two
// existing ones without renumbering the whole list.
const SORT_ORDER_STEP = 10;

const sortGrades = (grades: CoffeeGrade[]): CoffeeGrade[] =>
  [...grades].sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));

const CoffeeGradeManagement: React.FC = () => {
  const { data, setData } = useDataContext();
  const [showModal, setShowModal] = useState(false);
  const [editingGrade, setEditingGrade] = useState<CoffeeGrade | null>(null);
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

  const grades = sortGrades(data.coffeeGrades || []);

  const applyGrade = (updated: CoffeeGrade) => {
    setData(prev => {
      const existing = prev.coffeeGrades || [];
      const next = existing.some(g => g.id === updated.id)
        ? existing.map(g => (g.id === updated.id ? updated : g))
        : [...existing, updated];
      return { ...prev, coffeeGrades: sortGrades(next) };
    });
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', isActive: true });
    setEditingGrade(null);
    setErrorMessage('');
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (grade: CoffeeGrade) => {
    setEditingGrade(grade);
    setFormData({
      name: grade.name,
      description: grade.description || '',
      isActive: grade.isActive,
    });
    setErrorMessage('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!formData.name.trim()) {
      setErrorMessage('Grade name is required');
      return;
    }

    // Check duplicate name locally before spending a round-trip on it
    const duplicate = grades.some(
      g => g.name.toLowerCase() === formData.name.trim().toLowerCase() && g.id !== editingGrade?.id
    );
    if (duplicate) {
      setErrorMessage('A grade with this name already exists');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingGrade) {
        const updated = await updateCoffeeGrade(editingGrade.id, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          isActive: formData.isActive,
        });
        if (updated) applyGrade(updated);
        setSuccessAction('updated');
      } else {
        const created = await addCoffeeGrade({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          isActive: formData.isActive,
        });
        if (created) applyGrade(created);
        setSuccessAction('added');
      }

      setShowModal(false);
      resetForm();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save grade');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const gradeToDelete = grades.find(g => g.id === id);
    if (!gradeToDelete) return;

    if (!confirm(`Are you sure you want to delete "${gradeToDelete.name}"?`)) {
      return;
    }

    try {
      await deleteCoffeeGrade(id);
      setData(prev => ({
        ...prev,
        coffeeGrades: (prev.coffeeGrades || []).filter(g => g.id !== id),
      }));
    } catch (err) {
      // The backend refuses to delete a grade that lots still use and says
      // so in the message — surface it rather than a generic failure.
      alert(err instanceof Error ? err.message : 'Failed to delete grade');
    }
  };

  const handleToggleStatus = async (grade: CoffeeGrade) => {
    try {
      const updated = await updateCoffeeGrade(grade.id, { isActive: !grade.isActive });
      if (updated) applyGrade(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  // Moving a grade swaps its sortOrder with its neighbour, so the dropdowns
  // reorder without the admin having to think about the numbers.
  const handleMove = async (grade: CoffeeGrade, direction: -1 | 1) => {
    const index = grades.findIndex(g => g.id === grade.id);
    const neighbour = grades[index + direction];
    if (!neighbour) return;

    // Equal sortOrder values would make the swap a no-op, so re-space first.
    const gradeOrder = grade.sortOrder === neighbour.sortOrder
      ? neighbour.sortOrder + direction * SORT_ORDER_STEP
      : neighbour.sortOrder;

    try {
      const [movedGrade, movedNeighbour] = await Promise.all([
        updateCoffeeGrade(grade.id, { sortOrder: gradeOrder }),
        updateCoffeeGrade(neighbour.id, { sortOrder: grade.sortOrder }),
      ]);
      if (movedGrade) applyGrade(movedGrade);
      if (movedNeighbour) applyGrade(movedNeighbour);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reorder grades');
    }
  };

  const activeGrades = grades.filter(g => g.isActive);
  const inactiveGrades = grades.filter(g => !g.isActive);

  const totalPages = Math.max(1, Math.ceil(grades.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedGrades = grades.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-6 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Coffee Grade Management</h1>
          <p className="text-gray-600 mt-2">
            Manage the grades offered when hulling parchment and recording green bean lots
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-5 w-5" />
          Add Grade
        </button>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-3 rounded-lg border border-green-200">
          <CheckCircle className="h-5 w-5" />
          <span className="font-semibold">Grade {successAction} successfully!</span>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-l-blue-500 border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">Total Grades</p>
              <p className="text-3xl font-bold text-gray-900">{grades.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Bean className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-l-green-500 border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">In the dropdowns</p>
              <p className="text-3xl font-bold text-gray-900">{activeGrades.length}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-l-gray-500 border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">Hidden (Inactive)</p>
              <p className="text-3xl font-bold text-gray-900">{inactiveGrades.length}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <XCircle className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Grades Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-800">
          Grades appear in the Hull &amp; Grade, Withdraw Stock and Roaster forms in the order shown
          here. Use the arrows to reorder them.
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Order
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Grade
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Description
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
              {paginatedGrades.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <Bean className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No coffee grades found</p>
                    <p className="text-xs mt-1">Click "Add Grade" to create one</p>
                  </td>
                </tr>
              ) : (
                paginatedGrades.map((grade, indexOnPage) => {
                  const absoluteIndex = (safePage - 1) * PAGE_SIZE + indexOnPage;
                  return (
                    <tr key={grade.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleMove(grade, -1)}
                            disabled={absoluteIndex === 0}
                            className="p-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Move up"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleMove(grade, 1)}
                            disabled={absoluteIndex === grades.length - 1}
                            className="p-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Move down"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${grade.isActive ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                          <span className="text-sm font-semibold text-gray-900">{grade.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-700">{grade.description || '-'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(grade)}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                            grade.isActive
                              ? 'bg-green-100 text-green-800 border border-green-200 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                          }`}
                        >
                          {grade.isActive ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {grade.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(grade)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                            <span className="text-xs font-semibold">Edit</span>
                          </button>
                          <button
                            onClick={() => handleDelete(grade.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="text-xs font-semibold">Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
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
                disabled={safePage === 1}
                className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 text-xs font-medium rounded-md transition-colors flex items-center justify-center ${
                    safePage === page ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
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
                    <Bean className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {editingGrade ? 'Edit Grade' : 'Add Grade'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {editingGrade
                        ? 'Update this grade and where it sits in the list'
                        : 'New grades appear at the end of every grade dropdown'}
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
                    Grade Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Grade A, Peaberry, Screen 18"
                    maxLength={50}
                    required
                    className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                  {editingGrade && (
                    <p className="mt-2 text-xs text-gray-500">
                      Renaming also relabels every green bean lot currently filed under
                      "{editingGrade.name}". Sale orders and invoices keep the grade they were
                      issued with.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="What this grade means, so processors pick the right one"
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
                    Active (available in the grade dropdowns)
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
                  {isSubmitting ? 'Saving...' : editingGrade ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoffeeGradeManagement;
