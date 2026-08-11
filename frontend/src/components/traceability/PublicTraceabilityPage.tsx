import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { Coffee, Thermometer, Droplets, Droplet, QrCode, Printer, Flame, Copy, Check, Loader, AlertCircle } from 'lucide-react';
import { getPublicTraceData, PublicTraceData } from '@/services/lots/greenBeanLotService';
import { formatDateDisplay } from '@/utils/formatters';

const SCA_ATTRIBUTES = [
  'Fragrance/Aroma',
  'Flavor',
  'Aftertaste',
  'Acidity',
  'Body',
  'Balance',
  'Uniformity',
  'Clean Cup',
  'Sweetness',
  'Overall'
];

const FlavorProfileChart: React.FC<{ data: any[]; totalScore?: number }> = ({
  data,
  totalScore,
}) => (
  <div>
    {typeof totalScore === 'number' && !Number.isNaN(totalScore) && (
      <div className="mb-3 text-center">
        <span className="inline-flex items-center rounded-full bg-teal-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
          QC {totalScore.toFixed(2)}
        </span>
      </div>
    )}
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="attribute" tick={{ fill: '#4A5568', fontSize: 12 }} />
        <PolarRadiusAxis angle={30} domain={[0, 10]} tickCount={6} />
        <Radar name="Score" dataKey="score" stroke="#0f766e" fill="#14b8a6" fillOpacity={0.55} />
      </RadarChart>
    </ResponsiveContainer>
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {data.map((item) => (
        <div key={item.attribute} className="flex items-center justify-between">
          <span className="text-gray-600">{item.attribute}</span>
          <span className="font-semibold text-gray-900">
            {item.score.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  </div>
);

const PublicTraceabilityPage: React.FC = () => {
  const { publicId } = useParams<{ publicId: string }>();
  const [data, setData] = useState<PublicTraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!publicId) {
        setError('Invalid trace ID');
        setLoading(false);
        return;
      }

      try {
        const result = await getPublicTraceData(publicId);
        setData(result);
      } catch (err: any) {
        setError(err.message || 'Coffee lot not found');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [publicId]);

  // Extract data (must be before early returns to keep hooks order consistent)
  const lot = data?.lot;
  const parchmentLot = lot?.parchmentLot;
  const processingBatch = parchmentLot?.processingBatch;
  const harvestLot = parchmentLot?.harvestLot;
  const farm = processingBatch?.harvestLot?.farm;
  const roastBatches = lot?.roastBatches || [];
  const cuppingScore = lot?.cuppingScores?.[0]?.score;

  // Flavor notes from roast batches (useMemo must be called before early returns)
  const flavorNotes = useMemo(() => {
    const allNotes = roastBatches.flatMap(rb =>
      rb.flavorNotes ? rb.flavorNotes.split(',').map((n: string) => n.trim().toLowerCase()) : []
    );
    const uniqueNotes = [...new Set(allNotes)].filter(Boolean);
    return uniqueNotes.map((note: string) => note.charAt(0).toUpperCase() + note.slice(1));
  }, [roastBatches]);

  const radarData = useMemo(() => {
    if (!lot) return [];
    const valueMap: Record<string, number | undefined> = {
      'Fragrance/Aroma': lot.cuppingFragrance,
      Flavor: lot.cuppingFlavor,
      Aftertaste: lot.cuppingAftertaste,
      Acidity: lot.cuppingAcidity,
      Body: lot.cuppingBody,
      Balance: lot.cuppingBalance,
      Uniformity: lot.cuppingUniformity,
      'Clean Cup': lot.cuppingCleanCup,
      Sweetness: lot.cuppingSweetness,
      Overall: lot.cuppingOverall,
    };

    return SCA_ATTRIBUTES.map((attribute) => {
      const rawValue = valueMap[attribute];
      const score = typeof rawValue === 'number' && !Number.isNaN(rawValue)
        ? Math.max(0, Math.min(10, rawValue))
        : 0;
      return { attribute, score };
    });
  }, [lot]);

  const hasDetailedScores = useMemo(
    () => radarData.some((item) => item.score > 0),
    [radarData],
  );

  const qcTotalScore = useMemo(() => {
    if (typeof cuppingScore === 'number' && !Number.isNaN(cuppingScore)) {
      return cuppingScore;
    }
    if (!hasDetailedScores) return undefined;
    const total = radarData.reduce((sum, item) => sum + item.score, 0);
    return total > 0 ? total : undefined;
  }, [cuppingScore, hasDetailedScores, radarData]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-12 w-12 mx-auto text-indigo-600 animate-spin mb-4" />
          <p className="text-gray-600">Loading traceability data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data || !lot) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <AlertCircle className="h-16 w-16 mx-auto text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Lot Not Found</h1>
          <p className="text-gray-600">
            {error || 'The requested coffee lot could not be found. The QR code may be invalid or expired.'}
          </p>
        </div>
      </div>
    );
  }

  // Drying metrics
  const dryingDuration = processingBatch?.dryingStartDate && processingBatch?.dryingEndDate
    ? `${Math.round((new Date(processingBatch.dryingEndDate).getTime() - new Date(processingBatch.dryingStartDate).getTime()) / (1000 * 3600 * 24))} Days`
    : 'N/A';

  let avgTemp = 'N/A';
  let avgHumidity = 'N/A';
  let avgCoffeeMoisture = 'N/A';

  if (processingBatch?.dryingLogs && processingBatch.dryingLogs.length > 0) {
    const logs = processingBatch.dryingLogs;
    const tempSum = logs.reduce((sum: number, log: any) => sum + log.ambientTemp, 0);
    const humiditySum = logs.reduce((sum: number, log: any) => sum + log.relativeHumidity, 0);
    const moistureSum = logs.reduce((sum: number, log: any) => sum + (log.moistureContent || 0), 0);
    avgTemp = `${(tempSum / logs.length).toFixed(0)}°C`;
    avgHumidity = `${(humiditySum / logs.length).toFixed(0)}%`;
    if (moistureSum > 0) {
      avgCoffeeMoisture = `${(moistureSum / logs.length).toFixed(0)}%`;
    }
  }

  if (avgCoffeeMoisture === 'N/A' && parchmentLot?.moistureContent != null) {
    avgCoffeeMoisture = `${parchmentLot.moistureContent}%`;
  }

  const escapeHtml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const pageUrl = window.location.href;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pageUrl)}`;

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=500,width=500');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Print QR Code</title>
            <style>
              body {
                text-align: center;
                padding: 40px;
                font-family: system-ui, -apple-system, sans-serif;
              }
              img {
                width: 300px;
                height: 300px;
                border: 2px solid #333;
                border-radius: 8px;
              }
              p {
                margin-top: 20px;
                font-size: 12px;
                color: #666;
                word-break: break-all;
              }
            </style>
          </head>
          <body>
            <img id="qr-img" src="${escapeHtml(qrCodeUrl)}" alt="QR Code" onload="window.print(); window.close();" />
            <p>${escapeHtml(pageUrl)}</p>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(pageUrl).then(() => {
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
    });
  };

  const formatDate = (date?: string | Date | null) =>
    formatDateDisplay(date, undefined, 'N/A', 'en-US');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto bg-white shadow-xl rounded-3xl overflow-hidden my-8">
        {/* Section 1: Introduction with Hero Image */}
        <div className="relative">
          <div className="relative h-72 overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=1200&h=600&fit=crop"
              alt="Coffee Farm"
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>

            {/* Grade Badge */}
            <div className="absolute top-8 right-8 bg-white/95 backdrop-blur-sm px-5 py-2.5 rounded-full shadow-lg">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Grade</p>
              <p className="text-xl font-extrabold text-indigo-600">{lot.grade}</p>
            </div>

            {/* Title Overlay */}
            <div className="absolute bottom-0 left-0 right-0 px-8 pb-6 text-white">
              <h1 className="text-4xl md:text-5xl font-black tracking-tight drop-shadow-lg">
                {harvestLot?.cherryVariety || lot.externalSource?.variety || 'Specialty Coffee'}
              </h1>
              <p className="mt-2 text-lg font-medium text-gray-200 drop-shadow-md flex items-center gap-2">
                <Coffee className="h-5 w-5" />
                {farm?.farmName || harvestLot?.farmPlotLocation || lot.externalSource?.originName || 'Origin'}
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
                {lot.sourceType === 'External' ? (
                  <>
                    This exceptional lot comes from <span className="font-bold text-indigo-700">{lot.externalSource?.originName || 'a trusted supplier'}</span>.
                    {lot.externalSource?.variety && ` The ${lot.externalSource.variety} beans were`}
                    {lot.externalSource?.processType && ` processed using the ${lot.externalSource.processType} method,`}
                    {' '}resulting in a truly remarkable flavor experience.
                  </>
                ) : (
                  <>
                    This exceptional lot comes from <span className="font-bold text-indigo-700">{harvestLot?.farmerName || 'a dedicated producer'}</span>, a dedicated producer whose commitment to quality shines through in every cup. Grown in the rich soils of <span className="font-semibold">{harvestLot?.farmPlotLocation || farm?.location || 'our partner farm'}</span>, these {harvestLot?.cherryVariety || ''} beans were carefully hand-picked and processed with meticulous attention to detail, resulting in a truly remarkable flavor experience.
                  </>
                )}
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
                alt="QR Code"
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
                  <p className="text-base font-bold text-gray-900">
                    {farm?.farmName
                      || farm?.name
                      || harvestLot?.farmPlotLocation
                      || harvestLot?.farmerName
                      || lot.externalSource?.producerName
                      || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Variety</p>
                  <p className="text-base font-bold text-gray-900">
                    {harvestLot?.cherryVariety || lot.externalSource?.variety || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Harvest Date</p>
                  <p className="text-base font-bold text-gray-900">
                    {formatDate(harvestLot?.harvestDate) || formatDate(lot.externalSource?.purchaseDate)}
                  </p>
                </div>
                {farm?.altitude && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Altitude</p>
                    <p className="text-base font-bold text-gray-900">{farm.altitude}</p>
                  </div>
                )}
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
                  <p className="text-base font-bold text-gray-900">
                    {parchmentLot?.processType || lot.externalSource?.processType || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Drying Duration</p>
                  <p className="text-base font-bold text-gray-900">{dryingDuration}</p>
                </div>
                {(avgTemp !== 'N/A' || avgHumidity !== 'N/A' || avgCoffeeMoisture !== 'N/A') && (
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Averages During Drying</p>
                    <div className="flex items-center gap-4 flex-wrap">
                      {avgTemp !== 'N/A' && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg border border-red-100">
                          <Thermometer className="h-4 w-4 text-red-500" />
                          <span className="text-[11px] font-semibold text-gray-600">Temp</span>
                          <span className="font-bold text-gray-900 text-sm">{avgTemp}</span>
                        </div>
                      )}
                      {avgHumidity !== 'N/A' && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                          <Droplets className="h-4 w-4 text-blue-500" />
                          <span className="text-[11px] font-semibold text-gray-600">Humidity</span>
                          <span className="font-bold text-gray-900 text-sm">{avgHumidity}</span>
                        </div>
                      )}
                      {avgCoffeeMoisture !== 'N/A' && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                          <Droplet className="h-4 w-4 text-emerald-600" />
                          <span className="text-[11px] font-semibold text-gray-600">Moisture</span>
                          <span className="font-bold text-gray-900 text-sm">{avgCoffeeMoisture}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Quality in the Cup */}
        <div className="bg-gray-50 px-8 md:px-12 py-10 border-t border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Quality in the Cup</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Processing Info */}
            <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
              <h3 className="font-bold text-gray-900 text-base mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                Lot Information
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Process Type</span>
                  <span className="text-sm font-bold text-gray-900">
                    {parchmentLot?.processType || lot.externalSource?.processType || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Variety</span>
                  <span className="text-sm font-bold text-gray-900">
                    {harvestLot?.cherryVariety || lot.externalSource?.variety || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Grade</span>
                  <span className="text-sm font-bold text-gray-900">{lot.grade}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Available Stock</span>
                  <span className="text-sm font-bold text-gray-900">{lot.currentWeightKg.toFixed(2)} kg</span>
                </div>
              </div>
            </div>

            {/* Score */}
            <div className="space-y-6">
              {cuppingScore && (
                <div className="bg-indigo-600 rounded-xl p-6 text-center shadow-md">
                  <p className="text-xs font-bold text-indigo-200 uppercase tracking-wider mb-2">Cupping Score</p>
                  <p className="text-6xl font-black text-white mb-3">{cuppingScore.toFixed(2)}</p>
                  {cuppingScore >= 80 && (
                    <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                      <p className="font-semibold text-white text-sm">Specialty Grade</p>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-white rounded-xl p-5 shadow-md border border-gray-200">
                <h3 className="font-bold text-gray-900 text-base mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-teal-600"></div>
                  QC Flavor Profile
                </h3>
                {hasDetailedScores ? (
                  <FlavorProfileChart
                    data={radarData}
                    totalScore={qcTotalScore}
                  />
                ) : (
                  <p className="text-sm text-gray-600">
                    Detailed QC scores are not available for this lot yet.
                  </p>
                )}
              </div>

              {lot.externalSource?.tasteNote && (
                <div className="bg-white rounded-xl p-5 shadow-md border border-gray-200">
                  <h3 className="font-bold text-gray-900 text-base mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-600"></div>
                    Tasting Notes
                  </h3>
                  <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-500">
                    <p className="text-gray-700 italic leading-relaxed text-sm">"{lot.externalSource.tasteNote}"</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 5: Roaster Details */}
        {roastBatches.length > 0 && (
          <div className="bg-white px-8 md:px-12 py-10 border-t border-gray-200">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-full shadow-md mb-3">
                <Flame className="h-5 w-5" />
                <h2 className="text-lg font-bold">Roasted By</h2>
              </div>
              <p className="text-3xl font-black text-orange-600">
                {roastBatches[0].roaster?.name || 'Our Expert Roasters'}
              </p>
            </div>

            <div className="max-w-4xl mx-auto space-y-5">
              {roastBatches.slice(0, 3).map(roast => (
                <div key={roast.id} className="bg-gray-50 rounded-xl shadow-md overflow-hidden border border-gray-200">
                  <div className="bg-orange-100 px-5 py-3 border-b border-orange-200">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                        <Flame className="h-4 w-4 text-orange-600" />
                        Roast Profile
                      </h3>
                      <div className="bg-white px-3 py-1 rounded-full shadow-sm">
                        <p className="text-xs font-semibold text-gray-700">{formatDate(roast.roastDate)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {roast.roastProfileNotes && (
                      <div className="bg-amber-50 p-4 rounded-lg border-l-4 border-orange-500">
                        <p className="text-gray-800 italic leading-relaxed text-sm">
                          {roast.roastProfileNotes}
                        </p>
                      </div>
                    )}

                    {roast.flavorNotes && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Flavor Notes</p>
                        <div className="flex flex-wrap gap-2">
                          {roast.flavorNotes.split(',').map((note: string) => note.trim()).filter(Boolean).map((note: string, index: number) => (
                            <span key={index} className="px-3 py-1.5 bg-yellow-100 text-amber-800 text-xs font-semibold rounded-full border border-amber-200">
                              {note}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

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

export default PublicTraceabilityPage;
