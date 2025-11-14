'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Upload, Play, Pause, Edit, Trash2, TestTube, FileCode, Download, X, ChevronDown, ChevronUp, Sparkles, Check, XCircle, Info } from 'lucide-react';

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

  // Refresh source data and crawl logs when drawer is open
  useEffect(() => {
    if (showCrawlDetails && selectedSourceForDetails) {
      const refreshData = async () => {
        try {
          // Fetch fresh source data
          const sourceRes = await fetch(`/api/admin/sources?page=1&size=100&status=all`, {
            credentials: 'include',
          });
          if (sourceRes.ok) {
            const sourceJson = await sourceRes.json();
            if (sourceJson.status === 'ok' && sourceJson.data?.items) {
              const freshSource = sourceJson.data.items.find((s: Source) => s.id === selectedSourceForDetails.id);
              if (freshSource) {
                setSelectedSourceForDetails(freshSource);
              }
            }
          }
          
          // Refresh crawl logs
          const logsRes = await fetch(`/api/admin/crawl/logs?source_id=${selectedSourceForDetails.id}&limit=10`, {
            credentials: 'include',
          });
          if (logsRes.ok) {
            const logsJson = await logsRes.json();
            if (logsJson.status === 'ok' && logsJson.data) {
              setCrawlLogs(logsJson.data);
            }
          }
        } catch (error) {
          console.error('Failed to refresh crawl details:', error);
        }
      };
      
      // Refresh immediately and then every 5 seconds while drawer is open
      refreshData();
      const interval = setInterval(refreshData, 5000);
      return () => clearInterval(interval);
    }
  }, [showCrawlDetails, selectedSourceForDetails?.id]);

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

  const handleRunNow = async (id: string) => {
    if (runningSourceId) {
      toast.info('A crawl is already in progress. Please wait...');
      return;
    }

    setRunningSourceId(id);
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
        toast.success(json.message || 'Crawl started successfully');
        // Refresh sources after a short delay to show updated status
        setTimeout(() => {
          fetchSources();
        }, 1000);
      } else {
        throw new Error(json.error || 'Failed to trigger crawl');
      }
    } catch (error) {
      console.error('Failed to run crawl:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to run crawl';
      toast.error(errorMsg);
    } finally {
      setRunningSourceId(null);
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
        <div className="w-full max-w-full">
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
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full" style={{ minWidth: '1000px' }}>
                <thead className="bg-[#F5F5F7] border-b border-[#D2D2D7]">
                  <tr>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[120px]">Org</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[200px]">URL</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[80px]">Type</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[100px]">Status</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[60px]">Freq</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[140px]">Next run</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[140px]">Last crawl</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[100px]">Status</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[100px]">Failures</th>
                    <th className="px-3 py-2 text-left text-caption font-medium text-[#86868B] uppercase w-[280px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D2D2D7]">
                  {sources.map((source) => (
                    <tr key={source.id} className="hover:bg-[#F5F5F7] transition-colors">
                      <td className="px-3 py-2 text-body-sm text-[#1D1D1F] truncate">{source.org_name || '-'}</td>
                      <td className="px-3 py-2 text-body-sm">
                        <a href={source.careers_url} target="_blank" rel="noopener noreferrer" className="text-[#0071E3] hover:underline text-caption truncate block" title={source.careers_url}>
                          {source.careers_url.length > 35 ? `${source.careers_url.substring(0, 35)}...` : source.careers_url}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-caption text-[#1D1D1F] font-mono">{source.source_type}</td>
                      <td className="px-3 py-2 text-caption">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            source.status === 'active' ? 'bg-[#30D158]' :
                            source.status === 'paused' ? 'bg-[#86868B]' :
                            'bg-[#FF3B30]'
                          }`}></div>
                          <span className="text-[#1D1D1F]">{source.status}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-caption text-[#1D1D1F]">{source.crawl_frequency_days || '-'}</td>
                      <td className="px-3 py-2 text-caption text-[#86868B] truncate" title={formatDate(source.next_run_at)}>{formatDate(source.next_run_at)}</td>
                      <td className="px-3 py-2 text-caption text-[#86868B] truncate" title={formatDate(source.last_crawled_at)}>{formatDate(source.last_crawled_at)}</td>
                      <td className="px-3 py-2 text-caption">
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
                            disabled={runningSourceId === source.id}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                            title="Run now"
                          >
                            {runningSourceId === source.id ? (
                              <div className="w-4 h-4 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Play className="w-4 h-4 text-[#86868B]" />
                            )}
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                              Run now
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
                            <button
                              onClick={() => handleDeleteSource(source.id)}
                              disabled={deletingSourceId === source.id}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                              title="Delete"
                            >
                              {deletingSourceId === source.id ? (
                                <div className="w-4 h-4 border-2 border-[#FF3B30] border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4 text-[#FF3B30]" />
                              )}
                              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                                Delete
                              </span>
                            </button>
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
                              setSelectedSourceForDetails(source);
                              setShowCrawlDetails(true);
                              setLoadingCrawlLogs(true);
                              
                              try {
                                // Fetch fresh source data - use the sources list endpoint with query filter
                                const sourceRes = await fetch(`/api/admin/sources?page=1&size=100&status=all`, {
                                  credentials: 'include',
                                });
                                if (sourceRes.ok) {
                                  const sourceJson = await sourceRes.json();
                                  if (sourceJson.status === 'ok' && sourceJson.data?.items) {
                                    const freshSource = sourceJson.data.items.find((s: Source) => s.id === source.id);
                                    if (freshSource) {
                                      setSelectedSourceForDetails(freshSource);
                                    } else {
                                      // If not found in list, keep the current source
                                      setSelectedSourceForDetails(source);
                                    }
                                  }
                                }
                                
                                // Fetch crawl logs
                                const logsRes = await fetch(`/api/admin/crawl/logs?source_id=${source.id}&limit=10`, {
                                  credentials: 'include',
                                });
                                if (logsRes.ok) {
                                  const logsJson = await logsRes.json();
                                  if (logsJson.status === 'ok' && logsJson.data) {
                                    setCrawlLogs(logsJson.data);
                                  } else {
                                    setCrawlLogs([]);
                                  }
                                } else {
                                  setCrawlLogs([]);
                                }
                              } catch (error) {
                                console.error('Failed to fetch crawl details:', error);
                                setCrawlLogs([]);
                              } finally {
                                setLoadingCrawlLogs(false);
                              }
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
            <div className="p-4 overflow-y-auto flex-1 rounded-t-lg">
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
          <div 
            ref={testModalRef}
            className="bg-white border border-[#D2D2D7] rounded-lg shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            style={{
              transform: testModalPosition.x !== 0 || testModalPosition.y !== 0 ? `translate(${testModalPosition.x}px, ${testModalPosition.y}px)` : undefined,
              cursor: isDragging && activeModalRef === testModalRef ? 'grabbing' : 'default',
            }}
          >
            <div className="p-4">
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
                      className="px-3 py-1.5 bg-[#0071E3] text-white rounded-lg text-caption hover:bg-[#0077ED] transition-colors"
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
          <div 
            ref={simulateModalRef}
            className="bg-white border border-[#D2D2D7] rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            style={{
              transform: simulateModalPosition.x !== 0 || simulateModalPosition.y !== 0 ? `translate(${simulateModalPosition.x}px, ${simulateModalPosition.y}px)` : undefined,
              cursor: isDragging && activeModalRef === simulateModalRef ? 'grabbing' : 'default',
            }}
          >
            <div className="p-4">
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
                      className="px-3 py-1.5 bg-[#0071E3] text-white rounded-lg text-caption hover:bg-[#0077ED] transition-colors"
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
                        
                        if (hasLogData) {
                          // Show detailed crawl log data
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

                              {/* Job Counts - Always show grid */}
                              <div className="pt-2 border-t border-[#D2D2D7]">
                                <span className="text-caption-sm text-[#86868B] mb-2 block">Job Counts:</span>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Found</div>
                                    <div className="text-body-sm font-semibold text-[#1D1D1F] mt-0.5">{lastLog.found ?? 0}</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Inserted</div>
                                    <div className="text-body-sm font-semibold text-[#30D158] mt-0.5">{lastLog.inserted ?? 0}</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Updated</div>
                                    <div className="text-body-sm font-semibold text-[#0071E3] mt-0.5">{lastLog.updated ?? 0}</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2">
                                    <div className="text-caption-sm text-[#86868B]">Skipped</div>
                                    <div className="text-body-sm font-semibold text-[#86868B] mt-0.5">{lastLog.skipped ?? 0}</div>
                                  </div>
                                </div>
                              </div>

                              {lastLog.message && (
                                <div className="pt-2 border-t border-[#D2D2D7]">
                                  <span className="text-caption-sm text-[#86868B]">Message:</span>
                                  <p className="text-body-sm text-[#1D1D1F] mt-1 break-words">{lastLog.message}</p>
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
    </div>
  );
}
