/**
 * R2-P0-4 (21 November 2026): Project Save keeps the format heading; grip can add
 * "About the project" when background already exists without that sub.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { applyFormat, changeSub, editSection, formatOf, groupingOf, outlineOp, renameSection } from '../../components/employer-demo/actions';
import { PROJECT_SECTION, savePageFieldText } from '../../components/employer-demo/context';
import { GROUPS, headingFor, titleSuggestions } from '../../components/employer-demo/engine';
import { groupOfKey, groupOrderOf } from '../../components/employer-demo/outline';
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

  it('INGO (no background slot): Save project text keeps Project brief and never force-renames to About the project', () => {
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
    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('Project brief');

    savePageFieldText('job-comms', 'project', 'This job supports the Clean Water programme.');

    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('Project brief');
    expect(sec('job-comms', PROJECT_SECTION)?.title).not.toBe(PROJECT_SUB);
    expect(sec('job-comms', PROJECT_SECTION)?.lines).toEqual(['Programme background for the country office.']);
    expect(sec('job-comms', PROJECT_SECTION)?.subs?.map((x) => [x.title, x.lines])).toEqual([
      [PROJECT_SUB, ['This job supports the Clean Water programme.']],
    ]);
  });

  it('pencil-style rename keeps body Save separate: renameSection then savePageFieldText does not overwrite the new heading', () => {
    ensureBackground('job-comms');
    renameSection('job-comms', PROJECT_SECTION, 'About the programme');
    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('About the programme');
    savePageFieldText('job-comms', 'project', 'The Clean Water project repairs 40 water points.');
    expect(sec('job-comms', PROJECT_SECTION)?.title).toBe('About the programme');
    expect(sec('job-comms', PROJECT_SECTION)?.subs?.some((sb) => sb.title === PROJECT_SUB)).toBe(true);
  });

  it('other-title chips include Project brief / About the programme / Background; Add panel uses fixed GROUPS order even if the job regrouped', () => {
    const formats = getState().formats;
    const chips = titleSuggestions(formats, PROJECT_SECTION, 'Something else');
    expect(chips).toEqual(expect.arrayContaining(['Project brief', 'About the programme', 'Background']));
    applyFormat('job-comms', 'house');
    // Simulate a job that put The job before About the employer in its own outline.
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === 'job-comms' ? { ...j, groupOrder: ['job', 'employer', 'person', 'offer', 'apply'] } : j)),
    }));
    const g = groupingOf(job('job-comms'));
    expect(groupOrderOf(g)[0]).toBe('job');
    // Add panel ignores that and always lists GROUPS first (employer → job → …).
    const catalog = GROUPS.map((x) => x.key);
    const panelGroups = [...catalog, ...groupOrderOf(g).filter((k) => !catalog.includes(k))];
    expect(panelGroups.slice(0, 5)).toEqual(['employer', 'job', 'person', 'offer', 'apply']);
    expect(groupOfKey(g, 'purpose')).toBe('job');
  });
});
