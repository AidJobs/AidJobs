'use client';

import { ChevronDown, GripHorizontal, MessagesSquare, Plus, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import Tip from '@/components/site/Tip';
import { createFormat, formatOf, groupingOf, headingOf, outlineOp, setFacts as changeFacts, versionOp } from './actions';
import { differences } from './langs';
import { jobLang, langOf, versionsOf } from './translate';
import { CONTRACTS, ENGAGEMENTS, GROUPS, headingFor, orderSections, recommendSections, SECTION_BY_KEY } from './engine';
import { addToGroup, applyToEntries, formatGrouping, groupedEntries, groupOfKey, groupOrderOf } from './outline';
import OutlineEditor from './OutlineEditor';
import MenuButton from './MenuButton';
import { familiesForOrg, recommendation, TYPE_REASONS, wordsFor } from './setup';
import { getState } from './store';
import type { DemoJob, Format, JobLang, Recruitment, State } from './types';
import { inputStyle } from './ui';

/**
 * What the template panel shows: this job's sections (once written), a template with its sections as adjusted, or one being created.
 * `from`: the template Create your own started from, or blank.
 */
export type Pick = { tab: 'sections' | 'templates' | 'own'; key: string; name: string; order: Format['order']; groupOrder?: Format['groupOrder']; customGroups?: Format['customGroups']; from?: string };

/** A template's headings for this job, in its grouping: its own sections and those the job type calls for, each joining its group. */
export function orderFor(s: State, job: DemoJob, key: string): Format['order'] {
  const format = formatOf(s, key);
  const g = formatGrouping(format);
  const entries = orderSections(recommendSections(format, job.facts), format).map((k) => ({ key: k, heading: headingFor(k, format) }));
  return groupedEntries(entries, g);
}

/** A template chosen in the panel: its sections for this job and its group order. */
function pickOf(s: State, job: DemoJob, key: string): { key: string; order: Format['order']; groupOrder?: Format['groupOrder']; customGroups?: Format['customGroups'] } {
  const f = formatOf(s, key);
  return { key, order: orderFor(s, job, key), groupOrder: f.groupOrder, customGroups: f.customGroups };
}

export function startPick(s: State, job: DemoJob, tab: Pick['tab']): Pick {
  const key = job.setup ? recommendation(s, job.format).key : job.format;
  return { tab, name: '', ...pickOf(s, job, key), from: key };
}

/** The pick's grouping, as the outline and the job read it (including groups the user added). */
export function pickGrouping(pick: Pick) {
  return { ...formatGrouping({ order: pick.order, groupOrder: pick.groupOrder }), customGroups: pick.customGroups };
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
  // The user's own grouping stays; a section the new type brings goes in at the end of its group.
  const g = pickGrouping({ ...pick, order: kept });
  const placed = added.reduce(
    (acc, a) => {
      const next = addToGroup(acc.keys, acc.grouping, a.key);
      return { keys: next.keys, grouping: { ...next.grouping, customGroups: pick.customGroups } };
    },
    { keys: kept.map((o) => o.key), grouping: g },
  );
  return { ...pick, order: groupedEntries(placed.keys.map((k) => all.find((o) => o.key === k)!), placed.grouping) };
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
export function HeadingsPreview({ order, title, note, groupOrder }: { order: Format['order']; title: string; note: string; groupOrder?: Format['groupOrder'] }) {
  const keys = order.map((o) => o.key);
  const sig = keys.join();
  const [seen, setSeen] = useState({ sig, keys, base: keys });
  if (seen.sig !== sig) setSeen({ sig, keys, base: seen.keys });
  const removed = seen.base.filter((k) => !keys.includes(k));
  // Always by group, in the order chosen (section 19, phase 6, B).
  const g = formatGrouping({ order, groupOrder });
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
      {groupOrderOf(g).map((gk) => {
        const inGroup = keys.filter((k) => groupOfKey(g, k) === gk);
        const label = GROUPS.find((x) => x.key === gk)?.label ?? gk;
        if (!inGroup.length) return null;
        return (
          <section key={gk} className="flex flex-col gap-1.5" aria-label={label}>
            <span className="aj-faint" style={{ fontSize: 11, fontWeight: 650, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              {label}
            </span>
            {inGroup.map(row)}
          </section>
        );
      })}
      {removed.length > 0 && (
        <span className="aj-faint" style={{ fontSize: 12 }}>
          Not in this one: {removed.map((k) => SECTION_BY_KEY[k]?.label ?? k).join(', ')}.
        </span>
      )}
    </article>
  );
}

/**
 * A template's sections being adjusted (the template panel, Create your own, a phone's template choice): the outline in the user's
 * design (section 19, phase 6, B), every change applied to the pick until it is used.
 */
function PickOutline({ pick, setPick, recommended, nameOf }: { pick: Pick; setPick: (p: Pick) => void; recommended: string[]; nameOf: (key: string) => string }) {
  return (
    <OutlineEditor
      rows={pick.order.map((o) => ({ key: o.key, heading: o.heading }))}
      grouping={pickGrouping(pick)}
      customGroups={pick.customGroups}
      recommended={recommended}
      label="Sections of the template, by group"
      onOp={(op) => setPick({ ...pick, ...applyToEntries(pick.order, pick.groupOrder, op, nameOf, pick.customGroups) })}
    />
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
        {familiesForOrg(s.org.orgType).map((fam) => {
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
      <StartFrom s={s} job={job} value={pick.from ?? ''} onPick={(key) => setPick({ ...pick, from: key, ...(key ? pickOf(s, job, key) : { order: [], groupOrder: undefined }), key: key || pick.key })} />
      <span className="ej-panel-label">Sections, in order</span>
      <span className="aj-faint" style={{ fontSize: 12, marginTop: -8 }}>
        Add, remove, rename, and drag the sections; the job description shows them as you go. At least 3.
      </span>
      <PickOutline pick={pick} setPick={setPick} recommended={recommended} nameOf={(k) => SECTION_BY_KEY[k]?.label ?? k} />
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
        <select className="ej-select" value={pick.key} onChange={(e) => setPick({ ...pick, ...pickOf(s, job, e.target.value) })} aria-label="Template">
          {familiesForOrg(s.org.orgType).map((fam) => {
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
            <button type="button" className="aj-text-btn" style={{ height: 24, padding: '0 4px', fontSize: 12 }} onClick={() => setPick({ ...pick, ...pickOf(s, job, pick.key) })}>
              Reset
            </button>
          </Tip>
        )}
      </div>
      <span className="aj-faint" style={{ fontSize: 12, marginTop: -8 }}>
        Rename, remove, add, and drag the sections before you use it; the job description shows them as you go.
      </span>
      <PickOutline pick={pick} setPick={setPick} recommended={recommendSections(f, job.facts)} nameOf={(k) => headingFor(k, f)} />
    </div>
  );
}

/**
 * This job's own sections, once a template is in use (section 19, phase 6, B): the same outline, each change applied at once to the
 * job, text already written kept with its section; read only for reviewers.
 */
export function JobOutline({ s, job, lang }: { s: State; job: DemoJob; lang?: JobLang }) {
  const version = lang && lang !== jobLang(job) ? job.translations?.[lang] : undefined;
  const rows = version ? version.sections.map((x) => ({ key: x.key, heading: x.title })) : job.tags.map((k) => ({ key: k, heading: headingOf(s, job, k) }));
  const ro = Boolean(s.reviewerAs);
  const where = version && lang ? ` They apply to the ${langOf(lang).label} version and the languages linked to it.` : versionsOf(job).length ? ' They apply to this language and the languages linked to it.' : '';
  return (
    <div className="flex flex-col gap-2">
      <span className="aj-faint" style={{ fontSize: 12 }}>
        {ro ? 'Read only for reviewers.' : `Drag a section, or press its grip for more; click a heading to rename it. Each change applies at once, and text already written stays with its section.${where}`}
      </span>
      <OutlineEditor
        rows={rows}
        grouping={version ? groupingOf(version) : groupingOf(job)}
        customGroups={version ? version.customGroups : job.customGroups}
        recommended={recommendSections(formatOf(s, job.format), job.facts)}
        marks={differences(job, version && lang ? lang : jobLang(job))}
        label={version && lang ? `${langOf(lang).label} version's sections, by group` : "This job's sections, by group"}
        onOp={ro ? undefined : (op) => (version && lang ? versionOp(job.id, lang, op) : outlineOp(job.id, op))}
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
export function TemplatePanel({ job, s, pick, setPick, onApply, onClose, start, lang }: { job: DemoJob; s: State; pick: Pick; setPick: (p: Pick) => void; onApply: () => void; onClose: () => void; start: Box; lang?: JobLang }) {
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
  const tabs: Array<[Pick['tab'], string]> = setup ? [['templates', 'Templates'], ['own', 'Create your own']] : ro ? [['sections', "This job's sections"]] : [['sections', "This job's sections"], ['templates', 'Templates'], ['own', 'Create your own']];
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
            {pick.tab === 'sections' ? <JobOutline s={s} job={job} lang={lang} /> : pick.tab === 'own' ? <OwnFields job={job} s={s} pick={pick} setPick={setPick} /> : <TemplateFields s={s} job={job} pick={pick} setPick={setPick} />}
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
          createFormat(name.trim(), pick.order, formatOf(s, pick.key).tone, pick.groupOrder, pick.customGroups);
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
  const rec = recommendation(s, job.format);
  const usable = s.formats.filter((f) => !f.key.startsWith('pasted-'));
  const familyRank = familiesForOrg(s.org.orgType);
  const prefer = [rec.key, ...rec.others];
  const cards = [
    ...prefer.map((k) => usable.find((f) => f.key === k)).filter((f): f is Format => Boolean(f)),
    ...usable
      .filter((f) => !prefer.includes(f.key))
      .sort((a, b) => familyRank.indexOf(a.family) - familyRank.indexOf(b.family) || a.label.localeCompare(b.label)),
  ];
  const choose = (key: string | 'own') => (key === 'own' ? setPick({ ...pick, tab: 'own' }) : setPick({ ...pick, tab: 'templates', ...pickOf(s, job, key) }));
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
          <div className="aj-card flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-0.5">
              <span className="ej-panel-label">{formatOf(s, pick.key).label}</span>
              <span className="aj-faint" style={{ fontSize: 12 }}>
                {`${order.length} sections · about ${wordsFor(order.length)} words · swipe the cards below to compare`}
              </span>
            </div>
            <PickOutline pick={pick} setPick={setPick} recommended={recommendSections(formatOf(s, pick.key), job.facts)} nameOf={(k) => headingFor(k, formatOf(s, pick.key))} />
          </div>
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
              {f.key === rec.key ? 'Recommended · ' : ''}
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
