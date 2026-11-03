import { describe, expect, it } from '@jest/globals';
import { applyLines, defaultApply } from '../../components/employer-demo/apply';
import {
  addSuggestions,
  applyEdit,
  buildSection,
  detectRole,
  emptyFacts,
  extractFacts,
  findInclusive,
  FORMATS,
  googleType,
  headingFor,
  holiday,
  quality,
  readPasted,
  recommendSections,
  salarySuggestion,
  salaryText,
  weekend,
} from '../../components/employer-demo/engine';
import { HOUSE_FORMAT, SAMPLE_ORG } from '../../components/employer-demo/sample';
import type { Facts } from '../../components/employer-demo/types';

const TODAY = new Date(2026, 10, 3).getTime();
const fmt = (k: string) => FORMATS.find((f) => f.key === k) ?? HOUSE_FORMAT;
const ctx = (facts: Facts, formatKey = 'house') => ({ facts, roleKey: 'wash', org: SAMPLE_ORG, tone: 'warm' as const, format: fmt(formatKey), commitments: [], applyLines: ['Apply online.'] });

describe('formats: ten real formats in four families, named by format', () => {
  it('has the ten formats and the four families from the research', () => {
    expect(FORMATS).toHaveLength(10);
    expect(new Set(FORMATS.map((f) => f.family))).toEqual(new Set(['UN and multilateral', 'INGO and humanitarian', 'Donors, foundations and contractors', 'National NGOs and charities']));
  });

  it('uses each format’s own heading for the same section', () => {
    expect(headingFor('responsibilities', fmt('ingo-role-profile'))).toBe('Key areas of accountability');
    expect(headingFor('responsibilities', fmt('ingo-purpose'))).toBe('Key responsibilities');
    expect(headingFor('responsibilities', fmt('field-profile'))).toBe('Accountabilities');
    expect(headingFor('responsibilities', fmt('donor'))).toBe('Your tasks');
    expect(headingFor('setting', fmt('un-secretariat'))).toBe('Org. setting and reporting');
    expect(headingFor('deliverables', fmt('ingo-purpose'))).toBe('Deliverables');
  });
});

describe('reading the first message', () => {
  it('reads role, place, time zone, grade, duration, contract, deadline, salary, and languages', () => {
    const { facts, role } = extractFacts(
      "We're hiring a WASH Programme Manager in Nairobi, 12-month fixed-term contract at P4 level, closing 30 November 2026, salary USD 4,800 to 5,600 a month. English required, French an advantage",
      TODAY,
    );
    expect(role?.key).toBe('wash');
    expect(facts).toMatchObject({ title: 'WASH Programme Manager', location: 'Nairobi, Kenya', iso: 'KE', timezone: 'EAT', grade: 'P4', duration: '12 months', contract: 'Fixed-term', deadline: '2026-11-30', salaryMode: 'range', salaryMin: '4,800', salaryMax: '5,600', currency: 'USD', period: 'month' });
    expect(facts.languages).toEqual(['English', 'French']);
  });

  it('reads engagement, work arrangement, recruitment, and funding conditions', () => {
    expect(detectRole('WASH consultant for 40 days').engagement).toBe('consultancy');
    expect(detectRole('communications internship').engagement).toBe('internship');
    expect(detectRole('volunteer health promoter').engagement).toBe('volunteer');
    expect(extractFacts('hybrid role in London', TODAY).facts.arrangement).toBe('hybrid');
    expect(extractFacts('emergency roster for health staff', TODAY).facts.recruitment).toBe('roster');
    expect(extractFacts('Chief of Party, key personnel, contingent on award', TODAY).facts.recruitment).toBe('proposal');
    expect(extractFacts('officer post, subject to funding', TODAY).facts.subjectToFunding).toBe(true);
  });

  it('does not take "5 years experience" as a contract duration', () => {
    expect(extractFacts('needs 5 years experience', TODAY).facts.duration).toBe('');
  });
});

describe('sections, job types, and recruitment', () => {
  it('adds deliverables for a consultancy, deployment for a roster, funding for a proposal, conditions for a risky place', () => {
    const f = { ...emptyFacts(), engagement: 'consultancy' as const };
    expect(recommendSections(fmt('house'), f)).toContain('deliverables');
    expect(recommendSections(fmt('house'), { ...emptyFacts(), recruitment: 'roster' })).toContain('deployment');
    expect(recommendSections(fmt('house'), { ...emptyFacts(), recruitment: 'proposal' })).toContain('funding');
    expect(recommendSections(fmt('house'), { ...emptyFacts(), location: 'Juba, South Sudan' })).toContain('conditions');
  });

  it('writes the honest wording each recruitment type needs', () => {
    expect(buildSection('funding', ctx({ ...emptyFacts(), recruitment: 'proposal', client: 'FCDO', keyPersonnel: true })).lines[0]).toBe('This position is contingent upon contract award by FCDO and client approval of key personnel.');
    expect(buildSection('deployment', ctx({ ...emptyFacts(), recruitment: 'roster' })).lines.join(' ')).toContain('Being on the roster is unpaid');
    expect(buildSection('offer', ctx({ ...emptyFacts(), subjectToFunding: true })).lines).toContain('This post is subject to continued funding.');
  });

  it('keeps essential and desirable apart', () => {
    const lines = buildSection('requirements', ctx(emptyFacts())).lines;
    expect(lines[0]).toBe('Essential:');
    expect(lines).toContain('Desirable:');
  });

  it('maps to Google job types', () => {
    expect(googleType({ ...emptyFacts(), engagement: 'job', hours: 'part' })).toEqual(['PART_TIME']);
    expect(googleType({ ...emptyFacts(), engagement: 'consultancy' })).toEqual(['CONTRACTOR']);
    expect(googleType({ ...emptyFacts(), engagement: 'volunteer' })).toEqual(['VOLUNTEER']);
  });
});

describe('salary: shown the organisation’s way, suggested only with a basis', () => {
  it('writes each display mode', () => {
    const f = { ...emptyFacts(), currency: 'KES', salaryMin: '180,000', salaryMax: '260,000', period: 'month' as const };
    expect(salaryText({ ...f, salaryMode: 'range' })).toBe('KES 180,000 to 260,000 a month');
    expect(salaryText({ ...f, salaryMode: 'scale' })).toBe('As per our salary scale');
    expect(salaryText({ ...f, salaryMode: 'hidden' })).toBe('');
  });

  it('suggests from the organisation’s own scale first, and returns nothing without a basis', () => {
    expect(salarySuggestion({ ...emptyFacts(), grade: 'C1' }, SAMPLE_ORG)?.basis).toContain('Riverstone salary scale');
    expect(salarySuggestion({ ...emptyFacts(), grade: 'P4', location: 'Nairobi, Kenya' }, { ...SAMPLE_ORG, scale: [] })?.basis).toContain('ICSC');
    expect(salarySuggestion({ ...emptyFacts(), location: 'Dakar, Senegal' }, { ...SAMPLE_ORG, scale: [] })).toBeNull();
  });
});

describe('quality checks', () => {
  it('flags placeholders, duplicate bullets, thin duties, and a conflicting date, and never salary', () => {
    const f = { ...emptyFacts(), title: 'Officer', location: 'Nairobi, Kenya', iso: 'KE', deadline: '2026-11-30' };
    const sections = [
      { key: 'purpose', title: 'The role', lines: ['Oxfam {affiliate/} is looking for an officer.'] },
      { key: 'responsibilities', title: 'Responsibilities', lines: ['- Do one thing'] },
      { key: 'requirements', title: 'Requirements', lines: ['- A degree', '- A degree'] },
      { key: 'apply', title: 'How to apply', lines: ['Apply by 10 December 2026.'] },
    ];
    const keys = quality(sections, f, TODAY, []).map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(['placeholder-purpose', 'duties-empty', 'dupe-requirements', 'date-apply']));
    expect(keys.some((k) => k.startsWith('salary'))).toBe(false);
    expect(weekend('2026-11-28')).toBe(true);
    expect(holiday('2026-12-12', 'KE')).toBe(true);
  });
});

describe('one-click additions', () => {
  it('offers up to five high-value sections the format and the facts leave out', () => {
    const f = { ...emptyFacts(), location: 'Juba, South Sudan' };
    const offered = addSuggestions(fmt('house'), f);
    expect(offered).toHaveLength(5);
    expect(offered[0]).toBe('assessment');
    expect(offered).not.toContain('offer');
    expect(offered).not.toContain('conditions');
    expect(addSuggestions(fmt('un-secretariat'), f)).toContain('offer');
  });
});

describe('chat edits', () => {
  it('marks a section changed through the chat as the user’s own, so a style switch keeps it', () => {
    const f = { ...emptyFacts(), title: 'WASH Programme Manager', location: 'Juba, South Sudan' };
    const c = ctx(f);
    const keys = ['purpose', 'responsibilities'];
    const sections = keys.map((k) => buildSection(k, c));
    const added = applyEdit('they lead a team of twelve', keys, sections, c, TODAY).sections.find((s) => s.key === 'purpose');
    expect(added?.lines.at(-1)).toBe('They lead a team of twelve.');
    expect(added?.edited).toBe(true);
    const longer = applyEdit('make the responsibilities longer', keys, sections, c, TODAY).sections.find((s) => s.key === 'responsibilities');
    expect(longer?.edited).toBe(true);
  });
});

describe('inclusive language: highlight only, with a reason', () => {
  it('finds gender-coded words, pronouns, and "native speaker", in order', () => {
    const hits = findInclusive('He is a competitive native speaker.', 'charity');
    expect(hits.map((h) => h.rule.id)).toEqual(['pronoun', 'masculine', 'native']);
    expect(hits[1].rule.source).toContain('Gaucher');
  });

  it('does not flag years of experience in UN formats, where grades set them', () => {
    expect(findInclusive('At least 7 years of experience', 'un-secretariat')).toHaveLength(0);
    expect(findInclusive('At least 7 years of experience', 'charity').map((h) => h.rule.id)).toEqual(['years']);
  });
});

describe('pasted adverts and the apply builder', () => {
  it('reads headings and keeps the wording', () => {
    const parsed = readPasted('JOB PURPOSE\nThe officer supports the team.\n\nKEY RESPONSIBILITIES\n• Coordinate partners\n• Report monthly\n\nHow to apply:\nEmail your CV.');
    expect(parsed.map((p) => p.key)).toEqual(['purpose', 'responsibilities', 'apply']);
    expect(parsed[1].lines).toEqual(['- Coordinate partners', '- Report monthly']);
  });

  it('writes email rules for local NGOs and a no-CV line for form-only charities', () => {
    const f = { ...emptyFacts(), title: 'Field Officer', deadline: '2026-11-30', closingTime: '17:00', timezone: 'EAT' };
    const email = applyLines(defaultApply('ngo', ''), f, SAMPLE_ORG).join(' ');
    expect(email).toContain('use the job title, "Field Officer", as the subject');
    expect(email).toContain('combine everything into one PDF');
    expect(email).toContain('30 November 2026, 17:00 EAT');
    expect(applyLines(defaultApply('charity', ''), f, SAMPLE_ORG).join(' ')).toContain('We do not accept CVs');
  });
});
