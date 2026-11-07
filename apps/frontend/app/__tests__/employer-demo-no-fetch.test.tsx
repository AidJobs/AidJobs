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
import { addTranslation, reorderSections, reviewerDecision, setReachPlan, toggleSection } from '@/components/employer-demo/actions';
import { planFor } from '@/components/employer-demo/invites';
import { answerFact, basePattern, forgetBase, notNowBase, setBaseFormat, importJobDescription, publish, readIntent, sendChat, sendForReview, setFacts, startJob, undoLastChange } from '@/components/employer-demo/actions';
import DemoRecovery from '@/components/employer-demo/Recover';
import { currentMonth } from '@/components/employer-demo/plans';
import { getState, go, goBack, resetDemo, STORAGE_KEY, update } from '@/components/employer-demo/store';
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
      shows('Approved · ready to publish');
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
    act(() => (container.querySelector('[aria-label="More actions for this job draft"]') as HTMLElement).click());
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
    click(/^Français/);
    shows('Clôture le');
    expect(container.querySelector('article[lang="fr"]')).not.toBeNull();
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
