'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Upload, Play, Pause, Edit, Trash2, TestTube, FileCode, Download, X, ChevronDown, ChevronUp, Sparkles, Check, XCircle } from 'lucide-react';

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
  const [showAdvanced, setShowAdvanced] = useState(false);
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
      // Validate required fields
      if (!formData.careers_url) {
        toast.error('Source URL is required');
        return;
      }

      // Validate JSON for API sources (required)
      if (formData.source_type === 'api') {
        if (!formData.parser_hint || !formData.parser_hint.trim()) {
          toast.error('API Configuration (JSON) is required for API sources');
          return;
        }
        try {
          const parsed = JSON.parse(formData.parser_hint);
          if (parsed.v !== 1) {
            toast.error('API sources must use v1 schema ({"v": 1, ...})');
            return;
          }
        } catch (e) {
          toast.error('Invalid JSON in API Configuration. Please check the syntax.');
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
      // Validate required fields
      if (!formData.careers_url) {
        toast.error('Source URL is required');
        return;
      }

      // Validate JSON for API sources (required)
      if (formData.source_type === 'api') {
        if (!formData.parser_hint || !formData.parser_hint.trim()) {
          toast.error('API Configuration (JSON) is required for API sources');
          return;
        }
        try {
          const parsed = JSON.parse(formData.parser_hint);
          if (parsed.v !== 1) {
            toast.error('API sources must use v1 schema ({"v": 1, ...})');
            return;
          }
        } catch (e) {
          toast.error('Invalid JSON in API Configuration. Please check the syntax.');
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
    setShowAdvanced(false);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="h-full p-4 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-title font-semibold text-[#1D1D1F] mb-1">Sources</h1>
            <p className="text-caption text-[#86868B]">Manage job board crawl sources</p>
          </div>
          <div className="flex gap-2">
            <label className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] cursor-pointer transition-colors relative group">
              <Upload className="w-4 h-4 text-[#86868B]" />
              <input
                type="file"
                accept=".json"
                onChange={handleImportSource}
                className="hidden"
              />
              <span className="absolute right-0 top-full mt-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                Import source
              </span>
            </label>
            <button
              onClick={() => setShowAddModal(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
            >
              <Plus className="w-4 h-4 text-[#86868B]" />
              <span className="absolute right-0 top-full mt-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                Add source
              </span>
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#D2D2D7] rounded-lg mb-4 p-4">
          <div className="flex gap-4 items-center">
            <div>
              <label className="text-caption text-[#86868B] mr-2">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="border border-[#D2D2D7] rounded-lg px-3 py-1.5 bg-white text-[#1D1D1F] text-caption focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:ring-opacity-20"
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
                className="w-full border border-[#D2D2D7] rounded-lg px-3 py-1.5 bg-white text-[#1D1D1F] text-caption placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:ring-opacity-20"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#D2D2D7] rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[#86868B] text-caption">Loading...</div>
          ) : sources.length === 0 ? (
            <div className="p-8 text-center text-[#86868B] text-caption">No sources found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F5F5F7] border-b border-[#D2D2D7]">
                  <tr>
                    <th className="px-4 py-3 text-left text-caption font-medium text-[#86868B] uppercase">Org</th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-[#86868B] uppercase">URL</th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-[#86868B] uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-[#86868B] uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-[#86868B] uppercase">Freq</th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-[#86868B] uppercase">Next run</th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-[#86868B] uppercase">Last crawl</th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-[#86868B] uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-[#86868B] uppercase">Failures</th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-[#86868B] uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D2D2D7]">
                  {sources.map((source) => (
                    <tr key={source.id} className="hover:bg-[#F5F5F7] transition-colors">
                      <td className="px-4 py-3 text-body text-[#1D1D1F]">{source.org_name || '-'}</td>
                      <td className="px-4 py-3 text-body">
                        <a href={source.careers_url} target="_blank" rel="noopener noreferrer" className="text-[#0071E3] hover:underline text-caption">
                          {source.careers_url.substring(0, 40)}...
                        </a>
                      </td>
                      <td className="px-4 py-3 text-caption text-[#1D1D1F] font-mono">{source.source_type}</td>
                      <td className="px-4 py-3 text-caption">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            source.status === 'active' ? 'bg-[#30D158]' :
                            source.status === 'paused' ? 'bg-[#86868B]' :
                            'bg-[#FF3B30]'
                          }`}></div>
                          <span className="text-[#1D1D1F]">{source.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-caption text-[#1D1D1F]">{source.crawl_frequency_days || '-'}</td>
                      <td className="px-4 py-3 text-caption text-[#86868B]">{formatDate(source.next_run_at)}</td>
                      <td className="px-4 py-3 text-caption text-[#86868B]">{formatDate(source.last_crawled_at)}</td>
                      <td className="px-4 py-3 text-caption">
                        <div className="flex items-center gap-2">
                          {source.last_crawl_status === 'success' && (
                            <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
                          )}
                          {source.last_crawl_status === 'error' && (
                            <div className="w-2 h-2 bg-[#FF3B30] rounded-full"></div>
                          )}
                          {source.last_crawl_status && source.last_crawl_status !== 'success' && source.last_crawl_status !== 'error' && (
                            <div className="w-2 h-2 bg-[#86868B] rounded-full"></div>
                          )}
                          <span className="text-[#1D1D1F]">{source.last_crawl_status || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-caption">
                        <div className="flex items-center gap-2">
                          {(source.consecutive_failures ?? 0) > 0 && (
                            <span className={`px-2 py-0.5 rounded text-caption ${
                              (source.consecutive_failures ?? 0) >= 5 
                                ? 'bg-[#FF3B30] text-white font-semibold' 
                                : 'bg-[#FF9500] text-white'
                            }`} title={`Consecutive failures: ${source.consecutive_failures ?? 0}`}>
                              {source.consecutive_failures ?? 0}
                            </span>
                          )}
                          {(source.consecutive_nochange ?? 0) > 0 && (
                            <span className="px-2 py-0.5 rounded text-caption bg-[#F5F5F7] text-[#86868B]" title={`Consecutive no-change: ${source.consecutive_nochange ?? 0}`}>
                              NC: {source.consecutive_nochange ?? 0}
                            </span>
                          )}
                          {(!source.consecutive_failures || source.consecutive_failures === 0) && 
                           (!source.consecutive_nochange || source.consecutive_nochange === 0) && (
                            <span className="text-[#86868B]">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => handleRunNow(source.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
                            title="Run now"
                          >
                            <Play className="w-4 h-4 text-[#86868B]" />
                            <span className="absolute right-0 top-full mt-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                              Run now
                            </span>
                          </button>
                          <button
                            onClick={() => handleToggleStatus(source)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
                            title={source.status === 'active' ? 'Pause' : 'Resume'}
                          >
                            {source.status === 'active' ? (
                              <Pause className="w-4 h-4 text-[#86868B]" />
                            ) : (
                              <Play className="w-4 h-4 text-[#30D158]" />
                            )}
                            <span className="absolute right-0 top-full mt-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                              {source.status === 'active' ? 'Pause' : 'Resume'}
                            </span>
                          </button>
                          <button
                            onClick={() => openEditModal(source)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4 text-[#86868B]" />
                            <span className="absolute right-0 top-full mt-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                              Edit
                            </span>
                          </button>
                          <button
                            onClick={() => handleDeleteSource(source.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-[#FF3B30]" />
                            <span className="absolute right-0 top-full mt-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                              Delete
                            </span>
                          </button>
                          <button
                            onClick={() => handleTestSource(source.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
                            title="Test source"
                          >
                            <TestTube className="w-4 h-4 text-[#86868B]" />
                            <span className="absolute right-0 top-full mt-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                              Test source
                            </span>
                          </button>
                          <button
                            onClick={() => handleSimulateExtract(source.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
                            title="Simulate extraction"
                          >
                            <FileCode className="w-4 h-4 text-[#86868B]" />
                            <span className="absolute right-0 top-full mt-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                              Simulate extraction
                            </span>
                          </button>
                          <button
                            onClick={() => handleExportSource(source.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
                            title="Export source"
                          >
                            <Download className="w-4 h-4 text-[#86868B]" />
                            <span className="absolute right-0 top-full mt-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                              Export source
                            </span>
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
            <div className="px-4 py-3 border-t border-[#D2D2D7] flex items-center justify-between">
              <div className="text-caption text-[#86868B]">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-[#D2D2D7] rounded-lg text-caption text-[#1D1D1F] disabled:opacity-50 hover:bg-[#F5F5F7] transition-colors"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 text-caption text-[#1D1D1F]">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border border-[#D2D2D7] rounded-lg text-caption text-[#1D1D1F] disabled:opacity-50 hover:bg-[#F5F5F7] transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" style={{ overflow: 'visible' }}>
          <div className="bg-white border border-[#D2D2D7] rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 overflow-y-auto flex-1 rounded-t-lg">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-body-lg font-semibold text-[#1D1D1F]">
                    {showAddModal ? 'Add Source' : 'Edit Source'}
                  </h2>
                  <p className="text-caption text-[#86868B] mt-0.5">
                    {showAddModal ? 'Add a new source (URL, API, RSS, or JSON)' : 'Update source configuration'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    setEditingSource(null);
                    setShowAdvanced(false);
                    resetForm();
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors"
                >
                  <X className="w-4 h-4 text-[#86868B]" />
                </button>
              </div>


              {/* Essential Fields */}
              <div className="space-y-3">
                <div>
                  <label className="block text-caption font-medium text-[#1D1D1F] mb-1">
                    Source Type <span className="text-[#FF3B30]">*</span>
                  </label>
                  <select
                    value={formData.source_type}
                    onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                    className="w-full border border-[#D2D2D7] rounded-lg px-3 py-2 bg-white text-[#1D1D1F] text-body-sm focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:ring-opacity-20 transition-all"
                  >
                    <option value="html">HTML (Web Page / URL)</option>
                    <option value="rss">RSS Feed</option>
                    <option value="api">API (JSON/REST)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-caption font-medium text-[#1D1D1F] mb-1">
                    {formData.source_type === 'api' ? 'Base URL or Endpoint' : formData.source_type === 'rss' ? 'RSS Feed URL' : 'Source URL'} <span className="text-[#FF3B30]">*</span>
                  </label>
                  <input
                    type="url"
                    value={formData.careers_url}
                    onChange={(e) => setFormData({ ...formData, careers_url: e.target.value })}
                    className="w-full border border-[#D2D2D7] rounded-lg px-3 py-2 bg-white text-[#1D1D1F] text-body-sm placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:ring-opacity-20 transition-all"
                    placeholder={
                      formData.source_type === 'api' 
                        ? 'https://api.example.com or https://api.example.com/jobs'
                        : formData.source_type === 'rss'
                        ? 'https://example.org/feed.xml'
                        : 'https://example.org/careers'
                    }
                    required
                  />
                </div>

                <div>
                  <label className="block text-caption font-medium text-[#1D1D1F] mb-1">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={formData.org_name}
                    onChange={(e) => setFormData({ ...formData, org_name: e.target.value })}
                    className="w-full border border-[#D2D2D7] rounded-lg px-3 py-2 bg-white text-[#1D1D1F] text-body-sm placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:ring-opacity-20 transition-all"
                    placeholder="Organization name (optional)"
                  />
                </div>

                {/* API Configuration - Show immediately when API is selected */}
                {formData.source_type === 'api' && (
                  <div>
                    <label className="block text-caption font-medium text-[#1D1D1F] mb-1">
                      API Configuration (JSON v1 schema) <span className="text-[#FF3B30]">*</span>
                    </label>
                    <textarea
                      value={formData.parser_hint}
                      onChange={(e) => setFormData({ ...formData, parser_hint: e.target.value })}
                      className="w-full border border-[#D2D2D7] rounded-lg px-3 py-2 bg-white text-[#1D1D1F] font-mono text-caption-sm placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:ring-opacity-20"
                      placeholder='{"v": 1, "base_url": "https://api.example.com", "path": "/jobs", "auth": {...}}'
                      rows={6}
                      required
                    />
                    <p className="mt-1 text-caption-sm text-[#86868B]">
                      Must include version field (v: 1). Use SECRET:NAME for secrets.
                    </p>
                  </div>
                )}

                {/* Advanced Options - Collapsible */}
                <div className="border-t border-[#D2D2D7] pt-3">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between text-caption font-medium text-[#1D1D1F] hover:text-[#0071E3] transition-colors"
                  >
                    <span>Advanced Options</span>
                    {showAdvanced ? (
                      <ChevronUp className="w-3.5 h-3.5 text-[#86868B]" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-[#86868B]" />
                    )}
                  </button>

                  {showAdvanced && (
                    <div className="mt-3 space-y-3 animate-fade-in">
                      <div>
                        <label className="block text-caption-sm font-medium text-[#86868B] mb-1">
                          Organization Type
                        </label>
                        <input
                          type="text"
                          value={formData.org_type}
                          onChange={(e) => setFormData({ ...formData, org_type: e.target.value })}
                          className="w-full border border-[#D2D2D7] rounded-lg px-2.5 py-1.5 bg-white text-[#1D1D1F] text-caption placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:ring-opacity-20"
                          placeholder="e.g., UN, NGO, INGO"
                        />
                      </div>

                      <div>
                        <label className="block text-caption-sm font-medium text-[#86868B] mb-1">
                          Crawl Frequency
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={formData.crawl_frequency_days}
                            onChange={(e) => setFormData({ ...formData, crawl_frequency_days: parseInt(e.target.value) || 3 })}
                            className="w-20 border border-[#D2D2D7] rounded-lg px-2.5 py-1.5 bg-white text-[#1D1D1F] text-caption focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:ring-opacity-20"
                            min="1"
                          />
                          <span className="text-caption-sm text-[#86868B]">days</span>
                        </div>
                      </div>

                      {formData.source_type !== 'api' && (
                        <div>
                          <label className="block text-caption-sm font-medium text-[#86868B] mb-1">
                            Parser Hint
                          </label>
                          <input
                            type="text"
                            value={formData.parser_hint}
                            onChange={(e) => setFormData({ ...formData, parser_hint: e.target.value })}
                            className="w-full border border-[#D2D2D7] rounded-lg px-2.5 py-1.5 bg-white text-[#1D1D1F] text-caption placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:ring-opacity-20"
                            placeholder="Optional: parser-specific hints"
                          />
                        </div>
                      )}

                      {formData.source_type === 'rss' && (
                        <div>
                          <label className="block text-caption-sm font-medium text-[#86868B] mb-1">
                            Time Window
                          </label>
                          <input
                            type="text"
                            value={formData.time_window}
                            onChange={(e) => setFormData({ ...formData, time_window: e.target.value })}
                            className="w-full border border-[#D2D2D7] rounded-lg px-2.5 py-1.5 bg-white text-[#1D1D1F] text-caption placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3] focus:ring-opacity-20"
                            placeholder="e.g., 22:00-05:00"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions - Icon-only buttons */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-[#D2D2D7] bg-[#F5F5F7] relative overflow-visible rounded-b-lg">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                  setEditingSource(null);
                  setShowAdvanced(false);
                  resetForm();
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-[#D2D2D7] hover:bg-[#F5F5F7] transition-colors relative group"
                title="Cancel"
              >
                <XCircle className="w-4 h-4 text-[#86868B]" />
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-[9999] shadow-lg">
                  Cancel
                </span>
              </button>
              <button
                onClick={showAddModal ? handleAddSource : handleEditSource}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-[#D2D2D7] hover:bg-[#F5F5F7] transition-colors relative group"
                title={showAddModal ? 'Create Source' : 'Save Changes'}
              >
                <Check className="w-4 h-4 text-[#86868B]" />
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-[9999] shadow-lg">
                  {showAddModal ? 'Create Source' : 'Save Changes'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Results Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#D2D2D7] rounded-lg shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-title font-semibold text-[#1D1D1F]">Test Results</h2>
                <button
                  onClick={() => {
                    setShowTestModal(false);
                    setTestResult(null);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors"
                >
                  <X className="w-4 h-4 text-[#86868B]" />
                </button>
              </div>

              {testLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D1D1F]"></div>
                  <p className="mt-4 text-caption text-[#86868B]">Testing source...</p>
                </div>
              ) : testResult ? (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg ${testResult.ok ? 'bg-[#30D158] bg-opacity-10 border border-[#30D158] border-opacity-30' : 'bg-[#FF3B30] bg-opacity-10 border border-[#FF3B30] border-opacity-30'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${testResult.ok ? 'bg-[#30D158]' : 'bg-[#FF3B30]'}`}></div>
                      <span className={`text-body-lg font-semibold ${testResult.ok ? 'text-[#30D158]' : 'text-[#FF3B30]'}`}>
                        {testResult.ok ? 'Test Passed' : 'Test Failed'}
                      </span>
                    </div>
                    {testResult.error && (
                      <p className="text-caption text-[#FF3B30]">{testResult.error}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-caption font-medium text-[#86868B] mb-1">Status Code</label>
                      <p className="text-body text-[#1D1D1F]">{testResult.status ?? 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-caption font-medium text-[#86868B] mb-1">Host</label>
                      <p className="text-body text-[#1D1D1F]">{testResult.host ?? 'N/A'}</p>
                    </div>
                    {testResult.count !== undefined && (
                      <div>
                        <label className="block text-caption font-medium text-[#86868B] mb-1">Jobs Found</label>
                        <p className="text-body text-[#1D1D1F]">{testResult.count}</p>
                      </div>
                    )}
                    {testResult.message && (
                      <div className="col-span-2">
                        <label className="block text-caption font-medium text-[#86868B] mb-1">Message</label>
                        <p className="text-body text-[#1D1D1F]">{testResult.message}</p>
                      </div>
                    )}
                    {testResult.size && (
                      <div>
                        <label className="block text-caption font-medium text-[#86868B] mb-1">Content Size</label>
                        <p className="text-body text-[#1D1D1F]">{testResult.size} bytes</p>
                      </div>
                    )}
                    {testResult.etag && (
                      <div>
                        <label className="block text-caption font-medium text-[#86868B] mb-1">ETag</label>
                        <p className="text-caption text-[#1D1D1F] font-mono">{testResult.etag}</p>
                      </div>
                    )}
                    {testResult.last_modified && (
                      <div>
                        <label className="block text-caption font-medium text-[#86868B] mb-1">Last Modified</label>
                        <p className="text-body text-[#1D1D1F]">{testResult.last_modified}</p>
                      </div>
                    )}
                    {testResult.missing_secrets && (
                      <div className="col-span-2">
                        <label className="block text-caption font-medium text-[#FF3B30] mb-1">Missing Secrets</label>
                        <ul className="list-disc list-inside text-caption text-[#FF3B30]">
                          {testResult.missing_secrets.map((secret: string, idx: number) => (
                            <li key={idx}>{secret}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {testResult.first_ids && testResult.first_ids.length > 0 && (
                      <div className="col-span-2">
                        <label className="block text-caption font-medium text-[#86868B] mb-1">First 5 Job IDs</label>
                        <div className="space-y-1">
                          {testResult.first_ids.map((id: string, idx: number) => (
                            <p key={idx} className="text-caption text-[#1D1D1F] font-mono">{id}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {testResult.headers_sanitized && (
                      <div className="col-span-2">
                        <label className="block text-caption font-medium text-[#86868B] mb-1">Headers (Sanitized)</label>
                        <pre className="text-caption-sm bg-[#F5F5F7] p-3 rounded border border-[#D2D2D7] overflow-x-auto font-mono text-[#1D1D1F]">
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
                      className="px-4 py-2 bg-[#0071E3] text-white rounded text-body hover:bg-[#0077ED] transition-colors"
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
          <div className="bg-white border border-[#D2D2D7] rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-title font-semibold text-[#1D1D1F]">Simulation Results</h2>
                <button
                  onClick={() => {
                    setShowSimulateModal(false);
                    setSimulateResult(null);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors"
                >
                  <X className="w-4 h-4 text-[#86868B]" />
                </button>
              </div>

              {simulateLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D1D1F]"></div>
                  <p className="mt-4 text-caption text-[#86868B]">Simulating extraction...</p>
                </div>
              ) : simulateResult ? (
                <div className="space-y-4">
                  {simulateResult.ok ? (
                    <>
                      <div className="p-4 bg-[#30D158] bg-opacity-10 border border-[#30D158] border-opacity-30 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
                          <span className="text-body-lg font-semibold text-[#30D158]">Simulation Successful</span>
                        </div>
                        <p className="text-caption text-[#30D158]">Found {simulateResult.count ?? 0} jobs</p>
                      </div>

                      {simulateResult.sample && Array.isArray(simulateResult.sample) && simulateResult.sample.length > 0 && (
                        <div>
                          <h3 className="text-body-lg font-semibold text-[#1D1D1F] mb-3">Sample Jobs (First 3)</h3>
                          <div className="space-y-4">
                            {simulateResult.sample.map((job: any, idx: number) => (
                              <div key={idx} className="p-4 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg">
                                <div className="grid grid-cols-1 gap-2">
                                  {Object.entries(job).map(([key, value]) => (
                                    <div key={key}>
                                      <label className="block text-caption-sm font-medium text-[#86868B] mb-1">{key}</label>
                                      <p className="text-body text-[#1D1D1F] break-words">
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
                    <div className="p-4 bg-[#FF3B30] bg-opacity-10 border border-[#FF3B30] border-opacity-30 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-[#FF3B30] rounded-full"></div>
                        <span className="text-body-lg font-semibold text-[#FF3B30]">Simulation Failed</span>
                      </div>
                      <p className="text-caption text-[#FF3B30]">{simulateResult.error ?? 'Unknown error'}</p>
                      {simulateResult.error_category && (
                        <p className="text-caption-sm text-[#FF3B30] mt-1 opacity-80">Category: {simulateResult.error_category}</p>
                      )}
                    </div>
                  )}

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => {
                        setShowSimulateModal(false);
                        setSimulateResult(null);
                      }}
                      className="px-4 py-2 bg-[#0071E3] text-white rounded text-body hover:bg-[#0077ED] transition-colors"
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
