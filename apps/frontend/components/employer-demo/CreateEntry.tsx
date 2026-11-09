'use client';

import { Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Tip from '@/components/site/Tip';
import { defaultFormatKey, formatOf, importJobDescription, startJob } from './actions';
import Composer, { type ComposerHandle } from './Composer';
import { FactSlot, FormatMenu, PlusMenu } from './ComposerTools';
import { addSuggestions, article, completeText, detectRole, extractFacts, headingFor, PLACES, recognise, ROLE_FAMILIES, SECTION_BY_KEY } from './engine';
import CreateFormatDialog from './FormatBuilder';
import { MARKET_SAMPLE } from './sample';
import { go, useDemo } from './store';
import { readJobFile } from './readFile';
import type { State } from './types';
import UploadDialog from './Upload';

/** Set when a job starts from this screen, so its workspace opens once with the chat open and focused. */
export const OPEN_CHAT_KEY = 'aidjobs.employerDemo.openChat';

/** The job just started with Enter: its window opens at once and shows "Reading your role…" before the first replies. */
export const READING_KEY = 'aidjobs.employerDemo.reading';

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

/** Realistic examples for the empty box, from the organisation's own sectors and the places it works in. */
function examplesFor(s: State): string[] {
  const roles = ROLE_FAMILIES.filter((r) => s.org.sectors.includes(r.sector)).map((r) => r.title);
  const cities = s.org.countries.map((c) => PLACES.find((p) => p.country === c)?.city).filter(Boolean) as string[];
  const out = roles.flatMap((title, i) => (cities.length ? [`We're hiring ${article(title)} ${title} in ${cities[i % cities.length]}, 12-month fixed-term…`] : [`We're hiring ${article(title)} ${title}…`]));
  return out.length ? out : ['Describe the role in a few lines'];
}

export default function CreateEntry() {
  const s = useDemo();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'upload' | 'create' | null>(null);
  const [offer, setOffer] = useState('');
  const [note, setNote] = useState('');
  const [example, setExample] = useState(0);
  const box = useRef<ComposerHandle>(null);
  const examples = examplesFor(s);
  useEffect(() => {
    if (text) return;
    const t = setInterval(() => setExample((n) => n + 1), 4000);
    return () => clearInterval(t);
  }, [text]);
  const fkey = picked ?? defaultFormatKey(s);
  const format = formatOf(s, fkey);
  const { facts } = extractFacts(text, s.today);
  const { role } = detectRole(text);
  const offered = addSuggestions(format, facts);
  const pills = [...offered, ...extra.filter((k) => !offered.includes(k))];
  const toggle = (k: string) => setExtra(extra.includes(k) ? extra.filter((x) => x !== k) : [...extra, k]);
  const own = [...s.jobs.map((j) => j.facts.title).filter(Boolean), ...s.org.countries.flatMap((c) => PLACES.filter((p) => p.country === c).map((p) => `${p.city}, ${p.country}`))];
  const have = [
    { ok: Boolean(role || facts.title), name: 'the role' },
    { ok: Boolean(facts.location) || facts.arrangement === 'remote', name: 'the duty station' },
    { ok: Boolean(facts.deadline), name: 'the closing date' },
    { ok: Boolean(facts.contract || facts.duration), name: 'the contract' },
  ];
  const readiness = { done: have.filter((h) => h.ok).length, total: have.length, missing: have.filter((h) => !h.ok).map((h) => h.name) };
  const imported = (body: string) => {
    const id = importJobDescription(body);
    if (!id) return setNote('No headings or text were found in it. Headings work best on their own lines.');
    setOffer('');
    setText('');
    go('create', id);
  };
  const dropped = async (file: File) => {
    setNote('Reading the file…');
    const r = await readJobFile(file);
    if (r.error) return setNote(r.error);
    setNote('');
    imported(r.text ?? '');
  };
  const add = (phrase: string) => {
    setText((t) => t.trimEnd().replace(/[.,;]$/, '') + phrase);
    box.current?.focus();
  };
  const send = (v: string) => {
    const id = startJob(v, fkey, extra, true);
    try {
      localStorage.setItem(READING_KEY, id);
    } catch {
      /* storage unavailable */
    }
    setText('');
    setExtra([]);
    go('job', id);
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
            ref={box}
            value={text}
            onChange={(v) => {
              setText(v);
              setNote('');
              if (!v) setOffer('');
            }}
            onSend={send}
            suggestion={completeText(text, own)}
            readiness={text.trim() ? readiness : undefined}
            placeholder={examples[example % examples.length]}
            marks={text ? recognise(text, s.today, s.org.scale.map((g) => g.grade)) : undefined}
            onPasteLong={setOffer}
            onFile={(f) => void dropped(f)}
            label="Describe the role"
            large
            autoFocus
            tools={
              <>
                <PlusMenu s={s} onUpload={() => setDialog('upload')} />
                <FormatMenu s={s} value={picked} onChange={setPicked} onCreate={() => setDialog('create')} />
                {(role || facts.title) && <FactSlot s={s} facts={facts} family={role?.key ?? 'programme'} onAdd={add} />}
              </>
            }
          />
          {offer && (
            <div className="ej-offer" role="status">
              <span className="min-w-0 flex-1">This looks like a job description. Read it as one, keeping its wording and headings?</span>
              <button type="button" className="aj-ink-btn" style={{ height: 30 }} onClick={() => imported(text || offer)}>
                Read it
              </button>
              <button type="button" className="aj-pill" style={{ height: 30 }} onClick={() => setOffer('')}>
                Keep it as a message
              </button>
            </div>
          )}
          {note && (
            <p className="m-0" role="status" style={{ fontSize: 12, color: note.startsWith('Reading') ? 'var(--text-2)' : 'var(--red)' }}>
              {note}
            </p>
          )}
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
      {dialog === 'upload' && <UploadDialog onClose={() => setDialog(null)} />}
      {dialog === 'create' && <CreateFormatDialog onClose={() => setDialog(null)} onSaved={setPicked} />}
    </div>
  );
}
