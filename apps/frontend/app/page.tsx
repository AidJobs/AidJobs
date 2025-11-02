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

export default function Home() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/healthz')
      .then((res) => res.json())
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch(() => {
        setHealth({ status: 'red', components: { db: false, search: false, ai: false, payments: false } });
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
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
