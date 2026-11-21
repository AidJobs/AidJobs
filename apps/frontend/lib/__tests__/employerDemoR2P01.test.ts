/**
 * R2-P0-1 (21 November 2026): Free/Amplify publish must not go live with empty or unfinished outline sections.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { editSection, outlineOp, publish, publishBlock, publishNow, setFacts } from '../../components/employer-demo/actions';
import { addDays } from '../../components/employer-demo/engine';
import { sectionPublishBlock, sectionPublishGaps } from '../../components/employer-demo/flow';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;
/** Sample draft jobs without a closing date still carry `[Closing date]` in How to apply; dating clears that. */
const dated = (id: string) => setFacts(id, { deadline: addDays(getState().today, 30) });

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({
    ...s,
    signedIn: true,
    free: {},
    // No approval gate: these tests isolate the section publish block (R2-P0-1).
    org: { ...s.org, freeTermsAccepted: true, verified: true, approval: 'off' },
    jobs: s.jobs.map((j) =>
      j.id === 'job-fin' || j.id === 'job-comms'
        ? { ...j, status: 'draft' as const, plan: undefined, publishedAt: undefined, scheduledFor: undefined }
        : j,
    ),
  }));
});

describe('R2-P0-1: section publish gate', () => {
  it('a complete dated sample has no section gaps and can publish Free', () => {
    dated('job-fin');
    expect(sectionPublishGaps(job('job-fin'))).toEqual([]);
    expect(sectionPublishBlock(job('job-fin'))).toBeNull();
    expect(publishBlock(getState(), 'job-fin', { plan: 'free', schedule: null })).toBeNull();
    expect(publish('job-fin', { plan: 'free', schedule: null })).toBe(true);
    expect(job('job-fin').status).toBe('live');
  });

  it('empty outline section blocks Free publish and leaves the job a draft', () => {
    dated('job-fin');
    const key = job('job-fin').tags.find((k) => k !== 'apply') ?? job('job-fin').tags[0];
    const title = job('job-fin').sections.find((x) => x.key === key)?.title ?? key;
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === 'job-fin' ? { ...j, sections: j.sections.map((x) => (x.key === key ? { ...x, lines: [] } : x)) } : j)),
    }));
    const block = sectionPublishBlock(job('job-fin'));
    expect(block).toBe(`Sections still empty or unfinished: ${title}`);
    expect(publishBlock(getState(), 'job-fin', { plan: 'free', schedule: null })).toBe(block);
    expect(publish('job-fin', { plan: 'free', schedule: null })).toBe(false);
    expect(job('job-fin').status).toBe('draft');
  });

  it('tag without a section object blocks publish', () => {
    dated('job-fin');
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => {
        if (j.id !== 'job-fin') return j;
        const tags = j.tags.includes('assessment') ? j.tags : [...j.tags.filter((k) => k !== 'apply'), 'assessment', 'apply'];
        return { ...j, tags, sections: j.sections.filter((x) => x.key !== 'assessment') };
      }),
    }));
    expect(sectionPublishGaps(job('job-fin')).length).toBeGreaterThan(0);
    expect(publish('job-fin', { plan: 'free', schedule: null })).toBe(false);
  });

  it('fact placeholder in a written section blocks publish', () => {
    dated('job-fin');
    const key = job('job-fin').tags.find((k) => k !== 'apply')!;
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === 'job-fin' ? { ...j, sections: j.sections.map((x) => (x.key === key ? { ...x, lines: ['Based in [Duty station].'] } : x)) } : j)),
    }));
    expect(sectionPublishBlock(job('job-fin'))).toMatch(/Sections still empty or unfinished:/);
    expect(publish('job-fin', { plan: 'free', schedule: null })).toBe(false);
  });

  it('template brace and bracket fill-in block publish', () => {
    dated('job-fin');
    const key = job('job-fin').tags.find((k) => k !== 'apply')!;
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === 'job-fin' ? { ...j, sections: j.sections.map((x) => (x.key === key ? { ...x, lines: ['Salary is {amount} per month.'] } : x)) } : j)),
    }));
    expect(publishBlock(getState(), 'job-fin', { plan: 'free', schedule: null })).toMatch(/Sections still empty or unfinished:/);

    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === 'job-fin' ? { ...j, sections: j.sections.map((x) => (x.key === key ? { ...x, lines: ['Closing [to be confirmed] with HR.'] } : x)) } : j)),
    }));
    expect(publishBlock(getState(), 'job-fin', { plan: 'free', schedule: null })).toMatch(/Sections still empty or unfinished:/);
  });

  it('same gate blocks Amplify when essentials are otherwise clear', () => {
    dated('job-fin');
    const key = job('job-fin').tags.find((k) => k === 'responsibilities') ?? job('job-fin').tags.find((k) => k !== 'apply')!;
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === 'job-fin' ? { ...j, sections: j.sections.map((x) => (x.key === key ? { ...x, lines: [] } : x)) } : j)),
    }));
    expect(publishBlock(getState(), 'job-fin', { plan: 'amplify', schedule: null, paid: 'direct' })).toMatch(/Sections still empty or unfinished:/);
    expect(publish('job-fin', { plan: 'amplify', schedule: null, paid: 'direct' })).toBe(false);
  });

  it('custom empty section on the outline blocks until written or removed', () => {
    dated('job-fin');
    outlineOp('job-fin', { op: 'addCustom', heading: 'Week one', group: 'job' });
    const custom = job('job-fin').tags.find((k) => k.startsWith('c-'))!;
    expect(sectionPublishGaps(job('job-fin'))).toContain('Week one');
    expect(publish('job-fin', { plan: 'free', schedule: null })).toBe(false);

    editSection('job-fin', custom, '- Meet the team and read the handover.');
    expect(sectionPublishBlock(job('job-fin'))).toBeNull();
    expect(publish('job-fin', { plan: 'free', schedule: null })).toBe(true);
  });

  it('undated How to apply with [Closing date] is a section gap until the deadline is set', () => {
    expect(sectionPublishGaps(job('job-comms'))).toContain('How to apply');
    expect(publishBlock(getState(), 'job-comms', { plan: 'free', schedule: null })).toMatch(/Missing: the closing date|Sections still empty/);
    dated('job-comms');
    expect(sectionPublishBlock(job('job-comms'))).toBeNull();
  });

  it('Publish now on a scheduled job is blocked when a section is emptied', () => {
    dated('job-fin');
    const key = job('job-fin').tags.find((k) => k !== 'apply')!;
    update((s) => ({
      ...s,
      free: { standard: 'job-fin' },
      jobs: s.jobs.map((j) =>
        j.id === 'job-fin'
          ? {
              ...j,
              status: 'scheduled' as const,
              plan: 'free' as const,
              scheduledFor: '2099-12-01',
              sections: j.sections.map((x) => (x.key === key ? { ...x, lines: [] } : x)),
            }
          : j,
      ),
    }));
    expect(publishNow('job-fin')).toBe(false);
    expect(job('job-fin').status).toBe('scheduled');
    expect(getState().notice?.text).toMatch(/Sections still empty or unfinished:/);
  });
});
