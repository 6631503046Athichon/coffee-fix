
import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { ArrowLeft, User, MapPin, Weight, Calendar, Tag, Info, CheckCircle, Award, ExternalLink, Package, Coffee, Star } from 'lucide-react';
import { updateHarvestLot } from '../../services/harvestLotService';


const DetailItem: React.FC<{ icon: React.ElementType; label: string; value: string | number | React.ReactNode; }> = ({ icon: Icon, label, value }) => (
    <div className="flex items-start py-3">
        <Icon className="h-5 w-5 text-gray-400 mt-1 mr-4 flex-shrink-0" />
        <div>
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="mt-1 text-sm text-gray-900 font-semibold">{value}</p>
        </div>
    </div>
);

const TimelineStep: React.FC<{
    icon: React.ElementType;
    title: string;
    isComplete: boolean;
    children: React.ReactNode;
    details?: React.ReactNode;
    isOpen?: boolean;
    onToggle?: () => void;
    isLast?: boolean;
}> = ({ icon: Icon, title, isComplete, children, details, isOpen = false, onToggle, isLast = false }) => (
    <div className="relative flex items-start">
        {!isLast && <div className="absolute left-4 top-5 h-full w-0.5 bg-gray-200" />}
        <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white border-2 border-gray-300">
            {isComplete ? <CheckCircle className="h-5 w-5 text-green-500" /> : <Icon className="h-5 w-5 text-gray-400" />}
        </div>
        <div className="ml-4">
            <button
                type="button"
                onClick={onToggle}
                className={`text-left font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded ${isComplete ? 'text-gray-800' : 'text-gray-500'}`}
                aria-expanded={isOpen}
            >
                {title}
            </button>
            <div className="mt-1 text-sm text-gray-600">{children}</div>
            {isOpen && details && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                    {details}
                </div>
            )}
        </div>
    </div>
);

const HarvestLotDetail: React.FC = () => {
    const { lotId } = useParams<{ lotId: string }>();
    const navigate = useNavigate();
    const { data, setData } = useDataContext();
    const [openStep, setOpenStep] = useState<'harvested' | 'parchment' | 'greenBean' | 'qcScore' | null>(null);
    const isBindingFarmRef = useRef(false);

    const formatDate = (dateValue?: string | Date | null) => {
        if (!dateValue) return 'N/A';
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const lot = data.harvestLots.find(h => h.id === lotId);
    const plotLocation = lot?.farmPlotLocation?.trim().toLowerCase() || '';
    const farm = lot?.farm
        || data.farms.find(f => f.id === lot?.farmId)
        || data.farms.find(f => {
            if (!plotLocation) return false;
            const farmName = (f.farmName || f.name || '').trim().toLowerCase();
            const farmLocation = (f.location || '').trim().toLowerCase();
            return farmName === plotLocation || farmLocation === plotLocation;
        })
        || null;

    useEffect(() => {
        if (!lot || !farm || lot.farmId || isBindingFarmRef.current) return;
        isBindingFarmRef.current = true;
        updateHarvestLot(lot.id, { farmId: farm.id })
            .then(updated => {
                setData(prev => ({
                    ...prev,
                    harvestLots: prev.harvestLots.map(h => h.id === updated.id ? updated : h),
                }));
            })
            .catch(error => {
                console.error('Failed to bind farm to harvest lot:', error);
            })
            .finally(() => {
                isBindingFarmRef.current = false;
            });
    }, [farm, lot, setData]);

    if (!lot) {
        return (
            <div className="max-w-5xl mx-auto text-center">
                <h1 className="text-2xl font-bold">Harvest Lot Not Found</h1>
                <button onClick={() => navigate(-1)} className="mt-4 inline-flex items-center text-indigo-600 hover:text-indigo-800">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </button>
            </div>
        );
    }

    // --- Data Tracing ---
    const relatedBatches = data.processingBatches.filter(b => b.harvestLotId === lotId);
    const relatedParchmentLots = data.parchmentLots.filter(p => relatedBatches.some(b => b.id === p.processingBatchId));
    const relatedGreenBeanLots = data.greenBeanLots.filter(g => relatedParchmentLots.some(p => p.id === g.parchmentLotId));
    const mainGreenBeanLot = relatedGreenBeanLots.length > 0 ? relatedGreenBeanLots[0] : null;
    const qcGreenBeanLot = relatedGreenBeanLots.find(g => g.cuppingScores?.length || g.processorScore != null) || null;
    const qcLots = relatedGreenBeanLots.filter(g => g.cuppingScores?.length || g.processorScore != null);
    const qcScores = qcLots
        .map(g => (g.processorScore != null ? g.processorScore : g.cuppingScores?.[0]?.score))
        .filter((score): score is number => score != null);
    const qcAverage = qcScores.length > 0
        ? qcScores.reduce((sum, score) => sum + score, 0) / qcScores.length
        : null;
    const getCuppingDate = (greenBeanId: string, sessionId?: string) => {
        if (!sessionId) return 'N/A';
        const session = data.cuppingSessions.find(s => s.id === sessionId);
        if (!session) return 'N/A';
        const sample = session.samples?.find(s => s.greenBeanLotId === greenBeanId);
        if (!sample) return formatDate(session.date);
        return formatDate(session.date);
    };

    let cuppingResult: { totalScore: number; finalNotes: string; } | null = null;
    const cuppingScoreInfo = qcGreenBeanLot?.cuppingScores?.[0];
    if (qcGreenBeanLot && cuppingScoreInfo) {
        const session = data.cuppingSessions.find(s => s.id === cuppingScoreInfo.sessionId);
        const sample = session?.samples.find(s => s.greenBeanLotId === qcGreenBeanLot.id);
        if (session && sample && session.finalResults && session.finalResults[sample.id]) {
            cuppingResult = session.finalResults[sample.id];
        }
    }
    // --- End Data Tracing ---

    const statusBadge = (
        <span className={`px-3 py-1 inline-flex text-sm leading-5 font-medium rounded-full ${
            lot.status === 'Complete' ? 'bg-purple-100 text-purple-800'
            : 'bg-green-100 text-green-800'
        }`}>
            {lot.status}
        </span>
    );

    return (
        <div className="max-w-5xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800 mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
            </button>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-gray-200">
                        <div className="p-6 border-b border-gray-200">
                            <h1 className="text-2xl font-bold text-gray-900">Harvest Lot Details</h1>
                            <p className="text-gray-600 text-sm">Lot ID: {lot.displayId || lot.id.substring(0, 8).toUpperCase()}</p>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 divide-y md:divide-y-0">
                            <DetailItem icon={User} label="Farmer Name" value={lot.farmerName} />
                            <DetailItem icon={MapPin} label="Farm Name" value={farm?.farmName || farm?.name || 'N/A'} />
                            <DetailItem icon={Tag} label="Cherry Variety" value={lot.cherryVariety} />
                            <DetailItem icon={Weight} label="Weight (kg)" value={lot.weightKg} />
                            <DetailItem icon={MapPin} label="Farm Plot Location" value={lot.farmPlotLocation} />
                            <DetailItem icon={Calendar} label="Harvest Date" value={lot.harvestDate} />
                            <DetailItem icon={Info} label="Current Status" value={statusBadge} />
                        </div>
                    </div>
                    {cuppingResult && qcGreenBeanLot && (
                         <div className="bg-white shadow-sm rounded-xl border border-gray-200 mt-8">
                             <div className="p-6 border-b border-gray-200">
                                 <h2 className="text-xl font-bold text-gray-900 flex items-center"><Award className="text-amber-500 mr-2 h-6 w-6"/> Quality Results</h2>
                             </div>
                             <div className="p-6 flex flex-col md:flex-row items-center gap-6">
                                <div className="text-center">
                                    <p className="text-sm text-gray-600 uppercase font-semibold mb-2">Final Cupping Score</p>
                                    <p className="text-6xl font-bold text-indigo-600">{cuppingResult.totalScore.toFixed(2)}</p>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-gray-900 mb-2">Judge's Final Notes</h3>
                                    <blockquote className="bg-indigo-50 p-4 rounded-lg border-l-4 border-indigo-300 text-gray-700">
                                        "{cuppingResult.finalNotes}"
                                    </blockquote>
                                    <Link to={`/traceability/${qcGreenBeanLot.id}`} target="_blank" className="mt-4 inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                                        View Public Traceability Page <ExternalLink className="h-4 w-4 ml-1" />
                                    </Link>
                                </div>
                             </div>
                         </div>
                    )}
                </div>
                <div className="bg-white shadow-lg rounded-lg p-6">
                     <h2 className="text-lg font-bold text-gray-800 mb-4">Traceability Timeline</h2>
                     <div className="space-y-6">
                        <TimelineStep
                            icon={Calendar}
                            title="Harvested"
                            isComplete={true}
                            isOpen={openStep === 'harvested'}
                            onToggle={() => setOpenStep(prev => prev === 'harvested' ? null : 'harvested')}
                            details={(
                                <div className="space-y-1">
                                    <div><span className="font-semibold">Farm:</span> {farm?.farmName || farm?.name || 'N/A'}</div>
                                    <div><span className="font-semibold">Farmer:</span> {lot.farmerName}</div>
                                    <div><span className="font-semibold">Location:</span> {lot.farmPlotLocation}</div>
                                    <div><span className="font-semibold">Weight:</span> {lot.weightKg} kg</div>
                                    <div><span className="font-semibold">Status:</span> {lot.status}</div>
                                </div>
                            )}
                        >
                            {formatDate(lot.harvestDate)}
                        </TimelineStep>
                        <TimelineStep
                            icon={Package}
                            title="Parchment"
                            isComplete={relatedParchmentLots.length > 0}
                            isOpen={openStep === 'parchment'}
                            onToggle={() => setOpenStep(prev => prev === 'parchment' ? null : 'parchment')}
                            details={relatedParchmentLots.length > 0 ? (
                                <div className="space-y-2">
                                    {relatedParchmentLots.map((parchment, idx) => (
                                        <div key={parchment.id} className="rounded-md border border-gray-200 bg-white p-2">
                                            <div className="font-semibold">Lot ID: {parchment.displayId || parchment.id.substring(0, 8).toUpperCase()}</div>
                                            <div>Process: {parchment.processType}</div>
                                            <div>Weight: {parchment.currentWeightKg} kg</div>
                                            <div>Moisture: {parchment.moistureContent}%</div>
                                            <div>Status: {parchment.status}</div>
                                            <div>Date: {formatDate(parchment.createdAt)}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div>No parchment lots yet.</div>
                            )}
                        >
                            {relatedParchmentLots.length > 0
                                ? `${relatedParchmentLots[0].processType} - ${relatedParchmentLots[0].currentWeightKg} kg`
                                : 'Pending'}
                        </TimelineStep>
                        <TimelineStep
                            icon={Coffee}
                            title="Green Bean"
                            isComplete={relatedGreenBeanLots.length > 0}
                            isOpen={openStep === 'greenBean'}
                            onToggle={() => setOpenStep(prev => prev === 'greenBean' ? null : 'greenBean')}
                            details={relatedGreenBeanLots.length > 0 ? (
                                <div className="space-y-2">
                                    {relatedGreenBeanLots.map((greenBean, idx) => (
                                        <div key={greenBean.id} className="rounded-md border border-gray-200 bg-white p-2">
                                            <div className="font-semibold">Lot ID: {greenBean.displayId || greenBean.id.substring(0, 8).toUpperCase()}</div>
                                            <div>Grade: {greenBean.grade}</div>
                                            <div>Weight: {greenBean.currentWeightKg} kg</div>
                                            <div>Status: {greenBean.availabilityStatus}</div>
                                            <div>Date: {formatDate(greenBean.createdAt)}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div>No green bean lots yet.</div>
                            )}
                        >
                            {relatedGreenBeanLots.length > 0
                                ? `${relatedGreenBeanLots.map(g => g.grade).join(', ')} - ${relatedGreenBeanLots.reduce((sum, g) => sum + g.currentWeightKg, 0).toFixed(1)} kg`
                                : 'Pending'}
                        </TimelineStep>
                        <TimelineStep
                            icon={Star}
                            title="QC Score"
                            isComplete={
                                cuppingResult !== null
                                || (qcGreenBeanLot?.cuppingScores?.length ?? 0) > 0
                                || qcGreenBeanLot?.processorScore != null
                            }
                            isOpen={openStep === 'qcScore'}
                            onToggle={() => setOpenStep(prev => prev === 'qcScore' ? null : 'qcScore')}
                            details={(
                                <div className="space-y-2">
                                    {cuppingResult ? (
                                        <div className="space-y-1">
                                            <div><span className="font-semibold">Final Score:</span> {cuppingResult.totalScore.toFixed(2)} pts</div>
                                            <div><span className="font-semibold">Notes:</span> {cuppingResult.finalNotes || 'N/A'}</div>
                                        </div>
                                    ) : null}
                                    {qcLots.length > 0 ? (
                                        <div className="space-y-2">
                                            {qcLots.map((greenBean, idx) => (
                                                <div key={greenBean.id} className="rounded-md border border-gray-200 bg-white p-2">
                                                    <div className="font-semibold">Lot ID: {greenBean.displayId || greenBean.id.substring(0, 8).toUpperCase()}</div>
                                                    <div>Grade: {greenBean.grade}</div>
                                                    {greenBean.processorScore != null && (
                                                        <div>QC Score: {greenBean.processorScore.toFixed(1)} pts</div>
                                                    )}
                                                    {greenBean.cuppingScores?.[0]?.score != null && (
                                                        <div>Cupping Score: {greenBean.cuppingScores[0].score} pts</div>
                                                    )}
                                                    <div>
                                                        Date: {greenBean.cuppingScores?.[0]?.sessionId
                                                            ? getCuppingDate(greenBean.id, greenBean.cuppingScores[0].sessionId)
                                                            : formatDate(greenBean.updatedAt || greenBean.createdAt)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div>QC pending.</div>
                                    )}
                                </div>
                            )}
                            isLast
                        >
                            {cuppingResult
                                ? `${cuppingResult.totalScore.toFixed(2)} pts`
                                : qcAverage != null
                                    ? `${qcAverage.toFixed(1)} pts`
                                    : 'Pending'}
                        </TimelineStep>
                     </div>
                </div>
            </div>
        </div>
    );
};

export default HarvestLotDetail;
