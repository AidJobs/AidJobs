import { FAMILIES_ORDER, roleByKey } from './engine';
import type { DemoJob, Format, State, Tone } from './types';

/** The writing style, as the chips of Organisation settings. */
export const STYLES = ['Warm', 'Formal', 'Plain English', 'Speaks as "we"', 'Uses "you"', 'Rights-based', 'Short sentences', 'Inclusive'];

const BY_TYPE: Record<State['org']['orgType'], string[]> = {
  ingo: ['Warm', 'Plain English', 'Speaks as "we"', 'Uses "you"'],
  ngo: ['Warm', 'Plain English', 'Speaks as "we"', 'Uses "you"'],
  charity: ['Warm', 'Plain English', 'Speaks as "we"', 'Uses "you"', 'Inclusive'],
  un: ['Formal', 'Plain English'],
  donor: ['Formal', 'Plain English'],
  contractor: ['Formal', 'Short sentences'],
};

/** The style the chat proposes: the organisation's own when it has one, otherwise what organisations of its type usually write. */
export function proposedStyle(s: State): string[] {
  return s.org.voice.length ? s.org.voice : BY_TYPE[s.org.orgType];
}

/** The rule-based writer has three tones; the style decides which one it uses. */
export function toneOf(style: string[]): Tone {
  if (style.includes('Formal')) return 'formal';
  if (style.includes('Warm')) return 'warm';
  return 'plain';
}

const SAID: Record<string, string> = {
  Warm: 'warmly',
  Formal: 'formally',
  'Plain English': 'in plain English',
  'Speaks as "we"': 'speaking as "we"',
  'Uses "you"': 'addressing "you"',
  'Rights-based': 'rights-based',
  'Short sentences': 'in short sentences',
  Inclusive: 'inclusively',
};

/** "warmly, in plain English and speaking as "we" to "you"". */
export function describeStyle(style: string[]): string {
  let words = STYLES.filter((x) => style.includes(x)).map((x) => SAID[x]);
  if (style.includes('Speaks as "we"') && style.includes('Uses "you"')) words = words.filter((w) => w !== SAID['Uses "you"']).map((w) => (w === SAID['Speaks as "we"'] ? 'speaking as "we" to "you"' : w));
  if (!words.length) return 'plainly';
  return words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** Reads a reply to "how should it sound?": anything is accepted; named qualities are added, and their opposites dropped. */
export function styleFromReply(base: string[], text: string): string[] {
  const t = text.toLowerCase();
  let out = [...base];
  const add = (x: string, drop?: string) => {
    out = out.filter((y) => y !== drop);
    if (!out.includes(x)) out.push(x);
  };
  if (/\bformal|professional|official/.test(t)) add('Formal', 'Warm');
  if (/\bwarm|friendl|human|less formal|informal/.test(t)) add('Warm', 'Formal');
  if (/\bplain|simple|simpler|clear\b/.test(t)) add('Plain English');
  if (/\bshort(er)? sentences|\bconcise|\bbrief|\bshort\b|\bshorter\b/.test(t)) add('Short sentences');
  if (/\binclusive/.test(t)) add('Inclusive');
  if (/\brights/.test(t)) add('Rights-based');
  if (/"?you"?\b.*\b(address|speak|talk)|\buse "?you"?|\bsecond person/.test(t)) add('Uses "you"');
  if (/\bno "?you"?\b|third person|the post holder/.test(t)) out = out.filter((y) => y !== 'Uses "you"');
  return STYLES.filter((x) => out.includes(x));
}

/** About how long a job description of this many sections runs, with the organisation's fixed text. */
export function wordsFor(sections: number): number {
  return Math.round((sections * 110 + 150) / 50) * 50;
}

export function wordsOf(format: Format): number {
  return wordsFor(format.order.length);
}

/** The template the chat recommends, with its reason, and the close matches it offers next. */
export function recommendation(s: State, defaultKey: string): { key: string; reason: string; others: string[] } {
  const usable = s.formats.filter((f) => !f.key.startsWith('pasted-'));
  const rec = usable.find((f) => f.key === defaultKey) ?? usable[0];
  const reason = rec.family === 'Your organisation' ? 'your own format' : `the format most organisations like yours use`;
  const family = usable.find((f) => f.family !== 'Your organisation' && f.key !== rec.key && f.family === rec.family)?.family ?? 'INGO and humanitarian';
  const others = [...usable.filter((f) => f.key !== rec.key && f.family === family), ...usable.filter((f) => f.key !== rec.key && f.family !== family)]
    .sort((a, b) => FAMILIES_ORDER.indexOf(a.family) - FAMILIES_ORDER.indexOf(b.family))
    .slice(0, 3)
    .map((f) => f.key);
  return { key: rec.key, reason, others };
}

/** Why the job type brings in a section. */
export const TYPE_REASONS: Record<string, string> = {
  deliverables: 'Consultancies list deliverables and a timeline',
  learning: 'Internships and fellowships set learning goals',
  deployment: 'Rosters say how and when people are deployed',
  funding: 'Funded or proposal-stage posts state their funding conditions',
  conditions: 'The duty station has security conditions',
  languages: 'More than one language is asked for',
};

export const SDG_NAMES: Record<number, string> = {
  1: 'No poverty',
  2: 'Zero hunger',
  3: 'Good health and well-being',
  4: 'Quality education',
  5: 'Gender equality',
  6: 'Clean water and sanitation',
  7: 'Affordable and clean energy',
  8: 'Decent work and economic growth',
  9: 'Industry, innovation and infrastructure',
  10: 'Reduced inequalities',
  11: 'Sustainable cities and communities',
  12: 'Responsible consumption and production',
  13: 'Climate action',
  14: 'Life below water',
  15: 'Life on land',
  16: 'Peace, justice and strong institutions',
  17: 'Partnerships for the goals',
};

/** Words in the job title, first, then the role's sector: one main goal and at most two more. */
const SDG_WORDS: Array<[RegExp, number[]]> = [
  [/\besg\b|\be&s\b|environmental and social|safeguards (specialist|officer|adviser|advisor)|sustainability/i, [12, 13, 16]],
  [/\bwash\b|water|sanitation|hygiene/i, [6, 3]],
  [/nutrition|food security|\bfood\b|hunger/i, [2, 3]],
  [/health|medical|nurse|doctor|midwi|epidemiolog|\bhiv\b|malaria/i, [3]],
  [/educat|teacher|school|learning|literacy/i, [4]],
  [/gender|\bgbv\b|women|girls/i, [5, 16]],
  [/child protection|protection|safeguarding|peace|justice|rule of law|governance/i, [16]],
  [/livelihood|cash|economic|income|employment|market/i, [1, 8]],
  [/climate|environment|resilience|disaster risk|\bdrr\b|energy/i, [13]],
  [/shelter|housing|settlement|urban/i, [11]],
];

const SDG_SECTOR: Record<string, number[]> = {
  'Water, sanitation and hygiene': [6, 3],
  Health: [3],
  'Child protection': [16],
  Education: [4],
  'Climate and environment': [13],
  'Livelihoods and food security': [2, 1, 8],
  'ESG and environmental and social safeguards': [12, 13, 16],
};

/** The goals the job serves, read by rules; none when no goal is clear (a finance or HR post, for example). */
export function inferSdgs(job: DemoJob): number[] {
  const hit = SDG_WORDS.find(([re]) => re.test(job.facts.title));
  if (hit) return hit[1].slice(0, 3);
  return (SDG_SECTOR[roleByKey(job.family).sector] ?? []).slice(0, 3);
}

/** The job's goals: corrected by hand, chosen from the organisation's, or read by rules. */
export function sdgsOf(job: DemoJob): number[] {
  return job.sdgs ?? inferSdgs(job);
}

/** How the job page introduces the goals: the role's own, or the organisation's when the user chose those. */
export function sdgLead(job: DemoJob, orgName: string): string {
  return job.sdgsFrom === 'org' ? `${orgName} works towards` : 'This role contributes to';
}
