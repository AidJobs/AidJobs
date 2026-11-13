import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sendForReview, startJob } from '@/components/employer-demo/actions';
import { addOrgSocial, socialLabel, socialOf, socialUrl, toggleJobSocial } from '@/components/employer-demo/context';
import { Reveal, RevealBlock } from '@/components/employer-demo/Reveal';
import { ReviewForm } from '@/components/employer-demo/Review';
import { JobPage } from '@/components/employer-demo/Publish';
import { getState, resetDemo, update } from '@/components/employer-demo/store';

let container: HTMLDivElement;
let root: Root;
let reduced = false;
const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const render = (node: React.ReactNode) => act(() => root.render(node));

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (q: string) => ({ matches: reduced && q.includes('reduce'), media: q, addEventListener: () => {}, removeEventListener: () => {} }) });
});

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
  reduced = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

afterAll(() => {
  jest.restoreAllMocks();
});

const TEXT = 'Here is The role, written from what you told me. It names the duty station and the team. Good, or change something?';

describe('text appearing as it is written (section 19, phase 5, E)', () => {
  it('reveals the text progressively; a screen reader has the finished message at once', () => {
    render(<Reveal id="m-1" text={TEXT} active render={(t) => <span>{t}</span>} />);
    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden?.textContent?.length).toBeLessThan(TEXT.length);
    expect(container.querySelector('.sr-only')?.textContent).toBe(TEXT);
    act(() => jest.advanceTimersByTime(2000));
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(container.textContent).toBe(TEXT);
  });

  it('with reduced motion the text appears at once', () => {
    reduced = true;
    render(<Reveal id="m-2" text={TEXT} active render={(t) => <span>{t}</span>} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(container.textContent).toBe(TEXT);
  });

  it('a new message finishes the reveal at once, and a message already revealed is never revealed again', () => {
    render(<Reveal id="m-3" text={TEXT} active render={(t) => <span>{t}</span>} />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    render(<Reveal id="m-3" text={TEXT} active={false} render={(t) => <span>{t}</span>} />);
    expect(container.textContent).toBe(TEXT);
    render(<Reveal id="m-3" text={TEXT} active render={(t) => <span>{t}</span>} />);
    expect(container.textContent).toBe(TEXT);
  });
});

describe('a section written while the window is open is revealed once, with all its content there (section 19, phase 5, E)', () => {
  it('wipes the section in once; its links and placeholders are there throughout; not again after it has shown', () => {
    render(
      <RevealBlock id="s-1" active>
        <button type="button">[Duty station]</button>
      </RevealBlock>,
    );
    expect(container.querySelector('.ej-reveal button')?.textContent).toBe('[Duty station]');
    act(() => container.querySelector('.ej-reveal')?.dispatchEvent(new Event('animationend', { bubbles: true })));
    act(() => root.unmount());
    root = createRoot(container);
    render(
      <RevealBlock id="s-1" active>
        <button type="button">[Duty station]</button>
      </RevealBlock>,
    );
    expect(container.querySelector('.ej-reveal')).toBeNull();
    render(
      <RevealBlock id="s-2" active={false}>
        <p>Text edited by hand</p>
      </RevealBlock>,
    );
    expect(container.querySelector('.ej-reveal')).toBeNull();
  });
});

describe('the chat looks plain, and focus follows each control’s corners (section 19, phase 5, E)', () => {
  const css = readFileSync(join(__dirname, '..', '..', 'components', 'employer-demo', 'employer-demo.css'), 'utf8').replace(/\r\n/g, '\n');
  const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

  it("no dark box for the user's message, no box or outline for the reply; a faint “You” over the user's message", () => {
    expect(rule(".ej-bubble[data-from='user']")).not.toMatch(/background|border/);
    expect(rule(".ej-bubble[data-from='ai']")).not.toMatch(/background|border/);
    expect(rule(".ej-bubble[data-from='user']::before")).toMatch(/content: 'You'/);
    expect(rule('.aj-root .ej-bubble .ej-answer')).toMatch(/background: transparent/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.ej-reveal \{\s*animation: none;/);
  });

  it('every colour token the demo uses is defined by the site, so no rule falls back without a colour (found by the screen check)', () => {
    const site = readFileSync(join(__dirname, '..', '..', 'components', 'site', 'site.css'), 'utf8');
    const defined = new Set([...site.matchAll(/(--[\w-]+)\s*:/g), ...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const used = Array.from(new Set(Array.from(css.matchAll(/var\((--[\w-]+)\)/g)).map((m) => m[1])));
    expect(used.filter((v) => !defined.has(v))).toEqual([]);
  });

  it('every focus rule draws a ring that follows the corners, not a square outline', () => {
    const focus = Array.from(css.matchAll(/([^{}]*:focus(?:-visible|-within)?[^{}]*)\{([^}]*)\}/g));
    expect(focus.length).toBeGreaterThan(5);
    for (const [, selector, body] of focus) expect({ selector: selector.trim(), outline: /outline:\s*\d/.test(body) }).toEqual({ selector: selector.trim(), outline: false });
  });
});

describe('the review date is optional (section 19, phase 5, E)', () => {
  it('"No date": the email names no date and the review has none; a date picked is named', () => {
    const id = startJob('Hiring a Shelter Officer in Goma, closing in 6 weeks');
    render(<ReviewForm job={job(id)} s={getState()} onSent={() => {}} />);
    expect(container.textContent).toMatch(/asks you to review Shelter Officer by /);
    act(() => (Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'No date') as HTMLElement).click());
    expect(container.textContent).not.toMatch(/asks you to review Shelter Officer by /);
    act(() => (Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith('Send to')) as HTMLElement).click());
    expect(job(id).review).toMatchObject({ state: 'open', due: '' });
  });

  it('a date picked from the calendar is the one named and kept', () => {
    const id = startJob('Hiring a Driver in Goma, closing in 6 weeks');
    render(<ReviewForm job={job(id)} s={getState()} onSent={() => {}} />);
    const input = container.querySelector('input[aria-label="Pick a date to answer by"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '2027-01-20');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.textContent).toContain('by 20 January 2027');
    act(() => (Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith('Send to')) as HTMLElement).click());
    expect(job(id).review.due).toBe('2027-01-20');
    sendForReview(id, [{ name: 'Amina Yusuf', email: 'amina@riverstone.example.org', outside: false }], '', 'any', '');
    expect(job(id).review.due).toBe('');
  });
});

describe('social links (section 19, phase 5, E)', () => {
  it('kept by the organisation, https only; each job includes or leaves out each, for that job only', () => {
    expect(socialUrl('http://x.com/riverstone')).toBeNull();
    expect(socialUrl('linkedin.com/company/riverstone-aid/')).toBe('https://linkedin.com/company/riverstone-aid');
    expect(addOrgSocial('https://www.linkedin.com/company/riverstone-aid')).toBe(true);
    expect(addOrgSocial('https://x.com/riverstoneaid')).toBe(true);
    expect(addOrgSocial('ftp://x.com/nope')).toBe(false);
    expect(socialLabel('https://www.linkedin.com/company/riverstone-aid')).toBe('LinkedIn');
    toggleJobSocial('job-cps', 'https://x.com/riverstoneaid');
    expect(socialOf(getState(), job('job-cps'))).toEqual(['https://www.linkedin.com/company/riverstone-aid']);
    expect(socialOf(getState(), job('job-fin'))).toHaveLength(2);
  });

  it('shown as a row on the public job page, not inside About us', () => {
    addOrgSocial('https://www.linkedin.com/company/riverstone-aid');
    render(<JobPage job={job('job-cps')} s={getState()} />);
    const row = container.querySelector('nav[aria-label="Riverstone Aid elsewhere"]');
    expect(row?.textContent).toContain('LinkedIn');
    expect(row?.closest('section')).toBeNull();
    const about = Array.from(container.querySelectorAll('section')).find((x) => x.querySelector('h3')?.textContent === job('job-cps').sections.find((y) => y.key === 'about')?.title);
    expect(about?.textContent ?? '').not.toContain('LinkedIn');
  });
});
