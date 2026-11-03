'use client';

import { Check, Circle, ClipboardPaste, FileText, Globe, Link2, Repeat2, Sparkles, Star, Upload } from 'lucide-react';
import { useState } from 'react';
import { defaultFormatKey, formatOf, hireAgain, importPasted, startJob } from './actions';
import Composer from './Composer';
import { detectRole, extractFacts, FORMAT_FOR_TYPE, suggestNext } from './engine';
import { statusLine } from './Home';
import { MARKET_SAMPLE } from './sample';
import { go, update, useDemo } from './store';
import { Dialog, inputStyle } from './ui';

function PasteDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const go2 = () => {
    const id = importPasted(text);
    if (!id) return setError('No headings or text were found. Paste the advert as text, with its headings on their own lines.');
    onClose();
    go('create', id);
  };
  return (
    <Dialog
      title="Upload or paste an advert"
      subtitle="Your wording and headings are kept"
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="aj-faint" style={{ fontSize: 11 }}>
            PDF and Word come in the real product; in the demo, paste text or choose a .txt file. Nothing leaves this browser.
          </span>
          <button type="button" className="aj-ink-btn" disabled={!text.trim()} onClick={go2}>
            Read it
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <textarea style={{ ...inputStyle, minHeight: 260, lineHeight: 1.5 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Paste a job description or terms of reference, for example:\n\nJOB PURPOSE\nThe Project Officer supports…\n\nKEY RESPONSIBILITIES\n• Coordinate…'} aria-label="Advert text" />
        <label className="aj-pill self-start" style={{ cursor: 'pointer' }}>
          <Upload size={13} strokeWidth={1.8} /> Choose a .txt file
          <input
            type="file"
            accept=".txt,text/plain"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await file.text());
            }}
          />
        </label>
        {error && (
          <span role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>
            {error}
          </span>
        )}
      </div>
    </Dialog>
  );
}

function FormatSourceDialog({ onClose }: { onClose: () => void }) {
  const s = useDemo();
  const [link, setLink] = useState(s.org.careersUrl);
  return (
    <Dialog title="Where AidJobs learns your format" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span style={{ fontWeight: 650 }}>
            <Link2 size={13} strokeWidth={2} className="mr-1 inline" /> Your careers-page link
          </span>
          <span className="aj-muted">AidJobs reads this one page once, through the same safe rules as its crawler (simulated here).</span>
          <div className="flex gap-1.5">
            <input style={{ ...inputStyle, flex: 1 }} value={link} onChange={(e) => setLink(e.target.value)} aria-label="Careers page link" />
            <button
              type="button"
              className="aj-pill"
              onClick={() => {
                update((st) => ({ ...st, org: { ...st.org, careersUrl: link, learned: { source: 'link', adverts: 3, confirmed: false } }, notice: { text: 'Read 3 adverts from your careers page (simulated). Confirm the headings in the Structure panel.' } }));
                onClose();
              }}
            >
              Read it
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span style={{ fontWeight: 650 }}>
            <ClipboardPaste size={13} strokeWidth={2} className="mr-1 inline" /> Upload or paste one to three past adverts
          </span>
          <span className="aj-muted">Best when your adverts live in PDFs, emails, or flyers. Use &ldquo;Upload or paste&rdquo; on the first screen.</span>
        </div>
        <div className="flex flex-col gap-1">
          <span style={{ fontWeight: 650 }}>
            <Globe size={13} strokeWidth={2} className="mr-1 inline" /> Your past adverts on ReliefWeb
          </span>
          <span className="aj-faint">Comes with the ReliefWeb connection (W-41), with your permission.</span>
        </div>
        <div className="flex flex-col gap-1">
          <span style={{ fontWeight: 650 }}>
            <Sparkles size={13} strokeWidth={2} className="mr-1 inline" /> No past adverts?
          </span>
          <span className="aj-muted">AidJobs starts from {formatOf(s, FORMAT_FOR_TYPE[s.org.orgType]).label}, the closest real format for a {s.org.type.toLowerCase()}. After your first job, save it as your format.</span>
        </div>
      </div>
    </Dialog>
  );
}

export default function CreateEntry() {
  const s = useDemo();
  const [text, setText] = useState('');
  const [paste, setPaste] = useState(false);
  const [sources, setSources] = useState(false);
  const fkey = defaultFormatKey(s);
  const format = formatOf(s, fkey);
  const { facts } = extractFacts(text, s.today);
  const { role } = detectRole(text);
  const checks = [
    { done: Boolean(facts.location) || facts.arrangement !== 'onsite', label: 'Duty station and work arrangement' },
    { done: Boolean(facts.deadline), label: 'Closing date' },
    { done: Boolean(facts.contract || facts.duration), label: 'Contract and duration' },
    { done: facts.salaryMode !== 'hidden', label: 'Salary, if you choose to show it' },
    { done: true, label: 'Essential and desirable kept apart (automatic)' },
  ];
  const past = s.jobs.filter((j) => j.status === 'closed').slice(0, 2);
  const waiting = s.jobs.filter((j) => j.status === 'draft' || j.status === 'review' || j.status === 'approved').slice(0, 3);
  const send = (v: string) => {
    const id = startJob(v, fkey);
    setText('');
    go('create', id);
  };

  return (
    <div className="aj-scroll h-full">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-8 lg:py-14">
        <div className="flex flex-col items-center gap-2 text-center">
          <Star size={26} strokeWidth={1.8} style={{ color: 'var(--sage-7)' }} />
          <h1 className="aj-display" style={{ margin: 0, fontSize: 28 }}>
            What role are you hiring for?
          </h1>
          <p className="aj-muted" style={{ margin: 0 }}>
            Describe it in a few lines. AidJobs writes it in {format.label}.
          </p>
        </div>

        <Composer value={text} onChange={setText} onSend={send} suggestion={suggestNext(text, s.today)} placeholder="Describe the role in a few lines" label="Describe the role" large autoFocus />

        <div className="grid gap-3 md:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-2">
            <span className="ej-panel-label">Start from what you have</span>
            <div className="grid gap-2 sm:grid-cols-3">
              <button type="button" className="aj-card flex flex-col gap-1 p-3 text-left" style={{ cursor: 'pointer' }} onClick={() => setSources(true)}>
                <span className="flex items-center gap-1.5" style={{ fontWeight: 650 }}>
                  <FileText size={14} strokeWidth={1.8} /> Your format
                </span>
                <span className="aj-muted" style={{ fontSize: 12 }}>
                  {s.org.learned ? `${format.label}, learned from ${s.org.learned.adverts} of your adverts${s.org.learned.confirmed ? '' : ' · confirm it'}` : `No adverts read yet: start from ${format.label}`}
                </span>
              </button>
              <button type="button" className="aj-card flex flex-col gap-1 p-3 text-left" style={{ cursor: 'pointer' }} onClick={() => setPaste(true)}>
                <span className="flex items-center gap-1.5" style={{ fontWeight: 650 }}>
                  <ClipboardPaste size={14} strokeWidth={1.8} /> Upload or paste
                </span>
                <span className="aj-muted" style={{ fontSize: 12 }}>
                  A job description or terms of reference; your wording is kept
                </span>
              </button>
              <div className="aj-card flex flex-col gap-1 p-3">
                <span className="flex items-center gap-1.5" style={{ fontWeight: 650 }}>
                  <Repeat2 size={14} strokeWidth={1.8} /> Hire again
                </span>
                {past.length ? (
                  past.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      className="aj-text-btn truncate text-left"
                      style={{ height: 24, padding: 0 }}
                      onClick={() => {
                        const id = hireAgain(j.id);
                        if (id) go('create', id);
                      }}
                    >
                      {j.facts.title}
                    </button>
                  ))
                ) : (
                  <span className="aj-faint">Your past jobs appear here</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="ej-panel-label">What strong adverts include</span>
            <ul className="aj-card flex flex-col gap-1.5 p-3" style={{ listStyle: 'none', margin: 0 }} aria-live="polite">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2" style={{ fontSize: 12, color: c.done ? 'var(--text)' : 'var(--text-2)' }}>
                  {c.done ? <Check size={13} strokeWidth={2.4} style={{ color: 'var(--sage-7)' }} /> : <Circle size={11} strokeWidth={2} className="aj-faint" />}
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {(role || facts.title) && (
          <div className="aj-card flex flex-col gap-1 p-3" aria-label="Market context">
            <span className="ej-panel-label">Similar roles on AidJobs · sample figures in the demo</span>
            <span>
              {MARKET_SAMPLE.similar} similar {role ? role.sector.toLowerCase() : ''} roles open · usually {MARKET_SAMPLE.grade} · {MARKET_SAMPLE.showPay}% show a salary · open about {MARKET_SAMPLE.daysOpen} days
            </span>
          </div>
        )}

        {waiting.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="ej-panel-label">Continue</span>
            <div className="flex flex-wrap gap-1.5">
              {waiting.map((j) => (
                <button key={j.id} type="button" className="aj-pill" onClick={() => go('create', j.id)}>
                  {j.facts.title || 'Untitled draft'} <span className="aj-faint">· {statusLine(s, j)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {paste && <PasteDialog onClose={() => setPaste(false)} />}
      {sources && <FormatSourceDialog onClose={() => setSources(false)} />}
    </div>
  );
}
