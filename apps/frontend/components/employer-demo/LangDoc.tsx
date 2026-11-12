'use client';

import { editTranslation, keepTranslation, refreshTranslation, reviewTranslation } from './actions';
import { jobLang, langOf, stale, totalLines, untranslated, versionsOf } from './translate';
import type { DemoJob, JobLang } from './types';
import { radioKeys } from './ui';

function versionStatus(job: DemoJob, k: JobLang): string {
  const t = job.translations?.[k];
  if (!t) return '';
  if (stale(job, t)) return `${langOf(jobLang(job)).label} changed`;
  return t.reviewed ? 'reviewed' : 'draft';
}

/** The job's own language and its versions, above the job description: each version is edited there like the job's own text. */
export function LangSwitch({ job, current, onPick }: { job: DemoJob; current: JobLang | null; onPick: (l: JobLang | null) => void }) {
  const versions = versionsOf(job);
  if (!versions.length) return null;
  const own = langOf(jobLang(job));
  return (
    <div className="aj-no-scrollbar flex items-center gap-1 overflow-x-auto" role="radiogroup" aria-label="Language of the job description" onKeyDown={radioKeys}>
      <button type="button" role="radio" aria-checked={!current} className="ej-jump" data-active={!current || undefined} onClick={() => onPick(null)} lang={own.key}>
        {own.native}
      </button>
      {versions.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={current === k} className="ej-jump" data-active={current === k || undefined} onClick={() => onPick(k)} lang={k}>
          {langOf(k).native}{' '}
          <span className="ej-jump-count" lang="en">
            {versionStatus(job, k)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** A line's box grows with its text where the browser cannot size it from the content itself. */
function fit(el: HTMLTextAreaElement | null) {
  if (!el || (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content'))) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

/**
 * A language version as a document, edited in place: its own headings and sections, each line of the job's own text faintly under its
 * translation, lines still in the job's language marked. The facts are shared by every version; the sections are the version's own.
 * When the job's own text changed, the version stays as it is and offers the update, or to keep it as it is.
 */
export function LangDoc({ job, lang, readOnly = false }: { job: DemoJob; lang: JobLang; readOnly?: boolean }) {
  const t = job.translations?.[lang];
  if (!t) return null;
  const info = langOf(lang);
  const own = langOf(jobLang(job));
  const left = untranslated(job, t);
  const isStale = stale(job, t);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl p-3" style={{ background: isStale ? 'var(--amber-bg)' : 'var(--surface-2)' }} lang="en" dir="ltr">
        <span className="min-w-0 flex-1">
          <strong>
            {info.label} version · {versionStatus(job, lang)}
          </strong>
          <span className="aj-muted">
            {' '}
            · {left ? `${left} of ${totalLines(t)} lines still in ${own.label}` : 'every line is in the language'}. {readOnly ? 'The facts are shared with every version.' : `The facts are shared; its sections are its own. Changes to the ${own.label} are not copied here unless you say so.`}
            {!readOnly && job.status === 'live' && t.reviewed && ' It is on the live job page: an edit takes it off until you mark it as reviewed again.'}
          </span>
        </span>
        {!readOnly && isStale && (
          <>
            <button type="button" className="aj-pill" onClick={() => refreshTranslation(job.id, lang)}>
              Update the changed lines
            </button>
            <button type="button" className="aj-text-btn" onClick={() => keepTranslation(job.id, lang)}>
              Keep it as it is
            </button>
          </>
        )}
        {!readOnly && !t.reviewed && (
          <button type="button" className="aj-ink-btn" onClick={() => reviewTranslation(job.id, lang)}>
            Mark as reviewed
          </button>
        )}
      </div>
      <article className="ej-doc flex flex-col gap-4" aria-label={`${info.label} version of the job description`} lang={lang} dir={info.dir}>
        {t.sections.map((sec) => {
          const src = job.sections.find((x) => x.key === sec.key);
          return (
            <section key={sec.key} id={`ej-ver-${sec.key}`} className="flex flex-col gap-1.5" style={{ scrollMarginTop: 12 }}>
              <input className="ej-tr-head" value={sec.title} readOnly={readOnly} onChange={(e) => editTranslation(job.id, lang, sec.key, 'title', e.target.value)} aria-label={`Heading: ${src?.title ?? sec.key}`} />
              {sec.lines.length === 0 && <span className="aj-faint px-2">Empty: write it here in the chat.</span>}
              {sec.lines.map((line, i) => {
                const source = src?.lines[i] ?? '';
                const same = source === line && /\p{L}{3}/u.test(line);
                // A list line ("- ...") shows as a bullet, as in the job's own text; the marker is kept when it is edited.
                const bullet = line.startsWith('- ');
                const text = bullet ? line.slice(2) : line;
                return (
                  <div key={i} className="flex flex-col gap-0.5">
                    <div className="flex items-start gap-1">
                      {bullet && (
                        <span className="aj-faint pt-1.5" aria-hidden>
                          •
                        </span>
                      )}
                      <textarea
                        ref={(el) => fit(el)}
                        className="ej-tr-line"
                        rows={1}
                        value={text}
                        readOnly={readOnly}
                        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                        onChange={(e) => {
                          fit(e.target);
                          editTranslation(job.id, lang, sec.key, i, `${bullet ? '- ' : ''}${e.target.value.replace(/\s*\n\s*/g, ' ')}`);
                        }}
                        aria-label={`${sec.title}, line ${i + 1}`}
                      />
                    </div>
                    {source && (
                      <span className={`aj-faint px-2 ${bullet ? 'ps-5' : ''}`} style={{ fontSize: 11.5 }}>
                        <span lang={own.key} dir={own.dir}>
                          {same && (
                            <span className="aj-chip" data-tone="amber" style={{ height: 18, marginRight: 6 }} lang="en">
                              {own.label}
                            </span>
                          )}
                          {source.replace(/^- /, '')}
                        </span>
                      </span>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </article>
    </div>
  );
}
