'use client';

import { ChevronUp, Pencil, Plus, X } from 'lucide-react';
import { Fragment, useRef, useState } from 'react';
import Tip from '@/components/site/Tip';
import { dismissToUpdate, editVersionSection, keepTranslation, refreshTranslation, reviewTranslation, subId, undoStep, versionOp } from './actions';
import { AddPanel, StepNote, useRemovedNoteHidden } from './DocPane';
import FixedBlock from './FixedBlock';
import Grip, { dropAt, type GripAction } from './Grip';
import { groupLabelOf, groupOfKey, groupOrderOf, grouped, KEPT } from './outline';
import { getState } from './store';
import { jobLang, langOf, stale, stillOwn, totalLines, untranslated, versionsOf } from './translate';
import type { DemoJob, GroupKey, JobLang, Section, State } from './types';
import { inputStyle, radioKeys } from './ui';

function versionStatus(job: DemoJob, k: JobLang): string {
  const t = job.translations?.[k];
  if (!t) return '';
  if (stale(job, t)) return `${langOf(jobLang(job)).label} changed`;
  return t.reviewed ? 'reviewed' : 'draft';
}

/** The job's own language and its versions, above the job description: each version is edited there like the job's own text. */
export function LangSwitch({ job, current, onPick }: { job: DemoJob; current: JobLang | null; onPick: (l: JobLang | null) => void }) {
  const versions = versionsOf(job);
  if (!versions.length) return null;
  const own = langOf(jobLang(job));
  return (
    <div className="aj-no-scrollbar flex items-center gap-1 overflow-x-auto" role="radiogroup" aria-label="Language of the job description" onKeyDown={radioKeys}>
      <button type="button" role="radio" aria-checked={!current} className="ej-jump" data-active={!current || undefined} onClick={() => onPick(null)} lang={own.key}>
        {own.native}
      </button>
      {versions.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={current === k} className="ej-jump" data-active={current === k || undefined} onClick={() => onPick(k)} lang={k}>
          {langOf(k).native}{' '}
          <span className="ej-jump-count" lang="en">
            {versionStatus(job, k)}
          </span>
        </button>
      ))}
    </div>
  );
}

const asText = (lines: string[]) => lines.map((l) => (l.startsWith('- ') ? `• ${l.slice(2)}` : l)).join('\n');

function Lines({ lines, job, keyOf, mark, ownLang }: { lines: string[]; job: DemoJob; keyOf: string; mark?: boolean; ownLang: JobLang }) {
  const out: React.ReactNode[] = [];
  let list: Array<{ text: string; same: boolean }> = [];
  const flush = (k: string) => {
    if (!list.length) return;
    out.push(
      <ul key={`u${k}`}>
        {list.map((l, i) => (
          <li key={i} lang={l.same ? ownLang : undefined}>
            {l.same && <OwnMark lang={ownLang} />}
            {l.text}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  lines.forEach((l, i) => {
    const same = Boolean(mark) && stillOwn(job, keyOf, l);
    if (l.startsWith('- ')) list.push({ text: l.slice(2), same });
    else {
      flush(String(i));
      out.push(
        <p key={i} lang={same ? ownLang : undefined}>
          {same && <OwnMark lang={ownLang} />}
          {l}
        </p>,
      );
    }
  });
  flush('end');
  return <>{out}</>;
}

/** A line still word for word in the job's own language, counted by its text wherever it is (section 19, phase 6, E). */
function OwnMark({ lang }: { lang: JobLang }) {
  return (
    <span className="aj-chip" data-tone="amber" style={{ height: 18, marginRight: 6 }} lang="en">
      {langOf(lang).label}
    </span>
  );
}

type Tools = { grip: (sec: Section) => GripAction[]; onKey: (key: string, by: -1 | 1) => void; onDrag: (key: string, y: number | null, done: boolean) => void; dropAfter: string | null | undefined };

function VersionSection({ job, lang, sec, tools, readOnly }: { job: DemoJob; lang: JobLang; sec: Section; tools?: Tools; readOnly: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [subs, setSubs] = useState<Array<{ id: string; title: string; text: string }>>([]);
  const t = job.translations?.[lang];
  const own = langOf(jobLang(job));
  const src = job.sections.find((x) => x.key === sec.key);
  const mark = t?.toUpdate?.[sec.key];
  const changed = job.undoStep?.tab === lang && job.undoStep.keys?.[0] === sec.key;
  const info = langOf(lang);
  return (
    <section id={`ej-ver-${sec.key}`} className="ej-dsec rounded-2xl px-3 py-2" data-changed={changed || undefined} data-drop-key={tools ? sec.key : undefined} data-drop-group={tools && t ? groupOfKey(t, sec.key) : undefined} data-drop={tools?.dropAfter === sec.key ? 'after' : undefined} aria-label={sec.title} style={{ scrollMarginTop: 12 }}>
      <div className="flex items-center gap-2">
        <h3 style={{ flex: 1 }}>{sec.title}</h3>
        {mark && (
          <span className="flex items-center gap-1" lang="en" dir="ltr">
            <Tip label={`Changed in ${langOf(mark).label}: bring it in line with the pencil, or dismiss the mark`}>
              <span className="aj-chip" data-tone="amber" tabIndex={0}>
                To update
              </span>
            </Tip>
            {!readOnly && (
              <button type="button" className="aj-text-btn" style={{ height: 24 }} onClick={() => dismissToUpdate(job.id, sec.key, lang)}>
                Dismiss
              </button>
            )}
          </span>
        )}
        {tools && !editing && (
          <span className="ej-sec-tools" lang="en" dir="ltr">
            <Tip label={`Edit ${sec.title}${sec.edited ? ' · Edited by you' : ''}`}>
              <button
                type="button"
                className="ej-sec-icon"
                onClick={() => {
                  setText(asText(sec.lines));
                  setTitle(sec.title);
                  setSubs((sec.subs ?? []).map((sb) => ({ id: sb.id, title: sb.title, text: asText(sb.lines) })));
                  setEditing(true);
                }}
                aria-label={`Edit ${sec.title}`}
              >
                <Pencil size={13} strokeWidth={1.8} />
              </button>
            </Tip>
            <Grip gripKey={`ver:${sec.key}`} className="ej-grip ej-sec-icon" label={`Move ${sec.title}, or press for its menu`} tip="Drag to move, or press for more" actions={tools.grip(sec)} onKey={(by) => tools.onKey(sec.key, by)} onDrag={(y) => tools.onDrag(sec.key, y, false)} onDrop={(y) => tools.onDrag(sec.key, y, true)} />
          </span>
        )}
      </div>
      {changed && !job.lastChange && <StepNote job={job} />}
      {editing ? (
        <div className="flex flex-col gap-2" lang="en" dir="ltr">
          <label className="flex flex-col gap-1">
            <span className="aj-faint" style={{ fontSize: 11.5 }}>
              Heading
            </span>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} aria-label={`Heading of ${sec.title}`} lang={lang} dir={info.dir} />
          </label>
          <textarea style={{ ...inputStyle, minHeight: 140, lineHeight: 1.6 }} value={text} onChange={(e) => setText(e.target.value)} aria-label={`${sec.title} text`} autoFocus lang={lang} dir={info.dir} />
          {subs.map((sb, i) => (
            <div key={sb.id} className="flex flex-col gap-1 rounded-xl border p-2 aj-hair">
              <div className="flex items-center gap-1">
                <input style={{ ...inputStyle, fontWeight: 650, flex: 1 }} value={sb.title} onChange={(e) => setSubs(subs.map((x) => (x.id === sb.id ? { ...x, title: e.target.value } : x)))} aria-label={`Heading ${i + 1} inside ${sec.title}`} placeholder="Heading" lang={lang} dir={info.dir} />
                <Tip label="Move this heading up">
                  <button type="button" className="aj-icon-btn" style={{ width: 28, height: 28 }} disabled={i === 0} onClick={() => setSubs(subs.map((x, n) => (n === i - 1 ? subs[i] : n === i ? subs[i - 1] : x)))} aria-label={`Move ${sb.title || 'this heading'} up`}>
                    <ChevronUp size={13} strokeWidth={2} />
                  </button>
                </Tip>
                <Tip label="Remove this heading and its text">
                  <button type="button" className="aj-icon-btn" style={{ width: 28, height: 28 }} onClick={() => setSubs(subs.filter((x) => x.id !== sb.id))} aria-label={`Remove ${sb.title || 'this heading'}`}>
                    <X size={13} strokeWidth={2} />
                  </button>
                </Tip>
              </div>
              <textarea style={{ ...inputStyle, minHeight: 80, lineHeight: 1.6 }} value={sb.text} onChange={(e) => setSubs(subs.map((x) => (x.id === sb.id ? { ...x, text: e.target.value } : x)))} aria-label={`${sb.title || 'Heading'} text`} lang={lang} dir={info.dir} />
            </div>
          ))}
          <button type="button" className="aj-text-btn self-start" style={{ height: 28, paddingInline: 0 }} onClick={() => setSubs([...subs, { id: subId(), title: '', text: '' }])}>
            <Plus size={12} strokeWidth={2} aria-hidden /> Add a heading inside this section
          </button>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="aj-ink-btn"
              onClick={() => {
                editVersionSection(job.id, lang, sec.key, text, { title, subs: subs.map((x) => ({ id: x.id, title: x.title, text: x.text })) });
                setEditing(false);
              }}
            >
              Save
            </button>
            <button type="button" className="aj-pill" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {sec.lines.length === 0 && (
            <span className="aj-faint" lang="en" dir="ltr">
              Empty: write it with the pencil, or ask in the chat.
            </span>
          )}
          <Lines lines={sec.lines} job={job} keyOf={sec.key} mark ownLang={own.key} />
          {sec.subs?.map((sb) => (
            <div key={sb.id} className="ej-subsection">
              <h4>{sb.title}</h4>
              <Lines lines={sb.lines} job={job} keyOf={sec.key} ownLang={own.key} />
            </div>
          ))}
        </>
      )}
      {src && (
        <div className="ej-ref" lang={own.key} dir={own.dir}>
          <span className="ej-ref-label" lang="en" dir="ltr">
            In {own.label}
          </span>
          <Lines lines={src.lines} job={job} keyOf={src.key} ownLang={own.key} />
        </div>
      )}
    </section>
  );
}

/**
 * A language version as a document (section 19, phase 6, E): the same draft as the job's own, with the four icons and the same
 * editor; the job's own section faintly as one block below each section for reference. Its sections, their grouping, the headings
 * inside them, and its fixed texts are its own; the facts are shared. When the job's own text changed by the rules or the facts, the
 * version stays as it is and offers the update, or to keep it as it is.
 */
export function LangDoc({ job, s, lang, readOnly = false }: { job: DemoJob; s: State; lang: JobLang; readOnly?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const [adding, setAdding] = useState<{ after: string | null; anchor: HTMLElement; end: boolean } | null>(null);
  const [dropAfter, setDropAfter] = useState<string | null | undefined>(undefined);
  const t = job.translations?.[lang];
  const removedKey = job.undoStep?.removed && !job.undoStep.writing && job.undoStep.tab === lang ? job.undoStep.removed.key : undefined;
  const hideRemoved = useRemovedNoteHidden(removedKey);
  if (!t) return null;
  const info = langOf(lang);
  const own = langOf(jobLang(job));
  const left = untranslated(job, t);
  const isStale = stale(job, t);
  const keys = t.sections.map((x) => x.key);
  const g = { groupOrder: t.groupOrder, groupOf: t.groupOf, customGroups: t.customGroups };
  const reading = grouped(keys, g);
  const focusGrip = (key: string) => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-grip-key="ver:${key}"]`)?.focus({ preventScroll: true }));
  // R1-10 leftover: skip refocus announce path when Move up/down is a no-op at the ends.
  const moveByReading = (key: string, by: -1 | 1) => {
    const before = getState().jobs.find((x) => x.id === job.id)?.translations?.[lang];
    if (!before) return;
    const keysBefore = before.sections.map((x) => x.key).join();
    const groupBefore = JSON.stringify({ groupOrder: before.groupOrder, groupOf: before.groupOf });
    versionOp(job.id, lang, { op: 'by', key, by, reading: true });
    const after = getState().jobs.find((x) => x.id === job.id)?.translations?.[lang];
    if (!after || (after.sections.map((x) => x.key).join() === keysBefore && JSON.stringify({ groupOrder: after.groupOrder, groupOf: after.groupOf }) === groupBefore)) return;
    focusGrip(key);
  };
  const openAdd = (after: string | null, anchor: HTMLElement | null, end: boolean) => anchor && setAdding({ after, anchor, end });
  const tools: Tools | undefined = readOnly
    ? undefined
    : {
        grip: (sec) => {
          const at = reading.indexOf(sec.key);
          const first = at <= 0;
          const last = at < 0 || at >= reading.length - 1;
          return [
            { label: 'Move up', off: first ? 'It is first in the job description' : undefined, run: () => moveByReading(sec.key, -1) },
            { label: 'Move down', off: last ? 'It is last in the job description' : undefined, run: () => moveByReading(sec.key, 1) },
            { label: 'Move to group…', items: groupOrderOf(g).filter((x) => x !== groupOfKey(g, sec.key)).map((x) => ({ label: groupLabelOf(x, t.customGroups), run: () => (versionOp(job.id, lang, { op: 'toGroup', key: sec.key, group: x }), focusGrip(sec.key)) })) },
            { label: 'Add a section below', run: () => openAdd(sec.key, document.querySelector<HTMLElement>(`[data-grip-key="ver:${sec.key}"]`), false) },
            ...(KEPT.includes(sec.key) ? [] : [{ label: 'Remove', danger: true, run: () => versionOp(job.id, lang, { op: 'remove', key: sec.key }) }]),
          ];
        },
        onKey: (key, by) => moveByReading(key, by),
        onDrag: (key, y, finished) => {
          if (y === null) return setDropAfter(undefined);
          const at = dropAt(root.current, y, key);
          if (!finished) return setDropAfter(at.after);
          setDropAfter(undefined);
          versionOp(job.id, lang, { op: 'drop', key, after: at.after, group: (at.group ?? groupOrderOf(g)[0]) as GroupKey });
          focusGrip(key);
        },
        dropAfter,
      };
  const step = job.undoStep?.tab === lang ? job.undoStep : undefined;
  const removedAt = step?.removed ? (step.removed.after && keys.includes(step.removed.after) ? step.removed.after : null) : undefined;
  const topNote = step && !step.removed && !step.keys?.some((k) => keys.includes(k));
  const removedNote =
    step?.removed && !hideRemoved ? (
      <div className="ej-change-note ej-removed-note" role="status" lang="en" dir="ltr">
        <X size={12} strokeWidth={2.4} />
        <span className="min-w-0 flex-1">Removed {step.removed.title}</span>
        <button type="button" className="aj-text-btn" style={{ height: 24 }} onClick={() => undoStep(job.id)}>
          Undo
        </button>
      </div>
    ) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl p-3" style={{ background: isStale ? 'var(--amber-bg)' : 'var(--surface-2)' }} lang="en" dir="ltr">
        <span className="min-w-0 flex-1">
          <strong>
            {info.label} version · {versionStatus(job, lang)}
          </strong>
          <span className="aj-muted">
            {' '}
            · {left ? `${left} of ${totalLines(t)} lines still in ${own.label}` : 'every line is in the language'}. {readOnly ? 'The facts are shared with every version.' : `The facts are shared; its sections are its own. A change in ${own.label} reaches it only when the two are linked, or when you take “Also in” after it.`}
            {!readOnly && job.status === 'live' && t.reviewed && ' It is on the live job page: an edit takes it off until you mark it as reviewed again.'}
          </span>
        </span>
        {!readOnly && isStale && (
          <>
            <button type="button" className="aj-pill" onClick={() => refreshTranslation(job.id, lang)}>
              Update the changed lines
            </button>
            <button type="button" className="aj-text-btn" onClick={() => keepTranslation(job.id, lang)}>
              Keep it as it is
            </button>
          </>
        )}
        {!readOnly && !t.reviewed && (
          <button type="button" className="aj-ink-btn" onClick={() => reviewTranslation(job.id, lang)}>
            Mark as reviewed
          </button>
        )}
      </div>
      <article ref={root} className="ej-doc flex flex-col gap-1" aria-label={`${info.label} version of the job description`} lang={lang} dir={info.dir} data-drop-top={dropAfter === null || undefined}>
        <div />
        {topNote && !job.lastChange && <StepNote job={job} />}
        {removedAt === null && removedNote}
        {t.sections.map((sec) => (
          <Fragment key={sec.key}>
            <VersionSection job={job} lang={lang} sec={sec} tools={tools} readOnly={readOnly} />
            {removedAt === sec.key && removedNote}
          </Fragment>
        ))}
        {!readOnly && (
          <div className="ej-addend" lang="en" dir="ltr">
            <Tip label="Add a section, or bring back a fixed text">
              <button type="button" className="ej-addend-btn" onClick={(e) => openAdd(keys[keys.length - 1] ?? null, e.currentTarget, true)} aria-label={`Add a section to the ${info.label} version`} aria-haspopup="dialog">
                <Plus size={14} strokeWidth={2.2} />
              </button>
            </Tip>
          </div>
        )}
        <FixedBlock job={job} s={s} lang={lang} />
      </article>
      {adding && <AddPanel job={job} s={s} at={adding} onClose={() => setAdding(null)} lang={lang} />}
    </div>
  );
}
