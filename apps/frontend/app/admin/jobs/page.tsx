'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Search, Filter, Trash2, RefreshCw, Download, RotateCcw, AlertTriangle,
  CheckCircle, XCircle, Calendar, Building2, Globe, FileText, Info,
  ChevronDown, ChevronUp, Shield, History, Database, Briefcase, X
} from 'lucide-react';

type Job = {
  id: string;
  title: string;
  org_name: string | null;
  location_raw: string | null;
  country_iso: string | null;
  level_norm: string | null;
  deadline: string | null;
  apply_url: string | null;
  status: string;
  source_id: string | null;
  source: {
    id: string;
    org_name: string | null;
    careers_url: string | null;
    status: string | null;
  } | null;
  created_at: string;
  fetched_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
};

type SearchFilters = {
  query: string;
  org_name: string;
  source_id: string;
  status: 'all' | 'active' | 'deleted';
  include_deleted: boolean;
  date_from: string;
  date_to: string;
  sort_by: 'created_at' | 'deadline' | 'title' | 'org_name';
  sort_order: 'asc' | 'desc';
};

type ImpactAnalysis = {
  total_jobs: number;
  active_jobs: number;
  deleted_jobs: number;
  shortlists_count: number;
  risk_level: 'low' | 'medium' | 'high';
};

export default function JobManagementPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [impactAnalysis, setImpactAnalysis] = useState<ImpactAnalysis | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [deletionType, setDeletionType] = useState<'soft' | 'hard'>('soft');
  const [deletionReason, setDeletionReason] = useState('');
  const [exportData, setExportData] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [showJobDetails, setShowJobDetails] = useState<string | null>(null);

  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    org_name: '',
    source_id: '',
    status: 'all',
    include_deleted: false,
    date_from: '',
    date_to: '',
    sort_by: 'created_at',
    sort_order: 'desc',
  });

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.query) params.append('query', filters.query);
      if (filters.org_name) params.append('org_name', filters.org_name);
      if (filters.source_id) params.append('source_id', filters.source_id);
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.include_deleted) params.append('include_deleted', 'true');
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      params.append('page', page.toString());
      params.append('size', size.toString());
      params.append('sort_by', filters.sort_by);
      params.append('sort_order', filters.sort_order);

      const response = await fetch(`/api/admin/jobs/search?${params.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          toast.error('Authentication required. Please login.');
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'ok') {
        setJobs(data.data.items || []);
        setTotal(data.data.total || 0);
      } else {
        throw new Error(data.error || 'Failed to fetch jobs');
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  }, [filters, page, size]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setPage(1);
      fetchJobs();
    }, 500);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [filters.query, filters.org_name]);

  const fetchImpactAnalysis = useCallback(async () => {
    setLoadingImpact(true);
    try {
      const requestBody: any = {};
      if (selectedJobs.size > 0) {
        requestBody.job_ids = Array.from(selectedJobs);
      } else if (filters.org_name) {
        requestBody.org_name = filters.org_name;
      } else if (filters.source_id) {
        requestBody.source_id = filters.source_id;
      }
      if (filters.date_from) requestBody.date_from = filters.date_from;
      if (filters.date_to) requestBody.date_to = filters.date_to;

      const response = await fetch('/api/admin/jobs/impact-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'ok') {
        setImpactAnalysis(data.data);
        setHasAnalyzed(true);
        toast.success('Impact analyzed. Review details and click Delete to proceed.');
      } else {
        throw new Error(data.error || 'Failed to analyze impact');
      }
    } catch (error) {
      console.error('Failed to fetch impact analysis:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to analyze impact');
    } finally {
      setLoadingImpact(false);
    }
  }, [selectedJobs, filters]);

  const handleDelete = async () => {
    // If impact hasn't been analyzed yet, analyze first
    if (!hasAnalyzed) {
      await fetchImpactAnalysis();
      return;
    }

    // Validate that we have something to delete
    if (selectedJobs.size === 0 && !filters.org_name && !filters.source_id) {
      toast.error('Please select at least one job to delete, or use filters (org_name or source_id)');
      return;
    }

    // Validate hard delete requires reason
    if (deletionType === 'hard' && !deletionReason.trim()) {
      toast.error('Deletion reason is required for hard delete');
      return;
    }

    setDeleting(true);
    try {
      const requestBody: any = {
        deletion_type: deletionType,
        deletion_reason: deletionReason || undefined,
        export_data: exportData,
        dry_run: false, // Always false for actual deletion
      };

      if (selectedJobs.size > 0) {
        requestBody.job_ids = Array.from(selectedJobs);
        console.log('[delete] Deleting selected jobs:', Array.from(selectedJobs));
      } else if (filters.org_name) {
        requestBody.org_name = filters.org_name;
        console.log('[delete] Deleting by org_name:', filters.org_name);
      } else if (filters.source_id) {
        requestBody.source_id = filters.source_id;
        console.log('[delete] Deleting by source_id:', filters.source_id);
      }
      if (filters.date_from) requestBody.date_from = filters.date_from;
      if (filters.date_to) requestBody.date_to = filters.date_to;

      console.log('[delete] Request body:', requestBody);
      
      const response = await fetch('/api/admin/jobs/delete-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      console.log('[delete] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[delete] Error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `HTTP ${response.status}`, detail: errorText };
        }
        const errorMessage = errorData.detail || errorData.error || `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('[delete] Response data:', data);
      
      if (data.status === 'ok') {
        const deletedCount = data.data?.deleted_count || 0;
        if (deletedCount === 0) {
          toast.warning('No jobs were deleted. They may have already been deleted or the filters did not match any jobs.');
        } else {
          toast.success(data.data?.message || `Successfully deleted ${deletedCount} job${deletedCount !== 1 ? 's' : ''}`);
        }
        setSelectedJobs(new Set());
        setShowDeleteModal(false);
        setDeletionReason('');
        setExportData(false);
        setImpactAnalysis(null);
        setHasAnalyzed(false);
        fetchJobs();
      } else {
        throw new Error(data.error || data.detail || 'Failed to delete jobs');
      }
    } catch (error) {
      console.error('[delete] Failed to delete jobs:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete jobs');
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async (jobIds: string[]) => {
    try {
      const response = await fetch('/api/admin/jobs/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ job_ids: jobIds }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'ok') {
        toast.success(data.data.message || `Successfully restored ${data.data.restored_count} jobs`);
        setSelectedJobs(new Set());
        fetchJobs();
      } else {
        throw new Error(data.error || 'Failed to restore jobs');
      }
    } catch (error) {
      console.error('Failed to restore jobs:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to restore jobs');
    }
  };

  const handleExport = async () => {
    try {
      const requestBody: any = { format: 'json' };
      if (selectedJobs.size > 0) {
        requestBody.job_ids = Array.from(selectedJobs);
      } else if (filters.org_name) {
        requestBody.org_name = filters.org_name;
      } else if (filters.source_id) {
        requestBody.source_id = filters.source_id;
      }

      const response = await fetch('/api/admin/jobs/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'ok' && data.data.format === 'json') {
        const blob = new Blob([JSON.stringify(data.data.jobs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jobs-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Exported ${data.data.count} jobs`);
      }
    } catch (error) {
      console.error('Failed to export jobs:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to export jobs');
    }
  };

  const toggleSelectJob = (jobId: string) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId);
    } else {
      newSelected.add(jobId);
    }
    setSelectedJobs(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedJobs.size === jobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(jobs.map(j => j.id)));
    }
  };

  const getRiskColor = (risk: string) => {
    if (risk === 'high') return 'text-red-600 bg-red-50 border-red-200';
    if (risk === 'medium') return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-medium text-[#1D1D1F] mb-1 flex items-center gap-2">
                <Briefcase className="w-6 h-6" />
                Job Management
              </h1>
              <p className="text-[#86868B]">Search, filter, and manage jobs across all sources</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="px-3 py-2 bg-[#F5F5F7] text-[#1D1D1F] rounded-lg hover:bg-[#E5E5E7] transition-colors flex items-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
              <button
                onClick={fetchJobs}
                disabled={loading}
                className="px-3 py-2 bg-[#007AFF] text-white rounded-lg hover:bg-[#0051D5] transition-colors flex items-center gap-2 disabled:opacity-50 text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Result summary */}
          <div className="flex items-center justify-between mb-3 text-xs text-[#86868B]">
            <div>
              {total > 0
                ? `Showing ${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total} jobs` +
                  (filters.org_name
                    ? ` for "${filters.org_name}"`
                    : filters.query
                    ? ` for "${filters.query}"`
                    : '')
                : 'No jobs match the current filters'}
            </div>
          </div>

          {/* Search and Quick Filters */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#86868B]" />
              <input
                type="text"
                placeholder="Search jobs by title, organization, or description..."
                value={filters.query}
                onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 border border-[#D2D2D7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007AFF] focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Organization name..."
                value={filters.org_name}
                onChange={(e) => setFilters({ ...filters, org_name: e.target.value })}
                className="px-3 py-2 border border-[#D2D2D7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007AFF] focus:border-transparent w-56 text-sm"
              />
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 text-sm ${
                  showFilters ? 'bg-[#007AFF] text-white' : 'bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E5E5E7]'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
                {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="p-4 bg-[#F5F5F7] rounded-lg border border-[#D2D2D7] mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Source ID</label>
                  <input
                    type="text"
                    value={filters.source_id}
                    onChange={(e) => setFilters({ ...filters, source_id: e.target.value })}
                    placeholder="Source UUID..."
                    className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Status</label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="deleted">Deleted</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Sort By</label>
                  <select
                    value={filters.sort_by}
                    onChange={(e) => setFilters({ ...filters, sort_by: e.target.value as any })}
                    className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                  >
                    <option value="created_at">Created Date</option>
                    <option value="deadline">Deadline</option>
                    <option value="title">Title</option>
                    <option value="org_name">Organization</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Date From</label>
                  <input
                    type="date"
                    value={filters.date_from}
                    onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                    className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Date To</label>
                  <input
                    type="date"
                    value={filters.date_to}
                    onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                    className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.include_deleted}
                      onChange={(e) => setFilters({ ...filters, include_deleted: e.target.checked })}
                      className="w-4 h-4 text-[#007AFF] border-[#D2D2D7] rounded focus:ring-[#007AFF]"
                    />
                    <span className="text-sm text-[#1D1D1F]">Include Deleted</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Selection Actions */}
          {selectedJobs.size > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-blue-900">
                  {selectedJobs.size} job{selectedJobs.size !== 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={() => setSelectedJobs(new Set())}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Clear selection
                </button>
              </div>
              <div className="flex items-center gap-2">
                {jobs.filter(j => j.deleted_at).length > 0 && (
                  <button
                    onClick={() => handleRestore(Array.from(selectedJobs))}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5 text-xs"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Restore</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowDeleteModal(true);
                    setImpactAnalysis(null);
                    setHasAnalyzed(false);
                  }}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5 text-xs"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Jobs Table */}
        <div className="bg-white rounded-lg border border-[#D2D2D7] overflow-hidden">
          <div className="w-full">
            <table className="min-w-full table-fixed">
              <thead className="bg-[#F5F5F7] border-b border-[#D2D2D7]">
                <tr>
                  <th className="px-3 py-2 text-left w-10">
                    <input
                      type="checkbox"
                      checked={selectedJobs.size === jobs.length && jobs.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-[#007AFF] border-[#D2D2D7] rounded focus:ring-[#007AFF]"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#1D1D1F] w-2/6">Title</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#1D1D1F] w-1/6">Organization</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#1D1D1F] hidden md:table-cell w-1/6">Location</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#1D1D1F] hidden lg:table-cell w-1/12">Deadline</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#1D1D1F] hidden lg:table-cell w-1/6">Source</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#1D1D1F] w-1/12">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#1D1D1F] hidden lg:table-cell w-1/12">Created</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#1D1D1F] w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D2D2D7]">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#86868B]" />
                      <p className="text-[#86868B]">Loading jobs...</p>
                    </td>
                  </tr>
                ) : jobs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center">
                      <Database className="w-12 h-12 mx-auto mb-4 text-[#86868B]" />
                      <p className="text-[#86868B]">No jobs found</p>
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr
                      key={job.id}
                      className={`hover:bg-[#F5F5F7] transition-colors ${
                        job.deleted_at ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedJobs.has(job.id)}
                          onChange={() => toggleSelectJob(job.id)}
                          className="w-4 h-4 text-[#007AFF] border-[#D2D2D7] rounded focus:ring-[#007AFF]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-sm font-medium text-[#1D1D1F] truncate max-w-xs">{job.title || 'N/A'}</div>
                        {job.level_norm && (
                          <div className="text-[11px] text-[#86868B] mt-0.5 capitalize">{job.level_norm}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-sm text-[#1D1D1F] truncate max-w-[10rem]">{job.org_name || 'N/A'}</div>
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <div className="text-xs text-[#86868B] truncate max-w-[10rem]">{job.location_raw || 'N/A'}</div>
                        {job.country_iso && (
                          <div className="text-[11px] text-[#86868B] mt-0.5">{job.country_iso}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell">
                        <div className="text-xs text-[#86868B]">{formatDate(job.deadline)}</div>
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell">
                        {job.source ? (
                          <div className="text-xs">
                            <div className="text-[#1D1D1F] truncate max-w-[10rem]">{job.source.org_name || 'N/A'}</div>
                            <div className="text-[11px] text-[#86868B] mt-0.5">
                              {job.source.status === 'deleted' ? (
                                <span className="text-red-600">Source Deleted</span>
                              ) : (
                                job.source_id?.substring(0, 8) || 'N/A'
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-[#86868B]">Source not found</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {job.deleted_at ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-600 border border-red-200">
                            <XCircle className="w-3 h-3" />
                            Deleted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-600 border border-green-200">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell">
                        <div className="text-xs text-[#86868B]">{formatDate(job.created_at)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {job.deleted_at ? (
                            <button
                              onClick={() => handleRestore([job.id])}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors group"
                              aria-label="Restore job"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedJobs(new Set([job.id]));
                                setShowDeleteModal(true);
                                setImpactAnalysis(null);
                                setHasAnalyzed(false);
                              }}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors group"
                              aria-label="Delete job"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setShowJobDetails(job.id)}
                            className="p-1.5 text-[#007AFF] hover:bg-blue-50 rounded-lg transition-colors group"
                            aria-label="View details"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 0 && (
          <div className="px-6 py-4 border-t border-[#D2D2D7] flex items-center justify-between">
            <div className="text-sm text-[#86868B]">
              Showing {(page - 1) * size + 1} to {Math.min(page * size, total)} of {total} jobs
            </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-[#D2D2D7] rounded-lg hover:bg-[#F5F5F7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="px-4 py-1.5 text-sm text-[#1D1D1F]">
                  Page {page} of {Math.ceil(total / size)}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(Math.ceil(total / size), p + 1))}
                  disabled={page >= Math.ceil(total / size)}
                  className="px-3 py-1.5 border border-[#D2D2D7] rounded-lg hover:bg-[#F5F5F7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto shadow-lg">
            <div className="sticky top-0 bg-white border-b border-[#D2D2D7] px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#1D1D1F] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                Delete Jobs
              </h2>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setImpactAnalysis(null);
                  setHasAnalyzed(false);
                }}
                className="p-1.5 hover:bg-[#F5F5F7] rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-[#86868B]" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Impact Analysis Preview */}
              {loadingImpact ? (
                <div className="p-3 bg-[#F5F5F7] rounded-lg border border-[#D2D2D7]">
                  <div className="flex items-center gap-2 text-[#86868B]">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span className="text-xs">Analyzing deletion impact...</span>
                  </div>
                </div>
              ) : impactAnalysis ? (
                <div className={`p-3 rounded-lg border-2 ${getRiskColor(impactAnalysis.risk_level)}`}>
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold mb-2">Deletion Impact</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[#86868B]">Total:</span>
                          <span className="font-semibold ml-1">{impactAnalysis.total_jobs}</span>
                        </div>
                        <div>
                          <span className="text-[#86868B]">Active:</span>
                          <span className="font-semibold ml-1">{impactAnalysis.active_jobs}</span>
                        </div>
                        <div>
                          <span className="text-[#86868B]">Shortlists:</span>
                          <span className="font-semibold ml-1">{impactAnalysis.shortlists_count}</span>
                        </div>
                        <div>
                          <span className="text-[#86868B]">Risk:</span>
                          <span className={`font-semibold ml-1 capitalize ${impactAnalysis.risk_level === 'high' ? 'text-red-600' : impactAnalysis.risk_level === 'medium' ? 'text-yellow-600' : 'text-green-600'}`}>
                            {impactAnalysis.risk_level}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Deletion Type */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#1D1D1F] flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  Deletion Type
                </label>
                <div className="flex gap-2">
                  <label className="flex-1 p-2.5 border-2 rounded-lg cursor-pointer transition-all hover:bg-[#F5F5F7]">
                    <input
                      type="radio"
                      name="deletionType"
                      value="soft"
                      checked={deletionType === 'soft'}
                      onChange={(e) => setDeletionType(e.target.value as 'soft' | 'hard')}
                      className="mr-1.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-[#1D1D1F]">Soft Delete</div>
                      <div className="text-[11px] text-[#86868B] mt-0.5">Recoverable</div>
                    </div>
                  </label>
                  <label className="flex-1 p-2.5 border-2 rounded-lg cursor-pointer transition-all hover:bg-[#F5F5F7]">
                    <input
                      type="radio"
                      name="deletionType"
                      value="hard"
                      checked={deletionType === 'hard'}
                      onChange={(e) => setDeletionType(e.target.value as 'soft' | 'hard')}
                      className="mr-1.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-[#1D1D1F]">Hard Delete</div>
                      <div className="text-[11px] text-[#86868B] mt-0.5">Permanent</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Deletion Reason */}
              {deletionType === 'hard' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#1D1D1F]">
                    Deletion Reason <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    value={deletionReason}
                    onChange={(e) => setDeletionReason(e.target.value)}
                    placeholder="Required for audit trail..."
                    className="w-full px-2.5 py-2 border border-[#D2D2D7] rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#007AFF] focus:border-transparent"
                    rows={2}
                  />
                </div>
              )}

              {/* Export Option */}
              <div className="p-3 bg-[#F5F5F7] rounded-lg border border-[#D2D2D7]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportData}
                    onChange={(e) => setExportData(e.target.checked)}
                    className="w-3.5 h-3.5 text-[#007AFF] border-[#D2D2D7] rounded focus:ring-[#007AFF]"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-medium text-[#1D1D1F]">Export data before deletion</span>
                    <p className="text-[11px] text-[#86868B] mt-0.5">Download as JSON</p>
                  </div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleDelete}
                  disabled={deleting || loadingImpact || (hasAnalyzed && deletionType === 'hard' && !deletionReason.trim())}
                  className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-1.5"
                >
                  {deleting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : loadingImpact ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      {hasAnalyzed ? (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          {deletionType === 'soft' ? 'Soft Delete' : 'Hard Delete'}
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Analyze Impact
                        </>
                      )}
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setImpactAnalysis(null);
                    setHasAnalyzed(false);
                  }}
                  className="px-3 py-2 bg-[#F5F5F7] text-[#1D1D1F] rounded-lg hover:bg-[#E5E5E7] transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job Details Modal */}
      {showJobDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#D2D2D7] px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[#1D1D1F]">Job Details</h2>
              <button
                onClick={() => setShowJobDetails(null)}
                className="p-2 hover:bg-[#F5F5F7] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#86868B]" />
              </button>
            </div>
            <div className="p-6">
              {(() => {
                const job = jobs.find(j => j.id === showJobDetails);
                if (!job) return <p className="text-[#86868B]">Job not found</p>;
                return (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-[#1D1D1F] mb-2">{job.title}</h3>
                      <p className="text-sm text-[#86868B]">{job.org_name}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-[#86868B] mb-1">Location</div>
                        <div className="text-sm text-[#1D1D1F]">{job.location_raw || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#86868B] mb-1">Deadline</div>
                        <div className="text-sm text-[#1D1D1F]">{formatDate(job.deadline)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#86868B] mb-1">Level</div>
                        <div className="text-sm text-[#1D1D1F] capitalize">{job.level_norm || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#86868B] mb-1">Status</div>
                        <div className="text-sm text-[#1D1D1F]">{job.deleted_at ? 'Deleted' : 'Active'}</div>
                      </div>
                    </div>
                    {job.apply_url && (
                      <div>
                        <div className="text-xs text-[#86868B] mb-1">Apply URL</div>
                        <a
                          href={job.apply_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#007AFF] hover:underline break-all"
                        >
                          {job.apply_url}
                        </a>
                      </div>
                    )}
                    {job.deleted_at && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="text-xs text-red-600 mb-1">Deleted Information</div>
                        <div className="text-sm text-red-900">
                          <div>Deleted at: {formatDate(job.deleted_at)}</div>
                          {job.deleted_by && <div>Deleted by: {job.deleted_by}</div>}
                          {job.deletion_reason && <div>Reason: {job.deletion_reason}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
