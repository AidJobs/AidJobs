import { describe, expect, it } from '@jest/globals';
import {
  applyEdit,
  buildSections,
  detectFamily,
  extractFacts,
  holiday,
  quality,
  recommendTags,
  suggestNext,
  weekend,
} from '../../components/employer-demo/engine';
import { SAMPLE_ORG } from '../../components/employer-demo/sample';

const TODAY = new Date(2026, 10, 3).getTime();

describe('employer demo engine: reading the first message', () => {
  it('reads role, place, grade, duration, contract, deadline, salary, and languages from one sentence', () => {
    const { facts, family } = extractFacts(
      "We're hiring a WASH Programme Manager in Nairobi, 12-month fixed-term contract at P4 level, closing 30 November 2026, salary USD 4,800 to 5,600 a month. English required, French an advantage",
      TODAY,
    );
    expect(family?.key).toBe('wash');
    expect(facts.title).toBe('WASH Programme Manager');
    expect(facts.location).toBe('Nairobi, Kenya');
    expect(facts.iso).toBe('KE');
    expect(facts.grade).toBe('P4');
    expect(facts.duration).toBe('12 months');
    expect(facts.contract).toBe('Fixed-term');
    expect(facts.deadline).toBe('2026-11-30');
    expect(facts.salary).toBe('USD 4,800 to 5,600 a month');
    expect(facts.languages).toEqual(['English', 'French']);
  });

  it('treats consultancy, internship, and surge as modifiers of the subject', () => {
    expect(detectFamily('WASH consultant for 40 days').modifier).toBe('consultancy');
    expect(detectFamily('communications internship').modifier).toBe('internship');
    expect(detectFamily('emergency health surge roster').modifier).toBe('surge');
    expect(detectFamily('Project manager, livelihoods').family?.key).toBe('livelihoods');
    expect(detectFamily('Project manager').family?.key).toBe('programme');
  });

  it('reads a day and month without a year as the next one to come', () => {
    expect(extractFacts('closing 5 March', TODAY).facts.deadline).toBe('2027-03-05');
    expect(extractFacts('closing in 2 weeks', TODAY).facts.deadline).toBe('2026-11-17');
  });
});

describe('employer demo engine: tags', () => {
  it('recommends the core sections, and deliverables and payment for a consultancy', () => {
    const { facts, family, modifier } = extractFacts('Hiring a WASH consultant in Juba', TODAY);
    const tags = recommendTags(family, modifier, facts);
    expect(tags).toEqual(expect.arrayContaining(['role', 'qualifications', 'apply', 'deliverables', 'payment', 'security']));
    expect(tags).not.toContain('responsibilities');
  });

  it('adds organisational setting and competencies for a P grade', () => {
    const { facts, family, modifier } = extractFacts('Hiring a Health Programme Officer, P3, Geneva', TODAY);
    expect(recommendTags(family, modifier, facts)).toEqual(expect.arrayContaining(['setting', 'competencies']));
  });
});

describe('employer demo engine: ghost text', () => {
  it('suggests the next missing fact, in order', () => {
    expect(suggestNext('', TODAY)).toBe("We're hiring a WASH Programme Manager");
    expect(suggestNext("We're hiring a WASH Programme Manager", TODAY)).toBe(' in Nairobi, Kenya');
    expect(suggestNext("We're hiring a WASH Programme Manager in Nairobi", TODAY)).toBe(', 12-month fixed-term contract');
    expect(suggestNext("We're hiring a WASH Programme Manager in Nairobi ", TODAY)).toBe(', 12-month fixed-term contract');
  });

  it('suggests nothing when every fact is there', () => {
    expect(suggestNext('Hiring a WASH Programme Manager in Nairobi, 12 months, P4, closing 30 November 2026, USD 5,000 a month, English', TODAY)).toBe('');
  });
});

describe('employer demo engine: writing and editing', () => {
  const { facts } = extractFacts('Hiring a WASH Programme Manager in Juba, P4, 12 months, closing 30 November 2026', TODAY);
  const ctx = { facts, familyKey: 'wash', org: SAMPLE_ORG, tone: 'warm' as const, modifier: null };

  it("writes sections in the tag order, using the organisation's locked standard text as written", () => {
    const sections = buildSections(['apply', 'role', 'equal', 'responsibilities', 'setting'], ctx);
    expect(sections.map((s) => s.key)).toEqual(['setting', 'role', 'responsibilities', 'apply', 'equal']);
    const equal = sections[4];
    expect(equal.lines[0]).toBe(SAMPLE_ORG.standard.find((s) => s.key === 'equal')?.text);
    expect(sections[2].lines.filter((l) => l.startsWith('- ')).length).toBeGreaterThan(3);
  });

  it('shortens, changes tone, adds a language, and removes a section from the chat', () => {
    const tags = ['role', 'responsibilities', 'qualifications', 'apply'];
    const sections = buildSections(tags, ctx);
    const shorter = applyEdit('shorten the responsibilities', tags, sections, ctx, TODAY);
    expect(shorter.sections.find((s) => s.key === 'responsibilities')?.lines.filter((l) => l.startsWith('- ')).length).toBe(3);
    const formal = applyEdit('make it more formal', tags, sections, ctx, TODAY);
    expect(formal.tone).toBe('formal');
    expect(formal.sections.find((s) => s.key === 'role')?.lines[0]).toMatch(/seeks a/);
    const french = applyEdit('add French as an advantage', tags, sections, ctx, TODAY);
    expect(french.tags).toContain('languages');
    expect(french.facts.languages).toEqual(['English', 'French']);
    const removed = applyEdit('remove how to apply', tags, sections, ctx, TODAY);
    expect(removed.tags).not.toContain('apply');
  });

  it('keeps sections edited by hand when the tone changes', () => {
    const tags = ['role', 'apply'];
    const sections = buildSections(tags, ctx).map((s) => (s.key === 'role' ? { ...s, lines: ['My own words.'], edited: true } : s));
    const formal = applyEdit('more formal', tags, sections, ctx, TODAY);
    expect(formal.sections.find((s) => s.key === 'role')?.lines).toEqual(['My own words.']);
  });
});

describe('employer demo engine: quality checks', () => {
  it('flags a missing deadline as an issue and a missing salary as a warning', () => {
    const { facts } = extractFacts('Hiring a Finance Officer in Kampala', TODAY);
    const items = quality(buildSections(['role', 'responsibilities', 'apply'], { facts, familyKey: 'finance', org: SAMPLE_ORG, tone: 'plain', modifier: null }), facts, TODAY, []);
    expect(items.find((i) => i.key === 'deadline')?.level).toBe('issue');
    expect(items.find((i) => i.key === 'salary')?.level).toBe('warn');
    expect(items.find((i) => i.key === 'google')?.level).toBe('warn');
  });

  it('warns about wording that excludes people, weekends, holidays, and a duplicate title', () => {
    const { facts } = extractFacts('Hiring a Finance Officer in Nairobi, closing 12 December 2026', TODAY);
    const sections = [{ key: 'role', title: 'The role', lines: ['He will manage a young, energetic team.'] }];
    const items = quality(sections, facts, TODAY, ['Finance Officer']);
    expect(items.some((i) => i.section === 'role' && /they/.test(i.text))).toBe(true);
    expect(items.some((i) => i.key === 'deadline-holiday')).toBe(true);
    expect(items.some((i) => i.key === 'deadline-weekend')).toBe(true);
    expect(items.some((i) => i.key === 'duplicate')).toBe(true);
    expect(weekend('2026-11-28')).toBe(true);
    expect(holiday('2026-12-12', 'KE')).toBe(true);
    expect(holiday('2026-12-12', 'UG')).toBe(false);
  });
});
