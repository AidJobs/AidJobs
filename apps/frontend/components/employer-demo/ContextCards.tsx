'use client';

import { FileUp, Link2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { acceptPageDraft, acceptSuggestion, addOrgSocial, canEditOrgSocial, extractDraft, pageLinesOf, rejectPageDraft, rejectSuggestion, removeOrgSocial, setPageIntake, socialLabel, toggleJobSocial } from './context';
import { draftFromPage, MAX_TEXT, readPageVia } from './pages';
import { ACCEPTED, readJobFile } from './readFile';
import type { OpenTarget } from './aiActions';
import type { DemoJob, State } from './types';
import { inputStyle } from './ui';

/** Turn page/paste text into lines for the open section editor (fill the same box; Save still commits). */
function fillLinesFrom(raw: string): string {
  const page = raw.slice(0, MAX_TEXT);
  const drafted = extractDraft(page);
  if (drafted.length) return drafted.join('\n');
  const lines = pageLinesOf(page);
  return lines.length ? lines.map((l) => (l.startsWith('- ') ? `• ${l.slice(2)}` : l)).join('\n') : page;
}

/**
 * Link / Read / Draft / Upload that fill an open About us or Project editor (same box as Save/Cancel).
 * Used inside the JD pencil editor — not a second body.
 */
export function PageFillTools({ kind, website, text, onText, disabled }: { kind: 'about' | 'project'; website?: string; text: string; onText: (t: string) => void; disabled?: boolean }) {
  const [url, setUrl] = useState(kind === 'about' ? website ?? '' : '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const read = async () => {
    if (!url.trim() || disabled) return;
    setBusy(true);
    setNote('');
    const r = await readPageVia(kind === 'about' ? 'website' : 'project', url);
    setBusy(false);
    if (!r.ok) return setNote(`${r.reason.charAt(0).toUpperCase()}${r.reason.slice(1)}: paste its text below, or upload the file.`);
    onText(fillLinesFrom(r.text));
  };
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={kind === 'about' ? 'Fill About us from a page or file' : 'Fill About the project from a page or file'}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link2 size={14} strokeWidth={1.8} className="aj-faint shrink-0" aria-hidden />
        <input
          style={{ ...inputStyle, minHeight: 34, flex: 1, minWidth: 180 }}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && !disabled && read()}
          placeholder={kind === 'about' ? 'https://your-organisation.org/about' : 'https://… the project’s page'}
          aria-label={kind === 'about' ? 'Your organisation’s page address' : 'The project page address'}
          disabled={disabled || busy}
          inputMode="url"
        />
        <button type="button" className="aj-pill" style={{ height: 34 }} disabled={busy || disabled || !url.trim()} onClick={read}>
          {busy ? 'Reading…' : 'Read this page'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="aj-text-btn"
          style={{ height: 30 }}
          disabled={busy || disabled || !text.trim()}
          onClick={() => {
            setNote('');
            onText(fillLinesFrom(text));
          }}
        >
          Draft from this text
        </button>
        <button type="button" className="aj-text-btn ej-upload-btn" style={{ height: 30 }} disabled={busy || disabled} onClick={() => file.current?.click()}>
          <FileUp size={13} strokeWidth={1.8} aria-hidden />
          <span>Upload a file</span>
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
            if (!f || disabled) return;
            const r = await readJobFile(f);
            if (r.error !== undefined) return setNote(r.error);
            onText(fillLinesFrom(r.text));
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

/**
 * Chat / window field (About us or About the project): link, paste, or upload → draft card (Accept / Edit / Reject).
 * The JD pencil editor uses PageFillTools + Save/Cancel on the section instead (U-3, 20 Nov 2026).
 */
export function PageField({ job, s, kind, open }: { job: DemoJob; s: State; kind: 'about' | 'project'; open: (t: OpenTarget) => void; compact?: boolean }) {
  const [url, setUrl] = useState(kind === 'about' ? s.org.website : '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const ro = Boolean(s.reviewerAs);
  const what = kind === 'about' ? 'About us' : 'About the project';
  const text = job.pageIntake?.[kind] ?? '';
  const setText = (v: string) => setPageIntake(job.id, kind, v.slice(0, MAX_TEXT));
  // R2-P0-3: after Accept/clear, intake is empty — show what is already kept so the card does not look blank.
  const kept =
    kind === 'about'
      ? (job.pack?.about?.text || s.org.about || '').trim()
      : (job.pack?.project?.text || '').trim();
  const makeDraft = async (t: string, source: 'your website' | 'the project page' | 'you told us', social: string[] = []) => {
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
    await makeDraft(r.text, kind === 'about' ? 'your website' : 'the project page', r.social);
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
      <textarea
        style={{ ...inputStyle, minHeight: 64 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Or paste the text here"
        aria-label={`Text for ${what}`}
        disabled={ro}
      />
      {!text.trim() && kept ? (
        <p className="aj-faint m-0" style={{ fontSize: 12 }}>
          Already kept: {kept.length > 160 ? `${kept.slice(0, 160)}…` : kept}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="aj-pill" style={{ height: 30 }} disabled={busy || ro || !text.trim()} onClick={() => makeDraft(text, 'you told us')}>
          Draft from this text
        </button>
        <button type="button" className="aj-text-btn ej-upload-btn" style={{ height: 30 }} disabled={busy || ro} onClick={() => file.current?.click()}>
          <FileUp size={13} strokeWidth={1.8} aria-hidden />
          <span>Upload a file</span>
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
            await makeDraft(r.text, 'you told us');
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
      {d.social && d.social.length > 0 && canEditOrgSocial(s) && (
        <div className="flex flex-col gap-1">
          <span className="aj-faint" style={{ fontSize: 12 }}>
            The page links to these accounts. Add any to your organisation&apos;s social links (nothing is saved unless you add it):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {d.social.map((u) =>
              (s.org.social ?? []).includes(u) ? (
                <span key={u} className="aj-chip">
                  {socialLabel(u)} · added
                </span>
              ) : (
                <button key={u} type="button" className="aj-pill" style={{ height: 28 }} onClick={() => addOrgSocial(u)}>
                  Add {socialLabel(u)}
                </button>
              ),
            )}
          </div>
        </div>
      )}
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

/**
 * Social links (section 19, phase 5, E): kept by the organisation, added here or in Organisation settings; on a job (`job`) each one is
 * included or left out for that job only. Shown as a row on the public job page.
 */
export function SocialLinks({ s, job }: { s: State; job?: DemoJob }) {
  const [url, setUrl] = useState('');
  const [bad, setBad] = useState(false);
  const ro = Boolean(s.reviewerAs);
  const owner = canEditOrgSocial(s);
  const links = s.org.social ?? [];
  const add = () => {
    if (!url.trim()) return;
    const ok = addOrgSocial(url);
    setBad(!ok && !links.some((l) => l.includes(url.trim().replace(/^https?:\/\//, ''))));
    if (ok) setUrl('');
  };
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label="Social links">
      {links.length === 0 && <span className="aj-faint">No social links yet. Optional: they show as a row on each job page.</span>}
      {links.map((u) => (
        <div key={u} className="flex flex-wrap items-center gap-2">
          {job ? (
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <input type="checkbox" checked={!(job.socialOff ?? []).includes(u)} disabled={ro} onChange={() => toggleJobSocial(job.id, u)} />
              <span className="min-w-0 truncate">
                <strong>{socialLabel(u)}</strong> <span className="aj-faint">{u.replace(/^https:\/\//, '')}</span>
              </span>
            </label>
          ) : (
            <span className="min-w-0 flex-1 truncate">
              <strong>{socialLabel(u)}</strong> <span className="aj-faint">{u.replace(/^https:\/\//, '')}</span>
            </span>
          )}
          {!job && owner && (
            <button type="button" className="aj-text-btn" style={{ height: 28 }} onClick={() => removeOrgSocial(u)} aria-label={`Remove ${socialLabel(u)}`}>
              Remove
            </button>
          )}
        </div>
      ))}
      {job && links.length > 0 && <span className="aj-faint" style={{ fontSize: 12 }}>Ticked links show on this job&apos;s page; leaving one out changes only this job.</span>}
      {!ro && !owner && <span className="aj-faint" style={{ fontSize: 12 }}>Only your organisation&apos;s owner adds or removes its links.</span>}
      {owner && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            style={{ ...inputStyle, minHeight: 32, flex: 1, minWidth: 180 }}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setBad(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="https://www.linkedin.com/company/your-organisation"
            aria-label="Add a social link"
            inputMode="url"
          />
          <button type="button" className="aj-pill" style={{ height: 32 }} disabled={!url.trim()} onClick={add}>
            Add
          </button>
        </div>
      )}
      {bad && (
        <span role="alert" style={{ color: 'var(--amber)' }}>
          That is not an https address.
        </span>
      )}
    </div>
  );
}

/** Open suggestions, each with its source and reason; Accept (as it is or edited), or Reject, which is not offered again on this job. */
export function SuggestionCard({ job, s }: { job: DemoJob; s: State }) {
  const open = (job.suggestions ?? []).filter((x) => x.state === 'open');
  const [edit, setEdit] = useState<Record<string, { min?: string; max?: string; years?: string }>>({});
  const [wrong, setWrong] = useState<Record<string, string>>({});
  if (!open.length) return <p className="aj-muted m-0">No suggestion waiting.</p>;
  const ro = Boolean(s.reviewerAs);
  return (
    <div className="flex flex-col gap-3">
      {open.map((sg) => {
        const e = edit[sg.id];
        const num = (v?: string) => (v === undefined ? undefined : v.trim() === '' ? NaN : Number(v.replace(/[,\s]/g, '')));
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
                <button type="button" className="aj-ink-btn" onClick={() => setWrong({ ...wrong, [sg.id]: acceptSuggestion(job.id, sg.id, e ? { min: num(e.min), max: num(e.max), years: num(e.years) } : undefined) ?? '' })}>
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
            {wrong[sg.id] && (
              <span role="alert" style={{ color: 'var(--amber)' }}>
                {wrong[sg.id]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
