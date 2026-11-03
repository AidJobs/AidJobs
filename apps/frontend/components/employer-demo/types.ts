export type Role = 'owner' | 'member' | 'reviewer';

export type Person = { id: string; name: string; email: string; role: Role };

/** The five groups of a job description (employer-side plan, section 14). */
export type GroupKey = 'employer' | 'job' | 'person' | 'offer' | 'apply';

export type SectionDef = { key: string; label: string; group: GroupKey; hint: string };

export type Tone = 'formal' | 'warm' | 'plain';

export type Family = 'UN and multilateral' | 'INGO and humanitarian' | 'Donors, foundations and contractors' | 'National NGOs and charities';

/** A real advert format: its headings, in order, as organisations that use it write them. */
export type Format = {
  key: string;
  label: string;
  family: Family | 'Your organisation';
  usedBy: string;
  tone: Tone;
  order: Array<{ key: string; heading: string }>;
  commitments: string[];
};

export type OrgType = 'ingo' | 'ngo' | 'un' | 'charity' | 'donor' | 'contractor';

export type Commitment = { key: string; label: string; text: string; locked: boolean };

export type ScaleRow = { grade: string; min: number; max: number; currency: string; period: 'month' | 'year' };

export type LearnedFormat = { source: 'careers' | 'link' | 'upload' | 'reliefweb' | 'type'; adverts: number; confirmed: boolean };

export type ApprovalSetting = 'off' | 'all' | 'senior';

export type Org = {
  name: string;
  short: string;
  type: string;
  orgType: OrgType;
  hq: string;
  website: string;
  careersUrl: string;
  domain: string;
  about: string;
  sectors: string[];
  sdgs: number[];
  countries: string[];
  voice: string[];
  standard: Commitment[];
  mdsMember: boolean;
  scale: ScaleRow[];
  learned: LearnedFormat | null;
  approval: ApprovalSetting;
  approvalRule: 'any' | 'all';
  verified: boolean;
  setupDone: boolean;
};

export type Engagement = 'job' | 'consultancy' | 'internship' | 'volunteer';
export type Recruitment = 'vacancy' | 'roster' | 'proposal';
export type Arrangement = 'onsite' | 'hybrid' | 'remote';
export type SalaryMode = 'range' | 'exact' | 'scale' | 'grade' | 'competitive' | 'daily' | 'hidden';
export type Period = 'hour' | 'day' | 'month' | 'year';

export type Facts = {
  title: string;
  location: string;
  country: string;
  iso: string;
  arrangement: Arrangement;
  engagement: Engagement;
  contract: string;
  hours: 'full' | 'part';
  recruitment: Recruitment;
  subjectToFunding: boolean;
  grade: string;
  duration: string;
  deadline: string;
  closingTime: string;
  timezone: string;
  salaryMode: SalaryMode;
  salaryMin: string;
  salaryMax: string;
  currency: string;
  period: Period;
  languages: string[];
  eligibility: 'anyone' | 'nationals' | 'internal' | 'righttowork';
  safeguarding: '' | 'low' | 'medium' | 'high';
  directReports: string;
  startDate: string;
  positions: string;
  donor: string;
  availability: string;
  client: string;
  keyPersonnel: boolean;
};

export type Section = { key: string; title: string; lines: string[]; edited?: boolean };

export type ChatMsg = { id: string; from: 'user' | 'ai'; text: string; quick?: string[] };

export type Remark = {
  id: string;
  section: string;
  author: string;
  kind: 'comment' | 'suggestion';
  text: string;
  suggestion?: string;
  state: 'open' | 'accepted' | 'rejected' | 'resolved';
};

export type ReviewerEntry = { name: string; email: string; outside: boolean; decision?: 'approved' | 'changes'; note?: string };

export type Review = {
  state: 'none' | 'open' | 'changes' | 'approved';
  reviewers: ReviewerEntry[];
  due: string;
  round: number;
  rule: 'any' | 'all';
  approvedVersion?: number;
  remarks: Remark[];
};

export type Version = { n: number; at: number; note: string; sections: Section[] };

export type Delivery = 'queued' | 'sending' | 'sent' | 'failed';

export type Recipient = { email: string; status: Delivery };

export type ReachRecord = { candidates: Recipient[]; team: Recipient[]; community: boolean; intro: string };

export type ApplySettings = {
  method: 'system' | 'email' | 'form' | 'formOnly';
  address: string;
  documents: string[];
  cvPages: string;
  statementWords: string;
  references: string;
  subjectLine: boolean;
  onePdf: boolean;
  maxMb: string;
  language: string;
  rolling: boolean;
  earlyClose: boolean;
  shortlistedOnly: boolean;
  interviewDates: string;
  replyWeeks: string;
  anonymised: boolean;
};

export type JobStatus = 'draft' | 'review' | 'approved' | 'scheduled' | 'live' | 'closed';

export type AuditEntry = { at: number; who: string; what: string };

export type DemoJob = {
  id: string;
  status: JobStatus;
  plan: 'standard' | 'premium' | null;
  facts: Facts;
  family: string;
  tags: string[];
  format: string;
  tone: Tone;
  commitments: string[];
  apply: ApplySettings;
  genuine: Record<string, string>;
  sections: Section[];
  versions: Version[];
  review: Review;
  reach: ReachRecord | null;
  chat: ChatMsg[];
  createdAt: number;
  publishedAt?: number;
  scheduledFor?: string;
  closedAt?: number;
  closeReason?: 'deadline' | 'early' | 'filled' | 'withdrawn';
  updatedAfterPublish?: boolean;
  countsAsFreeDraft: boolean;
  audit: AuditEntry[];
};

export type InboxKind = 'approved' | 'changes' | 'comment' | 'deadline' | 'removal' | 'receipt' | 'reach' | 'review';

export type InboxItem = { id: string; kind: InboxKind; jobId?: string; title: string; body: string; at: number; done?: boolean };

export type Receipt = { id: string; at: number; item: string; amount: string; mode: 'paddle-sandbox' | 'simulated' };

export type Notice = { text: string; undo?: DemoJob[] } | null;

export type State = {
  v: 2;
  today: number;
  signedIn: boolean;
  me: Person;
  org: Org;
  team: Person[];
  jobs: DemoJob[];
  formats: Format[];
  inbox: InboxItem[];
  draftsUsed: number;
  credits: number;
  receipts: Receipt[];
  reviewerAs: string | null;
  notice: Notice;
  seq: number;
};
