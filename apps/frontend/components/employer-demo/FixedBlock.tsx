'use client';

import { Pencil, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import Tip from '@/components/site/Tip';
import { approveFixed, editFixed, leaveOutFixed, moveFixed, placeFixed, resetFixed, keepWordingForAll } from './actions';
import { canWord, fixedList, fixedShown, ORG_LANG } from './fixed';
import Grip, { dropAt } from './Grip';
import { go } from './store';
import { jobLang, langOf, tableLang, ui } from './translate';
import type { DemoJob, JobLang, State } from './types';
import { inputStyle } from './ui';

/** Where "Change for every job ↗" leads: Organisation settings, at that text. */
export function toSettings(key: string) {
  go('org', `fixed-${key}`);
}

/**
 * The fixed texts on the draft (section 19, phase 6, D and E): one block after the sections, under "Our commitments", each text with
 * its label and a small shield, the pencil and the grip. A locked text's pencil and "Leave out" stay focusable, their tooltip saying
 * why. Reviewers see the texts and none of the icons.
 */
export default function FixedBlock({ job, s, lang }: { job: DemoJob; s: State; lang?: JobLang }) {
  const l = lang ?? jobLang(job);
  const list = fixedList(job, l);
  const root = useRef<HTMLElement>(null);
  const [drop, setDrop] = useState<string | null | undefined>(undefined);
  if (!list.length) return null;
  const tl = tableLang(l);
  const title = tl ? ui('commitments', tl) : 'Our commitments';
  return (
    <section ref={root} className="ej-fixed rounded-2xl px-3 py-2" aria-label={title} data-drop-top={drop === null || undefined}>
      <h3 className="flex items-center gap-1.5">
        <ShieldCheck size={13} strokeWidth={2} aria-hidden /> {title}
      </h3>
      {list.map((k, i) => (
        <FixedRow
          key={k}
          job={job}
          s={s}
          lang={l}
          k={k}
          first={i === 0}
          last={i === list.length - 1}
          drop={drop === k}
          onDrag={(y, done) => {
            if (y === null) return setDrop(undefined);
            const at = dropAt(root.current, y, k);
            if (!done) return setDrop(at.after);
            setDrop(undefined);
            placeFixed(job.id, k, at.after, lang);
          }}
        />
      ))}
    </section>
  );
}

function FixedRow({ job, s, lang, k, first, last, drop, onDrag }: { job: DemoJob; s: State; lang: JobLang; k: string; first: boolean; last: boolean; drop: boolean; onDrag: (y: number | null, done: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const f = fixedShown(job, s, k, lang);
  const reviewing = Boolean(s.reviewerAs);
  const owner = s.me.role === 'owner' && !reviewing;
  const editable = canWord(s.org, k, lang);
  const lockedWhy = 'Locked: change it for every job ↗';
  const offer = owner && job.wordingOffer?.key === k && job.wordingOffer.lang === lang;
  const otherLang = lang !== ORG_LANG;
  const focusGrip = () => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-grip-key="fixed:${lang}:${k}"]`)?.focus({ preventScroll: true }));
  return (
    <div className="ej-fixed-row" data-drop-key={k} data-drop-group="fixed" data-drop={drop ? 'after' : undefined}>
      <div className="flex items-center gap-1.5">
        <Tip label={f.locked ? 'Locked by your organisation' : 'From Organisation settings'}>
          <span className="ej-shield" tabIndex={0} aria-label={f.locked ? 'Locked by your organisation' : 'From Organisation settings'}>
            <ShieldCheck size={12} strokeWidth={2} />
          </span>
        </Tip>
        <strong className="min-w-0 flex-1">{f.label}</strong>
        {f.machine && (
          <Tip label="Machine-translated: please check and approve">
            <span className="aj-chip" data-tone="amber" tabIndex={0} lang="en">
              Machine-translated
            </span>
          </Tip>
        )}
        {f.machine && !reviewing && (
          <button type="button" className="aj-text-btn" style={{ height: 24 }} onClick={() => approveFixed(job.id, k, lang)} lang="en">
            Approve
          </button>
        )}
        {f.toTranslate && (
          <Tip label={`No ${langOf(lang).label} wording in your settings: shown in ${langOf(ORG_LANG).label} until it is translated`}>
            <span className="aj-chip" data-tone="amber" tabIndex={0} lang="en">
              To translate
            </span>
          </Tip>
        )}
        {!reviewing && !editing && (
          <span className="ej-sec-tools">
            <Tip label={editable ? `Edit for this job${f.own ? ' · Worded for this job' : ''}` : lockedWhy}>
              <button
                type="button"
                className="ej-sec-icon"
                aria-label={editable ? `Edit ${f.label} for this job` : `Edit ${f.label} for this job, locked: change it for every job`}
                aria-disabled={!editable || undefined}
                onClick={() => {
                  if (!editable) return;
                  setText(f.text);
                  setEditing(true);
                }}
              >
                <Pencil size={13} strokeWidth={1.8} />
              </button>
            </Tip>
            <Grip
              gripKey={`fixed:${lang}:${k}`}
              className="ej-grip ej-sec-icon"
              label={`Move ${f.label}, or press for its menu`}
              tip="Drag to move within the block, or press for more"
              onKey={(by) => {
                moveFixed(job.id, k, by, lang);
                focusGrip();
              }}
              onDrag={(y) => onDrag(y, false)}
              onDrop={(y) => onDrag(y, true)}
              actions={[
                { label: 'Move up', off: first ? 'It is first in the block' : undefined, run: () => (moveFixed(job.id, k, -1, lang), focusGrip()) },
                { label: 'Move down', off: last ? 'It is last in the block' : undefined, run: () => (moveFixed(job.id, k, 1, lang), focusGrip()) },
                { label: 'Leave out of this job', off: f.locked ? lockedWhy : undefined, run: () => leaveOutFixed(job.id, k, lang) },
                { label: 'Change for every job ↗', off: owner ? undefined : 'Only the owner can change it for every job', run: () => toSettings(k) },
              ]}
            />
          </span>
        )}
      </div>
      {editing ? (
        <div className="mt-1 flex flex-col gap-1.5">
          <textarea style={{ ...inputStyle, minHeight: 80, lineHeight: 1.6 }} value={text} onChange={(e) => setText(e.target.value)} aria-label={`${f.label}, for this job`} autoFocus lang={lang} dir={langOf(lang).dir} />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="aj-ink-btn"
              onClick={() => {
                editFixed(job.id, k, text, lang);
                setEditing(false);
              }}
            >
              Save for this job
            </button>
            <button type="button" className="aj-pill" onClick={() => setEditing(false)}>
              Cancel
            </button>
            {f.own && (
              <button
                type="button"
                className="aj-text-btn"
                onClick={() => {
                  resetFixed(job.id, k, lang);
                  setEditing(false);
                }}
              >
                Back to the organisation&apos;s text
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="ej-commitment m-0" lang={f.textLang ?? lang} dir={langOf(f.textLang ?? lang).dir}>
          {f.text}
        </p>
      )}
      {offer && (
        <div className="ej-quiet-line" role="status" lang="en">
          <span>Use this wording for every job{otherLang ? ` in ${langOf(lang).label}` : ''}?</span>
          <button type="button" className="aj-text-btn" style={{ height: 24 }} onClick={() => keepWordingForAll(job.id, true)}>
            Yes
          </button>
          <span aria-hidden>·</span>
          <button type="button" className="aj-text-btn" style={{ height: 24 }} onClick={() => keepWordingForAll(job.id, false)}>
            Not now
          </button>
        </div>
      )}
    </div>
  );
}
