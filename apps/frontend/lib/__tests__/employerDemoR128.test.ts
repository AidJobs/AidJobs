/**
 * R1-28 (20 November 2026): Pencil Save must not open the How to apply fields card at the top of the JD.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { editSection, setPart } from '../../components/employer-demo/actions';
import { hasFields, sectionPart } from '../../components/employer-demo/parts';
import { getState, resetDemo, update } from '../../components/employer-demo/store';

const job = (id: string) => getState().jobs.find((j) => j.id === id)!;

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  resetDemo();
  update((s) => ({ ...s, signedIn: true }));
});

describe('R1-28: pencil Save does not open How to apply fields', () => {
  it('s:apply is the section that opens a fields card', () => {
    expect(hasFields(sectionPart('apply'))).toBe(true);
    expect(hasFields(sectionPart('responsibilities'))).toBe(false);
  });

  it('Save on How to apply with note=true leaves part unchanged (no fields card)', () => {
    setPart('job-comms', 'details');
    const before = job('job-comms').part;
    expect(before).toBe('details');
    editSection('job-comms', 'apply', 'Email your CV to jobs@example.org by the closing date.', true);
    expect(job('job-comms').part).toBe('details');
    expect(job('job-comms').chat.some((m) => m.from === 'ai' && m.text.includes('by hand'))).toBe(true);
    expect(job('job-comms').sections.find((x) => x.key === 'apply')?.edited).toBe(true);
  });

  it('Save on How to apply when part was already s:apply leaves it (user opened it on purpose)', () => {
    setPart('job-comms', 's:apply');
    editSection('job-comms', 'apply', 'Apply through the portal linked below.', true);
    expect(job('job-comms').part).toBe('s:apply');
  });

  it('Save on a normal section with note=true still pins that section', () => {
    setPart('job-comms', 'details');
    editSection('job-comms', 'responsibilities', '- A duty written by hand', true);
    expect(job('job-comms').part).toBe('s:responsibilities');
  });

  it('Save without note leaves part alone', () => {
    const before = job('job-comms').part;
    editSection('job-comms', 'apply', 'Email only.', false);
    expect(job('job-comms').part).toBe(before);
  });
});
