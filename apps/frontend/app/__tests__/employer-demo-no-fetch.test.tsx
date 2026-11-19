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
import { emptyFacts, isoDay } from '@/components/employer-demo/engine';
import { addTranslation, formatOf, reorderSections, reviewerDecision, setReachPlan, toggleSection } from '@/components/employer-demo/actions';
import { planFor } from '@/components/employer-demo/invites';
import { answerFact, basePattern, forgetBase, notNowBase, setBaseFormat, importJobDescription, publish, readIntent, sendChat, sendForReview, setFacts, startJob, undoLastChange } from '@/components/employer-demo/actions';
import DemoRecovery from '@/components/employer-demo/Recover';
import { getState, go, goBack, resetDemo, STORAGE_KEY, update } from '@/components/employer-demo/store';
import SiteRoot from '@/components/site/SiteRoot';
import { AI_ROUTE, resetAi } from '@/components/employer-demo/ai';
import { PAGE_ROUTE } from '@/components/employer-demo/pages';
import { applyTemplate, chooseStyle, goOn, setPace } from '@/components/employer-demo/actions';
import { ASKS, checkPoints, LEFT, nextStep } from '@/components/employer-demo/flow';

const network: string[] = [];
let container: HTMLDivElement;
let root: Root;
let phone = false;

/** The demo's own AI route is the one address allowed; it answers as the stand-in says (by default, that the AI is off). */
type Answer = { status: number; body: unknown };
let aiRoute: (method: string, body: string) => Answer | Promise<Answer> = (method) => (method === 'GET' ? { status: 200, body: { ai: false } } : { status: 503, body: { error: 'off' } });
const aiCalls: Array<{ method: string; body: string }> = [];
/** The demo's page route is the only other address allowed (section 19, phase 5, A); by default it cannot read the page. */
let pageRoute: (body: string) => Answer | Promise<Answer> = () => ({ status: 200, body: { ok: false, reason: 'this page could not be read' } });
const pageCalls: string[] = [];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  const deny = (what: string) => () => {
    network.push(what);
    throw new Error(`The employer demo must not use the network: ${what}`);
  };
  const fetchStub = async (url: unknown, init?: { method?: string; body?: unknown }) => {
    if (url === PAGE_ROUTE) {
      const body = typeof init?.body === 'string' ? init.body : '';
      pageCalls.push(body);
      const a = await pageRoute(body);
      return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
    }
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
    // The template and the sections this role adds are chosen in the window's chat (round 7, phase 2), not on this screen.
    expect(container.textContent).not.toContain('Add:');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.getAttribute('aria-label') === 'Select a JD format')).toBe(false);
    const plus = () => Array.from(container.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Upload a job description, hire again, or continue a job draft') as HTMLElement;
    act(() => plus().click());
    shows('Continue a job draft');
    click('Upload a job description');
    expect(document.querySelector('input[aria-label="Link to a job description"]')).toBeNull();
    shows("Links can't be read: paste the text or use the file.");
    const doc = document.querySelector('textarea[aria-label="Job description text"]') as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(doc, 'ABOUT THE ROLE\nThe officer leads the team in Juba.\n\nRESPONSIBILITIES\n- Lead the team\n\nHOW TO APPLY\nApply online.');
      doc.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click('Use this job description');
    route(window.location.hash);
    expect(window.location.hash).toMatch(/^#job\//);
    shows('I read 3 sections from your job description');
    click('Its headings, saved as our JD format');
    const made = getState().formats.find((f) => f.label === 'Riverstone job description format');
    expect(made?.family).toBe('Your organisation');
    expect(made?.order.map((o) => o.key)).toEqual(['purpose', 'responsibilities', 'apply']);
    shows('About us');
    click('Skip for now');
    click('No project page');
    shows('How should it sound?');
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
      shows('Free standard: available');
      shows('Free Amplify: available');
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
    shows('Your one free standard listing, once for your organisation');
    for (const v of ['In Google', 'When shared', 'Job page']) click(v);
    click('Publish free');
    shows('Your free standard listing: the terms');
    click('I understand · Publish free');
    shows('Live on AidJobs');
    expect(getState().jobs.find((j) => j.id === id)).toMatchObject({ status: 'live', plan: 'free' });
    expect(getState().org.freeTermsAccepted).toBe(true);

    let paidId = '';
    act(() => {
      paidId = startJob('Hiring a Shelter Officer in Goma, closing in 4 weeks, fixed-term');
    });
    route(`#publish/${paidId}`);
    shows('Your free standard listing is used by');
    shows('Amplify, or a package job, publishes it.');
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
    expect(window.location.hash).toBe(`#job/${id}`);
    route(window.location.hash);
    expect(getState().jobs.find((j) => j.id === id)?.part).toBe('publish');
    shows('Amplified, it is listed 100 days from publishing');
    shows('With your free Amplify there is nothing to pay; it is used at once.');
    expect(container.textContent).not.toContain('Ask someone else to pay');
    const receipts = getState().receipts.length;
    click('Amplify this job · your free Amplify');
    expect(getState().jobs.find((j) => j.id === id)).toMatchObject({ plan: 'amplify', paidVia: 'free' });
    expect(getState().receipts.length).toBe(receipts);
    expect(getState().free).toEqual({ standard: id, amplify: id });
    route('#billing');
    shows('Free standard: used');
    shows('Free Amplify: used');

    act(() => {
      const id2 = startJob('Hiring a Finance Officer in Kampala, fixed-term, closing in 4 weeks');
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

  it('uses a free listing only when its job goes live, not when it is written or sent for review', () => {
    act(() => resetDemo());
    let id = '';
    act(() => {
      id = startJob('Hiring a Logistics Officer in Goma, fixed-term, closing in 3 weeks');
    });
    expect(getState().free).toEqual({});
    act(() => sendForReview(id, [{ name: 'Amina Yusuf', email: 'amina@riverstone.example.org', outside: false }], '2026-11-20', 'any', ''));
    expect(getState().free).toEqual({});
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
    shows('Your free standard listing: the terms');
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

  it('a free job may be scheduled more than a month ahead: no month limit since phase 5', () => {
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true, jobs: st.jobs.map((j) => (j.id === 'job-comms' ? { ...j, facts: { ...j.facts, deadline: isoDay(st.today + 90 * 86_400_000) } } : j)) }));
    });
    phone = false;
    render();
    route('#home');
    route('#publish/job-comms');
    click('Schedule');
    const later = isoDay(getState().today + 40 * 86_400_000);
    type(container.querySelector('input[aria-label="Publish on"]') as HTMLInputElement, later);
    expect(container.textContent).not.toContain('goes live in its own month');
    const button = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent?.trim() ?? '').startsWith('Schedule free for')) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
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
    // A job not yet published opens in the window (phase 4); the archived workspace still works at its address.
    expect(window.location.hash).toBe('#job/job-fin');
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
    expect(window.location.hash).toBe('#job/job-comms');
    expect(getState().jobs.find((j) => j.id === 'job-comms')?.part).toBe('check');
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
    act(() => step('Publish')!.click());
    expect(window.location.hash).toBe('#job/job-comms');
    expect(getState().jobs.find((j) => j.id === 'job-comms')?.part).toBe('publish');
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
    shows('The facts are shared; its sections are its own');
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
    shows('The facts are shared with every version');
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
  /** A new employer: no job written yet, so the window asks for the template itself (a returning one gets one confirmation, phase 4). */
  const freshNew = () =>
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true, jobs: [], profiles: [] }));
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
  const choose = (sel: HTMLSelectElement, value: string) =>
    act(() => {
      sel.value = value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  // Changed by phase 6 (section 19, B): a heading in the outline reads as text; clicked, it becomes a field, and Enter saves it.
  const rename = (root: HTMLElement, index: number, value: string) => {
    act(() => (root.querySelectorAll('.ej-ol-head')[index] as HTMLElement).click());
    const input = root.querySelector('.ej-ol-input') as HTMLInputElement;
    typeInto(input, value);
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  };
  const typeInto = (input: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('any template can be adjusted before it is used, and the panel can be closed, moved, and resized at any time', () => {
    freshNew();
    let id = '';
    act(() => {
      id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    });
    phone = false;
    render();
    route(`#job/${id}`);
    click('See all formats');
    const panel = () => container.querySelector('section.ej-float') as HTMLElement;
    expect(document.activeElement).toBe(panel());
    act(() => byLabel('Close the template panel').click());
    expect(panel()).toBeNull();
    expect(job(id).setup).toBe('template');
    click('Browse templates');
    act(() => panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(panel()).toBeNull();
    click('Browse templates');
    const un = getState().formats.find((f) => f.label.startsWith('UN Secretariat'))!;
    choose(panel().querySelector('select[aria-label="Template"]') as HTMLSelectElement, un.key);
    const heads = () => Array.from(panel().querySelectorAll('.ej-ol-head')) as HTMLElement[];
    const first = un.order[0].key;
    rename(panel(), 0, 'Our mandate');
    const dropped = un.order[un.order.length - 1];
    act(() => (panel().querySelector(`[aria-label="Remove ${dropped.heading}"]`) as HTMLElement).click());
    expect(panel().textContent).toContain('Reset');
    act(() => byLabel('Engagement: job. Change it').click());
    click('Consultancy');
    expect(heads()[0].textContent).toBe('Our mandate');
    expect(panel().querySelector('[aria-label="Deliverables. Rename"]')).not.toBeNull();
    expect(panel().querySelector(`[aria-label="Remove ${dropped.heading}"]`)).toBeNull();
    const before = panel().style.width;
    act(() => byLabel('Resize the template panel: drag, or use the arrow keys').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(panel().style.width).not.toBe(before);
    const left = panel().style.left;
    act(() => byLabel('Move the template panel with the arrow keys').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(panel().style.left).not.toBe(left);
    act(() => (panel().querySelector('.aj-ink-btn') as HTMLElement).click());
    expect(job(id).format).toBe(un.key);
    expect(job(id).tags).not.toContain(dropped.key);
    expect(job(id).renamed?.[first]).toBe('Our mandate');
    expect(job(id).setup).toBe('about');
    expect(panel()).toBeNull();
    expect(network).toEqual([]);
  });

  it('Enter opens the window at once; the chat asks for the template first, the panel stays empty, and nothing is written until the template and the style are chosen', () => {
    freshNew();
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
    expect(container.querySelector('.ej-w-head nav[aria-label="Parts of this job"]')).toBeNull();
    expect(container.querySelector('[aria-label="The job"] > .ej-pline nav[aria-label="Parts of this job"]')).not.toBeNull();
    expect(line().querySelectorAll('.ej-pline-dot').length).toBeGreaterThan(0);
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector('.ej-line-mark')).toBeNull();
    shows('similar nutrition roles are on AidJobs');
    click(`Use ${format.label}`);
    expect(job(id).setup).toBe('about');
    shows(`${format.label} it is:`);
    shows('About us');
    click('Skip for now');
    click('No project page');
    expect(job(id).setup).toBe('style');
    // Early facts may be asked before the tone question while setup is still style.
    if (job(id).chat.at(-1)?.ask) {
      say(job(id).chat.at(-1)?.ask === 'place' ? 'Juba' : job(id).chat.at(-1)?.ask === 'contract' ? 'fixed-term' : 'no grade');
      if (job(id).chat.at(-1)?.ask) say(job(id).chat.at(-1)?.ask === 'place' ? 'Juba' : job(id).chat.at(-1)?.ask === 'contract' ? 'fixed-term' : 'no grade');
      if (job(id).chat.at(-1)?.ask) say(job(id).chat.at(-1)?.ask === 'place' ? 'Juba' : job(id).chat.at(-1)?.ask === 'contract' ? 'fixed-term' : 'no grade');
    }
    shows('How should it sound?');
    expect(container.querySelector('[aria-label$=": its sections"]')).not.toBeNull();
    click('Yes, write it that way');
    expect(job(id).setup).toBe('pace');
    shows('Shall I write it one section at a time');
    click('One section at a time');
    expect(job(id).setup).toBeUndefined();
    expect(container.querySelector('[aria-label="The job"] article[aria-label="Job description"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Before I write About us|About us|Where is the job based|Good as it is/i);
    expect(currentLabel()).toMatch(/Details|About us|The role|Job description/i);
    click('Skip to the job description');
    act(() => jest.advanceTimersByTime(50));
    expect(document.activeElement?.id).toBe('ej-w-panel');
    expect(line().querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(network).toEqual([]);
  });

  it('the template panel: the job-type sentence, live headings in the job description panel, and Create your own', () => {
    freshNew();
    let id = '';
    act(() => {
      id = startJob("We're hiring a Nutrition Officer in Juba", undefined, [], true);
    });
    phone = false;
    render();
    route(`#job/${id}`);
    click('See all formats');
    const panel = () => container.querySelector('section.ej-float') as HTMLElement;
    expect(panel().getAttribute('aria-label')).toBe('Choose a template');
    expect(container.querySelector('article[aria-label$=": its sections"]')).not.toBeNull();
    const un = getState().formats.find((f) => f.label.startsWith('UN Secretariat'))!;
    choose(panel().querySelector('select[aria-label="Template"]') as HTMLSelectElement, un.key);
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
    rename(panel(), 0, 'Who we are');
    shows('Who we are');
    act(() => (panel().querySelector('[aria-label^="Add "]') as HTMLElement).click());
    click('Use Riverstone consultancies');
    const made = getState().formats.find((f) => f.label === 'Riverstone consultancies')!;
    expect(made.order[0].heading).toBe('Who we are');
    expect(job(id).format).toBe(made.key);
    expect([...job(id).tags].sort()).toEqual(made.order.map((o) => o.key).sort());
    expect(job(id).setup).toBe('about');
    expect(container.querySelector('section.ej-float')).toBeNull();
    click('Skip for now');
    click('No project page');
    if (job(id).chat.at(-1)?.ask) {
      say(job(id).chat.at(-1)?.ask === 'place' ? 'Juba' : job(id).chat.at(-1)?.ask === 'contract' ? 'fixed-term' : 'no grade');
      if (job(id).chat.at(-1)?.ask) say(job(id).chat.at(-1)?.ask === 'place' ? 'Juba' : job(id).chat.at(-1)?.ask === 'contract' ? 'fixed-term' : 'no grade');
      if (job(id).chat.at(-1)?.ask) say(job(id).chat.at(-1)?.ask === 'place' ? 'Juba' : job(id).chat.at(-1)?.ask === 'contract' ? 'fixed-term' : 'no grade');
    }
    say('warm, speaking as we');
    expect(job(id).style).toContain('Warm');
    expect(job(id).style).toContain('Speaks as "we"');
    click("Write it all, then I'll review");
    expect(job(id).sections[0].title).toBe('Who we are');
    expect(job(id).tags.every((k) => job(id).sections.some((x) => x.key === k))).toBe(true);
    shows('Here is the whole draft, written warmly');
    shows("Let's go through it.");
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
    expect(labels).toEqual([formatOf(getState(), job(id).format).label, ...job(id).tags.map((k) => title(k)), 'Details', 'Fixed text', 'Check', 'Free or Amplify', 'Review', 'Publish']);
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
    // Changed by phase 6 (section 19, D): a locked text stays on the job, so the first one not locked is the one changed.
    act(() => (Array.from(container.querySelectorAll('#ej-part-card input[type="checkbox"]')).find((x) => !x.hasAttribute('aria-disabled')) as HTMLElement).click());
    expect(job(id).commitments.length).not.toBe(before);
    part(formatOf(getState(), job(id).format).label);
    const tags = job(id).tags;
    // Changed by phase 6 (section 19, B): the outline's grip takes the arrow keys, within and across groups.
    act(() => (container.querySelector(`section.ej-float [data-grip-key="${tags[1]}"]`) as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(job(id).tags).not.toEqual(tags);
    expect(job(id).sections.map((x) => x.key)).toEqual(job(id).tags);
    part(job(id).sections.find((x) => x.key === 'apply')!.title);
    click('By email');
    expect(job(id).apply.method).toBe('email');
    click('Hide');
    expect(container.querySelector('#ej-part-card')).toBeNull();
    part('Check');
    shows('With Amplify, the market check and the full advert check follow as parts of their own.');
    part('Free or Amplify');
    act(() => (container.querySelector('#ej-part-card [role="radio"][aria-checked="false"]') as HTMLElement).click());
    expect(job(id).choice).toBeDefined();
    act(() => update((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id === id ? { ...j, choice: 'free' } : j)) })));
    part('Publish');
    const main = () => container.querySelector('#ej-part-card .ej-main-cta') as HTMLButtonElement;
    expect(main().textContent).toBe('Publish free · your free standard listing');
    click('On a date');
    expect(job(id).publishOn).toBeDefined();
    expect(main().textContent).toMatch(/^Schedule free for /);
    expect(window.location.hash).toBe(`#job/${id}`);
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
    shows('nothing goes out until you press it');
    expect(container.querySelector('[role="log"] section[aria-label="Publish"] .ej-main-cta')).not.toBeNull();
    expect(job(id).part).toBe('publish');
    expect(job(id).status).toBe('draft');
    // The earlier workspace is archived (phase 4): the window no longer links to it, and it still works at its address.
    expect(Array.from(container.querySelectorAll('button')).some((b) => /Earlier workspace/.test(b.textContent ?? ''))).toBe(false);
    route(`#create/${id}`);
    expect(container.querySelector('[aria-label="JD outline"], [aria-label="Panels"]')).not.toBeNull();
    shows('Archived screen, kept for reference');
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
    expect(document.querySelectorAll('nav[aria-label="Parts of this job"] li').length).toBe(job(id).tags.length + 7);
    part('Details');
    expect(document.querySelector('nav[aria-label="Parts of this job"]')).toBeNull();
    expect(job(id).part).toBe('details');
    shows('Duty station');
    click('Chat');
    expect(container.querySelector('.ej-subject')?.textContent).toBe('About: Details');
    phone = false;
    expect(network).toEqual([]);
  });

  it('steps 8 and 9 in the window: the tabs open when needed, only the latest card is live, and only its button publishes', () => {
    fresh();
    let id = '';
    act(() => {
      id = startJob("We're hiring a Logistics Officer in Goma, fixed-term, closing 30 December 2026", undefined, [], true);
      applyTemplate(id, job(id).format);
      chooseStyle(id, ['Warm']);
      setPace(id, 'all');
      // The organisation's free Amplify is already used, so this walk goes through the paid checkout.
      update((st) => ({ ...st, free: { amplify: 'job-earlier' }, org: { ...st.org, keepOffered: ['fixed', 'apply'] }, jobs: st.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: [...j.tags], settled: [...ASKS, ...LEFT] } } : j)) }));
      const points = checkPoints(job(id), getState()).map((p) => p.key);
      update((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, skipped: points } } : j)) }));
      goOn(id);
    });
    phone = false;
    render();
    route(`#job/${id}`);
    const click = (text: string) => {
      const el = Array.from(container.querySelectorAll('button')).filter((b) => !b.disabled && b.textContent?.trim() === text).pop();
      if (!el) throw new Error(`No button "${text}" on the screen`);
      act(() => el.click());
    };
    expect(currentLabel()).toBe('Free or Amplify');
    expect(container.querySelector('#ej-part-card [role="radiogroup"][aria-label="Free or Amplify"]')).not.toBeNull();
    click('Amplify');
    expect(job(id).choice).toBe('amplify');
    for (let i = 0; i < 10 && ['market', 'full'].includes(nextStep(job(id), getState())?.kind ?? ''); i++) click('Leave it as it is');
    click('Add French');
    const tabs = () => Array.from(container.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
    expect(tabs()).toContain('Français');
    click('No other languages');
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Français');
    click('Mark it as reviewed');
    // Phase 5's order: review, then Reach, then the flyer.
    expect(nextStep(job(id), getState())).toEqual({ kind: 'review' });
    click('No review');
    click('Invite people');
    expect(tabs()).toContain('Reach emails');
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Reach emails');
    click('Show the flyer');
    expect(tabs()).toContain('Flyer');
    shows('A one-page notice with a QR code to the job');
    expect(job(id).flyerMade).toBeDefined();
    expect(job(id).chat.at(-1)?.card).toBe('publish');
    const cards = () => container.querySelectorAll('[role="log"] section.ej-chat-card');
    expect(cards()).toHaveLength(1);
    say('publish it');
    expect(cards()).toHaveLength(1);
    expect(job(id).status).toBe('draft');
    const main = () => container.querySelector('[role="log"] section.ej-chat-card .ej-main-cta') as HTMLButtonElement;
    expect(main().textContent).toBe('Amplify and publish · US$28.40');
    click('Payment options');
    expect(tabs()).toContain('Payment');
    act(() => main().click());
    shows('Simulated · no card is charged');
    click('Pay US$28.40');
    expect(job(id)).toMatchObject({ status: 'live', plan: 'amplify', paidVia: 'single' });
    expect(job(id).chat.at(-1)).toMatchObject({ step: 'live', card: 'live' });
    expect(cards()).toHaveLength(1);
    shows('Saved as a job profile for next time: Logistics Officer, Goma.');
    expect(network).toEqual([]);
  });

  it('tapping "Publish free" in the chat chooses Free; the window does not take it as a request to publish (the independent review, 12 November 2026)', () => {
    fresh();
    let id = '';
    act(() => {
      id = startJob("We're hiring a Logistics Officer in Goma, fixed-term, closing 30 December 2026", undefined, [], true);
      applyTemplate(id, job(id).format);
      chooseStyle(id, ['Warm']);
      setPace(id, 'all');
      update((st) => ({ ...st, org: { ...st.org, keepOffered: ['fixed', 'apply'] }, jobs: st.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, approved: [...j.tags], settled: [...ASKS, ...LEFT] } } : j)) }));
      const points = checkPoints(job(id), getState()).map((p) => p.key);
      update((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id === id ? { ...j, walk: { ...j.walk!, skipped: points } } : j)) }));
      goOn(id);
    });
    phone = false;
    render();
    route(`#job/${id}`);
    expect(currentLabel()).toBe('Free or Amplify');
    const chip = Array.from(container.querySelectorAll('[role="log"] button')).find((b) => b.textContent?.trim() === 'Publish free') as HTMLElement;
    act(() => chip.click());
    expect(job(id).choice).toBe('free');
    expect(job(id).walk?.settled).toContain('plan');
    expect(job(id).status).toBe('draft');
    expect(network).toEqual([]);
  });

  it('About us from a page (phase 5, A): a link in the chat is never read; its field reads one page; the draft goes on the job only when accepted', async () => {
    fresh();
    resetAi('off');
    let id = '';
    act(() => {
      id = startJob('Hiring a Shelter Officer in Goma, closing 30 December 2026, fixed-term');
    });
    phone = false;
    render();
    route(`#job/${id}`);
    pageCalls.length = 0;
    say('https://riverstone.example.org/about');
    expect(pageCalls).toEqual([]);
    shows("I can't read links here");
    const about = job(id).sections.find((x) => x.key === 'about')!;
    part(about.title);
    const address = byLabel('Your organisation’s page address') as HTMLInputElement;
    expect(address).not.toBeNull();
    typeInto(address, 'https://riverstone.example.org/about');
    pageRoute = () => ({ status: 200, body: { ok: true, text: 'Riverstone Aid is an international NGO that works with communities in East Africa on water, sanitation, and health.\nWe work through local partners and community committees in every country where we work.', social: [] } });
    click('Read this page');
    await act(async () => {
      for (let i = 0; i < 30; i++) await Promise.resolve();
    });
    expect(pageCalls.map((b) => JSON.parse(b))).toEqual([{ url: 'https://riverstone.example.org/about', field: 'website' }]);
    expect(job(id).sections.find((x) => x.key === 'about')?.lines).toEqual(about.lines);
    shows('From your website');
    click('Accept');
    expect(job(id).sections.find((x) => x.key === 'about')?.lines[0]).toMatch(/^Riverstone Aid is an international NGO/);
    expect(job(id).pack?.about?.source).toBe('your website');
    pageRoute = () => ({ status: 200, body: { ok: false, reason: 'this page could not be read' } });
    part(job(id).sections.find((x) => x.key === 'about')!.title);
    typeInto(byLabel('Your organisation’s page address') as HTMLInputElement, 'https://riverstone.example.org/members-only');
    click('Read this page');
    await act(async () => {
      for (let i = 0; i < 30; i++) await Promise.resolve();
    });
    shows('This page could not be read: paste its text below, or upload the file.');
    expect(network).toEqual([]);
  }, 20_000);

  it('on phones the template is chosen in the job description itself: a slim question line, the headings, and a strip of cards', () => {
    freshNew();
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
    // Changed by phase 6 (section 19, B): the same outline as everywhere, editable on the phone too.
    expect(container.querySelector('.ej-ol .ej-ol-head')).not.toBeNull();
    const un = getState().formats.find((f) => f.label.startsWith('UN Secretariat'))!;
    act(() => (cards().find((c) => c.textContent?.startsWith(un.label)) as HTMLElement).click());
    expect(container.querySelector('.ej-ol[aria-label="Sections of the template, by group"]')).not.toBeNull();
    rename(container, 0, 'Our setting');
    expect(container.querySelector('.ej-ol-head')?.textContent).toBe('Our setting');
    click(`Use ${un.label}`);
    expect(job(id).format).toBe(un.key);
    expect(job(id).setup).toBe('about');
    expect(container.querySelector('textarea[aria-label="Message AidJobs about this job"]')).not.toBeNull();
    shows('About us');
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
  type Next = { kind: string; section?: string; sections?: Array<{ key: string }>; fact?: string };
  type Sent = { message: string; first: boolean; silent?: boolean; model?: string; context: { stage: string; walk: { next: Next | null } | null; job: { sections: Array<{ key: string; fixed: boolean }> }; recommendation: { key: string } } };
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
    const { first, silent, message, context, model: chosen } = JSON.parse(body) as Sent & { model?: string };
    const ok = (b: Record<string, unknown>): Answer => ({ status: 200, body: { ...b, model: chosen } });
    const next = context.walk?.next;
    if (first) return ok({ reply: 'A nutrition role in Juba: I would use your usual template. Shall I?', actions: [{ type: 'ask', quick: ['Yes, use it'] }] });
    if (context.stage === 'template') return ok({ reply: 'Done. First, your About us page?', actions: [{ type: 'use_template', template: context.recommendation.key }, { type: 'show', card: 'website' }] });
    if (context.stage === 'about') return ok({ reply: 'Skipped About us. Any project page?', actions: [{ type: 'show', card: 'project' }], ask: undefined });
    if (context.stage === 'project') return ok({ reply: 'How should it sound: warm, speaking as we?', actions: [{ type: 'ask', quick: ['Yes, write it that way', 'Warm', 'Formal'] }] });
    if (context.stage === 'style') return ok({ reply: 'Warm it is. One section at a time, or all of it first?', actions: [{ type: 'set_style', style: ['Warm', 'Speaks as "we"'] }, { type: 'ask', quick: ['One section at a time', "Write it all, then I'll review", 'Keep it for all jobs'] }] });
    if (message === 'Keep it for all jobs') return ok({ reply: 'Kept for every job. One section at a time, or all of it first?', actions: [{ type: 'keep_style', all: true }] });
    if (context.stage === 'pace') return ok({ reply: 'One section at a time, then.', actions: [{ type: 'set_pace', pace: 'step' }] });
    if (silent && next?.kind === 'write') {
      const writes = (next.sections ?? []).map((x) => ({ type: 'write_section', section: x.key, lines: [`Written by the stand-in model for ${x.key}.`] }));
      return ok({ reply: 'Here it is. Good, or change something?', actions: [...writes, { type: 'write_section', section: 'apply', lines: ['Send your CV to jobs@invented.example'] }, { type: 'ask', quick: ['Good, next'] }] });
    }
    if (next?.kind === 'ask') return ok({ reply: `Noted. ${next.fact === 'grade' ? 'And the grade?' : 'Next question?'}`, actions: next.fact === 'contract' ? [{ type: 'set_facts', facts: { contract: 'fixed-term' } }] : next.fact === 'grade' ? [{ type: 'settle', fact: 'grade' }] : [] });
    if (next?.kind === 'approve') return ok({ reply: 'Good. On we go.', actions: [{ type: 'approve_section', section: next.section }] });
    return ok({ reply: 'Done.', actions: [] });
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
    expect(job().setup).toBe('about');
    expect(container.textContent).toMatch(/About us|First, your About us/i);

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(choice, 'sonnet');
      choice.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(localStorage.getItem('aidjobs.employerDemo.aiModel')).toBeNull();
    say('Skip for now');
    await flush();
    say('No project page');
    await flush();
    // May still be asking early facts or style depending on mock/rules.
    if (job().setup === 'style' || job().chat.at(-1)?.text?.includes('sound')) {
      say('Warm, speaking as we');
      await flush();
    }
    expect(posts().at(-1)?.model).toBe('sonnet');
    expect(job().chat.filter((m) => m.ai).length).toBeGreaterThanOrEqual(2);
    expect(['pace', 'style', undefined]).toContain(job().setup ?? undefined);

    click('Keep it for all jobs');
    await flush();
    expect(posts().at(-1)?.message).toBe('Keep it for all jobs');
    expect(getState().org.styleKept).toBe(true);

    say('One section at a time');
    await flush();
    expect(job().setup).toBeUndefined();
    expect(job().sections.map((x) => x.key)).toEqual(['apply']);
    shows('Before I write About us: What kind of contract is it?');
    say('Fixed-term');
    await flush();
    expect(job().facts.contract).toBe('Fixed-term');
    expect(posts().at(-1)?.context.walk?.next).toMatchObject({ kind: 'ask', fact: 'contract' });
    say('No grade');
    await flush();
    expect(job().walk?.settled).toContain('grade');
    // About us is part of the job since phase 5: the window asks the AI to write it in its turn, then it comes up for approval.
    await flush();
    await flush();
    expect(job().sections.find((x) => x.key === 'about')).toMatchObject({ lines: ['Written by the stand-in model for about.'], ai: true });
    expect(job().chat.at(-1)).toMatchObject({ ai: true, step: 'approve:about' });

    say('Good');
    await flush();
    await flush();
    expect(job().walk?.approved).toEqual(['about']);
    const goOn = posts().at(-1)!;
    expect(goOn).toMatchObject({ silent: true, message: 'Go on with the next step: write it now.', context: { walk: { next: { kind: 'write', sections: [{ key: 'purpose' }] } } } });
    expect(job().sections.find((x) => x.key === 'purpose')).toMatchObject({ lines: ['Written by the stand-in model for purpose.'], ai: true });
    expect(job().sections.find((x) => x.key === 'apply')?.lines.join(' ')).not.toContain('invented.example');
    shows('Written by the stand-in model for');
    shows('Not done:');
    shows('written from your settings');
    expect(job().chat.at(-1)).toMatchObject({ ai: true, step: 'approve:purpose' });
    expect(job().chat.filter((m) => m.from === 'user').map((m) => m.text)).not.toContain('Go on with the next step: write it now.');

    say('Good');
    stage.failNext = true;
    await flush();
    await flush();
    expect(job().walk?.approved).toEqual(['about', 'purpose']);
    expect(job().sections.find((x) => x.key === 'responsibilities')?.ai).toBeUndefined();
    expect(job().sections.find((x) => x.key === 'responsibilities')?.lines.length).toBeGreaterThan(2);
    shows("The AI could not answer just now, so the demo's own rules did.");

    stage.failNext = true;
    say('shorter');
    await flush();
    shows("The AI could not answer just now, so the demo's own rules did.");
    expect(job().chat.at(-1)?.ai).toBeUndefined();
    expect(network).toEqual([]);
  }, 20_000);
});

describe('employer demo: round 7, phase 4 (returning employers, jobs in their state, reviewers, the old pages archived)', () => {
  const fresh = () =>
    act(() => {
      resetDemo();
      update((st) => ({ ...st, signedIn: true }));
    });
  const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
  const byLabel = (label: string) => container.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
  const press = (el: Element | null | undefined) => {
    if (!el) throw new Error(`Nothing to press on the screen: ${container.textContent?.slice(0, 300)}`);
    act(() => (el as HTMLElement).click());
  };
  const write = (label: string, text: string) => {
    const ta = container.querySelector(`textarea[aria-label="${label}"]`) as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(ta, text);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  };
  const say = (text: string) => write('Message AidJobs about this job', text);
  const menu = (title: string, item: string) => {
    press(byLabel(`Actions for ${title}`));
    click(item);
  };
  const opened = (id: string, part?: string) => {
    expect(window.location.hash).toBe(`#job/${id}`);
    if (part) expect(job(id).part).toBe(part);
  };
  const part = (label: string) => press(Array.from(document.querySelectorAll('nav[aria-label="Parts of this job"] button')).find((x) => x.querySelector('.ej-line-label')?.textContent === label));
  const escape = () => act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

  it('every former link to the earlier workspace or Check and publish opens the window instead, and only the archive links to them', () => {
    fresh();
    phone = false;
    render();
    route('#jobs');
    const row = (title: string) => Array.from(container.querySelectorAll('.ej-jobitem')).find((li) => li.querySelector('.ej-jobrow-main')?.textContent?.includes(title));
    press(row('Communications Intern')?.querySelector('button.ej-next'));
    opened('job-comms');
    route('#jobs');
    menu('Communications Intern', 'Send for review');
    opened('job-comms', 'review');
    route('#jobs');
    menu('Child Protection Specialist', 'Edit');
    expect(window.location.hash).toBe('#job/job-cps');
    expect(job('job-cps').part).toMatch(/^s:/);
    route('#jobs');
    press(row('Logistics Assistant')?.querySelector('button.ej-next'));
    expect(job(window.location.hash.replace('#job/', '')).walk?.again).toBe('Logistics Assistant, Kampala');

    route('#home');
    press(Array.from(container.querySelectorAll('button.aj-card')).find((b) => b.textContent?.includes('Communications Intern')));
    opened('job-comms');
    route('#home');
    const approved = Array.from(container.querySelectorAll('[aria-label="Briefing"] li')).find((li) => li.textContent?.includes('approved Finance Officer'));
    press(Array.from(approved?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Open'));
    opened('job-fin', 'review');
    route('#home');
    write('Ask AidJobs to do something, or describe a role', "We're hiring a Shelter Officer in Goma");
    expect(window.location.hash).toMatch(/^#job\//);
    expect(job(window.location.hash.replace('#job/', '')).setup).toBe('template');

    route('#create');
    press(byLabel('Upload a job description, hire again, or continue a job draft'));
    click('Communications Intern');
    opened('job-comms');
    route('#create');
    press(byLabel('Upload a job description, hire again, or continue a job draft'));
    click('Health Officer');
    expect(job(window.location.hash.replace('#job/', '')).walk?.again).toBe('Health Officer, Goma');

    const viewAs = container.querySelector('select[aria-label="View the demo as"]') as HTMLSelectElement;
    act(() => {
      viewAs.value = 'amina';
      viewAs.dispatchEvent(new Event('change', { bubbles: true }));
    });
    opened('job-fin');
    act(() => update((st) => ({ ...st, reviewerAs: null })));

    act(() => {
      update((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id === 'job-fin' ? { ...j, paidFor: true } : j)) }));
      addTranslation('job-fin', 'fr');
    });
    route('#publish/job-fin');
    press(container.querySelector('#ej-row-languages'));
    click('Open the window');
    opened('job-fin', 'langs');

    const dir = join(__dirname, '..', '..', 'components', 'employer-demo');
    for (const f of readdirSync(dir).filter((n) => /\.tsx?$/.test(n) && !['Archive.tsx', 'Create.tsx', 'Publish.tsx'].includes(n))) {
      expect({ f, links: /go\(\s*'(create|publish)'\s*,/.test(readFileSync(join(dir, f), 'utf8')) }).toEqual({ f, links: false });
    }
    expect(network).toEqual([]);
  });

  it('the archived screens are reached from the demo controls and keep working, each with its banner and a way back to the window', () => {
    fresh();
    phone = false;
    render();
    route('#home');
    press(byLabel('Archived screens'));
    expect(window.location.hash).toBe('#archive');
    route('#archive');
    shows('Nothing else in the demo links to them.');
    expect(byLabel('Check and publish: Child Protection Specialist')).toBeNull();
    press(byLabel('Earlier workspace: Finance Officer'));
    expect(window.location.hash).toBe('#create/job-fin');
    route('#create/job-fin');
    shows('Archived screen, kept for reference');
    expect(container.querySelector('[aria-label="JD outline"], [aria-label="Panels"]')).not.toBeNull();
    click('Open this job in the new window');
    opened('job-fin');
    route('#archive');
    press(byLabel('Check and publish: Finance Officer'));
    route('#publish/job-fin');
    shows('Archived screen, kept for reference');
    shows('Check and publish');
    expect(container.querySelector('#ej-row-review')).not.toBeNull();
    expect(network).toEqual([]);
  });

  it('a returning employer: Enter offers the usual template, style, and pace as one confirmation; a saved profile comes first', () => {
    fresh();
    phone = false;
    render();
    route('#create');
    write('Describe the role', "We're hiring a Nutrition Officer in Juba");
    route(window.location.hash);
    const id = window.location.hash.replace('#job/', '');
    act(() => jest.advanceTimersByTime(1000));
    shows("I'll use your Riverstone format (7 of your jobs use it)");
    shows('Shall I start?');
    click('Start');
    expect(job(id).setup).toBeUndefined();
    expect(container.querySelector('[aria-label="The job"] article[aria-label="Job description"]')).not.toBeNull();
    route('#create');
    write('Describe the role', "We're hiring a Child Protection Specialist in Kampala");
    route(window.location.hash);
    const cp = window.location.hash.replace('#job/', '');
    act(() => jest.advanceTimersByTime(1000));
    shows('Same as your last Kampala Child Protection Specialist?');
    click('Same as last time');
    expect(job(cp).facts).toMatchObject({ grade: 'C1', safeguarding: 'high' });
    shows('Starting from your last Kampala Child Protection Specialist');
    expect(network).toEqual([]);
  });

  it('Hire again opens the window, where the chat asks what changes first, then each section for a quick "keep as is"', () => {
    fresh();
    phone = false;
    render();
    route('#jobs/job-log');
    click('Hire again');
    const id = window.location.hash.replace('#job/', '');
    expect(id).not.toBe('job-log');
    route(window.location.hash);
    shows('A new job from your Logistics Assistant, Kampala, with its text. First, what changes?');
    click('Nothing else changes');
    shows('as in your Logistics Assistant, Kampala: keep it as it is, or change something?');
    click('Keep as is');
    expect(job(id).walk?.approved).toContain('about');
  });

  it("a job opened in its state: one message for it, section 17's actions on a card, each opening its dialog; the chat never changes the state itself", () => {
    fresh();
    phone = false;
    render();
    route('#jobs');
    menu('Child Protection Specialist', 'Edit');
    route(window.location.hash);
    shows('This job is live: edits go live at once, and its page says Updated.');
    const card = () => Array.from(container.querySelectorAll('[role="log"] section[aria-label="What you can do"]')).at(-1) as HTMLElement;
    const buttons = () => Array.from(card().querySelectorAll('button')).map((b) => b.textContent);
    expect(buttons()).toEqual(['Extend', 'Share', 'Position filled', 'Close now', 'Withdraw', 'Delete']);
    expect(card().querySelector('.aj-ink-btn')?.textContent).toBe('Extend');
    press(Array.from(card().querySelectorAll('button')).find((b) => b.textContent === 'Extend'));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Extend the closing date');
    escape();
    say('close it');
    expect(job('job-cps').status).toBe('live');
    shows('Close now is on the card below, and nothing changes until you press it.');
    say('reopen it');
    shows('Reopen is not for a live job. You can extend it');
    say('withdraw it');
    shows('Confirm in the dialog: it says exactly what happens.');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Withdraw');
    escape();
    expect(job('job-cps').status).toBe('live');
    say('what can I do?');
    press(Array.from(card().querySelectorAll('button')).find((b) => b.textContent === 'Close now'));
    expect(job('job-cps').status).toBe('closed');
    shows('This job closed on');
    expect(buttons()).toEqual(['Reopen', 'Hire again', 'Download a copy']);
    part('Publish');
    expect(Array.from(container.querySelectorAll('#ej-part-card [role="group"][aria-label="What you can do"] button')).map((b) => b.textContent)).toEqual(['Reopen', 'Hire again', 'Download a copy']);
    expect(network).toEqual([]);
  });

  it('reviewers see the Review panel in the window: their decision, and comments tied to the part open on the line; no chat, no reordering', () => {
    fresh();
    phone = false;
    render();
    act(() => update((st) => ({ ...st, reviewerAs: 'daniel' })));
    route('#job/job-fin');
    expect(container.querySelector('textarea[aria-label="Message AidJobs about this job"]')).toBeNull();
    const panel = () => container.querySelector('[role="region"][aria-label="Review"]') as HTMLElement;
    expect(panel().textContent).toContain('Reviewing as Daniel Mwangi');
    expect(panel().textContent).toContain('Round 1');
    const resp = job('job-fin').sections.find((x) => x.key === 'responsibilities')!;
    part(resp.title);
    expect(panel().textContent).toContain(`Comment on ${resp.title}`);
    const area = panel().querySelector('textarea[aria-label="Your comment"]') as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(area, 'Please name the two field offices');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    press(Array.from(panel().querySelectorAll('button')).find((b) => b.textContent === `Add to ${resp.title}`));
    expect(job('job-fin').review.remarks.at(-1)).toMatchObject({ section: 'responsibilities', author: 'Daniel Mwangi', text: 'Please name the two field offices' });
    part(formatOf(getState(), job('job-fin').format).label);
    // Changed by phase 6 (section 19, B): reviewers see the outline in the same design, read only.
    expect(container.querySelector('section.ej-float .ej-ol')).not.toBeNull();
    expect(container.querySelector('section.ej-float .ej-grip, section.ej-float .ej-ol-x, section.ej-float .ej-add')).toBeNull();
    press(container.querySelector('[aria-label="Close the template panel"]'));
    press(Array.from(panel().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Approve'));
    expect(job('job-fin').review.reviewers.find((r) => r.name === 'Daniel Mwangi')?.decision).toBe('approved');
    expect(job('job-fin').chat.some((m) => m.state)).toBe(false);
    phone = true;
    render();
    route('#home');
    route('#job/job-fin');
    expect(Array.from(container.querySelectorAll('[aria-label="Show"] button')).map((b) => b.textContent?.trim())).toEqual(['Review', 'Job']);
    phone = false;
    act(() => update((st) => ({ ...st, reviewerAs: null })));
    expect(network).toEqual([]);
  });
});

const AI_SDK = /from ['"](openai|ai|@ai-sdk\/[\w-]+|@anthropic-ai\/[\w-]+|@google\/(generative-ai|genai)|@mistralai\/[\w-]+|cohere-ai|groq-sdk|ollama|langchain|@langchain\/[\w-]+)['"]/;

describe('employer demo: source has no network path', () => {
  it('no demo file calls fetch, an AidJobs API path, or a request library, except the AI chat and the page reader, each reaching only its own route', () => {
    const dir = join(__dirname, '..', '..', 'components', 'employer-demo');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect({ f, api: /['"`]\/api\//.test(src) }).toEqual({ f, api: false });
      if (f === 'ai.ts') {
        expect(AI_ROUTE).toBe('/employer-demo/chat');
        expect(src.match(/['"`]\/[\w-]+\/[^'"`\s]*['"`]/g)).toEqual([`'${AI_ROUTE}'`]);
        expect(src.match(/\bfetch\s*\(([^,]+),/g)).toEqual(['fetch(AI_ROUTE,', 'fetch(AI_ROUTE,']);
      } else if (f === 'pages.ts') {
        expect(PAGE_ROUTE).toBe('/employer-demo/page');
        expect(src.match(/['"`]\/[\w-]+\/[^'"`\s]*['"`]/g)).toEqual([`'${PAGE_ROUTE}'`]);
        expect(src.match(/\bfetch\s*\(([^,]+),/g)).toEqual(['fetch(PAGE_ROUTE,']);
      } else {
        expect({ f, fetch: /\bfetch\s*\(/.test(src) }).toEqual({ f, fetch: false });
      }
      expect({ f, lib: /from ['"](axios|swr|@tanstack)/.test(src) }).toEqual({ f, lib: false });
      expect({ f, data: /lib\/site\/loadJobs|lib\/shortlist|PublicSite/.test(src) }).toEqual({ f, data: false });
      expect({ f, stream: /\bEventSource\b|\bWebSocket\b|\bXMLHttpRequest\b|\bsendBeacon\b/.test(src) }).toEqual({ f, stream: false });
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

  it('the page route reads pages only through its own reader: no AI or request package, no address written in, no text logged', () => {
    const lib = join(__dirname, '..', '..', 'lib', 'employerDemoPage');
    const server = [join(__dirname, '..', 'employer-demo', 'page', 'route.ts'), ...readdirSync(lib).map((f) => join(lib, f))];
    expect(server.length).toBe(3);
    for (const f of server) {
      const src = readFileSync(f, 'utf8');
      expect({ f, ai: AI_SDK.test(src), lib: /from ['"](axios|got|node-fetch|undici|request)['"]/.test(src) }).toEqual({ f, ai: false, lib: false });
      expect({ f, urls: src.match(/https:\/\/[^\s'"`]+/g) ?? [] }).toEqual({ f, urls: [] });
      expect({ f, logsText: /console\.\w+\([^)]*\b(message|content|context|body|raw|url|address|html)\b/.test(src) }).toEqual({ f, logsText: false });
    }
  });

  it('the page fixes "do not index" in its own layout', () => {
    const layout = readFileSync(join(__dirname, '..', 'employer-demo', 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
    expect(layout).not.toMatch(/SITE_INDEXABLE/);
  });
});
