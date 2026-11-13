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
  order: OutlineEntry[];
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
  /** The writing style was kept for every job from the chat, so it is not offered again. */
  styleKept?: boolean;
  /**
   * Kept for every job (section 19, step 10): the fixed text put on each new job, and how people apply; changed afterwards only in
   * Organisation settings. `keepOffered`: what the chat has already offered to keep, so it is offered only the first time.
   */
  keptFixed?: string[];
  keptApply?: ApplySettings;
  keepOffered?: Array<'fixed' | 'apply'>;
  /** Languages whose fixed text the organisation has confirmed, once per language, for reuse. */
  fixedLangs?: string[];
};

/** A job's facts and choices, saved automatically when it is published, for the next job like it (managed with the profiles page, later). */
export type JobProfile = {
  id: string;
  from: string;
  title: string;
  location: string;
  family: string;
  format: string;
  tags: string[];
  facts: Partial<Facts>;
  style?: string[];
  apply: ApplySettings;
  commitments: string[];
  lang?: string;
  at: number;
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

/** A sub-heading inside a section with its own lines (section 19, phase 5, B): one level only. */
export type Sub = { id: string; title: string; lines: string[] };

/**
 * `ai`: written by the AI chat; like a hand edit, it is kept when the facts change rather than rebuilt by the rules. `subs`: its
 * sub-sections, after its own lines, kept when the rules rebuild the section.
 */
export type Section = { key: string; title: string; lines: string[]; edited?: boolean; ai?: boolean; subs?: Sub[] };

/** One section of a template or of a job's outline: its heading, and the headings of its sub-sections. */
export type OutlineEntry = { key: string; heading: string; subs?: Array<{ id: string; heading: string }> };

/** What the chat asks for, each just before the first section that uses it (employer-side plan, section 19, step 4). */
export type AskKind = 'title' | 'place' | 'contract' | 'grade' | 'eligibility' | 'languages' | 'safeguarding' | 'salary' | 'deadline' | 'method';

/**
 * `ai`: a reply written by the AI chat, so its answer buttons go back to the AI; the rules' own answers go to the rules. `by`: the
 * model that wrote it, shown under the reply while two models are compared in the preview. `step`: the step of a new employer's
 * writing this message asks about, so the same question is not asked twice.
 */
export type ChatMsg = { id: string; from: 'user' | 'ai'; text: string; quick?: string[]; ask?: AskKind; ai?: boolean; by?: string; step?: string; card?: ChatCard; state?: JobStatus };

/**
 * A card under a message, with the one button that does what it says (section 19, steps 8 and 9): anything that publishes, pays, or
 * sends something to someone is done from a button that states the whole outcome, never by the chat on its own. `state`: the actions
 * section 17 allows for the job's state, each opening its own dialog (section 19, phase 4).
 */
export type ChatCard = 'plan' | 'publish' | 'review' | 'live' | 'state';

/** "One section at a time", or "write it all, then I'll review". */
export type Pace = 'step' | 'all';

/**
 * A new employer's writing in the window (section 19, steps 3 to 7): the pace, the sections approved, and the questions answered or
 * declined ('details', 'fixed', and 'suggest' for step 6). `skipped`: check points left as they are. `awaiting`: a one-line reason for
 * a genuine requirement. `pending`: a fact changed after its section was approved; the new lines wait for the user's yes.
 */
export type Walk = {
  pace?: Pace;
  approved: string[];
  settled: string[];
  skipped?: string[];
  awaiting?: { point: string; hit: string; label: string };
  pending?: { what: string; changes: Array<{ key: string; lines: string[] }> };
  /** A job description the user brought (pasted or a file), read into sections, until they say how to use it. */
  doc?: Section[];
  /** Hire again: the job this one copies ("Logistics Assistant, Kampala"); the chat asks first what changes. */
  again?: string;
};

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
  /** Language versions beyond those included, in the same payment. */
  langs?: number;
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

/** The languages a job can be written in, and its versions' languages: English or one of the four offered. */
export type JobLang = 'en' | Lang;

/**
 * A language version of the job page, drafted by AidJobs and reviewed by the employer, with its own sections within the job's JD format.
 * `source`: the job's own text it was last brought up to date with; `kept`: the job's text the user chose to keep this version against
 * ("Keep the French as it is"), so the update is not offered again for it.
 */
export type Translation = { sections: Section[]; reviewed: boolean; source: string; at: number; kept?: string };

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
  /** When the field-post flyer was first shown for this job; out of date while review is open again (section 19, phase 5, C). */
  flyerMade?: number;
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
  /**
   * Before publishing, in the window (section 19, steps 8 and 9): Free or Amplify as chosen so far, the date to publish on (none for
   * now), and how to pay for Amplify. `plan` is set only when it is published. "Publish free instead" keeps Amplify's work, hidden.
   */
  choice?: Plan;
  publishOn?: string;
  payWith?: 'free' | 'one' | 'three' | 'five' | 'always';
  /**
   * How an amplified job was paid: as one job, as a package or subscription job, which includes more language versions, or with the
   * organisation's one free Amplify, which includes what a job paid on its own does.
   */
  paidVia?: 'single' | 'package' | 'free';
  /** Language versions paid for beyond those included. */
  langsPaid?: number;
  /** The language the job is written in, read from the role as typed and changed only when the user asks; English when unset. */
  lang?: JobLang;
  /** Language versions of the job page; only reviewed ones are published, and only with Amplify. */
  translations?: Partial<Record<JobLang, Translation>>;
  audit: AuditEntry[];
  /** The part open in the window ("s:" and a section, or outline, details, fixed, check, publish); reopening the job returns to it. */
  part?: string;
  /** A job started in the window waits for its template, then its writing style and the pace, before anything is written. */
  setup?: 'template' | 'style' | 'pace';
  /** A job started in the window is written step by step; jobs without it (the samples, earlier versions) are already written. */
  walk?: Walk;
  /** The writing style, as the chips of Organisation settings. */
  style?: string[];
  /** The goals the job serves, when corrected by hand; otherwise read from the role by rules. */
  sdgs?: number[];
  /** 'org': no goal was clear from the role, and the user chose the organisation's own goals; the job page says so. */
  sdgsFrom?: 'org';
  /** Headings renamed for this job only, by section; kept when the rules rebuild a section, cleared when the template changes. */
  renamed?: Record<string, string>;
  /**
   * The user moved a section across the five groups (section 19, phase 5, B): the job keeps its own order through reloads, and a section
   * added without a place goes in at its group. Unset, the job follows the group order.
   */
  ordered?: boolean;
  /** Sub-sections set in the outline for sections not written yet; they join their section when it is written. */
  subsPlan?: Record<string, Array<{ id: string; heading: string }>>;
  /** The last change asked for in the chat: shown on the changed sections, with Undo. */
  lastChange?: { keys: string[]; text: string; before: Section[]; beforeTags: string[]; beforeFacts: Facts; beforeTone: Tone };
};

export type InboxKind = 'approved' | 'changes' | 'comment' | 'deadline' | 'removal' | 'receipt' | 'reach' | 'review';

export type InboxItem = { id: string; kind: InboxKind; jobId?: string; title: string; body: string; at: number; done?: boolean };

export type Receipt = { id: string; at: number; item: string; amount: string };

/** Saved by earlier previews: a free job counted against one calendar month's allowance. Read once, to bring old saves forward. */
export type FreeUse = { jobId: string; month: string };

/**
 * The free listings (section 19, phase 5, D): one standard and one Amplify, each once per organisation, ever. Each records the job that
 * used it by going live; a scheduled job holding one is read from the job itself, so taking it back gives the place back.
 */
export type FreeRecord = { standard?: string; amplify?: string };

/** Paid jobs bought ahead: unused ones lapse at the end date. */
export type Pack = { id: string; jobs: number; left: number; ends: string; at: number };

/** "Always hiring": a number of jobs each month; unused ones lapse at renewal; cancelled, it runs to the renewal date. */
export type Subscription = { since: string; renews: string; left: number; cancelled: boolean };

/** `restore` offers to bring back a job just deleted (it is in Recently deleted); `unprofile` to forget a job profile just saved. */
export type Notice = { text: string; undo?: DemoJob[]; restore?: string; unprofile?: string } | null;

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
  free: FreeRecord;
  /** Earlier previews' monthly count, brought forward into `free` when the demo loads. */
  freeUses?: FreeUse[];
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
  /** The pace chosen last time, used for the next new job. */
  pace?: Pace;
  /** Job profiles saved when jobs are published, the newest first. */
  profiles?: JobProfile[];
};
