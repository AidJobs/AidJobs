import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import EmployerDemo from '@/components/employer-demo/EmployerDemo';
import { addTranslation, editSection, setLinked, startJob } from '@/components/employer-demo/actions';
import { AI_ROUTE, resetAi } from '@/components/employer-demo/ai';
import { dropAt } from '@/components/employer-demo/Grip';
import { getState, resetDemo, update } from '@/components/employer-demo/store';
import SiteRoot from '@/components/site/SiteRoot';

let container: HTMLDivElement;
let root: Root;
let phone = false;
const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  const fetchStub = async (url: unknown, init?: { method?: string }) => {
    if (url !== AI_ROUTE) throw new Error(`The employer demo must not use the network: ${String(url)}`);
    return (init?.method ?? 'GET') === 'GET' ? { ok: true, status: 200, json: async () => ({ ai: false }) } : { ok: false, status: 503, json: async () => ({}) };
  };
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: jest.fn(fetchStub) });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (q: string) => ({ matches: phone && q.includes('max-width'), media: q, addEventListener: () => {}, removeEventListener: () => {} }) });
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class { observe() {} disconnect() {} } });
  window.scrollTo = () => {};
  const error = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('Encountered a script tag')) return;
    error(...args);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterAll(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

beforeEach(() => {
  phone = false;
  act(() => root.render(null));
  localStorage.clear();
  resetDemo();
  resetAi('off');
  update((s) => ({ ...s, signedIn: true, org: { ...s.org, setupDone: true } }));
});

function render() {
  act(() => {
    root.render(
      <SiteRoot fontClasses="">
        <EmployerDemo />
      </SiteRoot>,
    );
  });
  act(() => jest.advanceTimersByTime(1000));
}
function route(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  act(() => jest.advanceTimersByTime(50));
}
const q = <T extends Element = HTMLElement>(sel: string) => container.querySelector(sel) as T | null;
const all = <T extends Element = HTMLElement>(sel: string) => Array.from(container.querySelectorAll(sel)) as T[];
const press = (el: Element | null) => act(() => (el as HTMLElement).click());
const key = (el: Element | null, k: string) => act(() => (el as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
const byText = (text: string, scope: ParentNode = document) => Array.from(scope.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLElement | undefined;
const openOutline = () => press(q('nav[aria-label="Parts of this job"] ol:not(.ej-measure) button.ej-line-part'));
const typeInto = (input: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

/** The outline in the user's design: five group titles, and no flat list or sub-section rows. */
function isOutline(scope: Element | null, readOnly = false) {
  expect(scope).not.toBeNull();
  const ol = scope!.querySelector('.ej-ol');
  expect(ol).not.toBeNull();
  expect(ol!.querySelectorAll('.ej-ol-gtitle')).toHaveLength(5);
  expect(scope!.querySelector('.ej-heading-input, .ej-subrows, .ej-drag-handle')).toBeNull();
  if (readOnly) expect(ol!.querySelector('.ej-grip, .ej-ol-x, .ej-add')).toBeNull();
  else expect(ol!.querySelectorAll('.ej-grip').length).toBeGreaterThan(5);
}

describe('the outline, one design wherever it appears (section 19, phase 6, B)', () => {
  it('the template for a first job, Create your own, an organisation’s template, This job’s sections, and the reviewers’ view', () => {
    let id = '';
    act(() => {
      id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    });
    render();
    route(`#job/${id}`);
    press(byText('Browse templates'));
    const panel = () => q('section.ej-float');
    isOutline(panel());
    press(all('section.ej-float [role="tab"]').find((t) => t.textContent === 'Create your own')!);
    isOutline(panel());
    press(all('section.ej-float [role="tab"]').find((t) => t.textContent === 'Templates')!);
    const select = q<HTMLSelectElement>('select[aria-label="Template"]')!;
    act(() => {
      select.value = 'house';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    isOutline(panel());
    route('#job/job-comms');
    openOutline();
    expect(panel()?.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("This job's sections");
    isOutline(panel());
    act(() => update((s) => ({ ...s, reviewerAs: 'amina' })));
    route('#job/job-fin');
    openOutline();
    isOutline(panel(), true);
  });

  it('on phones: the template choice and This job’s sections in the sheet', () => {
    phone = true;
    let id = '';
    act(() => {
      id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    });
    render();
    route(`#job/${id}`);
    // A returning employer is offered the usual template first; "Change something" leads to the template choice.
    if (byText('Change something')) press(byText('Change something'));
    press(byText('See all formats'));
    isOutline(container);
    route('#job/job-comms');
    press(byText('Job') ?? null);
    press(q('.ej-parts-btn'));
    press(Array.from(document.querySelectorAll('[role="dialog"] button.ej-line-part'))[0]);
    isOutline(document.querySelector('[role="dialog"][aria-label]'));
  });

  it('rename in place, × with Undo, the grip’s menu, the arrow keys across groups, and a group moved whole', () => {
    render();
    route('#job/job-comms');
    openOutline();
    const panel = q('section.ej-float')!;
    const first = panel.querySelector('.ej-ol-head') as HTMLElement;
    press(first);
    const input = panel.querySelector('.ej-ol-input') as HTMLInputElement;
    typeInto(input, 'Who we are');
    key(input, 'Enter');
    expect(job('job-comms').sections.find((x) => x.key === 'about')?.title).toBe('Who we are');
    press(panel.querySelector('[aria-label="Remove What we offer"]'));
    expect(job('job-comms').tags).not.toContain('offer');
    press(byText('Undo', container));
    expect(job('job-comms').tags).toContain('offer');
    press(panel.querySelector('[data-grip-key="purpose"]'));
    const menu = document.querySelector('[role="menu"]')!;
    expect(Array.from(menu.querySelectorAll('[role="menuitem"]')).map((b) => b.textContent)).toEqual(['Move up', 'Move down', 'Move to group…', 'Remove']);
    press(byText('Move to group…', menu));
    expect(Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]')).map((b) => b.textContent)).toEqual(['‹ Back', 'About the employer', 'The person', 'The offer and conditions', 'Applying']);
    press(byText('The person', document.querySelector('[role="menu"]')!));
    expect(job('job-comms').groupOf?.purpose).toBe('person');
    press(panel.querySelector('[data-grip-key="apply"]'));
    expect(Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]')).map((b) => b.textContent)).not.toContain('Remove');
    key(document.querySelector('[role="menu"]'), 'Escape');
    const firstJob = job('job-comms').tags.find((k) => job('job-comms').groupOf?.[k] === undefined && ['responsibilities'].includes(k))!;
    key(panel.querySelector(`[data-grip-key="${firstJob}"]`), 'ArrowUp');
    expect(job('job-comms').groupOf?.[firstJob]).toBe('employer');
    key(panel.querySelector('[data-grip-key="group:offer"]'), 'ArrowUp');
    expect(job('job-comms').groupOrder?.indexOf('offer')).toBeLessThan(job('job-comms').groupOrder!.indexOf('person'));
    expect(container.querySelector('.ej-ol [aria-live="polite"]')?.textContent).toMatch(/^Moved the group The offer and conditions/);
  });

  it('dragging tells a press from a drag; dropped after a row it joins that row’s group, under a title it goes first in that group', () => {
    const box = document.createElement('div');
    const mk = (attrs: Record<string, string>, top: number) => {
      const el = document.createElement('div');
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.getBoundingClientRect = () => ({ top, height: 20, bottom: top + 20, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) });
      box.appendChild(el);
    };
    mk({ 'data-drop-group': 'employer' }, 0);
    mk({ 'data-drop-group': 'employer', 'data-drop-key': 'about' }, 20);
    mk({ 'data-drop-group': 'job' }, 40);
    mk({ 'data-drop-group': 'job', 'data-drop-key': 'purpose' }, 60);
    expect(dropAt(box, 35, 'offer')).toEqual({ after: 'about', group: 'employer' });
    expect(dropAt(box, 55, 'offer')).toEqual({ after: null, group: 'job' });
    expect(dropAt(box, 2, 'offer')).toEqual({ after: null, group: 'employer' });
  });
});

describe('the four icons on the draft (section 19, phase 6, C and D)', () => {
  it('each section has the pencil and the grip, a + is always at the end, and the + panel adds a section where it was opened', () => {
    render();
    route('#job/job-comms');
    expect(all('.ej-doc .ej-dsec .ej-sec-tools').length).toBe(job('job-comms').sections.length);
    expect(q('.ej-doc .ej-chip')?.textContent).not.toBe('Your text');
    press(q('[data-grip-key="purpose"]'));
    press(byText('Add a section below', document.querySelector('[role="menu"]')!));
    const panel = document.querySelector('[role="dialog"][aria-label="Add a section here"]')!;
    expect(panel.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('The job');
    press(Array.from(panel.querySelectorAll('button')).find((b) => b.textContent?.includes('Your first weeks'))!);
    expect(job('job-comms').tags.indexOf('firstweeks')).toBe(job('job-comms').tags.indexOf('purpose') + 1);
    expect(q('.ej-addend-btn')).not.toBeNull();
  });

  it('How to apply’s pencil opens its application settings; its grip has no Remove', () => {
    render();
    route('#job/job-comms');
    press(q('#ej-sec-apply [aria-label="Edit How to apply"]'));
    expect(q('#ej-sec-apply')?.textContent).toContain('How people apply');
    expect(byText('By email', q('#ej-sec-apply')!)).toBeDefined();
  });

  it('reviewers see none of the four icons', () => {
    act(() => update((s) => ({ ...s, reviewerAs: 'amina' })));
    render();
    route('#job/job-fin');
    expect(q('.ej-doc .ej-sec-tools, .ej-doc .ej-grip, .ej-addend-btn, .ej-addline')).toBeNull();
  });

  it('fixed texts: one block after the sections; a locked text’s pencil and Leave out stay focusable with their reason; Change for every job opens Settings at that text, where every fixed text is listed', () => {
    render();
    route('#job/job-comms');
    const block = q('.ej-fixed')!;
    expect(block.querySelector('h3')?.textContent).toContain('Our commitments');
    const locked = getState().org.standard.find((c) => c.locked && job('job-comms').commitments.includes(c.key))!;
    const pencil = block.querySelector(`[aria-label="Edit ${locked.label} for this job"]`) as HTMLButtonElement;
    expect(pencil.getAttribute('aria-disabled')).toBe('true');
    expect(pencil.disabled).toBe(false);
    press(block.querySelector(`[data-grip-key="fixed:en:${locked.key}"]`));
    const leave = byText('Leave out of this job', document.querySelector('[role="menu"]')!)!;
    expect(leave.getAttribute('aria-disabled')).toBe('true');
    press(leave);
    expect(job('job-comms').commitments).toContain(locked.key);
    press(byText('Change for every job ↗', document.querySelector('[role="menu"]')!)!);
    act(() => jest.advanceTimersByTime(50));
    expect(window.location.hash).toBe(`#org/fixed-${locked.key}`);
    expect(q(`#ej-fixed-${locked.key}`)).not.toBeNull();
    expect(all('[id^="ej-fixed-"]').length).toBe(getState().org.mdsMember ? 13 : 12);
    expect(all('[id^="ej-fixed-"]').filter((el) => el.textContent?.includes('Starter')).length).toBeGreaterThan(0);
  });
});

describe('languages in the window (section 19, phase 6, E)', () => {
  it('a version is edited like the job’s own, with its icons and the original beside it; 🔗 links languages; after an unlinked edit, “Also in …” is offered', () => {
    act(() => addTranslation('job-comms', 'fr'));
    render();
    route('#job/job-comms');
    act(() => editSection('job-comms', 'purpose', 'A new purpose written by hand.', true));
    const also = all('.ej-also-btn');
    expect(also.map((b) => b.textContent)).toEqual(['French']);
    press(all('[role="tab"]').find((t) => t.textContent?.startsWith('Français'))!);
    expect(q('#ej-ver-purpose .ej-sec-tools')).not.toBeNull();
    expect(q('#ej-ver-purpose .ej-ref')?.textContent).toContain('A new purpose written by hand.');
    press(q('[aria-label="Link languages"]'));
    const box = document.querySelector('[role="dialog"][aria-label="Link languages"]')!;
    act(() => (box.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement).click());
    act(() => (box.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement).click());
    expect(job('job-comms').linked).toEqual(['en', 'fr']);
    expect(all('[role="tab"] .ej-tab-link')).toHaveLength(2);
    act(() => setLinked('job-comms', []));
  });
});
