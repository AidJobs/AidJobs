'use client';

import { Star, Upload } from 'lucide-react';
import { useState } from 'react';
import Tip from '@/components/site/Tip';
import { defaultFormatKey, formatOf, importPasted, learnFormat, startJob } from './actions';
import Composer from './Composer';
import { DraftsMenu, FormatMenu, PlusMenu } from './ComposerTools';
import CreateFormatDialog from './FormatBuilder';
import { addSuggestions, detectRole, extractFacts, FORMAT_FOR_TYPE, headingFor, SECTION_BY_KEY, suggestNext } from './engine';
import { LINKED_SAMPLE, MARKET_SAMPLE } from './sample';
import { go, update, useDemo } from './store';
import { Dialog, inputStyle } from './ui';

/** Short names so the "Add:" pills fit on one line; the full heading shows on hover. */
const PILL_LABEL: Record<string, string> = {
  offer: 'What we offer',
  assessment: 'Selection process',
  firstweeks: 'First weeks',
  team: 'Team',
  relationships: 'Working relationships',
  practical: 'Practical needs',
  competencies: 'Competencies',
  languages: 'Languages',
  background: 'Background',
  setting: 'Setting',
};

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


function UploadFormatDialog({ onClose }: { onClose: () => void }) {
  const s = useDemo();
  const [text, setText] = useState('');
  const [link, setLink] = useState(s.org.careersUrl);
  const [error, setError] = useState('');
  const learn = () => {
    if (!learnFormat(text)) return setError('No headings were found. Paste the advert as text, with its headings on their own lines.');
    onClose();
  };
  return (
    <Dialog
      title="Upload your format"
      subtitle="AidJobs learns your headings and their order; new jobs start from them"
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="aj-faint" style={{ fontSize: 11 }}>
            No past adverts? AidJobs starts from {formatOf(s, FORMAT_FOR_TYPE[s.org.orgType]).label}, the closest real format for a {s.org.type.toLowerCase()}.
          </span>
          <button type="button" className="aj-ink-btn" disabled={!text.trim()} onClick={learn}>
            Learn the format
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <textarea style={{ ...inputStyle, minHeight: 180, lineHeight: 1.5 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Paste one of your past adverts, with its headings, for example:\n\nABOUT US\n…\n\nTHE ROLE\n…'} aria-label="One of your past adverts" />
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
        <div className="flex flex-col gap-1.5 border-t pt-3 aj-hair">
          <span className="aj-muted">Or give your careers-page link: AidJobs reads that one page once, with the same safe rules as its crawler (simulated here).</span>
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
  const [dialog, setDialog] = useState<'paste' | 'link' | 'format' | 'create' | null>(null);
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
                <PlusMenu s={s} onFormat={() => setDialog('format')} onPaste={() => setDialog('paste')} onLink={() => setDialog('link')} />
                <FormatMenu s={s} value={picked} onChange={setPicked} onCreate={() => setDialog('create')} />
                <DraftsMenu s={s} />
              </>
            }
          />
          <div className="aj-no-scrollbar flex items-center gap-1.5 overflow-x-auto whitespace-nowrap" role="group" aria-label="Add sections">
            <span className="aj-faint mr-0.5 shrink-0" style={{ fontSize: 12, fontWeight: 650 }}>
              Add:
            </span>
            {pills.map((k) => {
              const on = extra.includes(k);
              return (
                <Tip key={k} label={`${headingFor(k, format)}: ${SECTION_BY_KEY[k].hint}`}>
                  <button type="button" className="ej-tag shrink-0" data-on={on} aria-pressed={on} onClick={() => toggle(k)}>
                    {PILL_LABEL[k] ?? headingFor(k, format)}
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
      {dialog === 'format' && <UploadFormatDialog onClose={() => setDialog(null)} />}
      {dialog === 'create' && <CreateFormatDialog onClose={() => setDialog(null)} onSaved={setPicked} />}
    </div>
  );
}