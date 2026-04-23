import React, { useState, useEffect, useRef } from 'react';
import { Leaf, Plus, Edit, Trash2, Search, X, AlertCircle, ChevronDown } from 'lucide-react';
import { getAllCoffeeVarieties, addCoffeeVariety, updateCoffeeVariety, deleteCoffeeVariety, CoffeeVariety } from '../services/coffeeVarietyService';

const SPECIES_OPTIONS = ['Arabica', 'Robusta', 'Liberica', 'Excelsa'];

// Custom Dropdown Component
const CustomDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, options, placeholder = 'Select...', className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

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
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-2.5 text-left bg-white border-2 rounded-lg transition-all duration-200 flex items-center justify-between ${
          isOpen
            ? 'border-green-500 ring-2 ring-green-100'
            : 'border-gray-200 hover:border-green-300'
        }`}
      >
        <span className={selectedOption ? 'text-gray-900 font-medium' : 'text-gray-500'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border-2 border-green-500 rounded-lg shadow-lg overflow-hidden">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2.5 text-left transition-colors ${
                value === option.value
                  ? 'bg-green-50 text-green-700 font-medium'
                  : 'text-gray-700 hover:bg-green-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const CoffeeVarietiesManager: React.FC = () => {
  const [varieties, setVarieties] = useState<CoffeeVariety[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingVariety, setEditingVariety] = useState<CoffeeVariety | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    species: 'Arabica',
    origin: '',
    description: '',
    characteristics: '',
    altitude: '',
    isActive: true,
  });

  // Dropdown options
  const speciesFilterOptions = [
    { value: '', label: 'All' },
    ...SPECIES_OPTIONS.map(s => ({ value: s, label: s }))
  ];

  const speciesFormOptions = SPECIES_OPTIONS.map(s => ({ value: s, label: s }));

  useEffect(() => {
    fetchVarieties();
  }, [searchTerm, speciesFilter]);

  const fetchVarieties = async () => {
    try {
      setLoading(true);
      setError('');

      const filters: Record<string, string> = {};
      if (searchTerm) filters.search = searchTerm;
      if (speciesFilter) filters.species = speciesFilter;

      const result = await getAllCoffeeVarieties(Object.keys(filters).length > 0 ? filters : undefined);
      setVarieties(result);
    } catch (err) {
      console.error('Error fetching varieties:', err);
      setError('Failed to load coffee varieties.');
      setVarieties([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (variety?: CoffeeVariety) => {
    setModalError('');
    if (variety) {
      setEditingVariety(variety);
      setFormData({
        name: variety.name,
        species: variety.species,
        origin: variety.origin || '',
        description: variety.description || '',
        characteristics: variety.characteristics || '',
        altitude: variety.altitude || '',
        isActive: variety.isActive,
      });
    } else {
      setEditingVariety(null);
      setFormData({
        name: '',
        species: 'Arabica',
        origin: '',
        description: '',
        characteristics: '',
        altitude: '',
        isActive: true,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingVariety(null);
    setModalError('');
    setIsSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    const normalizedName = formData.name.trim();
    const normalizedSpecies = formData.species.trim();

    if (!normalizedName) {
      setModalError('Variety name is required');
      return;
    }

    if (!normalizedSpecies) {
      setModalError('Species is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: normalizedName,
        species: normalizedSpecies,
        origin: formData.origin.trim() || '',
        description: formData.description.trim() || '',
        characteristics: formData.characteristics.trim() || '',
        altitude: formData.altitude.trim() || '',
        isActive: formData.isActive,
      };

      if (editingVariety) {
        await updateCoffeeVariety(editingVariety.id, payload);
      } else {
        await addCoffeeVariety(payload);
      }
      handleCloseModal();
      fetchVarieties();
    } catch (err: any) {
      setModalError(err instanceof Error ? err.message : 'Failed to save coffee variety');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (variety: CoffeeVariety) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${variety.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await deleteCoffeeVariety(variety.id);
      fetchVarieties();
    } catch (err: any) {
      alert(err.message || 'Failed to delete coffee variety');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSpeciesFilter('');
  };

  const getSpeciesBadgeColor = (species: string) => {
    const colors: Record<string, string> = {
      'Arabica': 'bg-green-100 text-green-700 border-green-200',
      'Robusta': 'bg-amber-100 text-amber-700 border-amber-200',
      'Liberica': 'bg-purple-100 text-purple-700 border-purple-200',
      'Excelsa': 'bg-blue-100 text-blue-700 border-blue-200',
    };
    return colors[species] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading coffee varieties...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Leaf className="h-8 w-8 text-green-600" />
              Coffee Varieties Registry
            </h1>
            <p className="text-gray-600 mt-2">
              Manage coffee varieties and genetic information.
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Add Variety
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search varieties..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-green-100 focus:border-green-500 transition-all"
            />
          </div>
          <CustomDropdown
            value={speciesFilter}
            onChange={setSpeciesFilter}
            options={speciesFilterOptions}
            placeholder="All Species"
            className="min-w-[160px]"
          />
          {(searchTerm || speciesFilter) && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-800"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Varieties Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {varieties.map((variety) => (
          <div
            key={variety.id}
            className={`bg-white rounded-xl p-5 shadow-sm border ${
              variety.isActive ? 'border-gray-200' : 'border-gray-300 bg-gray-50'
            }`}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{variety.name}</h3>
                <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full border ${getSpeciesBadgeColor(variety.species)}`}>
                  {variety.species}
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleOpenModal(variety)}
                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(variety)}
                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {variety.origin && (
              <p className="text-sm text-gray-600 mb-1">
                <span className="font-medium">Origin:</span> {variety.origin}
              </p>
            )}
            {variety.altitude && (
              <p className="text-sm text-gray-600 mb-1">
                <span className="font-medium">Altitude:</span> {variety.altitude}
              </p>
            )}
            {variety.characteristics && (
              <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                {variety.characteristics}
              </p>
            )}

            {!variety.isActive && (
              <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded">
                Inactive
              </span>
            )}
          </div>
        ))}
      </div>

      {varieties.length === 0 && !loading && (
        <div className="text-center py-12">
          <Leaf className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No coffee varieties found.</p>
          <button
            onClick={() => handleOpenModal()}
            className="mt-4 text-green-600 hover:text-green-700 font-medium"
          >
            Add your first variety
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingVariety ? 'Edit Variety' : 'Add New Variety'}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {modalError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{modalError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Variety Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Typica, Bourbon, Gesha"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-green-100 focus:border-green-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Species *
                </label>
                <CustomDropdown
                  value={formData.species}
                  onChange={(value) => setFormData({ ...formData, species: value })}
                  options={speciesFormOptions}
                  placeholder="Select species"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Origin
                </label>
                <input
                  type="text"
                  value={formData.origin}
                  onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                  placeholder="e.g., Ethiopia, Yemen, Colombia"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-green-100 focus:border-green-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recommended Altitude
                </label>
                <input
                  type="text"
                  value={formData.altitude}
                  onChange={(e) => setFormData({ ...formData, altitude: e.target.value })}
                  placeholder="e.g., 1200-1800m"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-green-100 focus:border-green-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Flavor Characteristics
                </label>
                <textarea
                  value={formData.characteristics}
                  onChange={(e) => {
                    setFormData({ ...formData, characteristics: e.target.value });
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  rows={3}
                  placeholder="e.g., Floral, fruity, with notes of jasmine and bergamot"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-green-100 focus:border-green-500 transition-all resize-none overflow-hidden min-h-[80px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => {
                    setFormData({ ...formData, description: e.target.value });
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  rows={3}
                  placeholder="General description of this variety"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-green-100 focus:border-green-500 transition-all resize-none overflow-hidden min-h-[80px]"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">
                  Active (available for selection)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Saving...' : editingVariety ? 'Save Changes' : 'Add Variety'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoffeeVarietiesManager;
