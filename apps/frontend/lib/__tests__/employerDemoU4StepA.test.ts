/**
 * U-4 Step A (20 November 2026): one background slot — format heading on Add; no force-rename to "About the project";
 * when Project brief (or any background) already exists, a second add is refused.
 * Step B (drag threshold) is separate.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { applyFormat, formatOf, outlineOp } from '../../components/employer-demo/actions';
import { acceptPageDraft, PROJECT_SECTION, showPageDraft } from '../../components/employer-demo/context';
import { headingFor } from '../../components/employer-demo/engine';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const sec = (id: string, key: string) => job(id).sections.find((x) => x.key === key);

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

/** Ensure the background section object exists (applyFormat may only put the key on tags; add is refused while the tag is there). */
function ensureBackground(id: string) {
  if (sec(id, PROJECT_SECTION)) return;
  if (job(id).tags.includes(PROJECT_SECTION)) {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, tags: j.tags.filter((k) => k !== PROJECT_SECTION) } : j)),
    }));
  }
  outlineOp(id, { op: 'add', key: PROJECT_SECTION });
}

describe('U-4 Step A: background naming and Add', () => {
  it('Local NGO concise: Add background uses Project brief and never renames to About the project', () => {
    applyFormat('job-comms', 'local-concise');
    const format = formatOf(getState(), 'local-concise');
    expect(headingFor(PROJECT_SECTION, format)).toBe('Project brief');

    if (job('job-comms').tags.includes(PROJECT_SECTION) && sec('job-comms', PROJECT_SECTION)) {
      expect(job('job-comms').tags.length).toBeGreaterThan(1);
      outlineOp('job-comms', { op: 'remove', key: PROJECT_SECTION });
    }
    // Clear a tag-only leftover so add can create the section.
    if (job('job-comms').tags.includes(PROJECT_SECTION) && !sec('job-comms', PROJECT_SECTION)) {
      update((s) => ({
        ...s,
        jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, tags: j.tags.filter((k) => k !== PROJECT_SECTION) } : j)),
      }));
    }

    outlineOp('job-comms', { op: 'add', key: PROJECT_SECTION });
    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('Project brief');
    expect(sec('job-comms', PROJECT_SECTION)?.title).not.toBe('About the project');
  });

  it('when Project brief already exists, a second background add is refused', () => {
    applyFormat('job-comms', 'local-concise');
    ensureBackground('job-comms');
    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('Project brief');
    expect(job('job-comms').tags.filter((k) => k === PROJECT_SECTION)).toEqual([PROJECT_SECTION]);
    outlineOp('job-comms', { op: 'add', key: PROJECT_SECTION });
    expect(job('job-comms').tags.filter((k) => k === PROJECT_SECTION)).toEqual([PROJECT_SECTION]);
    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('Project brief');
  });

  it('ingo Background: grip-style add without rename keeps Background', () => {
    applyFormat('job-comms', 'ingo-role-profile');
    expect(headingFor(PROJECT_SECTION, formatOf(getState(), 'ingo-role-profile'))).toBe('Background');
    if (job('job-comms').tags.includes(PROJECT_SECTION) && sec('job-comms', PROJECT_SECTION)) {
      expect(job('job-comms').tags.length).toBeGreaterThan(1);
      outlineOp('job-comms', { op: 'remove', key: PROJECT_SECTION });
    }
    if (job('job-comms').tags.includes(PROJECT_SECTION) && !sec('job-comms', PROJECT_SECTION)) {
      update((s) => ({
        ...s,
        jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, tags: j.tags.filter((k) => k !== PROJECT_SECTION) } : j)),
      }));
    }
    outlineOp('job-comms', { op: 'add', key: PROJECT_SECTION, after: job('job-comms').tags[0] });
    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('Background');
  });

  it('Accept of a new project draft uses the format heading, not About the project as the section title', () => {
    applyFormat('job-comms', 'local-concise');
    if (job('job-comms').tags.includes(PROJECT_SECTION) && sec('job-comms', PROJECT_SECTION)) {
      expect(job('job-comms').tags.length).toBeGreaterThan(1);
      outlineOp('job-comms', { op: 'remove', key: PROJECT_SECTION });
    }
    if (job('job-comms').tags.includes(PROJECT_SECTION)) {
      update((s) => ({
        ...s,
        jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, tags: j.tags.filter((k) => k !== PROJECT_SECTION) } : j)),
      }));
    }
    showPageDraft('job-comms', {
      kind: 'project',
      lines: ['The Clean Water project repairs 40 water points.'],
      used: 'x',
      missing: '',
      source: 'the project page',
      social: [],
    });
    acceptPageDraft('job-comms');
    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('Project brief');
    expect(job('job-comms').renamed?.background).toBeUndefined();
  });
});
