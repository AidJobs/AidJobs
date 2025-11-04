'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, XCircle, Info } from 'lucide-react';

type ProviderStatus = 'ok' | 'warn' | 'fail';

type SetupStatus = {
  supabase: ProviderStatus;
  meili: ProviderStatus;
  payments: {
    paypal: boolean;
    razorpay: boolean;
  };
  ai: boolean;
  timestamp: string;
  versions: {
    python: string;
    fastapi: string;
  };
  env_vars: {
    supabase: string[];
    meilisearch: string[];
    payments: {
      paypal: string[];
      razorpay: string[];
    };
    ai: string[];
  };
};

export default function AdminSetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000` : 'http://localhost:8000');
      console.log('[Setup] Fetching from:', `${apiUrl}/admin/setup/status`);
      const res = await fetch(`${apiUrl}/admin/setup/status`);
      
      console.log('[Setup] Response:', res.status, res.ok);
      
      if (!res.ok) {
        throw new Error('Failed to fetch status');
      }
      
      const data = await res.json();
      console.log('[Setup] Data:', data);
      
      if (data.status === 'ok') {
        setStatus(data.data);
      } else {
        throw new Error('Invalid response');
      }
    } catch (err) {
      console.error('[Setup] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      console.log('[Setup] Finally - setting loading to false');
      setLoading(false);
    }
  };

  const getStatusIcon = (status: ProviderStatus | boolean) => {
    if (status === 'ok' || status === true) {
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    } else if (status === 'warn') {
      return <AlertCircle className="w-5 h-5 text-yellow-600" />;
    } else {
      return <XCircle className="w-5 h-5 text-red-600" />;
    }
  };

  const getStatusText = (status: ProviderStatus | boolean) => {
    if (status === 'ok' || status === true) return 'Configured';
    if (status === 'warn') return 'Partial';
    return 'Not configured';
  };

  const getStatusColor = (status: ProviderStatus | boolean) => {
    if (status === 'ok' || status === true) return 'border-green-200 bg-green-50';
    if (status === 'warn') return 'border-yellow-200 bg-yellow-50';
    return 'border-gray-200 bg-gray-50';
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Setup Status</h1>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading provider status...</div>
        </div>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Setup Status</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800">Error: {error || 'Failed to load status'}</p>
        </div>
        <button
          onClick={fetchStatus}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Setup Status</h1>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="text-sm text-gray-600 mb-6">
        Last updated: {new Date(status.timestamp).toLocaleString()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`border rounded-lg p-6 ${getStatusColor(status.supabase)}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Supabase</h2>
            {getStatusIcon(status.supabase)}
          </div>
          <div className="mb-2">
            <span className="font-medium">Status:</span> {getStatusText(status.supabase)}
          </div>
          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Required environment variables:</div>
            <ul className="text-sm text-gray-700 space-y-1">
              {status.env_vars.supabase.map((envVar) => (
                <li key={envVar} className="font-mono text-xs bg-white px-2 py-1 rounded">
                  {envVar}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={`border rounded-lg p-6 ${getStatusColor(status.meili)}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Meilisearch</h2>
            {getStatusIcon(status.meili)}
          </div>
          <div className="mb-2">
            <span className="font-medium">Status:</span> {getStatusText(status.meili)}
          </div>
          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Required environment variables:</div>
            <ul className="text-sm text-gray-700 space-y-1">
              {status.env_vars.meilisearch.map((envVar) => (
                <li key={envVar} className="font-mono text-xs bg-white px-2 py-1 rounded">
                  {envVar}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={`border rounded-lg p-6 ${
          (status.payments.paypal && status.payments.razorpay) ? 'border-green-200 bg-green-50' :
          (status.payments.paypal || status.payments.razorpay) ? 'border-yellow-200 bg-yellow-50' :
          'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Payment Providers</h2>
            {(status.payments.paypal && status.payments.razorpay) ? getStatusIcon('ok') :
             (status.payments.paypal || status.payments.razorpay) ? getStatusIcon('warn') :
             getStatusIcon('fail')}
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon(status.payments.paypal)}
                <span className="font-medium">PayPal:</span>
                <span className="text-sm">{getStatusText(status.payments.paypal)}</span>
              </div>
              <ul className="text-sm text-gray-700 space-y-1 ml-7">
                {status.env_vars.payments.paypal.map((envVar) => (
                  <li key={envVar} className="font-mono text-xs bg-white px-2 py-1 rounded">
                    {envVar}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon(status.payments.razorpay)}
                <span className="font-medium">Razorpay:</span>
                <span className="text-sm">{getStatusText(status.payments.razorpay)}</span>
              </div>
              <ul className="text-sm text-gray-700 space-y-1 ml-7">
                {status.env_vars.payments.razorpay.map((envVar) => (
                  <li key={envVar} className="font-mono text-xs bg-white px-2 py-1 rounded">
                    {envVar}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className={`border rounded-lg p-6 ${getStatusColor(status.ai)}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">AI Providers</h2>
            {getStatusIcon(status.ai)}
          </div>
          <div className="mb-2">
            <span className="font-medium">Status:</span> {getStatusText(status.ai)}
          </div>
          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Optional environment variables:</div>
            <ul className="text-sm text-gray-700 space-y-1">
              {status.env_vars.ai.map((envVar) => (
                <li key={envVar} className="font-mono text-xs bg-white px-2 py-1 rounded">
                  {envVar}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-1">About this page</p>
            <p>
              This page shows the configuration status of all providers. Environment variable
              values are never displayed for security. To configure a provider, add the required
              environment variables to your Secrets.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Python {status.versions.python} • FastAPI {status.versions.fastapi}
      </div>
    </div>
  );
}
