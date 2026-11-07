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

export type LearnedFormat = { source: 'careers' | 'link' | 'upload' | 'reliefweb' | 'type' | 'history'; adverts: number; confirmed: boolean };

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
  /** "Nobody can skip approval": removes the owner's "Publish without approval". */
  noSkip: boolean;
  /** "Any request for changes pauses publishing": under "any one reviewer", a later request for changes withdraws the approval. */
  changesPause?: boolean;
  verified: boolean;
  setupDone: boolean;
  /** The one-time "I understand" for the free terms, given the first time the organisation publishes a free job. */
  freeTermsAccepted: boolean;
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

export type ChatMsg = { id: string; from: 'user' | 'ai'; text: string; quick?: string[]; ask?: 'title' | 'place' | 'deadline' | 'contract' };

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
  /** The text as sent in this round, and in the round before: a new round highlights only what changed. */
  sent?: Section[];
  before?: Section[];
  reminded?: number;
  /** The owner's reason for skipping approval; written to the history as "published without approval" only once it is published. */
  skipped?: string;
  /** "Publish anyway" over a request for changes that came after the approval: the reason, possibly empty. */
  overruled?: string;
};

/** "Ask to pay": the person who holds the card gets a link; the job publishes once they have paid. */
export type PayRequest = {
  name: string;
  email: string;
  note: string;
  key: 'one' | 'three' | 'five' | 'always' | 'extra';
  amount: string;
  item: string;
  schedule: string | null;
  at: number;
  reminded?: number;
};

export type Version = { n: number; at: number; note: string; sections: Section[] };

/** `waiting` is an email for a scheduled job, sent when the job goes live. */
export type Delivery = 'waiting' | 'queued' | 'sending' | 'sent' | 'failed';

export type Recipient = { email: string; status: Delivery; round: number };

/** An email: the text before the job's button, and the closing after it. */
export type Message = { subject: string; body: string; closing: string };

/** One sending: at go-live, or "invite more" later. */
export type ReachRound = { n: number; at: number; why: string; sendsOn?: string };

/** An email telling the people already invited about an important change; it counts toward the job's Reach emails. */
export type ReachUpdate = { at: number; count: number; what: string };

/** What Reach sent for a job, round by round. Nothing about recipients is ever public. */
export type ReachRecord = { candidates: Recipient[]; team: Recipient[]; rounds: ReachRound[]; candidateMsg: Message; teamMsg: Message; updates?: ReachUpdate[] };

/** Reach prepared before sending: the people and the two messages, edited in their preview. */
export type ReachPlan = { candidates: string[]; team: string[]; candidateMsg: Message; teamMsg: Message };

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

export type Lang = 'fr' | 'ar' | 'es' | 'pt';

/** A language version of the job page, drafted by AidJobs and reviewed by the employer. `source` is the English text it was made from. */
export type Translation = { sections: Section[]; reviewed: boolean; source: string; at: number };

/** Free, or Amplify: the paid offer (employer-side plan, section 16). */
export type Plan = 'free' | 'amplify';

export type JobStatus = 'draft' | 'review' | 'approved' | 'scheduled' | 'live' | 'closed';

export type AuditEntry = { at: number; who: string; what: string };

export type Snapshot = { facts: Facts; sections: Section[]; at: number };

export type DemoJob = {
  id: string;
  status: JobStatus;
  plan: Plan | null;
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
  reachPlan?: ReachPlan;
  payRequest?: PayRequest;
  /** Reminders to invite more people; on unless switched off for this job. */
  reachReminders?: boolean;
  /** Reminder moments answered with "Not now". */
  reachDismissed?: string[];
  chat: ChatMsg[];
  createdAt: number;
  publishedAt?: number;
  scheduledFor?: string;
  closedAt?: number;
  closeReason?: 'deadline' | 'early' | 'filled' | 'withdrawn';
  updatedAfterPublish?: boolean;
  /** When the live job was last changed; the public page says "Updated on" that day. */
  editedAt?: number;
  /** The job as it went live, to show what changed since publishing. */
  published?: Snapshot;
  /** Important changes the people Reach invited were told about. */
  reachTold?: string[];
  /** Important changes whose offer was declined ("Not now"): never offered again, and never quoted as told. */
  reachDeclined?: string[];
  /** "Let it leave the list" when a free job's listing ends before its closing date: no more reminders. */
  listingChoice?: 'leave';
  /** A paid job taken back to a draft: publishing it again costs nothing. */
  paidFor?: boolean;
  /** Language versions of the job page; only reviewed ones are published, and only with Amplify. */
  translations?: Partial<Record<Lang, Translation>>;
  audit: AuditEntry[];
  /** The last change asked for in the chat: shown on the changed sections, with Undo. */
  lastChange?: { keys: string[]; text: string; before: Section[]; beforeTags: string[]; beforeFacts: Facts; beforeTone: Tone };
};

export type InboxKind = 'approved' | 'changes' | 'comment' | 'deadline' | 'removal' | 'receipt' | 'reach' | 'review';

export type InboxItem = { id: string; kind: InboxKind; jobId?: string; title: string; body: string; at: number; done?: boolean };

export type Receipt = { id: string; at: number; item: string; amount: string };

/** A free job counted against one calendar month's allowance, in the organisation's time zone. */
export type FreeUse = { jobId: string; month: string };

/** Paid jobs bought ahead: unused ones lapse at the end date. */
export type Pack = { id: string; jobs: number; left: number; ends: string; at: number };

/** "Always hiring": a number of jobs each month; unused ones lapse at renewal; cancelled, it runs to the renewal date. */
export type Subscription = { since: string; renews: string; left: number; cancelled: boolean };

/** `restore` offers to bring back a job just deleted (it is in Recently deleted). */
export type Notice = { text: string; undo?: DemoJob[]; restore?: string } | null;

/** A deleted job, restorable for 14 days, then erased (plan section 17, decision 2). */
export type DeletedJob = { job: DemoJob; at: number; by: string; told: string[]; was?: JobStatus };

/** The organisation's activity log: one line per deletion, restore, or erasure; never public. */
export type Activity = { at: number; who: string; what: string };

export type State = {
  v: 4;
  today: number;
  signedIn: boolean;
  me: Person;
  org: Org;
  team: Person[];
  jobs: DemoJob[];
  formats: Format[];
  inbox: InboxItem[];
  freeUses: FreeUse[];
  packs: Pack[];
  subscription: Subscription | null;
  receipts: Receipt[];
  reviewerAs: string | null;
  notice: Notice;
  seq: number;
  /** The base JD format pattern the organisation answered "Not now" to; it is offered again only when the pattern grows. */
  baseDismissed?: string;
  deleted?: DeletedJob[];
  activity?: Activity[];
  /** Jobs once published and then deleted: their shared links say "no longer available". */
  gone?: string[];
};
