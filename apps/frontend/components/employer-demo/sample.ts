import { addDays, buildSections, emptyFacts, STYLES } from './engine';
import type { DemoJob, Facts, InboxItem, Org, Person, Review, State } from './types';

const DAY = 86_400_000;

/** A fictional organisation; every address is on example.org, which is reserved for examples. */
export const SAMPLE_ORG: Org = {
  name: 'Riverstone Aid',
  short: 'Riverstone',
  type: 'International NGO',
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
    { key: 'equal', label: 'Equal opportunity', text: 'Riverstone Aid is an equal opportunity employer. We welcome applications from everyone, and particularly from people from the communities we work with.', locked: true },
    { key: 'psea', label: 'PSEA', text: 'Riverstone Aid has zero tolerance for sexual exploitation and abuse. All staff sign our code of conduct and complete PSEA training.', locked: true },
    { key: 'dataprot', label: 'Data protection', text: 'We use your application only to assess it for this role and delete it 12 months after the recruitment closes.', locked: false },
    { key: 'nofee', label: 'No-fee notice', text: 'Riverstone Aid never charges a fee at any stage of recruitment. Report any request for payment to safeguarding@riverstone.example.org.', locked: true },
  ],
  approval: 'senior',
  approvalRule: 'any',
  verified: true,
  setupDone: true,
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

function job(
  today: number,
  id: string,
  family: string,
  styleKey: string,
  facts: Partial<Facts>,
  extra: Partial<DemoJob>,
): DemoJob {
  const f: Facts = { ...emptyFacts(), languages: ['English'], ...facts };
  const style = STYLES.find((s) => s.key === styleKey) ?? STYLES[1];
  const tags = style.tags;
  const sections = buildSections(tags, { facts: f, familyKey: family, org: SAMPLE_ORG, tone: style.tone, modifier: null });
  return {
    id,
    status: 'draft',
    plan: null,
    facts: f,
    family,
    tags,
    style: style.key,
    tone: style.tone,
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
    job(
      today,
      'job-cps',
      'protection',
      'ngo',
      { title: 'Child Protection Specialist', location: 'Kampala, Uganda', country: 'Uganda', iso: 'UG', contract: 'Fixed-term', duration: '12 months', deadline: addDays(today, 2), salary: 'USD 3,900 to 4,400 a month' },
      {
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
      },
    ),
    job(
      today,
      'job-meal',
      'meal',
      'ngo',
      { title: 'MEAL Coordinator', location: 'Addis Ababa, Ethiopia', country: 'Ethiopia', iso: 'ET', contract: 'Fixed-term', duration: '24 months', deadline: addDays(today, 9) },
      { status: 'live', plan: 'standard', publishedAt: today - 12 * DAY, audit: [{ at: today - 12 * DAY, who: 'Grace Akello', what: 'Published as Standard' }] },
    ),
    job(
      today,
      'job-fin',
      'finance',
      'un',
      { title: 'Finance Officer', location: 'Juba, South Sudan', country: 'South Sudan', iso: 'SS', grade: 'P3', contract: 'Fixed-term', duration: '12 months', deadline: addDays(today, 24) },
      {
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
          remarks: [
            { id: 'r1', section: 'qualifications', author: 'Amina Yusuf', kind: 'suggestion', text: 'Make the accounting qualification an advantage, not a requirement.', suggestion: '- A professional accounting qualification (ACCA, CPA) is an advantage', state: 'open' },
          ],
        },
        audit: [
          { at: today - 6 * DAY, who: SAMPLE_ME.name, what: 'Created' },
          { at: today - 2 * DAY, who: SAMPLE_ME.name, what: 'Sent for review to Amina Yusuf and Daniel Mwangi' },
          { at: today - DAY, who: 'Amina Yusuf', what: 'Approved version 1' },
        ],
      },
    ),
    job(
      today,
      'job-comms',
      'comms',
      'intern',
      { title: 'Communications Intern', location: 'Nairobi, Kenya', country: 'Kenya', iso: 'KE', contract: 'Internship', duration: '6 months' },
      { status: 'draft', countsAsFreeDraft: true },
    ),
    job(
      today,
      'job-log',
      'logistics',
      'ngo',
      { title: 'Logistics Assistant', location: 'Kampala, Uganda', country: 'Uganda', iso: 'UG', contract: 'Fixed-term', duration: '6 months', deadline: addDays(today, -25) },
      { status: 'closed', plan: 'standard', publishedAt: today - 55 * DAY, closedAt: today - 25 * DAY, closeReason: 'deadline' },
    ),
    job(
      today,
      'job-wash-2026',
      'wash',
      'ngo',
      { title: 'WASH Programme Manager', location: 'Juba, South Sudan', country: 'South Sudan', iso: 'SS', grade: 'P4', contract: 'Fixed-term', duration: '12 months', deadline: addDays(today, -230), salary: 'USD 4,800 to 5,600 a month' },
      { status: 'closed', plan: 'premium', publishedAt: today - 262 * DAY, closedAt: today - 230 * DAY, closeReason: 'filled', createdAt: today - 270 * DAY },
    ),
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
    v: 1,
    today,
    signedIn: false,
    me: SAMPLE_ME,
    org: SAMPLE_ORG,
    team: SAMPLE_TEAM,
    jobs: sampleJobs(today),
    styles: [
      ...STYLES,
      { key: 'house', label: 'Riverstone house style', by: 'Organisation', tags: ['about', 'role', 'responsibilities', 'qualifications', 'offer', 'safeguarding', 'apply', 'equal', 'psea', 'nofee'], tone: 'warm', note: 'From your careers page: warm, plain English, "we"' },
    ],
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
