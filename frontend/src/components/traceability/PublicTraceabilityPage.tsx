import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader, AlertCircle } from 'lucide-react';
import { getPublicTraceData, getPublicTraceUrl, PublicTraceData } from '@/services/lots/greenBeanLotService';
import TraceabilityStory from './TraceabilityStory';

const PublicTraceabilityPage: React.FC = () => {
  const { publicId } = useParams<{ publicId: string }>();
  const [data, setData] = useState<PublicTraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  if (error || !data || !data.lot) {
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

  return (
    <div className="min-h-screen bg-coffee-100">
      {/* The canonical address, not window.location: links opened from a
          messenger arrive with tracking parameters that would end up in the
          printed QR code. */}
      <TraceabilityStory data={data} shareUrl={getPublicTraceUrl(data.traceId ?? publicId!)} />
    </div>
  );
};

export default PublicTraceabilityPage;
