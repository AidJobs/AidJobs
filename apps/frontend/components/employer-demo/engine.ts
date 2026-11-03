/**
 * The demo's stand-in for the job-description generator: fixed rules and a written content library, no AI and no
 * network. It shows how the chat, the tags, the fact strip, and the quality checks behave; the production generator
 * is decided later (employer-side plan, E7).
 */
import type { Facts, Org, Section, Style, Tag, Tone } from './types';

const DAY = 86_400_000;

export const TAGS: Tag[] = [
  { key: 'about', label: 'About us', group: 'Core', hint: 'Who the organisation is, from its profile' },
  { key: 'role', label: 'The role', group: 'Core', hint: 'A short summary of the job and its purpose' },
  { key: 'responsibilities', label: 'Responsibilities', group: 'Core', hint: 'What the person will do' },
  { key: 'qualifications', label: 'Qualifications', group: 'Core', hint: 'Education and experience required' },
  { key: 'competencies', label: 'Competencies', group: 'Core', hint: 'Skills and behaviours' },
  { key: 'languages', label: 'Languages', group: 'Core', hint: 'Required and desirable languages' },
  { key: 'offer', label: 'What we offer', group: 'Core', hint: 'Salary, benefits, and leave' },
  { key: 'apply', label: 'How to apply', group: 'Core', hint: 'Where and by when to apply' },
  { key: 'setting', label: 'Organisational setting', group: 'UN style', hint: 'Where the post sits and who it reports to' },
  { key: 'assessment', label: 'Assessment', group: 'UN style', hint: 'How candidates are assessed' },
  { key: 'safeguarding', label: 'Safeguarding', group: 'Sector', hint: 'Commitment to protecting children and adults at risk' },
  { key: 'security', label: 'Security context', group: 'Sector', hint: 'Duty-station security and rest and recuperation' },
  { key: 'donor', label: 'Donor compliance', group: 'Sector', hint: 'Funding source and compliance duties' },
  { key: 'deliverables', label: 'Deliverables', group: 'Sector', hint: 'For consultancies: outputs and timeline' },
  { key: 'payment', label: 'Payment schedule', group: 'Sector', hint: 'For consultancies: instalments by deliverable' },
  { key: 'learning', label: 'Learning goals', group: 'Sector', hint: 'For internships: what the intern will learn' },
  { key: 'deployment', label: 'Deployment', group: 'Sector', hint: 'For emergency roles: notice and duration' },
  { key: 'equal', label: 'Equal opportunity', group: 'Standard text', hint: "The organisation's fixed text" },
  { key: 'psea', label: 'PSEA', group: 'Standard text', hint: 'Protection from sexual exploitation and abuse' },
  { key: 'dataprot', label: 'Data protection', group: 'Standard text', hint: "How candidates' data is handled" },
  { key: 'nofee', label: 'No-fee notice', group: 'Standard text', hint: 'The organisation never charges candidates' },
];

export const TAG_BY_KEY: Record<string, Tag> = Object.fromEntries(TAGS.map((t) => [t.key, t]));

/** The order sections appear in a job description, whatever order the tags were chosen in. */
const ORDER = [
  'about',
  'setting',
  'role',
  'deliverables',
  'responsibilities',
  'learning',
  'deployment',
  'qualifications',
  'competencies',
  'languages',
  'security',
  'donor',
  'payment',
  'offer',
  'assessment',
  'apply',
  'safeguarding',
  'equal',
  'psea',
  'dataprot',
  'nofee',
];

export const STYLES: Style[] = [
  {
    key: 'un',
    label: 'UN style',
    by: 'AidJobs',
    tags: ['setting', 'responsibilities', 'competencies', 'qualifications', 'languages', 'assessment', 'nofee', 'equal'],
    tone: 'formal',
    note: 'The structure UN agencies use: organisational setting, competencies, assessment, no-fee notice',
  },
  {
    key: 'ngo',
    label: 'NGO standard',
    by: 'AidJobs',
    tags: ['about', 'role', 'responsibilities', 'qualifications', 'offer', 'safeguarding', 'apply', 'equal'],
    tone: 'warm',
    note: 'A clear NGO advert with safeguarding and what you offer',
  },
  {
    key: 'tor',
    label: 'Consultancy terms of reference',
    by: 'AidJobs',
    tags: ['about', 'role', 'deliverables', 'payment', 'qualifications', 'apply'],
    tone: 'formal',
    note: 'Background, deliverables, payment by instalment',
  },
  {
    key: 'intern',
    label: 'Internship',
    by: 'AidJobs',
    tags: ['about', 'role', 'learning', 'qualifications', 'offer', 'apply'],
    tone: 'warm',
    note: 'Learning goals first, then eligibility',
  },
  {
    key: 'surge',
    label: 'Emergency or surge',
    by: 'AidJobs',
    tags: ['role', 'deployment', 'responsibilities', 'qualifications', 'security', 'safeguarding', 'apply'],
    tone: 'plain',
    note: 'Deployment notice, security context, short and direct',
  },
];

type Family = {
  key: string;
  title: string;
  words: string[];
  sector: string;
  sdg: number;
  extraTags: string[];
  resp: string[];
  more: string[];
  qual: string[];
  comp: string[];
  deliverables: string[];
  learning: string[];
};

export const FAMILIES: Family[] = [
  {
    key: 'wash',
    title: 'WASH Programme Manager',
    words: ['wash', 'water', 'sanitation', 'hygiene'],
    sector: 'Water, sanitation and hygiene',
    sdg: 6,
    extraTags: ['donor'],
    resp: [
      'Lead the design, delivery, and quality of the water, sanitation, and hygiene programme across project sites',
      'Manage the WASH team and partners, including work plans, coaching, and performance reviews',
      'Oversee the programme budget, procurement plans, and monthly spending against forecast',
      'Make sure water systems and latrines meet Sphere and national standards',
      'Represent the organisation in the WASH cluster and with local water authorities',
      'Prepare donor reports and proposals with the grants and MEAL teams',
    ],
    more: [
      'Plan hygiene promotion with communities, including women and people with disabilities',
      'Lead water-quality monitoring and act on the results',
      'Prepare the WASH response for cholera or flooding, with pre-positioned stock',
    ],
    qual: [
      "Master's degree in civil or environmental engineering, public health, or a related field",
      'Experience managing WASH programmes in humanitarian or development settings',
      'Experience managing budgets above USD 1 million and leading teams',
      'Knowledge of Sphere standards and the WASH cluster',
    ],
    comp: ['Leads teams through change and pressure', 'Builds trust with communities and authorities', 'Plans and solves problems in the field'],
    deliverables: ['Inception report with method and work plan', 'Assessment of water points and sanitation facilities', 'Draft report with recommendations', 'Final report and validation workshop'],
    learning: ['How a WASH programme is planned and monitored', 'Water-quality testing in the field', 'Writing for donors'],
  },
  {
    key: 'health',
    title: 'Health Programme Officer',
    words: ['health', 'medical', 'clinic', 'epidemiolog', 'nurse', 'doctor', 'malaria', 'vaccin'],
    sector: 'Health',
    sdg: 3,
    extraTags: ['safeguarding'],
    resp: [
      'Support the delivery of primary health care activities with health facilities and community health workers',
      'Monitor health indicators and the quality of services',
      'Coordinate with the Ministry of Health and the health cluster',
      'Manage medical supplies with the logistics team',
      'Train health staff and volunteers',
    ],
    more: ['Support outbreak preparedness and response', 'Make sure services reach women, children, and people with disabilities'],
    qual: ['Degree in medicine, nursing, public health, or a related field', 'Experience in health programmes in low-resource settings', 'Knowledge of national health policies'],
    comp: ['Works well with government counterparts', 'Accurate with data', 'Calm under pressure'],
    deliverables: ['Inception report', 'Health facility assessment', 'Draft and final report'],
    learning: ['How health programmes are monitored', 'Working with health authorities'],
  },
  {
    key: 'protection',
    title: 'Child Protection Specialist',
    words: ['protection', 'child', 'gbv', 'gender-based', 'safeguard'],
    sector: 'Child protection',
    sdg: 16,
    extraTags: ['safeguarding'],
    resp: [
      'Lead case management for children at risk, with clear referral pathways',
      'Train staff and partners on child protection and safeguarding',
      'Coordinate with the child protection area of responsibility and local authorities',
      'Monitor the quality of services and the wellbeing of children',
      'Support community-based protection groups',
    ],
    more: ['Run child-friendly spaces with partners', 'Advise programmes on safe and inclusive design'],
    qual: ['Degree in social work, law, psychology, or a related field', 'Experience in child protection case management', 'Knowledge of the Minimum Standards for Child Protection in Humanitarian Action'],
    comp: ['Puts the child first', 'Discreet with sensitive information', 'Builds strong partnerships'],
    deliverables: ['Inception report', 'Mapping of services and referral pathways', 'Final report'],
    learning: ['How case management works', 'Safeguarding in practice'],
  },
  {
    key: 'education',
    title: 'Education Officer',
    words: ['education', 'teacher', 'school', 'learning centre'],
    sector: 'Education',
    sdg: 4,
    extraTags: ['safeguarding'],
    resp: ['Support schools and learning centres to deliver quality education', 'Train teachers in child-centred methods', 'Monitor attendance and learning outcomes', 'Work with parents and education authorities'],
    more: ['Support education in emergencies preparedness', 'Promote inclusive education for children with disabilities'],
    qual: ['Degree in education or a related field', 'Experience in education programmes', 'Knowledge of INEE Minimum Standards'],
    comp: ['Communicates clearly with communities', 'Organised and reliable'],
    deliverables: ['Inception report', 'Learning assessment', 'Final report'],
    learning: ['How education programmes are run', 'Monitoring learning outcomes'],
  },
  {
    key: 'meal',
    title: 'MEAL Coordinator',
    words: ['meal', 'm&e', 'monitoring', 'evaluation', 'accountability'],
    sector: 'Monitoring and evaluation',
    sdg: 17,
    extraTags: ['donor'],
    resp: ['Lead monitoring, evaluation, accountability, and learning across the country programme', 'Design indicators, tools, and data systems', 'Run the feedback and complaints mechanism', 'Lead evaluations and learning reviews', 'Train staff on data quality'],
    more: ['Produce dashboards for management', 'Support proposal writing with results frameworks'],
    qual: ['Degree in statistics, social sciences, or a related field', 'Experience leading MEAL systems', 'Skills in Kobo, Excel, and a statistics package'],
    comp: ['Analytical', 'Turns data into decisions', 'Coaches others'],
    deliverables: ['Evaluation design', 'Data collection and analysis', 'Evaluation report'],
    learning: ['How MEAL systems work', 'Data collection tools'],
  },
  {
    key: 'finance',
    title: 'Finance Officer',
    words: ['finance', 'accountant', 'accounting', 'budget', 'grants'],
    sector: 'Finance',
    sdg: 17,
    extraTags: ['donor'],
    resp: ['Process payments and keep accurate accounting records', 'Prepare monthly financial reports and reconciliations', 'Support budget monitoring with programme teams', 'Make sure spending follows donor rules and internal policies', 'Support audits'],
    more: ['Train staff on finance procedures', 'Manage petty cash and bank transfers'],
    qual: ['Degree in accounting, finance, or a related field', 'Experience in NGO finance', 'Skills in accounting software and Excel'],
    comp: ['Accurate', 'Honest and transparent', 'Meets deadlines'],
    deliverables: ['Financial review', 'Recommendations report'],
    learning: ['NGO finance procedures', 'Donor reporting'],
  },
  {
    key: 'logistics',
    title: 'Logistics Officer',
    words: ['logistics', 'supply', 'procurement', 'fleet', 'warehouse'],
    sector: 'Logistics',
    sdg: 9,
    extraTags: [],
    resp: ['Manage procurement in line with policy and donor rules', 'Run warehouses and stock control', 'Manage the vehicle fleet and movements', 'Support distributions with programme teams'],
    more: ['Pre-position emergency stock', 'Assess suppliers and markets'],
    qual: ['Degree or diploma in logistics or supply chain', 'Experience in humanitarian logistics', 'Knowledge of procurement rules'],
    comp: ['Organised', 'Solves problems quickly', 'Works well across teams'],
    deliverables: ['Supply chain assessment', 'Recommendations report'],
    learning: ['Humanitarian supply chains', 'Procurement procedures'],
  },
  {
    key: 'comms',
    title: 'Communications Officer',
    words: ['communications', 'comms', 'advocacy', 'media', 'content'],
    sector: 'Communications',
    sdg: 17,
    extraTags: [],
    resp: ['Produce stories, photos, and videos from programmes', 'Manage social media and the website', 'Support advocacy and media relations', 'Follow consent and safeguarding rules for content'],
    more: ['Prepare donor visibility materials', 'Train staff on storytelling'],
    qual: ['Degree in communications, journalism, or a related field', 'Experience in NGO communications', 'Strong writing in English'],
    comp: ['Creative', 'Respects dignity in storytelling', 'Works to deadlines'],
    deliverables: ['Content plan', 'Stories and media package'],
    learning: ['NGO communications', 'Ethical storytelling'],
  },
  {
    key: 'climate',
    title: 'Climate Resilience Adviser',
    words: ['climate', 'environment', 'resilience', 'adaptation'],
    sector: 'Climate and environment',
    sdg: 13,
    extraTags: ['donor'],
    resp: ['Advise programmes on climate risk and adaptation', 'Design community resilience projects', 'Support climate finance proposals', 'Represent the organisation in climate networks'],
    more: ['Develop early warning and anticipatory action plans', 'Measure environmental impact of programmes'],
    qual: ["Master's degree in environmental science, climate policy, or a related field", 'Experience in climate adaptation programmes', 'Knowledge of climate finance'],
    comp: ['Thinks across sectors', 'Influences decision-makers'],
    deliverables: ['Climate risk assessment', 'Adaptation plan'],
    learning: ['Climate adaptation in practice', 'Climate finance basics'],
  },
  {
    key: 'livelihoods',
    title: 'Livelihoods Officer',
    words: ['livelihood', 'food security', 'cash', 'economic', 'agricultur'],
    sector: 'Livelihoods and food security',
    sdg: 2,
    extraTags: [],
    resp: ['Deliver cash and livelihoods activities with communities', 'Run market assessments', 'Support farmer and business groups', 'Monitor household food security'],
    more: ['Link groups to markets and financial services', 'Support cash transfer systems'],
    qual: ['Degree in agriculture, economics, or a related field', 'Experience in livelihoods or cash programmes'],
    comp: ['Works closely with communities', 'Practical and organised'],
    deliverables: ['Market assessment', 'Final report'],
    learning: ['Cash programming', 'Market assessments'],
  },
  {
    key: 'hr',
    title: 'HR Officer',
    words: ['hr ', 'human resources', 'people and culture', 'recruitment'],
    sector: 'Human resources',
    sdg: 8,
    extraTags: [],
    resp: ['Run recruitment from advert to contract', 'Maintain staff records and HR systems', 'Support performance management and learning', 'Advise managers on HR policy and labour law'],
    more: ['Support staff wellbeing initiatives', 'Prepare payroll inputs'],
    qual: ['Degree in human resources or a related field', 'Experience in HR in an NGO'],
    comp: ['Discreet', 'Fair and consistent'],
    deliverables: ['HR policy review', 'Recommendations'],
    learning: ['Recruitment in an NGO', 'HR systems'],
  },
  {
    key: 'programme',
    title: 'Programme Manager',
    words: ['programme', 'program', 'project manager', 'project'],
    sector: 'Programme management',
    sdg: 17,
    extraTags: ['donor'],
    resp: ['Lead the delivery of the programme on time and on budget', 'Manage the programme team and partners', 'Monitor results with the MEAL team', 'Report to donors and senior management', 'Represent the organisation with partners and authorities'],
    more: ['Develop new proposals', 'Manage risks and compliance'],
    qual: ['Degree in development studies or a related field', 'Experience managing development or humanitarian programmes', 'Experience managing budgets and teams'],
    comp: ['Leads and motivates', 'Plans and delivers', 'Builds partnerships'],
    deliverables: ['Inception report', 'Draft and final reports'],
    learning: ['Programme management', 'Donor reporting'],
  },
];

const FAMILY_BY_KEY: Record<string, Family> = Object.fromEntries(FAMILIES.map((f) => [f.key, f]));

export type Modifier = 'consultancy' | 'internship' | 'surge' | null;

export type Place = { city: string; country: string; iso: string; risky?: boolean };

export const PLACES: Place[] = [
  { city: 'Nairobi', country: 'Kenya', iso: 'KE' },
  { city: 'Kampala', country: 'Uganda', iso: 'UG' },
  { city: 'Addis Ababa', country: 'Ethiopia', iso: 'ET' },
  { city: 'Juba', country: 'South Sudan', iso: 'SS', risky: true },
  { city: 'Goma', country: 'DR Congo', iso: 'CD', risky: true },
  { city: 'Kinshasa', country: 'DR Congo', iso: 'CD' },
  { city: 'Mogadishu', country: 'Somalia', iso: 'SO', risky: true },
  { city: 'Maiduguri', country: 'Nigeria', iso: 'NG', risky: true },
  { city: 'Abuja', country: 'Nigeria', iso: 'NG' },
  { city: 'Dakar', country: 'Senegal', iso: 'SN' },
  { city: 'Amman', country: 'Jordan', iso: 'JO' },
  { city: 'Beirut', country: 'Lebanon', iso: 'LB' },
  { city: "Cox's Bazar", country: 'Bangladesh', iso: 'BD', risky: true },
  { city: 'Dhaka', country: 'Bangladesh', iso: 'BD' },
  { city: 'Kabul', country: 'Afghanistan', iso: 'AF', risky: true },
  { city: 'Kathmandu', country: 'Nepal', iso: 'NP' },
  { city: 'New Delhi', country: 'India', iso: 'IN' },
  { city: 'Manila', country: 'Philippines', iso: 'PH' },
  { city: 'Port-au-Prince', country: 'Haiti', iso: 'HT', risky: true },
  { city: 'Bogotá', country: 'Colombia', iso: 'CO' },
  { city: 'Geneva', country: 'Switzerland', iso: 'CH' },
  { city: 'London', country: 'United Kingdom', iso: 'GB' },
  { city: 'New York', country: 'United States', iso: 'US' },
  { city: 'Lilongwe', country: 'Malawi', iso: 'MW' },
  { city: 'Maputo', country: 'Mozambique', iso: 'MZ' },
];

const LANGUAGES = ['English', 'French', 'Spanish', 'Arabic', 'Portuguese', 'Swahili', 'Amharic', 'Somali'];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Public holidays by country (month-day), for the deadline warning. Kenya in full for the sample; others the common ones. */
const HOLIDAYS: Record<string, string[]> = {
  KE: ['01-01', '05-01', '06-01', '10-10', '10-20', '12-12', '12-25', '12-26'],
  default: ['01-01', '12-25'],
};

export function isoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ms: number, n: number): string {
  return isoDay(ms + n * DAY);
}

export function parseIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function daysUntil(today: number, iso: string): number {
  return Math.round((parseIso(iso) - startOfDay(today)) / DAY);
}

export function longDate(iso: string): string {
  if (!iso) return '';
  return new Date(parseIso(iso)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function shortDate(iso: string): string {
  if (!iso) return '';
  return new Date(parseIso(iso)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function emptyFacts(): Facts {
  return { title: '', location: '', country: '', iso: '', grade: '', contract: '', duration: '', deadline: '', salary: '', languages: [], remote: false };
}

export function detectFamily(text: string): { family: Family | null; modifier: Modifier } {
  const t = ` ${text.toLowerCase()} `;
  let modifier: Modifier = null;
  if (/\bconsult(ant|ancy)\b|terms of reference|\btor\b/.test(t)) modifier = 'consultancy';
  else if (/\bintern(ship)?\b|\bfellow(ship)?\b/.test(t)) modifier = 'internship';
  else if (/\bsurge\b|\bemergency\b|\broster\b|rapid response|deployment/.test(t)) modifier = 'surge';
  const family = FAMILIES.find((f) => f.key !== 'programme' && f.words.some((w) => t.includes(w))) ?? FAMILIES.find((f) => f.key === 'programme' && f.words.some((w) => t.includes(w))) ?? null;
  return { family, modifier };
}

function titleCase(s: string): string {
  const small = new Set(['and', 'of', 'for', 'the', 'in', 'on', 'to', 'a']);
  return s
    .split(/\s+/)
    .map((w, i) => {
      if (/^[A-Z0-9&]{2,}$/.test(w)) return w;
      const lw = w.toLowerCase();
      if (i > 0 && small.has(lw)) return lw;
      if (lw === 'wash' || lw === 'meal' || lw === 'hr' || lw === 'gbv') return lw.toUpperCase();
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    })
    .join(' ');
}

function titleFrom(text: string, family: Family | null, modifier: Modifier): string {
  const m = text.match(/\b(?:hiring|recruiting|looking for|need|seeking)\s+(?:an?\s+|the\s+)?([a-z&][a-z&\s/–-]{2,60}?)(?=\s+(?:in|for|based|at|to|on|with|who)\b|[,.;:(]|\s+[–-]\s|$)/i);
  if (m) {
    const raw = m[1].trim().replace(/\s+/g, ' ');
    if (raw.split(' ').length <= 7) return titleCase(raw);
  }
  if (!family) return '';
  const sector = family.key === 'programme' ? 'Programme' : family.title.split(' ').slice(0, -1).join(' ') || family.title;
  if (modifier === 'consultancy') return `${sector} Consultant`;
  if (modifier === 'internship') return `${sector} Intern`;
  if (modifier === 'surge') return `Emergency ${sector} Coordinator`;
  return family.title;
}

function nextDate(today: number, day: number, monthIdx: number, year?: number): string {
  const now = new Date(startOfDay(today));
  let y = year ?? now.getFullYear();
  let d = new Date(y, monthIdx, day);
  if (!year && d.getTime() < now.getTime()) {
    y += 1;
    d = new Date(y, monthIdx, day);
  }
  return isoDay(d.getTime());
}

export function extractFacts(text: string, today: number, base: Facts = emptyFacts()): { facts: Facts; family: Family | null; modifier: Modifier } {
  const { family, modifier } = detectFamily(text);
  const f: Facts = { ...base, languages: [...base.languages] };
  const t = text;
  const title = titleFrom(t, family, modifier);
  if (title && !base.title) f.title = title;

  const place = PLACES.find((p) => new RegExp(`\\b${p.city.replace(/[.*+?^${}()|[\]\\']/g, '.')}\\b`, 'i').test(t));
  if (place) {
    f.location = `${place.city}, ${place.country}`;
    f.country = place.country;
    f.iso = place.iso;
  }
  if (/\bremote\b|home[- ]based|work from home/i.test(t)) f.remote = true;

  const grade = t.match(/\b(P-?[1-5]|D-?[12]|G-?[1-7]|NO-?[A-D])\b/i);
  if (grade) f.grade = grade[1].toUpperCase().replace('-', '');

  const months = t.match(/\b(\d{1,2})[- ]?(?:month|months|mo)\b/i);
  const years = t.match(/\b(\d)[- ]?(?:year|years)\b/i);
  if (months) f.duration = `${Number(months[1])} months`;
  else if (years) f.duration = `${Number(years[1])} ${Number(years[1]) === 1 ? 'year' : 'years'}`;

  if (modifier === 'consultancy') f.contract = 'Consultancy';
  else if (modifier === 'internship') f.contract = 'Internship';
  else if (/fixed[- ]term/i.test(t)) f.contract = 'Fixed-term';
  else if (/\btemporary\b/i.test(t)) f.contract = 'Temporary';
  else if (/permanent|open[- ]ended/i.test(t)) f.contract = 'Open-ended';
  else if (f.duration && !f.contract) f.contract = 'Fixed-term';

  const iso = t.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
  const dm = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(20\d\d))?/i);
  const md = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d\d))?/i);
  const weeks = t.match(/\b(?:in|within)\s+(\d)\s+weeks?\b/i);
  if (iso) f.deadline = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else if (dm) f.deadline = nextDate(today, Number(dm[1]), MONTHS.indexOf(dm[2].toLowerCase()), dm[3] ? Number(dm[3]) : undefined);
  else if (md) f.deadline = nextDate(today, Number(md[2]), MONTHS.indexOf(md[1].toLowerCase()), md[3] ? Number(md[3]) : undefined);
  else if (weeks) f.deadline = addDays(today, Number(weeks[1]) * 7);

  const sal = t.match(/\b(USD|US\$|EUR|GBP|KES|\$|€|£)\s?(\d[\d,.]*k?)(?:\s?(?:-|–|to)\s?(\d[\d,.]*k?))?(?:\s?(?:a|per|\/)\s?(month|year|annum|day))?/i);
  if (sal) {
    const cur = sal[1].toUpperCase() === '$' || sal[1].toUpperCase() === 'US$' ? 'USD' : sal[1] === '€' ? 'EUR' : sal[1] === '£' ? 'GBP' : sal[1].toUpperCase();
    f.salary = `${cur} ${sal[2]}${sal[3] ? ` to ${sal[3]}` : ''}${sal[4] ? ` a ${sal[4].toLowerCase() === 'annum' ? 'year' : sal[4].toLowerCase()}` : ''}`;
  }

  for (const lang of LANGUAGES) {
    if (new RegExp(`\\b${lang}\\b`, 'i').test(t) && !f.languages.includes(lang)) f.languages.push(lang);
  }
  return { facts: f, family, modifier };
}

export function familyByKey(key: string): Family | undefined {
  return FAMILY_BY_KEY[key];
}

/** Tags the role needs: the core four, then what the role family, contract, and place call for. */
export function recommendTags(family: Family | null, modifier: Modifier, facts: Facts): string[] {
  const tags = new Set(['role', 'responsibilities', 'qualifications', 'apply']);
  if (modifier === 'consultancy') {
    tags.delete('responsibilities');
    tags.add('deliverables');
    tags.add('payment');
  }
  if (modifier === 'internship') tags.add('learning');
  if (modifier === 'surge') {
    tags.add('deployment');
    tags.add('security');
  }
  if (/^[PD]\d/.test(facts.grade)) {
    tags.add('competencies');
    tags.add('setting');
  }
  for (const t of family?.extraTags ?? []) tags.add(t);
  if (PLACES.some((p) => p.risky && facts.location.startsWith(p.city))) tags.add('security');
  if (facts.languages.length > 1) tags.add('languages');
  return ORDER.filter((k) => tags.has(k));
}

const NEXT_HINTS: Array<{ need: (f: Facts, hasRole: boolean) => boolean; text: (today: number) => string }> = [
  { need: (_f, hasRole) => !hasRole, text: () => "We're hiring a WASH Programme Manager" },
  { need: (f) => !f.location && !f.remote, text: () => ' in Nairobi, Kenya' },
  { need: (f) => !f.duration && !f.contract, text: () => ', 12-month fixed-term contract' },
  { need: (f) => !f.grade, text: () => ' at P4 level' },
  { need: (f) => !f.deadline, text: (today) => `, closing ${longDate(addDays(today, 27))}` },
  { need: (f) => !f.salary, text: () => ', salary USD 4,800 to 5,600 a month' },
  { need: (f) => f.languages.length === 0, text: () => '. English required, French an advantage' },
];

/** Ghost text: the next missing fact, as a completion of what the person has typed. Empty when nothing is missing. */
export function suggestNext(text: string, today: number): string {
  const trimmed = text.replace(/\s+$/, '');
  const { facts, family } = extractFacts(trimmed, today);
  const hasRole = Boolean(family) || Boolean(facts.title);
  const hint = NEXT_HINTS.find((h) => h.need(facts, hasRole));
  if (!hint) return '';
  let s = hint.text(today);
  if (!trimmed) return s;
  if (/[.,;:]$/.test(trimmed)) s = s.replace(/^[.,;:]\s?/, ' ');
  if (/\s$/.test(text)) s = s.replace(/^\s+/, '');
  return s;
}

export type BuildContext = { facts: Facts; familyKey: string; org: Org; tone: Tone; modifier: Modifier };

function yearsFor(grade: string, modifier: Modifier): string {
  if (modifier === 'internship') return 'Currently enrolled in, or graduated within the last year from, a relevant degree';
  const years: Record<string, number> = { P1: 1, P2: 2, P3: 5, P4: 7, P5: 10, D1: 15, D2: 15, NOA: 1, NOB: 2, NOC: 5, NOD: 7 };
  const n = years[grade] ?? (modifier === 'consultancy' ? 5 : /^G/.test(grade) ? 3 : 5);
  return `At least ${n} years of relevant, progressively responsible experience`;
}

function lead(tone: Tone, formal: string, warm: string, plain: string): string {
  return tone === 'formal' ? formal : tone === 'warm' ? warm : plain;
}

export function buildSection(key: string, ctx: BuildContext): Section {
  const { facts: f, org, tone, modifier } = ctx;
  const fam = FAMILY_BY_KEY[ctx.familyKey] ?? FAMILY_BY_KEY.programme;
  const title = f.title || fam.title;
  const where = f.remote ? 'remotely' : f.location ? `in ${f.location}` : 'at the duty station';
  const label = TAG_BY_KEY[key]?.label ?? key;
  const std = org.standard.find((s) => s.key === key);
  if (std) return { key, title: label, lines: [std.text] };
  const terms = [f.contract, f.duration, f.grade && `grade ${f.grade}`].filter(Boolean).join(', ');
  switch (key) {
    case 'about':
      return { key, title: label, lines: [org.about] };
    case 'role':
      return {
        key,
        title: label,
        lines: [
          lead(
            tone,
            `${org.name} seeks a ${title} to be based ${where}. The incumbent will lead ${fam.sector.toLowerCase()} work and contribute to the organisation's country strategy.`,
            `We're looking for a ${title} to join our team ${where}. You'll lead our ${fam.sector.toLowerCase()} work and make a real difference for the communities we serve.`,
            `This ${title} role is based ${where} and leads ${fam.sector.toLowerCase()} work.`,
          ),
          ...(terms ? [`Contract: ${terms}.`] : []),
        ],
      };
    case 'setting':
      return {
        key,
        title: label,
        lines: [`This position is located in the ${org.short} ${f.location ? `${f.location.split(',')[0]} office` : 'country office'} and reports to the Head of Programmes. The incumbent works closely with the operations, MEAL, and partnerships teams.`],
      };
    case 'responsibilities':
      return { key, title: label, lines: [lead(tone, 'Key responsibilities include:', "What you'll do:", 'Responsibilities:'), ...fam.resp.map((r) => `- ${r}`)] };
    case 'qualifications':
      return {
        key,
        title: label,
        lines: [lead(tone, 'Education and experience:', "What you'll bring:", 'Requirements:'), ...fam.qual.map((q) => `- ${q}`), `- ${yearsFor(f.grade, modifier)}`],
      };
    case 'competencies':
      return { key, title: label, lines: [...(tone === 'formal' ? ['- Professionalism, teamwork, and accountability'] : []), ...fam.comp.map((c) => `- ${c}`)] };
    case 'languages': {
      const [first, ...rest] = f.languages.length ? f.languages : ['English'];
      return { key, title: label, lines: [`Fluency in ${first} is required.${rest.length ? ` Knowledge of ${rest.join(' or ')} is an advantage.` : ''}`] };
    }
    case 'offer': {
      const risky = PLACES.some((p) => p.risky && f.location.startsWith(p.city));
      return {
        key,
        title: label,
        lines: [
          f.salary ? `Salary: ${f.salary}.` : `Salary: in line with ${org.short}'s salary scale.`,
          '- 25 days of annual leave, medical insurance, and a learning budget',
          ...(risky ? ['- Rest and recuperation cycle in line with the duty station'] : []),
          ...(modifier === 'internship' ? ['- A monthly stipend and a mentor for the whole internship'] : []),
        ],
      };
    }
    case 'apply':
      return {
        key,
        title: label,
        lines: [`Apply on ${org.short}'s careers site${f.deadline ? ` by ${longDate(f.deadline)}` : ''}. Applications are reviewed on a rolling basis; only shortlisted candidates will be contacted.`],
      };
    case 'assessment':
      return { key, title: label, lines: ['Evaluation of qualified candidates may include a written assessment, followed by a competency-based interview.'] };
    case 'safeguarding':
      return {
        key,
        title: label,
        lines: [`${org.short} is committed to keeping children and adults at risk safe. All offers depend on satisfactory references and background checks, and every staff member follows our code of conduct.`],
      };
    case 'security':
      return {
        key,
        title: label,
        lines: [`${f.location ? f.location.split(',')[0] : 'The duty station'} has security restrictions. The post holder follows the security plan and movement rules at all times; rest and recuperation applies.`],
      };
    case 'donor':
      return { key, title: label, lines: ['This position is funded by an institutional donor. The post holder makes sure activities follow donor rules and reporting deadlines.'] };
    case 'deliverables':
      return { key, title: label, lines: [lead(tone, 'The consultant will deliver:', "You'll deliver:", 'Deliverables:'), ...fam.deliverables.map((d) => `- ${d}`), `Duration: ${f.duration || '40 working days over 3 months'}.`] };
    case 'payment':
      return { key, title: label, lines: ['Payment in instalments on approval of each deliverable: 20% on the inception report, 40% on the draft, and 40% on the final report.'] };
    case 'learning':
      return { key, title: label, lines: [lead(tone, 'The intern will gain experience in:', "What you'll learn:", 'Learning goals:'), ...fam.learning.map((l) => `- ${l}`)] };
    case 'deployment':
      return {
        key,
        title: label,
        lines: [`Deployment within 72 hours of an offer, for ${f.duration || 'up to 3 months'}. Candidates need a valid passport and medical clearance.`],
      };
    default:
      return { key, title: label, lines: [`${label}: to be written.`] };
  }
}

export function buildSections(tags: string[], ctx: BuildContext): Section[] {
  return ORDER.filter((k) => tags.includes(k)).map((k) => buildSection(k, ctx));
}

export type QualityItem = { key: string; level: 'ok' | 'warn' | 'issue'; text: string; section?: string };

const EXCLUDING = [
  { re: /\bhe\b|\bhis\b|\bhim\b/i, say: '"he" or "his": use "they" or "the post holder"' },
  { re: /\bshe\b|\bher\b/i, say: '"she" or "her": use "they" or "the post holder"' },
  { re: /\bmanpower\b/i, say: '"manpower": use "staff" or "workforce"' },
  { re: /\bchairman\b/i, say: '"chairman": use "chair"' },
  { re: /\bnative speaker\b/i, say: '"native speaker": use "fluent"' },
  { re: /\byoung\b|\benergetic\b/i, say: 'wording that suggests age' },
  { re: /\bninja\b|\brockstar\b/i, say: 'jargon that puts some people off' },
];

export function weekend(iso: string): boolean {
  const d = new Date(parseIso(iso)).getDay();
  return d === 0 || d === 6;
}

export function holiday(iso: string, countryIso: string): boolean {
  const md = iso.slice(5);
  return (HOLIDAYS[countryIso] ?? HOLIDAYS.default).includes(md);
}

/** Inline checks shown on the document. They never block publishing except a missing deadline or title. */
export function quality(sections: Section[], facts: Facts, today: number, otherLiveTitles: string[]): QualityItem[] {
  const items: QualityItem[] = [];
  if (!facts.title) items.push({ key: 'title', level: 'issue', text: 'Add a job title' });
  if (!facts.deadline) items.push({ key: 'deadline', level: 'issue', text: 'Add a closing date: candidates and Google need one' });
  else {
    const left = daysUntil(today, facts.deadline);
    if (left < 0) items.push({ key: 'deadline-past', level: 'issue', text: 'The closing date has passed' });
    else if (left < 14 && /^[PD]\d/.test(facts.grade)) items.push({ key: 'deadline-short', level: 'warn', text: `Only ${left} days to apply: international roles usually allow at least 2 weeks` });
    if (weekend(facts.deadline)) items.push({ key: 'deadline-weekend', level: 'warn', text: `${longDate(facts.deadline)} is a weekend` });
    if (holiday(facts.deadline, facts.iso)) items.push({ key: 'deadline-holiday', level: 'warn', text: `${longDate(facts.deadline)} is a public holiday${facts.country ? ` in ${facts.country}` : ''}` });
  }
  if (!facts.location && !facts.remote) items.push({ key: 'location', level: 'issue', text: 'Add a duty station, or mark the job remote' });
  if (!facts.salary) items.push({ key: 'salary', level: 'warn', text: 'No salary stated: many candidates filter by pay' });
  for (const s of sections) {
    const text = s.lines.join(' ');
    for (const e of EXCLUDING) if (e.re.test(text)) items.push({ key: `words-${s.key}-${e.say}`, level: 'warn', text: `${s.title}: ${e.say}`, section: s.key });
  }
  const words = sections.reduce((n, s) => n + s.lines.join(' ').split(/\s+/).filter(Boolean).length, 0);
  if (words > 900) items.push({ key: 'length', level: 'warn', text: `${words} words: adverts over about 900 words are often skimmed` });
  if (facts.title && otherLiveTitles.some((t) => t.toLowerCase() === facts.title.toLowerCase())) {
    items.push({ key: 'duplicate', level: 'warn', text: 'A job with this title is already live' });
  }
  const googleReady = Boolean(facts.title && facts.deadline && (facts.location || facts.remote) && sections.length >= 3);
  items.push({ key: 'google', level: googleReady ? 'ok' : 'warn', text: googleReady ? "Ready for Google's job listings" : "Not yet ready for Google's job listings: needs title, place, closing date, and 3 sections" });
  return items;
}

export type ChatResult = { sections: Section[]; tags: string[]; tone: Tone; facts: Facts; reply: string; quick?: string[] };

function sectionFrom(text: string, tags: string[]): string | null {
  const t = text.toLowerCase();
  const match = TAGS.find((tag) => tags.includes(tag.key) && (t.includes(tag.label.toLowerCase()) || t.includes(tag.key)));
  return match?.key ?? null;
}

/** Edits asked for in the chat after the first draft. */
export function applyEdit(text: string, tags: string[], sections: Section[], ctx: BuildContext, today: number): ChatResult {
  const t = text.toLowerCase();
  const target = sectionFrom(text, tags);
  let tone = ctx.tone;
  let nextTags = tags;
  let facts = ctx.facts;
  const fam = FAMILY_BY_KEY[ctx.familyKey] ?? FAMILY_BY_KEY.programme;
  const rebuild = (keys: string[], c: BuildContext) => sections.map((s) => (keys.includes(s.key) && !s.edited ? buildSection(s.key, c) : s));

  if (/\b(shorter|shorten|concise|cut)\b/.test(t)) {
    const keys = target ? [target] : sections.map((s) => s.key);
    const next = sections.map((s) => {
      if (!keys.includes(s.key)) return s;
      const bullets = s.lines.filter((l) => l.startsWith('- '));
      const other = s.lines.filter((l) => !l.startsWith('- '));
      return { ...s, lines: [...other.slice(0, 1), ...bullets.slice(0, 3)] };
    });
    return { sections: next, tags, tone, facts, reply: target ? `Shortened ${TAG_BY_KEY[target].label}.` : 'Shortened every section to its essentials.', quick: ['Undo that', 'More formal'] };
  }
  if (/\b(longer|expand|more detail|add more)\b/.test(t)) {
    const key = target ?? 'responsibilities';
    const next = sections.map((s) => (s.key === key ? { ...s, lines: [...s.lines, ...fam.more.filter((m) => !s.lines.includes(`- ${m}`)).map((m) => `- ${m}`)] } : s));
    return { sections: next, tags, tone, facts, reply: `Added more detail to ${TAG_BY_KEY[key]?.label ?? key}.` };
  }
  if (/\b(formal|un tone)\b/.test(t)) tone = 'formal';
  else if (/\b(warm|friendly|human)\b/.test(t)) tone = 'warm';
  else if (/\b(plain|simple|direct)\b/.test(t)) tone = 'plain';
  if (tone !== ctx.tone) {
    const c = { ...ctx, tone };
    return { sections: rebuild(sections.map((s) => s.key), c), tags, tone, facts, reply: `Rewritten in a ${tone} tone. Sections you edited by hand are unchanged.` };
  }
  const add = t.match(/\badd\s+(?:a\s+|an\s+|the\s+)?(.+)/);
  const remove = t.match(/\b(?:remove|drop|delete)\s+(?:the\s+)?(.+)/);
  const lang = LANGUAGES.find((l) => t.includes(l.toLowerCase()));
  if (lang && !facts.languages.includes(lang)) {
    facts = { ...facts, languages: facts.languages.length ? [...facts.languages, lang] : ['English', lang] };
    nextTags = tags.includes('languages') ? tags : [...tags, 'languages'];
    const c = { ...ctx, facts };
    const sec = buildSections(nextTags, c);
    const merged = sec.map((s) => sections.find((o) => o.key === s.key && o.key !== 'languages') ?? s);
    return { sections: merged, tags: nextTags, tone, facts, reply: `Added ${lang} as ${facts.languages.length > 1 ? 'an advantage' : 'required'}.` };
  }
  if (add) {
    const tag = TAGS.find((x) => add[1].includes(x.label.toLowerCase()) || add[1].includes(x.key));
    if (tag && !tags.includes(tag.key)) {
      nextTags = ORDER.filter((k) => k === tag.key || tags.includes(k));
      const next = ORDER.filter((k) => nextTags.includes(k)).map((k) => sections.find((s) => s.key === k) ?? buildSection(k, ctx));
      return { sections: next, tags: nextTags, tone, facts, reply: `Added ${tag.label}.` };
    }
  }
  if (remove) {
    const tag = TAGS.find((x) => tags.includes(x.key) && (remove[1].includes(x.label.toLowerCase()) || remove[1].includes(x.key)));
    if (tag) {
      nextTags = tags.filter((k) => k !== tag.key);
      return { sections: sections.filter((s) => s.key !== tag.key), tags: nextTags, tone, facts, reply: `Removed ${tag.label}.` };
    }
  }
  const { facts: f2 } = extractFacts(text, today, facts);
  const changed = (Object.keys(f2) as Array<keyof typeof f2>).filter((k) => JSON.stringify(f2[k]) !== JSON.stringify(facts[k]));
  if (changed.length) {
    facts = f2;
    const c = { ...ctx, facts };
    return { sections: rebuild(['role', 'apply', 'offer', 'languages', 'setting', 'security', 'deployment', 'deliverables'], c), tags, tone, facts, reply: `Updated ${changed.join(', ')} and the sections that mention it.` };
  }
  const key = target ?? 'role';
  const sentence = text.trim().replace(/^./, (c) => c.toUpperCase()).replace(/([^.!?])$/, '$1.');
  const next = sections.map((s) => (s.key === key ? { ...s, lines: [...s.lines, sentence] } : s));
  return { sections: next, tags, tone, facts, reply: `Added that to ${TAG_BY_KEY[key]?.label ?? 'The role'}.` };
}

export function slug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
