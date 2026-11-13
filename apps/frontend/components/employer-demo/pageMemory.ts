import type { PageDraft, Source } from './types';

/**
 * The page or text being drafted from, per job, in memory only (section 19, phase 5, A): sent to the AI only while its draft is written,
 * never stored with the job, in the chat, or in the browser's storage.
 */
export type RawPage = { kind: PageDraft['kind']; text: string; source: Source; social: string[] };

const pages = new Map<string, RawPage>();

export function holdPage(id: string, page: RawPage) {
  pages.set(id, page);
}

export function pageFor(id: string): RawPage | undefined {
  return pages.get(id);
}

export function dropPage(id: string) {
  pages.delete(id);
}
