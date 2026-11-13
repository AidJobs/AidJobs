'use client';

import { FileUp, Link2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { acceptPageDraft, acceptSuggestion, rejectPageDraft, rejectSuggestion } from './context';
import { draftFromPage, MAX_TEXT, readPageVia } from './pages';
import { ACCEPTED, readJobFile } from './readFile';
import type { OpenTarget } from './aiActions';
import type { DemoJob, State } from './types';
import { inputStyle } from './ui';

/**
 * The website field (About us) or the project field (About the project), section 19, phase 5, A: one https page, read by the demo's page
 * route; or the text pasted; or a file, read in the browser. Each is cut to 8,000 characters and drafted from, never put on the job
 * until the draft is accepted.
 */
export function PageField({ job, s, kind, open }: { job: DemoJob; s: State; kind: 'about' | 'project'; open: (t: OpenTarget) => void }) {
  const [url, setUrl] = useState(kind === 'about' ? s.org.website : '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const ro = Boolean(s.reviewerAs);
  const what = kind === 'about' ? 'About us' : 'About the project';
  const draft = async (t: string, source: 'your website' | 'the project page' | 'you told us', social: string[] = []) => {
    setBusy(true);
    setNote('');
    try {
      await draftFromPage(job.id, kind, t.slice(0, MAX_TEXT), source, social, open);
    } finally {
      setBusy(false);
    }
  };
  const read = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setNote('');
    const r = await readPageVia(kind === 'about' ? 'website' : 'project', url);
    setBusy(false);
    if (!r.ok) return setNote(`${r.reason.charAt(0).toUpperCase()}${r.reason.slice(1)}: paste its text below, or upload the file.`);
    await draft(r.text, kind === 'about' ? 'your website' : 'the project page', r.social);
  };
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={kind === 'about' ? 'Draft About us from your organisation’s page' : 'The project this job is for'}>
      <span className="aj-muted">
        {kind === 'about'
          ? 'Draft About us from your organisation’s own page (one page, such as your About page). Only that page is read, and nothing goes on the job until you accept the draft.'
          : 'The project this job is for: a link to its page, the text, or a file. I draft About the project from it alone; it stays on this job.'}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link2 size={14} strokeWidth={1.8} className="aj-faint shrink-0" aria-hidden />
        <input
          style={{ ...inputStyle, minHeight: 34, flex: 1, minWidth: 180 }}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && !ro && read()}
          placeholder={kind === 'about' ? 'https://your-organisation.org/about' : 'https://… the project’s page'}
          aria-label={kind === 'about' ? 'Your organisation’s page address' : 'The project page address'}
          disabled={ro}
          inputMode="url"
        />
        <button type="button" className="aj-pill" style={{ height: 34 }} disabled={busy || ro || !url.trim()} onClick={read}>
          {busy ? 'Reading…' : 'Read this page'}
        </button>
      </div>
      <textarea style={{ ...inputStyle, minHeight: 64 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Or paste the text here" aria-label={`Text for ${what}`} disabled={ro} />
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="aj-pill" style={{ height: 30 }} disabled={busy || ro || text.trim().length < 40} onClick={() => draft(text, 'you told us')}>
          Draft from this text
        </button>
        <button type="button" className="aj-text-btn" style={{ height: 30 }} disabled={busy || ro} onClick={() => file.current?.click()}>
          <FileUp size={13} strokeWidth={1.8} /> Upload a file
        </button>
        <input
          ref={file}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const r = await readJobFile(f);
            if (r.error !== undefined) return setNote(r.error);
            await draft(r.text, 'you told us');
          }}
        />
      </div>
      {note && (
        <span role="alert" style={{ color: 'var(--amber)' }}>
          {note}
        </span>
      )}
    </div>
  );
}

/** A draft from a page or a text: what was used and what it does not say; Accept, Edit, or Reject. Nothing is on the job before Accept. */
export function PageDraftCard({ job, s }: { job: DemoJob; s: State }) {
  const d = job.pageDraft;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  if (!d) return <p className="aj-muted m-0">This draft was accepted or rejected.</p>;
  const ro = Boolean(s.reviewerAs);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span style={{ fontWeight: 650 }}>{d.kind === 'about' ? 'About us' : 'About the project'}</span>
        <span className="aj-chip">From {d.source}</span>
      </div>
      {editing ? (
        <textarea style={{ ...inputStyle, minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} aria-label="Edit the draft" autoFocus />
      ) : (
        <div className="ej-draft-text flex flex-col gap-1">
          {d.lines.map((l, i) => (
            <p key={i} className="m-0">
              {l}
            </p>
          ))}
        </div>
      )}
      <span className="aj-faint" style={{ fontSize: 12 }}>
        Used: {d.used}
        {d.missing ? ` Not on the page: ${d.missing}` : ''}
      </span>
      {d.social && d.social.length > 0 && <span className="aj-faint" style={{ fontSize: 12 }}>The page links to {d.social.length} social {d.social.length === 1 ? 'account' : 'accounts'}; they can be added in Organisation settings.</span>}
      {!ro && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="aj-ink-btn" disabled={!d.lines.length && !editing} onClick={() => acceptPageDraft(job.id, editing ? text.split('\n') : undefined)}>
            {editing ? 'Accept as edited' : 'Accept'}
          </button>
          {!editing && d.lines.length > 0 && (
            <button
              type="button"
              className="aj-pill"
              onClick={() => {
                setText(d.lines.join('\n'));
                setEditing(true);
              }}
            >
              Edit
            </button>
          )}
          <button type="button" className="aj-text-btn" onClick={() => rejectPageDraft(job.id)}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

/** Open suggestions, each with its source and reason; Accept (as it is or edited), or Reject, which is not offered again on this job. */
export function SuggestionCard({ job, s }: { job: DemoJob; s: State }) {
  const open = (job.suggestions ?? []).filter((x) => x.state === 'open');
  const [edit, setEdit] = useState<Record<string, { min?: string; max?: string; years?: string }>>({});
  if (!open.length) return <p className="aj-muted m-0">No suggestion waiting.</p>;
  const ro = Boolean(s.reviewerAs);
  return (
    <div className="flex flex-col gap-3">
      {open.map((sg) => {
        const e = edit[sg.id];
        const num = (v?: string) => (v === undefined || v.trim() === '' ? undefined : Number(v.replace(/[,\s]/g, '')));
        return (
          <div key={sg.id} className="flex flex-col gap-1.5" role="group" aria-label={`Suggested ${sg.fact === 'salary' ? 'pay' : 'experience'}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span style={{ fontWeight: 650 }}>{sg.fact === 'salary' ? 'Pay' : 'Years of experience'}: {sg.value}</span>
              <span className="aj-chip" data-tone={sg.source.includes('sample') ? 'amber' : undefined}>
                From {sg.source}
              </span>
            </div>
            <span className="aj-faint" style={{ fontSize: 12 }}>
              {sg.reason}
            </span>
            {e && sg.pay && (
              <div className="flex flex-wrap items-center gap-1.5">
                <input style={{ ...inputStyle, minHeight: 32, width: 120 }} value={e.min ?? ''} onChange={(ev) => setEdit({ ...edit, [sg.id]: { ...e, min: ev.target.value } })} aria-label="Lowest pay" />
                <span className="aj-faint">to</span>
                <input style={{ ...inputStyle, minHeight: 32, width: 120 }} value={e.max ?? ''} onChange={(ev) => setEdit({ ...edit, [sg.id]: { ...e, max: ev.target.value } })} aria-label="Highest pay" />
                <span className="aj-faint">
                  {sg.pay.currency} a {sg.pay.period}
                </span>
              </div>
            )}
            {e && sg.years !== undefined && <input style={{ ...inputStyle, minHeight: 32, width: 90 }} value={e.years ?? ''} onChange={(ev) => setEdit({ ...edit, [sg.id]: { ...e, years: ev.target.value } })} aria-label="Years of experience" />}
            {!ro && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className="aj-ink-btn" onClick={() => acceptSuggestion(job.id, sg.id, e ? { min: num(e.min), max: num(e.max), years: num(e.years) } : undefined)}>
                  {e ? 'Accept as edited' : 'Accept'}
                </button>
                {!e && (
                  <button type="button" className="aj-pill" onClick={() => setEdit({ ...edit, [sg.id]: sg.pay ? { min: String(sg.pay.min), max: String(sg.pay.max) } : { years: String(sg.years ?? '') } })}>
                    Edit
                  </button>
                )}
                <button type="button" className="aj-text-btn" onClick={() => rejectSuggestion(job.id, sg.id)}>
                  Reject
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
