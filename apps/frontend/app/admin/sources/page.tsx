'use client';

import { useState, useEffect } from 'react';

type Source = {
  id: string;
  org_name: string | null;
  careers_url: string;
  source_type: string;
  status: string;
  last_crawled_at: string | null;
  last_crawl_status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type SourceFormData = {
  org_name: string;
  careers_url: string;
  source_type: string;
  notes: string;
};

export default function AdminSourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [formData, setFormData] = useState<SourceFormData>({
    org_name: '',
    careers_url: '',
    source_type: 'html',
    notes: '',
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    fetchSources();
  }, [page]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchSources = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/admin/sources?page=${page}&size=${pageSize}`);
      const data = await res.json();
      
      if (data.status === 'ok') {
        setSources(data.data.items);
        setTotal(data.data.total);
      } else {
        showToast('Failed to load sources', 'error');
      }
    } catch (error) {
      showToast('Error loading sources', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const openAddModal = () => {
    setEditingSource(null);
    setFormData({
      org_name: '',
      careers_url: '',
      source_type: 'html',
      notes: '',
    });
    setShowModal(true);
  };

  const openEditModal = (source: Source) => {
    setEditingSource(source);
    setFormData({
      org_name: source.org_name || '',
      careers_url: source.careers_url,
      source_type: source.source_type,
      notes: source.notes || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingSource(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.careers_url.trim()) {
      showToast('Careers URL is required', 'error');
      return;
    }

    try {
      const url = editingSource 
        ? `/admin/sources/${editingSource.id}`
        : '/admin/sources';
      
      const method = editingSource ? 'PATCH' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_name: formData.org_name.trim() || null,
          careers_url: formData.careers_url.trim(),
          source_type: formData.source_type,
          notes: formData.notes.trim() || null,
        }),
      });

      const data = await res.json();

      if (res.ok && data.status === 'ok') {
        showToast(
          editingSource ? 'Source updated successfully' : 'Source added successfully',
          'success'
        );
        closeModal();
        fetchSources();
      } else if (res.status === 409) {
        showToast('A source with this URL already exists', 'error');
      } else {
        showToast(data.error || 'Failed to save source', 'error');
      }
    } catch (error) {
      showToast('Error saving source', 'error');
    }
  };

  const handleDelete = async (source: Source) => {
    if (!confirm(`Are you sure you want to delete source "${source.org_name || source.careers_url}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/admin/sources/${source.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (res.ok && data.status === 'ok') {
        showToast('Source deleted successfully', 'success');
        fetchSources();
      } else {
        showToast(data.error || 'Failed to delete source', 'error');
      }
    } catch (error) {
      showToast('Error deleting source', 'error');
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Sources Management</h1>
            <p className="text-muted-foreground mt-1">
              Manage job board sources ({total} total)
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
          >
            + Add Source
          </button>
        </div>

        {loading ? (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">Loading sources...</p>
          </div>
        ) : sources.length === 0 ? (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">No sources found. Add your first source to get started.</p>
          </div>
        ) : (
          <>
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface-2 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Organization</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Careers URL</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Type</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Last Crawled</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sources.map((source) => (
                    <tr key={source.id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3 text-sm text-foreground">
                        {source.org_name || <span className="text-muted-foreground italic">No name</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <a
                          href={source.careers_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline max-w-md block truncate"
                          title={source.careers_url}
                        >
                          {source.careers_url}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{source.source_type}</td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            source.status === 'active'
                              ? 'bg-accent text-accent-foreground'
                              : source.status === 'deleted'
                              ? 'bg-danger/10 text-danger'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {source.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {source.last_crawled_at ? (
                          <div>
                            <div>{new Date(source.last_crawled_at).toLocaleDateString()}</div>
                            {source.last_crawl_status && (
                              <div className="text-xs">{source.last_crawl_status}</div>
                            )}
                          </div>
                        ) : (
                          <span className="italic">Never</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => openEditModal(source)}
                          className="text-primary hover:underline mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(source)}
                          className="text-danger hover:underline"
                          disabled={source.status === 'deleted'}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 bg-surface border border-border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-2"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 bg-surface border border-border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-2"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-lg max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              {editingSource ? 'Edit Source' : 'Add New Source'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={formData.org_name}
                  onChange={(e) => setFormData({ ...formData, org_name: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g., UNDP, WHO, MSF"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Careers URL <span className="text-danger">*</span>
                </label>
                <input
                  type="url"
                  value={formData.careers_url}
                  onChange={(e) => setFormData({ ...formData, careers_url: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="https://careers.example.org/jobs"
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
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="html">HTML</option>
                  <option value="json">JSON</option>
                  <option value="xml">XML</option>
                  <option value="api">API</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Additional notes or parsing hints"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90"
                >
                  {editingSource ? 'Update' : 'Add'} Source
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-6 py-3 rounded-md shadow-lg z-50 ${
            toast.type === 'success'
              ? 'bg-accent text-accent-foreground'
              : 'bg-danger text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
