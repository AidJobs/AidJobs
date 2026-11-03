import { applyLines, defaultApply } from './apply';
import { addDays, buildSections, emptyFacts, FORMATS, orderSections } from './engine';
import type { DemoJob, Facts, Format, InboxItem, Org, Person, Review, State } from './types';

const DAY = 86_400_000;

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
  voice: ['Warm', 'Plain English', 'Speaks as "we"', 'Rights-based'],
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
  learned: { source: 'careers', adverts: 4, confirmed: false },
  approval: 'senior',
  approvalRule: 'any',
  verified: true,
  setupDone: true,
};

/** Riverstone's own format, as AidJobs learned it from four adverts on its careers site (simulated). */
export const HOUSE_FORMAT: Format = {
  key: 'house',
  label: 'Riverstone format',
  family: 'Your organisation',
  usedBy: 'Learned from 4 of your adverts on riverstone.example.org/careers (simulated)',
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

function noReview(): Review {
  return { state: 'none', reviewers: [], due: '', round: 0, rule: 'any', remarks: [] };
}

export function allFormats(): Format[] {
  return [HOUSE_FORMAT, ...FORMATS];
}

function job(today: number, id: string, roleKey: string, formatKey: string, facts: Partial<Facts>, extra: Partial<DemoJob>): DemoJob {
  const f: Facts = { ...emptyFacts(), languages: ['English'], ...facts };
  const format = allFormats().find((x) => x.key === formatKey) ?? HOUSE_FORMAT;
  const apply = defaultApply(SAMPLE_ORG.orgType, SAMPLE_ORG.careersUrl);
  const tags = orderSections(format.order.map((o) => o.key), format);
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
    countsAsFreeDraft: false,
    audit: [{ at: today - 6 * DAY, who: SAMPLE_ME.name, what: 'Created' }],
    ...extra,
  };
}

export function sampleJobs(today: number): DemoJob[] {
  return [
    job(today, 'job-cps', 'protection', 'house', { title: 'Child Protection Specialist', location: 'Kampala, Uganda', country: 'Uganda', iso: 'UG', timezone: 'EAT', contract: 'Fixed-term', duration: '12 months', grade: 'C1', deadline: addDays(today, 2), salaryMode: 'range', salaryMin: '3,900', salaryMax: '4,400', currency: 'USD', safeguarding: 'high' }, {
      status: 'live',
      plan: 'premium',
      publishedAt: today - 26 * DAY,
      reach: {
        candidates: [{ email: 'candidate1@example.org', status: 'sent' }, { email: 'candidate2@example.org', status: 'sent' }],
        team: ['amina', 'daniel', 'grace'].map((n) => ({ email: `${n}@riverstone.example.org`, status: 'sent' as const })),
        community: true,
        intro: '',
      },
      audit: [
        { at: today - 30 * DAY, who: SAMPLE_ME.name, what: 'Created' },
        { at: today - 26 * DAY, who: SAMPLE_ME.name, what: 'Published as Premium' },
      ],
    }),
    job(today, 'job-meal', 'meal', 'house', { title: 'MEAL Coordinator', location: 'Addis Ababa, Ethiopia', country: 'Ethiopia', iso: 'ET', timezone: 'EAT', contract: 'Fixed-term', duration: '24 months', deadline: addDays(today, 9), salaryMode: 'scale' }, {
      status: 'live',
      plan: 'standard',
      publishedAt: today - 12 * DAY,
      audit: [{ at: today - 12 * DAY, who: 'Grace Akello', what: 'Published as Standard' }],
    }),
    job(today, 'job-fin', 'finance', 'ingo-role-profile', { title: 'Finance Officer', location: 'Juba, South Sudan', country: 'South Sudan', iso: 'SS', timezone: 'CAT', grade: 'D1', contract: 'Fixed-term', duration: '12 months', deadline: addDays(today, 24) }, {
      status: 'review',
      review: {
        state: 'open',
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
    job(today, 'job-comms', 'comms', 'house', { title: 'Communications Intern', location: 'Nairobi, Kenya', country: 'Kenya', iso: 'KE', timezone: 'EAT', engagement: 'internship', contract: 'Internship', duration: '6 months' }, { status: 'draft', countsAsFreeDraft: true }),
    job(today, 'job-log', 'logistics', 'house', { title: 'Logistics Assistant', location: 'Kampala, Uganda', country: 'Uganda', iso: 'UG', contract: 'Fixed-term', duration: '6 months', deadline: addDays(today, -25) }, {
      status: 'closed',
      plan: 'standard',
      publishedAt: today - 55 * DAY,
      closedAt: today - 25 * DAY,
      closeReason: 'deadline',
    }),
    job(today, 'job-wash-2026', 'wash', 'house', { title: 'WASH Programme Manager', location: 'Juba, South Sudan', country: 'South Sudan', iso: 'SS', grade: 'D2', contract: 'Fixed-term', duration: '12 months', deadline: addDays(today, -230), salaryMode: 'range', salaryMin: '5,200', salaryMax: '6,300', currency: 'USD' }, {
      status: 'closed',
      plan: 'premium',
      publishedAt: today - 262 * DAY,
      closedAt: today - 230 * DAY,
      closeReason: 'filled',
      createdAt: today - 270 * DAY,
    }),
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
    v: 2,
    today,
    signedIn: false,
    me: SAMPLE_ME,
    org: SAMPLE_ORG,
    team: SAMPLE_TEAM,
    jobs: sampleJobs(today),
    formats: allFormats(),
    inbox: sampleInbox(today),
    draftsUsed: 1,
    credits: 0,
    receipts: [],
    reviewerAs: null,
    notice: null,
    seq: 1,
  };
}

/** Sample jobs from other fictional organisations, for the public view only. */
export const PUBLIC_SAMPLES = [
  { id: 'p1', org: 'Harbour Health Alliance', title: 'Nutrition Officer', place: 'Lilongwe, Malawi', iso: 'MW', days: 6, premium: true },
  { id: 'p2', org: 'Meridian Education Trust', title: 'Education in Emergencies Coordinator', place: "Cox's Bazar, Bangladesh", iso: 'BD', days: 14, premium: true },
  { id: 'p3', org: 'Northfield Relief', title: 'Protection Monitoring Assistant', place: 'Goma, DR Congo', iso: 'CD', days: 3, premium: false },
  { id: 'p4', org: 'Bluewater Climate Fund', title: 'Climate Finance Analyst', place: 'Geneva, Switzerland', iso: 'CH', days: 11, premium: false },
  { id: 'p5', org: 'Open Hands Foundation', title: 'Grants Manager', place: 'London, United Kingdom', iso: 'GB', days: 19, premium: false },
  { id: 'p6', org: 'Harbour Health Alliance', title: 'Community Health Supervisor', place: 'Maputo, Mozambique', iso: 'MZ', days: 8, premium: false },
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
