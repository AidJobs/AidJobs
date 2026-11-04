import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
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
import { quality } from '@/components/employer-demo/engine';
import { memoryPick, pickPhrase } from '@/components/employer-demo/answers';
import { emptyFacts } from '@/components/employer-demo/engine';
import { answerFact, basePattern, forgetBase, notNowBase, setBaseFormat, importJobDescription, publish, readIntent, sendChat, sendForReview, setFacts, startJob, undoLastChange } from '@/components/employer-demo/actions';
import { getState, go, resetDemo, STORAGE_KEY } from '@/components/employer-demo/store';
import SiteRoot from '@/components/site/SiteRoot';

const network: string[] = [];
let container: HTMLDivElement;
let root: Root;
let phone = false;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  const deny = (what: string) => () => {
    network.push(what);
    throw new Error(`The employer demo must not use the network: ${what}`);
  };
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: jest.fn(deny('fetch')) });
  Object.defineProperty(window.XMLHttpRequest.prototype, 'open', { configurable: true, value: deny('XMLHttpRequest') });
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: deny('sendBeacon') });
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: deny('WebSocket') });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: phone && q.includes('max-width'), media: q, addEventListener: () => {}, removeEventListener: () => {} }),
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      disconnect() {}
    },
  });
  window.scrollTo = () => {};
  const error = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('Encountered a script tag')) return;
    error(...args);
  });
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterAll(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

function render() {
  act(() => {
    root.render(
      <SiteRoot fontClasses="">
        <EmployerDemo />
      </SiteRoot>,
    );
  });
}

function click(text: string | RegExp) {
  const el = Array.from(container.querySelectorAll('button, a')).find((b) => (typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? '')));
  if (!el) throw new Error(`No button "${text}" on the screen: ${container.textContent?.slice(0, 300)}`);
  act(() => {
    (el as HTMLElement).click();
  });
}

function route(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function shows(text: string) {
  expect(container.textContent).toContain(text);
}

describe('employer demo: never calls the network', () => {
  it('walks every screen on a desktop and a phone without a single network call', () => {
    render();
    shows('Publish once. Reach further.');
    click(/Email me a sign-in link/);
    click('Open the link (demo)');
    shows('What role are you hiring for?');
    shows('Add:');
    for (const [tool, inside] of [
      ['Upload a job description, hire again, or continue a job draft', 'Continue a job draft'],
      ['Select a JD format', 'UN Secretariat format'],
    ] as const) {
      const el = Array.from(container.querySelectorAll('button')).find((b) => (typeof tool === 'string' ? b.getAttribute('aria-label') === tool : tool.test(b.getAttribute('aria-label') ?? '')));
      act(() => el?.click());
      shows(inside);
      act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    }
    act(() => (Array.from(container.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Select a JD format') as HTMLElement).click());
    click('Create your own JD format');
    const nameInput = document.querySelector('input[placeholder^="For example"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(nameInput, 'Riverstone field roles');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    for (const sec of ['About us', 'Responsibilities', 'How to apply']) click(sec);
    click('Save format');
    const made = getState().formats.find((f) => f.label === 'Riverstone field roles');
    expect(made?.family).toBe('Your organisation');
    expect(made?.order.map((o) => o.key)).toEqual(['about', 'responsibilities', 'apply']);
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.getAttribute('aria-label') === 'JD format: Riverstone field roles')).toBe(true);
    const pill = container.querySelector('[aria-label="Add sections"] button');
    act(() => (pill as HTMLElement).click());
    expect(pill?.getAttribute('aria-pressed')).toBe('true');
    for (const p of [false, true]) {
      phone = p;
      render();
      route('#jobs');
      shows('Jobs');
      route('#jobs/job-cps');
      shows('Child Protection Specialist');
      shows('History');
      route('#jobs/job-log');
      shows('Hire again');
      route('#create/job-fin');
      expect(container.querySelector('#ej-title-edit')).not.toBeNull();
      shows('In review');
      shows('Key areas of accountability');
      route('#create/job-cps');
      expect(container.textContent?.toLowerCase()).toContain('our commitments');
      route('#styles');
      shows('UN Secretariat format');
      shows('Local NGO concise');
      route('#team');
      shows('Approval before publishing');
      route('#org');
      shows('Brand style');
      route('#public');
      shows('Premium · sponsored by employers');
      route('#public/org');
      shows('Riverstone Aid');
      route('#home');
      shows('Hello, Sam');
      shows('Decision inbox');
      route('#create');
      shows('What role are you hiring for?');
    }

    phone = false;
    render();
    let id = '';
    act(() => {
      id = startJob("We're hiring a WASH Programme Manager in Nairobi, 12-month fixed-term contract, closing 30 November 2026");
    });
    route(`#create/${id}`);
    expect(container.querySelector('#ej-title-edit')).not.toBeNull();
    shows('What you will do');
    shows('JD outline');
    for (const pill of [/Nairobi/, /^Job/, /^Grade$/, /^Closes/, /As per our salary scale|Not shown/, /^More details$/]) {
      click(pill);
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
    }
    route(`#publish/${id}`);
    shows('How it will look');
    click('Continue');
    shows('Choose visibility');
    click('Continue');
    shows("Let's get it seen.");
    click('Skip & publish');
    shows('Your vacancy is live!');
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(getState().jobs.find((j) => j.id === id)?.status).toBe('live');

    act(() => {
      const id2 = startJob('Hiring a Finance Officer in Kampala, closing in 4 weeks');
      publish(id2, { plan: 'premium', useCredit: false, schedule: null, reach: { candidates: [{ email: 'a@example.org', status: 'queued' }], team: [], community: true, intro: '' } });
      jest.advanceTimersByTime(5000);
      go('jobs', id2);
    });
    route(window.location.hash);
    shows('1 of 1 sent');

    route('#create/job-fin');
    const tagsOf = () => getState().jobs.find((j) => j.id === 'job-fin')?.tags ?? [];
    const before = tagsOf();
    const list = Array.from(container.querySelectorAll('[aria-label="JD outline"] ul')).find((u) => u.querySelectorAll('.ej-drag-handle').length > 1);
    const handle = list?.querySelector('.ej-drag-handle') as HTMLElement;
    act(() => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(tagsOf()).not.toEqual(before);
    expect([...tagsOf()].sort()).toEqual([...before].sort());

    const linesOf = () => JSON.stringify(getState().jobs.find((j) => j.id === 'job-fin')?.sections);
    const unchanged = linesOf();
    act(() => sendChat('job-fin', 'make the responsibilities longer'));
    expect(linesOf()).not.toBe(unchanged);
    expect(container.querySelector('.ej-change-note')).not.toBeNull();
    click('Undo');
    expect(linesOf()).toBe(unchanged);
    expect(container.querySelector('.ej-change-note')).toBeNull();
    let imported: string | null = null;
    act(() => {
      imported = importJobDescription('WHO WE ARE\nRiverstone works in East Africa.\n\nTHE JOB\nThe officer leads the team.\n\nHOW TO APPLY\nApply online.', { saveAs: 'Riverstone HQ roles' });
    });
    const saved = getState().formats.find((f) => f.label === 'Riverstone HQ roles');
    expect(saved?.order.map((o) => o.heading)).toEqual(['Who we are', 'The job', 'How to apply']);
    expect(getState().jobs.find((j) => j.id === imported)?.format).toBe(saved?.key);
    const ownFormats = () => getState().formats.filter((f) => f.family === 'Your organisation' && !f.key.startsWith('pasted-')).length;
    const formatsBefore = ownFormats();
    act(() => {
      imported = importJobDescription('ABOUT THE ROLE\nThe officer leads the team.\n\nHOW TO APPLY\nApply online.');
    });
    expect(ownFormats()).toBe(formatsBefore);
    route(`#create/${imported}`);
    act(() => (container.querySelector('[aria-label="More actions for this job draft"]') as HTMLElement).click());
    click('Delete job draft');
    expect(getState().jobs.some((j) => j.id === imported)).toBe(false);

    expect(network).toEqual([]);
    expect(document.querySelector('script[src*="paddle"]')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"v":2');
    for (const k of Object.keys(localStorage)) expect(k.startsWith('aidjobs.')).toBe(true);
  });
});

describe('employer demo: the conversation', () => {
  it('builds the job description at once, suggests a spelling, accepts any place, and asks each question only until it is answered', () => {
    let id = '';
    act(() => {
      id = startJob('hiring education speclist');
    });
    const job = () => getState().jobs.find((j) => j.id === id)!;
    expect(job().sections.length).toBeGreaterThan(2);
    expect(job().chat.some((m) => m.text.includes('Did you mean **Education Specialist**?'))).toBe(true);
    expect(job().chat.at(-1)?.ask).toBe('place');
    act(() => sendChat(id, 'health professional with 10 years of experience in kashmir, india. field job'));
    expect(job().facts.location).toBe('Kashmir, India');
    expect(job().chat.at(-1)?.ask).toBe('deadline');
    act(() => answerFact(id, { deadline: '2026-11-30' }, '30 November 2026'));
    expect(job().chat.at(-1)?.ask).toBe('contract');
    act(() => sendChat(id, 'Use "Education Specialist"'));
    expect(job().facts.title).toBe('Education Specialist');
    expect(job().chat.at(-1)?.ask).toBe('contract');
    expect(JSON.stringify(job().sections)).not.toContain('[Closing date]');
  });

  it('asks again when it cannot read an answer, and never pastes the answer into the job description', () => {
    let id = '';
    act(() => {
      id = startJob('Hiring a Shelter Officer in Lilongwe');
    });
    const job = () => getState().jobs.find((j) => j.id === id)!;
    expect(job().chat.at(-1)?.ask).toBe('deadline');
    const text = JSON.stringify(job().sections);
    act(() => sendChat(id, 'sometime soon'));
    expect(job().chat.at(-1)?.ask).toBe('deadline');
    expect(job().chat.at(-1)?.text).toContain("couldn't read that");
    expect(JSON.stringify(job().sections)).toBe(text);
    act(() => sendChat(id, '30/11/2026'));
    expect(job().facts.deadline).toBe('2026-11-30');
    act(() => sendChat(id, 'staff'));
    expect(job().facts.contract).toBe('Fixed-term');
  });

  it('asks for a missing title, and builds the job description once it is given', () => {
    let id = '';
    act(() => {
      id = startJob('we need someone soon');
    });
    const job = () => getState().jobs.find((j) => j.id === id)!;
    expect(job().sections).toHaveLength(0);
    expect(job().chat.at(-1)?.ask).toBe('title');
    act(() => sendChat(id, 'Cook'));
    expect(job().facts.title).toBe('Cook');
    expect(job().sections.length).toBeGreaterThan(2);
    let other = '';
    act(() => {
      other = startJob('we need someone soon');
      setFacts(other, { title: 'Driver' });
    });
    expect(getState().jobs.find((j) => j.id === other)?.sections.length).toBeGreaterThan(2);
  });

  it('undo after a change in the chat puts the facts back too, and placeholders count as open checks', () => {
    let id = '';
    act(() => {
      id = startJob('Hiring a Finance Officer, closing 30 November 2026, fixed-term');
    });
    const job = () => getState().jobs.find((j) => j.id === id)!;
    expect(quality(job().sections, job().facts, getState().today, []).some((q) => q.key.startsWith('missing-'))).toBe(true);
    act(() => sendChat(id, 'it is based in Juba'));
    act(() => sendChat(id, 'the closing date is 14 December 2026'));
    expect(job().facts.deadline).toBe('2026-12-14');
    expect(job().lastChange?.beforeFacts.deadline).toBe('2026-11-30');
    act(() => undoLastChange(id));
    expect(job().facts.deadline).toBe('2026-11-30');
    expect(JSON.stringify(job().sections)).toContain('30 November 2026');
  });

  it('counts a free job description the first time it is used, not when it is written', () => {
    const before = getState().draftsUsed;
    let id = '';
    act(() => {
      id = startJob('Hiring a Logistics Officer in Goma, closing in 3 weeks');
    });
    expect(getState().draftsUsed).toBe(before);
    act(() => sendForReview(id, [{ name: 'Amina Yusuf', email: 'amina@riverstone.example.org', outside: false }], '2026-11-20', 'any', ''));
    expect(getState().draftsUsed).toBe(before + 1);
  });
});

describe('employer demo: phase 4 helpers', () => {
  it('offers the facts of a similar past job, labelled, and phrases picks for the first message', () => {
    act(() => resetDemo());
    const s = getState();
    const memory = memoryPick(s, { id: '', family: 'logistics', facts: { ...emptyFacts(), title: 'Logistics Officer' } });
    expect(memory?.label).toMatch(/^Same as your last /);
    expect(memory?.text).toMatch(/^, in /);
    expect(memory?.text).not.toContain('closing');
    expect(pickPhrase('contract', { label: 'Temporary (under a year)', why: '', patch: {} })).toBe(', temporary contract');
    expect(pickPhrase('deadline', { label: '25 November 2026', why: '', patch: {} })).toBe(', closing 25 November 2026');
    expect(pickPhrase('place', { label: 'Juba', why: '', patch: { location: 'Juba, South Sudan' } })).toBe(' in Juba, South Sudan');
  });

  it('offers a shared pattern of headings as the base JD format, respects Not now, and can forget the base', () => {
    act(() => resetDemo());
    const pattern = basePattern(getState());
    expect(pattern?.count).toBe(3);
    expect(pattern?.order.map((o) => o.key)).toContain('assessment');
    act(() => notNowBase(pattern!.sig));
    expect(getState().baseDismissed).toBe(pattern!.sig);
    act(() => setBaseFormat(pattern!.order, 'from your own job descriptions'));
    expect(basePattern(getState())).toBeNull();
    expect(getState().formats.find((f) => f.key === 'house')?.order.map((o) => o.heading)).toEqual(pattern!.order.map((o) => o.heading));
    act(() => forgetBase());
    expect(getState().formats.some((f) => f.key === 'house')).toBe(false);
    expect(getState().jobs.some((j) => j.format === 'house')).toBe(false);
  });

  it('does not ask again straight after Forget, even without Not now', () => {
    act(() => resetDemo());
    expect(basePattern(getState())).not.toBeNull();
    act(() => forgetBase());
    const pattern = basePattern(getState());
    expect(getState().baseDismissed).toBe(pattern?.sig);
  });
});

describe('employer demo: asking the chat to act', () => {
  it('a place narrows "all" to the jobs there; "all" alone means every live job', () => {
    const live = getState().jobs.filter((j) => j.status === 'live');
    const kampala = readIntent('extend all Kampala jobs by a week');
    expect(kampala?.jobIds).toEqual(live.filter((j) => j.facts.location.startsWith('Kampala')).map((j) => j.id));
    expect(kampala?.days).toBe(7);
    expect(readIntent('extend all jobs by 2 weeks')?.jobIds.length).toBe(live.length);
    expect(readIntent('close the Lusaka jobs')).toBeNull();
  });
});

describe('employer demo: source has no network path', () => {
  it('no demo file calls fetch, an AidJobs API path, or a request library', () => {
    const dir = join(__dirname, '..', '..', 'components', 'employer-demo');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect({ f, fetch: /\bfetch\s*\(/.test(src) }).toEqual({ f, fetch: false });
      expect({ f, api: /['"`]\/api\//.test(src) }).toEqual({ f, api: false });
      expect({ f, lib: /from ['"](axios|swr|@tanstack)/.test(src) }).toEqual({ f, lib: false });
      expect({ f, data: /lib\/site\/loadJobs|lib\/shortlist|PublicSite/.test(src) }).toEqual({ f, data: false });
    }
  });

  it('the page fixes "do not index" in its own layout', () => {
    const layout = readFileSync(join(__dirname, '..', 'employer-demo', 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
    expect(layout).not.toMatch(/SITE_INDEXABLE/);
  });
});
