'use client';

import { aiOn, askAi } from './ai';
import { extractDraft, showPageDraft } from './context';
import { dropPage, holdPage, pageFor } from './pageMemory';
import { getState } from './store';
import type { OpenTarget } from './aiActions';
import type { PageDraft, Source } from './types';

/**
 * Reading a page for About us or About the project (section 19, phase 5, A): the demo's own page route, only from the website field or
 * a job's project field, never from a chat message. Pasted text and uploads use the same 8,000-character cut.
 */
export const PAGE_ROUTE = '/employer-demo/page';
export const MAX_TEXT = 8000;
export const UNREADABLE = 'this page could not be read';

export type Read = { ok: true; text: string; social: string[] } | { ok: false; reason: string };

export async function readPageVia(field: 'website' | 'project', url: string): Promise<Read> {
  try {
    const res = await fetch(PAGE_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url.trim(), field }), cache: 'no-store' });
    const data = res.ok ? ((await res.json()) as { ok?: unknown; text?: unknown; social?: unknown }) : null;
    if (data?.ok === true && typeof data.text === 'string' && data.text.trim()) {
      const social = Array.isArray(data.social) ? data.social.filter((x): x is string => typeof x === 'string' && x.startsWith('https://')).slice(0, 6) : [];
      return { ok: true, text: data.text.slice(0, MAX_TEXT), social };
    }
  } catch {
    /* the route is off or the page failed: the user pastes or uploads instead */
  }
  return { ok: false, reason: UNREADABLE };
}

/** What the window says to the AI to draft from the page it was given. */
export const draftFrom = (kind: PageDraft['kind']) =>
  `Draft ${kind === 'about' ? 'About us' : 'About the project'} from the page in context.page alone, with page_draft: every kept sentence from that page, what it used, and what it does not say.`;

/**
 * Drafts About us or About the project from one page or text: the AI when it is on, from that text alone; otherwise the page's first
 * sentences, word for word. The draft waits in the chat for Accept, Edit, or Reject; the raw text is dropped afterwards.
 */
export async function draftFromPage(id: string, kind: PageDraft['kind'], text: string, source: Source, social: string[], open: (t: OpenTarget) => void): Promise<void> {
  const page = text.slice(0, MAX_TEXT);
  holdPage(id, { kind, text: page, source, social });
  try {
    if (aiOn()) {
      await askAi(id, draftFrom(kind), { silent: kind === 'about' ? 'About us from the page' : 'About the project from the page', page: { kind, text: page }, open });
      if (getState().jobs.find((j) => j.id === id)?.pageDraft) return;
    }
    const lines = extractDraft(page);
    if (!lines.length) {
      showPageDraft(id, { kind, lines: [], used: 'The text has no full sentences to draft from.', missing: 'Paste the text that describes it, or write it in the section.', source, social });
      return;
    }
    showPageDraft(id, { kind, lines, used: 'The first sentences of the text, word for word.', missing: 'Without the AI the demo does not say what the text leaves out; read it before accepting.', source, social });
  } finally {
    if (pageFor(id)?.text === page) dropPage(id);
  }
}
