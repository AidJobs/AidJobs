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
import { learnFormat, publish, readIntent, startJob, writeDraft } from '@/components/employer-demo/actions';
import { getState, go, STORAGE_KEY } from '@/components/employer-demo/store';
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
      ['Start from what you have', 'Use a job description from a link'],
      ['Select a format', 'UN Secretariat format'],
      [/^Continue a draft/, 'Finance Officer'],
    ] as const) {
      const el = Array.from(container.querySelectorAll('button')).find((b) => (typeof tool === 'string' ? b.getAttribute('aria-label') === tool : tool.test(b.getAttribute('aria-label') ?? '')));
      act(() => el?.click());
      shows(inside);
      act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    }
    act(() => (Array.from(container.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Select a format') as HTMLElement).click());
    click('Create your own format');
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
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.getAttribute('aria-label') === 'Format: Riverstone field roles')).toBe(true);
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
      shows('Job description');
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
      writeDraft(id);
    });
    route(`#create/${id}`);
    shows('Job description');
    shows('What you will do');
    shows('Structure');
    for (const pill of [/Nairobi/, /^Job/, /^Grade$/, /^Closes/, /As per our salary scale|Not shown/, /^More$/]) {
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
      writeDraft(id2);
      publish(id2, { plan: 'premium', useCredit: false, schedule: null, reach: { candidates: [{ email: 'a@example.org', status: 'queued' }], team: [], community: true, intro: '' } });
      jest.advanceTimersByTime(5000);
      go('jobs', id2);
    });
    route(window.location.hash);
    shows('1 of 1 sent');

    act(() => {
      expect(learnFormat('WHO WE ARE\nRiverstone works in East Africa.\n\nTHE JOB\nThe officer leads the team.\n\nHOW TO APPLY\nApply online.')).toBe(true);
    });
    expect(getState().formats.find((f) => f.key === 'house')?.order.map((o) => o.heading)).toEqual(['Who we are', 'The job', 'How to apply']);

    expect(network).toEqual([]);
    expect(document.querySelector('script[src*="paddle"]')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"v":2');
    for (const k of Object.keys(localStorage)) expect(k.startsWith('aidjobs.')).toBe(true);
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
