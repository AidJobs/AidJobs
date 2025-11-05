'use client';

import { useState, useEffect } from 'react';
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

  useEffect(() => {
    fetchSources();
  }, [page, statusFilter, searchQuery]);

  const fetchSources = async () => {
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
  };

  const handleAddSource = async () => {
    try {
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
        const error = await res.json();
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
        const error = await res.json();
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
    try {
      const res = await fetch(`/api/admin/sources/${id}/test`, {
        method: 'POST',
        credentials: 'include',
      });

      const result = await res.json();

      if (result.ok) {
        toast.success(`Test passed: ${result.status} (${result.host})`);
      } else {
        toast.error(`Test failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to test source:', error);
      toast.error('Failed to test source');
    }
  };

  const handleSimulateExtract = async (id: string) => {
    toast.info('Simulating extraction...');
    
    try {
      const res = await fetch(`/api/admin/sources/${id}/simulate_extract`, {
        method: 'POST',
        credentials: 'include',
      });

      const result = await res.json();

      if (result.ok) {
        console.log('Simulation results:', result.sample);
        toast.success(`Found ${result.count} jobs. Check console for first 3.`);
      } else {
        toast.error(`Simulation failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to simulate extract:', error);
      toast.error('Failed to simulate extract');
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
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Sources Management</h1>
            <p className="text-muted-foreground mt-1">Manage job board crawl sources</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90"
          >
            Add Source
          </button>
        </div>

        <div className="bg-surface border border-border rounded-lg shadow mb-6 p-4">
          <div className="flex gap-4 items-center">
            <div>
              <label className="text-sm text-muted-foreground mr-2">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="border border-border rounded px-3 py-1 bg-background text-foreground"
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
                className="w-full border border-border rounded px-3 py-1 bg-background text-foreground"
              />
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : sources.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No sources found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-2 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Org</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">URL</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Freq (d)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Next run</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Last crawl</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Last status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sources.map((source) => (
                    <tr key={source.id} className="hover:bg-surface-2">
                      <td className="px-4 py-3 text-sm text-foreground">{source.org_name || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        <a href={source.careers_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {source.careers_url.substring(0, 40)}...
                        </a>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{source.source_type}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          source.status === 'active' ? 'bg-accent text-accent-foreground' :
                          source.status === 'paused' ? 'bg-muted text-muted-foreground' :
                          'bg-danger/10 text-danger'
                        }`}>
                          {source.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{source.crawl_frequency_days || '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(source.next_run_at)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(source.last_crawled_at)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          source.last_crawl_status === 'success' ? 'bg-accent text-accent-foreground' :
                          source.last_crawl_status === 'error' ? 'bg-danger/10 text-danger' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {source.last_crawl_status || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleRunNow(source.id)}
                            className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:opacity-90"
                          >
                            Run
                          </button>
                          <button
                            onClick={() => handleToggleStatus(source)}
                            className={`text-xs px-2 py-1 rounded ${
                              source.status === 'active'
                                ? 'bg-muted text-muted-foreground hover:opacity-90'
                                : 'bg-accent text-accent-foreground hover:opacity-90'
                            }`}
                          >
                            {source.status === 'active' ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            onClick={() => openEditModal(source)}
                            className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded hover:opacity-90"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteSource(source.id)}
                            className="text-xs px-2 py-1 bg-danger/10 text-danger rounded hover:bg-danger/20"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => handleTestSource(source.id)}
                            className="text-xs px-2 py-1 bg-surface-2 text-foreground rounded hover:bg-muted"
                          >
                            Test
                          </button>
                          <button
                            onClick={() => handleSimulateExtract(source.id)}
                            className="text-xs px-2 py-1 bg-surface-2 text-foreground rounded hover:bg-muted"
                          >
                            Simulate
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
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border border-border rounded disabled:opacity-50 hover:bg-surface-2"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-foreground">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-border rounded disabled:opacity-50 hover:bg-surface-2"
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
          <div className="bg-surface border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-foreground mb-4">
                {showAddModal ? 'Add Source' : 'Edit Source'}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={formData.org_name}
                    onChange={(e) => setFormData({ ...formData, org_name: e.target.value })}
                    className="w-full border border-border rounded px-3 py-2 bg-background text-foreground"
                    placeholder="e.g., UNICEF"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Careers URL *
                  </label>
                  <input
                    type="url"
                    value={formData.careers_url}
                    onChange={(e) => setFormData({ ...formData, careers_url: e.target.value })}
                    className="w-full border border-border rounded px-3 py-2 bg-background text-foreground"
                    placeholder="https://example.org/careers"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Source Type
                  </label>
                  <select
                    value={formData.source_type}
                    onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                    className="w-full border border-border rounded px-3 py-2 bg-background text-foreground"
                  >
                    <option value="html">HTML</option>
                    <option value="rss">RSS</option>
                    <option value="api">API</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Organization Type
                  </label>
                  <input
                    type="text"
                    value={formData.org_type}
                    onChange={(e) => setFormData({ ...formData, org_type: e.target.value })}
                    className="w-full border border-border rounded px-3 py-2 bg-background text-foreground"
                    placeholder="e.g., UN, NGO, INGO"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Crawl Frequency (days)
                  </label>
                  <input
                    type="number"
                    value={formData.crawl_frequency_days}
                    onChange={(e) => setFormData({ ...formData, crawl_frequency_days: parseInt(e.target.value) })}
                    className="w-full border border-border rounded px-3 py-2 bg-background text-foreground"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Parser Hint
                  </label>
                  <input
                    type="text"
                    value={formData.parser_hint}
                    onChange={(e) => setFormData({ ...formData, parser_hint: e.target.value })}
                    className="w-full border border-border rounded px-3 py-2 bg-background text-foreground"
                    placeholder="Optional: parser-specific hints"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Time Window (days)
                  </label>
                  <input
                    type="text"
                    value={formData.time_window}
                    onChange={(e) => setFormData({ ...formData, time_window: e.target.value })}
                    className="w-full border border-border rounded px-3 py-2 bg-background text-foreground"
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
                  className="px-4 py-2 border border-border rounded hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  onClick={showAddModal ? handleAddSource : handleEditSource}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90"
                >
                  {showAddModal ? 'Create Source' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
