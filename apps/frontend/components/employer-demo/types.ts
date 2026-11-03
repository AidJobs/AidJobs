export type Role = 'owner' | 'member' | 'reviewer';

export type Person = { id: string; name: string; email: string; role: Role };

export type TagGroup = 'Core' | 'UN style' | 'Sector' | 'Standard text';

export type Tag = { key: string; label: string; group: TagGroup; hint: string };

export type Tone = 'formal' | 'warm' | 'plain';

export type Style = { key: string; label: string; by: 'AidJobs' | 'Organisation'; tags: string[]; tone: Tone; note: string };

export type StandardText = { key: string; label: string; text: string; locked: boolean };

export type ApprovalSetting = 'off' | 'all' | 'senior';

export type Org = {
  name: string;
  short: string;
  type: string;
  hq: string;
  website: string;
  careersUrl: string;
  domain: string;
  about: string;
  sectors: string[];
  sdgs: number[];
  countries: string[];
  voice: string[];
  standard: StandardText[];
  approval: ApprovalSetting;
  approvalRule: 'any' | 'all';
  verified: boolean;
  setupDone: boolean;
};

export type Facts = {
  title: string;
  location: string;
  country: string;
  iso: string;
  grade: string;
  contract: string;
  duration: string;
  deadline: string;
  salary: string;
  languages: string[];
  remote: boolean;
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

export type ReachRecord = {
  candidates: Recipient[];
  team: Recipient[];
  community: boolean;
  intro: string;
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
  style: string | null;
  tone: Tone;
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

export type Screen = 'home' | 'studio' | 'publish' | 'jobs' | 'styles' | 'team' | 'org' | 'public';

export type State = {
  v: 1;
  today: number;
  signedIn: boolean;
  me: Person;
  org: Org;
  team: Person[];
  jobs: DemoJob[];
  styles: Style[];
  inbox: InboxItem[];
  draftsUsed: number;
  credits: number;
  receipts: Receipt[];
  reviewerAs: string | null;
  notice: Notice;
  seq: number;
};
