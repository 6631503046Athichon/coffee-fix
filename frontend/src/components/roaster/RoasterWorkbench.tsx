import React, { useState, useMemo, useRef, useEffect } from 'react';
import DatePicker from '../common/DatePicker';
import Select from '../common/Select';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PageHeader } from '../common/PageHeader';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { User, GreenBeanLot, RoasterInventoryItem, RoastLevel, GreenBeanSourceType, UserRole } from '../../types';
import { PlusCircle, Package, Flame, Coffee, Loader2 } from 'lucide-react';
import ExternalLotsTable from './ExternalLotsTable';
import InternalLotsTable from './InternalLotsTable';
import RoastLogPanel from './RoastLogPanel';
import { toFixed2, clamp, toRoaId } from '../../utils/formatters';
import { claimGreenBeanLot, createRoastBatch } from '../../services/roasterService';
import { createGreenBeanLot } from '../../services/greenBeanLotService';
import { formatGreenBeanId } from '../../utils/formatDisplayId';
import { useToast } from '../../contexts/ToastContext';


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
    const { addToast } = useToast();

    const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
    const [isAddLotModalOpen, setIsAddLotModalOpen] = useState(false);
    const [isLogRoastModalOpen, setIsLogRoastModalOpen] = useState(false);
    const [isRoastingLotId, setIsRoastingLotId] = useState<string | null>(null);
    const [isSubmittingRoast, setIsSubmittingRoast] = useState(false);
    const [selectedExternalLot, setSelectedExternalLot] = useState<(GreenBeanLot & { variety: string; process: string }) | null>(null);
    const [selectedLot, setSelectedLot] = useState<(GreenBeanLot & { variety: string, process: string, finalScore?: string | number }) | null>(null);
    const [selectedInventoryItem, setSelectedInventoryItem] = useState<(RoasterInventoryItem & { variety: string, process: string }) | null>(null);
    const [claimAmount, setClaimAmount] = useState('');
    const [roastForm, setRoastForm] = useState({ batchSize: '', roastedWeight: '', notes: '', flavorNotes: '' });
    const [roastLevel, setRoastLevel] = useState<RoastLevel>(RoastLevel.Medium);
    const [selectedCategory, setSelectedCategory] = useState<keyof typeof FLAVOR_GROUPS>('Sweet');
    const [selectedNote, setSelectedNote] = useState<string>(FLAVOR_GROUPS['Sweet'][0]);
    const [selectedFlavorTags, setSelectedFlavorTags] = useState<string[]>([]);
    const availableLotsRef = useRef<HTMLDivElement>(null);
    const internalLotsRef = useRef<HTMLDivElement>(null);
    const [lotsTab, setLotsTab] = useState<'internal' | 'external'>('internal');
    const roastLogRef = useRef<HTMLDivElement>(null);

    // Add External Lot form state
    const [isAddingLot, setIsAddingLot] = useState(false);
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

    const isAdmin = currentUser.roles?.includes(UserRole.Admin);

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

    // Split into External and Internal lists (sorted by ID descending - newest first)
    const availableExternalLots = useMemo(() =>
        data.greenBeanLots
            .filter(lot => lot.availabilityStatus === 'Available' && lot.currentWeightKg > 0 && lot.sourceType === GreenBeanSourceType.External)
            .map(mapLotForDisplay)
            .sort((a, b) => b.id.localeCompare(a.id)),
        [data]
    );

    const availableInternalLots = useMemo(() =>
        data.greenBeanLots
            .filter(lot => lot.availabilityStatus === 'Available' && lot.currentWeightKg > 0 && lot.sourceType === GreenBeanSourceType.Internal)
            .map(mapLotForDisplay)
            .sort((a, b) => b.id.localeCompare(a.id)),
        [data]
    );

    const myInventory = useMemo(() =>
        data.roasterInventory
            .filter(item => {
                if (item.remainingWeightKg <= 0.01) return false;
                // Admins see all inventory; roasters see only their own
                return isAdmin || item.roasterId === currentUser.id;
            })
            .sort((a, b) => b.id.localeCompare(a.id)),
        [data.roasterInventory, currentUser.id, isAdmin]
    );

    const myRoasts = useMemo(() =>
        data.roastBatches
            .filter(roast => roast.roasterId === currentUser.id)
            .map(roast => {
                const gbl = data.greenBeanLots.find(lot => lot.id === roast.greenBeanLotId);
                const isExternal = gbl?.sourceType === GreenBeanSourceType.External;
                const formattedLotId = isExternal
                    ? toRoaId(roast.greenBeanLotId)
                    : formatGreenBeanId({ id: roast.greenBeanLotId, displayId: gbl?.displayId });
                return { ...roast, greenBeanDisplayId: gbl?.displayId, formattedLotId };
            })
            .sort((a, b) => new Date(b.roastDate).getTime() - new Date(a.roastDate).getTime()),
        [data.roastBatches, data.greenBeanLots, currentUser.id]
    );
    // Pagination for Roast Log
    const [page, setPage] = useState(1);
    const pageSize = 5;
    const totalPages = Math.max(1, Math.ceil(myRoasts.length / pageSize));
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [totalPages, page]);
    const pagedRoasts = useMemo(() => myRoasts.slice((page-1)*pageSize, (page-1)*pageSize + pageSize), [myRoasts, page]);

    // Pagination for Inventory (withdrawal lots)
    const [inventoryPage, setInventoryPage] = useState(1);
    const inventoryPageSize = 5;
    const inventoryTotalPages = Math.max(1, Math.ceil(myInventory.length / inventoryPageSize));
    useEffect(() => {
        if (inventoryPage > inventoryTotalPages) setInventoryPage(inventoryTotalPages);
    }, [inventoryTotalPages, inventoryPage]);
    const pagedInventory = useMemo(() => myInventory.slice((inventoryPage-1)*inventoryPageSize, (inventoryPage-1)*inventoryPageSize + inventoryPageSize), [myInventory, inventoryPage]);

    // Pagination for External Lots
    const [externalPage, setExternalPage] = useState(1);
    const externalPageSize = 5;
    const externalTotalPages = Math.max(1, Math.ceil(availableExternalLots.length / externalPageSize));
    useEffect(() => {
        if (externalPage > externalTotalPages) setExternalPage(externalTotalPages);
    }, [externalTotalPages, externalPage]);
    const pagedExternalLots = useMemo(() => availableExternalLots.slice((externalPage-1)*externalPageSize, (externalPage-1)*externalPageSize + externalPageSize), [availableExternalLots, externalPage]);

    // Pagination for Internal Lots
    const [internalPage, setInternalPage] = useState(1);
    const internalPageSize = 5;
    const internalTotalPages = Math.max(1, Math.ceil(availableInternalLots.length / internalPageSize));
    useEffect(() => {
        if (internalPage > internalTotalPages) setInternalPage(internalTotalPages);
    }, [internalTotalPages, internalPage]);
    const pagedInternalLots = useMemo(() => availableInternalLots.slice((internalPage-1)*internalPageSize, (internalPage-1)*internalPageSize + internalPageSize), [availableInternalLots, internalPage]);

    const openClaimModal = (lot: GreenBeanLot & { variety: string, process: string, finalScore?: string | number }) => {
        setSelectedLot(lot);
        setClaimAmount('');
        setIsClaimModalOpen(true);
    };

    const openLogRoastModal = (inventoryItem: RoasterInventoryItem & { variety: string, process: string }) => {
        setSelectedInventoryItem(inventoryItem);
    setRoastForm({ batchSize: '', roastedWeight: '', notes: '', flavorNotes: '' });
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


    const handleExternalRoast = (lot: GreenBeanLot & { variety: string; process: string }) => {
        // Open form instantly — no API call yet. We claim only the batch amount on submit.
        setSelectedExternalLot(lot);
        setSelectedInventoryItem(null);
        setRoastForm({ batchSize: '', roastedWeight: '', notes: '', flavorNotes: '' });
        setRoastLevel(RoastLevel.Medium);
        setSelectedFlavorTags([]);
        setSelectedCategory('Sweet');
        setSelectedNote(FLAVOR_GROUPS['Sweet'][0]);
        setIsLogRoastModalOpen(true);
    };

    const handleClaimSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const amount = parseFloat(claimAmount);
        if (!selectedLot || !amount || amount <= 0 || amount > selectedLot.currentWeightKg) {
            addToast({ type: 'error', message: 'จำนวนที่ Claim ไม่ถูกต้อง' });
            return;
        }
        try {
            const inventoryItem = await claimGreenBeanLot(selectedLot.id, amount);
            setData(prev => ({
                ...prev,
                roasterInventory: [...prev.roasterInventory, inventoryItem],
            }));
            addToast({ type: 'success', message: `Claim ${amount} kg สำเร็จ!` });
            setIsClaimModalOpen(false);
        } catch (err: any) {
            addToast({ type: 'error', message: err?.message || 'ไม่สามารถ Claim lot ได้' });
        }
    };

    const handleLogRoastSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const batchRaw = parseFloat(roastForm.batchSize);
        const roastedRaw = parseFloat(roastForm.roastedWeight);

        // ── External lot path: claim only the batch amount, then roast ──
        if (selectedExternalLot && !selectedInventoryItem) {
            if (isSubmittingRoast) return;
            if (!batchRaw || batchRaw <= 0) { addToast({ type: 'error', message: 'กรุณากรอก Batch Size ที่ถูกต้อง' }); return; }
            if (!roastedRaw || roastedRaw <= 0) { addToast({ type: 'error', message: 'กรุณากรอก Roasted Weight ที่ถูกต้อง' }); return; }
            if (batchRaw > selectedExternalLot.currentWeightKg) { addToast({ type: 'error', message: 'Batch เกิน น้ำหนักที่มี' }); return; }
            if (roastedRaw > batchRaw) { addToast({ type: 'error', message: 'Roasted Weight ต้องไม่เกิน Batch Size' }); return; }

            const batch = toFixed2(clamp(batchRaw, 0.01, selectedExternalLot.currentWeightKg));
            const roasted = toFixed2(clamp(roastedRaw, 0.01, batch));
            const yieldPct = toFixed2((roasted / batch) * 100);
            const weightLossPct = toFixed2(100 - yieldPct);

            try {
                setIsSubmittingRoast(true);
                setIsRoastingLotId(selectedExternalLot.id);
                // 1. Claim exactly the batch amount from the lot
                const inventoryItem = await claimGreenBeanLot(selectedExternalLot.id, batch);
                // 2. Create roast batch against that inventory item
                const { roastBatch } = await createRoastBatch({
                    roasterInventoryId: inventoryItem.id,
                    greenBeanLotId: selectedExternalLot.id,
                    batchSizeKg: batch,
                    yieldPercentage: yieldPct,
                    roastedWeightKg: roasted,
                    weightLossPct,
                    roastLevel: roastLevel,
                    roastProfileNotes: roastForm.notes?.trim() || 'No notes',
                    flavorNotes: selectedFlavorTags.join(', ') || undefined,
                });
                const newLotWeight = Math.max(0, selectedExternalLot.currentWeightKg - batch);
                setData(prev => ({
                    ...prev,
                    roastBatches: [...prev.roastBatches, { ...roastBatch, formattedLotId: toRoaId(selectedExternalLot.id) } as any],
                    roasterInventory: (() => {
                        // claim returns remainingWeightKg += batch, roast immediately deducts batch → net 0 change
                        const finalRemaining = inventoryItem.remainingWeightKg - batch;
                        const exists = prev.roasterInventory.find(i => i.id === inventoryItem.id);
                        if (exists) return prev.roasterInventory.map(i => i.id === inventoryItem.id ? { ...i, remainingWeightKg: finalRemaining } : i);
                        return [...prev.roasterInventory, { ...inventoryItem, remainingWeightKg: finalRemaining }];
                    })(),
                    greenBeanLots: prev.greenBeanLots.map(l =>
                        l.id === selectedExternalLot.id
                            ? { ...l, currentWeightKg: newLotWeight, availabilityStatus: newLotWeight <= 0 ? 'Sold' : 'Available' }
                            : l
                    ),
                }));
                addToast({ type: 'success', message: `บันทึก Roast Batch ${batch} kg สำเร็จ!` });
                setIsLogRoastModalOpen(false);
                setSelectedExternalLot(null);
            } catch (err: any) {
                addToast({ type: 'error', message: err?.message || 'ไม่สามารถบันทึก Roast Batch ได้' });
            } finally {
                setIsSubmittingRoast(false);
                setIsRoastingLotId(null);
            }
            return;
        }

        // ── Normal inventory path ──
        if (!selectedInventoryItem) return;
        if (isSubmittingRoast) return;

        if (!batchRaw || batchRaw <= 0) { addToast({ type: 'error', message: 'กรุณากรอก Batch Size ที่ถูกต้อง' }); return; }
        if (!roastedRaw || roastedRaw <= 0) { addToast({ type: 'error', message: 'กรุณากรอก Roasted Weight ที่ถูกต้อง' }); return; }
        if (batchRaw > selectedInventoryItem.remainingWeightKg) { addToast({ type: 'error', message: 'Batch เกิน inventory ที่มี' }); return; }
        if (roastedRaw > batchRaw) { addToast({ type: 'error', message: 'Roasted Weight ต้องไม่เกิน Batch Size' }); return; }

        const batch = toFixed2(clamp(batchRaw, 0.01, selectedInventoryItem.remainingWeightKg));
        const roasted = toFixed2(clamp(roastedRaw, 0.01, batch));
        const yieldPct = toFixed2((roasted / batch) * 100);
        const weightLossPct = toFixed2(100 - yieldPct);

        try {
            setIsSubmittingRoast(true);
            const { roastBatch, updatedInventory } = await createRoastBatch({
                roasterInventoryId: selectedInventoryItem.id,
                greenBeanLotId: selectedInventoryItem.greenBeanLotId,
                batchSizeKg: batch,
                yieldPercentage: yieldPct,
                roastedWeightKg: roasted,
                weightLossPct,
                roastLevel: roastLevel,
                roastProfileNotes: roastForm.notes?.trim() || 'No notes',
                flavorNotes: selectedFlavorTags.join(', ') || undefined,
            });
            setData(prev => ({
                ...prev,
                roastBatches: [...prev.roastBatches, roastBatch],
                roasterInventory: prev.roasterInventory.map(item =>
                    item.id === updatedInventory.id
                        ? { ...item, remainingWeightKg: updatedInventory.remainingWeightKg }
                        : item,
                ),
            }));
            addToast({ type: 'success', message: `บันทึก Roast Batch ${batch} kg สำเร็จ!` });
            setIsLogRoastModalOpen(false);
        } catch (err: any) {
            addToast({ type: 'error', message: err?.message || 'ไม่สามารถบันทึก Roast Batch ได้' });
        } finally {
            setIsSubmittingRoast(false);
        }
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
                    {/* Green Bean Lots - Tabbed View */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        {/* Tab Header */}
                        <div className="flex items-center border-b border-gray-200">
                            <button
                                ref={internalLotsRef as any}
                                onClick={() => setLotsTab('internal')}
                                className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                                    lotsTab === 'internal'
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <Package className="h-4 w-4" />
                                    Internal Lots
                                    <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                                        {availableInternalLots.length}
                                    </span>
                                </div>
                            </button>
                            <button
                                ref={availableLotsRef as any}
                                onClick={() => setLotsTab('external')}
                                className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                                    lotsTab === 'external'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <Package className="h-4 w-4" />
                                    Purchased Lots
                                    <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700">
                                        {availableExternalLots.length}
                                    </span>
                                </div>
                            </button>
                            {lotsTab === 'external' && (
                                <div className="px-4">
                                    <Button
                                        variant="success"
                                        size="sm"
                                        icon={<PlusCircle className="h-4 w-4" />}
                                        onClick={() => setIsAddLotModalOpen(true)}
                                    >
                                        Add Lot
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Tab Content */}
                        <div className="min-h-[400px]">
                            {lotsTab === 'internal' ? (
                                <InternalLotsTable
                                    lots={pagedInventory}
                                    onLogRoast={(lot) => openLogRoastModal(lot as any)}
                                    currentPage={inventoryPage}
                                    totalPages={inventoryTotalPages}
                                    onPageChange={setInventoryPage}
                                    hideHeader
                                />
                            ) : (
                                <ExternalLotsTable
                                    lots={pagedExternalLots as any}
                                    onRoast={(lot) => handleExternalRoast(lot as any)}
                                    onAddExternal={() => setIsAddLotModalOpen(true)}
                                    currentPage={externalPage}
                                    totalPages={externalTotalPages}
                                    onPageChange={setExternalPage}
                                    loadingLotId={isRoastingLotId}
                                    hideHeader
                                />
                            )}
                        </div>
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
                maxWidth="2xl"
            >
                {selectedLot && (
                    <form onSubmit={handleClaimSubmit}>
                        {/* Header */}
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-4 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl shadow-sm">
                                <Package className="h-8 w-8 text-green-600" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Claim Stock</h2>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    Transfer green beans to your inventory
                                </p>
                            </div>
                        </div>

                        {/* Lot Details Card */}
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-5 mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white text-sm font-mono font-bold text-gray-900 shadow-sm border border-gray-200" title={selectedLot.id}>
                                    {formatGreenBeanId(selectedLot)}
                                </span>
                                <span className={`px-3 py-1.5 text-xs font-semibold rounded-full ${
                                    selectedLot.finalScore !== 'N/A' && Number(selectedLot.finalScore) >= 85
                                        ? 'bg-purple-100 text-purple-800'
                                        : selectedLot.finalScore !== 'N/A' && Number(selectedLot.finalScore) >= 80
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-gray-100 text-gray-700'
                                }`}>
                                    Score: {selectedLot.finalScore}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Variety</p>
                                    <p className="text-base font-bold text-gray-900">{selectedLot.variety || 'N/A'}</p>
                                </div>
                                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Process</p>
                                    <p className="text-base font-bold text-gray-900">{selectedLot.process || 'N/A'}</p>
                                </div>
                                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Grade</p>
                                    <p className="text-base font-bold text-gray-900">{selectedLot.grade || 'N/A'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Available Stock Display */}
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-6 mb-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-green-800 mb-1">Available Stock</p>
                                    <p className="text-4xl font-bold text-green-700">{toFixed2(selectedLot.currentWeightKg)} <span className="text-2xl font-medium">kg</span></p>
                                </div>
                                <div className="p-3 bg-green-100 rounded-full">
                                    <Coffee className="h-8 w-8 text-green-600" />
                                </div>
                            </div>
                        </div>

                        {/* Claim Amount Input */}
                        <div className="mb-6">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Amount to Claim</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    max={selectedLot.currentWeightKg}
                                    value={claimAmount}
                                    onChange={e => setClaimAmount(e.target.value)}
                                    required
                                    className="w-full text-2xl font-bold text-gray-900 border-2 border-gray-200 rounded-xl px-5 py-4 pr-16 focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none transition-all"
                                    placeholder="0.00"
                                />
                                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-lg font-semibold text-gray-400">kg</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">Enter the amount you want to transfer to your roasting inventory</p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                            <Button
                                type="button"
                                variant="secondary"
                                size="lg"
                                onClick={() => setIsClaimModalOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="success"
                                size="lg"
                                icon={<Package className="h-5 w-5" />}
                            >
                                Claim Stock
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal
                isOpen={isLogRoastModalOpen && (!!selectedInventoryItem || !!selectedExternalLot)}
                onClose={() => { setIsLogRoastModalOpen(false); setSelectedExternalLot(null); setIsSubmittingRoast(false); }}
                maxWidth="2xl"
            >
                {(selectedInventoryItem || selectedExternalLot) && (() => {
                    const lotId = selectedInventoryItem?.greenBeanLotId ?? selectedExternalLot!.id;
                    const availableKg = selectedInventoryItem?.remainingWeightKg ?? selectedExternalLot!.currentWeightKg;
                    return (
                    <form onSubmit={handleLogRoastSubmit}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-orange-100 rounded-xl">
                                <Flame className="h-6 w-6 text-orange-600" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Log Roast</h2>
                                <p className="text-sm text-gray-500">Lot <span className="font-mono font-semibold text-gray-700">{toRoaId(lotId)}</span></p>
                            </div>
                        </div>

                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-orange-900">Available to Roast</p>
                                <p className="text-3xl font-bold text-orange-700">{toFixed2(availableKg)} kg</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-orange-600 uppercase tracking-wide font-medium">Lot ID</p>
                                <p className="text-lg font-mono font-bold text-orange-800">{toRoaId(lotId)}</p>
                            </div>
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
                                            max={availableKg}
                                            value={roastForm.batchSize}
                                            onChange={(e) => setRoastForm({ ...roastForm, batchSize: e.target.value })}
                                            onInvalid={(e) =>
                                                (e.currentTarget as HTMLInputElement).setCustomValidity(
                                                    `Batch size must be between 0.01 and ${availableKg.toFixed(2)} kg`
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
                                onClick={() => { setIsLogRoastModalOpen(false); setSelectedExternalLot(null); setIsSubmittingRoast(false); }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                disabled={isSubmittingRoast}
                                icon={isSubmittingRoast ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                                className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                            >
                                {isSubmittingRoast ? 'Saving…' : 'Log Roast'}
                            </Button>
                        </div>
                    </form>
                    );
                })()}
            </Modal>

            <Modal
                isOpen={isAddLotModalOpen}
                onClose={() => setIsAddLotModalOpen(false)}
                maxWidth="5xl"
            >
                                        <form
                                            onSubmit={async (e) => {
                                                e.preventDefault();
                                                const initial = parseFloat(newLotForm.initialWeightKg);
                                                const price = parseFloat(newLotForm.pricePerKg);
                                                if (!newLotForm.originName || !newLotForm.variety || !newLotForm.processType) return alert('Please fill origin, variety, and process type');
                                                if (!initial || initial <= 0) return alert('Initial weight must be > 0');
                                                if (isNaN(price)) return alert('Enter a valid price');

                                                try {
                                                    if (isAddingLot) return;
                                                    setIsAddingLot(true);
                                                    const lot = await createGreenBeanLot({
                                                        sourceType: 'External',
                                                        grade: newLotForm.grade || 'Grade A',
                                                        initialWeightKg: initial,
                                                        pricePerKg: isNaN(price) ? undefined : price,
                                                        currency: newLotForm.currency,
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
                                                    });
                                                    setData(prev => ({ ...prev, greenBeanLots: [lot, ...prev.greenBeanLots] }));
                                                    addToast({ type: 'success', message: `เพิ่ม External Lot สำเร็จ!` });
                                                    setIsAddLotModalOpen(false);
                                                    setNewLotForm({
                                                        originName: '', producerName: '', variety: '', processType: '', purchaseDate: new Date().toISOString().substring(0,10), pricePerKg: '', currency: 'THB', initialWeightKg: '', grade: 'Grade A', supplierNotes: '', tasteNote: ''
                                                    });
                                                } catch (err: any) {
                                                    addToast({ type: 'error', message: err?.message || 'ไม่สามารถเพิ่ม Lot ได้' });
                                                } finally {
                                                    setIsAddingLot(false);
                                                }
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
                                                    <Select
                                                        value={newLotForm.processType}
                                                        onChange={(v) => setNewLotForm({ ...newLotForm, processType: (v as string) || '' })}
                                                        options={data.processTypes.filter(pt => pt.isActive).map(pt => pt.name)}
                                                        placeholder="Select process type..."
                                                    />
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
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Price/kg (THB)</label>
                                                    <input type="number" step="0.01" min="0" className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3" value={newLotForm.pricePerKg} onChange={e=>setNewLotForm({...newLotForm, pricePerKg:e.target.value})}/>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Total Price (THB)</label>
                                                    <input
                                                        type="text"
                                                        readOnly
                                                        className="block w-full border-2 border-gray-200 bg-gray-50 rounded-xl py-2.5 px-3 font-semibold text-green-700"
                                                        value={
                                                            newLotForm.pricePerKg && newLotForm.initialWeightKg
                                                                ? (parseFloat(newLotForm.pricePerKg) * parseFloat(newLotForm.initialWeightKg)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                                : '0.00'
                                                        }
                                                    />
                                                </div>

                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Taste Note (optional)</label>
                                                    <input className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3" value={newLotForm.tasteNote} onChange={e=>setNewLotForm({...newLotForm, tasteNote:e.target.value})}/>
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Supplier Notes</label>
                                                    <textarea
                                                        rows={2}
                                                        className="block w-full border-2 border-gray-300 rounded-xl py-2.5 px-3 resize-none overflow-hidden"
                                                        value={newLotForm.supplierNotes}
                                                        onChange={e=>setNewLotForm({...newLotForm, supplierNotes:e.target.value})}
                                                        onInput={e => {
                                                            const el = e.currentTarget;
                                                            el.style.height = 'auto';
                                                            el.style.height = el.scrollHeight + 'px';
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="mt-6 flex justify-end gap-3">
                                                <Button type="button" variant="secondary" onClick={()=>setIsAddLotModalOpen(false)} disabled={isAddingLot}>Cancel</Button>
                                                <Button type="submit" variant="success" disabled={isAddingLot}>{isAddingLot ? 'Adding...' : 'Add Lot'}</Button>
                                            </div>
                                        </form>
            </Modal>
        </div>
    );
};

export default RoasterWorkbench;