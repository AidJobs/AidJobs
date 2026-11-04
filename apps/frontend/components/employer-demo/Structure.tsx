'use client';

import { ChevronRight, Lock, PanelRightClose, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import Tip from '@/components/site/Tip';
import { applyFormat, formatOf, reorderSections, toggleCommitment, toggleSection } from './actions';
import DragList, { moveItem } from './DragList';
import { COMMITMENTS, commitmentText, FAMILIES_ORDER, GROUPS, headingFor, recommendSections, SECTIONS } from './engine';
import CreateFormatDialog from './FormatBuilder';
import type { DemoJob, State } from './types';
import { Dialog } from './ui';

const CREATE = '__create';

function scrollToSection(key: string) {
  document.getElementById(`ej-sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function Structure({ job, s, onCollapse }: { job: DemoJob; s: State; onCollapse?: () => void }) {
  const format = formatOf(s, job.format);
  const rec = new Set(recommendSections(format, job.facts));
  const [closed, setClosed] = useState<Record<string, boolean>>({ commitments: true });
  const [creating, setCreating] = useState(false);
  const formats = s.formats.filter((f) => !f.key.startsWith('pasted-') || f.key === job.format);
  const toggleGroup = (k: string) => setClosed({ ...closed, [k]: !closed[k] });

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="JD outline">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3">
        <h2 className="aj-title" style={{ margin: 0, fontSize: 14 }}>
          JD outline
        </h2>
        <span className="aj-faint" style={{ fontSize: 11 }}>
          {job.tags.length} sections
        </span>
        {onCollapse && (
          <Tip label="Hide the JD outline">
            <button type="button" className="aj-icon-btn ml-auto" style={{ width: 28, height: 28 }} onClick={onCollapse} aria-label="Hide the JD outline">
              <PanelRightClose size={14} strokeWidth={1.8} />
            </button>
          </Tip>
        )}
      </div>
      <div className="aj-scroll flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="ej-panel-label" htmlFor="ej-style">
              JD format
            </label>
            <Tip label="Name it, choose its sections and headings, and save it for reuse.">
              <button type="button" className="aj-text-btn" style={{ height: 24, padding: '0 4px', fontSize: 12 }} onClick={() => setCreating(true)}>
                Create your own JD format
              </button>
            </Tip>
          </div>
          <select id="ej-style" className="ej-select" value={job.format} onChange={(e) => (e.target.value === CREATE ? setCreating(true) : applyFormat(job.id, e.target.value))}>
            <option value={CREATE}>Create your own JD format…</option>
            {FAMILIES_ORDER.map((fam) => {
              const list = formats.filter((f) => f.family === fam);
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
          {creating && <CreateFormatDialog onClose={() => setCreating(false)} onSaved={(key) => applyFormat(job.id, key)} />}
          <span className="aj-faint" style={{ fontSize: 11 }}>
            {format.usedBy}
          </span>
        </div>

        <div className="flex flex-col gap-3" aria-label="Outline">
          {GROUPS.map((g) => {
            const defs = SECTIONS.filter((d) => d.group === g.key);
            const chosen = job.tags.filter((k) => defs.some((d) => d.key === k));
            const unchosen = defs.filter((d) => !job.tags.includes(d.key));
            const isClosed = closed[g.key];
            return (
              <section key={g.key} className="flex flex-col gap-1">
                <button type="button" className="ej-group" onClick={() => toggleGroup(g.key)} aria-expanded={!isClosed}>
                  <ChevronRight size={13} strokeWidth={2.2} style={{ transform: isClosed ? 'none' : 'rotate(90deg)', transition: 'transform 120ms ease' }} />
                  <span>{g.label}</span>
                  <span className="ej-count">
                    {chosen.length} of {defs.length}
                  </span>
                </button>
                {!isClosed && (
                  <>
                    <DragList ids={chosen} label={(k) => headingFor(k, format)} onMove={(from, to) => reorderSections(job.id, moveItem(chosen, from, to))}>
                      {(k) => (
                        <div className="ej-outline-row min-w-0 flex-1">
                          <Tip label={`${SECTIONS.find((d) => d.key === k)?.hint ?? ''}. Click to go to it.`} className="min-w-0 flex-1">
                            <button type="button" className="min-w-0 flex-1 truncate text-left" style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: 'var(--text)', fontWeight: 600 }} onClick={() => scrollToSection(k)}>
                              {headingFor(k, format)}
                            </button>
                          </Tip>
                          <span className="ej-row-tools">
                            <button type="button" onClick={() => toggleSection(job.id, k)} aria-label={`Remove ${headingFor(k, format)}`}>
                              <X size={12} strokeWidth={2} />
                            </button>
                          </span>
                        </div>
                      )}
                    </DragList>
                    {unchosen.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {unchosen.map((d) => (
                          <Tip key={d.key} label={`${d.hint}${rec.has(d.key) ? ' · recommended for this job' : ''}`}>
                            <button type="button" className="ej-add" data-recommended={rec.has(d.key)} onClick={() => toggleSection(job.id, d.key)}>
                              {rec.has(d.key) ? <Sparkles size={11} strokeWidth={2} /> : <Plus size={11} strokeWidth={2} />}
                              {d.label}
                            </button>
                          </Tip>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })}

          <section className="flex flex-col gap-1">
            <button type="button" className="ej-group" onClick={() => toggleGroup('commitments')} aria-expanded={!closed.commitments}>
              <ChevronRight size={13} strokeWidth={2.2} style={{ transform: closed.commitments ? 'none' : 'rotate(90deg)', transition: 'transform 120ms ease' }} />
              <ShieldCheck size={13} strokeWidth={2} />
              <span>Commitments</span>
              <span className="ej-count">{job.commitments.length} included</span>
            </button>
            {!closed.commitments && (
              <ul className="flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {COMMITMENTS.filter((c) => c.key !== 'mds' || s.org.mdsMember).map((c) => {
                  const t = commitmentText(c.key, s.org, job.facts);
                  const on = job.commitments.includes(c.key);
                  return (
                    <li key={c.key}>
                      <Tip label={t.text} className="w-full">
                      <label className="ej-outline-row w-full" style={{ cursor: 'pointer' }}>
                        <input type="checkbox" checked={on} onChange={() => toggleCommitment(job.id, c.key)} />
                        <span className="min-w-0 flex-1 truncate" style={{ fontWeight: on ? 600 : 500, color: on ? 'var(--text)' : 'var(--text-2)' }}>
                          {c.label}
                        </span>
                        {t.locked && <Lock size={11} strokeWidth={2} aria-label="Locked text" />}
                        <span className="aj-faint" style={{ fontSize: 10.5 }}>
                          {t.own ? 'yours' : 'starter'}
                        </span>
                      </label>
                      </Tip>
                    </li>
                  );
                })}
                <li className="aj-faint px-1" style={{ fontSize: 11 }}>
                  Your own texts are inserted word for word. Starter texts are AidJobs wording based on the IASC principles and sector practice; replace them in Organisation settings.
                </li>
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
