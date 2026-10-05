import React, { useMemo, useState } from 'react';
import { Lock, Package } from 'lucide-react';
import { useDataContext } from '../../../hooks/useDataContext';
import { HarvestLot, User } from '../../../types';
import DatePicker from '../../common/DatePicker';
import Select from '../../common/Select';
import { Modal } from '../../common/Modal';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { Alert } from '../../common/Alert';
import { updateHarvestLot } from '../../../services/lots/harvestLotService';
import { isAdminUser } from '../../../utils/farmAccess';

const PROCESSED_LOCK_MESSAGE = 'This lot has already been processed, so its weight and status are locked.';
const COMPLETE_LOCK_MESSAGE =
    'This lot is marked Complete, so its weight is locked. Set its status back to Ready for Processing to change the weight or delete the lot.';
const ADMIN_PROCESSED_MESSAGE =
    'This lot has already been processed, so its status stays Complete. As an Admin you can still correct its weight, which the traceability record uses.';

/** The label a harvest lot goes by on screen. */
export const harvestLotLabel = (lot: HarvestLot) => lot.displayId || lot.id.substring(0, 8).toUpperCase();

/**
 * A lot is processed once a batch or parchment lot draws on it: its status
 * then stays Complete, its weight is locked (an Admin may correct it), and
 * only an Admin may delete it (with everything linked). The loaded batches
 * and parchment lots are only the latest ones, so a lot that says Complete
 * is treated as processed too, except that its status may be set back to
 * Ready (the backend refuses that if something does draw on it).
 */
export const useHarvestLotProcessing = () => {
    const { data } = useDataContext();
    const processedLotIds = useMemo(() => {
        const ids = new Set<string>();
        data.processingBatches.forEach(b => { if (b.harvestLotId) ids.add(b.harvestLotId); });
        data.parchmentLots.forEach(p => { if (p.harvestLotId) ids.add(p.harvestLotId); });
        return ids;
    }, [data.processingBatches, data.parchmentLots]);
    const hasLinkedRecords = (lot: HarvestLot) => processedLotIds.has(lot.id);
    const isProcessed = (lot: HarvestLot) => lot.status === 'Complete' || hasLinkedRecords(lot);
    return { hasLinkedRecords, isProcessed };
};

interface EditForm {
    cherryVariety: string;
    weightKg: string;
    harvestDate: string;
    farmPlotLocation: string;
    status: string;
    farmId: string;
    cropYearId: string;
}

const EMPTY_FORM: EditForm = {
    cherryVariety: '',
    weightKg: '',
    harvestDate: '',
    farmPlotLocation: '',
    status: 'Ready for Processing',
    farmId: '',
    cropYearId: '',
};

const formFor = (lot: HarvestLot): EditForm => ({
    cherryVariety: lot.cherryVariety,
    weightKg: lot.weightKg.toString(),
    harvestDate: lot.harvestDate,
    farmPlotLocation: lot.farmPlotLocation,
    status: lot.status,
    farmId: lot.farmId || '',
    cropYearId: lot.cropYearId || '',
});

export interface HarvestLotEditModalProps {
    /** The lot being edited; the popup is open while it is set. */
    lot: HarvestLot | null;
    currentUser: User;
    onClose: () => void;
    onSaved?: (lot: HarvestLot) => void;
}

/**
 * The Edit Harvest Lot popup, shared by the Data Hub and the harvest lot
 * details page. Who may open it is the caller's call (canManageHarvestLot);
 * the popup locks what the backend would refuse and sends only the fields
 * that were changed.
 */
const HarvestLotEditModal: React.FC<HarvestLotEditModalProps> = ({ lot, currentUser, onClose, onSaved }) => {
    const { data, setData } = useDataContext();
    const { hasLinkedRecords, isProcessed } = useHarvestLotProcessing();
    const isAdmin = isAdminUser(currentUser);

    const [form, setForm] = useState<EditForm>(() => (lot ? formFor(lot) : EMPTY_FORM));
    const [editError, setEditError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // A new lot (or the same one opened again) starts from what it holds.
    const [formLot, setFormLot] = useState<HarvestLot | null>(lot);
    if (lot !== formLot) {
        setFormLot(lot);
        if (lot && lot.id !== formLot?.id) {
            setForm(formFor(lot));
            setEditError(null);
        }
    }

    // The farms a lot may move to: any for an Admin, else the user's own (the
    // backend refuses another farmer's farm). The lot's current farm is always
    // listed so the field shows it.
    const editFarmOptions = useMemo(() => {
        const farmLabel = (f: { id: string; farmName?: string; name?: string; location?: string }) =>
            [f.farmName || f.name, f.location].filter(Boolean).join(' • ') || f.id;
        const farms = isAdmin ? data.farms : data.farms.filter(f => f.ownerUserId === currentUser.id);
        const options = farms.map(f => ({ value: f.id, label: farmLabel(f) }));
        const current = lot?.farmId;
        if (current && !options.some(o => o.value === current)) {
            const farm = data.farms.find(f => f.id === current) || lot?.farm;
            options.unshift({ value: current, label: farm ? farmLabel(farm) : current });
        }
        return options;
    }, [data.farms, isAdmin, currentUser.id, lot]);

    const editCropYearOptions = useMemo(() => [
        { value: '', label: 'No crop year' },
        ...[...data.cropYears]
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
            .map(cy => ({ value: cy.id, label: cy.year })),
    ], [data.cropYears]);

    // The varieties planted on the farm chosen in the form, as the Register
    // popup offers them. The lot's own variety stays listed even when the
    // farm no longer has it, so opening the popup never changes it.
    const varietyOptions = useMemo(() => {
        const planted = data.farms.find(f => f.id === form.farmId)?.varieties ?? [];
        const options = [...planted];
        if (form.cherryVariety && !options.includes(form.cherryVariety)) options.unshift(form.cherryVariety);
        return options;
    }, [data.farms, form.farmId, form.cherryVariety]);

    // The lot's farmer follows its farm's owner: moving the lot to another
    // farm hands it to that farm's farmer, as the Register popup records it.
    const farmChanged = Boolean(lot && form.farmId && form.farmId !== (lot.farmId || ''));
    const chosenFarm = data.farms.find(f => f.id === form.farmId);
    const farmerShown = lot
        ? (farmChanged ? chosenFarm?.farmerName?.trim() || lot.farmerName : lot.farmerName)
        : '';

    const close = () => {
        if (isSaving) return;
        setEditError(null);
        onClose();
    };

    // What the popup locks on the lot being edited (the backend enforces the
    // same): a processed lot's weight for everyone but an Admin, and its
    // status while a known batch or parchment lot draws on it. A lot that only
    // says Complete keeps its status open, so it can be set back to Ready.
    const weightLocked = lot ? isProcessed(lot) && !isAdmin : false;
    const statusLocked = lot ? hasLinkedRecords(lot) : false;
    const editingNote = !lot
        ? null
        : weightLocked
            ? (statusLocked ? PROCESSED_LOCK_MESSAGE : COMPLETE_LOCK_MESSAGE)
            : (isAdmin && statusLocked ? ADMIN_PROCESSED_MESSAGE : null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!lot || isSaving) return;

        // Send only what was changed: the backend writes every key it is
        // sent, so an untouched field must not go out at all. The farmer's
        // name is not typed here: it follows the farm's owner (see below).
        const changes: Partial<HarvestLot> = {};
        const textFields = [
            ['cherryVariety', 'Cherry variety'],
            ['farmPlotLocation', 'Farm plot location'],
        ] as const;
        for (const [field, label] of textFields) {
            const value = form[field].trim();
            if (value === (lot[field] || '').trim()) continue;
            if (!value) {
                setEditError(`${label} cannot be blank.`);
                return;
            }
            changes[field] = value;
        }
        if (form.harvestDate !== lot.harvestDate) {
            if (!form.harvestDate) {
                setEditError('Harvest date cannot be blank.');
                return;
            }
            changes.harvestDate = form.harvestDate;
        }
        // Locked fields never go out (the backend would refuse them).
        if (!weightLocked) {
            const weight = parseFloat(form.weightKg);
            if (weight !== lot.weightKg) {
                if (!Number.isFinite(weight) || weight <= 0) {
                    setEditError('Weight must be a number greater than 0.');
                    return;
                }
                changes.weightKg = weight;
            }
        }
        if (!statusLocked && form.status !== lot.status) {
            changes.status = form.status as 'Ready for Processing' | 'Complete';
        }
        // The farm can be changed but not cleared; the backend checks the
        // caller may use the new one. An empty crop year clears it.
        if (farmChanged) {
            changes.farmId = form.farmId;
            // The backend hands the lot to the new farm's owner but keeps
            // the name it was sent, so the new farmer's name goes with it.
            if (farmerShown && farmerShown !== lot.farmerName) {
                changes.farmerName = farmerShown;
            }
        }
        if (form.cropYearId !== (lot.cropYearId || '')) {
            changes.cropYearId = form.cropYearId;
        }

        if (Object.keys(changes).length === 0) {
            close();
            return;
        }

        setIsSaving(true);
        setEditError(null);
        try {
            const updatedLot = await updateHarvestLot(lot.id, changes);
            setData(prev => ({
                ...prev,
                harvestLots: prev.harvestLots.map(h => (h.id === lot.id ? updatedLot : h)),
            }));
            onSaved?.(updatedLot);
            onClose();
        } catch (error) {
            setEditError(error instanceof Error && error.message ? error.message : 'Failed to update harvest lot.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={lot !== null}
            onClose={close}
            title="Edit Harvest Lot"
            maxWidth="2xl"
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Lot ID Badge */}
                {lot && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <Package className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Lot ID</p>
                                <p className="text-sm font-mono font-semibold text-gray-900">{harvestLotLabel(lot)}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Basic Information */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">Basic Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Read-only: the lot's farmer follows its farm's owner. */}
                        <Input
                            label="Farmer Name"
                            type="text"
                            id="edit-farmerName"
                            value={farmerShown ?? ''}
                            readOnly
                            helperText="Follows the farm's owner"
                            className="bg-gray-50 text-gray-700 cursor-default focus:ring-0 focus:border-gray-300"
                            fullWidth
                        />
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Cherry Variety</label>
                            <Select
                                value={form.cherryVariety}
                                onChange={(v) => setForm({ ...form, cherryVariety: (v as string) || '' })}
                                options={varietyOptions}
                                placeholder="Select variety..."
                            />
                        </div>
                    </div>
                </div>

                {/* Harvest Details */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">Harvest Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            label="Weight (kg)"
                            type="number"
                            id="edit-weightKg"
                            value={form.weightKg}
                            onChange={e => setForm({ ...form, weightKg: e.target.value })}
                            required={!weightLocked}
                            disabled={weightLocked}
                            min="0"
                            step="0.01"
                            fullWidth
                        />
                        <DatePicker
                            value={form.harvestDate}
                            onChange={(date) => setForm({ ...form, harvestDate: date })}
                            label="Harvest Date"
                            required
                        />
                    </div>
                </div>

                {/* Location & Status */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">Location & Status</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Farm</label>
                            <Select
                                value={form.farmId}
                                onChange={(v) => setForm({ ...form, farmId: (v as string) || '' })}
                                options={editFarmOptions}
                                placeholder="Not linked to a farm"
                            />
                            {isAdmin && lot && form.farmId !== (lot.farmId || '') && (
                                <p className="mt-1 text-xs text-gray-500">The lot will belong to the owner of this farm.</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Crop Year</label>
                            <Select
                                value={form.cropYearId}
                                onChange={(v) => setForm({ ...form, cropYearId: (v as string) || '' })}
                                options={editCropYearOptions}
                                placeholder="No crop year"
                            />
                        </div>
                        <Input
                            label="Farm Plot Location"
                            type="text"
                            id="edit-farmPlotLocation"
                            value={form.farmPlotLocation}
                            onChange={e => setForm({ ...form, farmPlotLocation: e.target.value })}
                            required
                            fullWidth
                        />
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                            <Select
                                value={form.status}
                                onChange={(v) => setForm({ ...form, status: v as string })}
                                options={[
                                    { value: 'Ready for Processing', label: 'Ready for Processing' },
                                    { value: 'Complete', label: 'Complete' }
                                ]}
                                placeholder="Select status"
                                disabled={statusLocked}
                            />
                        </div>
                    </div>
                    {editingNote && (
                        <p className="flex items-center gap-2 text-sm text-gray-600">
                            <Lock className="h-4 w-4 flex-shrink-0 text-gray-400" />
                            {editingNote}
                        </p>
                    )}
                </div>

                {editError && (
                    <div role="alert">
                        <Alert type="error" message={editError} />
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                    <Button
                        type="button"
                        onClick={close}
                        variant="outline"
                        disabled={isSaving}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        loading={isSaving}
                    >
                        Save Changes
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default HarvestLotEditModal;
