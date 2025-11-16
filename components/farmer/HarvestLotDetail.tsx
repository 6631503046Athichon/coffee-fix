
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDataContext } from '../../hooks/useDataContext';
import { ArrowLeft, User, MapPin, Weight, Calendar, Tag, Info, CheckCircle, Award, ExternalLink, Droplets, Sprout, Wind } from 'lucide-react';

const DetailItem: React.FC<{ icon: React.ElementType; label: string; value: string | number | React.ReactNode; }> = ({ icon: Icon, label, value }) => (
    <div className="flex items-start py-3">
        <Icon className="h-5 w-5 text-gray-400 mt-1 mr-4 flex-shrink-0" />
        <div>
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="mt-1 text-sm text-gray-900 font-semibold">{value}</p>
        </div>
    </div>
);

const TimelineStep: React.FC<{ icon: React.ElementType; title: string; isComplete: boolean; children: React.ReactNode; isLast?: boolean }> = ({ icon: Icon, title, isComplete, children, isLast = false }) => (
    <div className="relative flex items-start">
        {!isLast && <div className="absolute left-4 top-5 h-full w-0.5 bg-gray-200" />}
        <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white border-2 border-gray-300">
            {isComplete ? <CheckCircle className="h-5 w-5 text-green-500" /> : <Icon className="h-5 w-5 text-gray-400" />}
        </div>
        <div className="ml-4">
            <h4 className={`font-semibold ${isComplete ? 'text-gray-800' : 'text-gray-500'}`}>{title}</h4>
            <div className="mt-1 text-sm text-gray-600">{children}</div>
        </div>
    </div>
);

const HarvestLotDetail: React.FC = () => {
    const { lotId } = useParams<{ lotId: string }>();
    const { data } = useDataContext();

    const lot = data.harvestLots.find(h => h.id === lotId);
    if (!lot) {
        return (
            <div className="text-center">
                <h1 className="text-2xl font-bold">Harvest Lot Not Found</h1>
                <Link to="/farmer-dashboard" className="mt-4 inline-flex items-center text-indigo-600 hover:text-indigo-800">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Dashboard
                </Link>
            </div>
        );
    }
    
    // --- Data Tracing ---
    const relatedBatches = data.processingBatches.filter(b => b.harvestLotId === lotId);
    const completedBatch = relatedBatches.find(b => b.status === 'Completed');
    const relatedParchmentLots = data.parchmentLots.filter(p => relatedBatches.some(b => b.id === p.processingBatchId));
    const relatedGreenBeanLots = data.greenBeanLots.filter(g => relatedParchmentLots.some(p => p.id === g.parchmentLotId));
    const mainGreenBeanLot = relatedGreenBeanLots.length > 0 ? relatedGreenBeanLots[0] : null;

    let cuppingResult: { totalScore: number; finalNotes: string; } | null = null;
    if (mainGreenBeanLot) {
        const cuppingScoreInfo = mainGreenBeanLot.cuppingScores[0];
        if (cuppingScoreInfo) {
            const session = data.cuppingSessions.find(s => s.id === cuppingScoreInfo.sessionId);
            const sample = session?.samples.find(s => s.greenBeanLotId === mainGreenBeanLot.id);
            if (session && sample && session.finalResults && session.finalResults[sample.id]) {
                cuppingResult = session.finalResults[sample.id];
            }
        }
    }
    // --- End Data Tracing ---

    const statusBadge = (
        <span className={`px-3 py-1 inline-flex text-sm leading-5 font-medium rounded-full ${
            lot.status === 'Processing' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
        }`}>
            {lot.status}
        </span>
    );

    return (
        <div>
            <Link to="/farmer-dashboard" className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800 mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
            </Link>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-gray-200">
                        <div className="p-6 border-b border-gray-200">
                            <h1 className="text-2xl font-bold text-gray-900">Harvest Lot Details</h1>
                            <p className="text-gray-600 text-sm">Lot ID: {lot.id}</p>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 divide-y md:divide-y-0">
                            <DetailItem icon={User} label="Farmer Name" value={lot.farmerName} />
                            <DetailItem icon={Tag} label="Cherry Variety" value={lot.cherryVariety} />
                            <DetailItem icon={Weight} label="Weight (kg)" value={lot.weightKg} />
                            <DetailItem icon={MapPin} label="Farm Plot Location" value={lot.farmPlotLocation} />
                            <DetailItem icon={Calendar} label="Harvest Date" value={lot.harvestDate} />
                            <DetailItem icon={Info} label="Current Status" value={statusBadge} />
                        </div>
                    </div>
                    {cuppingResult && mainGreenBeanLot && (
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
                                    <Link to={`/traceability/${mainGreenBeanLot.id}`} target="_blank" className="mt-4 inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-700">
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
                        <TimelineStep icon={Calendar} title="Harvested" isComplete={true}>
                            {lot.harvestDate}
                        </TimelineStep>
                         <TimelineStep icon={Droplets} title="Processing" isComplete={relatedBatches.length > 0}>
                             {relatedBatches.length > 0 ? `${relatedBatches[0].processType} Process` : 'Pending'}
                         </TimelineStep>
                         <TimelineStep icon={Wind} title="Drying Completed" isComplete={!!completedBatch}>
                             {completedBatch ? `Bagged on ${completedBatch.baggingDate}` : 'In progress or pending'}
                         </TimelineStep>
                         <TimelineStep icon={Sprout} title="Milled to Green Bean" isComplete={!!mainGreenBeanLot}>
                             {mainGreenBeanLot ? `Lot ID: ${mainGreenBeanLot.id}` : 'Pending'}
                         </TimelineStep>
                         <TimelineStep icon={Award} title="Cupped & Scored" isComplete={!!cuppingResult} isLast>
                             {cuppingResult ? `Score: ${cuppingResult.totalScore.toFixed(2)}` : 'Pending'}
                         </TimelineStep>
                     </div>
                </div>
            </div>
        </div>
    );
};

export default HarvestLotDetail;
