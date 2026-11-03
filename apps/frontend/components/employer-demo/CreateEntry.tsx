'use client';

import { Check, ClipboardPaste, Globe, Link2, Plus, Sparkles, Star, Upload } from 'lucide-react';
import { useState } from 'react';
import Tip from '@/components/site/Tip';
import { defaultFormatKey, formatOf, importPasted, startJob } from './actions';
import Composer from './Composer';
import { DraftsMenu, FormatMenu, PlusMenu } from './ComposerTools';
import { addSuggestions, detectRole, extractFacts, FORMAT_FOR_TYPE, headingFor, SECTION_BY_KEY, suggestNext } from './engine';
import { LINKED_SAMPLE, MARKET_SAMPLE } from './sample';
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
        <textarea
          style={{ ...inputStyle, minHeight: 260, lineHeight: 1.5 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Paste a job description or terms of reference, for example:\n\nJOB PURPOSE\nThe Project Officer supports…\n\nKEY RESPONSIBILITIES\n• Coordinate…'}
          aria-label="Advert text"
        />
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
                update((st) => ({
                  ...st,
                  org: {
                    ...st.org,
                    careersUrl: link,
                    learned: { source: 'link', adverts: 3, confirmed: false },
                  },
                  notice: {
                    text: 'Read 3 adverts from your careers page (simulated). Confirm the headings in the Structure panel.',
                  },
                }));
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
          <span className="aj-muted">Best when your adverts live in PDFs, emails, or flyers. Use &ldquo;Upload or paste&rdquo; under the + in the chat box.</span>
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
          <span className="aj-muted">
            AidJobs starts from {formatOf(s, FORMAT_FOR_TYPE[s.org.orgType]).label}, the closest real format for a {s.org.type.toLowerCase()}. After your first job, save it as your format.
          </span>
        </div>
      </div>
    </Dialog>
  );
}

function LinkDialog({ onClose }: { onClose: () => void }) {
  const [link, setLink] = useState('');
  const host = (() => {
    try {
      const u = new URL(link.trim());
      return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.hostname : '';
    } catch {
      return '';
    }
  })();
  const read = () => {
    const id = importPasted(LINKED_SAMPLE, host);
    onClose();
    if (id) go('create', id);
  };
  return (
    <Dialog
      title="Use a job description from a link"
      subtitle="AidJobs reads that one page and keeps its wording and headings"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="aj-faint" style={{ fontSize: 11 }}>
            Simulated in the demo: nothing is fetched, and a sample advert stands in for the page.
          </span>
          <button type="button" className="aj-ink-btn" disabled={!host} onClick={read}>
            Read it
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5">
        <input
          style={inputStyle}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && host && read()}
          placeholder="https://example.org/jobs/protection-officer"
          aria-label="Link to a job description"
          inputMode="url"
          autoFocus
        />
        <span className="aj-faint" style={{ fontSize: 12 }}>
          A public page only: AidJobs follows the same safe rules as its crawler and does not sign in anywhere.
        </span>
      </div>
    </Dialog>
  );
}

export default function CreateEntry() {
  const s = useDemo();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'paste' | 'link' | 'sources' | null>(null);
  const fkey = picked ?? defaultFormatKey(s);
  const format = formatOf(s, fkey);
  const { facts } = extractFacts(text, s.today);
  const { role } = detectRole(text);
  const offered = addSuggestions(format, facts);
  const pills = [...offered, ...extra.filter((k) => !offered.includes(k))];
  const toggle = (k: string) => setExtra(extra.includes(k) ? extra.filter((x) => x !== k) : [...extra, k]);
  const send = (v: string) => {
    const id = startJob(v, fkey, extra);
    setText('');
    setExtra([]);
    go('create', id);
  };

  return (
    <div className="aj-scroll h-full">
      <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center gap-5 px-4 pt-6 pb-[16vh]">
        <div className="flex flex-col items-center gap-2 text-center">
          <Star size={26} strokeWidth={1.8} style={{ color: 'var(--sage-7)' }} />
          <h1 className="aj-display" style={{ margin: 0, fontSize: 28 }}>
            What role are you hiring for?
          </h1>
          <p className="aj-muted" style={{ margin: 0 }}>
            Describe it in a few lines. AidJobs writes it in {format.label}.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <Composer
            value={text}
            onChange={setText}
            onSend={send}
            suggestion={suggestNext(text, s.today)}
            placeholder="Describe the role in a few lines"
            label="Describe the role"
            large
            autoFocus
            tools={
              <>
                <PlusMenu s={s} format={format} onSources={() => setDialog('sources')} onPaste={() => setDialog('paste')} onLink={() => setDialog('link')} />
                <FormatMenu s={s} value={fkey} onChange={setPicked} />
                <DraftsMenu s={s} />
              </>
            }
          />
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Add sections">
            <span className="aj-faint mr-0.5" style={{ fontSize: 12, fontWeight: 650 }}>
              Add:
            </span>
            {pills.map((k) => {
              const def = SECTION_BY_KEY[k];
              const on = extra.includes(k);
              return (
                <Tip key={k} label={def.hint}>
                  <button type="button" className="ej-tag" data-on={on} aria-pressed={on} onClick={() => toggle(k)}>
                    {on ? <Check size={12} strokeWidth={2.4} /> : <Plus size={12} strokeWidth={2.2} />}
                    {headingFor(k, format)}
                  </button>
                </Tip>
              );
            })}
          </div>
        </div>

        <p className="aj-faint m-0 text-center" style={{ fontSize: 12, minHeight: 18 }} aria-live="polite">
          {(role || facts.title) &&
            `${MARKET_SAMPLE.similar} similar ${role ? role.sector.toLowerCase() : ''} roles on AidJobs · usually ${MARKET_SAMPLE.grade} · ${MARKET_SAMPLE.showPay}% show a salary · open about ${MARKET_SAMPLE.daysOpen} days (sample figures in the demo)`}
        </p>
      </div>
      {dialog === 'paste' && <PasteDialog onClose={() => setDialog(null)} />}
      {dialog === 'link' && <LinkDialog onClose={() => setDialog(null)} />}
      {dialog === 'sources' && <FormatSourceDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
