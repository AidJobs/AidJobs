'use client';

import { Paperclip, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LINK_REPLY, startFromDocument, startJob } from './actions';
import Composer, { type ComposerHandle } from './Composer';
import { FactSlot, PlusMenu } from './ComposerTools';
import { addDays, article, completeText, detectRole, extractFacts, PLACES, readPasted, recognise, ROLE_FAMILIES } from './engine';
import { workingDay } from './market';
import { usualTemplate } from './setup';
import { go, READING_KEY, useDemo } from './store';
import { readJobFile } from './readFile';
import type { State } from './types';
import UploadDialog from './Upload';

export { READING_KEY };

/** Set when a job starts from this screen, so its workspace opens once with the chat open and focused. */
export const OPEN_CHAT_KEY = 'aidjobs.employerDemo.openChat';

const LINK = /^\s*(?:https?:\/\/|www\.)\S+\s*$/i;

/** Realistic examples for the empty box, from the organisation's own sectors and the places it works in. */
function examplesFor(s: State): string[] {
  const roles = ROLE_FAMILIES.filter((r) => s.org.sectors.includes(r.sector)).map((r) => r.title);
  const cities = s.org.countries.map((c) => PLACES.find((p) => p.country === c)?.city).filter(Boolean) as string[];
  const out = roles.flatMap((title, i) => (cities.length ? [`We're hiring ${article(title)} ${title} in ${cities[i % cities.length]}, 12-month fixed-term…`] : [`We're hiring ${article(title)} ${title}…`]));
  return out.length ? out : ['Describe the role in a few lines'];
}

/**
 * Step 1 of a new employer's writing (employer-side plan, section 19): the role in a line, with the typing aids. The template, the
 * sections this role adds, and the market line come next, in the window's chat; a job description brought here (uploaded, dropped,
 * or pasted) opens the window at the question of how to use it.
 */
export default function CreateEntry() {
  const s = useDemo();
  const [text, setText] = useState('');
  const [formatKey, setFormatKey] = useState<string>(() => usualTemplate(s)?.key ?? '');
  const [dialog, setDialog] = useState<'upload' | null>(null);
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
  const { facts } = extractFacts(text, s.today, undefined, s.org.scale.map((g) => g.grade));
  const { role } = detectRole(text);
  const formats = s.formats.filter((f) => !f.key.startsWith('pasted-'));
  const suggestedClose = workingDay(addDays(s.today, 21), facts.iso || '');
  const cityHint = s.org.countries[0] ? PLACES.find((p) => p.country === s.org.countries[0]) : null;
  const scopeChips: Array<{ label: string; phrase: string }> = [
    ...(!facts.location && facts.arrangement !== 'remote'
      ? [{ label: cityHint ? `+ ${cityHint.city}` : '+ Duty station', phrase: cityHint ? `, based in ${cityHint.city}, ${cityHint.country}` : ', based in Nairobi, Kenya' }]
      : []),
    ...(facts.engagement === 'job' && !facts.contract ? [{ label: '+ Fixed-term (12 months)', phrase: ', 12-month fixed-term' }] : []),
    ...(!facts.deadline && !facts.rolling ? [{ label: `+ Closes ${suggestedClose}`, phrase: `, closing ${suggestedClose}` }] : []),
    ...(facts.engagement === 'internship' && !facts.paidStipend ? [{ label: '+ Paid / stipend', phrase: ', with a monthly stipend' }] : []),
    ...(facts.engagement === 'consultancy' && !facts.duration ? [{ label: '+ 40 working days', phrase: ', 40 working days over 3 months' }] : []),
    ...(s.org.orgType === 'un' && !facts.grade ? [{ label: '+ Grade P3', phrase: ', grade P3' }] : []),
    ...(facts.eligibility === 'anyone' && text.trim().length > 0 ? [{ label: '+ Nationals only', phrase: ', open to nationals only' }] : []),
  ];
  const own = [...s.jobs.map((j) => j.facts.title).filter(Boolean), ...s.org.countries.flatMap((c) => PLACES.filter((p) => p.country === c).map((p) => `${p.city}, ${p.country}`))];
  const have = [
    { ok: Boolean(role || facts.title), name: 'the role' },
    { ok: Boolean(facts.location) || facts.arrangement === 'remote', name: 'the duty station' },
    { ok: Boolean(facts.deadline || facts.rolling), name: 'the closing date' },
    { ok: Boolean(facts.contract || facts.duration), name: 'the contract' },
  ];
  const readiness = { done: have.filter((h) => h.ok).length, total: have.length, missing: have.filter((h) => !h.ok).map((h) => h.name) };
  const imported = (body: string) => {
    const id = startFromDocument(body);
    if (!id) return setNote('No headings or text were found in it. Headings work best on their own lines.');
    setOffer('');
    setText('');
    go('job', id);
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
    if (LINK.test(v)) return setNote(LINK_REPLY);
    const id = startJob(v, formatKey || undefined, [], true);
    try {
      localStorage.setItem(READING_KEY, id);
    } catch {
      /* storage unavailable */
    }
    setText('');
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
            onPasteLong={(t) => {
              if (readPasted(t).length >= 2) setOffer(t);
            }}
            onFile={(f) => void dropped(f)}
            label="Describe the role"
            large
            autoFocus
            tools={
              <>
                <PlusMenu s={s} onUpload={() => setDialog('upload')} />
                {(role || facts.title) && <FactSlot s={s} facts={facts} family={role?.key ?? 'programme'} onAdd={add} />}
              </>
            }
          />
          {scopeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Quick scope details">
              <span className="aj-faint" style={{ fontSize: 11.5 }}>
                Add to brief:
              </span>
              {scopeChips.map((chip) => (
                <button key={chip.label} type="button" className="aj-pill" style={{ height: 28, fontSize: 12 }} onClick={() => add(chip.phrase)}>
                  {chip.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5" style={{ fontSize: 12.5 }}>
            <label className="flex items-center gap-1.5 aj-muted">
              <span>JD format:</span>
              <select
                className="ej-select"
                style={{ height: 30, fontSize: 12.5, padding: '0 26px 0 9px' }}
                value={formatKey}
                onChange={(e) => setFormatKey(e.target.value)}
                aria-label="JD format"
              >
                <option value="">Recommended for {s.org.short}</option>
                {formats.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="aj-text-btn inline-flex items-center gap-1.5" style={{ height: 30, fontSize: 12.5 }} onClick={() => setDialog('upload')}>
              <Paperclip size={13} strokeWidth={1.8} /> Attach brief or old JD
            </button>
          </div>
          {offer && (
            <div className="ej-offer" role="status">
              <span className="min-w-0 flex-1">This looks like a job description. Use it as one? I&apos;ll ask whether to keep only its headings or its wording too.</span>
              <button type="button" className="aj-ink-btn" style={{ height: 30 }} onClick={() => imported(text || offer)}>
                Use it
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
        </div>
      </div>
      {dialog === 'upload' && (
        <UploadDialog
          onClose={() => setDialog(null)}
          onUse={(body) => {
            setDialog(null);
            imported(body);
          }}
        />
      )}
    </div>
  );
}
