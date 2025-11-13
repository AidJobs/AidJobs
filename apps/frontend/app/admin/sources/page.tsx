'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type Source = {
  id: string;
  org_name: string | null;
  careers_url: string;
  source_type: string;
  org_type: string | null;
  status: string;
  crawl_frequency_days: number | null;
  next_run_at: string | null;
  last_crawled_at: string | null;
  last_crawl_status: string | null;
  parser_hint: string | null;
  time_window: string | null;
  consecutive_failures?: number | null;
  consecutive_nochange?: number | null;
  created_at: string;
  updated_at: string;
};

type SourceFormData = {
  org_name: string;
  careers_url: string;
  source_type: string;
  org_type: string;
  crawl_frequency_days: number;
  parser_hint: string;
  time_window: string;
};

type Preset = {
  name: string;
  description: string;
  org_name: string;
  org_type: string;
  source_type: string;
  crawl_frequency_days: number;
  parser_hint: string;
};

export default function AdminSourcesPage() {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [testResult, setTestResult] = useState<any>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [simulateResult, setSimulateResult] = useState<any>(null);
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [formData, setFormData] = useState<SourceFormData>({
    org_name: '',
    careers_url: '',
    source_type: 'html',
    org_type: '',
    crawl_frequency_days: 3,
    parser_hint: '',
    time_window: '',
  });

  const pageSize = 20;

  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
        status: statusFilter,
      });
      
      if (searchQuery) {
        params.append('query', searchQuery);
      }

      const res = await fetch(`/api/admin/sources?${params}`, {
        credentials: 'include',
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to fetch sources');
      }

      const json = await res.json();
      setSources(json.data.items);
      setTotal(json.data.total);
    } catch (error) {
      console.error('Failed to fetch sources:', error);
      toast.error('Failed to fetch sources');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchQuery, router]);

  useEffect(() => {
    fetchSources();
  }, [page, statusFilter, searchQuery, fetchSources]);

  const fetchPresets = useCallback(async () => {
    setLoadingPresets(true);
    try {
      const res = await fetch('/api/admin/presets/sources', {
        credentials: 'include',
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to fetch presets');
      }

      const json = await res.json();
      if (json.status === 'ok' && json.data) {
        setPresets(json.data);
      }
    } catch (error) {
      console.error('Failed to fetch presets:', error);
      // Don't show error toast - presets are optional
    } finally {
      setLoadingPresets(false);
    }
  }, [router]);

  useEffect(() => {
    if (showAddModal) {
      fetchPresets();
    }
  }, [showAddModal, fetchPresets]);

  const handlePresetSelect = (presetName: string) => {
    const preset = presets.find(p => p.name === presetName);
    if (preset) {
      setSelectedPreset(presetName);
      setFormData({
        org_name: preset.org_name || '',
        careers_url: '', // Presets don't include URL, user must enter
        source_type: preset.source_type,
        org_type: preset.org_type || '',
        crawl_frequency_days: preset.crawl_frequency_days || 3,
        parser_hint: preset.parser_hint || '',
        time_window: '',
      });
      toast.success(`Preset "${presetName}" loaded`);
    }
  };

  const handleClearPreset = () => {
    setSelectedPreset('');
    resetForm();
  };

  const handleExportSource = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/sources/${id}/export`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to export source');
      }

      const json = await res.json();
      if (json.status === 'ok' && json.data) {
        const dataStr = JSON.stringify(json.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `source-${id}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Source exported successfully');
      }
    } catch (error) {
      console.error('Failed to export source:', error);
      toast.error('Failed to export source');
    }
  };

  const handleImportSource = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const sourceData = JSON.parse(text);

      // Validate required fields
      if (!sourceData.careers_url) {
        toast.error('Invalid source file: missing careers_url');
        return;
      }

      // Pre-fill form with imported data
      setFormData({
        org_name: sourceData.org_name || '',
        careers_url: sourceData.careers_url,
        source_type: sourceData.source_type || 'html',
        org_type: sourceData.org_type || '',
        crawl_frequency_days: sourceData.crawl_frequency_days || 3,
        parser_hint: sourceData.parser_hint || '',
        time_window: sourceData.time_window || '',
      });

      // Open add modal
      setShowAddModal(true);
      toast.success('Source configuration loaded. Review and click Create Source.');
    } catch (error) {
      console.error('Failed to import source:', error);
      toast.error('Failed to import source: Invalid JSON file');
    }

    // Reset file input
    event.target.value = '';
  };

  const handleAddSource = async () => {
    try {
      // Validate JSON for API sources
      if (formData.source_type === 'api' && formData.parser_hint) {
        try {
          const parsed = JSON.parse(formData.parser_hint);
          if (parsed.v !== 1) {
            toast.error('API sources must use v1 schema ({"v": 1, ...})');
            return;
          }
        } catch (e) {
          toast.error('Invalid JSON in parser_hint. Please check the syntax.');
          return;
        }
      }

      const res = await fetch('/api/admin/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          org_name: formData.org_name || null,
          careers_url: formData.careers_url,
          source_type: formData.source_type,
          org_type: formData.org_type || null,
          crawl_frequency_days: formData.crawl_frequency_days,
          parser_hint: formData.parser_hint || null,
          time_window: formData.time_window || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json() as { detail?: string };
        throw new Error(error.detail || 'Failed to create source');
      }

      toast.success('Source created and queued for crawl');
      setShowAddModal(false);
      resetForm();
      fetchSources();
    } catch (error: any) {
      console.error('Failed to create source:', error);
      toast.error(error.message || 'Failed to create source');
    }
  };

  const handleEditSource = async () => {
    if (!editingSource) return;

    try {
      // Validate JSON for API sources
      if (formData.source_type === 'api' && formData.parser_hint) {
        try {
          const parsed = JSON.parse(formData.parser_hint);
          if (parsed.v !== 1) {
            toast.error('API sources must use v1 schema ({"v": 1, ...})');
            return;
          }
        } catch (e) {
          toast.error('Invalid JSON in parser_hint. Please check the syntax.');
          return;
        }
      }

      const updates: any = {};
      
      if (formData.org_name !== editingSource.org_name) {
        updates.org_name = formData.org_name || null;
      }
      if (formData.careers_url !== editingSource.careers_url) {
        updates.careers_url = formData.careers_url;
      }
      if (formData.source_type !== editingSource.source_type) {
        updates.source_type = formData.source_type;
      }
      if (formData.org_type !== editingSource.org_type) {
        updates.org_type = formData.org_type || null;
      }
      if (formData.crawl_frequency_days !== editingSource.crawl_frequency_days) {
        updates.crawl_frequency_days = formData.crawl_frequency_days;
      }
      if (formData.parser_hint !== editingSource.parser_hint) {
        updates.parser_hint = formData.parser_hint || null;
      }
      if (formData.time_window !== editingSource.time_window) {
        updates.time_window = formData.time_window || null;
      }

      const res = await fetch(`/api/admin/sources/${editingSource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const error = await res.json() as { detail?: string };
        throw new Error(error.detail || 'Failed to update source');
      }

      toast.success('Source updated');
      setShowEditModal(false);
      setEditingSource(null);
      resetForm();
      fetchSources();
    } catch (error: any) {
      console.error('Failed to update source:', error);
      toast.error(error.message || 'Failed to update source');
    }
  };

  const handleDeleteSource = async (id: string) => {
    if (!confirm('Are you sure you want to delete this source?')) return;

    try {
      const res = await fetch(`/api/admin/sources/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to delete source');
      }

      toast.success('Source deleted');
      fetchSources();
    } catch (error) {
      console.error('Failed to delete source:', error);
      toast.error('Failed to delete source');
    }
  };

  const handleToggleStatus = async (source: Source) => {
    const newStatus = source.status === 'active' ? 'paused' : 'active';
    
    try {
      const res = await fetch(`/api/admin/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error('Failed to update status');
      }

      toast.success(`Source ${newStatus === 'active' ? 'resumed' : 'paused'}`);
      fetchSources();
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleTestSource = async (id: string) => {
    setTestLoading(true);
    setShowTestModal(true);
    try {
      const res = await fetch(`/api/admin/sources/${id}/test`, {
        method: 'POST',
        credentials: 'include',
      });

      const result = await res.json();
      setTestResult(result);
      
      if (result.ok) {
        toast.success(`Test passed: ${String(result.status ?? 'OK')} (${String(result.host ?? 'unknown')})`);
      } else {
        toast.error(`Test failed: ${String(result.error ?? 'Unknown error')}`);
      }
    } catch (error) {
      console.error('Failed to test source:', error);
      toast.error('Failed to test source');
      setTestResult({ ok: false, error: 'Failed to test source' });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSimulateExtract = async (id: string) => {
    setSimulateLoading(true);
    setShowSimulateModal(true);
    toast.info('Simulating extraction...');
    
    try {
      const res = await fetch(`/api/admin/sources/${id}/simulate_extract`, {
        method: 'POST',
        credentials: 'include',
      });

      const result = await res.json();
      setSimulateResult(result);

      if (result.ok) {
        toast.success(`Found ${String(result.count ?? 0)} jobs`);
      } else {
        toast.error(`Simulation failed: ${String(result.error ?? 'Unknown error')}`);
      }
    } catch (error) {
      console.error('Failed to simulate extract:', error);
      toast.error('Failed to simulate extract');
      setSimulateResult({ ok: false, error: 'Failed to simulate extract' });
    } finally {
      setSimulateLoading(false);
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: 'active',
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to queue source');
      }

      const res2 = await fetch(`/api/admin/crawl/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ source_id: id }),
      });

      if (!res2.ok) {
        throw new Error('Failed to trigger crawl');
      }

      toast.success('Crawl started');
      fetchSources();
    } catch (error) {
      console.error('Failed to run crawl:', error);
      toast.error('Failed to run crawl');
    }
  };

  const openEditModal = (source: Source) => {
    setEditingSource(source);
    setFormData({
      org_name: source.org_name || '',
      careers_url: source.careers_url,
      source_type: source.source_type,
      org_type: source.org_type || '',
      crawl_frequency_days: source.crawl_frequency_days || 3,
      parser_hint: source.parser_hint || '',
      time_window: source.time_window || '',
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      org_name: '',
      careers_url: '',
      source_type: 'html',
      org_type: '',
      crawl_frequency_days: 3,
      parser_hint: '',
      time_window: '',
    });
    setSelectedPreset('');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sources Management</h1>
            <p className="text-gray-600 mt-1">Manage job board crawl sources</p>
          </div>
          <div className="flex gap-2">
            <label className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 cursor-pointer">
              Import
              <input
                type="file"
                accept=".json"
                onChange={handleImportSource}
                className="hidden"
              />
            </label>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add Source
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow mb-6 p-4">
          <div className="flex gap-4 items-center">
            <div>
              <label className="text-sm text-gray-600 mr-2">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="border border-gray-300 rounded px-3 py-1 bg-white text-gray-900"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="deleted">Deleted</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by org name or URL..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full border border-gray-300 rounded px-3 py-1 bg-white text-gray-900"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-600">Loading...</div>
          ) : sources.length === 0 ? (
            <div className="p-8 text-center text-gray-600">No sources found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Org</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Freq (d)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next run</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last crawl</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failures</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sources.map((source) => (
                    <tr key={source.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{source.org_name || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        <a href={source.careers_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {source.careers_url.substring(0, 40)}...
                        </a>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{source.source_type}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          source.status === 'active' ? 'bg-green-100 text-green-700' :
                          source.status === 'paused' ? 'bg-gray-100 text-gray-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {source.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{source.crawl_frequency_days || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(source.next_run_at)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(source.last_crawled_at)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          source.last_crawl_status === 'success' ? 'bg-green-100 text-green-700' :
                          source.last_crawl_status === 'error' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {source.last_crawl_status || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          {(source.consecutive_failures ?? 0) > 0 && (
                            <span className={`px-2 py-1 rounded text-xs ${
                              (source.consecutive_failures ?? 0) >= 5 
                                ? 'bg-red-100 text-red-700 font-semibold' 
                                : 'bg-yellow-100 text-yellow-700'
                            }`} title={`Consecutive failures: ${source.consecutive_failures ?? 0}`}>
                              {source.consecutive_failures ?? 0}
                            </span>
                          )}
                          {(source.consecutive_nochange ?? 0) > 0 && (
                            <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600" title={`Consecutive no-change: ${source.consecutive_nochange ?? 0}`}>
                              NC: {source.consecutive_nochange ?? 0}
                            </span>
                          )}
                          {(!source.consecutive_failures || source.consecutive_failures === 0) && 
                           (!source.consecutive_nochange || source.consecutive_nochange === 0) && (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleRunNow(source.id)}
                            className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Run
                          </button>
                          <button
                            onClick={() => handleToggleStatus(source)}
                            className={`text-xs px-2 py-1 rounded ${
                              source.status === 'active'
                                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                          >
                            {source.status === 'active' ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            onClick={() => openEditModal(source)}
                            className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteSource(source.id)}
                            className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => handleTestSource(source.id)}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          >
                            Test
                          </button>
                          <button
                            onClick={() => handleSimulateExtract(source.id)}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          >
                            Simulate
                          </button>
                          <button
                            onClick={() => handleExportSource(source.id)}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                            title="Export source configuration"
                          >
                            Export
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-gray-900">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                {showAddModal ? 'Add Source' : 'Edit Source'}
              </h2>

              {showAddModal && presets.length > 0 && (
                <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Use Preset (Optional)
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={selectedPreset}
                      onChange={(e) => {
                        if (e.target.value) {
                          handlePresetSelect(e.target.value);
                        } else {
                          handleClearPreset();
                        }
                      }}
                      className="flex-1 border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                    >
                      <option value="">-- Select a preset --</option>
                      {presets.map((preset) => (
                        <option key={preset.name} value={preset.name}>
                          {preset.name} - {preset.description}
                        </option>
                      ))}
                    </select>
                    {selectedPreset && (
                      <button
                        onClick={handleClearPreset}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-700"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {selectedPreset && (
                    <p className="mt-2 text-xs text-gray-600">
                      Preset "{selectedPreset}" loaded. Please enter the Careers URL below.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={formData.org_name}
                    onChange={(e) => setFormData({ ...formData, org_name: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                    placeholder="e.g., UNICEF"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Careers URL *
                  </label>
                  <input
                    type="url"
                    value={formData.careers_url}
                    onChange={(e) => setFormData({ ...formData, careers_url: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                    placeholder="https://example.org/careers"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source Type
                  </label>
                  <select
                    value={formData.source_type}
                    onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                  >
                    <option value="html">HTML</option>
                    <option value="rss">RSS</option>
                    <option value="api">API</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization Type
                  </label>
                  <input
                    type="text"
                    value={formData.org_type}
                    onChange={(e) => setFormData({ ...formData, org_type: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                    placeholder="e.g., UN, NGO, INGO"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Crawl Frequency (days)
                  </label>
                  <input
                    type="number"
                    value={formData.crawl_frequency_days}
                    onChange={(e) => setFormData({ ...formData, crawl_frequency_days: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Parser Hint {formData.source_type === 'api' && '(JSON v1 schema)'}
                  </label>
                  {formData.source_type === 'api' ? (
                    <textarea
                      value={formData.parser_hint}
                      onChange={(e) => setFormData({ ...formData, parser_hint: e.target.value })}
                      className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 font-mono text-sm"
                      placeholder='{"v": 1, "base_url": "https://example.com", "path": "/jobs", ...}'
                      rows={12}
                    />
                  ) : (
                    <input
                      type="text"
                      value={formData.parser_hint}
                      onChange={(e) => setFormData({ ...formData, parser_hint: e.target.value })}
                      className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                      placeholder="Optional: parser-specific hints"
                    />
                  )}
                  {formData.source_type === 'api' && (
                    <p className="mt-1 text-xs text-gray-500">
                      Enter v1 JSON schema. Must include version field (v: 1). Use SECRET:NAME pattern for secrets.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Time Window (days)
                  </label>
                  <input
                    type="text"
                    value={formData.time_window}
                    onChange={(e) => setFormData({ ...formData, time_window: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900"
                    placeholder="Optional: time window for RSS feeds"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    setEditingSource(null);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={showAddModal ? handleAddSource : handleEditSource}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {showAddModal ? 'Create Source' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Test Results Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Test Results</h2>
                <button
                  onClick={() => {
                    setShowTestModal(false);
                    setTestResult(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {testLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  <p className="mt-4 text-gray-600">Testing source...</p>
                </div>
              ) : testResult ? (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg ${testResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-lg font-semibold ${testResult.ok ? 'text-green-800' : 'text-red-800'}`}>
                        {testResult.ok ? '✓ Test Passed' : '✗ Test Failed'}
                      </span>
                    </div>
                    {testResult.error && (
                      <p className="text-sm text-red-700">{testResult.error}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status Code</label>
                      <p className="text-sm text-gray-900">{testResult.status ?? 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
                      <p className="text-sm text-gray-900">{testResult.host ?? 'N/A'}</p>
                    </div>
                    {testResult.count !== undefined && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Jobs Found</label>
                        <p className="text-sm text-gray-900">{testResult.count}</p>
                      </div>
                    )}
                    {testResult.message && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                        <p className="text-sm text-gray-900">{testResult.message}</p>
                      </div>
                    )}
                    {testResult.size && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Content Size</label>
                        <p className="text-sm text-gray-900">{testResult.size} bytes</p>
                      </div>
                    )}
                    {testResult.etag && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ETag</label>
                        <p className="text-sm text-gray-900 font-mono text-xs">{testResult.etag}</p>
                      </div>
                    )}
                    {testResult.last_modified && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Last Modified</label>
                        <p className="text-sm text-gray-900">{testResult.last_modified}</p>
                      </div>
                    )}
                    {testResult.missing_secrets && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-red-700 mb-1">Missing Secrets</label>
                        <ul className="list-disc list-inside text-sm text-red-700">
                          {testResult.missing_secrets.map((secret: string, idx: number) => (
                            <li key={idx}>{secret}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {testResult.first_ids && testResult.first_ids.length > 0 && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">First 5 Job IDs</label>
                        <div className="space-y-1">
                          {testResult.first_ids.map((id: string, idx: number) => (
                            <p key={idx} className="text-sm text-gray-900 font-mono text-xs">{id}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {testResult.headers_sanitized && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Headers (Sanitized)</label>
                        <pre className="text-xs bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto">
                          {JSON.stringify(testResult.headers_sanitized, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => {
                        setShowTestModal(false);
                        setTestResult(null);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Simulate Results Modal */}
      {showSimulateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Simulation Results</h2>
                <button
                  onClick={() => {
                    setShowSimulateModal(false);
                    setSimulateResult(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {simulateLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  <p className="mt-4 text-gray-600">Simulating extraction...</p>
                </div>
              ) : simulateResult ? (
                <div className="space-y-4">
                  {simulateResult.ok ? (
                    <>
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg font-semibold text-green-800">✓ Simulation Successful</span>
                        </div>
                        <p className="text-sm text-green-700">Found {simulateResult.count ?? 0} jobs</p>
                      </div>

                      {simulateResult.sample && Array.isArray(simulateResult.sample) && simulateResult.sample.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-3">Sample Jobs (First 3)</h3>
                          <div className="space-y-4">
                            {simulateResult.sample.map((job: any, idx: number) => (
                              <div key={idx} className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                                <div className="grid grid-cols-1 gap-2">
                                  {Object.entries(job).map(([key, value]) => (
                                    <div key={key}>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">{key}</label>
                                      <p className="text-sm text-gray-900 break-words">
                                        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? 'N/A')}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg font-semibold text-red-800">✗ Simulation Failed</span>
                      </div>
                      <p className="text-sm text-red-700">{simulateResult.error ?? 'Unknown error'}</p>
                      {simulateResult.error_category && (
                        <p className="text-xs text-red-600 mt-1">Category: {simulateResult.error_category}</p>
                      )}
                    </div>
                  )}

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => {
                        setShowSimulateModal(false);
                        setSimulateResult(null);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
