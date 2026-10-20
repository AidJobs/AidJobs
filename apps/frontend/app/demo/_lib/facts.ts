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
  sectors: string[];
  functions: string[];
};

/** What the work is about: the original plan's "impact domain", kept to terms that rarely mislead. */
const SECTORS: Array<[string, RegExp]> = [
  ['Child protection', /child protection|protecci[oó]n (de la )?ni[ñn]ez|protection de l.enfant|justice (pour|for) (les )?enfants|children on the move|violence against children/i],
  ['Education', /\beducat|\bschool|\blearning\b|[ée]ducation|educaci[oó]n|\bteach|early childhood|\bECD\b|pre-service|curricul/i],
  ['Health', /\bhealth\b|sant[ée]|\bsalud\b|immuni[sz]|vaccin|\bpolio\b|malaria|\bHIV\b|epidemi|\bnurs(e|ing)\b|first aid|pre-hospital|\bmedical\b|maternal|newborn|\bMHPSS\b/i],
  ['Nutrition', /nutrition|breastfeeding|\bBFHI\b|food security|\bIYCF\b|stunting|malnutrition/i],
  ['WASH', /\bWASH\b|\bwater\b|sanitation|hygiene|\beau\b/i],
  ['Gender', /\bgender\b|\bGBV\b|gender-based|women.s empowerment|\bPSEA\b|sexual exploitation/i],
  ['Social protection', /social protection|social policy|cash transfer|\(cash\)|poverty|public finance|child wellbeing|social inclusion/i],
  ['Emergencies', /emergenc|humanitarian|\bcrisis\b|disaster|\bDRR\b|\bDRM\b|preparedness|\brefugee|displac|\bsurge\b/i],
  ['Climate & environment', /climate|environment|environnement|\benergy\b|resilien/i],
  ['Behaviour change', /\bSBC\b|behaviou?r change|\bC4D\b|community engagement|social mobili[sz]ation/i],
  ['Adolescents & youth', /adolescen|\byouth\b|young people|\bUPSHIFT\b/i],
  ['Disability inclusion', /disabilit|inclusive education/i],
];

/** What the person does: the original plan's "functional role", simplified. */
const FUNCTIONS: Array<[string, RegExp]> = [
  ['Programme & field', /programme|program\b|\bfield\b|\bproject\b|implementation/i],
  ['Monitoring, evaluation & data', /monitoring|evaluation|\bM&E\b|\bMEAL\b|\bresearch|\bdata\b|statistic|knowledge management|information management|evidence/i],
  ['Communication & advocacy', /communicat|advocacy|\bmedia\b|editor|\bcontent\b|writer|digital engagement/i],
  ['Partnerships & fundraising', /partnership|fund ?raising|\bdonor|resource mobili|private sector|pledge/i],
  ['Finance & audit', /financ|budget|\baccount|audit|treasury|\bpayment/i],
  ['HR & administration', /human resources|\bHR\b|\badmin(istrat)|talent|workforce|recruit/i],
  ['Supply & logistics', /supply|logistic|procurement|warehouse|\bfleet\b|\bdriver\b|distribution/i],
  ['IT & digital', /\bICT\b|\bIT\b|digital|software|systems|technolog|\bGIS\b/i],
  ['Leadership & management', /representative|\bchief\b|\bhead of\b|director|\bmanager\b|\bcoordinator\b|\blead\b/i],
  ['Operations', /\boperations?\b/i],
  ['Retail', /\bshop\b|bookshop|retail/i],
];

/** "Monitoring, Evaluation and Learning" names a function, not the education sector. */
function withoutMelLearning(t: string): string {
  return t.replace(/(monitoring|evaluation|accountability|reporting)[^,#()]{0,25}\blearning\b|\blearning and reporting\b/gi, ' ');
}

function sectorsOf(t: string): string[] {
  const clean = withoutMelLearning(t);
  return SECTORS.filter(([, re]) => re.test(clean)).map(([name]) => name);
}

function functionsOf(t: string): string[] {
  return FUNCTIONS.filter(([, re]) => re.test(t)).map(([name]) => name);
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
    sectors: sectorsOf(title),
    functions: functionsOf(title),
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
