import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { Coffee, Thermometer, Droplets, Droplet, QrCode, Printer, Flame, Copy, Check, Loader, AlertCircle, MapPin } from 'lucide-react';
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
        <span className="inline-flex items-center rounded-full bg-coffee-600 px-3 py-1 text-xs font-bold text-white">
          QC {totalScore.toFixed(2)}
        </span>
      </div>
    )}
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
        <PolarGrid stroke="#dcc4b6" />
        <PolarAngleAxis dataKey="attribute" tick={{ fill: '#8d5540', fontSize: 12 }} />
        <PolarRadiusAxis angle={30} domain={[0, 10]} tickCount={6} tick={{ fill: '#c6a28f', fontSize: 10 }} />
        <Radar name="Score" dataKey="score" stroke="#723e29" fill="#a9705a" fillOpacity={0.5} />
      </RadarChart>
    </ResponsiveContainer>
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {data.map((item) => (
        <div key={item.attribute} className="flex items-center justify-between">
          <span className="text-coffee-500">{item.attribute}</span>
          <span className="font-semibold text-coffee-900">
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
      <div className="min-h-screen bg-coffee-100 flex items-center justify-center px-4">
        <div className="text-center bg-white rounded-2xl border border-coffee-200 px-10 py-12">
          <Loader className="h-12 w-12 mx-auto text-coffee-600 animate-spin mb-4" />
          <p className="text-coffee-700 font-medium">Loading traceability data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data || !lot) {
    return (
      <div className="min-h-screen bg-coffee-100 flex items-center justify-center px-4">
        <div className="text-center max-w-md mx-auto bg-white rounded-2xl border border-coffee-200 p-8">
          <AlertCircle className="h-16 w-16 mx-auto text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-coffee-950 mb-2">Lot Not Found</h1>
          <p className="text-coffee-700">
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

  // Stage colours follow the bean itself getting darker: cherry -> parchment -> dried -> roasted
  const timelineItems = [
    {
      label: 'Harvested',
      date: harvestLot?.harvestDate,
      detail: harvestLot?.cherryVariety || 'Coffee cherries selected at origin',
      icon: Coffee,
      color: 'bg-coffee-400',
    },
    {
      label: 'Processed',
      date: parchmentLot?.createdAt,
      detail: parchmentLot?.processType || processingBatch?.processType || 'Processing completed',
      icon: Droplets,
      color: 'bg-coffee-500',
    },
    {
      label: 'Dried',
      date: processingBatch?.dryingEndDate,
      detail: dryingDuration !== 'N/A' ? dryingDuration : 'Drying completed at origin',
      icon: Droplet,
      color: 'bg-coffee-600',
    },
    {
      label: 'Roasted',
      date: roastBatches[0]?.roastDate,
      detail: roastBatches[0]?.roastLevel || 'Roast profile recorded',
      icon: Flame,
      color: 'bg-coffee-900',
    },
  ].filter(item => item.date);

  return (
    <div className="min-h-screen bg-coffee-100">
      <div className="max-w-5xl mx-auto animate-fade-in overflow-hidden rounded-3xl bg-white shadow-xl my-8">
        {/* Section 1: Introduction with Hero Image */}
        <div className="relative">
          <div className="relative h-80 overflow-hidden sm:h-96">
            <img
              src="https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=1200&h=600&fit=crop"
              alt="Coffee Farm"
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10"></div>

            {/* Verified Badge */}
            <div className="absolute top-6 left-6 inline-flex items-center gap-1.5 rounded-full border border-white/50 bg-black/55 px-3.5 py-1.5 backdrop-blur-md">
              <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-white">Verified Traceability</p>
            </div>

            {/* Grade Seal */}
            <div className="absolute top-6 right-6 flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-white bg-white text-center shadow-lg">
              <p className="text-[8px] font-bold uppercase tracking-wider text-gray-500">Grade</p>
              <p className="text-lg font-extrabold leading-none text-gray-900">{lot.grade}</p>
            </div>

            {/* Title Overlay */}
            <div className="absolute bottom-0 left-0 right-0 px-8 pb-7">
              <div className="max-w-3xl rounded-xl bg-black/35 px-5 py-4 backdrop-blur-[2px]">
              <h1 className="text-4xl font-black tracking-tight text-white drop-shadow-lg md:text-5xl">
                {harvestLot?.cherryVariety || lot.externalSource?.variety || 'Specialty Coffee'}
              </h1>
              <p className="mt-2 flex items-center gap-2 text-lg font-medium text-white drop-shadow-md">
                <Coffee className="h-5 w-5 text-white" />
                {farm?.farmName || harvestLot?.farmPlotLocation || lot.externalSource?.originName || 'Origin'}
              </p>
              </div>
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
                    className="rounded-xl border border-coffee-100 bg-coffee-50 px-4 py-3 text-center sm:text-left"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-coffee-400">{fact.label}</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-coffee-900">{fact.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Flavor Notes Tags */}
            {flavorNotes.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-coffee-500">Tasting Notes</p>
                <div className="flex flex-wrap gap-2">
                  {flavorNotes.map(note => (
                    <span
                      key={note}
                      className="rounded-full border border-coffee-200 bg-coffee-100 px-4 py-2 text-sm font-semibold text-coffee-700"
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
        <div className="px-8 md:px-12 py-10">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 mb-2">
              <QrCode className="h-6 w-6 text-coffee-600" />
              <h2 className="text-2xl font-bold text-coffee-950">Share This Coffee's Story</h2>
            </div>
            <p className="mx-auto max-w-xl text-sm text-coffee-500">
              Scan or share this page to see where the coffee came from and how it was prepared.
            </p>
          </div>
          <div className="mx-auto max-w-4xl rounded-2xl border border-coffee-100 bg-coffee-50 p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-center gap-10">
              <div id="qr-code-container" className="flex-shrink-0">
                <img
                  src={qrCodeUrl}
                  alt="QR Code"
                  className="h-44 w-44 rounded-xl border-4 border-white ring-1 ring-coffee-200"
                />
              </div>
              <div className="flex-1 text-center md:text-left">
                <p className="mb-5 text-sm leading-relaxed text-coffee-700">
                  Roasters, add this QR code to your packaging to connect your customers directly to the farm-to-cup journey of this coffee. A simple scan with a smartphone camera will open this traceability page.
                </p>
                <div className="flex flex-col sm:flex-row items-stretch gap-3">
                  <button
                    onClick={handlePrint}
                    className="flex-1 inline-flex items-center justify-center rounded-lg bg-coffee-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-coffee-700"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Print QR Code
                  </button>
                  <button
                    onClick={handleCopyLink}
                    className="flex-1 inline-flex items-center justify-center rounded-lg border border-coffee-200 bg-white px-5 py-2.5 text-sm font-semibold text-coffee-700 transition-colors hover:bg-coffee-100"
                  >
                    {isLinkCopied ? (
                      <>
                        <Check className="h-4 w-4 mr-2 text-coffee-600" />
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
                <div className="mt-5 flex items-center justify-center md:justify-start gap-2 text-xs text-coffee-500">
                  <span className="font-semibold uppercase tracking-wider">Trace ID</span>
                  <span className="rounded-full border border-coffee-200 bg-white px-3 py-1 font-mono text-coffee-700">
                    {data.traceId}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Journey from Farm */}
        <div className="px-8 md:px-12 py-10">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-widest text-coffee-600">Origin to Table</p>
            <h2 className="mt-1 text-2xl font-bold text-coffee-950">The Journey from the Farm</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-coffee-500">
              Follow this lot from its origin, through processing and drying, to the final roast.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Origin Details Card */}
            <div className="rounded-2xl border border-coffee-100 bg-coffee-50 p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-coffee-100 text-coffee-600">
                  <Coffee className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-coffee-950">Origin Details</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-coffee-500">Producer</p>
                  <p className="text-base font-bold text-coffee-900">
                    {farm?.farmName
                      || farm?.name
                      || harvestLot?.farmPlotLocation
                      || harvestLot?.farmerName
                      || lot.externalSource?.producerName
                      || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-coffee-500">Variety</p>
                  <p className="text-base font-bold text-coffee-900">
                    {harvestLot?.cherryVariety || lot.externalSource?.variety || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-coffee-500">Harvest Date</p>
                  <p className="text-base font-bold text-coffee-900">
                    {formatDate(harvestLot?.harvestDate) || formatDate(lot.externalSource?.purchaseDate)}
                  </p>
                </div>
                {farm?.altitude && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-coffee-500">Altitude</p>
                    <p className="text-base font-bold text-coffee-900">{farm.altitude}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Processing Details Card */}
            <div className="rounded-2xl border border-coffee-100 bg-coffee-50 p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-coffee-100 text-coffee-600">
                  <Droplets className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-coffee-950">Processing Details</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-coffee-500">Method</p>
                  <p className="text-base font-bold text-coffee-900">
                    {parchmentLot?.processType || lot.externalSource?.processType || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-coffee-500">Drying Duration</p>
                  <p className="text-base font-bold text-coffee-900">{dryingDuration}</p>
                </div>
                {(avgTemp !== 'N/A' || avgHumidity !== 'N/A' || avgCoffeeMoisture !== 'N/A') && (
                  <div className="pt-2">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-coffee-500">Averages During Drying</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      {avgTemp !== 'N/A' && (
                        <div className="flex items-center gap-2 rounded-lg border border-coffee-100 bg-white px-3 py-1.5">
                          <Thermometer className="h-4 w-4 text-coffee-400" />
                          <span className="text-[11px] font-semibold text-coffee-500">Temp</span>
                          <span className="text-sm font-bold text-coffee-900">{avgTemp}</span>
                        </div>
                      )}
                      {avgHumidity !== 'N/A' && (
                        <div className="flex items-center gap-2 rounded-lg border border-coffee-100 bg-white px-3 py-1.5">
                          <Droplets className="h-4 w-4 text-coffee-400" />
                          <span className="text-[11px] font-semibold text-coffee-500">Humidity</span>
                          <span className="text-sm font-bold text-coffee-900">{avgHumidity}</span>
                        </div>
                      )}
                      {avgCoffeeMoisture !== 'N/A' && (
                        <div className="flex items-center gap-2 rounded-lg border border-coffee-100 bg-white px-3 py-1.5">
                          <Droplet className="h-4 w-4 text-coffee-400" />
                          <span className="text-[11px] font-semibold text-coffee-500">Moisture</span>
                          <span className="text-sm font-bold text-coffee-900">{avgCoffeeMoisture}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {farmMapEmbedUrl && (
            <div className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-2xl border border-coffee-100">
              <div className="flex items-center justify-between gap-4 bg-coffee-900 px-5 py-3">
                <h3 className="flex items-center gap-2 text-base font-bold text-coffee-50">
                  <MapPin className="h-4 w-4 text-coffee-300" />
                  {farmName}
                </h3>
                {farm.googleMapsUrl && (
                  <a
                    href={farm.googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-coffee-300 hover:text-coffee-100 hover:underline"
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
                <div className="bg-coffee-50 px-5 py-5 text-sm text-coffee-700">
                  Open the Google Maps link above to view this farm location.
                </div>
              )}
            </div>
          )}

          {timelineItems.length > 0 && (
            <div className="max-w-4xl mx-auto mt-10">
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-wider text-coffee-600">Traceability</p>
                <h3 className="mt-1 text-xl font-bold text-coffee-950">From Farm to Cup</h3>
                <p className="mt-1 text-sm text-coffee-500">The key recorded milestones for this coffee lot.</p>
              </div>

              {/* Desktop: horizontal stepper */}
              <div className="relative hidden md:flex md:items-start md:justify-between">
                <div className="absolute left-0 right-0 top-6 h-0.5 bg-coffee-100" />
                {timelineItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="relative z-10 flex flex-1 flex-col items-center px-2 text-center">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${item.color} text-white ring-4 ring-white`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <h4 className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-coffee-950">
                        <Icon className="h-3.5 w-3.5 text-coffee-600" />
                        {item.label}
                      </h4>
                      <p className="mt-0.5 max-w-[10rem] text-xs text-coffee-500">{item.detail}</p>
                      <time className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-coffee-400">
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
                      className="flex items-center gap-4 rounded-xl border border-coffee-100 bg-coffee-50 px-4 py-3"
                    >
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${item.color} text-white`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-coffee-950">{item.label}</h4>
                        <p className="truncate text-sm text-coffee-500">{item.detail}</p>
                      </div>
                      <time className="flex-shrink-0 whitespace-nowrap rounded-full border border-coffee-100 bg-white px-3 py-1 text-xs font-semibold text-coffee-600">
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
        <div className="px-8 md:px-12 py-10">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-widest text-coffee-600">Cupped & Certified</p>
            <h2 className="mt-1 text-2xl font-bold text-coffee-950">Quality in the Cup</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-coffee-500">
              See the quality score and sensory details recorded during evaluation.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Processing Info */}
            <div className="rounded-2xl border border-coffee-100 bg-coffee-50 p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-coffee-100 text-coffee-600">
                  <Coffee className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-coffee-950">Coffee Details</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-coffee-100 pb-2">
                  <span className="text-sm text-coffee-500">Processing method</span>
                  <span className="text-sm font-bold text-coffee-900">
                    {parchmentLot?.processType || lot.externalSource?.processType || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-coffee-100 pb-2">
                  <span className="text-sm text-coffee-500">Variety</span>
                  <span className="text-sm font-bold text-coffee-900">
                    {harvestLot?.cherryVariety || lot.externalSource?.variety || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-coffee-100 pb-2">
                  <span className="text-sm text-coffee-500">Grade</span>
                  <span className="text-sm font-bold text-coffee-900">{lot.grade}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-coffee-500">Source</span>
                  <span className="text-sm font-bold text-coffee-900">
                    {lot.sourceType === 'External' ? 'External supplier' : 'Coffee Lab Platform'}
                  </span>
                </div>
              </div>
            </div>

            {/* Score */}
            <div className="space-y-6">
              {cuppingScore && (
                <div className="rounded-2xl bg-coffee-900 p-6 text-center">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-coffee-300">Cupping Score</p>
                  <p className="mb-3 text-6xl font-black text-coffee-50">{cuppingScore.toFixed(2)}</p>
                  {cuppingScore >= 80 && (
                    <div className="inline-flex items-center gap-2 rounded-full bg-coffee-50/15 px-4 py-2">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-coffee-300"></div>
                      <p className="text-sm font-semibold text-coffee-50">Specialty Grade</p>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-coffee-100 bg-coffee-50 p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-coffee-100 text-coffee-600">
                    <Droplet className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-coffee-950">QC Flavor Profile</h3>
                </div>
                {hasDetailedScores ? (
                  <FlavorProfileChart
                    data={radarData}
                    totalScore={qcTotalScore}
                  />
                ) : (
                  <p className="text-sm text-coffee-500">
                    Detailed QC scores are not available for this lot yet.
                  </p>
                )}
              </div>

              {lot.externalSource?.tasteNote && (
                <div className="rounded-2xl border border-coffee-100 bg-coffee-50 p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-coffee-100 text-coffee-600">
                      <Coffee className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold text-coffee-950">Tasting Notes</h3>
                  </div>
                  <div className="rounded-lg border-l-4 border-coffee-400 bg-white p-4">
                    <p className="text-sm italic leading-relaxed text-coffee-700">"{lot.externalSource.tasteNote}"</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 5: Roaster Details */}
        {roastBatches.length > 0 && (
          <div className="px-8 md:px-12 py-10">
            <div className="text-center mb-8">
              <p className="text-xs font-bold uppercase tracking-widest text-coffee-600">Roasted By</p>
              <h2 className="mt-1 text-2xl font-bold text-coffee-950">
                {roastBatches[0].roaster?.name || 'Our Expert Roasters'}
              </h2>
            </div>

            <div className="max-w-4xl mx-auto space-y-5">
              {roastBatches.slice(0, 3).map(roast => (
                <div key={roast.id} className="rounded-2xl border border-coffee-100 bg-coffee-50 p-6">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-coffee-100 text-coffee-600">
                        <Flame className="h-5 w-5" />
                      </div>
                      <h3 className="text-base font-bold text-coffee-950">Roast Profile</h3>
                    </div>
                    <div className="rounded-full border border-coffee-100 bg-white px-3 py-1">
                      <p className="text-xs font-semibold text-coffee-600">{formatDate(roast.roastDate)}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {roast.roastProfileNotes && (
                      <div className="rounded-lg border-l-4 border-coffee-400 bg-white p-4">
                        <p className="text-sm italic leading-relaxed text-coffee-700">
                          {roast.roastProfileNotes}
                        </p>
                      </div>
                    )}

                    {roast.flavorNotes && (
                      <div className="space-y-2">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-coffee-500">Flavor Notes</p>
                        <div className="flex flex-wrap gap-2">
                          {roast.flavorNotes.split(',').map((note: string) => note.trim()).filter(Boolean).map((note: string, index: number) => (
                            <span key={index} className="rounded-full border border-coffee-200 bg-coffee-100 px-4 py-2 text-sm font-semibold text-coffee-700">
                              {note}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 flex-wrap pt-2">
                      <div className="flex items-center gap-2 rounded-lg border border-coffee-100 bg-white px-3 py-1.5">
                        <Flame className="h-4 w-4 text-coffee-400" />
                        <span className="text-[11px] font-semibold text-coffee-500">Batch Size</span>
                        <span className="text-sm font-bold text-coffee-900">{roast.batchSizeKg} kg</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg border border-coffee-100 bg-white px-3 py-1.5">
                        <Coffee className="h-4 w-4 text-coffee-400" />
                        <span className="text-[11px] font-semibold text-coffee-500">Yield</span>
                        <span className="text-sm font-bold text-coffee-900">{roast.yieldPercentage}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-coffee-950 px-8 md:px-12 py-6 text-center">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-coffee-300">
            <Coffee className="h-3.5 w-3.5" />
            Coffee Lab Platform · Farm-to-Cup Traceability
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicTraceabilityPage;
