'use client';

import { useEffect, useRef, useState } from 'react';
import { XCircle, Info, AlertTriangle } from 'lucide-react';
import { adminDateTime } from '@/lib/dates';
import {
  completenessBadge,
  foundVsExpectedLabel,
  type CrawlReviewData,
} from '@/lib/admin/crawlReview';

type Props = {
  logId: string | null;
  onClose: () => void;
};

const TONE_CLASSES: Record<string, string> = {
  ok: 'bg-green-50 text-green-700 border-green-200',
  warn: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-[#F5F5F7] text-[#86868B] border-[#D2D2D7]',
};

export default function CrawlReviewModal({ logId, onClose }: Props) {
  const [review, setReview] = useState<CrawlReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!logId) {
      setReview(null);
      setError(null);
      setLoading(false);
      return;
    }

    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    setReview(null);

    fetch(`/api/admin/crawl/review/${encodeURIComponent(logId)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (seq !== requestSeq.current) return;
        if (!res.ok || body?.status !== 'ok' || !body.data) {
          throw new Error(body?.error || body?.detail || `HTTP ${res.status}`);
        }
        setReview(body.data as CrawlReviewData);
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load crawl review');
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [logId]);

  if (!logId) return null;

  const badge = review ? completenessBadge(review.listing_complete) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-[#D2D2D7] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#1D1D1F]">
              Crawl Review{review?.org_name ? `: ${review.org_name}` : ''}
            </h2>
            {review?.ran_at && (
              <p className="text-xs text-[#86868B] mt-0.5">
                Run at {adminDateTime(review.ran_at)} (read-only)
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close crawl review"
            className="p-2 hover:bg-[#F5F5F7] rounded-lg transition-colors"
          >
            <XCircle className="w-5 h-5 text-[#86868B]" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Could not load crawl review: {error}</span>
            </div>
          )}

          {review && (
            <>
              {/* Found vs expected & completeness */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-[#D2D2D7]">
                  <div className="text-xs text-[#86868B] mb-1">Found vs Expected</div>
                  <div className="text-base font-semibold text-[#1D1D1F]">
                    {foundVsExpectedLabel(review.found, review.listing_expected)}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-[#D2D2D7]">
                  <div className="text-xs text-[#86868B] mb-1">Listing Completeness</div>
                  {badge && (
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${TONE_CLASSES[badge.tone]}`}
                    >
                      {badge.text}
                    </span>
                  )}
                  {review.listing_stop && (
                    <div className="text-xs text-[#86868B] mt-1 break-words">
                      Stop: {review.listing_stop}
                    </div>
                  )}
                </div>
                <div className="p-3 rounded-lg border border-[#D2D2D7]">
                  <div className="text-xs text-[#86868B] mb-1">Changes</div>
                  <div className="text-sm font-medium text-[#1D1D1F]">
                    +{review.inserted} / ~{review.updated} / skip {review.skipped}
                  </div>
                  {(review.failed_saves ?? 0) > 0 && (
                    <div className="text-xs text-red-600 mt-0.5">
                      Failed saves: {review.failed_saves}
                    </div>
                  )}
                </div>
                <div className="p-3 rounded-lg border border-[#D2D2D7]">
                  <div className="text-xs text-[#86868B] mb-1">Lifecycle</div>
                  <div className="text-xs text-[#1D1D1F] space-y-0.5">
                    <div>
                      Counted:{' '}
                      <span className="font-medium">
                        {review.counted === null ? '—' : review.counted ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      Expired: <span className="font-medium">{review.expired ?? '—'}</span> · Returned:{' '}
                      <span className="font-medium">{review.returned ?? '—'}</span>
                    </div>
                    <div>
                      Matched active:{' '}
                      <span className="font-medium">
                        {review.matched_active ?? '—'} / {review.active_at_start ?? '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {review.message && (
                <div className="p-3 rounded-lg bg-[#F5F5F7] border border-[#D2D2D7] text-xs text-[#1D1D1F]">
                  <span className="font-medium text-[#86868B]">Run message: </span>
                  {review.message}
                </div>
              )}

              {/* Rejections by reason (window-attributed) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-[#1D1D1F]">
                    Rejections by reason ({review.rejections.total_in_window})
                  </h3>
                </div>
                <p className="text-xs text-[#86868B] mb-3 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{review.rejections.attribution_note}</span>
                </p>
                {review.rejections.by_reason.length === 0 ? (
                  <div className="p-3 rounded-lg border border-[#D2D2D7] text-sm text-[#86868B]">
                    No failed inserts recorded in this run&apos;s time window.
                  </div>
                ) : (
                  <div className="border border-[#D2D2D7] rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-[#F5F5F7] text-left text-xs text-[#86868B]">
                        <tr>
                          <th className="px-3 py-2 font-medium">Operation</th>
                          <th className="px-3 py-2 font-medium">Reason</th>
                          <th className="px-3 py-2 font-medium text-right">Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D2D2D7]">
                        {review.rejections.by_reason.map((item, idx) => (
                          <tr key={`${item.operation}-${idx}`}>
                            <td className="px-3 py-2 font-mono text-xs text-[#86868B]">
                              {item.operation}
                            </td>
                            <td className="px-3 py-2 text-[#1D1D1F] break-words">
                              {item.reason}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-[#1D1D1F]">
                              {item.count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Stored fill rates (W-39) */}
              <div>
                <h3 className="font-semibold text-[#1D1D1F] mb-1">
                  Field fill rates (stored, {review.fill_rates_total_jobs} jobs)
                </h3>
                <p className="text-xs text-[#86868B] mb-3 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{review.fill_rates_note}</span>
                </p>
                {Object.keys(review.fill_rates || {}).length === 0 ? (
                  <div className="p-3 rounded-lg border border-[#D2D2D7] text-sm text-[#86868B]">
                    No stored fill-rate data for this source.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {Object.entries(review.fill_rates).map(([field, info]) => (
                      <div key={field} className="p-3 rounded-lg border border-[#D2D2D7]">
                        <div className="text-xs text-[#86868B] mb-1 font-mono">{field}</div>
                        <div className="text-lg font-semibold text-[#1D1D1F]">
                          {info.rate == null ? '—' : `${info.rate}%`}
                        </div>
                        <div className="text-xs text-[#86868B]">
                          {info.filled} / {info.total}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
