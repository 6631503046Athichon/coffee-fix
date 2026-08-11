

import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useDataContext } from '@/hooks/useDataContext';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { SCA_ATTRIBUTES, User, CuppingSession } from '@/types';
import { Coffee, Thermometer, Droplets, Droplet, QrCode, Printer, Flame, Copy, Check } from 'lucide-react';
import { formatGreenBeanId } from '@/utils/formatDisplayId';

const FlavorProfileChart: React.FC<{ data: any[] }> = ({ data }) => (
    <ResponsiveContainer width="100%" height={300}>
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="attribute" tick={{ fill: '#4A5568', fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[6, 10]} tickCount={5} />
            <Radar name="Score" dataKey="score" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.6} />
        </RadarChart>
    </ResponsiveContainer>
);

const TraceabilityPage: React.FC = () => {
    const { lotId } = useParams<{ lotId: string }>();
    const { data } = useDataContext();
    const [isLinkCopied, setIsLinkCopied] = useState(false);

    const greenBeanLot = data.greenBeanLots.find(lot => lot.id === lotId);
    if (!greenBeanLot) return <div className="p-8 text-center"><h1>Lot not found</h1><p>The requested coffee lot could not be found.</p></div>;
    const displayLotId = formatGreenBeanId(greenBeanLot);

    const parchmentLot = data.parchmentLots.find(p => p.id === greenBeanLot.parchmentLotId);
    const processingBatch = data.processingBatches.find(b => b.id === parchmentLot?.processingBatchId);
    const harvestLot = data.harvestLots.find(h => h.id === parchmentLot?.harvestLotId);
    
    const scoreInfo = greenBeanLot.cuppingScores[0];
    let cuppingResult: NonNullable<CuppingSession['finalResults']>[string] | undefined;
    let cuppingScore: number | undefined;
    let cuppingNotes: string = '';
    
    if (scoreInfo) {
        const session = data.cuppingSessions.find(s => s.id === scoreInfo.sessionId);
        const sample = session?.samples.find(s => s.greenBeanLotId === greenBeanLot.id);
        if (session && sample && session.finalResults && session.finalResults[sample.id]) {
            cuppingResult = session.finalResults[sample.id];
            cuppingScore = cuppingResult.totalScore;
            cuppingNotes = cuppingResult.finalNotes;
        } else if (session && sample && session.scores[sample.id]) {
            // Fallback to individual scores if finalResults not available
            const scores = session.scores[sample.id];
            if (scores && scores.length > 0) {
                cuppingScore = scores[0].totalScore;
                cuppingNotes = scores[0].notes;
            }
        }
        // Final fallback to score on greenBeanLot
        if (cuppingScore == null && scoreInfo.score != null) {
            cuppingScore = scoreInfo.score;
        }
    }
    
    const roastBatches = useMemo(() => data.roastBatches.filter(rb => rb.greenBeanLotId === lotId), [data.roastBatches, lotId]);
    
    let roaster: User | undefined;
    if (roastBatches.length > 0) {
        const roasterId = roastBatches[0].roasterId;
        roaster = data.users.find(u => u.id === roasterId);
    }
    
    const flavorNotes = useMemo(() => {
        const allNotes = roastBatches.flatMap(rb => 
            rb.flavorNotes ? rb.flavorNotes.split(',').map(n => n.trim().toLowerCase()) : []
        );
        const uniqueNotes = [...new Set(allNotes)].filter(Boolean);
        // Capitalize first letter of each note for display
// fix: Add explicit string type to 'note' to resolve TS error.
        return uniqueNotes.map((note: string) => note.charAt(0).toUpperCase() + note.slice(1));
    }, [roastBatches]);

    const chartData = cuppingResult ? SCA_ATTRIBUTES.map(attr => ({
        attribute: attr.split('/')[0], // Shorten label
        score: cuppingResult.avgScores[attr] || 0,
        fullMark: 10,
    })) : [];

    const pageUrl = window.location.href;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pageUrl)}`;

    const handlePrint = () => {
        const qrCodeElement = document.getElementById('qr-code-container');
        if (qrCodeElement) {
            const printWindow = window.open('', '', 'height=400,width=400');
            if (printWindow) {
                printWindow.document.write('<html><head><title>Print QR Code</title></head><body style="text-align: center; margin-top: 50px;"></body></html>');
                printWindow.document.close();
                printWindow.document.body.appendChild(qrCodeElement.cloneNode(true));
                printWindow.focus();
                printWindow.print();
                printWindow.close();
            }
        }
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(pageUrl).then(() => {
            setIsLinkCopied(true);
            setTimeout(() => setIsLinkCopied(false), 2000); // Reset after 2 seconds
        });
    };
    
    const dryingDuration = processingBatch?.dryingStartDate && processingBatch?.dryingEndDate
        ? `${Math.round((new Date(processingBatch.dryingEndDate).getTime() - new Date(processingBatch.dryingStartDate).getTime()) / (1000 * 3600 * 24))} Days`
        : 'N/A';
    
    let avgTemp = 'N/A';
    let avgHumidity = 'N/A';
    let avgCoffeeMoisture = 'N/A';
    if (processingBatch?.dryingLog && processingBatch.dryingLog.length > 0) {
        const tempSum = processingBatch.dryingLog.reduce((sum, log) => sum + log.ambientTemp, 0);
        const humiditySum = processingBatch.dryingLog.reduce((sum, log) => sum + log.relativeHumidity, 0);
        const coffeeMoistureSum = processingBatch.dryingLog.reduce((sum, log) => sum + (log.moistureContent || 0), 0);
        avgTemp = `${(tempSum / processingBatch.dryingLog.length).toFixed(0)} C`;
        avgHumidity = `${(humiditySum / processingBatch.dryingLog.length).toFixed(0)}%`;
        if (coffeeMoistureSum > 0) {
            avgCoffeeMoisture = `${(coffeeMoistureSum / processingBatch.dryingLog.length).toFixed(0)}%`;
        }
    }
    // Fallback to batch or parchment lot moisture if dryingLog absent
    if (avgCoffeeMoisture === 'N/A') {
        if (processingBatch?.moistureContent != null) avgCoffeeMoisture = `${processingBatch.moistureContent}%`;
        else if (parchmentLot?.moistureContent != null) avgCoffeeMoisture = `${parchmentLot.moistureContent}%`;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-5xl mx-auto bg-white shadow-xl rounded-3xl overflow-hidden my-8">
                {/* Section 1: Introduction with Hero Image */}
                <div className="relative">
                    {/* Hero Image with Overlay Gradient */}
                    <div className="relative h-72 overflow-hidden">
                        <img
                            src="https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=1200&h=600&fit=crop"
                            alt="Coffee Farm"
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>

                        {/* Lot ID Badge on Image */}
                        <div className="absolute top-8 right-8 bg-white/95 backdrop-blur-sm px-5 py-2.5 rounded-full shadow-lg">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Lot</p>
                            <p className="text-xl font-extrabold text-indigo-600">{displayLotId}</p>
                        </div>

                        {/* Title Overlay */}
                        <div className="absolute bottom-0 left-0 right-0 px-8 pb-6 text-white">
                            <h1 className="text-4xl md:text-5xl font-black tracking-tight drop-shadow-lg">
                                {harvestLot?.cherryVariety || 'Specialty Coffee'}
                            </h1>
                            <p className="mt-2 text-lg font-medium text-gray-200 drop-shadow-md flex items-center gap-2">
                                <Coffee className="h-5 w-5" />
                                {harvestLot?.farmPlotLocation}
                            </p>
                        </div>
                    </div>

                {/* Content Section */}
                <div className="px-8 md:px-12 py-8">
                    {/* Flavor Notes Tags */}
                    {flavorNotes.length > 0 && (
                        <div className="mb-8">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Tasting Notes</p>
                            <div className="flex flex-wrap gap-2">
                                {flavorNotes.map(note => (
                                    <span
                                        key={note}
                                        className="px-4 py-2 bg-amber-100 text-amber-800 text-sm font-semibold rounded-full border border-amber-200"
                                    >
                                        {note}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Story Section */}
                    <div className="bg-indigo-50 rounded-2xl p-6 border-l-4 border-indigo-500">
                        <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <Coffee className="h-5 w-5 text-indigo-600" />
                            Origin Story
                        </h2>
                        <p className="text-gray-700 leading-relaxed text-sm">
                            This exceptional lot comes from <span className="font-bold text-indigo-700">{harvestLot?.farmerName}</span>, a dedicated producer whose commitment to quality shines through in every cup. Grown in the rich volcanic soils of <span className="font-semibold">{harvestLot?.farmPlotLocation}</span>, these {harvestLot?.cherryVariety} beans were carefully hand-picked and processed with meticulous attention to detail, resulting in a truly remarkable flavor experience.
                        </p>
                    </div>
                </div>
            </div>

            {/* Section 2: QR Code Share */}
            <div className="bg-gray-50 px-8 md:px-12 py-10 border-t border-gray-200">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 mb-2">
                        <QrCode className="h-6 w-6 text-gray-700" />
                        <h2 className="text-2xl font-bold text-gray-900">Share This Coffee's Story</h2>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row items-center justify-center gap-10 max-w-4xl mx-auto">
                    <div id="qr-code-container" className="flex-shrink-0">
                        <img 
                            src={qrCodeUrl}
                            alt={`QR Code for Lot ${displayLotId}`}
                            className="rounded-xl shadow-lg border-4 border-white w-48 h-48"
                        />
                    </div>
                    <div className="flex-1">
                        <p className="text-gray-600 text-sm leading-relaxed mb-5">
                            Roasters, add this QR code to your packaging to connect your customers directly to the farm-to-cup journey of this coffee. A simple scan with a smartphone camera will open this traceability page.
                        </p>
                        <div className="flex flex-col sm:flex-row items-stretch gap-3">
                            <button
                                onClick={handlePrint}
                                className="flex-1 inline-flex items-center justify-center rounded-lg border border-transparent bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
                            >
                                <Printer className="h-4 w-4 mr-2" />
                                Print QR Code
                            </button>
                            <button
                                onClick={handleCopyLink}
                                className="flex-1 inline-flex items-center justify-center rounded-lg border-2 border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
                            >
                                {isLinkCopied ? (
                                    <>
                                        <Check className="h-4 w-4 mr-2 text-green-500" />
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <Copy className="h-4 w-4 mr-2" />
                                        Copy Link
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 3: Journey from Farm */}
            <div className="bg-white px-8 md:px-12 py-10">
                <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">The Journey from the Farm</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                    {/* Origin Details Card */}
                    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden border border-gray-200">
                        <div className="bg-green-600 px-5 py-3">
                            <h3 className="font-bold text-white text-base flex items-center gap-2">
                                <Coffee className="h-4 w-4" />
                                Origin Details
                            </h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Producer</p>
                                <p className="text-base font-bold text-gray-900">{harvestLot?.farmerName}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Variety</p>
                                <p className="text-base font-bold text-gray-900">{harvestLot?.cherryVariety}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Harvest Date</p>
                                <p className="text-base font-bold text-gray-900">{harvestLot?.harvestDate}</p>
                            </div>
                        </div>
                    </div>

                    {/* Processing Details Card */}
                    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden border border-gray-200">
                        <div className="bg-blue-600 px-5 py-3">
                            <h3 className="font-bold text-white text-base flex items-center gap-2">
                                <Droplets className="h-4 w-4" />
                                Processing Details
                            </h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Method</p>
                                <p className="text-base font-bold text-gray-900">{processingBatch?.processType}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Drying Duration</p>
                                <p className="text-base font-bold text-gray-900">{dryingDuration}</p>
                            </div>
                            <div className="pt-2">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Averages During Drying</p>
                                <div className="flex items-center gap-4 flex-wrap">
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg border border-red-100">
                                        <Thermometer className="h-4 w-4 text-red-500" />
                                        <span className="text-[11px] font-semibold text-gray-600">Temperature</span>
                                        <span className="font-bold text-gray-900 text-sm" title="Average Ambient Temperature">{avgTemp}</span>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                                        <Droplets className="h-4 w-4 text-blue-500" />
                                        <span className="text-[11px] font-semibold text-gray-600">Ambient Humidity</span>
                                        <span className="font-bold text-gray-900 text-sm" title="Average Ambient Humidity">{avgHumidity}</span>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                                        <Droplet className="h-4 w-4 text-emerald-600" />
                                        <span className="text-[11px] font-semibold text-gray-600">Coffee Moisture</span>
                                        <span className="font-bold text-gray-900 text-sm" title="Average Coffee Moisture (Parchment)">{avgCoffeeMoisture}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 4: Quality in the Cup */}
            <div className="bg-gray-50 px-8 md:px-12 py-10 border-t border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Quality in the Cup</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
                    {/* Flavor Profile */}
                    {chartData.length > 0 ? (
                        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
                            <h3 className="font-bold text-gray-900 text-base mb-4 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                                Flavor Profile
                            </h3>
                            <FlavorProfileChart data={chartData} />
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
                            <h3 className="font-bold text-gray-900 text-base mb-4 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                                Processing Information
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                                    <span className="text-sm text-gray-600">Process Type</span>
                                    <span className="text-sm font-bold text-gray-900">{processingBatch?.processType || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                                    <span className="text-sm text-gray-600">Variety</span>
                                    <span className="text-sm font-bold text-gray-900">{harvestLot?.cherryVariety || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Origin</span>
                                    <span className="text-sm font-bold text-gray-900">{harvestLot?.farmPlotLocation || 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Score & Notes */}
                    <div className="space-y-6">
                        {/* Score Card */}
                        {cuppingScore && (
                            <div className="bg-indigo-600 rounded-xl p-6 text-center shadow-md">
                                <p className="text-xs font-bold text-indigo-200 uppercase tracking-wider mb-2">Final Cupping Score</p>
                                <p className="text-6xl font-black text-white mb-3">{cuppingScore.toFixed(2)}</p>
                                {cuppingScore >= 80 && (
                                    <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                                        <p className="font-semibold text-white text-sm">Specialty Grade</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Cupper's Notes */}
                        {cuppingNotes && (
                            <div className="bg-white rounded-xl p-5 shadow-md border border-gray-200">
                                <h3 className="font-bold text-gray-900 text-base mb-3 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-purple-600"></div>
                                    Cupper's Notes
                                </h3>
                                <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-500">
                                    <p className="text-gray-700 italic leading-relaxed text-sm">"{cuppingNotes}"</p>
                                </div>
                            </div>
                        )}
                        
                        {/* Grade Info */}
                        <div className="bg-white rounded-xl p-5 shadow-md border border-gray-200">
                            <h3 className="font-bold text-gray-900 text-base mb-3 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-600"></div>
                                Lot Information
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                                    <span className="text-sm text-gray-600">Grade</span>
                                    <span className="text-sm font-bold text-gray-900">{greenBeanLot.grade}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Available Stock</span>
                                    <span className="text-sm font-bold text-gray-900">{greenBeanLot.currentWeightKg.toFixed(2)} kg</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Section 5: Roaster Details */}
            {roastBatches.length > 0 && roaster && (
                <div className="bg-white px-8 md:px-12 py-10 border-t border-gray-200">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-full shadow-md mb-3">
                            <Flame className="h-5 w-5" />
                            <h2 className="text-lg font-bold">Roasted By</h2>
                        </div>
                        <p className="text-3xl font-black text-orange-600">
                            {roaster.name}
                        </p>
                    </div>

                    <div className="max-w-4xl mx-auto space-y-5">
                        {roastBatches.map(roast => (
                            <div key={roast.id} className="bg-gray-50 rounded-xl shadow-md overflow-hidden border border-gray-200">
                                {/* Header */}
                                <div className="bg-orange-100 px-5 py-3 border-b border-orange-200">
                                    <div className="flex justify-between items-center">
                                        <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                                            <Flame className="h-4 w-4 text-orange-600" />
                                            Roast Profile
                                        </h3>
                                        <div className="bg-white px-3 py-1 rounded-full shadow-sm">
                                            <p className="text-xs font-semibold text-gray-700">{roast.roastDate}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-5 space-y-4">
                                    {/* Roast Notes */}
                                    <div className="bg-amber-50 p-4 rounded-lg border-l-4 border-orange-500">
                                        <p className="text-gray-800 italic leading-relaxed text-sm">
                                            {roast.roastProfileNotes}
                                        </p>
                                    </div>

                                    {/* Flavor Notes */}
                                    {roast.flavorNotes && (
                                        <div className="space-y-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Flavor Notes</p>
                                            <div className="flex flex-wrap gap-2">
                                                {roast.flavorNotes.split(',').map(note => note.trim()).filter(Boolean).map((note, index) => (
                                                    <span key={index} className="px-3 py-1.5 bg-yellow-100 text-amber-800 text-xs font-semibold rounded-full border border-amber-200">
                                                        {note}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Stats */}
                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                        <div className="bg-white rounded-lg p-3 text-center border border-orange-200">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Batch Size</p>
                                            <p className="text-xl font-black text-orange-600">{roast.batchSizeKg} <span className="text-sm">kg</span></p>
                                        </div>
                                        <div className="bg-white rounded-lg p-3 text-center border border-amber-200">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Yield</p>
                                            <p className="text-xl font-black text-amber-600">{roast.yieldPercentage}<span className="text-sm">%</span></p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            </div>
        </div>
    );
};

export default TraceabilityPage;
