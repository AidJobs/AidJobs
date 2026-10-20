/**
 * Facts read from job titles with fixed rules, no AI. Demo proposal: in the real
 * build this belongs at save time (UX-22, a contract decision).
 */

export type Contract = 'Consultancy' | 'Fixed term' | 'Temporary' | 'Internship' | 'Fellowship';
export type OpenTo = 'International' | 'Nationals';
export type Language = 'English' | 'French' | 'Spanish' | 'Portuguese';

export type Sdg = { goal: number; name: string; colour: string };

export type Level = 'Entry' | 'Mid-career' | 'Senior' | 'Leadership' | 'Support staff';

export const LEVELS: Level[] = ['Entry', 'Mid-career', 'Senior', 'Leadership', 'Support staff'];

export const LEVEL_HINT: Record<Level, string> = {
  Entry: 'Internships, UN P-1 and P-2, National Officer NO-1 (NO-A)',
  'Mid-career': 'UN P-3, National Officer NO-2 and NO-3 (NO-B, NO-C)',
  Senior: 'UN P-4 and P-5, National Officer NO-4 and NO-5, or "Senior" in the title',
  Leadership: 'UN D-1 and D-2, or Chief, Head of, Director, Representative in the title',
  'Support staff': 'UN General Service grades G-1 to G-7: locally recruited support roles',
};

export type Facts = {
  contract: Contract | null;
  grade: string | null;
  duration: string | null;
  openTo: OpenTo | null;
  remote: boolean;
  language: Language;
  sdgs: Sdg[];
  level: Level | null;
};

/** Official SDG names and colours; shown as a dot beside dark text, so contrast does not depend on the colour. */
const SDG: Record<number, Sdg> = {
  1: { goal: 1, name: 'No poverty', colour: '#E5243B' },
  2: { goal: 2, name: 'Zero hunger', colour: '#DDA63A' },
  3: { goal: 3, name: 'Good health and well-being', colour: '#4C9F38' },
  4: { goal: 4, name: 'Quality education', colour: '#C5192D' },
  5: { goal: 5, name: 'Gender equality', colour: '#FF3A21' },
  6: { goal: 6, name: 'Clean water and sanitation', colour: '#26BDE2' },
  10: { goal: 10, name: 'Reduced inequalities', colour: '#DD1367' },
  13: { goal: 13, name: 'Climate action', colour: '#3F7E44' },
  16: { goal: 16, name: 'Peace, justice and strong institutions', colour: '#00689D' },
};

/** Sectors that map to one SDG without argument. Emergencies, behaviour change, and youth do not. */
const SDG_RULES: Array<[number, RegExp]> = [
  [4, /\beducat|\bschool|\blearning\b|[ée]ducation|educaci[oó]n|\bteach|early childhood|\bECD\b|pre-service|curricul/i],
  [3, /\bhealth\b|sant[ée]|\bsalud\b|immuni[sz]|vaccin|\bpolio\b|malaria|\bHIV\b|epidemi|\bnurs(e|ing)\b|first aid|pre-hospital|\bmedical\b|maternal|newborn|\bMHPSS\b/i],
  [2, /nutrition|breastfeeding|\bBFHI\b|food security|\bIYCF\b|stunting|malnutrition/i],
  [6, /\bWASH\b|\bwater\b|sanitation|hygiene|\beau\b/i],
  [5, /\bgender\b|\bGBV\b|gender-based|women.s empowerment|\bPSEA\b/i],
  [1, /social protection|social policy|cash transfer|\(cash\)|poverty|child wellbeing/i],
  [16, /child protection|protecci[oó]n (de la )?ni[ñn]ez|protection de l.enfant|justice (pour|for) (les )?enfants|juvenile justice|violence against children|rule of law/i],
  [13, /climate|resilien/i],
  [10, /disabilit|inclusive education/i],
];

/** "Monitoring, Evaluation and Learning" names a function, not education. */
function withoutMelLearning(t: string): string {
  return t.replace(/(monitoring|evaluation|accountability|reporting)[^,#()]{0,25}\blearning\b|\blearning and reporting\b/gi, ' ');
}

function sdgsOf(t: string): Sdg[] {
  const clean = withoutMelLearning(t);
  return SDG_RULES.filter(([, re]) => re.test(clean)).map(([goal]) => SDG[goal]);
}

export const CONTRACT_HINT: Record<Contract, string> = {
  Consultancy: 'A consultancy contract for a set task and period',
  'Fixed term': 'A staff contract for a fixed period, usually renewable',
  Temporary: 'A temporary appointment, usually under a year',
  Internship: 'An internship for students or recent graduates',
  Fellowship: 'A fellowship programme',
};

function contractOf(t: string): Contract | null {
  if (/\bintern(ship)?\b|\bstagiaire\b|\bpasant[ií]a\b|\bestagi[aá]rio/i.test(t)) return 'Internship';
  if (/\bfellow(ship)?\b/i.test(t)) return 'Fellowship';
  if (/consult(ant|ancy|ante|ance|oría|oria|or)\b|\bconsultor/i.test(t)) return 'Consultancy';
  if (/\bTA\b|temporary|temporaire|\b364 days\b/i.test(t)) return 'Temporary';
  if (/\bFT\b|fixed[- ]term|\bFTA\b|continuing|permanent/i.test(t)) return 'Fixed term';
  return null;
}

function gradeOf(t: string): string | null {
  const m = t.match(/\b(P|NO|G|GS|D)[- ]?([1-7]|[A-E])\b/);
  if (!m) return null;
  return `${m[1] === 'GS' ? 'G' : m[1]}-${m[2]}`;
}

/** National Officer grades appear as NO-1..NO-5 or NO-A..NO-E; both mean the same level. */
const NO_STEP: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };

function levelOf(title: string, grade: string | null, contract: Contract | null): Level | null {
  if (contract === 'Internship' || contract === 'Fellowship') return 'Entry';
  if (grade) {
    const [k, v] = grade.split('-');
    const n = Number(v);
    if (k === 'P') return n <= 2 ? 'Entry' : n === 3 ? 'Mid-career' : 'Senior';
    if (k === 'D') return 'Leadership';
    if (k === 'G') return 'Support staff';
    if (k === 'NO') {
      const step = NO_STEP[v];
      if (step) return step === 1 ? 'Entry' : step <= 3 ? 'Mid-career' : 'Senior';
    }
  }
  if (/\b(chief|head of|director|representative)\b/i.test(title)) return 'Leadership';
  if (/\bsenior\b/i.test(title)) return 'Senior';
  return null;
}

/**
 * Minimum years of relevant experience at step I, with a master's degree:
 * UN Secretariat guidelines (P and D, General Service with secondary education)
 * and UNICEF Careers (National Officer). Agencies vary; shown as "usually".
 */
const MIN_YEARS: Record<string, Record<string, number>> = {
  P: { '1': 0, '2': 2, '3': 5, '4': 7, '5': 10 },
  D: { '1': 15, '2': 15 },
  NO: { '1': 1, '2': 2, '3': 5, '4': 8, '5': 10 },
  G: { '1': 0, '2': 1, '3': 2, '4': 3, '5': 5, '6': 7, '7': 10 },
};

export function typicalExperience(grade: string): string | null {
  const [k, v] = grade.split('-');
  const key = k === 'NO' ? String(NO_STEP[v] ?? '') : v;
  const years = MIN_YEARS[k]?.[key];
  if (years === undefined) return null;
  if (years === 0) return 'usually no minimum experience';
  if (k === 'D' && v === '2') return 'usually more than 15 years’ experience';
  return `usually ${years}+ years’ experience`;
}

function durationOf(t: string): string | null {
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(months?|mois|meses|weeks?|semaines|days?|jours)\b/i);
  if (!m) return null;
  const n = m[1].replace(',', '.');
  const unit = m[2].toLowerCase();
  const en = /^mo|^mes/.test(unit) ? 'month' : /^w|^sem/.test(unit) ? 'week' : 'day';
  return `${n} ${en}${n === '1' ? '' : 's'}`;
}

function openToOf(t: string, grade: string | null): OpenTo | null {
  if (/international candidates only|open (for|to) international/i.test(t)) return 'International';
  if (/nationals? only|open to nationals|ressortissants|\bnational consultant|\(national\)|national\)/i.test(t)) return 'Nationals';
  if (grade && /^(NO|G)-/.test(grade)) return 'Nationals';
  if (grade && /^(P|D)-/.test(grade)) return 'International';
  return null;
}

function languageOf(t: string): Language {
  if (/\b(estagi[aá]rio|comunica[cç][aã]o|apoio)\b/i.test(t)) return 'Portuguese';
  if (/\b(para|del|niñez|metodológica|consultoría|estrategia|fortalecimiento)\b/i.test(t)) return 'Spanish';
  if (/\b(chargé|chargée|officier|santé|appui|suivi|formateurs?|consultance|enfants|mise en oeuvre|postes|et)\b/i.test(t) && /[éèàçê]|\b(des|du|pour)\b/i.test(t)) return 'French';
  return 'English';
}

export function factsOf(title: string): Facts {
  const grade = gradeOf(title);
  const contract = contractOf(title);
  return {
    contract,
    grade,
    duration: durationOf(title),
    openTo: openToOf(title, grade),
    remote: /\bremote(ly)?\b|home[- ]based|work from home|télétravail|remoto/i.test(title),
    language: languageOf(title),
    sdgs: sdgsOf(title),
    level: levelOf(title, grade, contract),
  };
}

export function gradeHint(grade: string): string {
  const [k, n] = grade.split('-');
  const exp = typicalExperience(grade);
  const tail = exp ? `; ${exp} (UN standard with a master’s degree; agencies vary)` : '';
  if (k === 'P') return `UN Professional grade ${grade}: internationally recruited${tail}`;
  if (k === 'D') return `UN Director grade ${grade}${tail}`;
  if (k === 'NO') return `UN National Officer grade ${grade}: for nationals of the country${tail}`;
  if (k === 'G') return `UN General Service grade ${grade}: locally recruited${tail}`;
  return `Grade ${n}`;
}
