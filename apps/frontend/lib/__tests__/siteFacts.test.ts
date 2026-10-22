import { factsOf, typicalExperience } from '../site/facts';

describe('facts read from job titles', () => {
  it('reads contract, grade, level, open to, and sector with its SDG', () => {
    const f = factsOf('Education Officer, P-3, Fixed Term, Juba, South Sudan');
    expect(f).toMatchObject({ contract: 'Fixed term', grade: 'P-3', level: 'Mid-career', openTo: 'International', sectors: ['Education'], language: 'English', remote: false });
    expect(f.sdgs.map((s) => s.goal)).toEqual([4]);
  });

  it('reads a national consultancy with its length and home-based work', () => {
    const f = factsOf('National Consultant - Nutrition (11 months), Home-based');
    expect(f).toMatchObject({ contract: 'Consultancy', openTo: 'Nationals', duration: '11 months', remote: true, sectors: ['Nutrition'], level: null });
  });

  it('treats an internship as entry level', () => {
    expect(factsOf('Internship - Communication (Remote)')).toMatchObject({ contract: 'Internship', level: 'Entry', remote: true });
  });

  it('reads National Officer letter grades and French adverts', () => {
    expect(factsOf('Chargé(e) de suivi et évaluation, NO-B')).toMatchObject({ grade: 'NO-B', level: 'Mid-career', openTo: 'Nationals', language: 'French' });
  });

  it('does not read "Monitoring, Evaluation and Learning" as education', () => {
    expect(factsOf('Monitoring, Evaluation and Learning Officer').sectors).toEqual([]);
  });

  it('says "not stated" by leaving a fact empty', () => {
    expect(factsOf('Driver')).toMatchObject({ contract: null, grade: null, level: null, openTo: null, sectors: [], remote: false });
  });

  it('gives the usual experience for UN grades', () => {
    expect(typicalExperience('P-3')).toBe('usually 5+ years’ experience');
    expect(typicalExperience('G-1')).toBe('usually no minimum experience');
    expect(typicalExperience('D-2')).toBe('usually more than 15 years’ experience');
    expect(typicalExperience('NO-B')).toBe('usually 2+ years’ experience');
  });
});
