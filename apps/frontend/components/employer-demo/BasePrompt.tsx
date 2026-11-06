'use client';

import { useState } from 'react';
import { basePattern, formatOf, notNowBase, saveEditedBase, setBaseFormat } from './actions';
import CreateFormatDialog from './FormatBuilder';
import type { State } from './types';

/**
 * Offers the headings the organisation's own job descriptions share as its base JD format: Use it, Edit it, or Not now. It is shown only when a
 * pattern exists and differs from the base, and "Not now" holds until the pattern grows.
 */
export default function BasePrompt({ s }: { s: State }) {
  const [editing, setEditing] = useState(false);
  const pattern = basePattern(s);
  if (!pattern || s.reviewerAs || (s.baseDismissed === pattern.sig && !editing)) return null;
  const from = `from ${pattern.count} of your own job descriptions`;
  return (
    <div className="ej-offer flex-col !items-start" role="status">
      <span>
        {pattern.count} of your job descriptions share these headings: <strong>{pattern.order.map((o) => o.heading).join(' · ')}</strong>. Use them as your base JD format?
      </span>
      <span className="aj-faint" style={{ fontSize: 11 }}>
        New jobs would start from them; each job can still change its own sections. (In the demo, from the sample history.)
      </span>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="aj-ink-btn" style={{ height: 30 }} onClick={() => setBaseFormat(pattern.order, from, undefined, pattern.count)}>
          Use it
        </button>
        <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => setEditing(true)}>
          Edit it
        </button>
        <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => notNowBase(pattern.sig)}>
          Not now
        </button>
      </div>
      {editing && (
        <CreateFormatDialog
          title="Edit your base JD format"
          initial={{ name: `${s.org.short} format`, order: pattern.order, tone: s.formats.some((f) => f.key === 'house') ? formatOf(s, 'house').tone : 'warm' }}
          onSave={(_, order, tone) => saveEditedBase(pattern, order, tone)}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}