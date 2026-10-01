import React, { useMemo, useRef, useState } from 'react';
import { useDataContext } from '../../hooks/useDataContext';
import { ProcessType } from '../../types';
import { addProcessType, updateProcessType, deleteProcessType, processTypeNameExists } from '../../services/processing/processTypeService';
import { Plus, Edit, Trash2, Check, CheckCircle, XCircle, AlertCircle, X, Save, Coffee, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  PROCESS_TYPE_COLORS,
  PROCESS_TYPE_PICKER_HUES,
  processTypeDotCheck,
  processTypeHue,
  processTypeHueLabel,
  processTypeKey,
  processTypeScheme,
  similarProcessTypeHues,
  suggestProcessTypeHue,
  type ProcessTypeHue,
} from '../processor/workbench/processTypeColors';
import { ProcessTypeChip } from '../processor/workbench/ProcessTypeChips';
import ProcessTypePill, { PARCHMENT_PILL_SHAPE } from '../processor/workbench/ProcessTypePill';
import { ModalPortal } from '../common/ModalPortal';

type UsedByHue = Partial<Record<ProcessTypeHue, string[]>>;

/** Which colours the given process types use: hue -> their names. */
const usedHues = (types: ProcessType[], excludeId?: string): UsedByHue => {
  const map: UsedByHue = {};
  for (const type of types) {
    if (type.id === excludeId) continue;
    const hue = processTypeHue(type.colorScheme);
    map[hue] = [...(map[hue] ?? []), type.name];
  }
  return map;
};

const isUsedHue = (usedBy: UsedByHue, hue: ProcessTypeHue) => (usedBy[hue]?.length ?? 0) > 0;

/**
 * The colour a new process type starts on: far-apart colours first, skipping
 * any that is in use or looks like one in use (red, the error colour, last).
 */
const defaultHue = (usedBy: UsedByHue): ProcessTypeHue =>
  suggestProcessTypeHue(PROCESS_TYPE_PICKER_HUES.filter(hue => isUsedHue(usedBy, hue)));

/** The look-alike colours other types use, as `Sky (Lactic)`. */
const similarInUse = (hue: ProcessTypeHue, usedBy: UsedByHue): string[] =>
  similarProcessTypeHues(hue)
    .filter(similar => isUsedHue(usedBy, similar))
    .map(similar => `${processTypeHueLabel(similar)} (${(usedBy[similar] ?? []).join(', ')})`);

interface ColorSwatchPickerProps {
  value: ProcessTypeHue;
  onChange: (hue: ProcessTypeHue) => void;
  usedBy: UsedByHue;
  labelledBy: string;
}

/**
 * One round swatch per colour (a radio group: arrow keys, Home and End move
 * the choice). Every swatch keeps its 500 shade, the one dots and card edges
 * use, so the choice compares with its neighbours; the chosen one gets a dark
 * ring and a check. A small dark dot marks a colour another process type
 * already uses; it stays selectable. The tooltip also names look-alike
 * colours in use.
 */
const ColorSwatchPicker: React.FC<ColorSwatchPickerProps> = ({ value, onChange, usedBy, labelledBy }) => {
  const swatchRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = PROCESS_TYPE_PICKER_HUES.length - 1;
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(PROCESS_TYPE_PICKER_HUES[next]);
    swatchRefs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid w-max grid-cols-6 gap-2.5 p-1.5">
      {PROCESS_TYPE_PICKER_HUES.map((hue, index) => {
        const colors = PROCESS_TYPE_COLORS[hue];
        const label = processTypeHueLabel(hue);
        const users = usedBy[hue] ?? [];
        const similar = similarInUse(hue, usedBy);
        const notes = [
          users.length > 0 ? `used by ${users.join(', ')}` : '',
          similar.length > 0 ? `looks like ${similar.join(', ')}` : '',
        ].filter(Boolean);
        const isSelected = hue === value;
        return (
          <button
            key={hue}
            ref={el => { swatchRefs.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            title={notes.length > 0 ? `${label} — ${notes.join('; ')}` : label}
            tabIndex={isSelected ? 0 : -1}
            data-hue={hue}
            onClick={() => onChange(hue)}
            onKeyDown={e => handleKeyDown(e, index)}
            className={`relative flex h-8 w-8 items-center justify-center rounded-full border border-transparent transition-shadow focus:outline-none ${colors.dot} ${
              isSelected
                ? 'ring-2 ring-gray-900 ring-offset-2 focus-visible:ring-4'
                : `focus-visible:ring-2 focus-visible:ring-offset-2 ${colors.focusRing}`
            }`}
          >
            {isSelected && <Check className={`h-4 w-4 ${processTypeDotCheck(hue)}`} aria-hidden="true" />}
            {users.length > 0 && (
              <span
                data-testid="swatch-used-marker"
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gray-800"
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

/**
 * The chosen colour as the processor pages will show it, on the same white:
 * chip, selected chip, the table badge and the Parchment page badge.
 */
const ColorPreview: React.FC<{ hue: ProcessTypeHue; name: string; usedBy: string[]; similarTo: string[] }> = ({
  hue,
  name,
  usedBy,
  similarTo,
}) => {
  const label = name.trim() || 'Process type';
  return (
    <div data-testid="process-type-color-preview" className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Preview · <span className="normal-case">{processTypeHueLabel(hue)}</span>
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
        <ProcessTypeChip name={label} hue={hue} selected={false} />
        <ProcessTypeChip name={label} hue={hue} selected />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ProcessTypePill
          type={label}
          hue={hue}
          className="inline-block max-w-full px-2 py-0.5 rounded-full text-xs font-medium border break-words"
        />
        <ProcessTypePill type={label} hue={hue} className={`${PARCHMENT_PILL_SHAPE} max-w-full break-words`} />
      </div>
      {usedBy.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">Also used by {usedBy.join(', ')}</p>
      )}
      {similarTo.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">Looks like {similarTo.join(', ')}</p>
      )}
    </div>
  );
};

const PAGE_SIZE = 10;

const ProcessTypeManagement: React.FC = () => {
  const { data, setData } = useDataContext();
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<ProcessType | null>(null);
  const [formData, setFormData] = useState<{ name: string; description: string; hue: ProcessTypeHue; isActive: boolean }>({
    name: '',
    description: '',
    hue: 'blue',
    isActive: true,
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [successAction, setSuccessAction] = useState<'added' | 'updated'>('added');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // The colours the other process types already use (the one being edited excluded).
  const usedByHue = useMemo(
    () => usedHues(data.processTypes, editingType?.id),
    [data.processTypes, editingType],
  );

  // Records keep the process-type name they were saved with, and the processor
  // pages find a record's colour by that name. Renaming a type in use leaves
  // those records on the old name, so they lose this colour and show gray.
  const renamedInUse = useMemo(() => {
    const oldKey = processTypeKey(editingType?.name);
    const newKey = processTypeKey(formData.name);
    if (!oldKey || !newKey || newKey === oldKey) return 0;
    const usesOld = (name: unknown) => processTypeKey(name) === oldKey;
    return (
      data.processingBatches.filter(batch => usesOld(batch.processType)).length +
      data.parchmentLots.filter(lot => usesOld(lot.processType)).length +
      data.greenBeanLots.filter(lot => usesOld(lot.externalSource?.processType)).length
    );
  }, [editingType, formData.name, data.processingBatches, data.parchmentLots, data.greenBeanLots]);

  const resetForm = () => {
    setFormData({ name: '', description: '', hue: 'blue', isActive: true });
    setEditingType(null);
    setErrorMessage('');
  };

  const openAddModal = () => {
    resetForm();
    setFormData(prev => ({ ...prev, hue: defaultHue(usedHues(data.processTypes)) }));
    setShowModal(true);
  };

  const openEditModal = (processType: ProcessType) => {
    setEditingType(processType);
    setFormData({
      name: processType.name,
      description: processType.description || '',
      // Any stored scheme (old or new shape) resolves to its colour; unknown is gray.
      hue: processTypeHue(processType.colorScheme),
      isActive: processType.isActive,
    });
    setErrorMessage('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Validation
    if (!formData.name.trim()) {
      setErrorMessage('Process type name is required');
      return;
    }

    // Check duplicate name (service call is async)
    if (await processTypeNameExists(formData.name.trim(), editingType?.id)) {
      setErrorMessage('Process type with this name already exists');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingType) {
        const saved = await updateProcessType({
          ...editingType,
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          colorScheme: processTypeScheme(formData.hue),
          isActive: formData.isActive,
        });

        setData(prev => ({
          ...prev,
          processTypes: prev.processTypes.map(type => type.id === saved.id ? saved : type),
        }));
        setSuccessAction('updated');
      } else {
        const created = await addProcessType({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          colorScheme: processTypeScheme(formData.hue),
          isActive: formData.isActive,
        });

        setData(prev => ({
          ...prev,
          processTypes: [created, ...prev.processTypes],
        }));
        setSuccessAction('added');
      }

      setShowModal(false);
      resetForm();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save process type');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
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

    try {
      await deleteProcessType(id);
      setData(prev => ({
        ...prev,
        processTypes: prev.processTypes.filter(type => type.id !== id),
      }));
    } catch (err: any) {
      alert(err instanceof Error ? err.message : 'Failed to delete process type');
    }
  };

  const handleToggleStatus = async (processType: ProcessType) => {
    try {
      const updated = await updateProcessType({
        ...processType,
        isActive: !processType.isActive,
      });
      setData(prev => ({
        ...prev,
        processTypes: prev.processTypes.map(type => type.id === updated.id ? updated : type),
      }));
    } catch (err: any) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const activeTypes = data.processTypes.filter(t => t.isActive);
  const inactiveTypes = data.processTypes.filter(t => !t.isActive);

  // Pagination logic
  const totalPages = Math.ceil(data.processTypes.length / PAGE_SIZE);
  const paginatedTypes = data.processTypes.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

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
            Process type {successAction} successfully!
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
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Description
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Color Preview
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
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <Coffee className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No process types found</p>
                    <p className="text-xs mt-1">Click "Add Process Type" to create one</p>
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        const hue = processTypeHue(type.colorScheme);
                        return (
                          <div className="flex items-center gap-2">
                            <div className={`w-1 h-8 rounded ${PROCESS_TYPE_COLORS[hue].dot}`}></div>
                            <ProcessTypePill type={type.name} hue={hue} />
                            <span className="text-xs text-gray-500">{processTypeHueLabel(hue)}</span>
                          </div>
                        );
                      })()}
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

      {/* Add/Edit Modal. Portalled to <body>: rendered in place, the page's
          space-y-6 gave the fixed backdrop a 24px top margin, leaving an
          undimmed strip across the top of the screen. */}
      {showModal && (
        <ModalPortal>
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
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
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
                    {editingType && renamedInUse > 0 && (
                      <p data-testid="rename-in-use-warning" className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          {renamedInUse === 1 ? '1 existing record still uses' : `${renamedInUse} existing records still use`}{' '}
                          {`"${editingType.name}".`} They keep that name, so after renaming they no longer match this type
                          and show in gray.
                        </span>
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
                      placeholder="Brief description of this processing method"
                      rows={3}
                      className="block w-full border border-gray-300 rounded-lg shadow-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
                    />
                  </div>

                  <div>
                    <p id="process-type-color-label" className="text-sm font-semibold text-gray-700 mb-2">
                      Color <span className="text-red-500">*</span>
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="flex-shrink-0">
                        <ColorSwatchPicker
                          value={formData.hue}
                          onChange={hue => setFormData(prev => ({ ...prev, hue }))}
                          usedBy={usedByHue}
                          labelledBy="process-type-color-label"
                        />
                        {Object.values(usedByHue).some(names => (names?.length ?? 0) > 0) && (
                          <p className="mt-1 flex items-center gap-1.5 px-1 text-xs text-gray-500">
                            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-gray-800" />
                            Used by another type
                          </p>
                        )}
                      </div>
                      <ColorPreview
                        hue={formData.hue}
                        name={formData.name}
                        usedBy={usedByHue[formData.hue] ?? []}
                        similarTo={similarInUse(formData.hue, usedByHue)}
                      />
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
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
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
        </ModalPortal>
      )}
    </div>
  );
};

export default ProcessTypeManagement;
