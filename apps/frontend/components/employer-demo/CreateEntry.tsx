'use client';

import { Star } from 'lucide-react';
import { useState } from 'react';
import Tip from '@/components/site/Tip';
import { defaultFormatKey, formatOf, startJob } from './actions';
import Composer from './Composer';
import { FormatMenu, PlusMenu } from './ComposerTools';
import { addSuggestions, detectRole, extractFacts, headingFor, SECTION_BY_KEY } from './engine';
import CreateFormatDialog from './FormatBuilder';
import { MARKET_SAMPLE } from './sample';
import { go, useDemo } from './store';
import UploadDialog from './Upload';

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
export default function CreateEntry() {
  const s = useDemo();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'upload' | 'create' | null>(null);
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
            suggestion=""
            placeholder="Describe the role in a few lines"
            label="Describe the role"
            large
            autoFocus
            tools={
              <>
                <PlusMenu s={s} onUpload={() => setDialog('upload')} />
                <FormatMenu s={s} value={picked} onChange={setPicked} onCreate={() => setDialog('create')} />
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
      {dialog === 'upload' && <UploadDialog onClose={() => setDialog(null)} />}
      {dialog === 'create' && <CreateFormatDialog onClose={() => setDialog(null)} onSaved={setPicked} />}
    </div>
  );
}
