import { applyLines, defaultApply } from '@/components/employer-demo/apply';
import { approvalRequired } from '@/components/employer-demo/approval';
import { applyFormat, editTranslation, hireAgain, publishBlock, reviewTranslation, startJob } from '@/components/employer-demo/actions';
import { buildSection, emptyFacts, extractFacts, quality, salarySuggestion } from '@/components/employer-demo/engine';
import { canWord, fixedShown } from '@/components/employer-demo/fixed';
import { essentials } from '@/components/employer-demo/flow';
import { fullAdvertCheck, LOCAL_LANG } from '@/components/employer-demo/market';
import { profileOf, profileTags } from '@/components/employer-demo/profiles';
import { initialState } from '@/components/employer-demo/sample';
import { getState, resetDemo, update } from '@/components/employer-demo/store';
import type { DemoJob } from '@/components/employer-demo/types';

// Keep test isolated from any persisted localStorage state.
beforeEach(() => {
  localStorage.clear();
  resetDemo('riverstone');
});

describe('Phase A — Foundation, Truth, Compliance & P0 Fixes', () => {
  test('blank-slate preset starts cleanly without careersUrl and falls back to email apply with clickable slot', () => {
    const blank = initialState(Date.UTC(2026, 10, 27), 'blank');
    expect(blank.org.careersUrl).toBe('');
    expect(blank.org.domain).toBe('');
    expect(blank.jobs).toHaveLength(0);

    const apply = defaultApply(blank.org.orgType, blank.org.careersUrl, blank.org.domain);
    expect(apply.method).toBe('email');

    const lines = applyLines(apply, emptyFacts(), blank.org);
    expect(lines.join(' ')).toContain('[Apply email or link]');
    expect(lines.join(' ')).not.toContain('jobs@.');
  });

  test('extractFacts recognises organisation-specific salary scale grades (B2, C1, D1, Band 5)', () => {
    const today = Date.UTC(2026, 10, 27);
    const r1 = extractFacts('WASH Coordinator in Juba, grade C1, fixed-term', today, emptyFacts(), ['B2', 'C1', 'D1', 'D2']);
    expect(r1.facts.grade).toBe('C1');

    const r2 = extractFacts('Programme Officer Band 5 based in Nairobi', today, emptyFacts(), []);
    expect(r2.facts.grade).toBe('Band 5');
  });

  test('buildSection does not fabricate Head of Programmes, Direct reports: none, benefits, or non-family R&R for national staff', () => {
    const s = getState();
    const facts = { ...emptyFacts(), title: 'WASH Officer', location: 'Juba, South Sudan', country: 'South Sudan', iso: 'SS', eligibility: 'nationals' as const };
    const ctx = { facts, roleKey: 'wash', format: s.formats[0], tone: 'warm' as const, org: s.org, apply: defaultApply('ingo', s.org.careersUrl, s.org.domain) };

    const rel = buildSection('relationships', ctx).lines.join(' ');
    expect(rel).not.toContain('Head of Programmes');
    expect(rel).not.toContain('Direct reports: none');
    expect(rel).toContain('[Reporting line]');

    const setting = buildSection('setting', ctx).lines.join(' ');
    expect(setting).not.toContain('Head of Programmes');

    const offer = buildSection('offer', ctx).lines.join(' ');
    expect(offer).not.toContain('Annual leave, medical insurance');

    const cond = buildSection('conditions', ctx).lines.join(' ');
    expect(cond).not.toContain('non-family duty station');
  });

  test('salarySuggestion does not invent flat UN P1-D2 bands or suggest salaries for internships', () => {
    const s = getState();
    const unP5 = { ...emptyFacts(), title: 'Chief of Operations', location: 'Geneva, Switzerland', country: 'Switzerland', iso: 'CH', grade: 'P5', engagement: 'job' as const };
    expect(salarySuggestion(unP5, { ...s.org, scale: [] })).toBeNull();

    const intern = { ...emptyFacts(), title: 'Programme Intern', location: 'London, United Kingdom', country: 'United Kingdom', iso: 'GB', engagement: 'internship' as const };
    expect(salarySuggestion(intern, { ...s.org, scale: [] })).toBeNull();
  });

  test('approvalRequired honours org.seniorGrades (Riverstone D1/D2) and falls back to UN regex', () => {
    const s = getState();
    const base = s.jobs[0];
    const d1: DemoJob = { ...base, facts: { ...base.facts, grade: 'D1' } };
    const c1: DemoJob = { ...base, facts: { ...base.facts, grade: 'C1' } };
    const sSenior = { ...s, org: { ...s.org, approvalRule: 'senior' as const, seniorGrades: ['D1', 'D2'] } };
    expect(approvalRequired(sSenior, d1)).toBe(true);
    expect(approvalRequired(sSenior, c1)).toBe(false);
  });

  test('locked commitments cannot be ad-hoc edited in any language and cannot be stripped on template switch', () => {
    const s = getState();
    const locked = s.org.standard.find((c) => c.locked);
    expect(locked).toBeDefined();
    expect(canWord(s.org, locked!.key, 'fr')).toBe(false);

    const id = startJob('Logistics Officer in Juba, fixed-term, closing 2026-12-20');
    applyFormat(id, 'uk-charity');
    const after = getState().jobs.find((j) => j.id === id)!;
    for (const c of s.org.standard.filter((x) => x.locked)) {
      expect(after.commitments).toContain(c.key);
    }
  });

  test('publishBlock blocks unapproved or untranslated locked commitments in non-primary language', () => {
    const s = getState();
    const id = startJob('Logistics Officer in Juba, fixed-term, closing 2026-12-20');
    update((st) => ({
      ...st,
      jobs: st.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              lang: 'fr',
              sections: j.sections.map((sec) => ({ ...sec, lines: sec.lines.length ? sec.lines : ['Texte valide'] })),
            }
          : j,
      ),
    }));
    const job = getState().jobs.find((j) => j.id === id)!;
    const locked = getState().org.standard.find((c) => c.locked)!;
    const shown = fixedShown(job, getState(), locked.key, 'fr');
    expect(shown.toTranslate || shown.machine).toBe(true);

    const block = publishBlock(getState(), id, { plan: 'free', schedule: null });
    expect(block).toMatch(/locked commitment/i);
  });

  test('rolling rosters (open until filled) pass essentials and quality without a deadline', () => {
    const s = getState();
    const id = startJob('Emergency WASH Coordinator in Juba, fixed-term');
    update((st) => ({
      ...st,
      jobs: st.jobs.map((j) => (j.id === id ? { ...j, facts: { ...j.facts, deadline: '', rolling: true } } : j)),
    }));
    const job = getState().jobs.find((j) => j.id === id)!;
    expect(essentials(job, getState().org)).not.toContain('deadline');
    expect(quality(job.sections, job.facts, getState().today, []).some((q) => q.key === 'deadline')).toBe(false);
  });

  test('fullAdvertCheck skips years warning on UN formats and LOCAL_LANG covers major humanitarian hubs', () => {
    const s = getState();
    const id = startJob('Programme Officer P4 in Geneva, fixed-term, closing 2026-12-20', 'un-secretariat');
    update((st) => ({
      ...st,
      jobs: st.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              sections: j.sections.map((sec) => (sec.key === 'requirements' ? { ...sec, lines: ['Essential:', '- At least 7 years of relevant experience'] } : sec)),
            }
          : j,
      ),
    }));
    const job = getState().jobs.find((j) => j.id === id)!;
    const checks = fullAdvertCheck(job, getState());
    expect(checks.points.some((c) => c.key === 'years')).toBe(false);

    expect(LOCAL_LANG.ET).toBe('Amharic');
    expect(LOCAL_LANG.NG).toBe('Hausa');
    expect(LOCAL_LANG.BD).toBe('Bangla');
    expect(LOCAL_LANG.AF).toBe('Dari');
    expect(LOCAL_LANG.NP).toBe('Nepali');
    expect(LOCAL_LANG.IN).toBe('Hindi');
    expect(LOCAL_LANG.PH).toBe('Filipino');
  });

  test('reviewTranslation blocks marking a 100%-untranslated draft as reviewed (R1-07 / INGO #9)', () => {
    const id = startJob('Finance Officer in Juba, fixed-term, closing 2026-12-20');
    const job = getState().jobs.find((j) => j.id === id)!;
    update((st) => ({
      ...st,
      jobs: st.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              translations: {
                fr: {
                  lang: 'fr',
                  reviewed: false,
                  from: 'src',
                  sections: j.sections.map((sec) => ({ ...sec, lines: [...sec.lines] })),
                },
              },
            }
          : j,
      ),
    }));
    expect(reviewTranslation(id, 'fr')).toBe(false);
    expect(getState().jobs.find((j) => j.id === id)!.translations?.fr?.reviewed).toBe(false);
    expect(job.sections.length).toBeGreaterThan(0);
  });

  test('profileTags preserves custom section keys (c-*)', () => {
    const s = getState();
    const j: DemoJob = { ...s.jobs[0], tags: ['about', 'purpose', 'c-donor-visibility'] };
    const p = profileOf(j);
    expect(profileTags(p)).toContain('c-donor-visibility');
  });

  test('hireAgain picks a working-day closing date and preserves reviewed translations as unreviewed drafts', () => {
    const s = getState();
    const src = s.jobs[0];
    update((st) => ({
      ...st,
      jobs: st.jobs.map((j) =>
        j.id === src.id
          ? {
              ...j,
              translations: {
                fr: { lang: 'fr', reviewed: true, from: 'v1', sections: [{ key: 'purpose', title: 'Objet', lines: ['Ligne en français'] }] },
              },
            }
          : j,
      ),
    }));
    const nid = hireAgain(src.id);
    expect(nid).toBeTruthy();
    const copy = getState().jobs.find((j) => j.id === nid)!;
    expect(copy.translations?.fr).toBeDefined();
    expect(copy.translations?.fr?.reviewed).toBe(false);
    expect(copy.facts.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('editing a translation does not wipe primary-language approval (INGO #21)', () => {
    const id = startJob('Programme Officer in Juba, fixed-term, closing 2026-12-20');
    update((st) => ({
      ...st,
      jobs: st.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              review: { state: 'approved', reviewers: [{ personId: 'p1', name: 'Nadia', email: 'nadia@example.org', state: 'approved', at: Date.now() }], due: '', round: 1, rule: 'any', remarks: [] },
              translations: {
                fr: { lang: 'fr', reviewed: true, from: 'v1', sections: [{ key: 'purpose', title: 'Objet', lines: ['Version initiale'] }] },
              },
            }
          : j,
      ),
    }));
    editTranslation(id, 'fr', 'purpose', 0, 'Version révisée');
    const after = getState().jobs.find((j) => j.id === id)!;
    expect(after.review.state).toBe('approved');
    expect(after.translations?.fr?.reviewed).toBe(false);
  });
});
