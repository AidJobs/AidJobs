'use client';

import { Printer } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { inOutlineOrder } from './engine';
import { amplifying, flyerStale, reachOpen } from './flow';
import { fixedLabel, fixedList } from './fixed';
import { commitmentLabel, countryName, jobLang, langOf, localDate, stale, tableLang, term, ui, versionsOf } from './translate';
import type { DemoJob, JobLang, State } from './types';
import { Dialog, OrgMark, radioKeys } from './ui';

/** A QR code drawn as one SVG path, so it prints sharply at any size. */
export function QrCode({ text, size = 132, label }: { text: string; size?: number; label: string }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { path: d, count: n + 8 };
  }, [text]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${count} ${count}`} role="img" aria-label={label} shapeRendering="crispEdges" style={{ background: '#fff', flexShrink: 0 }}>
      <path d={path} fill="#111" />
    </svg>
  );
}

/** The one-page notice for a field office or community board: printed, or saved as a PDF. */
function Notice({ job, s, url, lang }: { job: DemoJob; s: State; url: string; lang?: JobLang }) {
  const version = lang ? job.translations?.[lang] : undefined;
  const shown: JobLang = version && lang ? lang : jobLang(job);
  const l = tableLang(shown);
  const say = (en: string, key: string, vars: Record<string, string | number> = {}) => (l ? ui(key, l, vars) : en);
  const sections = version ? version.sections : inOutlineOrder(job.sections, job.tags);
  const purpose = sections.find((x) => x.key === 'purpose') ?? sections.find((x) => x.key !== 'about');
  const duties = (sections.find((x) => x.key === 'responsibilities')?.lines ?? []).filter((x) => x.startsWith('- ')).slice(0, 4);
  const place = job.facts.location ? job.facts.location.replace(job.facts.country, countryName(job.facts.iso, job.facts.country, l)) : term('Remote', l);
  return (
    <div className="ej-flyer" lang={shown} dir={langOf(shown).dir}>
      <div className="flex items-center gap-2">
        <OrgMark name={s.org.name} size={34} />
        <strong style={{ fontSize: 15 }}>{s.org.name}</strong>
      </div>
      <div className="ej-flyer-kicker">{say("We're hiring", 'hiring')}</div>
      <h2 className="ej-flyer-title">{job.facts.title}</h2>
      <div className="ej-flyer-facts">
        <span>{place}</span>
        {[job.facts.contract, job.facts.duration].filter(Boolean).map((x) => (
          <span key={x}>{term(x, l)}</span>
        ))}
      </div>
      {job.facts.deadline && (
        <div className="ej-flyer-deadline">
          {say('Closes', 'closes')} {localDate(job.facts.deadline, l)}
        </div>
      )}
      {purpose && <p className="ej-flyer-text">{purpose.lines[0]}</p>}
      {duties.length > 0 && (
        <ul className="ej-flyer-list">
          {duties.map((d) => (
            <li key={d}>{d.slice(2)}</li>
          ))}
        </ul>
      )}
      <div className="ej-flyer-qr">
        <QrCode text={url} label={`QR code for ${url}`} />
        <div className="flex min-w-0 flex-col gap-1">
          <strong>{say('Scan to read the full job and apply', 'scan')}</strong>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all', fontSize: 12, color: 'inherit' }}>
            {url}
          </a>
        </div>
      </div>
      {fixedList(job, shown).length > 0 && (
        <p className="ej-flyer-text" style={{ fontSize: 12 }}>
          <strong>{say('Our commitments', 'commitments')}:</strong> {fixedList(job, shown).map((k) => commitmentLabel(k, fixedLabel(k), shown)).join(' · ')}
        </p>
      )}
      {fixedList(job, shown).length > 0 && (
        <p className="ej-flyer-text" style={{ fontSize: 12 }}>
          <strong>{say('Our commitments', 'commitments')}:</strong> {fixedList(job, shown).map((k) => commitmentLabel(k, fixedLabel(k), shown)).join(' · ')}
        </p>
      )}
      <div className="ej-flyer-foot">
        <strong>{say(`Applying is free. ${s.org.short} never asks for money at any stage.`, 'free', { org: s.org.short })}</strong>
        <span>
          {say('Posted on AidJobs', 'onAidJobs')} · Sample from the AidJobs demo, not a real vacancy
        </span>
      </div>
    </div>
  );
}

/** Choose the language, see the notice, print it. Only reviewed, up-to-date language versions are offered. */
export function FlyerDialog({ job, s, url, onClose }: { job: DemoJob; s: State; url: string; onClose: () => void }) {
  const ready = versionsOf(job).filter((k) => {
    const t = job.translations?.[k];
    return t?.reviewed && !stale(job, t);
  });
  const [lang, setLang] = useState<JobLang | null>(null);
  const waiting = versionsOf(job).filter((k) => !ready.includes(k)).map((k) => langOf(k));
  return (
    <Dialog
      title="Field-post notice"
      subtitle="One page, to print or save as a PDF"
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="aj-faint mr-auto">Use your browser&apos;s print window; choose &ldquo;Save as PDF&rdquo; to keep a file.</span>
          <button type="button" className="aj-pill" onClick={onClose}>
            Close
          </button>
          <button type="button" className="aj-ink-btn" onClick={() => window.print()}>
            <Printer size={14} strokeWidth={1.8} /> Print
          </button>
        </div>
      }
    >
      <FlyerBody job={job} s={s} url={url} lang={lang} setLang={setLang} ready={ready} waiting={waiting.map((x) => x.label)} />
    </Dialog>
  );
}

function FlyerBody({ job, s, url, lang, setLang, ready, waiting }: { job: DemoJob; s: State; url: string; lang: JobLang | null; setLang: (l: JobLang | null) => void; ready: JobLang[]; waiting: string[] }) {
  const own = langOf(jobLang(job));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" onKeyDown={radioKeys} aria-label="Language of the notice">
        <button type="button" role="radio" aria-checked={!lang} className="aj-pill" data-active={!lang} onClick={() => setLang(null)} lang={own.key}>
          {own.native}
        </button>
        {ready.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={lang === k} className="aj-pill" data-active={lang === k} onClick={() => setLang(k)} lang={k}>
            {langOf(k).native}
          </button>
        ))}
      </div>
      {waiting.length > 0 && <span className="aj-faint">{waiting.join(' and ')}: review the language version first, then it can be printed.</span>}
      <div className="ej-flyer-frame">
        <Notice job={job} s={s} url={url} lang={lang ?? undefined} />
      </div>
    </div>
  );
}

/** The field-post flyer as a panel tab in the window (section 19): choose the language, see it, print it. */
export function FlyerPanel({ job, s, url }: { job: DemoJob; s: State; url: string }) {
  const ready = versionsOf(job).filter((k) => {
    const t = job.translations?.[k];
    return t?.reviewed && !stale(job, t);
  });
  const [lang, setLang] = useState<JobLang | null>(null);
  const waiting = versionsOf(job).filter((k) => !ready.includes(k)).map((k) => langOf(k).label);
  if (!reachOpen(job, s)) {
    return (
      <p className="aj-muted m-0" role="status">
        {!amplifying(job)
          ? 'The flyer comes with Amplify.'
          : flyerStale(job, s)
            ? 'Out of date: the job changed, or changes were asked for, since this flyer was made. It opens again once review is done; print it again then.'
            : 'The flyer opens once review is done, so it shows the text your reviewers saw.'}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="aj-muted min-w-0 flex-1">A one-page notice with a QR code to the job, for notice boards in field offices, clinics, and community centres. Use your browser&apos;s print window; choose &ldquo;Save as PDF&rdquo; to keep a file.</span>
        <button type="button" className="aj-ink-btn" onClick={() => window.print()}>
          <Printer size={14} strokeWidth={1.8} /> Print
        </button>
      </div>
      <FlyerBody job={job} s={s} url={url} lang={lang} setLang={setLang} ready={ready} waiting={waiting} />
    </div>
  );
}
