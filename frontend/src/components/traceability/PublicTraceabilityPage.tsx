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
  const farmName = farm?.farmName || farm?.name || harvestLot?.farmPlotLocation || 'Farm Location';
  const farmMapEmbedUrl = farm?.latitude != null && farm?.longitude != null
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${farmName}, ${farm.latitude}, ${farm.longitude}`)}&z=17&output=embed`
    : farm?.location
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${farmName}, ${farm.location}`)}&z=17&output=embed`
      : undefined;

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center bg-white rounded-2xl shadow-md border border-gray-200 px-10 py-12">
          <Loader className="h-12 w-12 mx-auto text-indigo-600 animate-spin mb-4" />
          <p className="text-gray-600 font-medium">Loading traceability data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data || !lot) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md mx-auto bg-white rounded-2xl shadow-md border border-gray-200 p-8">
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

  const quickFacts = [
    {
      label: 'Origin',
      value: farm?.farmName || farm?.name || harvestLot?.farmPlotLocation || lot.externalSource?.originName,
    },
    {
      label: 'Variety',
      value: harvestLot?.cherryVariety || lot.externalSource?.variety,
    },
    {
      label: 'Process',
      value: parchmentLot?.processType || lot.externalSource?.processType,
    },
    {
      label: 'Grade',
      value: lot.grade,
    },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));

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

  const timelineItems = [
    {
      label: 'Harvested',
      date: harvestLot?.harvestDate,
      detail: harvestLot?.cherryVariety || 'Coffee cherries selected at origin',
      icon: Coffee,
      color: 'bg-green-600',
    },
    {
      label: 'Processed',
      date: parchmentLot?.createdAt,
      detail: parchmentLot?.processType || processingBatch?.processType || 'Processing completed',
      icon: Droplets,
      color: 'bg-blue-600',
    },
    {
      label: 'Dried',
      date: processingBatch?.dryingEndDate,
      detail: dryingDuration !== 'N/A' ? dryingDuration : 'Drying completed at origin',
      icon: Droplet,
      color: 'bg-teal-600',
    },
    {
      label: 'Roasted',
      date: roastBatches[0]?.roastDate,
      detail: roastBatches[0]?.roastLevel || 'Roast profile recorded',
      icon: Flame,
      color: 'bg-orange-600',
    },
  ].filter(item => item.date);

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
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10"></div>

            {/* Verified Badge */}
            <div className="absolute top-6 left-6 inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400"></div>
              <p className="text-[11px] font-bold text-white uppercase tracking-widest">Verified Traceability</p>
            </div>

            {/* Grade Badge */}
            <div className="absolute top-6 right-6 bg-white/95 backdrop-blur-sm px-5 py-2.5 rounded-2xl shadow-lg text-center">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Grade</p>
              <p className="text-xl font-extrabold text-indigo-600 leading-tight">{lot.grade}</p>
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
            {/* Quick Facts strip */}
            {quickFacts.length > 0 && (
              <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {quickFacts.map((fact) => (
                  <div
                    key={fact.label}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center sm:text-left"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{fact.label}</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-gray-900">{fact.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Flavor Notes Tags */}
            {flavorNotes.length > 0 && (
              <div>
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

          </div>
        </div>

        {/* Section 2: QR Code Share */}
        <div className="bg-white px-8 md:px-12 py-10">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 mb-2">
              <QrCode className="h-6 w-6 text-gray-700" />
              <h2 className="text-2xl font-bold text-gray-900">Share This Coffee's Story</h2>
            </div>
          </div>
          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-md border border-gray-200 p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-center gap-10">
              <div id="qr-code-container" className="flex-shrink-0">
                <img
                  src={qrCodeUrl}
                  alt="QR Code"
                  className="rounded-xl shadow-lg border-4 border-white ring-1 ring-gray-200 w-44 h-44"
                />
              </div>
              <div className="flex-1 text-center md:text-left">
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
                <div className="mt-5 flex items-center justify-center md:justify-start gap-2 text-xs text-gray-500">
                  <span className="font-semibold uppercase tracking-wider">Trace ID</span>
                  <span className="rounded-full bg-gray-50 px-3 py-1 font-mono text-gray-700 border border-gray-200">
                    {data.traceId}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Journey from Farm */}
        <div className="bg-white px-8 md:px-12 py-10">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-widest text-green-600">Origin to Table</p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">The Journey from the Farm</h2>
          </div>
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

          {farmMapEmbedUrl && (
            <div className="max-w-4xl mx-auto mt-8 overflow-hidden rounded-xl border border-gray-200 shadow-md">
              <div className="flex items-center justify-between gap-4 bg-green-600 px-5 py-3">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Coffee className="h-4 w-4" />
                  {farmName}
                </h3>
                {farm.googleMapsUrl && (
                  <a
                    href={farm.googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-white/90 hover:text-white hover:underline"
                  >
                    Open Google Maps
                  </a>
                )}
              </div>
              {farmMapEmbedUrl ? (
                <iframe
                  title="Farm location map"
                  src={farmMapEmbedUrl}
                  className="h-96 w-full border-0 md:h-[32rem]"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="px-5 pb-5 text-sm text-gray-600">
                  Open the Google Maps link above to view this farm location.
                </div>
              )}
            </div>
          )}

          {timelineItems.length > 0 && (
            <div className="max-w-4xl mx-auto mt-10">
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-wider text-teal-600">Traceability</p>
                <h3 className="mt-1 text-xl font-bold text-gray-900">From Farm to Cup</h3>
              </div>

              {/* Desktop: horizontal stepper */}
              <div className="relative hidden md:flex md:items-start md:justify-between">
                <div className="absolute left-0 right-0 top-6 h-0.5 bg-gray-200" />
                {timelineItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="relative z-10 flex flex-1 flex-col items-center px-2 text-center">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${item.color} text-white shadow-md ring-4 ring-white`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <h4 className="mt-3 font-bold text-gray-900 text-sm">{item.label}</h4>
                      <p className="mt-0.5 max-w-[10rem] text-xs text-gray-500">{item.detail}</p>
                      <time className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        {formatDate(item.date)}
                      </time>
                    </div>
                  );
                })}
              </div>

              {/* Mobile: stacked cards */}
              <div className="space-y-3 md:hidden">
                {timelineItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
                    >
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${item.color} text-white`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-gray-900">{item.label}</h4>
                        <p className="truncate text-sm text-gray-600">{item.detail}</p>
                      </div>
                      <time className="flex-shrink-0 whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600 border border-gray-200">
                        {formatDate(item.date)}
                      </time>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Quality in the Cup */}
        <div className="bg-white px-8 md:px-12 py-10">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Cupped & Certified</p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">Quality in the Cup</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Processing Info */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="bg-indigo-600 px-5 py-3">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Coffee className="h-4 w-4" />
                  Lot Information
                </h3>
              </div>
              <div className="p-5 space-y-3">
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
                  <span className="text-sm font-bold text-gray-900">
                    {typeof lot.currentWeightKg === 'number' ? `${lot.currentWeightKg.toFixed(2)} kg` : 'N/A'}
                  </span>
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

              <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                <div className="bg-teal-600 px-5 py-3">
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    <Droplet className="h-4 w-4" />
                    QC Flavor Profile
                  </h3>
                </div>
                <div className="p-5">
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
              </div>

              {lot.externalSource?.tasteNote && (
                <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                  <div className="bg-purple-600 px-5 py-3">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <Coffee className="h-4 w-4" />
                      Tasting Notes
                    </h3>
                  </div>
                  <div className="p-5">
                    <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-500">
                      <p className="text-gray-700 italic leading-relaxed text-sm">"{lot.externalSource.tasteNote}"</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 5: Roaster Details */}
        {roastBatches.length > 0 && (
          <div className="bg-white px-8 md:px-12 py-10">
            <div className="text-center mb-8">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-600">Roasted By</p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900">
                {roastBatches[0].roaster?.name || 'Our Expert Roasters'}
              </h2>
            </div>

            <div className="max-w-4xl mx-auto space-y-5">
              {roastBatches.slice(0, 3).map(roast => (
                <div key={roast.id} className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
                  <div className="bg-orange-600 px-5 py-3">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-white text-base flex items-center gap-2">
                        <Flame className="h-4 w-4" />
                        Roast Profile
                      </h3>
                      <div className="bg-white/20 px-3 py-1 rounded-full">
                        <p className="text-xs font-semibold text-white">{formatDate(roast.roastDate)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {roast.roastProfileNotes && (
                      <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-500">
                        <p className="text-gray-800 italic leading-relaxed text-sm">
                          {roast.roastProfileNotes}
                        </p>
                      </div>
                    )}

                    {roast.flavorNotes && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Flavor Notes</p>
                        <div className="flex flex-wrap gap-2">
                          {roast.flavorNotes.split(',').map((note: string) => note.trim()).filter(Boolean).map((note: string, index: number) => (
                            <span key={index} className="px-4 py-2 bg-amber-100 text-amber-800 text-sm font-semibold rounded-full border border-amber-200">
                              {note}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4 flex-wrap pt-2">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 rounded-lg border border-orange-100">
                        <Flame className="h-4 w-4 text-orange-600" />
                        <span className="text-[11px] font-semibold text-gray-600">Batch Size</span>
                        <span className="font-bold text-gray-900 text-sm">{roast.batchSizeKg} kg</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-100">
                        <Coffee className="h-4 w-4 text-amber-600" />
                        <span className="text-[11px] font-semibold text-gray-600">Yield</span>
                        <span className="font-bold text-gray-900 text-sm">{roast.yieldPercentage}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-gray-900 px-8 md:px-12 py-6 text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Coffee Lab Platform · Farm-to-Cup Traceability
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicTraceabilityPage;
