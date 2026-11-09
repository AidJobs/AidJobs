'use client';

import { ChevronDown, GripHorizontal, MessagesSquare, Plus, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { formatOf, setFacts } from './actions';
import DragList, { moveItem } from './DragList';
import { CONTRACTS, ENGAGEMENTS, FAMILIES_ORDER, GROUPS, headingFor, orderSections, outlineOrder, recommendSections, SECTION_BY_KEY, SECTIONS } from './engine';
import MenuButton from './MenuButton';
import { recommendation, TYPE_REASONS, wordsFor } from './setup';
import Structure from './Structure';
import type { DemoJob, Format, Recruitment, State } from './types';
import { inputStyle } from './ui';

/** What the template panel shows: this job's sections (once written), the templates, or one being created. */
export type Pick = { tab: 'sections' | 'templates' | 'own'; key: string; name: string; order: Format['order'] };

/** A template's headings for this job: its own sections and those the job type calls for. */
export function orderFor(s: State, job: DemoJob, key: string): Format['order'] {
  const format = formatOf(s, key);
  return orderSections(recommendSections(format, job.facts), format).map((k) => ({ key: k, heading: headingFor(k, format) }));
}

export function startPick(s: State, job: DemoJob, tab: Pick['tab']): Pick {
  const key = job.setup ? recommendation(s, job.format).key : job.format;
  return { tab, key, name: '', order: orderFor(s, job, key) };
}

export function previewOrder(s: State, job: DemoJob, pick: Pick): Format['order'] {
  return pick.tab === 'own' ? pick.order : orderFor(s, job, pick.key);
}

const RECRUITMENT: Array<{ key: Recruitment; said: string }> = [
  { key: 'vacancy', said: 'for one post now' },
  { key: 'roster', said: 'for a roster' },
  { key: 'proposal', said: 'at proposal stage' },
];

/** "This is a job · fixed-term · for one post now": each word opens its choices; a word AidJobs could not read is marked. */
export function JobTypeSentence({ job, s }: { job: DemoJob; s: State }) {
  const f = job.facts;
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
  const sorted = outlineOrder(keys);
  return (
    <article className="aj-card ej-headings flex flex-col gap-3 p-4 lg:p-5" aria-label={`${title}: its sections`}>
      <div className="flex flex-col gap-0.5">
        <span className="ej-panel-label">{title}</span>
        <span className="aj-faint" style={{ fontSize: 12 }}>
          {note}
        </span>
      </div>
      {GROUPS.map((g) => {
        const inGroup = sorted.filter((k) => SECTION_BY_KEY[k]?.group === g.key);
        if (!inGroup.length) return null;
        return (
          <section key={g.key} className="flex flex-col gap-1.5" aria-label={g.label}>
            <span className="aj-faint" style={{ fontSize: 11, fontWeight: 650, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              {g.label}
            </span>
            {inGroup.map((k) => {
              const added = !seen.base.includes(k);
              return (
                <div key={k} className="ej-heading-row" data-added={added || undefined}>
                  <span style={{ fontWeight: 650 }}>{order.find((o) => o.key === k)?.heading}</span>
                  <span className="aj-faint" style={{ fontSize: 12 }}>
                    {added && TYPE_REASONS[k] ? `${TYPE_REASONS[k]}. ` : ''}
                    {SECTION_BY_KEY[k]?.hint}
                  </span>
                </div>
              );
            })}
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

/** A template being created: sections added, removed, renamed, and put in order within their group (the handle takes the arrow keys). */
export function HeadingsEditor({ order, onChange, recommended }: { order: Format['order']; onChange: (o: Format['order']) => void; recommended: string[] }) {
  const sorted = outlineOrder(order.map((o) => o.key));
  const rename = (key: string, heading: string) => onChange(order.map((o) => (o.key === key ? { ...o, heading } : o)));
  return (
    <div className="flex flex-col gap-3" aria-label="Sections of your template">
      {GROUPS.map((g) => {
        const ids = sorted.filter((k) => SECTION_BY_KEY[k]?.group === g.key);
        const missing = SECTIONS.filter((d) => d.group === g.key && !ids.includes(d.key)).sort((a, b) => Number(recommended.includes(b.key)) - Number(recommended.includes(a.key)));
        return (
          <section key={g.key} className="flex flex-col gap-1.5" aria-label={g.label}>
            <span className="aj-faint" style={{ fontSize: 11, fontWeight: 650, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              {g.label}
            </span>
            {ids.length > 0 && (
              <DragList
                ids={ids}
                label={(k) => order.find((o) => o.key === k)?.heading ?? k}
                onMove={(from, to) => {
                  const moved = moveItem(ids, from, to);
                  const queue = [...moved];
                  const keys = sorted.map((k) => (ids.includes(k) ? (queue.shift() ?? k) : k));
                  onChange(keys.map((k) => order.find((o) => o.key === k)!));
                }}
              >
                {(k) => (
                  <div className="ej-outline-row min-w-0 flex-1">
                    <input className="ej-heading-input" value={order.find((o) => o.key === k)?.heading ?? ''} onChange={(e) => rename(k, e.target.value)} aria-label={`Heading for ${SECTION_BY_KEY[k]?.label ?? k}`} />
                    <span className="ej-row-tools">
                      <button type="button" onClick={() => onChange(order.filter((o) => o.key !== k))} aria-label={`Remove ${order.find((o) => o.key === k)?.heading ?? k}`}>
                        <X size={12} strokeWidth={2} />
                      </button>
                    </span>
                  </div>
                )}
              </DragList>
            )}
            {missing.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {missing.map((d) => (
                  <button key={d.key} type="button" className="ej-add" data-recommended={recommended.includes(d.key)} onClick={() => onChange([...order, { key: d.key, heading: d.label }])} title={undefined} aria-label={`Add ${d.label}${recommended.includes(d.key) ? ', recommended for this job' : ''}`}>
                    {recommended.includes(d.key) ? <Sparkles size={11} strokeWidth={2} /> : <Plus size={11} strokeWidth={2} />}
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function OwnFields({ job, s, pick, setPick }: { job: DemoJob; s: State; pick: Pick; setPick: (p: Pick) => void }) {
  const recommended = recommendSections(formatOf(s, pick.key), job.facts);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="aj-muted">Name</span>
        <input style={inputStyle} value={pick.name} onChange={(e) => setPick({ ...pick, name: e.target.value })} placeholder="For example: Riverstone field roles" />
      </label>
      <span className="aj-faint" style={{ fontSize: 12 }}>
        Started from {formatOf(s, pick.key).label}. Add, remove, rename, and order the sections; the job description shows them as you go.
      </span>
      <HeadingsEditor order={pick.order} onChange={(order) => setPick({ ...pick, order })} recommended={recommended} />
    </div>
  );
}

function Cards({ s, job, pick, setPick }: { s: State; job: DemoJob; pick: Pick; setPick: (p: Pick) => void }) {
  const rec = recommendation(s, job.format).key;
  const usable = s.formats.filter((f) => !f.key.startsWith('pasted-'));
  return (
    <div className="flex flex-col gap-3">
      {FAMILIES_ORDER.map((fam) => {
        const list = usable.filter((f) => f.family === fam).sort((a, b) => Number(b.key === rec) - Number(a.key === rec));
        if (!list.length) return null;
        return (
          <section key={fam} className="flex flex-col gap-1.5" aria-label={fam}>
            <span className="aj-faint" style={{ fontSize: 11, fontWeight: 650, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              {fam}
            </span>
            {list.map((f) => (
              <button key={f.key} type="button" className="ej-template-card" aria-pressed={pick.key === f.key} onClick={() => setPick({ ...pick, key: f.key, order: orderFor(s, job, f.key) })}>
                <span className="flex items-center gap-1.5">
                  <span style={{ fontWeight: 650 }}>{f.label}</span>
                  {f.key === rec && (
                    <span className="aj-chip" data-tone="sage" style={{ height: 20 }}>
                      Recommended
                    </span>
                  )}
                </span>
                <span className="aj-faint" style={{ fontSize: 12 }}>
                  {orderFor(s, job, f.key).length} sections · about {wordsFor(orderFor(s, job, f.key).length)} words · {f.usedBy}
                </span>
              </button>
            ))}
          </section>
        );
      })}
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
  if (job.setup) return { label: `Use ${f.label}`, disabled: false };
  return { label: pick.key === job.format ? 'This is the template in use' : `Change to ${f.label}`, disabled: pick.key === job.format };
}

type Box = { x: number; y: number; w: number; h: number };
const POS_KEY = 'aidjobs.employerDemo.templatePanel';

function savedPos(): { x: number; y: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The template panel on wider screens: it opens over the chat column, so the job description stays in full view, and is moved by its
 * title bar (with the mouse, or the arrow keys on its handle); its place is remembered and kept on screen.
 */
export function TemplatePanel({ job, s, pick, setPick, onApply, onClose, bounds, start }: { job: DemoJob; s: State; pick: Pick; setPick: (p: Pick) => void; onApply: () => void; onClose: () => void; bounds: { w: number; h: number }; start: Box }) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => savedPos() ?? { x: start.x, y: start.y });
  const [small, setSmall] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const w = Math.min(start.w, Math.max(300, bounds.w - 24));
  const h = Math.min(start.h, Math.max(240, bounds.h - 24));
  const clamp = (p: { x: number; y: number }) => ({ x: Math.min(Math.max(8, p.x), Math.max(8, bounds.w - w - 8)), y: Math.min(Math.max(8, p.y), Math.max(8, bounds.h - (small ? 48 : 160))) });
  const at = clamp(pos);
  const keep = (p: { x: number; y: number }) => {
    const c = clamp(p);
    setPos(c);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(c));
    } catch {
      /* storage unavailable */
    }
  };
  useEffect(() => {
    const move = (e: PointerEvent) => drag.current && setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }));
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      setPos((p) => {
        try {
          localStorage.setItem(POS_KEY, JSON.stringify(p));
        } catch {
          /* storage unavailable */
        }
        return p;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });
  const setup = Boolean(job.setup);
  const ro = Boolean(s.reviewerAs);
  const tabs: Array<[Pick['tab'], string]> = setup ? [['templates', 'Templates'], ['own', 'Create your own']] : [['sections', "This job's sections"], ['templates', 'Templates'], ['own', 'Create your own']];
  const main = applyLabel(s, job, pick);
  const title = setup ? 'Choose a template' : `Template: ${formatOf(s, job.format).label}`;
  return (
    <section className="ej-float aj-card" style={{ left: at.x, top: at.y, width: w, height: small ? undefined : h }} aria-label={title}>
      <div
        className="ej-float-bar"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button:not(.ej-float-grip)')) return;
          drag.current = { dx: e.clientX - at.x, dy: e.clientY - at.y };
          e.preventDefault();
        }}
      >
        <button
          type="button"
          className="ej-float-grip"
          aria-label="Move the template panel with the arrow keys"
          onKeyDown={(e) => {
            const step = e.shiftKey ? 64 : 24;
            const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
            if (!d) return;
            e.preventDefault();
            keep({ x: at.x + d[0], y: at.y + d[1] });
          }}
        >
          <GripHorizontal size={14} strokeWidth={1.8} />
        </button>
        <span className="min-w-0 flex-1 truncate" style={{ fontWeight: 700 }}>
          {title}
        </span>
        <button type="button" className="aj-icon-btn" style={{ width: 28, height: 28 }} onClick={() => setSmall(!small)} aria-label={small ? 'Open the template panel' : 'Fold the template panel'} aria-expanded={!small}>
          <ChevronDown size={14} strokeWidth={2} style={{ transform: small ? 'rotate(180deg)' : 'none' }} />
        </button>
        {!setup && (
          <button type="button" className="aj-icon-btn" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="Close the template panel">
            <X size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>
      {!small && (
        <>
          <div className="shrink-0 px-4 pt-2">
            <JobTypeSentence job={job} s={s} />
          </div>
          <div className="shrink-0 border-b aj-hair">
            <PanelTabs tabs={tabs} pick={pick} setPick={setPick} />
          </div>
          <div className="aj-scroll min-h-0 flex-1 px-4 py-3" role="tabpanel" aria-labelledby={`ej-tp-${pick.tab}`}>
            {pick.tab === 'sections' ? <Structure job={job} s={s} bare hideCommitments /> : pick.tab === 'own' ? <OwnFields job={job} s={s} pick={pick} setPick={setPick} /> : <Cards s={s} job={job} pick={pick} setPick={setPick} />}
          </div>
          {pick.tab !== 'sections' && (
            <div className="shrink-0 border-t px-4 py-2.5 aj-hair">
              <button type="button" className="aj-ink-btn w-full justify-center" disabled={main.disabled || ro} onClick={onApply}>
                {main.label}
              </button>
            </div>
          )}
        </>
      )}
    </section>
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
          <JobTypeSentence job={job} s={s} />
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
