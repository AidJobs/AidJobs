'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Upload, Play, Pause, Edit, Trash2, TestTube, FileCode, Download, X, ChevronDown, ChevronUp, Sparkles, Check, XCircle, Info, AlertTriangle, FileDown, Shield, History, Database } from 'lucide-react';

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
  last_crawl_message: string | null;
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
  const [showCrawlDetails, setShowCrawlDetails] = useState(false);
  const [selectedSourceForDetails, setSelectedSourceForDetails] = useState<Source | null>(null);
  const [crawlLogs, setCrawlLogs] = useState<any[]>([]);
  const [loadingCrawlLogs, setLoadingCrawlLogs] = useState(false);
  // Track which source was just crawled to give clear visual feedback
  const [recentlyRanSourceId, setRecentlyRanSourceId] = useState<string | null>(null);
  // Ref to track auto-refresh interval
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Health scores for sources
  const [healthScores, setHealthScores] = useState<Record<string, { score: number; priority: number }>>({});
  // Job deletion state
  const [showDeleteJobsModal, setShowDeleteJobsModal] = useState(false);
  const [sourceToDeleteJobs, setSourceToDeleteJobs] = useState<Source | null>(null);
  const [deletingJobs, setDeletingJobs] = useState(false);
  const [deletionType, setDeletionType] = useState<'soft' | 'hard'>('soft');
  const [deleteJobsTriggerCrawl, setDeleteJobsTriggerCrawl] = useState(true);
  const [deleteJobsDryRun, setDeleteJobsDryRun] = useState(true);
  const [deleteJobsExportData, setDeleteJobsExportData] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [deletionImpact, setDeletionImpact] = useState<any>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [deletionResult, setDeletionResult] = useState<any>(null);
  const [showDeletionResult, setShowDeletionResult] = useState(false);
  const [formData, setFormData] = useState<SourceFormData>({
    org_name: '',
    careers_url: '',
    source_type: 'html',
    org_type: '',
    crawl_frequency_days: 3,
    parser_hint: '',
    time_window: '',
  });

  // Draggable modal state - separate position for each modal
  const [addEditModalPosition, setAddEditModalPosition] = useState({ x: 0, y: 0 });
  const [testModalPosition, setTestModalPosition] = useState({ x: 0, y: 0 });
  const [simulateModalPosition, setSimulateModalPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeModalRef, setActiveModalRef] = useState<React.RefObject<HTMLDivElement> | null>(null);
  const addEditModalRef = useRef<HTMLDivElement>(null);
  const testModalRef = useRef<HTMLDivElement>(null);
  const simulateModalRef = useRef<HTMLDivElement>(null);

  const pageSize = 20;

  // Draggable modal handlers
  const handleMouseDown = (e: React.MouseEvent, modalRef: React.RefObject<HTMLDivElement>, getPosition: () => { x: number; y: number }) => {
    const target = e.target as HTMLElement;
    const header = target.closest('.modal-header');
    if (header && !target.closest('button') && modalRef.current) {
      setIsDragging(true);
      setActiveModalRef(modalRef);
      const currentPos = getPosition();
      setDragStart({
        x: e.clientX - currentPos.x,
        y: e.clientY - currentPos.y,
      });
      e.preventDefault();
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && activeModalRef?.current) {
        const modal = activeModalRef.current;
        const container = modal.closest('.fixed.inset-0') as HTMLElement;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const newX = e.clientX - dragStart.x;
          const newY = e.clientY - dragStart.y;
          
          // Determine which modal is being dragged and update its position
          if (activeModalRef === addEditModalRef) {
            setAddEditModalPosition({
              x: Math.max(-containerRect.width / 2, Math.min(containerRect.width / 2, newX)),
              y: Math.max(-containerRect.height / 2, Math.min(containerRect.height / 2, newY)),
            });
          } else if (activeModalRef === testModalRef) {
            setTestModalPosition({
              x: Math.max(-containerRect.width / 2, Math.min(containerRect.width / 2, newX)),
              y: Math.max(-containerRect.height / 2, Math.min(containerRect.height / 2, newY)),
            });
          } else if (activeModalRef === simulateModalRef) {
            setSimulateModalPosition({
              x: Math.max(-containerRect.width / 2, Math.min(containerRect.width / 2, newX)),
              y: Math.max(-containerRect.height / 2, Math.min(containerRect.height / 2, newY)),
            });
          }
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setActiveModalRef(null);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, dragStart, activeModalRef]);

  // Track which source is currently running a manual crawl
  // AbortController ref for race condition protection
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSources = useCallback(async () => {
    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
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
        signal: abortController.signal,
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to fetch sources');
      }

      const json = await res.json();
      if (json.status === 'ok' && json.data) {
        setSources(json.data.items || []);
        setTotal(json.data.total || 0);
      } else {
        console.error('Invalid sources response:', json);
        setSources([]);
        setTotal(0);
      }
    } catch (error) {
      // Ignore abort errors (request was cancelled)
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch sources:', error);
      toast.error('Failed to fetch sources');
    } finally {
      // Only set loading to false if this is the current request
      if (abortControllerRef.current === abortController) {
        setLoading(false);
      }
    }
  }, [page, statusFilter, searchQuery, router]);

  useEffect(() => {
    fetchSources();
  }, [page, statusFilter, searchQuery, fetchSources]);

  // Fetch deletion impact
  const fetchDeletionImpact = useCallback(async (sourceId: string) => {
    setLoadingImpact(true);
    try {
      const res = await fetch(`/api/admin/crawl/deletion-impact/${sourceId}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch deletion impact');
      }

      const data = await res.json();
      if (data.status === 'ok' && data.impact) {
        setDeletionImpact(data.impact);
      }
    } catch (error) {
      console.error('Failed to fetch deletion impact:', error);
      toast.error('Failed to load deletion impact');
    } finally {
      setLoadingImpact(false);
    }
  }, []);

  // Fetch health scores for sources
  useEffect(() => {
    const fetchHealthScores = async () => {
      if (sources.length === 0) return;
      
      try {
        const scores: Record<string, { score: number; priority: number }> = {};
        
        // Fetch health scores for all sources (in batches to avoid overwhelming the API)
        const batchSize = 10;
        for (let i = 0; i < sources.length; i += batchSize) {
          const batch = sources.slice(i, i + batchSize);
          const promises = batch.map(async (source) => {
            try {
              const response = await fetch(`/api/admin/crawl/analytics/source/${source.id}`, {
                credentials: 'include',
              });
              if (response.ok) {
                const data = await response.json();
                if (data.status === 'ok' && data.data?.health) {
                  return {
                    sourceId: source.id,
                    score: data.data.health.score,
                    priority: data.data.health.priority,
                  };
                }
              }
            } catch (error) {
              console.error(`Failed to fetch health for source ${source.id}:`, error);
            }
            return null;
          });
          
          const results = await Promise.all(promises);
          results.forEach((result) => {
            if (result) {
              scores[result.sourceId] = { score: result.score, priority: result.priority };
            }
          });
        }
        
        setHealthScores(scores);
      } catch (error) {
        console.error('Failed to fetch health scores:', error);
      }
    };
    
    if (sources.length > 0) {
      fetchHealthScores();
    }
  }, [sources]);

  // Refresh source data and crawl logs when drawer is open
  // Shared helper to refresh source + crawl logs for a given source id
  const refreshCrawlDetails = useCallback(
    async (sourceId: string, silent: boolean = false) => {
      if (!silent) {
        setLoadingCrawlLogs(true);
      }
      try {
        // Fetch fresh source data - use cache: 'no-store' and timestamp to ensure fresh data
        const sourceRes = await fetch(`/api/admin/sources?page=1&size=100&status=all&_t=${Date.now()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (sourceRes.ok) {
          const sourceJson = await sourceRes.json();
          if (sourceJson.status === 'ok' && sourceJson.data?.items) {
            const freshSource = sourceJson.data.items.find((s: Source) => s.id === sourceId);
            if (freshSource) {
              setSelectedSourceForDetails(freshSource);
            }
          }
        }

        // Refresh crawl logs - always fetch fresh data with timestamp to bust cache
        const logsRes = await fetch(`/api/admin/crawl/logs?source_id=${sourceId}&limit=10&_t=${Date.now()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (logsRes.ok) {
          const logsJson = await logsRes.json();
          if (logsJson.status === 'ok' && logsJson.data && Array.isArray(logsJson.data)) {
            setCrawlLogs(logsJson.data);
            console.log(`[CrawlDetails] Refreshed logs for ${sourceId}:`, logsJson.data.length, 'logs');
          } else {
            console.warn(`[CrawlDetails] Invalid logs response for ${sourceId}:`, logsJson);
            setCrawlLogs([]);
          }
        } else {
          console.error(`[CrawlDetails] Failed to fetch logs for ${sourceId}:`, logsRes.status);
          setCrawlLogs([]);
        }
      } catch (error) {
        console.error(`[CrawlDetails] Error refreshing details for ${sourceId}:`, error);
      } finally {
        if (!silent) {
          setLoadingCrawlLogs(false);
        }
      }
    },
    []
  );

  // Auto-refresh source data and crawl logs when drawer is open
  useEffect(() => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    if (showCrawlDetails && selectedSourceForDetails?.id) {
      const sourceId = selectedSourceForDetails.id;
      console.log(`[CrawlDetails] Starting auto-refresh for source ${sourceId}`);
      
      // Refresh immediately
      refreshCrawlDetails(sourceId, false);
      
      // Set up interval for auto-refresh every 2 seconds
      refreshIntervalRef.current = setInterval(() => {
        console.log(`[CrawlDetails] Auto-refreshing for source ${sourceId}`);
        refreshCrawlDetails(sourceId, true); // Silent refresh (no loading spinner)
      }, 2000);

      // Cleanup on unmount or when dependencies change
      return () => {
        if (refreshIntervalRef.current) {
          console.log(`[CrawlDetails] Stopping auto-refresh for source ${sourceId}`);
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    }
  }, [showCrawlDetails, selectedSourceForDetails?.id, refreshCrawlDetails]);

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

  const [exportingSourceId, setExportingSourceId] = useState<string | null>(null);

  const handleExportSource = async (id: string) => {
    if (exportingSourceId) {
      return;
    }

    setExportingSourceId(id);
    try {
      toast.info('Exporting source...');
      
      const res = await fetch(`/api/admin/sources/${id}/export`, {
        method: 'GET',
        credentials: 'include',
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        console.error('Export source error:', res.status, errorText, 'Source ID:', id);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText, detail: errorText };
        }
        const errorMsg = errorData.error || errorData.detail || `HTTP ${res.status}: Failed to export source`;
        throw new Error(errorMsg);
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
      } else {
        throw new Error(json.error || 'Invalid export response');
      }
    } catch (error) {
      console.error('Failed to export source:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to export source';
      toast.error(errorMsg);
    } finally {
      setExportingSourceId(null);
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

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        const errorMsg = errorData.error || errorData.detail || `HTTP ${res.status}: Failed to create source`;
        throw new Error(errorMsg);
      }

      const json = await res.json();
      if (json.status === 'ok') {
        toast.success('Source created and queued for crawl');
        setShowAddModal(false);
        setAddEditModalPosition({ x: 0, y: 0 });
        resetForm();
        fetchSources();
      } else {
        throw new Error(json.error || 'Failed to create source');
      }
    } catch (error: any) {
      console.error('Failed to create source:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to create source';
      toast.error(errorMsg);
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
      
      // Always include fields that might have changed
      updates.org_name = formData.org_name || null;
      updates.careers_url = formData.careers_url;
      updates.source_type = formData.source_type;
      updates.org_type = formData.org_type || null;
      updates.crawl_frequency_days = formData.crawl_frequency_days;
      updates.parser_hint = formData.parser_hint || null;
      updates.time_window = formData.time_window || null;

      const res = await fetch(`/api/admin/sources/${editingSource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        const errorMsg = errorData.error || errorData.detail || `HTTP ${res.status}: Failed to update source`;
        throw new Error(errorMsg);
      }

      const json = await res.json();
      if (json.status === 'ok') {
        toast.success('Source updated successfully');
        setShowEditModal(false);
        setEditingSource(null);
        setAddEditModalPosition({ x: 0, y: 0 });
        resetForm();
        fetchSources();
      } else {
        throw new Error(json.error || 'Failed to update source');
      }
    } catch (error: any) {
      console.error('Failed to update source:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to update source';
      toast.error(errorMsg);
    }
  };

  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);

  const handleDeleteJobs = useCallback((source: Source) => {
    setSourceToDeleteJobs(source);
    setShowDeleteJobsModal(true);
    setDeletionImpact(null);
    setDeletionResult(null);
    setShowDeletionResult(false);
    // Fetch deletion impact
    fetchDeletionImpact(source.id);
  }, [fetchDeletionImpact]);

  const confirmDeleteJobs = useCallback(async () => {
    if (!sourceToDeleteJobs) return;

    if (deletionType === 'hard' && !deletionReason.trim()) {
      toast.error('Deletion reason is required for hard delete');
      return;
    }

    setDeletingJobs(true);
    try {
      const res = await fetch('/api/admin/crawl/delete-jobs-by-source', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          source_id: sourceToDeleteJobs.id,
          deletion_type: deletionType,
          trigger_crawl: deleteJobsTriggerCrawl,
          dry_run: deleteJobsDryRun,
          deletion_reason: deletionReason || undefined,
          export_data: deleteJobsExportData,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Failed to delete jobs');
      }

      if (data.status === 'ok') {
        setDeletionResult(data);
        if (deleteJobsDryRun) {
          setShowDeletionResult(true);
        } else {
          toast.success(`Successfully ${deletionType === 'soft' ? 'soft-deleted' : 'hard-deleted'} ${data.data?.deleted_count || 0} jobs`);
          setShowDeleteJobsModal(false);
          setSourceToDeleteJobs(null);
          setDeletionResult(null);
          setDeletionReason('');
          setDeleteJobsDryRun(true);
          setDeleteJobsTriggerCrawl(true);
          setDeleteJobsExportData(false);
          // Refresh sources list
          fetchSources();
        }
      } else {
        throw new Error(data.error || 'Failed to delete jobs');
      }
    } catch (error) {
      console.error('Failed to delete jobs:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete jobs');
    } finally {
      setDeletingJobs(false);
    }
  }, [sourceToDeleteJobs, deletionType, deletionReason, deleteJobsTriggerCrawl, deleteJobsDryRun, deleteJobsExportData, fetchSources]);

  const handleDeleteSource = async (id: string) => {
    if (!confirm('Are you sure you want to delete this source? This action cannot be undone.')) return;

    setDeletingSourceId(id);
    try {
      toast.info('Deleting source...');
      
      const res = await fetch(`/api/admin/sources/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        console.error('Delete source error:', res.status, errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText, detail: errorText };
        }
        const errorMsg = errorData.error || errorData.detail || `HTTP ${res.status}: Failed to delete source`;
        throw new Error(errorMsg);
      }

      const json = await res.json();
      if (json.status === 'ok') {
        toast.success('Source deleted successfully');
        fetchSources();
      } else {
        throw new Error(json.error || 'Failed to delete source');
      }
    } catch (error) {
      console.error('Failed to delete source:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to delete source';
      toast.error(errorMsg);
    } finally {
      setDeletingSourceId(null);
    }
  };

  const [togglingSourceId, setTogglingSourceId] = useState<string | null>(null);

  const handleToggleStatus = async (source: Source) => {
    if (togglingSourceId) {
      return; // Prevent multiple simultaneous toggles
    }

    const newStatus = source.status === 'active' ? 'paused' : 'active';
    setTogglingSourceId(source.id);
    
    try {
      const res = await fetch(`/api/admin/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        console.error('Toggle status error:', res.status, errorText, 'Source ID:', source.id);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText, detail: errorText };
        }
        const errorMsg = errorData.error || errorData.detail || `HTTP ${res.status}: Failed to update status`;
        throw new Error(errorMsg);
      }

      const json = await res.json();
      if (json.status === 'ok') {
        toast.success(`Source ${newStatus === 'active' ? 'resumed' : 'paused'} successfully`);
        fetchSources();
      } else {
        throw new Error(json.error || 'Failed to update status');
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to update status';
      toast.error(errorMsg);
    } finally {
      setTogglingSourceId(null);
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

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        console.error('Test source error:', res.status, errorText, 'Source ID:', id);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText, detail: errorText };
        }
        const errorMsg = errorData.error || errorData.detail || `HTTP ${res.status}: Failed to test source`;
        setTestResult({ ok: false, error: errorMsg });
        toast.error(errorMsg);
        return;
      }

      const result = await res.json();
      setTestResult(result);
      
      if (result.ok) {
        toast.success(`Test passed: ${String(result.status ?? 'OK')} (${String(result.host ?? 'unknown')})`);
      } else {
        toast.error(`Test failed: ${String(result.error ?? 'Unknown error')}`);
      }
    } catch (error) {
      console.error('Failed to test source:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to test source';
      toast.error(errorMsg);
      setTestResult({ ok: false, error: errorMsg });
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

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        console.error('Simulate extract error:', res.status, errorText, 'Source ID:', id);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText, detail: errorText };
        }
        const errorMsg = errorData.error || errorData.detail || `HTTP ${res.status}: Failed to simulate extract`;
        setSimulateResult({ ok: false, error: errorMsg });
        toast.error(errorMsg);
        return;
      }

      const result = await res.json();
      setSimulateResult(result);

      if (result.ok) {
        toast.success(`Found ${String(result.count ?? 0)} jobs`);
      } else {
        toast.error(`Simulation failed: ${String(result.error ?? 'Unknown error')}`);
      }
    } catch (error) {
      console.error('Failed to simulate extract:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to simulate extract';
      toast.error(errorMsg);
      setSimulateResult({ ok: false, error: errorMsg });
    } finally {
      setSimulateLoading(false);
    }
  };

  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);
  const [runningNewCrawlerId, setRunningNewCrawlerId] = useState<string | null>(null);

  const handleRunNow = async (id: string) => {
    if (runningSourceId) {
      toast.info('A crawl is already in progress. Please wait...');
      return;
    }

    setRunningSourceId(id);
    // Mark this source as recently triggered so we can highlight it for a short period
    setRecentlyRanSourceId(id);
    try {
      toast.info('Starting crawl...');
      
      const res = await fetch(`/api/admin/crawl/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ source_id: id }),
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        const errorMsg = errorData.error || errorData.detail || `HTTP ${res.status}: Failed to trigger crawl`;
        throw new Error(errorMsg);
      }

      const json = await res.json();
      if (json.status === 'ok') {
        const message =
          json.data?.message ||
          json.message ||
          'Crawl completed. Open the crawl details panel to see results.';
        toast.success(message);

        // Immediately refresh sources to pick up updated last_crawl_* fields
        fetchSources();

        // If the crawl details drawer is open for this source, refresh its logs
        // Add a small delay to ensure database transaction is committed and visible
        if (showCrawlDetails && selectedSourceForDetails?.id === id) {
          console.log(`[CrawlDetails] Crawl completed for source ${id}, refreshing drawer`);
          // Refresh immediately, then again after delays to catch the new log
          await refreshCrawlDetails(id, false);
          setTimeout(async () => {
            await refreshCrawlDetails(id, true);
          }, 500);
          setTimeout(async () => {
            await refreshCrawlDetails(id, true);
          }, 1500);
        }
      } else {
        throw new Error(json.error || 'Failed to trigger crawl');
      }
    } catch (error) {
      console.error('Failed to run crawl:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to run crawl';
      toast.error(errorMsg);
    } finally {
      setRunningSourceId(null);
      // Clear the highlight after a short delay so the user sees which source just ran
      setTimeout(() => {
        setRecentlyRanSourceId((current) => (current === id ? null : current));
      }, 8000);
    }
  };

  const handleTestNewCrawler = async (id: string) => {
    if (runningNewCrawlerId) {
      toast.info('A crawl is already in progress. Please wait...');
      return;
    }

    setRunningNewCrawlerId(id);
    setRecentlyRanSourceId(id);
    try {
      toast.info('Testing new crawler...');
      
      const res = await fetch(`/api/admin/crawl-v2/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ source_id: id }),
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        const errorMsg = errorData.error || errorData.detail || `HTTP ${res.status}: Failed to trigger new crawler`;
        throw new Error(errorMsg);
      }

      const json = await res.json();
      if (json.status === 'ok') {
        toast.success(json.message || 'New crawler started! Check crawl logs in a few seconds.');
        
        // Refresh sources after a delay to see results
        setTimeout(() => {
          fetchSources();
          if (showCrawlDetails && selectedSourceForDetails?.id === id) {
            refreshCrawlDetails(id, true);
          }
        }, 3000);
      } else {
        throw new Error(json.error || 'Failed to trigger new crawler');
      }
    } catch (error) {
      console.error('Failed to test new crawler:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to test new crawler';
      toast.error(errorMsg);
    } finally {
      setRunningNewCrawlerId(null);
      setTimeout(() => {
        setRecentlyRanSourceId((current) => (current === id ? null : current));
      }, 8000);
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
    // Show advanced options if source has advanced fields
    setShowAdvanced(!!(source.org_type || source.time_window || 
      (source.parser_hint && source.source_type !== 'api')));
    setShowEditModal(true);
    setAddEditModalPosition({ x: 0, y: 0 }); // Reset position when opening
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
    <div className="h-full overflow-hidden flex flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4" style={{ width: '100%' }}>
        <div className="w-full max-w-full" style={{ width: '100%', maxWidth: '100%' }}>
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
              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                Import source
              </span>
            </label>
            <button
              onClick={() => setShowAddModal(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
            >
              <Plus className="w-4 h-4 text-[#86868B]" />
              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
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
            <div className="overflow-x-auto -mx-4 px-4" style={{ width: '100%' }}>
              <table className="w-full" style={{ minWidth: '900px', width: '100%' }}>
                <thead className="bg-[#F5F5F7] border-b border-[#D2D2D7]">
                  <tr>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[140px]">Org</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[220px]">URL</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[80px]">Type</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[100px]">Health</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[100px]">Status</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[100px]">Last Crawl</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[100px]">Failures</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[240px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D2D2D7]">
                  {sources.map((source) => (
                    <tr key={source.id} className="hover:bg-[#F5F5F7] transition-colors">
                      <td className="px-3 py-2 text-caption text-[#1D1D1F] truncate">{source.org_name || '-'}</td>
                      <td className="px-3 py-2">
                        <a href={source.careers_url} target="_blank" rel="noopener noreferrer" className="text-[#0071E3] hover:underline text-caption truncate block" title={source.careers_url}>
                          {source.careers_url.length > 40 ? `${source.careers_url.substring(0, 40)}...` : source.careers_url}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-caption text-[#1D1D1F] font-mono">{source.source_type}</td>
                      <td className="px-3 py-2 text-caption">
                        {healthScores[source.id] ? (
                          <div className="flex items-center gap-2" title={`Health Score: ${healthScores[source.id].score.toFixed(1)}/100, Priority: ${healthScores[source.id].priority}/10`}>
                            <div className={`w-2 h-2 rounded-full ${
                              healthScores[source.id].score >= 80 ? 'bg-[#30D158]' :
                              healthScores[source.id].score >= 60 ? 'bg-[#FF9500]' :
                              'bg-[#FF3B30]'
                            }`}></div>
                            <span className={`text-caption-sm font-medium ${
                              healthScores[source.id].score >= 80 ? 'text-[#30D158]' :
                              healthScores[source.id].score >= 60 ? 'text-[#FF9500]' :
                              'text-[#FF3B30]'
                            }`}>
                              {healthScores[source.id].score.toFixed(0)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-caption-sm text-[#86868B]">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-caption">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            source.status === 'active' ? 'bg-[#30D158]' :
                            source.status === 'paused' ? 'bg-[#86868B]' :
                            'bg-[#FF3B30]'
                          }`}></div>
                          <span className="text-caption text-[#1D1D1F]">{source.status}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-caption">
                        <div className="flex items-center gap-2">
                          {source.last_crawl_status === 'ok' || source.last_crawl_status === 'success' ? (
                            <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
                          ) : source.last_crawl_status === 'fail' || source.last_crawl_status === 'error' ? (
                            <div className="w-2 h-2 bg-[#FF3B30] rounded-full"></div>
                          ) : source.last_crawl_status ? (
                            <div className="w-2 h-2 bg-[#FF9500] rounded-full"></div>
                          ) : null}
                          {runningSourceId === source.id ? (
                            <>
                              <div className="w-2 h-2 bg-[#FF9500] rounded-full animate-pulse"></div>
                              <span className="text-caption text-[#FF9500]">Running…</span>
                            </>
                          ) : (
                            <>
                              <span className="text-caption text-[#86868B]">
                                {formatDate(source.last_crawled_at)}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-caption">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(source.consecutive_failures ?? 0) > 0 && (
                            <span className={`px-1.5 py-0.5 rounded text-caption-sm ${
                              (source.consecutive_failures ?? 0) >= 5 
                                ? 'bg-[#FF3B30] text-white font-semibold' 
                                : 'bg-[#FF9500] text-white'
                            }`} title={`Consecutive failures: ${source.consecutive_failures ?? 0}`}>
                              {source.consecutive_failures ?? 0}
                            </span>
                          )}
                          {(source.consecutive_nochange ?? 0) > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-caption-sm bg-[#F5F5F7] text-[#86868B]" title={`Consecutive no-change: ${source.consecutive_nochange ?? 0}`}>
                              NC: {source.consecutive_nochange ?? 0}
                            </span>
                          )}
                          {(!source.consecutive_failures || source.consecutive_failures === 0) && 
                           (!source.consecutive_nochange || source.consecutive_nochange === 0) && (
                            <span className="text-caption-sm text-[#86868B]">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => handleRunNow(source.id)}
                            disabled={runningSourceId === source.id || runningNewCrawlerId === source.id}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                            title="Run now (old crawler)"
                          >
                            {runningSourceId === source.id ? (
                              <div className="w-4 h-4 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Play className="w-4 h-4 text-[#86868B]" />
                            )}
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                              Run now (old crawler)
                            </span>
                          </button>
                          <button
                            onClick={() => handleTestNewCrawler(source.id)}
                            disabled={runningSourceId === source.id || runningNewCrawlerId === source.id}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#30D158] bg-opacity-10 hover:bg-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group border border-[#30D158] border-opacity-30"
                            title="Test new crawler (v2)"
                          >
                            {runningNewCrawlerId === source.id ? (
                              <div className="w-4 h-4 border-2 border-[#30D158] border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Sparkles className="w-4 h-4 text-[#30D158]" />
                            )}
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                              Test new crawler (v2)
                            </span>
                          </button>
                          <button
                            onClick={() => handleToggleStatus(source)}
                            disabled={togglingSourceId === source.id}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                            title={source.status === 'active' ? 'Pause' : 'Resume'}
                          >
                            {togglingSourceId === source.id ? (
                              <div className="w-4 h-4 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin" />
                            ) : source.status === 'active' ? (
                              <Pause className="w-4 h-4 text-[#86868B]" />
                            ) : (
                              <Play className="w-4 h-4 text-[#30D158]" />
                            )}
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                              {source.status === 'active' ? 'Pause' : 'Resume'}
                            </span>
                          </button>
                          <button
                            onClick={() => openEditModal(source)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4 text-[#86868B]" />
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                              Edit
                            </span>
                          </button>
                          {source.status === 'deleted' ? (
                            <button
                              onClick={async () => {
                                if (!confirm('Are you sure you want to permanently delete this source? This action cannot be undone and will delete all associated crawl logs.')) return;
                                
                                setDeletingSourceId(source.id);
                                try {
                                  toast.info('Permanently deleting source...');
                                  
                                  const res = await fetch(`/api/admin/sources/${source.id}/permanent`, {
                                    method: 'DELETE',
                                    credentials: 'include',
                                  });

                                  if (res.status === 401) {
                                    router.push('/admin/login');
                                    return;
                                  }

                                  if (!res.ok) {
                                    const errorText = await res.text().catch(() => 'Unknown error');
                                    console.error('Permanent delete error:', res.status, errorText);
                                    let errorData;
                                    try {
                                      errorData = JSON.parse(errorText);
                                    } catch {
                                      errorData = { error: errorText, detail: errorText };
                                    }
                                    const errorMsg = errorData.error || errorData.detail || `HTTP ${res.status}: Failed to permanently delete source`;
                                    throw new Error(errorMsg);
                                  }

                                  const json = await res.json();
                                  if (json.status === 'ok') {
                                    toast.success('Source permanently deleted');
                                    fetchSources();
                                  } else {
                                    throw new Error(json.error || 'Failed to permanently delete source');
                                  }
                                } catch (error: any) {
                                  console.error('Failed to permanently delete source:', error);
                                  const errorMsg = error instanceof Error ? error.message : 'Failed to permanently delete source';
                                  toast.error(errorMsg);
                                } finally {
                                  setDeletingSourceId(null);
                                }
                              }}
                              disabled={deletingSourceId === source.id}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#FF3B30] hover:bg-[#FF2D20] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                              title="Permanently delete"
                            >
                              {deletingSourceId === source.id ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4 text-white" />
                              )}
                              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                                Permanently delete
                              </span>
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleDeleteJobs(source)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                                title="Delete all jobs from this source"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                                  Delete Jobs
                                </span>
                              </button>
                              <button
                                onClick={() => handleDeleteSource(source.id)}
                                disabled={deletingSourceId === source.id}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                                title="Delete source"
                              >
                                {deletingSourceId === source.id ? (
                                  <div className="w-4 h-4 border-2 border-[#FF3B30] border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4 text-[#FF3B30]" />
                                )}
                                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                                  Delete Source
                                </span>
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleTestSource(source.id)}
                            disabled={testLoading}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                            title="Test source"
                          >
                            {testLoading ? (
                              <div className="w-4 h-4 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <TestTube className="w-4 h-4 text-[#86868B]" />
                            )}
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                              Test source
                            </span>
                          </button>
                          <button
                            onClick={() => handleSimulateExtract(source.id)}
                            disabled={simulateLoading}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                            title="Simulate extraction"
                          >
                            {simulateLoading ? (
                              <div className="w-4 h-4 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <FileCode className="w-4 h-4 text-[#86868B]" />
                            )}
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                              Simulate extraction
                            </span>
                          </button>
                          <button
                            onClick={() => handleExportSource(source.id)}
                            disabled={exportingSourceId === source.id}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                            title="Export source"
                          >
                            {exportingSourceId === source.id ? (
                              <div className="w-4 h-4 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Download className="w-4 h-4 text-[#86868B]" />
                            )}
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                              Export source
                            </span>
                          </button>
                          <button
                            onClick={async () => {
                              // Set source and open drawer immediately
                              console.log(`[CrawlDetails] Opening drawer for source ${source.id}`);
                              setSelectedSourceForDetails(source);
                              setShowCrawlDetails(true);
                              // refreshCrawlDetails will be called by useEffect, but we can trigger it immediately too
                              // The useEffect will handle the auto-refresh setup
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
                            title="View crawl details"
                          >
                            <Info className="w-4 h-4 text-[#0071E3]" />
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                              View crawl details
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
      </div>

      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" style={{ overflow: 'visible' }}>
          <div 
            ref={addEditModalRef}
            className="bg-white border border-[#D2D2D7] rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden"
            style={{
              transform: addEditModalPosition.x !== 0 || addEditModalPosition.y !== 0 ? `translate(${addEditModalPosition.x}px, ${addEditModalPosition.y}px)` : undefined,
              cursor: isDragging && activeModalRef === addEditModalRef ? 'grabbing' : 'default',
            }}
          >
            <div className="p-4 overflow-y-auto flex-1">
              {/* Header - Draggable */}
              <div 
                className="flex items-center justify-between mb-4 modal-header cursor-grab active:cursor-grabbing select-none"
                onMouseDown={(e) => handleMouseDown(e, addEditModalRef, () => addEditModalPosition)}
              >
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
                    setAddEditModalPosition({ x: 0, y: 0 });
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
            <div className="flex items-center justify-end gap-2 p-4 border-t border-[#D2D2D7] bg-[#F5F5F7] relative overflow-visible">
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
          <div 
            ref={testModalRef}
            className="bg-white border border-[#D2D2D7] rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            style={{
              transform: testModalPosition.x !== 0 || testModalPosition.y !== 0 ? `translate(${testModalPosition.x}px, ${testModalPosition.y}px)` : undefined,
              cursor: isDragging && activeModalRef === testModalRef ? 'grabbing' : 'default',
            }}
          >
            <div className="p-4 overflow-y-auto flex-1">
              <div className="flex items-center justify-between mb-4 modal-header cursor-grab active:cursor-grabbing select-none" onMouseDown={(e) => handleMouseDown(e, testModalRef, () => testModalPosition)}>
                <div>
                  <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Test Results</h2>
                  <p className="text-caption text-[#86868B] mt-0.5">Source connectivity test results</p>
                </div>
                <button
                  onClick={() => {
                    setShowTestModal(false);
                    setTestResult(null);
                    setTestModalPosition({ x: 0, y: 0 });
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors"
                >
                  <X className="w-4 h-4 text-[#86868B]" />
                </button>
              </div>

              {testLoading ? (
                <div className="text-center py-8">
                  <div className="w-5 h-5 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="mt-3 text-caption text-[#86868B]">Testing source...</p>
                </div>
              ) : testResult ? (
                <div className="space-y-3">
                  <div className={`p-3 rounded-lg ${testResult.ok ? 'bg-[#30D158] bg-opacity-10 border border-[#30D158] border-opacity-30' : 'bg-[#FF3B30] bg-opacity-10 border border-[#FF3B30] border-opacity-30'}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-2 h-2 rounded-full ${testResult.ok ? 'bg-[#30D158]' : 'bg-[#FF3B30]'}`}></div>
                      <span className={`text-body-sm font-semibold ${testResult.ok ? 'text-[#30D158]' : 'text-[#FF3B30]'}`}>
                        {testResult.ok ? 'Test Passed' : 'Test Failed'}
                      </span>
                    </div>
                    {testResult.error && (
                      <p className="text-caption text-[#FF3B30] mt-1">{testResult.error}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-caption-sm font-medium text-[#86868B] mb-1">Status Code</label>
                      <p className="text-body-sm text-[#1D1D1F]">{testResult.status ?? 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-caption-sm font-medium text-[#86868B] mb-1">Host</label>
                      <p className="text-body-sm text-[#1D1D1F]">{testResult.host ?? 'N/A'}</p>
                    </div>
                    {testResult.count !== undefined && (
                      <div>
                        <label className="block text-caption-sm font-medium text-[#86868B] mb-1">Jobs Found</label>
                        <p className="text-body-sm text-[#1D1D1F]">{testResult.count}</p>
                      </div>
                    )}
                    {testResult.message && (
                      <div className="col-span-2">
                        <label className="block text-caption-sm font-medium text-[#86868B] mb-1">Message</label>
                        <p className="text-body-sm text-[#1D1D1F]">{testResult.message}</p>
                      </div>
                    )}
                    {testResult.size && (
                      <div>
                        <label className="block text-caption-sm font-medium text-[#86868B] mb-1">Content Size</label>
                        <p className="text-body-sm text-[#1D1D1F]">{testResult.size} bytes</p>
                      </div>
                    )}
                    {testResult.etag && (
                      <div>
                        <label className="block text-caption-sm font-medium text-[#86868B] mb-1">ETag</label>
                        <p className="text-caption font-mono text-[#1D1D1F]">{testResult.etag}</p>
                      </div>
                    )}
                    {testResult.last_modified && (
                      <div>
                        <label className="block text-caption-sm font-medium text-[#86868B] mb-1">Last Modified</label>
                        <p className="text-body-sm text-[#1D1D1F]">{testResult.last_modified}</p>
                      </div>
                    )}
                    {testResult.missing_secrets && (
                      <div className="col-span-2">
                        <label className="block text-caption-sm font-medium text-[#FF3B30] mb-1">Missing Secrets</label>
                        <ul className="list-disc list-inside text-caption text-[#FF3B30]">
                          {testResult.missing_secrets.map((secret: string, idx: number) => (
                            <li key={idx}>{secret}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {testResult.first_ids && testResult.first_ids.length > 0 && (
                      <div className="col-span-2">
                        <label className="block text-caption-sm font-medium text-[#86868B] mb-1">First 5 Job IDs</label>
                        <div className="space-y-1">
                          {testResult.first_ids.map((id: string, idx: number) => (
                            <p key={idx} className="text-caption font-mono text-[#1D1D1F]">{id}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {testResult.headers_sanitized && (
                      <div className="col-span-2">
                        <label className="block text-caption-sm font-medium text-[#86868B] mb-1">Headers (Sanitized)</label>
                        <pre className="text-caption-sm bg-[#F5F5F7] p-2.5 rounded-lg border border-[#D2D2D7] overflow-x-auto font-mono text-[#1D1D1F]">
                          {JSON.stringify(testResult.headers_sanitized, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#D2D2D7] flex justify-end">
                    <button
                      onClick={() => {
                        setShowTestModal(false);
                        setTestResult(null);
                        setTestModalPosition({ x: 0, y: 0 });
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
                      title="Close"
                    >
                      <X className="w-4 h-4 text-[#86868B]" />
                      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                        Close
                      </span>
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
          <div 
            ref={simulateModalRef}
            className="bg-white border border-[#D2D2D7] rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            style={{
              transform: simulateModalPosition.x !== 0 || simulateModalPosition.y !== 0 ? `translate(${simulateModalPosition.x}px, ${simulateModalPosition.y}px)` : undefined,
              cursor: isDragging && activeModalRef === simulateModalRef ? 'grabbing' : 'default',
            }}
          >
            <div className="p-4 overflow-y-auto flex-1">
              <div className="flex items-center justify-between mb-4 modal-header cursor-grab active:cursor-grabbing select-none" onMouseDown={(e) => handleMouseDown(e, simulateModalRef, () => simulateModalPosition)}>
                <div>
                  <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Simulation Results</h2>
                  <p className="text-caption text-[#86868B] mt-0.5">Job extraction simulation results</p>
                </div>
                <button
                  onClick={() => {
                    setShowSimulateModal(false);
                    setSimulateResult(null);
                    setSimulateModalPosition({ x: 0, y: 0 });
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors"
                >
                  <X className="w-4 h-4 text-[#86868B]" />
                </button>
              </div>

              {simulateLoading ? (
                <div className="text-center py-8">
                  <div className="w-5 h-5 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="mt-3 text-caption text-[#86868B]">Simulating extraction...</p>
                </div>
              ) : simulateResult ? (
                <div className="space-y-3">
                  {simulateResult.ok ? (
                    <>
                      <div className="p-3 bg-[#30D158] bg-opacity-10 border border-[#30D158] border-opacity-30 rounded-lg">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
                          <span className="text-body-sm font-semibold text-[#30D158]">Simulation Successful</span>
                        </div>
                        <p className="text-caption text-[#30D158] mt-1">Found {simulateResult.count ?? 0} jobs</p>
                      </div>

                      {simulateResult.sample && Array.isArray(simulateResult.sample) && simulateResult.sample.length > 0 && (
                        <div>
                          <h3 className="text-body-sm font-semibold text-[#1D1D1F] mb-2">Sample Jobs (First 3)</h3>
                          <div className="space-y-2.5">
                            {simulateResult.sample.map((job: any, idx: number) => (
                              <div key={idx} className="p-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg">
                                <div className="grid grid-cols-1 gap-2">
                                  {Object.entries(job).map(([key, value]) => (
                                    <div key={key}>
                                      <label className="block text-caption-sm font-medium text-[#86868B] mb-0.5">{key}</label>
                                      <p className="text-body-sm text-[#1D1D1F] break-words">
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
                    <div className="p-3 bg-[#FF3B30] bg-opacity-10 border border-[#FF3B30] border-opacity-30 rounded-lg">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-2 h-2 bg-[#FF3B30] rounded-full"></div>
                        <span className="text-body-sm font-semibold text-[#FF3B30]">Simulation Failed</span>
                      </div>
                      <p className="text-caption text-[#FF3B30] mt-1">{simulateResult.error ?? 'Unknown error'}</p>
                      {simulateResult.error_category && (
                        <p className="text-caption-sm text-[#FF3B30] mt-1 opacity-80">Category: {simulateResult.error_category}</p>
                      )}
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-[#D2D2D7] flex justify-end">
                    <button
                      onClick={() => {
                        setShowSimulateModal(false);
                        setSimulateResult(null);
                        setSimulateModalPosition({ x: 0, y: 0 });
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] transition-colors relative group"
                      title="Close"
                    >
                      <X className="w-4 h-4 text-[#86868B]" />
                      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                        Close
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Crawl Details Drawer (Right Side Panel) */}
      {showCrawlDetails && selectedSourceForDetails && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
            onClick={() => {
              setShowCrawlDetails(false);
              setSelectedSourceForDetails(null);
            }}
          />
          
          {/* Drawer */}
          <div className={`fixed right-0 top-0 bottom-0 w-full max-w-md bg-white border-l border-[#D2D2D7] shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
            showCrawlDetails ? 'translate-x-0' : 'translate-x-full'
          }`}>
            <div className="h-full flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[#D2D2D7] bg-[#F5F5F7]">
                <div>
                  <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Crawl Details</h2>
                  <p className="text-caption text-[#86868B] mt-0.5">
                    {selectedSourceForDetails.org_name || 'Source'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    // Clear interval when closing drawer
                    if (refreshIntervalRef.current) {
                      clearInterval(refreshIntervalRef.current);
                      refreshIntervalRef.current = null;
                    }
                    setShowCrawlDetails(false);
                    setSelectedSourceForDetails(null);
                    setCrawlLogs([]);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-[#D2D2D7] hover:bg-[#F5F5F7] transition-colors"
                >
                  <X className="w-4 h-4 text-[#86868B]" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {loadingCrawlLogs ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : (
                  <div className="space-y-4">
                  {/* Source Info */}
                  <div>
                    <h3 className="text-body-sm font-semibold text-[#1D1D1F] mb-2">Source Information</h3>
                    <div className="bg-[#F5F5F7] rounded-lg p-3 space-y-2">
                      <div>
                        <span className="text-caption-sm text-[#86868B]">URL:</span>
                        <p className="text-body-sm text-[#1D1D1F] break-all">{selectedSourceForDetails.careers_url}</p>
                      </div>
                      <div>
                        <span className="text-caption-sm text-[#86868B]">Type:</span>
                        <p className="text-body-sm text-[#1D1D1F] font-mono">{selectedSourceForDetails.source_type}</p>
                      </div>
                      <div>
                        <span className="text-caption-sm text-[#86868B]">Status:</span>
                        <div className="flex items-center gap-2 mt-1">
                          <div className={`w-2 h-2 rounded-full ${
                            selectedSourceForDetails.status === 'active' ? 'bg-[#30D158]' :
                            selectedSourceForDetails.status === 'paused' ? 'bg-[#86868B]' :
                            'bg-[#FF3B30]'
                          }`}></div>
                          <span className="text-body-sm text-[#1D1D1F]">{selectedSourceForDetails.status}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Last Crawl Details - Always show consistent structure */}
                  <div>
                    <h3 className="text-body-sm font-semibold text-[#1D1D1F] mb-2">Last Crawl</h3>
                    <div className="bg-[#F5F5F7] rounded-lg p-3 space-y-3">
                      {(() => {
                        // Prioritize crawl logs if available, otherwise use source data
          const lastLog = crawlLogs.length > 0 ? crawlLogs[0] : null;
                        const hasLogData = lastLog && (lastLog.status || lastLog.ran_at);
                        const hasSourceData = selectedSourceForDetails.last_crawled_at;
                        
                        if (hasLogData && lastLog) {
                          // Show detailed crawl log data - always use log data
                          return (
                            <>
                              <div>
                                <span className="text-caption-sm text-[#86868B]">Status:</span>
                                <div className="flex items-center gap-2 mt-1">
                                  {lastLog.status === 'ok' || lastLog.status === 'success' ? (
                                    <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
                                  ) : lastLog.status === 'fail' || lastLog.status === 'error' ? (
                                    <div className="w-2 h-2 bg-[#FF3B30] rounded-full"></div>
                                  ) : (
                                    <div className="w-2 h-2 bg-[#FF9500] rounded-full"></div>
                                  )}
                                  <span className="text-body-sm text-[#1D1D1F] capitalize">{lastLog.status || 'Unknown'}</span>
                                </div>
                              </div>
                              
                              {lastLog.ran_at && (
                                <div>
                                  <span className="text-caption-sm text-[#86868B]">Crawled At:</span>
                                  <p className="text-body-sm text-[#1D1D1F] mt-1">{formatDate(lastLog.ran_at)}</p>
                                </div>
                              )}

                              {lastLog.duration_ms !== null && lastLog.duration_ms !== undefined && (
                                <div>
                                  <span className="text-caption-sm text-[#86868B]">Duration:</span>
                                  <p className="text-body-sm text-[#1D1D1F] mt-1">
                                    {lastLog.duration_ms < 1000 
                                      ? `${lastLog.duration_ms}ms` 
                                      : `${(lastLog.duration_ms / 1000).toFixed(1)}s`}
                                  </p>
                                </div>
                              )}

                              {/* Job Counts - Always show from log data */}
                              <div className="pt-2 border-t border-[#D2D2D7]">
                                <span className="text-caption-sm text-[#86868B] mb-2 block">Job Counts:</span>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Found</div>
                                    <div className="text-body-sm font-semibold text-[#1D1D1F] mt-0.5">{lastLog.found !== null && lastLog.found !== undefined ? lastLog.found : 0}</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Inserted</div>
                                    <div className="text-body-sm font-semibold text-[#30D158] mt-0.5">{lastLog.inserted !== null && lastLog.inserted !== undefined ? lastLog.inserted : 0}</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Updated</div>
                                    <div className="text-body-sm font-semibold text-[#0071E3] mt-0.5">{lastLog.updated !== null && lastLog.updated !== undefined ? lastLog.updated : 0}</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Skipped</div>
                                    <div className="text-body-sm font-semibold text-[#86868B] mt-0.5">{lastLog.skipped !== null && lastLog.skipped !== undefined ? lastLog.skipped : 0}</div>
                                  </div>
                                </div>
                              </div>

                  {lastLog.message && (
                    <div className="pt-2 border-t border-[#D2D2D7]">
                      <span className="text-caption-sm text-[#86868B]">Message:</span>
                      <p className="text-body-sm text-[#1D1D1F] mt-1 break-words">
                        {(() => {
                          const msg = String(lastLog.message);
                          // Hide low-level database schema errors from UI and show a friendly note instead
                          if (msg.includes('relation \"robots_cache\" does not exist')) {
                            return 'Earlier crawl failed because an internal robots cache table was missing. The issue has been fixed; please run the source again if you want a fresh crawl.';
                          }
                          if (msg.includes('relation \"domain_policies\" does not exist')) {
                            return 'Earlier crawl failed due to a missing domain policies table. This has been resolved; new crawls will use the updated configuration.';
                          }
                          return msg;
                        })()}
                      </p>
                    </div>
                  )}
                            </>
                          );
                        } else if (hasSourceData) {
                          // Fallback to source data if no logs available
                          return (
                            <>
                              <div>
                                <span className="text-caption-sm text-[#86868B]">Status:</span>
                                <div className="flex items-center gap-2 mt-1">
                                  {selectedSourceForDetails.last_crawl_status === 'ok' || selectedSourceForDetails.last_crawl_status === 'success' ? (
                                    <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
                                  ) : selectedSourceForDetails.last_crawl_status === 'fail' || selectedSourceForDetails.last_crawl_status === 'error' ? (
                                    <div className="w-2 h-2 bg-[#FF3B30] rounded-full"></div>
                                  ) : selectedSourceForDetails.last_crawl_status ? (
                                    <div className="w-2 h-2 bg-[#FF9500] rounded-full"></div>
                                  ) : (
                                    <div className="w-2 h-2 bg-[#86868B] rounded-full"></div>
                                  )}
                                  <span className="text-body-sm text-[#1D1D1F] capitalize">
                                    {selectedSourceForDetails.last_crawl_status || 'Never crawled'}
                                  </span>
                                </div>
                              </div>
                              {selectedSourceForDetails.last_crawl_message && (
                                <div>
                                  <span className="text-caption-sm text-[#86868B]">Message:</span>
                                  <p className="text-body-sm text-[#1D1D1F] mt-1 break-words">{selectedSourceForDetails.last_crawl_message}</p>
                                </div>
                              )}
                              <div>
                                <span className="text-caption-sm text-[#86868B]">Crawled At:</span>
                                <p className="text-body-sm text-[#1D1D1F] mt-1">{formatDate(selectedSourceForDetails.last_crawled_at)}</p>
                              </div>
                              {/* Job Counts placeholder for consistency */}
                              <div className="pt-2 border-t border-[#D2D2D7]">
                                <span className="text-caption-sm text-[#86868B] mb-2 block">Job Counts:</span>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Found</div>
                                    <div className="text-body-sm font-semibold text-[#86868B] mt-0.5">-</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Inserted</div>
                                    <div className="text-body-sm font-semibold text-[#86868B] mt-0.5">-</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Updated</div>
                                    <div className="text-body-sm font-semibold text-[#86868B] mt-0.5">-</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Skipped</div>
                                    <div className="text-body-sm font-semibold text-[#86868B] mt-0.5">-</div>
                                  </div>
                                </div>
                              </div>
                            </>
                          );
                        } else {
                          // No crawl data available - show placeholder structure
                          return (
                            <>
                              <div>
                                <span className="text-caption-sm text-[#86868B]">Status:</span>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="w-2 h-2 bg-[#86868B] rounded-full"></div>
                                  <span className="text-body-sm text-[#86868B]">No crawl history</span>
                                </div>
                              </div>
                              <div>
                                <span className="text-caption-sm text-[#86868B]">Crawled At:</span>
                                <p className="text-body-sm text-[#86868B] mt-1">-</p>
                              </div>
                              {/* Job Counts placeholder for consistency */}
                              <div className="pt-2 border-t border-[#D2D2D7]">
                                <span className="text-caption-sm text-[#86868B] mb-2 block">Job Counts:</span>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Found</div>
                                    <div className="text-body-sm font-semibold text-[#86868B] mt-0.5">-</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Inserted</div>
                                    <div className="text-body-sm font-semibold text-[#86868B] mt-0.5">-</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Updated</div>
                                    <div className="text-body-sm font-semibold text-[#86868B] mt-0.5">-</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Skipped</div>
                                    <div className="text-body-sm font-semibold text-[#86868B] mt-0.5">-</div>
                                  </div>
                                </div>
                              </div>
                            </>
                          );
                        }
                      })()}
                    </div>
                  </div>

                  {/* Crawl Statistics */}
                  <div>
                    <h3 className="text-body-sm font-semibold text-[#1D1D1F] mb-2">Statistics</h3>
                    <div className="bg-[#F5F5F7] rounded-lg p-3 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-caption-sm text-[#86868B]">Frequency:</span>
                        <span className="text-body-sm text-[#1D1D1F]">
                          {selectedSourceForDetails.crawl_frequency_days || '-'} days
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-caption-sm text-[#86868B]">Next Run:</span>
                        <span className="text-body-sm text-[#1D1D1F]">
                          {formatDate(selectedSourceForDetails.next_run_at)}
                        </span>
                      </div>
                      {(selectedSourceForDetails.consecutive_failures ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-caption-sm text-[#86868B]">Consecutive Failures:</span>
                          <span className={`text-body-sm font-semibold ${
                            (selectedSourceForDetails.consecutive_failures ?? 0) >= 5 
                              ? 'text-[#FF3B30]' 
                              : 'text-[#FF9500]'
                          }`}>
                            {selectedSourceForDetails.consecutive_failures}
                          </span>
                        </div>
                      )}
                      {(selectedSourceForDetails.consecutive_nochange ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-caption-sm text-[#86868B]">Consecutive No-Change:</span>
                          <span className="text-body-sm text-[#86868B]">
                            {selectedSourceForDetails.consecutive_nochange}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Crawl History */}
                  {crawlLogs.length > 1 && (
                    <div>
                      <h3 className="text-body-sm font-semibold text-[#1D1D1F] mb-2">Crawl History</h3>
                      <div className="bg-[#F5F5F7] rounded-lg p-3 space-y-2 max-h-64 overflow-y-auto">
                        {crawlLogs.slice(1, 10).map((log: any, index: number) => (
                          <div key={log.id || index} className="bg-white rounded-lg p-2.5 border border-[#D2D2D7]">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                {log.status === 'ok' || log.status === 'success' ? (
                                  <div className="w-1.5 h-1.5 bg-[#30D158] rounded-full"></div>
                                ) : log.status === 'fail' || log.status === 'error' ? (
                                  <div className="w-1.5 h-1.5 bg-[#FF3B30] rounded-full"></div>
                                ) : (
                                  <div className="w-1.5 h-1.5 bg-[#FF9500] rounded-full"></div>
                                )}
                                <span className="text-caption-sm font-medium text-[#1D1D1F] capitalize">{log.status || 'Unknown'}</span>
                              </div>
                              <span className="text-caption-sm text-[#86868B]">{formatDate(log.ran_at)}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-caption-sm text-[#86868B]">
                                Found: <span className="text-[#1D1D1F] font-medium">{log.found ?? 0}</span>
                              </span>
                              {(log.inserted ?? 0) > 0 && (
                                <span className="text-caption-sm text-[#86868B]">
                                  +<span className="text-[#30D158] font-medium">{log.inserted}</span>
                                </span>
                              )}
                              {(log.updated ?? 0) > 0 && (
                                <span className="text-caption-sm text-[#86868B]">
                                  ~<span className="text-[#0071E3] font-medium">{log.updated}</span>
                                </span>
                              )}
                              {log.duration_ms !== null && log.duration_ms !== undefined && (
                                <span className="text-caption-sm text-[#86868B] ml-auto">
                                  {log.duration_ms < 1000 
                                    ? `${log.duration_ms}ms` 
                                    : `${(log.duration_ms / 1000).toFixed(1)}s`}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Additional Info */}
                  {(selectedSourceForDetails.org_type || selectedSourceForDetails.time_window) && (
                    <div>
                      <h3 className="text-body-sm font-semibold text-[#1D1D1F] mb-2">Additional Settings</h3>
                      <div className="bg-[#F5F5F7] rounded-lg p-3 space-y-2">
                        {selectedSourceForDetails.org_type && (
                          <div className="flex justify-between">
                            <span className="text-caption-sm text-[#86868B]">Organization Type:</span>
                            <span className="text-body-sm text-[#1D1D1F]">{selectedSourceForDetails.org_type}</span>
                          </div>
                        )}
                        {selectedSourceForDetails.time_window && (
                          <div className="flex justify-between">
                            <span className="text-caption-sm text-[#86868B]">Time Window:</span>
                            <span className="text-body-sm text-[#1D1D1F]">{selectedSourceForDetails.time_window}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Enterprise Job Deletion Modal */}
      {showDeleteJobsModal && sourceToDeleteJobs && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full border border-[#D2D2D7] max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#D2D2D7] flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Shield className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#1D1D1F]">Delete All Jobs</h3>
                  <p className="text-sm text-[#86868B]">Enterprise-grade deletion with audit trail</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDeleteJobsModal(false);
                  setSourceToDeleteJobs(null);
                  setDeletionResult(null);
                  setShowDeletionResult(false);
                }}
                className="p-1 hover:bg-[#F5F5F7] rounded transition-colors"
              >
                <X className="w-5 h-5 text-[#86868B]" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 space-y-4">
              {/* Source Info */}
              <div className="p-4 bg-[#F5F5F7] rounded-lg border border-[#D2D2D7]">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-4 h-4 text-[#86868B]" />
                  <span className="text-sm font-semibold text-[#1D1D1F]">Source</span>
                </div>
                <p className="text-sm text-[#1D1D1F] font-medium">{sourceToDeleteJobs.org_name}</p>
                <p className="text-xs text-[#86868B] mt-1 break-all">{sourceToDeleteJobs.careers_url}</p>
              </div>

              {/* Impact Analysis */}
              {loadingImpact ? (
                <div className="p-4 bg-[#F5F5F7] rounded-lg border border-[#D2D2D7]">
                  <div className="flex items-center gap-2 text-[#86868B]">
                    <div className="w-4 h-4 border-2 border-[#86868B] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Analyzing deletion impact...</span>
                  </div>
                </div>
              ) : deletionImpact ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-amber-900 mb-2">Deletion Impact Analysis</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-amber-700">Total Jobs:</span>
                          <span className="font-semibold text-amber-900 ml-2">{deletionImpact.total_jobs || 0}</span>
                        </div>
                        <div>
                          <span className="text-amber-700">Active Jobs:</span>
                          <span className="font-semibold text-amber-900 ml-2">{deletionImpact.active_jobs || 0}</span>
                        </div>
                        <div>
                          <span className="text-amber-700">User Shortlists:</span>
                          <span className="font-semibold text-amber-900 ml-2">{deletionImpact.shortlists_count || 0}</span>
                        </div>
                        <div>
                          <span className="text-amber-700">Enrichment Reviews:</span>
                          <span className="font-semibold text-amber-900 ml-2">{deletionImpact.enrichment_reviews_count || 0}</span>
                        </div>
                        <div>
                          <span className="text-amber-700">Enrichment History:</span>
                          <span className="font-semibold text-amber-900 ml-2">{deletionImpact.enrichment_history_count || 0}</span>
                        </div>
                        <div>
                          <span className="text-amber-700">Ground Truth Data:</span>
                          <span className="font-semibold text-amber-900 ml-2">{deletionImpact.ground_truth_count || 0}</span>
                        </div>
                      </div>
                      {(deletionImpact.shortlists_count > 0 || deletionImpact.enrichment_history_count > 0) && (
                        <p className="text-xs text-amber-700 mt-2">
                          ⚠️ Related data will also be deleted (cascade delete)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Deletion Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#1D1D1F] flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Deletion Type
                </label>
                <div className="flex gap-3">
                  <label className="flex-1 p-3 border-2 rounded-lg cursor-pointer transition-all hover:bg-[#F5F5F7]">
                    <input
                      type="radio"
                      name="deletionType"
                      value="soft"
                      checked={deletionType === 'soft'}
                      onChange={(e) => setDeletionType(e.target.value as 'soft' | 'hard')}
                      className="mr-2"
                    />
                    <div>
                      <div className="font-medium text-[#1D1D1F]">Soft Delete</div>
                      <div className="text-xs text-[#86868B] mt-1">
                        Mark as deleted (recoverable within retention period)
                      </div>
                    </div>
                  </label>
                  <label className="flex-1 p-3 border-2 rounded-lg cursor-pointer transition-all hover:bg-[#F5F5F7]">
                    <input
                      type="radio"
                      name="deletionType"
                      value="hard"
                      checked={deletionType === 'hard'}
                      onChange={(e) => setDeletionType(e.target.value as 'soft' | 'hard')}
                      className="mr-2"
                    />
                    <div>
                      <div className="font-medium text-[#1D1D1F]">Hard Delete</div>
                      <div className="text-xs text-[#86868B] mt-1">
                        Permanently remove (cannot be recovered)
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Deletion Reason (Required for hard delete) */}
              {deletionType === 'hard' && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#1D1D1F]">
                    Deletion Reason <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    value={deletionReason}
                    onChange={(e) => setDeletionReason(e.target.value)}
                    placeholder="Explain why you're performing a hard delete (required for audit trail)"
                    className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                  />
                  <p className="text-xs text-[#86868B]">
                    This reason will be logged in the audit trail for compliance
                  </p>
                </div>
              )}

              {/* Options */}
              <div className="space-y-3 p-4 bg-[#F5F5F7] rounded-lg border border-[#D2D2D7]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteJobsDryRun}
                    onChange={(e) => setDeleteJobsDryRun(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-[#D2D2D7] rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-[#1D1D1F]">Dry Run Mode</span>
                    <p className="text-xs text-[#86868B]">
                      Preview deletion without actually deleting (recommended first step)
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteJobsExportData}
                    onChange={(e) => setDeleteJobsExportData(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-[#D2D2D7] rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-[#1D1D1F]">Export Data Before Deletion</span>
                    <p className="text-xs text-[#86868B]">
                      Download job data as JSON before deletion (backup)
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteJobsTriggerCrawl}
                    onChange={(e) => setDeleteJobsTriggerCrawl(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-[#D2D2D7] rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-[#1D1D1F]">Trigger Fresh Crawl After Deletion</span>
                    <p className="text-xs text-[#86868B]">
                      Automatically start a new crawl to repopulate jobs with correct data
                    </p>
                  </div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={confirmDeleteJobs}
                  disabled={deletingJobs || (deletionType === 'hard' && !deletionReason.trim())}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                >
                  {deletingJobs ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {deleteJobsDryRun ? 'Analyzing...' : 'Deleting...'}
                    </>
                  ) : (
                    <>
                      {deleteJobsDryRun ? (
                        <>
                          <TestTube className="w-4 h-4" />
                          Run Dry-Run Analysis
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          {deletionType === 'soft' ? 'Soft Delete Jobs' : 'Hard Delete Jobs'}
                        </>
                      )}
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteJobsModal(false);
                    setSourceToDeleteJobs(null);
                    setDeletionResult(null);
                    setShowDeletionResult(false);
                  }}
                  disabled={deletingJobs}
                  className="flex-1 px-4 py-2.5 bg-[#F5F5F7] text-[#1D1D1F] rounded-lg hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deletion Result Modal (for dry-run results) */}
      {showDeletionResult && deletionResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full border border-[#D2D2D7]">
            <div className="px-6 py-4 border-b border-[#D2D2D7] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Info className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#1D1D1F]">Dry Run Results</h3>
                  <p className="text-sm text-[#86868B]">Preview of what would be deleted</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDeletionResult(false);
                  setDeleteJobsDryRun(false); // Allow actual deletion now
                }}
                className="p-1 hover:bg-[#F5F5F7] rounded transition-colors"
              >
                <X className="w-5 h-5 text-[#86868B]" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>{deletionResult.would_delete || deletionResult.deletion?.count || 0} jobs</strong> would be {deletionType} deleted
                </p>
              </div>

              {deletionResult.impact && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#1D1D1F]">Impact Summary:</p>
                  <div className="text-sm text-[#86868B] space-y-1">
                    <p>• {deletionResult.impact.shortlists_count || 0} user shortlists would be removed</p>
                    <p>• {deletionResult.impact.enrichment_history_count || 0} enrichment history records would be removed</p>
                    <p>• {deletionResult.impact.enrichment_reviews_count || 0} enrichment reviews would be removed</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowDeletionResult(false);
                    setDeleteJobsDryRun(false);
                    // Proceed with actual deletion
                    confirmDeleteJobs();
                  }}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Proceed with Deletion
                </button>
                <button
                  onClick={() => {
                    setShowDeletionResult(false);
                  }}
                  className="flex-1 px-4 py-2.5 bg-[#F5F5F7] text-[#1D1D1F] rounded-lg hover:bg-[#E5E5E7] transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
