'use client';

import { useEffect, useState } from 'react';

type HealthStatus = {
  status: 'green' | 'amber' | 'red';
  components: {
    db: boolean;
    search: boolean;
    ai: boolean;
    payments: boolean;
  };
};

type Capabilities = {
  search: boolean;
  cv: boolean;
  payments: boolean;
  findearn: boolean;
};

export default function Home() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/healthz').then((res) => res.json()),
      fetch('/api/capabilities').then((res) => res.json()),
    ])
      .then(([healthData, capabilitiesData]) => {
        setHealth(healthData);
        setCapabilities(capabilitiesData);
        setLoading(false);
      })
      .catch(() => {
        setHealth({ status: 'red', components: { db: false, search: false, ai: false, payments: false } });
        setCapabilities({ search: false, cv: false, payments: false, findearn: false });
        setLoading(false);
      });
  }, []);

  const getStatusColor = () => {
    if (loading) return 'bg-gray-400';
    if (!health) return 'bg-red-500';
    if (health.status === 'green') return 'bg-green-500';
    if (health.status === 'amber') return 'bg-amber-500';
    return 'bg-red-500';
  };

  const showSearchBanner = !loading && capabilities && !capabilities.search;
  const searchBannerText = process.env.NEXT_PUBLIC_MEILI_FALLBACK === 'true'
    ? 'Search running in fallback mode'
    : 'Search temporarily unavailable';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      {showSearchBanner && (
        <div className="fixed top-0 left-0 right-0 bg-amber-50 border-b border-amber-200 px-4 py-2 text-center">
          <p className="text-sm text-amber-800">{searchBannerText}</p>
        </div>
      )}
      <div className="flex flex-col items-center gap-8">
        <h1 className="text-4xl font-bold">AidJobs</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">System Status:</span>
          <div className={`w-4 h-4 rounded-full ${getStatusColor()}`} />
          <span className="text-sm font-medium">
            {loading ? 'Checking...' : health?.status || 'offline'}
          </span>
        </div>
      </div>
    </main>
  );
}
