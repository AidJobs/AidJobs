'use client';

import { editTranslation, refreshTranslation, reviewTranslation } from './actions';
import { LANGS, langOf, stale, totalLines, untranslated } from './translate';
import type { DemoJob, Lang } from './types';
import { radioKeys } from './ui';

function versionStatus(job: DemoJob, k: Lang): string {
  const t = job.translations?.[k];
  if (!t) return '';
  if (stale(job, t)) return 'English changed';
  return t.reviewed ? 'reviewed' : 'draft';
}

/** English and the job's language versions, above the job description: each version is edited there like the English. */
export function LangSwitch({ job, current, onPick }: { job: DemoJob; current: Lang | null; onPick: (l: Lang | null) => void }) {
  const versions = LANGS.filter((l) => job.translations?.[l.key]);
  if (!versions.length) return null;
  return (
    <div className="aj-no-scrollbar flex items-center gap-1 overflow-x-auto" role="radiogroup" aria-label="Language of the job description" onKeyDown={radioKeys}>
      <button type="button" role="radio" aria-checked={!current} className="ej-jump" data-active={!current || undefined} onClick={() => onPick(null)}>
        English
      </button>
      {versions.map((l) => (
        <button key={l.key} type="button" role="radio" aria-checked={current === l.key} className="ej-jump" data-active={current === l.key || undefined} onClick={() => onPick(l.key)} lang={l.key}>
          {l.native} <span className="ej-jump-count">{versionStatus(job, l.key)}</span>
        </button>
      ))}
    </div>
  );
}

function rows(text: string): number {
  return Math.max(1, Math.ceil(text.length / 80));
}

/**
 * A language version as a document, edited in place like the English: the same headings and order, each English line faintly under
 * its translation, lines still in English marked. Facts and sections are changed in English; the version follows.
 */
export function LangDoc({ job, lang, readOnly = false }: { job: DemoJob; lang: Lang; readOnly?: boolean }) {
  const t = job.translations?.[lang];
  if (!t) return null;
  const info = langOf(lang);
  const left = untranslated(job, t);
  const isStale = stale(job, t);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl p-3" style={{ background: isStale ? 'var(--amber-bg)' : 'var(--surface-2)' }} role="status" lang="en" dir="ltr">
        <span className="min-w-0 flex-1">
          <strong>
            {info.label} version · {versionStatus(job, lang)}
          </strong>
          <span className="aj-muted">
            {' '}
            · {left ? `${left} of ${totalLines(t)} lines still in English` : 'every line is in the language'}. Edit facts and sections in English; this version follows.
          </span>
        </span>
        {!readOnly && isStale && (
          <button type="button" className="aj-pill" onClick={() => refreshTranslation(job.id, lang)}>
            Update the changed lines
          </button>
        )}
        {!readOnly && !isStale && !t.reviewed && (
          <button type="button" className="aj-ink-btn" onClick={() => reviewTranslation(job.id, lang)}>
            Mark as reviewed
          </button>
        )}
      </div>
      <article className="ej-doc flex flex-col gap-4" aria-label={`${info.label} version of the job description`} lang={lang} dir={info.dir}>
        {t.sections.map((sec) => {
          const en = job.sections.find((x) => x.key === sec.key);
          return (
            <section key={sec.key} className="flex flex-col gap-1.5">
              <input className="ej-tr-head" value={sec.title} readOnly={readOnly} onChange={(e) => editTranslation(job.id, lang, sec.key, 'title', e.target.value)} aria-label={`Heading: ${en?.title ?? sec.key}`} />
              {sec.lines.map((line, i) => {
                const source = en?.lines[i] ?? '';
                const english = source === line && /[a-z]{3}/i.test(line);
                // A list line ("- ...") shows as a bullet, as in the English; the marker is kept when it is edited.
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
                      <textarea className="ej-tr-line" rows={rows(text)} value={text} readOnly={readOnly} onChange={(e) => editTranslation(job.id, lang, sec.key, i, `${bullet ? '- ' : ''}${e.target.value}`)} aria-label={`${sec.title}, line ${i + 1}`} />
                    </div>
                    <span className={`aj-faint px-2 ${bullet ? 'ps-5' : ''}`} style={{ fontSize: 11.5 }} lang="en" dir="ltr">
                      {english && (
                        <span className="aj-chip" data-tone="amber" style={{ height: 18, marginRight: 6 }}>
                          English
                        </span>
                      )}
                      {source.replace(/^- /, '')}
                    </span>
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
