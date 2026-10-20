/**
 * Facts read from job titles with fixed rules, no AI. Demo proposal: in the real
 * build this belongs at save time (UX-22, a contract decision).
 */

export type Contract = 'Consultancy' | 'Fixed term' | 'Temporary' | 'Internship' | 'Fellowship';
export type OpenTo = 'International' | 'Nationals';
export type Language = 'English' | 'French' | 'Spanish' | 'Portuguese';

export type Facts = {
  contract: Contract | null;
  grade: string | null;
  duration: string | null;
  openTo: OpenTo | null;
  remote: boolean;
  language: Language;
};

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
  const m = t.match(/\b(P|NO|G|GS|D)[- ]?([1-7]|[A-D])\b/);
  if (!m) return null;
  return `${m[1] === 'GS' ? 'G' : m[1]}-${m[2]}`;
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
  return {
    contract: contractOf(title),
    grade,
    duration: durationOf(title),
    openTo: openToOf(title, grade),
    remote: /\bremote(ly)?\b|home[- ]based|work from home|télétravail|remoto/i.test(title),
    language: languageOf(title),
  };
}

export function gradeHint(grade: string): string {
  const [k, n] = grade.split('-');
  if (k === 'P') return `UN Professional grade ${grade}: internationally recruited`;
  if (k === 'D') return `UN Director grade ${grade}`;
  if (k === 'NO') return `UN National Officer grade ${grade}: for nationals of the country`;
  if (k === 'G') return `UN General Service grade ${grade}: locally recruited`;
  return `Grade ${n}`;
}
