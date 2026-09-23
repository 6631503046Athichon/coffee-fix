import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Eye, Globe, Loader } from 'lucide-react';
import { getPublicTraceUrl, getTracePreviewData, PublicTraceData } from '@/services/lots/greenBeanLotService';
import { toRoaId } from '@/utils/formatters';
import TraceabilityStory from './TraceabilityStory';

// Staff view of a lot's traceability page. It shows the same story customers
// get on /trace/:publicId, fetched by lot id so it also works before the lot
// has been published. The QR code only appears once there is a public address
// to put in it: a QR pointing here would send customers to the login page.
const TraceabilityPage: React.FC = () => {
  const { lotId } = useParams<{ lotId: string }>();
  // Tagged with the lot it belongs to, so switching lots shows the loader
  // instead of the previous lot's story.
  const [loaded, setLoaded] = useState<{ lotId: string; data?: PublicTraceData; error?: string } | null>(null);

  useEffect(() => {
    if (!lotId) return;
    let cancelled = false;
    getTracePreviewData(lotId)
      .then((result) => {
        if (!cancelled) setLoaded({ lotId, data: result });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoaded({
          lotId,
          error:
            err?.message === 'Forbidden'
              ? 'Only the processor who created this lot, or an Admin, can preview it before it is published.'
              : err?.message || 'This lot could not be loaded.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [lotId]);

  const current = loaded?.lotId === lotId ? loaded : null;
  const data = current?.data ?? null;
  const error = current?.error ?? null;

  const backLink = (
    <Link
      to="/traceability"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900"
    >
      <ArrowLeft className="h-4 w-4" />
      Traceability Hub
    </Link>
  );

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {backLink}
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader className="mr-2 h-5 w-5 animate-spin" />
        Loading traceability page...
      </div>
    );
  }

  const publicUrl = data.traceId ? getPublicTraceUrl(data.traceId) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {backLink}
      {publicUrl ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="flex items-center gap-2">
            <Globe className="h-4 w-4 flex-shrink-0" />
            <span>
              <span className="font-mono font-semibold">{toRoaId(data.lot.id)}</span> is public. This
              is the page customers see when they scan its QR code.
            </span>
          </p>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline hover:text-emerald-900"
          >
            Open public page
          </a>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Eye className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            Preview of <span className="font-mono font-semibold">{toRoaId(data.lot.id)}</span>.
            Customers can&apos;t open this page yet. Press <span className="font-semibold">Generate</span>{' '}
            for this lot in the Traceability Hub to publish it and get its QR code.
          </p>
        </div>
      )}
      <TraceabilityStory data={data} shareUrl={publicUrl} />
    </div>
  );
};

export default TraceabilityPage;
