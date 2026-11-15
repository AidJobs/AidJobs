import { applyLines, defaultApply } from './apply';
import { defaultMessages } from './invites';
import { addDays, buildSections, emptyFacts, FORMATS, holiday, orderSections, weekend } from './engine';
import type { DemoJob, Facts, Format, InboxItem, Org, Person, Review, State } from './types';

const DAY = 86_400_000;

/** About `days` from today, moved on to the next working day in the country, so the sample draft's checks do not depend on the weekday. */
function workingDay(today: number, days: number, countryIso: string): string {
  let n = days;
  while (weekend(addDays(today, n), countryIso) || holiday(addDays(today, n), countryIso)) n += 1;
  return addDays(today, n);
}

/** A fictional organisation; every address is on example.org, which is reserved for examples. */
export const SAMPLE_ORG: Org = {
  name: 'Riverstone Aid',
  short: 'Riverstone',
  type: 'International NGO',
  orgType: 'ingo',
  hq: 'Nairobi, Kenya',
  website: 'https://riverstone.example.org',
  careersUrl: 'https://riverstone.example.org/careers',
  domain: 'riverstone.example.org',
  about:
    'Riverstone Aid is a sample international NGO working with communities in East Africa on clean water, health, and protection. This organisation is fictional and exists only in this demo.',
  sectors: ['Water, sanitation and hygiene', 'Health', 'Child protection'],
  sdgs: [3, 6, 16],
  countries: ['Kenya', 'Uganda', 'Ethiopia', 'South Sudan'],
  voice: ['Warm', 'Speaks as "we"', 'Rights-based'],
  standard: [
    { key: 'safeguarding', label: 'Safeguarding', text: 'Riverstone Aid is committed to keeping children and adults at risk safe. Our selection process includes checks that reflect this commitment, and every member of staff follows our code of conduct.', locked: true },
    { key: 'psea', label: 'PSEA', text: 'Riverstone Aid has zero tolerance for sexual exploitation, abuse and harassment. All staff complete PSEA training and must report any concern.', locked: true },
    { key: 'mds', label: 'Misconduct Disclosure Scheme', text: 'Riverstone Aid takes part in the Inter-Agency Misconduct Disclosure Scheme. We will ask your previous employers about any findings of sexual exploitation, abuse or harassment.', locked: true },
    { key: 'fraud', label: 'No fee, fraud warning', text: 'Riverstone Aid never charges a fee at any stage of recruitment. Report any request for payment to safeguarding@riverstone.example.org.', locked: true },
    { key: 'equal', label: 'Equal opportunity', text: 'Riverstone Aid is an equal opportunity employer. We welcome applications from everyone, and particularly from people from the communities we work with.', locked: false },
  ],
  mdsMember: true,
  scale: [
    { grade: 'B2', min: 145000, max: 190000, currency: 'KES', period: 'month' },
    { grade: 'C1', min: 230000, max: 300000, currency: 'KES', period: 'month' },
    { grade: 'D1', min: 4200, max: 5100, currency: 'USD', period: 'month' },
    { grade: 'D2', min: 5200, max: 6300, currency: 'USD', period: 'month' },
  ],
  learned: { source: 'history', adverts: 3, confirmed: true },
  approval: 'senior',
  approvalRule: 'any',
  noSkip: false,
  verified: true,
  setupDone: true,
  freeTermsAccepted: false,
};

/** Riverstone's base JD format: the headings its own job descriptions share, confirmed by the organisation (sample). */
export const HOUSE_FORMAT: Format = {
  key: 'house',
  label: 'Riverstone format',
  family: 'Your organisation',
  usedBy: 'Your base JD format, from 3 of your own job descriptions (sample)',
  tone: 'warm',
  order: [
    { key: 'about', heading: 'About us' },
    { key: 'purpose', heading: 'The role' },
    { key: 'responsibilities', heading: 'What you will do' },
    { key: 'requirements', heading: 'What you will bring' },
    { key: 'offer', heading: 'What we offer' },
    { key: 'apply', heading: 'How to apply' },
  ],
  commitments: ['safeguarding', 'psea', 'mds', 'fraud', 'equal'],
};

export const SAMPLE_ME: Person = { id: 'me', name: 'Sam Otieno', email: 'sam@riverstone.example.org', role: 'owner' };

export const SAMPLE_TEAM: Person[] = [
  SAMPLE_ME,
  { id: 'amina', name: 'Amina Yusuf', email: 'amina@riverstone.example.org', role: 'reviewer' },
  { id: 'daniel', name: 'Daniel Mwangi', email: 'daniel@riverstone.example.org', role: 'reviewer' },
  { id: 'grace', name: 'Grace Akello', email: 'grace@riverstone.example.org', role: 'member' },
];

/** Three days before the start of this month: the sample's free job published last month, whatever today's date. */
function lastMonth(today: number): number {
  const d = new Date(today);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 3 * DAY;
}

function noReview(): Review {
  return { state: 'none', reviewers: [], due: '', round: 0, rule: 'any', remarks: [] };
}

export function allFormats(): Format[] {
  return [HOUSE_FORMAT, ...FORMATS];
}

/** A sample job; `add` puts extra sections in, so that the recent jobs share a pattern the base JD format lacks (the base prompt, plan section 15). */
function job(today: number, id: string, roleKey: string, formatKey: string, facts: Partial<Facts>, extra: Partial<DemoJob>, add: string[] = []): DemoJob {
  const f: Facts = { ...emptyFacts(), languages: ['English'], ...facts };
  const format = allFormats().find((x) => x.key === formatKey) ?? HOUSE_FORMAT;
  const apply = defaultApply(SAMPLE_ORG.orgType, SAMPLE_ORG.careersUrl);
  const tags = orderSections([...format.order.map((o) => o.key), ...add], format);
  const sections = buildSections(tags, { facts: f, roleKey, org: SAMPLE_ORG, tone: format.tone, format, commitments: format.commitments, applyLines: applyLines(apply, f, SAMPLE_ORG) });
  return {
    id,
    status: 'draft',
    plan: null,
    facts: f,
    family: roleKey,
    tags,
    format: format.key,
    tone: format.tone,
    commitments: format.commitments,
    apply,
    genuine: {},
    sections,
    versions: [{ n: 1, at: today - 3 * DAY, note: 'First draft', sections }],
    review: noReview(),
    reach: null,
    chat: [],
    createdAt: today - 6 * DAY,
    audit: [{ at: today - 6 * DAY, who: SAMPLE_ME.name, what: 'Created' }],
    ...extra,
  };
}

/** The Child Protection Specialist's Reach at go-live: two invitations and three colleagues. */
function sampleReach(j: DemoJob, today: number): DemoJob {
  const sent = (email: string) => ({ email, status: 'sent' as const, round: 1 });
  return {
    ...j,
    reach: {
      candidates: ['candidate1@example.org', 'candidate2@example.org'].map(sent),
      team: ['amina', 'daniel', 'grace'].map((n) => sent(`${n}@riverstone.example.org`)),
      rounds: [{ n: 1, at: today - 26 * DAY, why: 'At go-live' }],
      ...defaultMessages(j, SAMPLE_ORG),
    },
  };
}

export function sampleJobs(today: number): DemoJob[] {
  return sampleList(today)
    .map((j) => (j.id === 'job-cps' ? sampleReach(j, today) : j))
    .map((j) => (j.status === 'live' ? { ...j, published: { facts: j.facts, sections: j.sections, at: j.publishedAt ?? today } } : j));
}

function sampleList(today: number): DemoJob[] {
  return [
    job(today, 'job-cps', 'protection', 'house', { title: 'Child Protection Specialist', location: 'Kampala, Uganda', country: 'Uganda', iso: 'UG', timezone: 'EAT', contract: 'Fixed-term', duration: '12 months', grade: 'C1', deadline: addDays(today, 2), salaryMode: 'range', salaryMin: '3,900', salaryMax: '4,400', currency: 'USD', safeguarding: 'high' }, {
      status: 'live',
      plan: 'amplify',
      publishedAt: today - 26 * DAY,
      createdAt: today - 30 * DAY,
      audit: [
        { at: today - 30 * DAY, who: SAMPLE_ME.name, what: 'Created' },
        { at: today - 26 * DAY, who: SAMPLE_ME.name, what: 'Amplified and published' },
      ],
    }, ['assessment']),
    job(today, 'job-meal', 'meal', 'house', { title: 'MEAL Coordinator', location: 'Addis Ababa, Ethiopia', country: 'Ethiopia', iso: 'ET', timezone: 'EAT', contract: 'Fixed-term', duration: '24 months', deadline: addDays(today, 9), salaryMode: 'scale' }, {
      status: 'live',
      plan: 'free',
      publishedAt: lastMonth(today),
      createdAt: lastMonth(today) - 3 * DAY,
      audit: [{ at: lastMonth(today), who: 'Grace Akello', what: 'Published free' }],
    }, ['assessment']),
    // Free, listed 60 days: its listing ends in 5 days, before it closes in 20 (plan section 17, decision 3).
    job(today, 'job-liv', 'livelihoods', 'house', { title: 'Livelihoods Officer', location: 'Maiduguri, Nigeria', country: 'Nigeria', iso: 'NG', timezone: 'WAT', contract: 'Fixed-term', duration: '12 months', deadline: addDays(today, 20), salaryMode: 'scale' }, {
      status: 'live',
      plan: 'free',
      publishedAt: today - 55 * DAY,
      createdAt: today - 60 * DAY,
      audit: [
        { at: today - 60 * DAY, who: SAMPLE_ME.name, what: 'Created' },
        { at: today - 55 * DAY, who: SAMPLE_ME.name, what: 'Published free' },
      ],
    }),
    job(today, 'job-fin', 'finance', 'ingo-role-profile', { title: 'Finance Officer', location: 'Juba, South Sudan', country: 'South Sudan', iso: 'SS', timezone: 'CAT', grade: 'D1', contract: 'Fixed-term', duration: '12 months', deadline: workingDay(today, 24, 'SS') }, {
      status: 'approved',
      review: {
        state: 'approved',
        approvedVersion: 1,
        reviewers: [
          { name: 'Amina Yusuf', email: 'amina@riverstone.example.org', outside: false, decision: 'approved', note: 'Looks good to me.' },
          { name: 'Daniel Mwangi', email: 'daniel@riverstone.example.org', outside: false },
        ],
        due: addDays(today, 3),
        round: 1,
        rule: 'any',
        remarks: [{ id: 'r1', section: 'requirements', author: 'Amina Yusuf', kind: 'suggestion', text: 'Add the field-experience point we discussed.', suggestion: '- Experience working in a field office', state: 'open' }],
      },
      audit: [
        { at: today - 6 * DAY, who: SAMPLE_ME.name, what: 'Created' },
        { at: today - 2 * DAY, who: SAMPLE_ME.name, what: 'Sent for review to Amina Yusuf and Daniel Mwangi' },
        { at: today - DAY, who: 'Amina Yusuf', what: 'Approved version 1' },
      ],
    }),
    job(today, 'job-comms', 'comms', 'house', { title: 'Communications Intern', location: 'Nairobi, Kenya', country: 'Kenya', iso: 'KE', timezone: 'EAT', engagement: 'internship', contract: 'Internship', duration: '6 months' }, { status: 'draft' }),
    // Closed early 4 days ago: still in "Closed", where it can be reopened (plan section 17, decisions 4 and 5).
    job(today, 'job-health', 'health', 'house', { title: 'Health Officer', location: 'Goma, DR Congo', country: 'DR Congo', iso: 'CD', timezone: 'CAT', contract: 'Fixed-term', duration: '12 months', deadline: addDays(today, 10), salaryMode: 'scale' }, {
      status: 'closed',
      plan: 'amplify',
      publishedAt: today - 30 * DAY,
      closedAt: today - 4 * DAY,
      closeReason: 'early',
      createdAt: today - 34 * DAY,
      audit: [
        { at: today - 34 * DAY, who: SAMPLE_ME.name, what: 'Created' },
        { at: today - 30 * DAY, who: SAMPLE_ME.name, what: 'Amplified and published' },
        { at: today - 4 * DAY, who: SAMPLE_ME.name, what: 'Closed early' },
      ],
    }, ['assessment']),
    job(today, 'job-log', 'logistics', 'house', { title: 'Logistics Assistant', location: 'Kampala, Uganda', country: 'Uganda', iso: 'UG', contract: 'Fixed-term', duration: '6 months', deadline: addDays(today, -25) }, {
      status: 'closed',
      plan: 'free',
      publishedAt: today - 55 * DAY,
      closedAt: today - 25 * DAY,
      createdAt: today - 60 * DAY,
      closeReason: 'deadline',
    }),
    job(today, 'job-wash-2026', 'wash', 'house', { title: 'WASH Programme Manager', location: 'Juba, South Sudan', country: 'South Sudan', iso: 'SS', grade: 'D2', contract: 'Fixed-term', duration: '12 months', deadline: addDays(today, -230), salaryMode: 'range', salaryMin: '5,200', salaryMax: '6,300', currency: 'USD' }, {
      status: 'closed',
      plan: 'amplify',
      publishedAt: today - 262 * DAY,
      closedAt: today - 230 * DAY,
      closeReason: 'filled',
      createdAt: today - 270 * DAY,
    }, ['assessment']),
  ];
}

export function sampleInbox(today: number): InboxItem[] {
  return [
    { id: 'i1', kind: 'approved', jobId: 'job-fin', title: 'Amina approved Finance Officer', body: 'One approval is enough under your rule. Daniel has not answered yet.', at: today - DAY },
    { id: 'i2', kind: 'deadline', jobId: 'job-cps', title: 'Child Protection Specialist closes in 2 days', body: 'Extend it, or let it close on the date?', at: today },
    { id: 'i3', kind: 'removal', jobId: 'job-log', title: 'Logistics Assistant: page removed in 5 days', body: 'It closed 25 days ago. The record stays in your history; download a copy if you need one.', at: today },
  ];
}

export function initialState(today: number): State {
  return {
    v: 4,
    today,
    signedIn: false,
    me: SAMPLE_ME,
    org: SAMPLE_ORG,
    team: SAMPLE_TEAM,
    jobs: sampleJobs(today),
    formats: allFormats(),
    inbox: sampleInbox(today),
    // The sample's jobs use neither free listing, so each offer can be seen once (section 19, phase 5, D).
    free: {},
    packs: [],
    subscription: null,
    receipts: [],
    reviewerAs: null,
    notice: null,
    seq: 1,
  };
}

/** Sample jobs from other fictional organisations, for the public view only. */
export const PUBLIC_SAMPLES = [
  { id: 'p1', org: 'Harbour Health Alliance', title: 'Nutrition Officer', place: 'Lilongwe, Malawi', iso: 'MW', days: 6, amplified: true },
  { id: 'p2', org: 'Meridian Education Trust', title: 'Education in Emergencies Coordinator', place: "Cox's Bazar, Bangladesh", iso: 'BD', days: 14, amplified: true },
  { id: 'p3', org: 'Northfield Relief', title: 'Protection Monitoring Assistant', place: 'Goma, DR Congo', iso: 'CD', days: 3, amplified: false },
  { id: 'p4', org: 'Bluewater Climate Fund', title: 'Climate Finance Analyst', place: 'Geneva, Switzerland', iso: 'CH', days: 11, amplified: false },
  { id: 'p5', org: 'Open Hands Foundation', title: 'Grants Manager', place: 'London, United Kingdom', iso: 'GB', days: 19, amplified: false },
  { id: 'p6', org: 'Harbour Health Alliance', title: 'Community Health Supervisor', place: 'Maputo, Mozambique', iso: 'MZ', days: 8, amplified: false },
];

/** Sample market context for the first screen; replaced by real AidJobs figures once there are enough jobs. */
export const MARKET_SAMPLE = { similar: 34, grade: 'P4 or equivalent', showPay: 62, daysOpen: 21 };

/** Stands in for the page behind a pasted link: the demo never fetches. */
export const LINKED_SAMPLE = `ABOUT THE ROLE
The Protection Officer leads community-based protection activities in Amman, working with refugee families and local partners.

KEY RESPONSIBILITIES
• Run protection monitoring visits and referrals
• Train partner staff on safe referral pathways
• Report monthly to the Protection Coordinator

ABOUT YOU
• Degree in law, social work, or a related field
• Three years of protection work in humanitarian settings
• Fluent Arabic and English

HOW TO APPLY
Send your CV and a cover letter to jobs@example.org by 30 November 2026.`;
