/**
 * R2-P0-4 (21 November 2026): Project Save keeps the format heading; grip can add
 * "About the project" when background already exists without that sub.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { applyFormat, changeSub, editSection, formatOf, outlineOp } from '../../components/employer-demo/actions';
import { PROJECT_SECTION, savePageFieldText } from '../../components/employer-demo/context';
import { headingFor } from '../../components/employer-demo/engine';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const PROJECT_SUB = 'About the project';
const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
const sec = (id: string, key: string) => job(id).sections.find((x) => x.key === key);

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

function ensureBackground(id: string, lines = 'The country office runs water work in Turkana.') {
  applyFormat(id, 'local-concise');
  if (job(id).tags.includes(PROJECT_SECTION) && sec(id, PROJECT_SECTION)) {
    outlineOp(id, { op: 'remove', key: PROJECT_SECTION });
  }
  if (job(id).tags.includes(PROJECT_SECTION) && !sec(id, PROJECT_SECTION)) {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, tags: j.tags.filter((k) => k !== PROJECT_SECTION) } : j)),
    }));
  }
  outlineOp(id, { op: 'add', key: PROJECT_SECTION });
  editSection(id, PROJECT_SECTION, lines);
}

describe('R2-P0-4: Project Save heading and grip About the project sub', () => {
  it('savePageFieldText keeps Project brief and writes About the project under existing Background lines', () => {
    ensureBackground('job-comms');
    expect(headingFor(PROJECT_SECTION, formatOf(getState(), 'local-concise'))).toBe('Project brief');
    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('Project brief');

    savePageFieldText('job-comms', 'project', 'The Clean Water project repairs 40 water points.');

    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('Project brief');
    expect(job('job-comms').renamed?.background).not.toBe(PROJECT_SUB);
    expect(sec('job-comms', PROJECT_SECTION)?.lines).toEqual(['The country office runs water work in Turkana.']);
    expect(sec('job-comms', PROJECT_SECTION)?.subs?.map((x) => [x.title, x.lines])).toEqual([
      [PROJECT_SUB, ['The Clean Water project repairs 40 water points.']],
    ]);
  });

  it('changeSub adds About the project without renaming; grip guard sees the sub so Add is not offered again', () => {
    ensureBackground('job-comms');
    const titleBefore = sec('job-comms', PROJECT_SECTION)?.title;
    expect(titleBefore).toBe('Project brief');
    expect(sec('job-comms', PROJECT_SECTION)?.subs?.some((sb) => sb.title === PROJECT_SUB)).toBeFalsy();

    changeSub('job-comms', PROJECT_SECTION, { add: PROJECT_SUB });
    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe(titleBefore);
    expect(sec('job-comms', PROJECT_SECTION)?.subs?.filter((sb) => sb.title === PROJECT_SUB)).toHaveLength(1);
    // Same guard as DocPane grip: once the sub exists, do not offer Add About the project.
    expect(Boolean(sec('job-comms', PROJECT_SECTION)?.subs?.some((sb) => sb.title === PROJECT_SUB))).toBe(true);
  });

  it('INGO Background: Save project text keeps Background as the section title', () => {
    applyFormat('job-comms', 'ingo-role-profile');
    if (job('job-comms').tags.includes(PROJECT_SECTION) && sec('job-comms', PROJECT_SECTION)) {
      outlineOp('job-comms', { op: 'remove', key: PROJECT_SECTION });
    }
    if (job('job-comms').tags.includes(PROJECT_SECTION) && !sec('job-comms', PROJECT_SECTION)) {
      update((s) => ({
        ...s,
        jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, tags: j.tags.filter((k) => k !== PROJECT_SECTION) } : j)),
      }));
    }
    outlineOp('job-comms', { op: 'add', key: PROJECT_SECTION });
    editSection('job-comms', PROJECT_SECTION, 'Programme background for the country office.');
    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('Background');

    savePageFieldText('job-comms', 'project', 'This job supports the Clean Water programme.');

    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('Background');
    expect(sec('job-comms', PROJECT_SECTION)?.lines).toEqual(['Programme background for the country office.']);
    expect(sec('job-comms', PROJECT_SECTION)?.subs?.map((x) => [x.title, x.lines])).toEqual([
      [PROJECT_SUB, ['This job supports the Clean Water programme.']],
    ]);
  });
});
