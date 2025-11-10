'use client';

import { useState, useEffect, useCallback } from 'react';

const TABS = [
  { key: 'missions', label: 'Missions' },
  { key: 'levels', label: 'Levels' },
  { key: 'work_modalities', label: 'Modalities' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'org_types', label: 'Org Types' },
  { key: 'crisis_types', label: 'Crisis Types' },
  { key: 'clusters', label: 'Clusters' },
  { key: 'response_phases', label: 'Response Phases' },
  { key: 'benefits', label: 'Benefits' },
  { key: 'policy_flags', label: 'Policy Flags' },
  { key: 'donors', label: 'Donors' },
  { key: 'synonyms', label: 'Synonyms' },
];

type LookupItem = {
  key: string;
  label: string;
  parent?: string;
  sdg_links?: number[];
};

type SynonymItem = {
  type: string;
  raw_value: string;
  canonical_key: string;
};

type StatusData = {
  [key: string]: number;
};

export default function TaxonomyManager() {
  const isDev = process.env.NEXT_PUBLIC_AIDJOBS_ENV === 'dev';

  const [activeTab, setActiveTab] = useState('missions');
  const [status, setStatus] = useState<StatusData | null>(null);
  const [items, setItems] = useState<LookupItem[] | SynonymItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Partial<LookupItem | SynonymItem>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [synonymFilter, setSynonymFilter] = useState<string>('');

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/admin/lookups/status');
      if (res.status === 403) {
        showToast('Admin endpoints are disabled (not in dev mode)', 'error');
        return;
      }
      const data = await res.json();
      if (data.status === 'ok' && data.data) {
        setStatus(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }, [showToast]);

  const fetchLookupItems = useCallback(async (table: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/admin/lookups/${table}?size=200`);
      const data = await res.json();
      if (data.status === 'ok' && data.data) {
        setItems(data.data.items || []);
      } else {
        setItems([]);
        showToast(data.error || 'Failed to load items', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch items:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchSynonyms = useCallback(async () => {
    setLoading(true);
    try {
      const url = synonymFilter
        ? `/admin/synonyms?type=${synonymFilter}&size=200`
        : '/admin/synonyms?size=200';
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'ok' && data.data) {
        setItems(data.data.items || []);
      } else {
        setItems([]);
        showToast(data.error || 'Failed to load synonyms', 'error');
      }
    } catch (err) {
      console.error('Failed to fetch synonyms:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [synonymFilter, showToast]);

  useEffect(() => {
    if (!isDev) return;
    fetchStatus();
  }, [isDev, fetchStatus]);

  useEffect(() => {
    if (!isDev) return;
    if (activeTab === 'synonyms') {
      fetchSynonyms();
    } else {
      fetchLookupItems(activeTab);
    }
  }, [activeTab, isDev, synonymFilter, fetchSynonyms, fetchLookupItems]);

  const handleSave = async () => {
    if (activeTab === 'synonyms') {
      await saveSynonym();
    } else {
      await saveLookupItem();
    }
  };

  const saveLookupItem = async () => {
    try {
      const res = await fetch(`/admin/lookups/${activeTab}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editItem),
      });
      const data = await res.json();
      if (data.status === 'ok' && !data.error) {
        showToast('Item saved successfully', 'success');
        setShowModal(false);
        setEditItem({});
        fetchLookupItems(activeTab);
        fetchStatus();
      } else {
        showToast(data.error || 'Failed to save item', 'error');
      }
    } catch (err) {
      console.error('Failed to save item:', err);
      showToast('Failed to save item', 'error');
    }
  };

  const saveSynonym = async () => {
    try {
      const res = await fetch('/admin/synonyms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editItem),
      });
      const data = await res.json();
      if (data.status === 'ok' && !data.error) {
        showToast('Synonym saved successfully', 'success');
        setShowModal(false);
        setEditItem({});
        fetchSynonyms();
        fetchStatus();
      } else {
        showToast(data.error || 'Failed to save synonym', 'error');
      }
    } catch (err) {
      console.error('Failed to save synonym:', err);
      showToast('Failed to save synonym', 'error');
    }
  };

  const handleReindex = async () => {
    try {
      const res = await fetch('/admin/search/reindex');
      const data = await res.json();
      if (data.status === 'ok' && !data.error) {
        showToast(`Reindex complete: ${data.data?.indexed || 0} jobs indexed`, 'success');
      } else {
        showToast(data.error || 'Reindex failed', 'error');
      }
    } catch (err) {
      console.error('Reindex failed:', err);
      showToast('Reindex failed', 'error');
    }
  };

  const handleNormalizeReindex = async () => {
    try {
      const res = await fetch('/admin/normalize/reindex', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok' && !data.error) {
        const summary = data.data;
        showToast(
          `Normalize & Reindex complete: ${summary?.normalized || 0} normalized, ${summary?.indexed || 0} indexed`,
          'success'
        );
      } else {
        showToast(data.error || 'Normalize & Reindex failed', 'error');
      }
    } catch (err) {
      console.error('Normalize & Reindex failed:', err);
      showToast('Normalize & Reindex failed', 'error');
    }
  };


  if (!isDev) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">This page is only available in development mode.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Taxonomy Manager</h1>
          
          <div className="flex gap-4 mb-6">
            <button
              onClick={handleNormalizeReindex}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Normalize & Reindex
            </button>
            <button
              onClick={handleReindex}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Reindex Only
            </button>
          </div>

          {status && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              {Object.entries(status)
                .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
                .map(([key, count]) => (
                  <div key={key} className="p-3 bg-gray-50 rounded">
                    <div className="text-sm text-gray-600">{key}</div>
                    <div className="text-xl font-bold text-gray-900">{count}</div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm">
          <div className="border-b border-gray-200">
            <div className="flex gap-2 p-4 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 rounded whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tab.label}
                  {status && status[tab.key] !== undefined && (
                    <span className="ml-2 text-sm">({status[tab.key]})</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {TABS.find((t) => t.key === activeTab)?.label || activeTab}
              </h2>
              <button
                onClick={() => {
                  setEditItem({});
                  setShowModal(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add New
              </button>
            </div>

            {activeTab === 'synonyms' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Type
                </label>
                <select
                  value={synonymFilter}
                  onChange={(e) => setSynonymFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded"
                >
                  <option value="">All Types</option>
                  <option value="mission">Mission</option>
                  <option value="level">Level</option>
                  <option value="modality">Modality</option>
                  <option value="donor">Donor</option>
                </select>
              </div>
            )}

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No items found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {activeTab === 'synonyms' ? (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Raw Value</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Canonical Key</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
                          {activeTab === 'missions' && (
                            <>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parent</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SDGs</th>
                            </>
                          )}
                          {activeTab === 'clusters' && (
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parent</th>
                          )}
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        {activeTab === 'synonyms' ? (
                          <>
                            <td className="px-4 py-3 text-sm text-gray-900">{(item as SynonymItem).type}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{(item as SynonymItem).raw_value}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{(item as SynonymItem).canonical_key}</td>
                            <td className="px-4 py-3 text-sm">
                              <button
                                onClick={() => {
                                  setEditItem(item);
                                  setShowModal(true);
                                }}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                Edit
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-sm font-mono text-gray-900">{(item as LookupItem).key}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{(item as LookupItem).label}</td>
                            {activeTab === 'missions' && (
                              <>
                                <td className="px-4 py-3 text-sm text-gray-600">{(item as LookupItem).parent || '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {(item as LookupItem).sdg_links?.join(', ') || '-'}
                                </td>
                              </>
                            )}
                            {activeTab === 'clusters' && (
                              <td className="px-4 py-3 text-sm text-gray-600">{(item as LookupItem).parent || '-'}</td>
                            )}
                            <td className="px-4 py-3 text-sm">
                              <button
                                onClick={() => {
                                  setEditItem(item);
                                  setShowModal(true);
                                }}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                Edit
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {Object.keys(editItem).length === 0 ? 'Add New' : 'Edit'} Item
            </h3>
            
            {activeTab === 'synonyms' ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={(editItem as SynonymItem).type || ''}
                    onChange={(e) => setEditItem({ ...editItem, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="">Select type...</option>
                    <option value="mission">Mission</option>
                    <option value="level">Level</option>
                    <option value="modality">Modality</option>
                    <option value="donor">Donor</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Raw Value</label>
                  <input
                    type="text"
                    value={(editItem as SynonymItem).raw_value || ''}
                    onChange={(e) => setEditItem({ ...editItem, raw_value: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    placeholder="e.g., Sr, Entry-level"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Canonical Key</label>
                  <input
                    type="text"
                    value={(editItem as SynonymItem).canonical_key || ''}
                    onChange={(e) => setEditItem({ ...editItem, canonical_key: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    placeholder="e.g., senior, junior"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Key (lowercase slug)</label>
                  <input
                    type="text"
                    value={(editItem as LookupItem).key || ''}
                    onChange={(e) => setEditItem({ ...editItem, key: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded font-mono"
                    placeholder="e.g., health, senior"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                  <input
                    type="text"
                    value={(editItem as LookupItem).label || ''}
                    onChange={(e) => setEditItem({ ...editItem, label: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    placeholder="e.g., Health, Senior"
                  />
                </div>
                {(activeTab === 'missions' || activeTab === 'clusters') && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Parent (optional)</label>
                    <input
                      type="text"
                      value={(editItem as LookupItem).parent || ''}
                      onChange={(e) => setEditItem({ ...editItem, parent: e.target.value || undefined })}
                      className="w-full px-3 py-2 border border-gray-300 rounded font-mono"
                      placeholder="Parent key"
                    />
                  </div>
                )}
                {activeTab === 'missions' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">SDG Links (comma-separated)</label>
                    <input
                      type="text"
                      value={(editItem as LookupItem).sdg_links?.join(', ') || ''}
                      onChange={(e) => {
                        const sdgs = e.target.value
                          .split(',')
                          .map((s) => parseInt(s.trim()))
                          .filter((n) => !isNaN(n));
                        setEditItem({ ...editItem, sdg_links: sdgs.length > 0 ? sdgs : undefined });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                      placeholder="e.g., 3, 6, 13"
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditItem({});
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 px-6 py-3 rounded shadow-lg">
          <div
            className={`${
              toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            } text-white px-6 py-3 rounded shadow-lg`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
