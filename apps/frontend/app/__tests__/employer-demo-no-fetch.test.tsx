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
import { addTranslation, formatOf, reorderSections, reviewerDecision, setReachPlan, toggleSection } from '@/components/employer-demo/actions';
import { planFor } from '@/components/employer-demo/invites';
import { answerFact, basePattern, forgetBase, notNowBase, setBaseFormat, importJobDescription, publish, readIntent, sendChat, sendForReview, setFacts, startJob, undoLastChange } from '@/components/employer-demo/actions';
import DemoRecovery from '@/components/employer-demo/Recover';
import { currentMonth } from '@/components/employer-demo/plans';
import { getState, go, goBack, resetDemo, STORAGE_KEY, update } from '@/components/employer-demo/store';
import SiteRoot from '@/components/site/SiteRoot';
import { AI_ROUTE, resetAi } from '@/components/employer-demo/ai';

const network: string[] = [];
let container: HTMLDivElement;
let root: Root;
let phone = false;

/** The demo's own AI route is the one address allowed; it answers as the stand-in says (by default, that the AI is off). */
type Answer = { status: number; body: unknown };
let aiRoute: (method: string, body: string) => Answer | Promise<Answer> = (method) => (method === 'GET' ? { status: 200, body: { ai: false } } : { status: 503, body: { error: 'off' } });
const aiCalls: Array<{ method: string; body: string }> = [];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  const deny = (what: string) => () => {
    network.push(what);
    throw new Error(`The employer demo must not use the network: ${what}`);
  };
  const fetchStub = async (url: unknown, init?: { method?: string; body?: unknown }) => {
    if (url !== AI_ROUTE) return deny(`fetch ${String(url)}`)();
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : '';
    aiCalls.push({ method, body });
    const a = await aiRoute(method, body);
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
  };
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: jest.fn(fetchStub) });
  Object.defineProperty(window.XMLHttpRequest.prototype, 'open', { configurable: true, value: deny('XMLHttpRequest') });
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: deny('sendBeacon') });
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: deny('WebSocket') });
  Object.defineProperty(globalThis, 'EventSource', { configurable: true, value: deny('EventSource') });
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
      shows('Approved · ready to publish');
      shows('Key areas of accountability');
      route('#create/job-cps');
      expect(container.textContent?.toLowerCase()).toContain('our commitments');
      route('#job/job-fin');
      if (p) click('Job');
      else expect(container.querySelector('nav[aria-label="Parts of this job"]')).not.toBeNull();
      shows('Key areas of accountability');
      route('#styles');
      shows('UN Secretariat format');
      shows('Local NGO concise');
      route('#team');
      shows('Approval before publishing');
      route('#org');
      shows('Brand style');
      route('#public');
      shows('Actively hiring · promoted by employers');
      route('#billing');
      shows('Refund policy');
      shows('free jobs left in');
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
    shows('1 of 2 free jobs left in');
    for (const v of ['In Google', 'When shared', 'Job page']) click(v);
    click('Publish free');
    shows('Free jobs: the terms');
    click('I understand · Publish free');
    shows('Live on AidJobs');
    expect(getState().jobs.find((j) => j.id === id)).toMatchObject({ status: 'live', plan: 'free' });
    expect(getState().org.freeTermsAccepted).toBe(true);

    let paidId = '';
    act(() => {
      paidId = startJob('Hiring a Shelter Officer in Goma, closing in 4 weeks, fixed-term');
    });
    route(`#publish/${paidId}`);
    shows('Both free jobs for');
    shows('create and publish it free then, or Amplify to publish it now');
    expect(container.textContent).not.toContain('Schedule free for');
    click('Amplify and publish · US$28.40');
    click('Simulate a declined card');
    shows('The card was declined');
    expect(getState().jobs.find((j) => j.id === paidId)?.status).toBe('draft');
    click('Try again');
    click('Pay US$28.40');
    shows('Live on AidJobs');
    expect(getState().jobs.find((j) => j.id === paidId)?.plan).toBe('amplify');
    expect(getState().receipts[0]?.item).toBe('Amplify: Shelter Officer');

    route(`#jobs/${id}`);
    click('Amplify this job');
    route(window.location.hash);
    shows('Amplify a live free job');
    click('Amplify this job · US$28.40');
    click('Pay US$28.40');
    expect(getState().jobs.find((j) => j.id === id)?.plan).toBe('amplify');
    expect(getState().freeUses.some((u) => u.jobId === id)).toBe(true);

    act(() => {
      const id2 = startJob('Hiring a Finance Officer in Kampala, closing in 4 weeks');
      const j2 = getState().jobs.find((j) => j.id === id2)!;
      setReachPlan(id2, { ...planFor(j2, getState().org), candidates: ['a@example.org'] });
      publish(id2, { plan: 'amplify', paid: 'direct', schedule: null });
      jest.advanceTimersByTime(5000);
      go('jobs', id2);
    });
    route(window.location.hash);
    shows('Invitations: 1 sent');

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
    act(() => (container.querySelector('[aria-label="More actions for this job draft"], [aria-label="More actions for this job"]') as HTMLElement).click());
    click('Delete');
    shows('Recently deleted for 14 days');
    click('Delete');
    expect(getState().jobs.some((j) => j.id === imported)).toBe(false);
    expect(getState().deleted?.some((d) => d.job.id === imported)).toBe(true);

    expect(network).toEqual([]);
    expect(document.querySelector('script[src*="paddle"]')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"v":4');
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

  it('counts a free job the first time it is used, not when it is written', () => {
    act(() => resetDemo());
    const before = getState().freeUses.length;
    let id = '';
    act(() => {
      id = startJob('Hiring a Logistics Officer in Goma, closing in 3 weeks');
    });
    expect(getState().freeUses.length).toBe(before);
    act(() => sendForReview(id, [{ name: 'Amina Yusuf', email: 'amina@riverstone.example.org', outside: false }], '2026-11-20', 'any', ''));
    expect(getState().freeUses.length).toBe(before + 1);
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
    expect(pattern?.count).toBe(4);
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

describe('employer demo: outline and job description read in the same order', () => {
  it('after adding and moving sections, the job description follows the outline exactly', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#create/job-comms');
    const outlineBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('JD outline'));
    if (!container.querySelector('[aria-label="JD outline"] .ej-drag-row')) act(() => (outlineBtn as HTMLElement)?.click());
    act(() => {
      toggleSection('job-comms', 'deliverables');
      toggleSection('job-comms', 'team');
      toggleSection('job-comms', 'assessment');
    });
    const job = () => getState().jobs.find((j) => j.id === 'job-comms')!;
    const inGroup = job().tags.filter((k) => ['purpose', 'responsibilities', 'deliverables', 'relationships', 'learning', 'deployment', 'firstweeks'].includes(k));
    act(() => reorderSections('job-comms', [inGroup[inGroup.length - 1], ...inGroup.slice(0, -1)]));
    const outline = Array.from(container.querySelectorAll('[aria-label="JD outline"] .ej-drag-row')).map((r) => r.textContent?.trim());
    const doc = Array.from(container.querySelectorAll('.ej-doc section[aria-label]')).map((s) => s.getAttribute('aria-label')).filter((t) => t !== 'Commitments');
    expect(outline.length).toBeGreaterThan(5);
    expect(doc).toEqual(outline);
    expect(job().sections.map((x) => x.key)).toEqual(job().tags);
  });
});

describe('employer demo: before you publish', () => {
  it('opens the market check, reviews a French version, and prints the field-post notice, without the network', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#publish/job-fin');
    shows('Before you publish');
    shows('With Amplify');
    click('Choose Amplify');
    click(/^How does your job compare\?/);
    shows('Sample figures in the demo');
    click(/^See the \d+ similar jobs$/);
    expect(container.querySelector('[aria-label="Similar open jobs (sample)"]')?.children.length).toBeGreaterThan(4);
    click(/^Language versions/);
    click('Add French');
    expect(getState().jobs.find((j) => j.id === 'job-fin')?.translations?.fr?.reviewed).toBe(false);
    click('Review');
    shows('French version');
    click('Mark as reviewed');
    expect(getState().jobs.find((j) => j.id === 'job-fin')?.translations?.fr?.reviewed).toBe(true);
    click('Job page');
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Job page');
    expect(container.textContent).not.toContain('Field-post notice');
    click(/^Français/);
    shows('Clôture le');
    expect(container.querySelector('article[lang="fr"]')).not.toBeNull();
    click('Before you publish');
    click(/^Field-post notice/);
    click('Open the notice');
    expect(container.querySelector('svg[aria-label^="QR code for https://aidjobs.app/jobs/finance-officer"]')).not.toBeNull();
    click('Français');
    shows('Nous recrutons');
    const print = jest.fn();
    Object.defineProperty(window, 'print', { configurable: true, value: print });
    click('Print');
    expect(print).toHaveBeenCalled();
    expect(network).toEqual([]);
  });
});

describe('employer demo: Reach', () => {
  it('prepares invitations on the publish page, states them on the button, and offers to invite more on the job page', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#home');
    route('#publish/job-fin');
    click('Choose Amplify');
    click(/^Reach: invite people when it goes live/);
    shows('View Job & Apply');
    shows('AidJobs wrote the first draft');
    click(/^Your team/);
    click(/Add your team \(3\)/);
    click(/^Save · 3 people/);
    expect(getState().jobs.find((j) => j.id === 'job-fin')?.reachPlan?.team).toHaveLength(3);
    shows('Amplify and publish · invite 3 people when live · US$28.40');
    route('#jobs/job-cps');
    shows('A last round of invitations for Child Protection Specialist?');
    shows('Reminders to invite more: on');
    click('Invite more');
    shows('Invite more people');
    click('Cancel');
    click('Not now');
    expect(getState().jobs.find((j) => j.id === 'job-cps')?.reachDismissed).toContain('closing');
    route('#jobs/job-meal');
    shows('Amplify to invite people directly');
    act(() => (container.querySelector('[aria-label="Actions for MEAL Coordinator"]') as HTMLElement).click());
    click('Share');
    shows('WhatsApp, LinkedIn');
    expect(network).toEqual([]);
  });
});

describe('employer demo: review panel and Ask to pay', () => {
  it('reviews in the right-hand panel as author and reviewer, then has someone else pay', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#home');
    route('#create/job-fin');
    click(/^\d*\s*Review\s*\d*$/);
    shows('Comments and suggestions · 1 open');
    shows('Round 1 · one approval is enough');
    click('Accept');
    expect(getState().jobs.find((j) => j.id === 'job-fin')?.review.remarks[0].state).toBe('accepted');
    act(() => update((st) => ({ ...st, reviewerAs: 'daniel' })));
    shows('Reviewing as Daniel Mwangi');
    shows('Add a comment');
    click(/^\s*Approve$/);
    expect(getState().jobs.find((j) => j.id === 'job-fin')?.review.reviewers.find((r) => r.name === 'Daniel Mwangi')?.decision).toBe('approved');
    act(() => update((st) => ({ ...st, reviewerAs: null })));
    route('#publish/job-fin');
    act(() => (Array.from(container.querySelectorAll('button[role="radio"]')).find((b) => b.textContent?.startsWith('Amplify')) as HTMLElement).click());
    click('Ask someone else to pay');
    click('Grace Akello');
    shows('Sam Otieno asks you to pay US$28.40 to publish Finance Officer – Juba');
    click('Send the request');
    shows('Waiting for Grace Akello to pay US$28.40');
    click('See their payment page (demo)');
    click('Pay US$28.40');
    shows('Live on AidJobs');
    expect(getState().jobs.find((j) => j.id === 'job-fin')).toMatchObject({ status: 'live', plan: 'amplify' });
    expect(network).toEqual([]);
  });
});

describe('employer demo: approved, then a request for changes', () => {
  it('shows the situation on the publish page and asks before publishing anyway', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true, reviewerAs: 'daniel' }));
      reviewerDecision('job-fin', 'changes', 'One more thing');
      update((st) => ({ ...st, reviewerAs: null }));
    });
    phone = false;
    render();
    route('#home');
    route('#publish/job-fin');
    shows('Approved, with a request for changes');
    shows('Amina approved this version. Daniel then asked for changes: “One more thing”.');
    click('Publish free');
    shows('Publish anyway?');
    const confirm = Array.from(container.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent?.trim() === 'Publish anyway') as HTMLElement;
    act(() => confirm.click());
    shows('Free jobs: the terms');
    click('I understand · Publish free');
    shows('Live on AidJobs');
    expect(getState().jobs.find((j) => j.id === 'job-fin')?.audit.some((a) => a.what.startsWith("Published with Daniel's request for changes still open"))).toBe(true);
  });
});

describe('employer demo: managing jobs', () => {
  const type = (el: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const menu = (title: string) => act(() => (container.querySelector(`[aria-label="Actions for ${title}"]`) as HTMLElement).click());

  it('groups and searches the list, withdraws and deletes from a card menu, and restores from Recently deleted', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#home');
    route('#jobs');
    const tabs = () => Array.from(container.querySelectorAll('header nav[aria-label="Show"] button')).map((b) => b.textContent?.replace(/\s*\d+$/, '').trim());
    expect(tabs()[0]).toBe('All');
    expect(tabs()).toContain('Needs you');
    expect(tabs()).toContain('History');
    const rows = () => Array.from(container.querySelectorAll('.ej-joblist .ej-jobrow-main')).map((b) => b.querySelector('.truncate')?.textContent);
    expect(rows()).toHaveLength(getState().jobs.length);
    expect(rows()[0]).toBe('Finance Officer');
    expect(rows().at(-1)).toBe('WASH Programme Manager');
    const pick = (label: string) => act(() => (Array.from(container.querySelectorAll('header nav[aria-label="Show"] button')).find((b) => b.textContent?.startsWith(label)) as HTMLElement).click());
    pick('Needs you');
    expect(rows()).toContain('Child Protection Specialist');
    expect(rows()).not.toContain('MEAL Coordinator');
    pick('All');

    expect(container.querySelector('input[aria-label="Search jobs"]')).toBeNull();
    act(() => (container.querySelector('header button[aria-label="Search jobs"]') as HTMLElement).click());
    const search = container.querySelector('header input[aria-label="Search jobs"]') as HTMLInputElement;
    expect(container.querySelector('header nav[aria-label="Show"]')).toBeNull();
    type(search, 'kampala');
    shows('Child Protection Specialist');
    expect(container.textContent).not.toContain('MEAL Coordinator');
    type(search, 'nothing like this');
    shows('No job matches');
    act(() => search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('input[aria-label="Search jobs"]')).toBeNull();
    expect(container.querySelector('header nav[aria-label="Show"]')).not.toBeNull();
    shows('MEAL Coordinator');

    menu('MEAL Coordinator');
    click('Withdraw');
    shows('Withdraw this vacancy?');
    click('Withdraw');
    expect(getState().jobs.find((j) => j.id === 'job-meal')?.closeReason).toBe('withdrawn');

    menu('Communications Intern');
    click('Delete');
    shows('Delete “Communications Intern”?');
    click('Delete');
    expect(getState().jobs.some((j) => j.id === 'job-comms')).toBe(false);

    menu('Logistics Assistant');
    click('Delete');
    const confirm = () => Array.from(container.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent?.trim() === 'Delete') as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    type(container.querySelector('[role="dialog"] input:not([type])') as HTMLInputElement, 'Logistics Assistant');
    expect(confirm().disabled).toBe(false);
    act(() => confirm().click());
    expect(getState().gone).toContain('job-log');

    click(/Recently deleted/);
    expect(window.location.hash).toBe('#jobs/deleted');
    route('#jobs/deleted');
    shows('Activity log');
    shows('Communications Intern');
    const restore = Array.from(container.querySelectorAll('li button')).find((b) => b.textContent?.trim() === 'Restore' && b.closest('li')?.textContent?.includes('Communications Intern')) as HTMLElement;
    act(() => restore.click());
    expect(getState().jobs.some((j) => j.id === 'job-comms')).toBe(true);

    route('#public/job-log');
    shows('This vacancy is no longer available');
    expect(network).toEqual([]);
  });

  it('scheduled jobs, the listing end, and telling invited people, from the menu and the job page', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
      publish('job-fin', { plan: 'amplify', schedule: new Date(getState().today + 3 * 86_400_000).toISOString().slice(0, 10), paid: 'direct' });
    });
    phone = false;
    render();
    route('#home');
    shows('Livelihoods Officer: its free listing ends in 5 days');
    route('#jobs');
    act(() => (Array.from(container.querySelectorAll('header nav[aria-label="Show"] button')).find((b) => b.textContent?.startsWith('Scheduled')) as HTMLElement).click());
    expect(container.querySelector('.ej-joblist')?.textContent).toContain('Publish now');
    menu('Finance Officer');
    click('Change the date');
    shows('Change the publishing date');
    click('Cancel');
    menu('Finance Officer');
    click('Back to draft');
    shows('It stays paid for: publishing it again costs nothing.');
    click('Back to a draft');
    expect(getState().jobs.find((j) => j.id === 'job-fin')?.status).toBe('approved');

    route('#jobs/job-liv');
    shows('Its free listing ends in 5 days');
    click('Let it leave the list');
    expect(getState().jobs.find((j) => j.id === 'job-liv')?.listingChoice).toBe('leave');

    route('#jobs/job-cps');
    click('Extend');
    click(/^Extend to/);
    shows('Changed since publishing');
    click('Tell the 5 people Reach invited');
    shows('Update: Child Protection Specialist');
    click('Send to 5 people');
    expect(getState().jobs.find((j) => j.id === 'job-cps')?.reach?.updates?.[0].count).toBe(5);

    act(() => update((st) => ({ ...st, today: st.today + 6 * 86_400_000 })));
    route('#public');
    expect(container.textContent).not.toContain('Livelihoods Officer');
    route('#public/job-liv');
    shows('No longer listed on AidJobs');
    expect(network).toEqual([]);
  });

  it('a free job given a date next month shows the notice and offers Amplify', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#home');
    route('#publish/job-comms');
    click('Schedule');
    const [y, m] = currentMonth(getState()).split('-').map(Number);
    const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-02`;
    type(container.querySelector('input[aria-label="Publish on"]') as HTMLInputElement, next);
    shows('A free job goes live in its own month');
    expect((Array.from(container.querySelectorAll('button')).find((b) => /^A free job goes live within/.test(b.textContent?.trim() ?? '')) as HTMLButtonElement).disabled).toBe(true);
    click('Choose Amplify');
    expect(container.textContent).not.toContain('A free job goes live in its own month');
    expect(network).toEqual([]);
  });

  it('links job addresses, reports a job, shows the legal line, and opens similar jobs from a closed page', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#home');
    shows('AidJobs. All rights reserved.');
    click('Terms');
    shows('A placeholder in the demo');
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    route('#jobs/job-cps');
    const link = container.querySelector('a[href^="https://aidjobs.app/jobs/child-protection-specialist"]') as HTMLAnchorElement;
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(container.querySelector('button[aria-label="Copy the link"]')).not.toBeNull();
    expect(container.querySelector('[class~="lg:sticky"]')?.textContent).toContain('Child Protection Specialist');

    click(/Report this job/);
    shows('Why are you reporting it?');
    const send = () => Array.from(container.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent?.trim() === 'Send the report') as HTMLButtonElement;
    expect(send().disabled).toBe(true);
    click('It is not a real job');
    expect(send().disabled).toBe(false);
    act(() => send().click());
    expect(getState().notice?.text).toMatch(/^Thank you\. AidJobs reviews every report/);

    route('#jobs/job-health');
    shows('Similar open jobs near Goma');
    click(/Protection Monitoring Assistant/);
    expect(window.location.hash).toBe('#public/p3');
    expect(network).toEqual([]);
  });

  it('Esc closes only the top dialog (the checkout inside Reopen), and closing search on a phone returns focus to its icon', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true, jobs: st.jobs.map((j) => (j.id === 'job-liv' ? { ...j, status: 'closed', closedAt: st.today - 2 * 86_400_000, closeReason: 'early', publishedAt: st.today - 70 * 86_400_000 } : j)) }));
    });
    phone = false;
    render();
    route('#home');
    route('#jobs/job-liv');
    click('Reopen');
    click(/^Reopen with Amplify/);
    shows('Simulated · no card is charged');
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(container.textContent).not.toContain('Simulated · no card is charged');
    shows('Reopen this job?');
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(container.textContent).not.toContain('Reopen this job?');

    phone = true;
    render();
    route('#home');
    route('#jobs');
    act(() => (container.querySelector('header button[aria-label="Search jobs"]') as HTMLElement).click());
    act(() => (container.querySelector('button[aria-label="Close the search"]') as HTMLElement).click());
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Search jobs');
    phone = false;
  });

  it('from writing to publishing: Back returns where you came from, Next leads to Check and publish, with review and a summary', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#home');
    route('#jobs');
    const openRow = (title: string) => act(() => (Array.from(container.querySelectorAll('.ej-jobrow-main')).find((b) => b.textContent?.includes(title)) as HTMLElement).click());
    openRow('Finance Officer');
    expect(window.location.hash).toBe('#create/job-fin');
    route('#create/job-fin');
    shows('Next: check and publish');
    expect(container.querySelector('section[aria-label="Next step"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Steps to publish"] [aria-current="step"]')?.textContent).toContain('Write');

    click(/^Next: check and publish/);
    route('#publish/job-fin');
    shows('Check and publish');
    expect(container.querySelector('[aria-label="Steps to publish"] [aria-current="step"]')?.textContent).toContain('Check');
    expect(container.querySelector('#ej-row-review')).not.toBeNull();
    const scroll = jest.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scroll });
    const summary = container.querySelector('[aria-label="Where the job stands"]') as HTMLElement;
    act(() => (Array.from(summary.querySelectorAll('button')).find((b) => /^approved$|review/.test(b.textContent ?? '')) as HTMLElement).click());
    expect(container.querySelector('#ej-row-review')?.getAttribute('aria-expanded')).toBe('true');
    act(() => (container.querySelector('#ej-row-languages') as HTMLElement).click());
    act(() => jest.runOnlyPendingTimers());
    expect(container.querySelector('#ej-row-languages')?.getAttribute('aria-expanded')).toBe('true');

    act(() => (container.querySelector('button[aria-label="Back"]') as HTMLElement).click());
    expect(window.location.hash).toBe('#create/job-fin');
    route('#create/job-fin');
    act(() => (container.querySelector('button[aria-label="Back"]') as HTMLElement).click());
    expect(window.location.hash).toBe('#jobs');
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('the steps are the way between writing and publishing; the previews are tabs beside the checks', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#home');
    route('#create/job-comms');
    const steps = () => container.querySelector('[aria-label="Steps to publish"]') as HTMLElement;
    const step = (label: string) => Array.from(steps().querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLElement | undefined;
    expect(Array.from(container.querySelectorAll('.ej-soft-btn')).some((b) => b.textContent?.startsWith('Next'))).toBe(false);
    expect(step('Write')).toBeUndefined();
    const badge = step('Check')?.querySelector('.ej-count-badge')?.textContent ?? '';
    expect(badge).toMatch(/^\d+ to look at$/);
    act(() => step('Check')!.click());
    expect(window.location.hash).toBe('#publish/job-comms');
    route('#publish/job-comms');
    expect(container.querySelector('[aria-label="Where the job stands"]')?.textContent).toContain(`${parseInt(badge, 10)} checks to look at`);
    const scroll = jest.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scroll });
    const tabs = () => Array.from(container.querySelectorAll('[role="tablist"] [role="tab"]')).map((t) => t.textContent);
    expect(tabs()).toEqual(['Before you publish', 'Job page', 'In Google', 'When shared']);
    click('In Google');
    expect(container.querySelector('[aria-label="Google result preview"]')).not.toBeNull();
    expect(container.querySelector('#ej-row-advert')).toBeNull();
    const summary = container.querySelector('[aria-label="Where the job stands"]') as HTMLElement;
    act(() => (summary.querySelector('button') as HTMLElement).click());
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Before you publish');
    expect(container.querySelector('#ej-row-advert')?.getAttribute('aria-expanded')).toBe('true');
    scroll.mockClear();
    act(() => step('Publish')!.click());
    expect(scroll.mock.instances[0]).toBe(document.getElementById('ej-publish-panel'));
    expect(document.activeElement?.classList.contains('ej-main-cta')).toBe(true);
    click('Job page');
    act(() => step('Check')!.click());
    act(() => jest.runOnlyPendingTimers());
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Before you publish');
    const tablist = container.querySelector('[role="tablist"]') as HTMLElement;
    const key = (k: string) => act(() => tablist.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
    key('ArrowRight');
    expect(document.activeElement?.textContent).toBe('Job page');
    key('End');
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('When shared');
    key('Home');
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Before you publish');
    act(() => step('Write')!.click());
    expect(window.location.hash).toBe('#create/job-comms');
    route('#create/job-comms');
    scroll.mockClear();
    act(() => step('Publish')!.click());
    route('#publish/job-comms');
    expect(scroll.mock.instances).toContain(document.getElementById('ej-publish-panel'));
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    phone = true;
    render();
    route('#home');
    route('#publish/job-comms');
    expect(tabs()).toEqual(['Checks', 'Job page', 'Google', 'Shared']);
    phone = false;
  });

  it('the Check badge counts as the publish page does when Amplify is the plan, and the steps wait for a job description', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true, jobs: st.jobs.map((j) => (j.id === 'job-comms' ? { ...j, paidFor: true } : j)) }));
    });
    phone = false;
    render();
    route('#home');
    route('#create/job-comms');
    const badge = container.querySelector('[aria-label="Steps to publish"] .ej-count-badge')?.textContent ?? '';
    route('#publish/job-comms');
    expect(container.querySelector('[aria-label="Where the job stands"]')?.textContent).toContain(`${parseInt(badge, 10)} checks to look at`);
    act(() => update((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id === 'job-comms' ? { ...j, sections: [] } : j)) })));
    route('#create/job-comms');
    expect(container.querySelectorAll('[aria-label="Steps to publish"] button')).toHaveLength(0);
  });

  it('review has one place, the Review panel, which explains it before anything is sent', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#home');
    route('#create/job-comms');
    expect(container.querySelector('button[aria-label="Send for review"]')).toBeNull();
    act(() => (Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.replace(/\d/g, '').trim() === 'Review') as HTMLElement).click());
    shows('Review is optional.');
    shows('they cannot change the job');
    click(/Send for review$/);
    expect(Array.from(document.querySelectorAll('[role="dialog"]')).some((d) => d.textContent?.startsWith('Send for review'))).toBe(true);
    phone = true;
    render();
    route('#home');
    route('#create/job-comms');
    act(() => (container.querySelector('button[aria-label="More actions for this job draft"]') as HTMLElement).click());
    const items = Array.from(container.querySelectorAll('.ej-menu button')).map((b) => b.textContent?.trim());
    expect(items).toContain('JD outline');
    expect(items).not.toContain('Send for review');
    phone = false;
  });

  it('edits a language version in the workspace like the English, and marks it reviewed', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
      addTranslation('job-fin', 'fr');
      addTranslation('job-fin', 'ar');
    });
    phone = false;
    render();
    route('#home');
    route('#create/job-fin');
    const switcher = container.querySelector('[aria-label="Language of the job description"]') as HTMLElement;
    act(() => (Array.from(switcher.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Français')) as HTMLElement).click());
    shows('French version');
    shows('Edit facts and sections in English');
    const line = container.querySelector('article[lang="fr"] textarea') as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(line, 'Une ligne revue à la main');
      line.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(JSON.stringify(getState().jobs.find((j) => j.id === 'job-fin')?.translations?.fr?.sections)).toContain('Une ligne revue à la main');
    click('Mark as reviewed');
    expect(getState().jobs.find((j) => j.id === 'job-fin')?.translations?.fr?.reviewed).toBe(true);
    act(() => (Array.from(switcher.querySelectorAll('button')).find((b) => b.getAttribute('lang') === 'ar') as HTMLElement).click());
    expect(container.querySelector('article[lang="ar"]')?.getAttribute('dir')).toBe('rtl');
    expect(network).toEqual([]);
  });

  it('keeps list markers, marks lines still in English, keeps a line on one line, and shows reviewers the versions read-only', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
      addTranslation('job-fin', 'fr');
    });
    const fr = () => getState().jobs.find((j) => j.id === 'job-fin')!.translations!.fr!;
    const sec = fr().sections.find((x) => x.lines.some((l) => l.startsWith('- ')))!;
    const at = sec.lines.findIndex((l) => l.startsWith('- '));
    const english = getState().jobs.find((j) => j.id === 'job-fin')!.sections.find((x) => x.key === sec.key)!.lines[at];
    act(() => update((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id !== 'job-fin' ? j : { ...j, translations: { ...j.translations, fr: { ...fr(), sections: fr().sections.map((x) => (x.key !== sec.key ? x : { ...x, lines: x.lines.map((l, i) => (i === at ? english : l)) })) } } })) })));
    phone = false;
    render();
    route('#home');
    route('#create/job-fin');
    const pickFrench = () => act(() => (Array.from(container.querySelectorAll('[aria-label="Language of the job description"] button')).find((b) => b.textContent?.startsWith('Français')) as HTMLElement).click());
    pickFrench();
    const line = container.querySelector(`article[lang="fr"] textarea[aria-label="${sec.title}, line ${at + 1}"]`) as HTMLTextAreaElement;
    expect(line.value).toBe(english.slice(2));
    expect(line.closest('div.flex-col')?.textContent).toContain('English');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(line, 'Une ligne\nrevue');
      line.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(fr().sections.find((x) => x.key === sec.key)!.lines[at]).toBe('- Une ligne revue');

    act(() => update((st) => ({ ...st, reviewerAs: 'daniel' })));
    pickFrench();
    expect(Array.from(container.querySelectorAll('article[lang="fr"] textarea')).every((t) => (t as HTMLTextAreaElement).readOnly)).toBe(true);
    expect(container.textContent).not.toContain('Mark as reviewed');
    shows('Facts and sections follow the English');
    expect(network).toEqual([]);
  });

  it('Back skips screens that no longer apply, and falls back after a reload', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    act(() => {
      window.location.hash = '#jobs';
      go('create', 'job-fin');
      go('publish', 'job-fin');
      update((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id === 'job-fin' ? { ...j, status: 'live' as const } : j)) }));
      go('jobs', 'job-fin');
      goBack('jobs');
    });
    expect(window.location.hash).toBe('#create/job-fin');
    act(() => {
      go('jobs', 'job-comms');
      update((st) => ({ ...st, jobs: st.jobs.filter((j) => j.id !== 'job-fin') }));
      goBack('jobs');
    });
    expect(window.location.hash).toBe('#jobs');
    act(() => {
      go('create', 'job-comms');
      resetDemo();
      goBack('home');
    });
    expect(window.location.hash).toBe('#home');
  });

  it('on phones the outline sits in the More menu, leaving room for the title; Publish is the current step once nothing is left to check', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = true;
    render();
    route('#home');
    route('#create/job-fin');
    expect(container.querySelector('button[aria-label="JD outline"]')).toBeNull();
    act(() => (container.querySelector('button[aria-label="More actions for this job draft"]') as HTMLElement).click());
    click('JD outline');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('JD outline');
    phone = false;
    render();
    route('#home');
    route('#publish/job-fin');
    const step = () => container.querySelector('[aria-label="Steps to publish"] [aria-current="step"]')?.textContent;
    expect(step()).toContain('Check');
    act(() => update((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id !== 'job-fin' ? j : { ...j, sections: j.sections.map((sec) => (sec.key !== 'requirements' ? sec : { ...sec, lines: sec.lines.map((l, i) => (i === 3 ? '- A sound grasp of donor financial rules' : l)) })) })) })));
    expect(container.querySelector('[aria-label="Where the job stands"]')?.textContent).toContain('checks all clear');
    expect(step()).toContain('Publish');
  });

  it('with a side panel open, the job actions move to the facts menu and the status stays above the document', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#home');
    route('#create/job-comms');
    if (!container.querySelector('.ej-switch')) act(() => (container.querySelector('nav[aria-label="Panels"] button[aria-label="JD outline"]') as HTMLElement).click());
    const side = () => container.querySelector('.ej-switch')?.closest('aside') as HTMLElement;
    const menuItems = () => Array.from(container.querySelectorAll('.ej-menu button')).map((b) => b.textContent?.trim());
    const openFactsMenu = () => act(() => (container.querySelector('button[aria-label="More actions for this job"]') as HTMLElement).click());
    expect(side().textContent).not.toContain('Draft');
    expect(side().querySelector('[aria-label="Earlier versions"], [aria-label="More actions for this job draft"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Earlier versions"]')).toBeNull();
    expect(Array.from(container.querySelectorAll('span.aj-faint')).some((x) => x.textContent === 'Draft')).toBe(true);
    expect(side().querySelector('.ej-switch-count')?.textContent).toBe(`· ${getState().jobs.find((j) => j.id === 'job-comms')!.tags.length}`);
    openFactsMenu();
    expect(menuItems()).toEqual(['Earlier versions', 'Download a copy', 'Update our base JD format from this job', 'Delete']);
    click('Earlier versions');
    expect(Array.from(document.querySelectorAll('[role="dialog"]')).some((d) => d.textContent?.startsWith('Earlier versions'))).toBe(true);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    act(() => (container.querySelector('button[aria-label="Close this panel"]') as HTMLElement).click());
    expect(container.querySelector('button[aria-label="Earlier versions"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="More actions for this job draft"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="More actions for this job"]')).toBeNull();
    expect(Array.from(container.querySelectorAll('span.aj-faint')).some((x) => x.textContent === 'Draft')).toBe(true);

    act(() => (container.querySelector('nav[aria-label="Panels"] button[aria-label="JD outline"]') as HTMLElement).click());
    route('#create/job-cps');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Done')).toBe(true);
    openFactsMenu();
    expect(menuItems()).toEqual(['Earlier versions']);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    act(() => update((st) => ({ ...st, reviewerAs: 'daniel' })));
    route('#create/job-comms');
    openFactsMenu();
    expect(menuItems()).toEqual(['Earlier versions']);
    expect(network).toEqual([]);
  });

  it('a scheduled job in the workspace is done, not sent to Check and publish again', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true, jobs: st.jobs.map((j) => (j.id === 'job-fin' ? { ...j, status: 'scheduled' as const, scheduledFor: '2099-01-01' } : j)) }));
    });
    phone = false;
    render();
    route('#home');
    route('#create/job-fin');
    expect(container.textContent).not.toContain('Next: check and publish');
    expect(container.querySelector('[aria-label="Steps to publish"]')).toBeNull();
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Done')).toBe(true);
  });

  it("a job's page is in parts, with one main action and Now first", () => {
    phone = false;
    render();
    route('#home');
    route('#jobs/job-cps');
    const parts = Array.from(container.querySelectorAll('section.aj-card[aria-label]')).map((p) => p.getAttribute('aria-label'));
    expect(parts).toEqual(['Now', 'Job page', 'Reach', 'Improve', 'History']);
    shows('Closes');
    expect(Array.from(container.querySelectorAll('button.aj-ink-btn')).map((b) => b.textContent?.trim())).toContain('Extend');
    route('#jobs/job-meal');
    expect(Array.from(container.querySelectorAll('section.aj-card[aria-label]')).map((p) => p.getAttribute('aria-label'))).toEqual(['Now', 'Job page', 'Reach', 'History']);
    phone = true;
    render();
    route('#home');
    route('#jobs/job-cps');
    const toggles = Array.from(container.querySelectorAll('section.aj-card[aria-label] > button[aria-expanded]')).map((b) => b.getAttribute('aria-expanded'));
    expect(toggles).toEqual(['true', 'false', 'false', 'false', 'false']);
    phone = false;
  });

  it('improves a live amplified job, shows what candidates see once closed, and reopens within 14 days', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#home');
    route('#jobs/job-cps');
    click(/^\s*Language versions/);
    click('Add French');
    expect(getState().jobs.find((j) => j.id === 'job-cps')?.translations?.fr).toBeTruthy();

    route('#jobs/job-health');
    expect(container.querySelector('section[aria-label="What candidates see"]')?.textContent).toContain('Applications closed on');
    shows('Similar open jobs');
    click('Reopen');
    shows('Reopen this job?');
    shows('needs a contract decision before production');
    click('3 weeks from today');
    click(/^Reopen until/);
    const health = getState().jobs.find((j) => j.id === 'job-health');
    expect(health?.status).toBe('live');
    expect(health?.audit.at(-1)?.what).toMatch(/^Reopened, now closing/);

    route('#jobs/job-wash-2026');
    shows('its link now says');
    shows('Its description was dropped 90 days after closing');
    route('#jobs/job-log');
    expect(container.querySelector('section[aria-label="What candidates see"]')?.textContent).toContain('Applications closed on');
    expect(Array.from(container.querySelectorAll('button.aj-ink-btn')).map((b) => b.textContent?.trim())).toContain('Hire again');
    route('#public/job-wash-2026');
    shows('This vacancy is no longer available');
    expect(network).toEqual([]);
  });
});

describe('employer demo: creating a job in one window (round 7, phase 1)', () => {
  const fresh = () =>
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
  const write = (label: string, text: string, enter = true) => {
    const ta = container.querySelector(`textarea[aria-label="${label}"]`) as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(ta, text);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    if (enter) act(() => ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  };
  const say = (text: string) => write('Message AidJobs about this job', text);
  const line = () => container.querySelector('nav[aria-label="Parts of this job"]') as HTMLElement;
  const part = (label: string | RegExp) => {
    const find = () =>
      Array.from(document.querySelectorAll('nav[aria-label="Parts of this job"] button')).find((x) => {
        const t = x.querySelector('.ej-line-label')?.textContent ?? '';
        return typeof label === 'string' ? t === label : label.test(t);
      });
    const closed = document.querySelector('nav[aria-label="Parts of this job"] button[aria-expanded="false"]');
    if (!find() && closed) act(() => (closed as HTMLElement).click());
    const b = find();
    if (!b) throw new Error(`No part "${label}" on the line`);
    act(() => (b as HTMLElement).click());
  };
  const currentLabel = () => line().querySelector('[aria-current="step"] .ej-line-label')?.textContent;
  const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
  const byLabel = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLElement;

  it('Enter opens the window at once; the chat asks for the template first, the panel stays empty, and nothing is written until the template and the style are chosen', () => {
    fresh();
    phone = false;
    render();
    route('#create');
    write('Describe the role', "We're hiring a Nutrition Officer, 12-month fixed-term, closing 30 December 2026");
    route(window.location.hash);
    const id = window.location.hash.replace('#job/', '');
    expect(window.location.hash).toBe(`#job/${id}`);
    expect(job(id).facts.title).toBe('Nutrition Officer');
    expect(container.querySelector('[role="status"].ej-reading')?.textContent).toBe('Reading your role…');
    act(() => jest.advanceTimersByTime(1000));
    expect(container.textContent).not.toContain('Reading your role…');
    shows('First, the template.');
    expect(container.textContent).not.toContain('Where is the job based?');
    shows('Your job description appears here once the template is chosen.');
    expect(container.querySelector('article[aria-label="Job description"]')).toBeNull();
    const format = formatOf(getState(), job(id).format);
    expect(currentLabel()).toBe(format.label);
    expect(container.querySelector('.ej-w-head .ej-w-title')?.textContent).toBe('Nutrition Officer');
    expect(container.querySelector('.ej-w-head .ej-w-status')?.textContent).toMatch(/^Draft/);
    expect(container.querySelector('.ej-w-head nav[aria-label="Parts of this job"]')).not.toBeNull();
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector('.ej-line-mark')).toBeNull();
    click(`Use ${format.label}`);
    expect(job(id).setup).toBe('style');
    shows('How should it sound?');
    expect(container.querySelector('[aria-label$=": its sections"]')).not.toBeNull();
    click('Yes, write it that way');
    expect(job(id).setup).toBeUndefined();
    expect(container.querySelector('[aria-label="The job"] article[aria-label="Job description"]')).not.toBeNull();
    shows('Here is the first draft, written');
    shows('Where is the job based?');
    expect(currentLabel()).toBe('Details');
    shows('To add');
    click('Skip to the job description');
    act(() => jest.advanceTimersByTime(50));
    expect(document.activeElement?.id).toBe('ej-w-panel');
    expect(line().querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(network).toEqual([]);
  });

  it('the template panel: the job-type sentence, live headings in the job description panel, and Create your own', () => {
    fresh();
    let id = '';
    act(() => {
      id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    });
    phone = false;
    render();
    route(`#job/${id}`);
    click('Show me others');
    const panel = () => container.querySelector('section.ej-float') as HTMLElement;
    expect(panel().getAttribute('aria-label')).toBe('Choose a template');
    expect(container.querySelector('article[aria-label$=": its sections"]')).not.toBeNull();
    const un = getState().formats.find((f) => f.label.startsWith('UN Secretariat'))!;
    act(() => (Array.from(panel().querySelectorAll('.ej-template-card')).find((b) => b.textContent?.startsWith(un.label)) as HTMLElement).click());
    expect(container.querySelector(`article[aria-label="${un.label}: its sections"]`)).not.toBeNull();
    act(() => byLabel('Engagement: job. Change it').click());
    click('Consultancy');
    expect(job(id).facts.engagement).toBe('consultancy');
    shows('Consultancies list deliverables and a timeline');
    expect(job(id).sections).toEqual([]);
    act(() => (Array.from(panel().querySelectorAll('[role="tab"]')).find((t) => t.textContent === 'Create your own') as HTMLElement).click());
    const name = panel().querySelector('input[placeholder^="For example"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(name, 'Riverstone consultancies');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const firstHeading = panel().querySelector('.ej-heading-input') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(firstHeading, 'Who we are');
      firstHeading.dispatchEvent(new Event('input', { bubbles: true }));
    });
    shows('Who we are');
    act(() => (panel().querySelector('[aria-label^="Add "]') as HTMLElement).click());
    click('Use Riverstone consultancies');
    const made = getState().formats.find((f) => f.label === 'Riverstone consultancies')!;
    expect(made.order[0].heading).toBe('Who we are');
    expect(job(id).format).toBe(made.key);
    expect([...job(id).tags].sort()).toEqual(made.order.map((o) => o.key).sort());
    expect(job(id).setup).toBe('style');
    expect(container.querySelector('section.ej-float')).toBeNull();
    say('warm, and short sentences');
    expect(job(id).sections[0].title).toBe('Who we are');
    expect(job(id).style).toContain('Short sentences');
    part('Riverstone consultancies');
    expect(panel().getAttribute('aria-label')).toBe('Template: Riverstone consultancies');
    expect(panel().querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("This job's sections");
    act(() => byLabel('Close the template panel').click());
    expect(container.querySelector('section.ej-float')).toBeNull();
    expect(network).toEqual([]);
  });

  it('the line is the way around: a part opens in the panel and becomes the chat subject; what the chat changes comes into view', () => {
    fresh();
    let id = '';
    act(() => {
      id = startJob('Hiring a Shelter Officer in Goma, closing 30 December 2026, fixed-term');
    });
    phone = false;
    render();
    route(`#job/${id}`);
    const sections = job(id).sections;
    const [a, b] = sections.filter((x) => x.key !== 'apply' && x.key !== 'about').map((x) => x.key);
    const title = (k: string) => sections.find((x) => x.key === k)!.title;
    part(title(a));
    expect(job(id).part).toBe(`s:${a}`);
    expect(currentLabel()).toBe(title(a));
    expect(container.querySelector('.ej-subject')?.textContent).toBe(`About: ${title(a)}`);
    expect(container.querySelector(`#ej-sec-${a}`)?.getAttribute('data-current')).toBe('true');
    const otherBefore = JSON.stringify(job(id).sections.find((x) => x.key === b)?.lines);
    say('Travels to the camps twice a month');
    expect(job(id).sections.find((x) => x.key === a)?.lines.at(-1)).toBe('Travels to the camps twice a month.');
    expect(JSON.stringify(job(id).sections.find((x) => x.key === b)?.lines)).toBe(otherBefore);
    say(`${title(b)}: reports weekly to the area manager`);
    expect(job(id).part).toBe(`s:${b}`);
    expect(currentLabel()).toBe(title(b));
    expect(document.querySelector('.sr-only[aria-live="polite"]')?.textContent).toContain(`Updated in the job description: ${title(b)}`);
    route('#jobs');
    route(`#job/${id}`);
    expect(currentLabel()).toBe(title(b));
    const labels = Array.from(line().querySelectorAll('ol:not([aria-hidden]) .ej-line-label')).map((x) => x.textContent);
    expect(labels).toEqual([formatOf(getState(), job(id).format).label, ...job(id).tags.map((k) => title(k)), 'Details', 'Fixed text', 'Check', 'Publish']);
    expect(line().querySelector('button[aria-expanded]')).toBeNull();
  });

  it('every fact, the fixed text, How to apply, and the section order can be set from the line, without the chat', () => {
    fresh();
    let id = '';
    act(() => {
      id = startJob('Hiring a Shelter Officer in Goma, fixed-term');
    });
    phone = false;
    render();
    route(`#job/${id}`);
    act(() => (document.querySelector('.ej-slot') as HTMLElement).click());
    expect(job(id).part).toBe('details');
    expect(document.querySelector('[role="dialog"][aria-label="Closing date"]')).not.toBeNull();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    part('Details');
    act(() => byLabel('Add closing date').click());
    const date = document.querySelector('[role="dialog"][aria-label="Closing date"] input[type="date"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(date, '2026-12-30');
      date.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(job(id).facts.deadline).toBe('2026-12-30');
    expect(job(id).chat.at(-1)?.ask).toBe('deadline');
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    shows('You set the closing date by hand.');
    expect(job(id).chat.at(-1)?.ask).toBeUndefined();
    part('Fixed text');
    const before = job(id).commitments.length;
    act(() => (container.querySelector('#ej-part-card input[type="checkbox"]') as HTMLElement).click());
    expect(job(id).commitments.length).not.toBe(before);
    part(formatOf(getState(), job(id).format).label);
    const tags = job(id).tags;
    const list = Array.from(container.querySelectorAll('section.ej-float ul')).find((u) => u.querySelectorAll('.ej-drag-handle').length > 1);
    act(() => (list?.querySelector('.ej-drag-handle') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(job(id).tags).not.toEqual(tags);
    expect(job(id).sections.map((x) => x.key)).toEqual(job(id).tags);
    part(job(id).sections.find((x) => x.key === 'apply')!.title);
    click('By email');
    expect(job(id).apply.method).toBe('email');
    click('Hide');
    expect(container.querySelector('#ej-part-card')).toBeNull();
    part('Check');
    shows('For now, the market check, the full advert check, and language versions are on the Check and publish page.');
    part('Publish');
    click('Check and publish');
    expect(window.location.hash).toBe(`#publish/${id}`);
    route(window.location.hash);
    shows('Before you publish');
  });

  it('opens the preview and language versions as tabs; answers are buttons, disabled once answered; hand edits and requests that do not fit get a reply', () => {
    fresh();
    let id = '';
    act(() => {
      id = startJob('hiring education speclist in Kampala, closing 30 December 2026, fixed-term');
      addTranslation(id, 'fr');
    });
    phone = false;
    render();
    route(`#job/${id}`);
    const use = () => Array.from(container.querySelectorAll('[role="log"] button')).find((x) => x.textContent === 'Use "Education Specialist"') as HTMLButtonElement;
    expect(use().disabled).toBe(false);
    act(() => use().click());
    expect(job(id).facts.title).toBe('Education Specialist');
    expect(use().disabled).toBe(true);

    const tabs = () => Array.from(container.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
    expect(tabs()).toEqual(['Job description', 'Français']);
    say('show the preview');
    expect(tabs()).toEqual(['Job description', 'Français', 'Preview']);
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Preview');
    shows('The preview is open in the panel');
    click('In Google');
    expect(container.querySelector('[aria-label="Google result preview"]')).not.toBeNull();
    act(() => (container.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Français');
    shows('French version');
    act(() => (container.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Job description');

    const key = job(id).sections[1].key;
    act(() => byLabel(`Edit ${job(id).sections[1].title}`).click());
    const area = container.querySelector(`textarea[aria-label="${job(id).sections[1].title} text"]`) as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(area, 'Our own words for this section.');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click('Save');
    expect(job(id).part).toBe(`s:${key}`);
    shows('by hand');

    say('publish it');
    shows('For now, publishing is on the Check and publish page.');
    expect(job(id).status).toBe('draft');
    click('Earlier workspace');
    expect(window.location.hash).toBe(`#create/${id}`);
    route(window.location.hash);
    expect(container.querySelector('[aria-label="JD outline"], [aria-label="Panels"]')).not.toBeNull();
    route(`#job/${id}`);
    click('Open Check and publish');
    expect(window.location.hash).toBe(`#publish/${id}`);
  });

  it('on phones the chat fills the screen, the job is one tap away, and the line opens as a short list', () => {
    fresh();
    let id = '';
    act(() => {
      id = startJob('Hiring a Shelter Officer in Goma, closing 30 December 2026, fixed-term');
    });
    phone = true;
    render();
    route(`#job/${id}`);
    expect(container.querySelector('textarea[aria-label="Message AidJobs about this job"]')).not.toBeNull();
    expect(container.querySelector('article[aria-label="Job description"]')).toBeNull();
    say('make the responsibilities longer');
    const jobButton = Array.from(container.querySelectorAll('[aria-label="Show"] button')).find((b) => b.textContent?.startsWith('Job')) as HTMLElement;
    expect(jobButton.textContent).toContain('updated');
    click(/^Job/);
    expect(container.querySelector('article[aria-label="Job description"]')).not.toBeNull();
    expect(container.querySelector('textarea[aria-label="Message AidJobs about this job"]')).toBeNull();
    expect(container.querySelector('nav[aria-label="Parts of this job"]')).toBeNull();
    click(/done$/);
    expect(document.querySelectorAll('nav[aria-label="Parts of this job"] li').length).toBe(job(id).tags.length + 5);
    part('Details');
    expect(document.querySelector('nav[aria-label="Parts of this job"]')).toBeNull();
    expect(job(id).part).toBe('details');
    shows('Duty station');
    click('Chat');
    expect(container.querySelector('.ej-subject')?.textContent).toBe('About: Details');
    phone = false;
    expect(network).toEqual([]);
  });

  it('on phones the template is chosen in the job description itself: a slim question line, the headings, and a strip of cards', () => {
    fresh();
    let id = '';
    act(() => {
      id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    });
    phone = true;
    render();
    route(`#job/${id}`);
    shows('First, the template.');
    click('Create my own');
    expect(container.querySelector('button[aria-label="Open the chat"]')?.textContent).toContain("Let's build it");
    const cards = () => Array.from(container.querySelectorAll('[aria-label="Templates"] [role="radio"]'));
    expect(cards().at(-1)?.getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('.ej-heading-input')).not.toBeNull();
    const un = getState().formats.find((f) => f.label.startsWith('UN Secretariat'))!;
    act(() => (cards().find((c) => c.textContent?.startsWith(un.label)) as HTMLElement).click());
    expect(container.querySelector(`article[aria-label="${un.label}: its sections"]`)).not.toBeNull();
    click(`Use ${un.label}`);
    expect(job(id).format).toBe(un.key);
    expect(job(id).setup).toBe('style');
    expect(container.querySelector('textarea[aria-label="Message AidJobs about this job"]')).not.toBeNull();
    shows('How should it sound?');
    phone = false;
  });

  it('the chat and the job description share the width as dragged, and the message box grows or shrinks from its grip', () => {
    fresh();
    let id = '';
    act(() => {
      id = startJob('Hiring a Shelter Officer in Goma, closing 30 December 2026, fixed-term');
    });
    phone = false;
    render();
    route(`#job/${id}`);
    const split = byLabel('Resize the chat and the job description');
    const before = Number(split.getAttribute('aria-valuenow'));
    act(() => split.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(Number(byLabel('Resize the chat and the job description').getAttribute('aria-valuenow'))).toBe(before + 24);
    expect(localStorage.getItem('aidjobs.employerDemo.windowSplit')).toBe(String(before + 24));
    const grip = () => byLabel('Resize the message box');
    act(() => grip().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    act(() => grip().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    expect(Number(grip().getAttribute('aria-valuenow'))).toBe(92);
    expect((container.querySelector('textarea[aria-label="Message AidJobs about this job"]') as HTMLTextAreaElement).style.height).toBe('92px');
    act(() => grip().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(Number(grip().getAttribute('aria-valuenow'))).toBe(0);
  });

  it('SDGs: read from the role, shown in Details and on the job page, and corrected by hand', () => {
    fresh();
    let id = '';
    act(() => {
      id = startJob('Hiring a WASH Officer in Goma, closing 30 December 2026, fixed-term');
    });
    phone = false;
    render();
    route(`#job/${id}`);
    part('Details');
    shows('SDG 6 Clean water and sanitation · SDG 3 Good health and well-being');
    act(() => byLabel('Change the SDGs').click());
    click('SDG 3 · Good health and well-being');
    click('SDG 13 · Climate action');
    expect(job(id).sdgs).toEqual([6, 13]);
    click('Done');
    say('show the preview');
    expect(container.querySelector('[aria-label="Sustainable Development Goals"]')?.textContent).toBe('This role contributes toSDG 6 · Clean water and sanitationSDG 13 · Climate action');
  });

  it('SDGs when no goal is clear: none shown, the organisation\'s goals offered, and the job page says whose they are', () => {
    fresh();
    let id = '';
    act(() => {
      id = startJob('Hiring a Finance Officer in Juba, closing 30 December 2026, fixed-term');
    });
    phone = false;
    render();
    route(`#job/${id}`);
    part('Details');
    shows('No SDG is clear from this role');
    click("Use your organisation's goals (SDG 3, 6, 16)");
    expect(job(id)).toMatchObject({ sdgs: [3, 6, 16], sdgsFrom: 'org' });
    shows("(your organisation's goals)");
    say('show the preview');
    expect(container.querySelector('[aria-label="Sustainable Development Goals"]')?.textContent).toMatch(/^Riverstone Aid works towardsSDG 3 · /);
  });
});

describe('employer demo: recovery', () => {
  it('shows a way out instead of a blank page when something in the demo fails', () => {
    const Broken = () => {
      throw new Error('old saved data');
    };
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    act(() => {
      root.render(
        <SiteRoot fontClasses="">
          <DemoRecovery>
            <Broken />
          </DemoRecovery>
        </SiteRoot>,
      );
    });
    quiet.mockRestore();
    expect(container.textContent).toContain('The demo needs a fresh start');
    expect(container.textContent).toContain('Reset the demo data');
    expect(container.textContent).toContain('old saved data');
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

describe('employer demo: the AI chat, with a stand-in model on its own route', () => {
  type Sent = { message: string; first: boolean; model?: string; context: { stage: string; job: { sections: Array<{ key: string; fixed: boolean }> }; recommendation: { key: string } } };
  const flush = () =>
    act(async () => {
      for (let i = 0; i < 30; i++) await Promise.resolve();
    });
  const write = (label: string, text: string) => {
    const ta = container.querySelector(`textarea[aria-label="${label}"]`) as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(ta, text);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  };
  const say = (text: string) => write('Message AidJobs about this job', text);
  const posts = () => aiCalls.filter((c) => c.method === 'POST').map((c) => JSON.parse(c.body) as Sent);
  const stage = { failNext: false };
  const model = (method: string, body: string): Answer => {
    if (method === 'GET') return { status: 200, body: { ai: true, provider: 'OpenRouter, with zero data retention', models: [{ key: 'terra', label: 'GPT-6.1 Terra' }, { key: 'sonnet', label: 'Claude Sonnet 5.5' }], default: 'terra' } };
    if (stage.failNext) {
      stage.failNext = false;
      return { status: 502, body: { error: 'failed' } };
    }
    const { first, context, model: chosen } = JSON.parse(body) as Sent & { model?: string };
    const ok = (b: Record<string, unknown>): Answer => ({ status: 200, body: { ...b, model: chosen } });
    if (first) return ok({ reply: 'A nutrition role in Juba: I would use your usual template. Shall I?', actions: [{ type: 'ask', quick: ['Yes, use it'] }] });
    if (context.stage === 'template') return ok({ reply: 'Done. How should it sound: warm and plain?', actions: [{ type: 'use_template', template: context.recommendation.key }] });
    if (context.stage === 'style') {
      const writes = context.job.sections.filter((x) => !x.fixed).map((x) => ({ type: 'write_section', section: x.key, lines: [`Written by the stand-in model for ${x.key}.`] }));
      return ok({ reply: 'Here is the first draft. Keep this style for every job?', actions: [{ type: 'set_style', style: ['Warm', 'Plain English'] }, ...writes, { type: 'write_section', section: 'apply', lines: ['Send your CV to jobs@invented.example'] }, { type: 'ask', quick: ['Keep it for all jobs', 'Just this job'] }] });
    }
    return ok({ reply: 'Kept for every job.', actions: [{ type: 'keep_style', all: true }] });
  };

  afterAll(() => {
    aiRoute = (method) => (method === 'GET' ? { status: 200, body: { ai: false } } : { status: 503, body: { error: 'off' } });
    resetAi();
  });

  it('the AI writes the replies and the draft; the demo applies its actions, refuses what is not allowed, and falls back to the rules quietly', async () => {
    aiCalls.length = 0;
    aiRoute = model;
    resetAi();
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
    phone = false;
    render();
    route('#create');
    await flush();
    write('Describe the role', "We're hiring a Nutrition Officer in Juba, closing 30 December 2026");
    route(window.location.hash);
    const id = window.location.hash.replace('#job/', '');
    const job = () => getState().jobs.find((j) => j.id === id)!;
    shows('Reading your role…');
    await flush();
    act(() => jest.advanceTimersByTime(1000));
    await flush();
    expect(container.textContent).not.toContain('Reading your role…');
    shows('A nutrition role in Juba');
    expect(container.textContent).not.toContain('First, the template.');
    expect(posts()[0]).toMatchObject({ first: true, message: "We're hiring a Nutrition Officer in Juba, closing 30 December 2026", context: { stage: 'template' }, model: 'terra' });
    shows('Messages go to an AI model through OpenRouter, with zero data retention. Use sample details only.');
    const choice = container.querySelector('select[aria-label="AI model (demo only)"]') as HTMLSelectElement;
    expect(Array.from(choice.options).map((o) => o.textContent)).toEqual(['GPT-6.1 Terra', 'Claude Sonnet 5.5']);
    expect(choice.value).toBe('terra');
    expect(container.querySelector('.ej-ai-by')?.textContent).toBe('Written by GPT-6.1 Terra');

    say('Yes, use it');
    shows('Thinking…');
    await flush();
    expect(container.textContent).not.toContain('Thinking…');
    expect(job().setup).toBe('style');
    shows('How should it sound: warm and plain?');

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(choice, 'sonnet');
      choice.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(localStorage.getItem('aidjobs.employerDemo.aiModel')).toBe('sonnet');
    say('Warm and plain, please');
    await flush();
    expect(posts().at(-1)?.model).toBe('sonnet');
    expect(job().chat.filter((m) => m.ai).map((m) => m.by)).toEqual(['GPT-6.1 Terra', 'GPT-6.1 Terra', 'Claude Sonnet 5.5']);
    expect(job().setup).toBeUndefined();
    const written = job().sections.filter((x) => x.ai);
    expect(written.length).toBe(job().sections.filter((x) => x.key !== 'about' && x.key !== 'apply').length);
    expect(job().sections.find((x) => x.key === 'apply')?.lines.join(' ')).not.toContain('invented.example');
    shows('Written by the stand-in model for');
    shows('Not done:');
    shows('written from your settings');
    expect(job().chat.filter((m) => m.ai).map((m) => m.text.slice(0, 20))).toEqual(['A nutrition role in ', 'Done. How should it ', 'Here is the first dr']);
    expect(job().chat.some((m) => /First, the template\.|Here is the first draft, written|How should it sound\? /.test(m.text))).toBe(false);

    click('Keep it for all jobs');
    await flush();
    expect(posts().at(-1)?.message).toBe('Keep it for all jobs');
    expect(getState().org.styleKept).toBe(true);

    stage.failNext = true;
    say('shorter');
    await flush();
    shows("The AI could not answer just now, so the demo's own rules did.");
    expect(job().chat.at(-1)?.ai).toBeUndefined();
    expect(network).toEqual([]);
  });
});

const AI_SDK = /from ['"](openai|ai|@ai-sdk\/[\w-]+|@anthropic-ai\/[\w-]+|@google\/(generative-ai|genai)|@mistralai\/[\w-]+|cohere-ai|groq-sdk|ollama|langchain|@langchain\/[\w-]+)['"]/;

describe('employer demo: source has no network path', () => {
  it('no demo file calls fetch, an AidJobs API path, or a request library, except the AI chat, which reaches only its own route', () => {
    const dir = join(__dirname, '..', '..', 'components', 'employer-demo');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect({ f, api: /['"`]\/api\//.test(src) }).toEqual({ f, api: false });
      if (f === 'ai.ts') {
        expect(AI_ROUTE).toBe('/employer-demo/chat');
        expect(src.match(/['"`]\/[\w-]+\/[^'"`\s]*['"`]/g)).toEqual([`'${AI_ROUTE}'`]);
        expect(src.match(/\bfetch\s*\(([^,]+),/g)).toEqual(['fetch(AI_ROUTE,', 'fetch(AI_ROUTE,']);
      } else {
        expect({ f, fetch: /\bfetch\s*\(/.test(src) }).toEqual({ f, fetch: false });
      }
      expect({ f, lib: /from ['"](axios|swr|@tanstack)/.test(src) }).toEqual({ f, lib: false });
      expect({ f, data: /lib\/site\/loadJobs|lib\/shortlist|PublicSite/.test(src) }).toEqual({ f, data: false });
      expect({ f, stream: /\bEventSource\b|\bWebSocket\b/.test(src) }).toEqual({ f, stream: false });
      expect({ f, ai: AI_SDK.test(src) }).toEqual({ f, ai: false });
    }
  });

  it('the AI route makes its own requests: no AI or AWS package on either side, and models are reached only at OpenRouter or Bedrock', () => {
    const lib = join(__dirname, '..', '..', 'lib', 'employerDemoAi');
    const server = [join(__dirname, '..', 'employer-demo', 'chat', 'route.ts'), ...readdirSync(lib).map((f) => join(lib, f))];
    expect(server.length).toBeGreaterThanOrEqual(7);
    for (const f of server) {
      const src = readFileSync(f, 'utf8');
      expect({ f, ai: AI_SDK.test(src), aws: /from ['"](@aws-sdk\/[\w-]+|aws-sdk|aws4|@smithy\/[\w-]+)['"]/.test(src) }).toEqual({ f, ai: false, aws: false });
      expect({ f, urls: (src.match(/https:\/\/[^\s'"`]+/g) ?? []).filter((u) => !u.startsWith('https://bedrock-mantle.') && u !== 'https://openrouter.ai/api/v1/chat/completions') }).toEqual({ f, urls: [] });
      expect({ f, logsText: /console\.\w+\([^)]*\b(message|content|context|body|raw)\b/.test(src) }).toEqual({ f, logsText: false });
    }
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /^(@aws-sdk\/|aws-sdk$|aws4$|openai$|ai$|@ai-sdk\/)/.test(d))).toEqual([]);
  });

  it('the page fixes "do not index" in its own layout', () => {
    const layout = readFileSync(join(__dirname, '..', 'employer-demo', 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
    expect(layout).not.toMatch(/SITE_INDEXABLE/);
  });
});
