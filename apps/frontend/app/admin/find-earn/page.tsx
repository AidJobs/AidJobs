'use client';

import { useState, useEffect } from 'react';

type Submission = {
  id: string;
  url: string;
  source_type: string | null;
  status: string;
  detected_jobs: number;
  notes: string | null;
  submitted_by: string | null;
  submitted_at: string;
};

export default function AdminFindEarnPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const pageSize = 20;

  useEffect(() => {
    fetchSubmissions();
  }, [page, statusFilter]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
      });
      if (statusFilter) {
        params.append('status_filter', statusFilter);
      }
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000` : 'http://localhost:8000');
      console.log('[Find&Earn] Fetching submissions from:', `${apiUrl}/admin/find-earn/list?${params}`);
      const res = await fetch(`${apiUrl}/admin/find-earn/list?${params}`);
      
      console.log('[Find&Earn] Response status:', res.status, res.ok);
      
      if (!res.ok) {
        console.error('[Find&Earn] Response not OK');
        showToast('Failed to load submissions', 'error');
        return;
      }
      
      const data = await res.json();
      console.log('[Find&Earn] Response data:', data);
      
      if (data.status === 'ok') {
        console.log('[Find&Earn] Setting submissions:', data.data.items);
        setSubmissions(data.data.items);
        setTotal(data.data.total);
      } else {
        console.error('[Find&Earn] Data status not OK');
        showToast('Failed to load submissions', 'error');
      }
    } catch (error) {
      console.error('[Find&Earn] Fetch error:', error);
      showToast('Error loading submissions', 'error');
    } finally {
      console.log('[Find&Earn] Finally block - setting loading to false');
      setLoading(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const handleApprove = async (submissionId: string) => {
    if (!confirm('Approve this submission and create a new source?')) {
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000` : 'http://localhost:8000');
      const res = await fetch(`${apiUrl}/admin/find-earn/approve/${submissionId}`, {
        method: 'POST',
      });
      
      if (!res.ok) {
        showToast('Failed to approve submission', 'error');
        return;
      }
      
      const data = await res.json();
      
      if (data.status === 'ok') {
        showToast('Submission approved and source created', 'success');
        fetchSubmissions();
      } else {
        showToast('Failed to approve submission', 'error');
      }
    } catch (error) {
      showToast('Error approving submission', 'error');
    }
  };

  const handleReject = async (submissionId: string) => {
    const notes = prompt('Enter rejection reason:');
    if (!notes) {
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000` : 'http://localhost:8000');
      const res = await fetch(`${apiUrl}/admin/find-earn/reject/${submissionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      
      if (!res.ok) {
        showToast('Failed to reject submission', 'error');
        return;
      }
      
      const data = await res.json();
      
      if (data.status === 'ok') {
        showToast('Submission rejected', 'success');
        fetchSubmissions();
      } else {
        showToast('Failed to reject submission', 'error');
      }
    } catch (error) {
      showToast('Error rejecting submission', 'error');
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Find & Earn Submissions</h1>
          <p className="text-gray-600 mt-2">Review and moderate user-submitted career pages</p>
        </div>

        {toast && (
          <div
            className={`mb-4 p-4 rounded-lg ${
              toast.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {toast.message}
          </div>
        )}

        <div className="mb-4 flex gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Filter by status:</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <span className="text-sm text-gray-600">Total: {total}</span>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="text-gray-600 mt-2">Loading submissions...</p>
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-600">No submissions found</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      URL
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Jobs
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Submitted
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Notes
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {submissions.map((submission) => (
                    <tr key={submission.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <a
                          href={submission.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-sm max-w-xs truncate block"
                          title={submission.url}
                        >
                          {submission.url}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {submission.source_type || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {submission.detected_jobs}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            submission.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : submission.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {submission.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(submission.submitted_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {submission.notes || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {submission.status === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(submission.id)}
                              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(submission.id)}
                              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {submission.status !== 'pending' && (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex justify-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-gray-700">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-await hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
