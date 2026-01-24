import React, { useState, useMemo, useRef, useEffect } from 'react';
import DatePicker from '../common/DatePicker';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PageHeader } from '../common/PageHeader';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { User, GreenBeanLot, RoasterInventoryItem, RoastBatch, RoastLevel, GreenBeanSourceType } from '../../types';
import { PlusCircle, Package, Flame, Coffee } from 'lucide-react';
import ExternalLotsTable from './ExternalLotsTable';
import InternalLotsTable from './InternalLotsTable';
import InventoryTable from './InventoryTable';
import RoastLogPanel from './RoastLogPanel';
import { toFixed2, clamp } from '../../utils/formatters';
import { generateRoastLogId } from '../../utils/idGenerator';


interface RoasterWorkbenchProps {
    currentUser: User;
}

const FLAVOR_GROUPS: Record<string, string[]> = {
    Sweet: ['Brown Sugar', 'Honey', 'Caramel', 'Vanilla'],
    Fruity: ['Citrus', 'Orange Peel', 'Berry', 'Apple', 'Tropical'],
    Floral: ['Jasmine', 'Rose', 'Lavender'],
    'Nutty/Chocolatey': ['Almond', 'Hazelnut', 'Chocolate', 'Cocoa'],
    Spicy: ['Cinnamon', 'Clove', 'Black Pepper'],
    Roasted: ['Toasted', 'Smoky'],
    Other: ['Earthy', 'Woody', 'Herbal'],
};

// Common coffee varieties for selection (mirrors Farmer form)
const COFFEE_VARIETIES = [
    'Gesha',
    'Caturra',
    'Bourbon',
    'Typica',
    'SL28',
    'SL34',
    'Pacamara',
    'Catuai',
    'Mundo Novo',
    'Maragogype',
    'Kent',
    'Blue Mountain',
    'Ethiopian Heirloom',
    'Java',
    'Tekisic',
];

// Removed local CustomDropdown in favor of shared Select component


const RoasterWorkbench: React.FC<RoasterWorkbenchProps> = ({ currentUser }) => {
    const { data, setData } = useDataContext();
    const location = useLocation();
    const navigate = useNavigate();

    // Common currency options for quick selection
    const CURRENCY_OPTIONS = ['THB', 'USD', 'EUR', 'JPY', 'CNY', 'IDR', 'VND', 'MYR', 'SGD', 'LAK'];

    const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
    const [isAddLotModalOpen, setIsAddLotModalOpen] = useState(false);
    const [isLogRoastModalOpen, setIsLogRoastModalOpen] = useState(false);
    const [selectedLot, setSelectedLot] = useState<(GreenBeanLot & { variety: string, process: string, finalScore: string | number }) | null>(null);
    const [selectedInventoryItem, setSelectedInventoryItem] = useState<(RoasterInventoryItem & { variety: string, process: string }) | null>(null);
    const [claimAmount, setClaimAmount] = useState('');
    const [roastForm, setRoastForm] = useState({ batchSize: '', roastedWeight: '', notes: '', flavorNotes: '' });
    const [roastLevel, setRoastLevel] = useState<RoastLevel>(RoastLevel.Medium);
    const [selectedCategory, setSelectedCategory] = useState<keyof typeof FLAVOR_GROUPS>('Sweet');
    const [selectedNote, setSelectedNote] = useState<string>(FLAVOR_GROUPS['Sweet'][0]);
    const [selectedFlavorTags, setSelectedFlavorTags] = useState<string[]>([]);
    const availableLotsRef = useRef<HTMLDivElement>(null);
    const internalLotsRef = useRef<HTMLDivElement>(null);
    const inventoryRef = useRef<HTMLDivElement>(null);
    const roastLogRef = useRef<HTMLDivElement>(null);

    // Add External Lot form state
    const [newLotForm, setNewLotForm] = useState({
        originName: '',
        producerName: '',
        variety: '',
        processType: '',
        purchaseDate: new Date().toISOString().substring(0,10),
        pricePerKg: '',
        currency: 'THB',
        initialWeightKg: '',
        grade: 'Grade A',
        supplierNotes: '',
        tasteNote: '',
    });


    const getFinalScore = (gbl: GreenBeanLot) => {
        let finalScore: string | number = 'N/A';
        const scoreInfo = gbl.cuppingScores[0];
        if (scoreInfo) {
            const session = data.cuppingSessions.find(s => s.id === scoreInfo.sessionId);
            const sample = session?.samples.find(s => s.greenBeanLotId === gbl.id);
            if (session && sample && session.finalResults && session.finalResults[sample.id]) {
                // Return as number; string formatting happens at render time
                finalScore = session.finalResults[sample.id].totalScore;
            } else if (scoreInfo.score) {
                finalScore = scoreInfo.score;
            }
        }
        return finalScore;
    };

    // Map a lot to display fields
    const mapLotForDisplay = (gbl: GreenBeanLot) => {
    if (gbl.sourceType === GreenBeanSourceType.External && gbl.externalSource) {
            const variety = gbl.externalSource.variety || 'N/A';
            const process = gbl.externalSource.processType || 'N/A';
            // No score shown for external lots in table
            // External: do not show grade in Info; show grade in its own column (or '-' if missing)
            const displayInfo = `${variety} / ${process}`;
            const priceNumber = gbl.externalSource.pricePerKg;
            const priceCurrency = gbl.externalSource.currency || gbl.currency || 'THB';
            const displayPrice = (typeof priceNumber === 'number' && !isNaN(priceNumber)) ? `${priceNumber.toFixed(2)} ${priceCurrency}` : undefined;
            return {
                ...gbl,
                variety,
                process,
                // finalScore intentionally omitted for external table rendering
                displayInfo,
                displayPrice,
                gradeDisplay: gbl.grade || '—',
            } as GreenBeanLot & { variety: string; process: string; displayInfo: string; displayPrice?: string; gradeDisplay: string };
        }
        const parchmentLot = data.parchmentLots.find(p => p.id === gbl.parchmentLotId);
        const harvestLot = data.harvestLots.find(h => h.id === parchmentLot?.harvestLotId);
        const variety = harvestLot?.cherryVariety || 'N/A';
        const process = parchmentLot?.processType || 'N/A';
        const finalScore = getFinalScore(gbl);
        const displayScore = typeof finalScore === 'number' ? finalScore.toFixed(2) : '—';
        const displayInfo = `${variety} / ${process}`;
        return {
            ...gbl,
            variety,
            process,
            finalScore,
            displayScore,
            displayInfo,
            gradeDisplay: gbl.grade || '—',
        } as GreenBeanLot & { variety: string; process: string; finalScore: string | number; displayScore: string; displayInfo: string; gradeDisplay: string };
    };

    // Split into External and Internal lists
    const availableExternalLots = useMemo(() =>
        data.greenBeanLots
            .filter(lot => lot.availabilityStatus === 'Available' && lot.currentWeightKg > 0 && lot.sourceType === GreenBeanSourceType.External)
            .map(mapLotForDisplay),
        [data]
    );

    const availableInternalLots = useMemo(() =>
        data.greenBeanLots
            .filter(lot => lot.availabilityStatus === 'Available' && lot.currentWeightKg > 0 && lot.sourceType === GreenBeanSourceType.Internal)
            .map(mapLotForDisplay),
        [data]
    );

    const myInventory = useMemo(() =>
        data.roasterInventory
            .filter(item => item.roasterId === currentUser.id && item.remainingWeightKg > 0.01)
            .map(item => {
                const gbl = data.greenBeanLots.find(lot => lot.id === item.greenBeanLotId);
                const parchmentLot = data.parchmentLots.find(p => p.id === gbl?.parchmentLotId);
                const harvestLot = data.harvestLots.find(h => h.id === parchmentLot?.harvestLotId);
                return {
                    ...item,
                    variety: harvestLot?.cherryVariety || 'N/A',
                    process: parchmentLot?.processType || 'N/A',
                };
            }),
        [data, currentUser.id]
    );

    const myRoasts = useMemo(() =>
        data.roastBatches
            .filter(roast => roast.roasterId === currentUser.id)
            .sort((a, b) => new Date(b.roastDate).getTime() - new Date(a.roastDate).getTime()),
        [data.roastBatches, currentUser.id]
    );
    // Pagination for Roast Log
    const [page, setPage] = useState(1);
    const pageSize = 5;
    const totalPages = Math.max(1, Math.ceil(myRoasts.length / pageSize));
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [totalPages, page]);
    const pagedRoasts = useMemo(() => myRoasts.slice((page-1)*pageSize, (page-1)*pageSize + pageSize), [myRoasts, page]);

    const openClaimModal = (lot: GreenBeanLot & { variety: string, process: string, finalScore: string | number }) => {
        setSelectedLot(lot);
        setClaimAmount('');
        setIsClaimModalOpen(true);
    };

    const openLogRoastModal = (inventoryItem: RoasterInventoryItem & { variety: string, process: string }) => {
        setSelectedInventoryItem(inventoryItem);
    setRoastForm({ batchSize: '', yieldPercentage: '85', notes: '', flavorNotes: '' });
    setRoastLevel(RoastLevel.Medium);

        const existing = (data.roastBatches
            .filter(r => r.roasterId === currentUser.id && r.roasterInventoryId === inventoryItem.id)
            .at(-1)?.flavorNotes || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

        setSelectedFlavorTags(existing);
        setSelectedCategory('Sweet');
        setSelectedNote(FLAVOR_GROUPS['Sweet'][0]);
        setIsLogRoastModalOpen(true);
    };


    const handleClaimSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const amount = parseFloat(claimAmount);
        if (!selectedLot || !amount || amount <= 0 || amount > selectedLot.currentWeightKg) return alert('Invalid claim amount.');

        setData(prev => {
            const updatedGreenBeanLots = prev.greenBeanLots.map(gbl => gbl.id === selectedLot.id ? { ...gbl, currentWeightKg: gbl.currentWeightKg - amount } : gbl);
            const existingInvIndex = prev.roasterInventory.findIndex(item => item.roasterId === currentUser.id && item.greenBeanLotId === selectedLot.id);
            let updatedRoasterInventory;

            if (existingInvIndex > -1) {
                updatedRoasterInventory = [...prev.roasterInventory];
                const item = updatedRoasterInventory[existingInvIndex];
                updatedRoasterInventory[existingInvIndex] = { ...item, claimedWeightKg: item.claimedWeightKg + amount, remainingWeightKg: item.remainingWeightKg + amount };
            } else {
                updatedRoasterInventory = [...prev.roasterInventory, { id: `RI${String(prev.roasterInventory.length + 1).padStart(3, '0')}`, roasterId: currentUser.id, greenBeanLotId: selectedLot.id, claimedWeightKg: amount, remainingWeightKg: amount }];
            }
            return { ...prev, greenBeanLots: updatedGreenBeanLots, roasterInventory: updatedRoasterInventory };
        });
        setIsClaimModalOpen(false);
    };

    const handleLogRoastSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedInventoryItem) return;

        const batchRaw = parseFloat(roastForm.batchSize);
        const roastedRaw = parseFloat(roastForm.roastedWeight);

        if (!batchRaw || batchRaw <= 0) return alert('Enter a valid batch size (kg).');
        if (!roastedRaw || roastedRaw <= 0) return alert('Enter a valid roasted weight (kg).');
        if (batchRaw > selectedInventoryItem.remainingWeightKg) return alert('Batch exceeds inventory.');
        if (roastedRaw > batchRaw) return alert('Roasted weight cannot be greater than batch size.');

        const batch = toFixed2(clamp(batchRaw, 0.01, selectedInventoryItem.remainingWeightKg));
        const roasted = toFixed2(clamp(roastedRaw, 0.01, batch));
        const yieldPct = toFixed2((roasted / batch) * 100);
        const weightLossPct = toFixed2(100 - yieldPct);

        setData(prev => {
            const updatedInventory = prev.roasterInventory.map(item =>
                item.id === selectedInventoryItem.id
                    ? { ...item, remainingWeightKg: toFixed2(item.remainingWeightKg - batch) }
                    : item
            );

            const newRoast: RoastBatch = {
                id: generateRoastLogId(prev.roastBatches.map(r => r.id)),
                roasterId: currentUser.id,
                roasterInventoryId: selectedInventoryItem.id,
                greenBeanLotId: selectedInventoryItem.greenBeanLotId,
                roastDate: new Date().toISOString().substring(0, 10),
                batchSizeKg: batch,
                yieldPercentage: yieldPct,     // kept for backward compatibility
                roastedWeightKg: roasted,      // NEW
                weightLossPct: weightLossPct,  // NEW
                roastLevel: roastLevel,
                roastProfileNotes: roastForm.notes?.trim(),
                flavorNotes: selectedFlavorTags.join(', '),

            };

            return { ...prev, roasterInventory: updatedInventory, roastBatches: [...prev.roastBatches, newRoast] };
        });

        setIsLogRoastModalOpen(false);
    };

    const handleQuickClaim = () => {
        const anyAvailable = [...availableExternalLots, ...availableInternalLots];
        if (anyAvailable.length === 0) {
            alert('No green bean lots are available to claim right now.');
            return;
        }
        const pick = availableExternalLots.length > 0 ? availableExternalLots[0] : availableInternalLots[0];
        const targetRef = availableExternalLots.length > 0 ? availableLotsRef : internalLotsRef;
        targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        openClaimModal(pick);
    };

    const handleQuickLogRoast = () => {
        if (myInventory.length === 0) {
            alert('You do not have inventory to log a roast. Claim a lot first.');
            return;
        }
        inventoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        openLogRoastModal(myInventory[0]);
    };

    const scrollToRoastLog = () => {
        roastLogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };


    const quickActionHandlers = useRef({
        claim: handleQuickClaim,
        logRoast: handleQuickLogRoast,
        viewLog: scrollToRoastLog,
    });
    quickActionHandlers.current = {
        claim: handleQuickClaim,
        logRoast: handleQuickLogRoast,
        viewLog: scrollToRoastLog,
    };

    useEffect(() => {
        const state = location.state as { quickAction?: 'claim' | 'logRoast' | 'viewLog' } | null;
        if (!state?.quickAction) return;
        const action = quickActionHandlers.current[state.quickAction];
        if (action) action();
        navigate(location.pathname, { replace: true });
    }, [location, navigate]);

    return (
        <div>
            {/* Header Section */}
            <PageHeader
                title="Roaster's Workbench"
                description="Claim green bean lots, manage inventory, and log your roasts."
                icon={<Coffee className="h-8 w-8 text-blue-600" />}
                className="mb-8"
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* Available Lots - External */}
                    <div ref={availableLotsRef}>
                      <ExternalLotsTable
                        lots={availableExternalLots as any}
                        onClaim={(lot) => openClaimModal(lot as any)}
                        onAddExternal={() => setIsAddLotModalOpen(true)}
                      />
                    </div>

                    {/* Available Lots - Internal */}
                    <div ref={internalLotsRef}>
                      <InternalLotsTable
                        lots={availableInternalLots as any}
                        onClaim={(lot) => openClaimModal(lot as any)}
                      />
                    </div>

                    {/* My Inventory */}
                    <div ref={inventoryRef}>
                      <InventoryTable
                        items={myInventory as any}
                        onLogRoast={(item) => openLogRoastModal(item as any)}
                      />
                    </div>
                </div>

                {/* Roast Log */}
                <div ref={roastLogRef}>
                  <RoastLogPanel
                    roasts={pagedRoasts}
                    page={page}
                    totalPages={totalPages}
                    onPrev={() => setPage(p => Math.max(1, p-1))}
                    onNext={() => setPage(p => Math.min(totalPages, p+1))}
                    onPageChange={(newPage) => setPage(newPage)}
                  />
                </div>

            </div>

            {/* Modals */}
            <Modal
                isOpen={isClaimModalOpen && !!selectedLot}
                onClose={() => setIsClaimModalOpen(false)}
                maxWidth="md"
            >
                {selectedLot && (
                    <form onSubmit={handleClaimSubmit}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-green-100 rounded-xl">
                                <Package className="h-6 w-6 text-green-600" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Claim Stock</h2>
                                <p className="text-sm text-gray-500">from Lot {selectedLot.id}</p>
                            </div>
                        </div>

                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
                            <p className="text-sm font-medium text-green-900">Available Stock</p>
                            <p className="text-3xl font-bold text-green-700">{toFixed2(selectedLot.currentWeightKg)} kg</p>
                        </div>

                        <Input
                            label="Amount to Claim (kg)"
                            type="number"
                            step="0.1"
                            max={selectedLot.currentWeightKg}
                            value={claimAmount}
                            onChange={e => setClaimAmount(e.target.value)}
                            required
                            fullWidth
                            className="text-lg font-semibold"
                            placeholder="0.00"
                        />

                        <div className="flex justify-end gap-3 mt-6">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setIsClaimModalOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="success"
                                size="lg"
                            >
                                Claim Stock
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal
                isOpen={isLogRoastModalOpen && !!selectedInventoryItem}
                onClose={() => setIsLogRoastModalOpen(false)}
                maxWidth="2xl"
            >
                {selectedInventoryItem && (
                    <form onSubmit={handleLogRoastSubmit}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-orange-100 rounded-xl">
                                <Flame className="h-6 w-6 text-orange-600" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Log Roast</h2>
                                <p className="text-sm text-gray-500">for Lot {selectedInventoryItem.greenBeanLotId}</p>
                            </div>
                        </div>

                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
                            <p className="text-sm font-medium text-orange-900">Inventory Remaining</p>
                            <p className="text-3xl font-bold text-orange-700">{toFixed2(selectedInventoryItem.remainingWeightKg)} kg</p>
                        </div>
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Batch Size (kg)</label>
                                        <input
                                            type="number"
                                            min={0.01}
                                            step="0.01"
                                            required
                                            max={selectedInventoryItem.remainingWeightKg}
                                            value={roastForm.batchSize}
                                            onChange={(e) => setRoastForm({ ...roastForm, batchSize: e.target.value })}
                                            onInvalid={(e) =>
                                                (e.currentTarget as HTMLInputElement).setCustomValidity(
                                                    `Batch size must be between 0.01 and ${selectedInventoryItem.remainingWeightKg.toFixed(2)} kg`
                                                )
                                            }
                                            onInput={(e) => (e.currentTarget as HTMLInputElement).setCustomValidity('')}
                                            className="block w-full border-2 border-gray-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 rounded-xl py-2.5 px-3 font-semibold transition-all duration-200"
                                            placeholder="0.00"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Roasted Weight (kg)</label>
                                        <input
                                            type="number"
                                            min={0.01}
                                            step="0.01"
                                            required
                                            max={parseFloat(roastForm.batchSize) || undefined}
                                            value={roastForm.roastedWeight}
                                            onChange={(e) => setRoastForm({ ...roastForm, roastedWeight: e.target.value })}
                                            onInvalid={(e) =>
                                                (e.currentTarget as HTMLInputElement).setCustomValidity(
                                                    parseFloat(roastForm.batchSize)
                                                        ? `Roasted weight cannot exceed batch size (${parseFloat(roastForm.batchSize).toFixed(2)} kg)`
                                                        : 'Please enter batch size first'
                                                )
                                            }
                                            onInput={(e) => (e.currentTarget as HTMLInputElement).setCustomValidity('')}
                                            className="block w-full border-2 border-gray-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 rounded-xl py-2.5 px-3 font-semibold transition-all duration-200"
                                            placeholder="0.00"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Weight Loss / Yield</label>
                                        <div className="bg-gray-100 border-2 border-gray-300 rounded-xl py-2.5 px-3 text-sm font-bold text-gray-700">
                                            {(() => {
                                                const b = parseFloat(roastForm.batchSize || '0');
                                                const r = parseFloat(roastForm.roastedWeight || '0');
                                                if (!b || !r) return '—';
                                                const yieldPct = (r / b) * 100;
                                                const lossPct = 100 - yieldPct;
                                                return `${lossPct.toFixed(1)}% loss • ${yieldPct.toFixed(1)}% yield`;
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                                                                <label className="block text-sm font-bold text-gray-700 mb-2">Roast Level</label>
                                                                                <Select
                                                                                    value={roastLevel}
                                                                                    onChange={(v) => setRoastLevel((v as RoastLevel) || RoastLevel.Medium)}
                                                                                    options={[RoastLevel.Light, RoastLevel.Medium, RoastLevel.Dark]}
                                                                                    placeholder="Select level..."
                                                                                />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Roast Profile Notes</label>
                                    <textarea
                                        rows={3}
                                        value={roastForm.notes}
                                        onChange={e => setRoastForm({ ...roastForm, notes: e.target.value })}
                                        onInput={e => {
                                            const el = e.currentTarget;
                                            el.style.height = 'auto';
                                            el.style.height = el.scrollHeight + 'px';
                                        }}
                                        className="block w-full border-2 border-gray-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 rounded-xl py-3 px-4 resize-none overflow-y-auto max-h-40 transition-all duration-200"
                                        placeholder="e.g., Medium roast profile. First crack at 9:30. Dropped at 11:15."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Flavor Notes</label>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {/* Aroma Types */}
                                        <div>
                                            <span className="block text-xs font-medium text-gray-600 mb-1">Aroma Types</span>
                                            <Select
                                                value={selectedCategory}
                                                onChange={(cat) => {
                                                    const category = (cat as keyof typeof FLAVOR_GROUPS) || 'Sweet';
                                                    setSelectedCategory(category);
                                                    setSelectedNote(FLAVOR_GROUPS[category][0]);
                                                }}
                                                options={Object.keys(FLAVOR_GROUPS)}
                                                placeholder="Select type..."
                                            />
                                        </div>

                                        {/* Aroma */}
                                        <div>
                                            <span className="block text-xs font-medium text-gray-600 mb-1">Aroma</span>
                                            <Select
                                                value={selectedNote}
                                                onChange={(v) => setSelectedNote((v as string) || '')}
                                                options={FLAVOR_GROUPS[selectedCategory]}
                                                placeholder="Select aroma..."
                                            />
                                        </div>

                                        {/* Add button */}
                                        <div className="flex items-end">
                                            <button
                                                type="button"
                                                aria-label="Add aroma"
                                                onClick={() => {
                                                    if (selectedNote && !selectedFlavorTags.includes(selectedNote)) {
                                                        setSelectedFlavorTags((prev) => [...prev, selectedNote]);
                                                    }
                                                }}
                                                className="inline-flex items-center justify-center rounded-xl bg-orange-500 text-white font-semibold px-4 py-2.5 w-full hover:bg-orange-600 transition-all duration-200 shadow-md hover:shadow-lg"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>

                                    {/* Selected flavor tags */}
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {selectedFlavorTags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="inline-flex items-center gap-2 rounded-full bg-yellow-100 text-yellow-800 text-sm font-semibold px-4 py-1.5 border border-yellow-200"
                                            >
                                                {tag}
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedFlavorTags((prev) => prev.filter(t => t !== tag))}
                                                    className="ml-1 text-yellow-700 hover:text-yellow-900 font-bold"
                                                    aria-label={`Remove ${tag}`}
                                                >
                                                    ✕
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>

                            </div>
                        <div className="mt-8 flex justify-end gap-3">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setIsLogRoastModalOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                className="bg-orange-600 hover:bg-orange-700"
                            >
                                Log Roast
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal
                isOpen={isAddLotModalOpen}
                onClose={() => setIsAddLotModalOpen(false)}
                maxWidth="xl"
            >
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                const initial = parseFloat(newLotForm.initialWeightKg);
                                                const price = parseFloat(newLotForm.pricePerKg);
                                                if (!newLotForm.originName || !newLotForm.variety || !newLotForm.processType) return alert('Please fill origin, variety, and process type');
                                                if (!initial || initial <= 0) return alert('Initial weight must be > 0');
                                                if (isNaN(price)) return alert('Enter a valid price');

                                                setData(prev => {
                                                    const nextNum = prev.greenBeanLots
                                                        .map(l => parseInt((l.id.match(/GBL(\d+)/)?.[1] || '0'), 10))
                                                        .reduce((a,b)=>Math.max(a,b), 0) + 1;
                                                    const newId = `GBL${String(nextNum).padStart(3,'0')}`;
                                                    const lot: GreenBeanLot = {
                                                        id: newId,
                                                        sourceType: GreenBeanSourceType.External,
                                                        externalSource: {
                                                            originName: newLotForm.originName,
                                                            producerName: newLotForm.producerName || undefined,
                                                            variety: newLotForm.variety,
                                                            processType: newLotForm.processType,
                                                            purchaseDate: newLotForm.purchaseDate,
                                                            pricePerKg: isNaN(price) ? 0 : price,
                                                            currency: newLotForm.currency,
                                                            tasteNote: newLotForm.tasteNote || undefined,
                                                            supplierNotes: newLotForm.supplierNotes || undefined,
                                                        },
                                                        grade: newLotForm.grade || 'Grade A',
                                                        initialWeightKg: initial,
                                                        currentWeightKg: initial,
                                                        availabilityStatus: 'Available',
                                                        pricePerKg: isNaN(price) ? undefined : price,
                                                        currency: newLotForm.currency,
                                                        cuppingScores: [],
                                                    };
                                                    return { ...prev, greenBeanLots: [lot, ...prev.greenBeanLots] };
                                                });
                                                setIsAddLotModalOpen(false);
                                                setNewLotForm({
                                                    originName: '', producerName: '', variety: '', processType: '', purchaseDate: new Date().toISOString().substring(0,10), pricePerKg: '', currency: 'THB', initialWeightKg: '', grade: 'Grade A', supplierNotes: '', tasteNote: ''
                                                });
                                            }}
                                        >
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="p-3 bg-green-100 rounded-xl">
                                                    <Package className="h-6 w-6 text-green-600" />
                                                </div>
                                                <div>
                                                    <h2 className="text-2xl font-bold text-gray-900">Add External Green Bean Lot</h2>
                                                    <p className="text-sm text-gray-500">Record externally purchased stock</p>
                                                </div>
                                            </div>

                                            {/* Top summary – only for purchase modal */}
                                            <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                                    <div>
                                                        <span className="font-semibold text-gray-900">Origin name:</span>{' '}
                                                        <span className="text-gray-700">{newLotForm.originName || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-semibold text-gray-900">Variety:</span>{' '}
                                                        <span className="text-gray-700">{newLotForm.variety || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-semibold text-gray-900">Process name:</span>{' '}
                                                        <span className="text-gray-700">{newLotForm.processType || '—'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-semibold text-gray-900">Producer:</span>{' '}
                                                        <span className="text-gray-700">{newLotForm.producerName || '—'}</span>
                                                    </div>
                                                    
                                                    <div>
                                                        <span className="font-semibold text-gray-900">Taste note:</span>{' '}
                                                        <span className="text-gray-700">{newLotForm.tasteNote || '—'}</span>
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <span className="font-semibold text-gray-900">Price:</span>{' '}
                                                        <span className="text-gray-700">
                                                            {newLotForm.pricePerKg ? `${parseFloat(newLotForm.pricePerKg).toFixed(2)} ${newLotForm.currency}` : '—'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Origin / Supplier</label>
                                                    <input className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3" value={newLotForm.originName} onChange={e=>setNewLotForm({...newLotForm, originName:e.target.value})} required/>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Producer</label>
                                                    <input className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3" value={newLotForm.producerName} onChange={e=>setNewLotForm({...newLotForm, producerName:e.target.value})} />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Variety</label>
                                                    <Select
                                                        value={newLotForm.variety}
                                                        onChange={(v) => setNewLotForm({ ...newLotForm, variety: (v as string) || '' })}
                                                        options={COFFEE_VARIETIES}
                                                        placeholder="Select variety..."
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Process Type</label>
                                                    <input className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3" value={newLotForm.processType} onChange={e=>setNewLotForm({...newLotForm, processType:e.target.value})} required/>
                                                </div>
                                                <div>
                                                    <DatePicker
                                                        value={newLotForm.purchaseDate}
                                                        onChange={(d) => setNewLotForm({ ...newLotForm, purchaseDate: d })}
                                                        label="Purchase Date"
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Initial Weight (kg)</label>
                                                    <input type="number" step="0.01" min="0.01" className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3" value={newLotForm.initialWeightKg} onChange={e=>setNewLotForm({...newLotForm, initialWeightKg:e.target.value})} required/>
                                                </div>
                                                                                                <div>
                                                                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Grade</label>
                                                                                                    <Select
                                                                                                        value={newLotForm.grade}
                                                                                                        onChange={(v) => setNewLotForm({ ...newLotForm, grade: (v as string) || '' })}
                                                                                                        options={[
                                                                                                            'Grade A',
                                                                                                            'Grade B',
                                                                                                            'Grade C',
                                                                                                            'Peaberry',
                                                                                                            'Screen 18',
                                                                                                            'Screen 17',
                                                                                                            'Screen 16',
                                                                                                            'Screen 15',
                                                                                                        ]}
                                                                                                        placeholder="Select grade..."
                                                                                                    />
                                                                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Price / kg</label>
                                                    <input type="number" step="0.01" min="0" className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3" value={newLotForm.pricePerKg} onChange={e=>setNewLotForm({...newLotForm, pricePerKg:e.target.value})}/>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Currency</label>
                                                    <Select
                                                        value={newLotForm.currency}
                                                        onChange={(v) => setNewLotForm({ ...newLotForm, currency: (v as string) || 'THB' })}
                                                        options={CURRENCY_OPTIONS}
                                                        placeholder="Select currency..."
                                                    />
                                                </div>
                                                
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Taste Note (optional)</label>
                                                    <input className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3" value={newLotForm.tasteNote} onChange={e=>setNewLotForm({...newLotForm, tasteNote:e.target.value})}/>
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Supplier Notes</label>
                                                    <textarea rows={3} className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3" value={newLotForm.supplierNotes} onChange={e=>setNewLotForm({...newLotForm, supplierNotes:e.target.value})}/>
                                                </div>
                                            </div>

                                            <div className="mt-6 flex justify-end gap-3">
                                                <Button type="button" variant="secondary" onClick={()=>setIsAddLotModalOpen(false)}>Cancel</Button>
                                                <Button type="submit" variant="success">Add Lot</Button>
                                            </div>
                                        </form>
            </Modal>
        </div>
    );
};

export default RoasterWorkbench;