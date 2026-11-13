'use client';

import { ChevronDown, GripHorizontal, MessagesSquare, Plus, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import Tip from '@/components/site/Tip';
import { applyOutline, createFormat, formatOf, headingOf, setFacts as changeFacts, subId } from './actions';
import DragList, { moveItem } from './DragList';
import { CONTRACTS, ENGAGEMENTS, FAMILIES_ORDER, GROUPS, headingFor, orderSections, outlineOrder, placeIn, recommendSections, SECTION_BY_KEY, SECTIONS } from './engine';
import { isWritten } from './flow';
import MenuButton from './MenuButton';
import { recommendation, TYPE_REASONS, wordsFor } from './setup';
import { getState } from './store';
import type { DemoJob, Format, Recruitment, State } from './types';
import { inputStyle } from './ui';

/**
 * What the template panel shows: this job's sections (once written), a template with its sections as adjusted, or one being created.
 * `from`: the template Create your own started from, or blank.
 */
export type Pick = { tab: 'sections' | 'templates' | 'own'; key: string; name: string; order: Format['order']; from?: string };

/** A template's headings for this job: its own sections and those the job type calls for. */
export function orderFor(s: State, job: DemoJob, key: string): Format['order'] {
  const format = formatOf(s, key);
  return orderSections(recommendSections(format, job.facts), format).map((k) => ({ key: k, heading: headingFor(k, format) }));
}

export function startPick(s: State, job: DemoJob, tab: Pick['tab']): Pick {
  const key = job.setup ? recommendation(s, job.format).key : job.format;
  return { tab, key, name: '', order: orderFor(s, job, key), from: key };
}

/**
 * The template's sections after the job type changed: unedited, they follow the new type; edited, the sections the old type brought
 * and the new one does not are taken out, the ones the new type brings are added, and every rename is kept.
 */
export function refitPick(s: State, before: DemoJob, after: DemoJob, pick: Pick): Pick {
  if (pick.tab !== 'templates') return pick;
  const was = orderFor(s, before, pick.key);
  const now = orderFor(s, after, pick.key);
  if (JSON.stringify(pick.order) === JSON.stringify(was)) return { ...pick, order: now };
  const gone = was.filter((o) => !now.some((n) => n.key === o.key)).map((o) => o.key);
  const kept = pick.order.filter((o) => !gone.includes(o.key));
  const added = now.filter((n) => !was.some((o) => o.key === n.key) && !kept.some((o) => o.key === n.key));
  const all = [...kept, ...added];
  // The user's own order stays; a section the new type brings goes in at its group.
  const keys = added.reduce((order, a) => placeIn(order, a.key), kept.map((o) => o.key));
  return { ...pick, order: keys.map((k) => all.find((o) => o.key === k)!) };
}

/** The headings the job description shows while choosing: the template's sections as adjusted, or the ones being created. */
export function previewOrder(_s: State, _job: DemoJob, pick: Pick): Format['order'] {
  return pick.order;
}

const RECRUITMENT: Array<{ key: Recruitment; said: string }> = [
  { key: 'vacancy', said: 'for one post now' },
  { key: 'roster', said: 'for a roster' },
  { key: 'proposal', said: 'at proposal stage' },
];

/** "This is a job · fixed-term · for one post now": each word opens its choices; a word AidJobs could not read is marked. */
export function JobTypeSentence({ job, s, onChanged }: { job: DemoJob; s: State; onChanged?: (after: DemoJob) => void }) {
  const f = job.facts;
  const setFacts = (id: string, patch: Partial<DemoJob['facts']>) => {
    changeFacts(id, patch);
    const after = getState().jobs.find((j) => j.id === id);
    if (after) onChanged?.(after);
  };
  const ro = Boolean(s.reviewerAs);
  const engagement = ENGAGEMENTS.find((e) => e.key === f.engagement) ?? ENGAGEMENTS[0];
  const recruitment = RECRUITMENT.find((r) => r.key === f.recruitment) ?? RECRUITMENT[0];
  const word = (label: string, value: string, unclear: boolean, actions: Array<{ label: string; current: boolean; run: () => void }>) =>
    ro ? (
      <span className="ej-word" data-unclear={unclear || undefined}>
        {value}
      </span>
    ) : (
      <MenuButton label={`${label}: ${value}${unclear ? ', not clear yet' : ''}. Change it`} className="ej-word" align="left" trigger={<span data-unclear={unclear || undefined}>{value}</span>} actions={actions} />
    );
  return (
    <div className="ej-type-sentence" role="group" aria-label="Job type">
      <span>This is a</span>
      {word('Engagement', engagement.label.split(' ')[0].toLowerCase(), false, ENGAGEMENTS.map((e) => ({ label: e.label, current: e.key === f.engagement, run: () => setFacts(job.id, { engagement: e.key, contract: CONTRACTS[e.key][0] }) })))}
      <span aria-hidden>·</span>
      {word('Contract', f.contract ? f.contract.replace(' (under a year)', '').toLowerCase() : 'contract?', !f.contract, CONTRACTS[f.engagement].map((c) => ({ label: c, current: c === f.contract, run: () => setFacts(job.id, { contract: c }) })))}
      <span aria-hidden>·</span>
      {word('Recruitment', recruitment.said, false, RECRUITMENT.map((r) => ({ label: r.said.charAt(0).toUpperCase() + r.said.slice(1), current: r.key === f.recruitment, run: () => setFacts(job.id, { recruitment: r.key }) })))}
    </div>
  );
}

/** The template's headings, by group, as they will read; what the last change added or removed is marked, with the reason. */
export function HeadingsPreview({ order, title, note }: { order: Format['order']; title: string; note: string }) {
  const keys = order.map((o) => o.key);
  const sig = keys.join();
  const [seen, setSeen] = useState({ sig, keys, base: keys });
  if (seen.sig !== sig) setSeen({ sig, keys, base: seen.keys });
  const removed = seen.base.filter((k) => !keys.includes(k));
  // In the group order the headings show by group; once a section was moved across groups, as one list in the user's order.
  const grouped = outlineOrder(keys).join() === keys.join();
  const row = (k: string) => {
    const added = !seen.base.includes(k);
    const entry = order.find((o) => o.key === k);
    return (
      <div key={k} className="ej-heading-row" data-added={added || undefined}>
        <span style={{ fontWeight: 650 }}>{entry?.heading}</span>
        <span className="aj-faint" style={{ fontSize: 12 }}>
          {added && TYPE_REASONS[k] ? `${TYPE_REASONS[k]}. ` : ''}
          {SECTION_BY_KEY[k]?.hint}
        </span>
        {entry?.subs?.length ? <span className="aj-faint" style={{ fontSize: 12 }}>Sub-sections: {entry.subs.map((sb) => sb.heading).join(' · ')}</span> : null}
      </div>
    );
  };
  return (
    <article className="aj-card ej-headings flex flex-col gap-3 p-4 lg:p-5" aria-label={`${title}: its sections`}>
      <div className="flex flex-col gap-0.5">
        <span className="ej-panel-label">{title}</span>
        <span className="aj-faint" style={{ fontSize: 12 }}>
          {note}
        </span>
      </div>
      {grouped ? (
        GROUPS.map((g) => {
          const inGroup = keys.filter((k) => SECTION_BY_KEY[k]?.group === g.key);
          if (!inGroup.length) return null;
          return (
            <section key={g.key} className="flex flex-col gap-1.5" aria-label={g.label}>
              <span className="aj-faint" style={{ fontSize: 11, fontWeight: 650, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                {g.label}
              </span>
              {inGroup.map(row)}
            </section>
          );
        })
      ) : (
        <section className="flex flex-col gap-1.5" aria-label="In your order">
          {keys.map(row)}
        </section>
      )}
      {removed.length > 0 && (
        <span className="aj-faint" style={{ fontSize: 12 }}>
          Not in this one: {removed.map((k) => SECTION_BY_KEY[k]?.label ?? k).join(', ')}.
        </span>
      )}
    </article>
  );
}

/** A heading changed on the job itself: applied when the field is left or Enter is pressed, so it can be cleared and retyped. */
function LazyHeading({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() && draft.trim() !== value) onCommit(draft.trim());
    setDraft(null);
  };
  return (
    <input
      className="ej-heading-input"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape' && draft !== null) {
          e.stopPropagation();
          setDraft(null);
        }
      }}
      aria-label={label}
    />
  );
}

/** A section's sub-sections in the outline (section 19, phase 5, B): one level, renamed, moved within the section, removed, or added. */
function SubRows({ entry, onChange, lazy, disabled }: { entry: Format['order'][number]; onChange: (subs: NonNullable<Format['order'][number]['subs']>) => void; lazy: boolean; disabled?: string }) {
  const subs = entry.subs ?? [];
  const [adding, setAdding] = useState('');
  const move = (i: number, by: -1 | 1) => {
    const next = [...subs];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };
  return (
    <div className="ej-subrows flex flex-col gap-1" role="group" aria-label={`Sub-sections of ${entry.heading}`}>
      {subs.map((sb, i) => (
        <div key={sb.id} className="ej-outline-row ej-subrow min-w-0">
          {lazy ? (
            <LazyHeading value={sb.heading} label={`Sub-heading ${i + 1} of ${entry.heading}`} onCommit={(v) => onChange(subs.map((x) => (x.id === sb.id ? { ...x, heading: v } : x)))} />
          ) : (
            <input className="ej-heading-input" value={sb.heading} onChange={(e) => onChange(subs.map((x) => (x.id === sb.id ? { ...x, heading: e.target.value } : x)))} aria-label={`Sub-heading ${i + 1} of ${entry.heading}`} />
          )}
          <span className="ej-row-tools">
            <Tip label="Move up within the section">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${sb.heading} up`}>
                <ChevronDown size={12} strokeWidth={2} style={{ transform: 'rotate(180deg)' }} />
              </button>
            </Tip>
            <Tip label="Move down within the section">
              <button type="button" disabled={i === subs.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${sb.heading} down`}>
                <ChevronDown size={12} strokeWidth={2} />
              </button>
            </Tip>
            <Tip label="Remove this sub-section">
              <button type="button" onClick={() => onChange(subs.filter((x) => x.id !== sb.id))} aria-label={`Remove ${sb.heading}`}>
                <X size={12} strokeWidth={2} />
              </button>
            </Tip>
          </span>
        </div>
      ))}
      {disabled ? (
        <span className="aj-faint" style={{ fontSize: 11.5 }}>
          {disabled}
        </span>
      ) : (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!adding.trim()) return;
            onChange([...subs, { id: subId(), heading: adding.trim() }]);
            setAdding('');
          }}
        >
          <input className="ej-heading-input ej-sub-add" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="+ Sub-section" aria-label={`Add a sub-section to ${entry.heading}`} />
          {adding.trim() && (
            <button type="submit" className="aj-text-btn" style={{ height: 26 }}>
              Add
            </button>
          )}
        </form>
      )}
    </div>
  );
}

/**
 * A template's sections: added, removed, renamed, and moved anywhere, across groups too (section 19, phase 5, B; the handle takes the
 * arrow keys), each with its sub-sections. A section added goes in at its group. `headingOf` names a section added; `lazy` applies a
 * rename only when its field is left; `subsOff`: why a section cannot have sub-sections yet.
 */
export function HeadingsEditor({ order, onChange, recommended, headingOf: nameOf = (k) => SECTION_BY_KEY[k]?.label ?? k, lazy = false, subsOff }: { order: Format['order']; onChange: (o: Format['order']) => void; recommended: string[]; headingOf?: (key: string) => string; lazy?: boolean; subsOff?: (key: string) => string | undefined }) {
  const ids = order.map((o) => o.key);
  const entry = (k: string) => order.find((o) => o.key === k)!;
  const rename = (key: string, heading: string) => onChange(order.map((o) => (o.key === key ? { ...o, heading } : o)));
  const add = (key: string) => {
    const keys = placeIn(ids, key);
    onChange(keys.map((k) => (k === key ? { key, heading: nameOf(key) } : entry(k))));
  };
  return (
    <div className="flex flex-col gap-3" aria-label="Sections of your template">
      <span className="aj-faint" style={{ fontSize: 11.5 }}>
        Drag a section anywhere, even into another group; once moved, the job keeps your order.
      </span>
      {ids.length > 0 && (
        <DragList ids={ids} label={(k) => entry(k).heading} onMove={(from, to) => onChange(moveItem(ids, from, to).map(entry))}>
          {(k) => (
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="ej-outline-row min-w-0">
                {lazy ? (
                  <LazyHeading value={entry(k).heading} label={`Heading for ${SECTION_BY_KEY[k]?.label ?? k}`} onCommit={(v) => rename(k, v)} />
                ) : (
                  <input className="ej-heading-input" value={entry(k).heading} onChange={(e) => rename(k, e.target.value)} aria-label={`Heading for ${SECTION_BY_KEY[k]?.label ?? k}`} />
                )}
                <span className="aj-faint shrink-0" style={{ fontSize: 10.5 }} title="Its group">
                  {GROUPS.find((g) => g.key === SECTION_BY_KEY[k]?.group)?.label}
                </span>
                <span className="ej-row-tools">
                  <Tip label="Remove this section">
                    <button type="button" onClick={() => onChange(order.filter((o) => o.key !== k))} aria-label={`Remove ${entry(k).heading}`}>
                      <X size={12} strokeWidth={2} />
                    </button>
                  </Tip>
                </span>
              </div>
              <SubRows entry={entry(k)} lazy={lazy} disabled={subsOff?.(k)} onChange={(subs) => onChange(order.map((o) => (o.key === k ? { ...o, subs } : o)))} />
            </div>
          )}
        </DragList>
      )}
      {GROUPS.map((g) => {
        const missing = SECTIONS.filter((d) => d.group === g.key && !ids.includes(d.key)).sort((a, b) => Number(recommended.includes(b.key)) - Number(recommended.includes(a.key)));
        if (!missing.length) return null;
        return (
          <section key={g.key} className="flex flex-col gap-1" aria-label={`Add to ${g.label}`}>
            <span className="aj-faint" style={{ fontSize: 11, fontWeight: 650, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              Add · {g.label}
            </span>
            <div className="flex flex-wrap gap-1">
              {missing.map((d) => (
                <Tip key={d.key} label={`${d.hint}${recommended.includes(d.key) ? ' · recommended for this job' : ''}`}>
                  <button type="button" className="ej-add" data-recommended={recommended.includes(d.key)} onClick={() => add(d.key)} aria-label={`Add ${d.label}${recommended.includes(d.key) ? ', recommended for this job' : ''}`}>
                    {recommended.includes(d.key) ? <Sparkles size={11} strokeWidth={2} /> : <Plus size={11} strokeWidth={2} />}
                    {d.label}
                  </button>
                </Tip>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** "Started from": blank, or any template's sections, for Create your own (the earlier "Create your own JD format" pop-up). */
function StartFrom({ s, job, value, onPick }: { s: State; job: DemoJob; value: string; onPick: (key: string) => void }) {
  const usable = s.formats.filter((f) => !f.key.startsWith('pasted-'));
  return (
    <label className="flex flex-col gap-1">
      <span className="ej-panel-label">Start from</span>
      <select className="ej-select" value={value} onChange={(e) => onPick(e.target.value)} aria-label="Start from">
        <option value="">Blank</option>
        {FAMILIES_ORDER.map((fam) => {
          const list = usable.filter((f) => f.family === fam);
          return list.length ? (
            <optgroup key={fam} label={fam}>
              {list.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          ) : null;
        })}
      </select>
      <span className="aj-faint" style={{ fontSize: 11.5 }}>
        {value ? `${orderFor(s, job, value).length} sections from ${formatOf(s, value).label}` : 'No sections yet: add them below'}
      </span>
    </label>
  );
}

function OwnFields({ job, s, pick, setPick }: { job: DemoJob; s: State; pick: Pick; setPick: (p: Pick) => void }) {
  const recommended = recommendSections(formatOf(s, pick.key || job.format), job.facts);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="ej-panel-label">Name</span>
        <input style={inputStyle} value={pick.name} onChange={(e) => setPick({ ...pick, name: e.target.value })} placeholder="For example: Riverstone field roles" />
      </label>
      <StartFrom s={s} job={job} value={pick.from ?? ''} onPick={(key) => setPick({ ...pick, from: key, order: key ? orderFor(s, job, key) : [] })} />
      <span className="ej-panel-label">Sections, in order</span>
      <span className="aj-faint" style={{ fontSize: 12, marginTop: -8 }}>
        Add, remove, rename, and drag the sections; the job description shows them as you go. At least 3.
      </span>
      <HeadingsEditor order={pick.order} onChange={(order) => setPick({ ...pick, order })} recommended={recommended} />
    </div>
  );
}

/**
 * Choosing a template, as in the earlier outline editor (the user, 12 November 2026): the template from a list by family, then its
 * sections for this job, which can be renamed, removed, added, and put in order before it is used.
 */
function TemplateFields({ s, job, pick, setPick }: { s: State; job: DemoJob; pick: Pick; setPick: (p: Pick) => void }) {
  const rec = recommendation(s, job.format).key;
  const usable = s.formats.filter((f) => !f.key.startsWith('pasted-'));
  const f = formatOf(s, pick.key);
  const edited = JSON.stringify(pick.order) !== JSON.stringify(orderFor(s, job, pick.key));
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="ej-panel-label">Template</span>
        <select className="ej-select" value={pick.key} onChange={(e) => setPick({ ...pick, key: e.target.value, order: orderFor(s, job, e.target.value) })} aria-label="Template">
          {FAMILIES_ORDER.map((fam) => {
            const list = usable.filter((x) => x.family === fam).sort((a, b) => Number(b.key === rec) - Number(a.key === rec));
            return list.length ? (
              <optgroup key={fam} label={fam}>
                {list.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                    {x.key === rec ? ' (recommended)' : ''}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
        <span className="aj-faint" style={{ fontSize: 11.5 }}>
          {f.usedBy} · {pick.order.length} sections · about {wordsFor(pick.order.length)} words
        </span>
      </label>
      <div className="flex items-center gap-2">
        <span className="ej-panel-label min-w-0 flex-1">Its sections for this job</span>
        {edited && (
          <Tip label={`Back to ${f.label}'s own sections`}>
            <button type="button" className="aj-text-btn" style={{ height: 24, padding: '0 4px', fontSize: 12 }} onClick={() => setPick({ ...pick, order: orderFor(s, job, pick.key) })}>
              Reset
            </button>
          </Tip>
        )}
      </div>
      <span className="aj-faint" style={{ fontSize: 12, marginTop: -8 }}>
        Rename, remove, add, and drag the sections before you use it; the job description shows them as you go.
      </span>
      <HeadingsEditor order={pick.order} onChange={(order) => setPick({ ...pick, order })} recommended={recommendSections(f, job.facts)} headingOf={(k) => headingFor(k, f)} />
    </div>
  );
}

/** This job's own sections, edited directly once a template is in use: each change applies at once, text written is kept. */
function JobOutline({ s, job }: { s: State; job: DemoJob }) {
  const order = job.tags.map((k) => {
    const written = isWritten(job, k) ? job.sections.find((x) => x.key === k)?.subs?.map((sb) => ({ id: sb.id, heading: sb.title })) : undefined;
    const subs = written ?? job.subsPlan?.[k];
    return { key: k, heading: headingOf(s, job, k), ...(subs ? { subs } : {}) };
  });
  const ro = Boolean(s.reviewerAs);
  if (ro) return <HeadingsPreview order={order} title={formatOf(s, job.format).label} note="Read only for reviewers" />;
  return (
    <div className="flex flex-col gap-2">
      <span className="aj-faint" style={{ fontSize: 12 }}>
        Rename, remove, add, and drag this job&apos;s sections; each change applies at once, and text already written is kept where its section stays.
      </span>
      <HeadingsEditor
        order={order}
        onChange={(next) => applyOutline(job.id, next)}
        recommended={recommendSections(formatOf(s, job.format), job.facts)}
        headingOf={(k) => headingFor(k, formatOf(s, job.format))}
        lazy
      />
    </div>
  );
}

function PanelTabs({ tabs, pick, setPick }: { tabs: Array<[Pick['tab'], string]>; pick: Pick; setPick: (p: Pick) => void }) {
  const keys = (e: ReactKeyboardEvent<HTMLElement>) => {
    const at = tabs.findIndex(([k]) => k === pick.tab);
    const to = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const [k] = tabs[(to + tabs.length) % tabs.length];
    setPick({ ...pick, tab: k });
    document.getElementById(`ej-tp-${k}`)?.focus();
  };
  return (
    <div className="ej-w-tabs" role="tablist" aria-label="Template" onKeyDown={keys}>
      {tabs.map(([k, label]) => (
        <button key={k} type="button" role="tab" id={`ej-tp-${k}`} aria-selected={pick.tab === k} tabIndex={pick.tab === k ? 0 : -1} className="ej-w-tab" onClick={() => setPick({ ...pick, tab: k })}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** The label of the main button: what happens when it is pressed. */
export function applyLabel(s: State, job: DemoJob, pick: Pick): { label: string; disabled: boolean } {
  if (pick.tab === 'own') return { label: `Use ${pick.name.trim() || 'this template'}`, disabled: !pick.name.trim() || pick.order.length < 3 };
  const f = formatOf(s, pick.key);
  if (pick.order.length < 3) return { label: 'Keep at least 3 sections', disabled: true };
  if (job.setup) return { label: `Use ${f.label}`, disabled: false };
  const edited = JSON.stringify(pick.order) !== JSON.stringify(orderFor(s, job, pick.key));
  if (pick.key === job.format) return { label: edited ? 'Use these sections' : 'This is the template in use', disabled: !edited };
  return { label: `Change to ${f.label}`, disabled: false };
}

type Box = { x: number; y: number; w: number; h: number };
const BOX_KEY = 'aidjobs.employerDemo.templatePanelBox';
const MIN = { w: 340, h: 280 };

function savedBox(): Box | null {
  try {
    const v = JSON.parse(localStorage.getItem(BOX_KEY) ?? 'null');
    return v && [v.x, v.y, v.w, v.h].every(Number.isFinite) ? v : null;
  } catch {
    return null;
  }
}

function viewport(): { w: number; h: number } {
  return typeof window === 'undefined' ? { w: 1366, h: 860 } : { w: window.innerWidth, h: window.innerHeight };
}

/**
 * The template panel on wider screens (the user, 12 November 2026): it floats over the whole screen, moved by its title bar (or the
 * arrow keys on its handle), resized from its corner (dragged, or the arrow keys on that handle), and closed at any time; its place and
 * size are remembered and kept on screen. Closing it while the first template is chosen leaves the chat's question open.
 */
export function TemplatePanel({ job, s, pick, setPick, onApply, onClose, start }: { job: DemoJob; s: State; pick: Pick; setPick: (p: Pick) => void; onApply: () => void; onClose: () => void; start: Box }) {
  const [box, setBox] = useState<Box>(() => savedBox() ?? start);
  const [view, setView] = useState(viewport);
  const [small, setSmall] = useState(false);
  const drag = useRef<{ kind: 'move' | 'size'; dx: number; dy: number } | null>(null);
  const self = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    self.current?.focus({ preventScroll: true });
    return () => {
      const at = document.activeElement;
      if (opener?.isConnected && (!at || at === document.body || !at.isConnected)) opener.focus({ preventScroll: true });
    };
  }, []);
  const clamp = (b: Box): Box => {
    const w = Math.min(Math.max(MIN.w, b.w), view.w - 16);
    const h = Math.min(Math.max(MIN.h, b.h), view.h - 16);
    return { w, h, x: Math.min(Math.max(8, b.x), Math.max(8, view.w - w - 8)), y: Math.min(Math.max(8, b.y), Math.max(8, view.h - (small ? 48 : 120))) };
  };
  const at = clamp(box);
  const keep = (b: Box) => {
    const c = clamp(b);
    setBox(c);
    try {
      localStorage.setItem(BOX_KEY, JSON.stringify(c));
    } catch {
      /* storage unavailable */
    }
  };
  useEffect(() => {
    const resize = () => setView(viewport());
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setBox((b) => (d.kind === 'move' ? { ...b, x: e.clientX - d.dx, y: e.clientY - d.dy } : { ...b, w: e.clientX - d.dx, h: e.clientY - d.dy }));
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      setBox((b) => {
        try {
          localStorage.setItem(BOX_KEY, JSON.stringify(b));
        } catch {
          /* storage unavailable */
        }
        return b;
      });
    };
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);
  const setup = Boolean(job.setup);
  const ro = Boolean(s.reviewerAs);
  const tabs: Array<[Pick['tab'], string]> = setup ? [['templates', 'Templates'], ['own', 'Create your own']] : [['sections', "This job's sections"], ['templates', 'Templates'], ['own', 'Create your own']];
  const main = applyLabel(s, job, pick);
  const title = setup ? 'Choose a template' : `Template: ${formatOf(s, job.format).label}`;
  const arrows = (e: ReactKeyboardEvent<HTMLElement>, kind: 'move' | 'size') => {
    const step = e.shiftKey ? 64 : 24;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    keep(kind === 'move' ? { ...at, x: at.x + d[0], y: at.y + d[1] } : { ...at, w: at.w + d[0], h: at.h + d[1] });
  };
  return (
    <section
      ref={self}
      tabIndex={-1}
      className="ej-float aj-card"
      style={{ left: at.x, top: at.y, width: at.w, height: small ? undefined : at.h }}
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || self.current?.querySelector('[aria-controls][aria-expanded="true"]')) return;
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="ej-float-bar"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button:not(.ej-float-grip)')) return;
          drag.current = { kind: 'move', dx: e.clientX - at.x, dy: e.clientY - at.y };
          e.preventDefault();
        }}
      >
        <Tip label="Drag to move it anywhere; or use the arrow keys" side="bottom">
          <button type="button" className="ej-float-grip" aria-label="Move the template panel with the arrow keys" onKeyDown={(e) => arrows(e, 'move')}>
            <GripHorizontal size={14} strokeWidth={1.8} />
          </button>
        </Tip>
        <span className="min-w-0 flex-1 truncate" style={{ fontWeight: 700 }}>
          {title}
        </span>
        <Tip label={small ? 'Open it again' : 'Fold it to its title'} side="bottom">
          <button type="button" className="aj-icon-btn" style={{ width: 28, height: 28 }} onClick={() => setSmall(!small)} aria-label={small ? 'Open the template panel' : 'Fold the template panel'} aria-expanded={!small}>
            <ChevronDown size={14} strokeWidth={2} style={{ transform: small ? 'rotate(180deg)' : 'none' }} />
          </button>
        </Tip>
        <Tip label={setup ? 'Close it; the chat keeps the question open' : 'Close'} side="bottom">
          <button type="button" className="aj-icon-btn" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="Close the template panel">
            <X size={14} strokeWidth={1.8} />
          </button>
        </Tip>
      </div>
      {!small && (
        <>
          <div className="shrink-0 px-4 pt-2">
            <JobTypeSentence job={job} s={s} onChanged={(after) => setPick(refitPick(s, job, after, pick))} />
          </div>
          <div className="shrink-0 border-b aj-hair">
            <PanelTabs tabs={tabs} pick={pick} setPick={setPick} />
          </div>
          <div className="aj-scroll min-h-0 flex-1 px-4 py-3" role="tabpanel" aria-labelledby={`ej-tp-${pick.tab}`}>
            {pick.tab === 'sections' ? <JobOutline s={s} job={job} /> : pick.tab === 'own' ? <OwnFields job={job} s={s} pick={pick} setPick={setPick} /> : <TemplateFields s={s} job={job} pick={pick} setPick={setPick} />}
          </div>
          {pick.tab !== 'sections' && (
            <div className="flex shrink-0 flex-col gap-1.5 border-t px-4 py-2.5 aj-hair">
              <button type="button" className="aj-ink-btn w-full justify-center" disabled={main.disabled || ro} onClick={onApply}>
                {main.label}
              </button>
              {pick.tab === 'templates' && !ro && <SaveAsOurs s={s} pick={pick} />}
            </div>
          )}
          <button type="button" className="ej-float-resize" aria-label="Resize the template panel: drag, or use the arrow keys" title="Drag to make it bigger or smaller" onKeyDown={(e) => arrows(e, 'size')} onPointerDown={(e) => {
            drag.current = { kind: 'size', dx: e.clientX - at.w, dy: e.clientY - at.h };
            e.preventDefault();
          }} />
        </>
      )}
    </section>
  );
}

/** "Save as one of our templates": the sections as adjusted, kept for reuse under Your organisation (offered, never automatic). */
function SaveAsOurs({ s, pick }: { s: State; pick: Pick }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const taken = s.formats.some((f) => f.label.toLowerCase() === name.trim().toLowerCase());
  if (!open)
    return (
      <Tip label="Keep these sections as one of your organisation's templates, for any job">
        <button type="button" className="aj-text-btn self-center" style={{ height: 26 }} onClick={() => setOpen(true)}>
          Save as one of our templates
        </button>
      </Tip>
    );
  return (
    <div className="flex items-center gap-1.5">
      <input style={{ ...inputStyle, minHeight: 32 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Its name" aria-label="Name of the template" autoFocus />
      <button
        type="button"
        className="aj-pill shrink-0"
        disabled={!name.trim() || taken || pick.order.length < 3}
        onClick={() => {
          createFormat(name.trim(), pick.order, formatOf(s, pick.key).tone);
          setOpen(false);
          setName('');
        }}
      >
        {taken ? 'Name in use' : 'Save'}
      </button>
    </div>
  );
}

/**
 * Choosing a template on a phone: no panel. The job description shows only its headings; AidJobs' question sits in one slim line at the
 * top; the templates are a strip of cards at the bottom, swiped to compare while the headings change; "Create your own" edits the
 * headings in place; one button applies it.
 */
export function PhoneTemplate({ job, s, pick, setPick, onApply, onChat, onCancel, question }: { job: DemoJob; s: State; pick: Pick; setPick: (p: Pick) => void; onApply: () => void; onChat: () => void; onCancel?: () => void; question: ReactNode }) {
  const strip = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const rec = recommendation(s, job.format).key;
  const usable = s.formats.filter((f) => !f.key.startsWith('pasted-'));
  const cards = [...usable.filter((f) => f.key === rec), ...usable.filter((f) => f.key !== rec)];
  const choose = (key: string | 'own') => (key === 'own' ? setPick({ ...pick, tab: 'own' }) : setPick({ ...pick, tab: 'templates', key, order: orderFor(s, job, key) }));
  const nearest = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = strip.current;
      if (!el) return;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best: HTMLElement | null = null;
      let gap = Infinity;
      el.querySelectorAll<HTMLElement>('[data-card]').forEach((c) => {
        const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
        if (d < gap) {
          gap = d;
          best = c;
        }
      });
      const key = (best as HTMLElement | null)?.dataset.card;
      if (key && key !== (pick.tab === 'own' ? 'own' : pick.key)) choose(key);
    });
  };
  const main = applyLabel(s, job, pick);
  const order = previewOrder(s, job, pick);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button type="button" className="ej-ask-line" onClick={onChat} aria-label="Open the chat">
        <MessagesSquare size={14} strokeWidth={1.8} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{question}</span>
      </button>
      <div className="aj-scroll min-h-0 flex-1 px-3 py-3">
        <div className="mb-2 px-1">
          <JobTypeSentence job={job} s={s} onChanged={(after) => setPick(refitPick(s, job, after, pick))} />
        </div>
        {pick.tab === 'own' ? (
          <div className="aj-card p-4">
            <OwnFields job={job} s={s} pick={pick} setPick={setPick} />
          </div>
        ) : (
          <HeadingsPreview order={order} title={formatOf(s, pick.key).label} note={`${order.length} sections · about ${wordsFor(order.length)} words · swipe the cards below to compare`} />
        )}
      </div>
      <div ref={strip} className="ej-card-strip" onScroll={nearest} role="radiogroup" aria-label="Templates">
        {cards.map((f) => (
          <button key={f.key} type="button" data-card={f.key} role="radio" aria-checked={pick.tab !== 'own' && pick.key === f.key} className="ej-strip-card" onClick={(e) => {
            choose(f.key);
            e.currentTarget.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
          }}>
            <span className="truncate" style={{ fontWeight: 650 }}>
              {f.label}
            </span>
            <span className="aj-faint truncate" style={{ fontSize: 11 }}>
              {f.key === rec ? 'Recommended · ' : ''}
              {orderFor(s, job, f.key).length} sections
            </span>
          </button>
        ))}
        <button type="button" data-card="own" role="radio" aria-checked={pick.tab === 'own'} className="ej-strip-card" onClick={(e) => {
          choose('own');
          e.currentTarget.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        }}>
          <span style={{ fontWeight: 650 }}>Create your own</span>
          <span className="aj-faint" style={{ fontSize: 11 }}>
            Your sections, your names
          </span>
        </button>
      </div>
      <div className="flex shrink-0 gap-2 border-t px-3 py-2.5 aj-hair">
        {onCancel && (
          <button type="button" className="aj-pill" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className="aj-ink-btn flex-1 justify-center" disabled={main.disabled || Boolean(s.reviewerAs)} onClick={onApply}>
          {main.label}
        </button>
      </div>
    </div>
  );
}
