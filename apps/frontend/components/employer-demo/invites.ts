/**
 * AidJobs Reach (employer-side plan, section 16, decisions 7 and 8): prepared before publishing, sent when the job goes live, then
 * simple reminders to invite more. In the demo nothing is sent; queueing and delivery are simulated and labelled.
 */
import { daysUntil, isoDay, longDate, parseIso } from './engine';
import type { DemoJob, Message, Org, ReachPlan, ReachRecord, Recipient, State } from './types';

/** Reach emails a paid job can send, all rounds together (a placeholder, like the prices). */
export const REACH_EMAILS = 50;

/** Addresses that unsubscribed from AidJobs invitations: never sent to again. */
export const SUPPRESSED = ['optout@example.org'];

/** The two messages AidJobs writes, from the user's brief; the employer edits them in their preview. */
export function defaultMessages(job: DemoJob, org: Org): { candidateMsg: Message; teamMsg: Message } {
  const f = job.facts;
  const where = f.arrangement === 'remote' ? 'The role is remote' : `The role is based in ${f.location || 'the duty station'}`;
  return {
    candidateMsg: {
      subject: `An opportunity you might be interested in – ${f.title}`,
      body: ['Hello,', 'We thought this opportunity might be of interest to you.', `${org.name} is currently recruiting for the position of ${f.title}.`, `${where}${f.deadline ? ` and applications are open until ${longDate(f.deadline)}` : ''}.`, 'You can explore the complete job description and application details here:'].join('\n\n'),
      closing: ["If this opportunity isn't right for you, please feel free to share it with someone who might be interested.", `Best regards,\n${org.name}`].join('\n\n'),
    },
    teamMsg: {
      subject: `Help us spread the word – ${f.title}`,
      body: ['Hello,', `We've just published a vacancy for ${f.title} at ${org.name}.`, 'Do you know someone with relevant experience who might be interested?', 'Please consider sharing this opportunity with suitable people in your professional network.', 'The vacancy details are available here:'].join('\n\n'),
      closing: ['A good candidate might be just one connection away.', 'Thank you for helping us reach the right people.', `Best regards,\n${org.name}`].join('\n\n'),
    },
  };
}

export function planFor(job: DemoJob, org: Org): ReachPlan {
  return job.reachPlan ?? { candidates: [], team: [], ...(job.reach ? { candidateMsg: job.reach.candidateMsg, teamMsg: job.reach.teamMsg } : defaultMessages(job, org)) };
}

/** Emails already used for the job, every round together. */
export function reachUsed(job: DemoJob): number {
  return (job.reach?.candidates.length ?? 0) + (job.reach?.team.length ?? 0) + (job.reach?.updates ?? []).reduce((n, u) => n + u.count, 0);
}

/** The people Reach has actually emailed for a job, each address once; addresses only waiting for go-live are not counted. */
export function invitedCount(job: DemoJob): number {
  return new Set([...(job.reach?.candidates ?? []), ...(job.reach?.team ?? [])].filter((r) => r.status !== 'waiting' && r.status !== 'failed').map((r) => r.email)).size;
}

/** Reach emails still available to the job: every email counts, invitations and notices alike. */
export function reachRoom(job: DemoJob): number {
  return Math.max(0, REACH_EMAILS - reachUsed(job));
}

/** Who the next sending goes to: not unsubscribed, not invited before, within the allowance. */
export function recipientsOf(job: DemoJob, plan: ReachPlan): { candidates: string[]; team: string[]; skipped: string[] } {
  const before = new Set([...(job.reach?.candidates ?? []), ...(job.reach?.team ?? [])].map((r) => r.email));
  const skipped: string[] = [];
  const keep = (list: string[]) =>
    list.filter((e) => {
      if (SUPPRESSED.includes(e) || before.has(e)) {
        skipped.push(e);
        return false;
      }
      return true;
    });
  const room = Math.max(0, REACH_EMAILS - reachUsed(job));
  const candidates = keep([...new Set(plan.candidates)]).slice(0, room);
  const team = keep([...new Set(plan.team)].filter((e) => !plan.candidates.includes(e))).slice(0, Math.max(0, room - candidates.length));
  return { candidates, team, skipped };
}

export function planCount(job: DemoJob, plan: ReachPlan | undefined): number {
  if (!plan) return 0;
  const r = recipientsOf(job, plan);
  return r.candidates.length + r.team.length;
}

/**
 * A round of sending, added to what the job has sent. A job not yet live sends on its date (`waiting`); a live job sends now. Returns null
 * when there is nobody to send to.
 */
export function addRound(job: DemoJob, plan: ReachPlan, why: string, sendsOn: string | null): ReachRecord | null {
  const { candidates, team } = recipientsOf(job, plan);
  if (!candidates.length && !team.length) return null;
  const n = (job.reach?.rounds.length ?? 0) + 1;
  const status = sendsOn ? 'waiting' : 'queued';
  const mk = (email: string): Recipient => ({ email, status, round: n });
  return {
    candidates: [...(job.reach?.candidates ?? []), ...candidates.map(mk)],
    team: [...(job.reach?.team ?? []), ...team.map(mk)],
    rounds: [...(job.reach?.rounds ?? []), { n, at: Date.now(), why, ...(sendsOn ? { sendsOn } : {}) }],
    candidateMsg: plan.candidateMsg,
    teamMsg: plan.teamMsg,
  };
}

/** Scheduled jobs whose date has come go live, and the emails waiting for them are sent (simulated). */
export function goLive(s: State): State {
  const today = isoDay(s.today);
  let changed = false;
  const uses = [...s.freeUses];
  const jobs = s.jobs.map((j) => {
    if (j.status !== 'scheduled' || !j.scheduledFor || j.scheduledFor > today) return j;
    changed = true;
    // A free job's hold becomes a use on the day it goes live (the user, 12 November 2026).
    const month = j.scheduledFor.slice(0, 7);
    if (j.plan === 'free' && !uses.some((u) => u.jobId === j.id && u.month === month)) uses.push({ jobId: j.id, month });
    const sent = (r: Recipient): Recipient => (r.status === 'waiting' ? { ...r, status: 'sent' } : r);
    return {
      ...j,
      status: 'live' as const,
      publishedAt: parseIso(j.scheduledFor) + 9 * 3_600_000,
      published: { facts: j.facts, sections: j.sections, at: parseIso(j.scheduledFor) + 9 * 3_600_000 },
      reach: j.reach ? { ...j.reach, candidates: j.reach.candidates.map(sent), team: j.reach.team.map(sent) } : j.reach,
      audit: [...j.audit, { at: s.today, who: 'AidJobs', what: `Went live on ${longDate(j.scheduledFor)}${j.reach?.rounds.some((r) => r.sendsOn) ? '; the Reach emails were sent (simulated)' : ''}` }],
    };
  });
  return changed ? { ...s, jobs, freeUses: uses } : s;
}

export type Moment = { key: string; title: string; body: string; why: string };

/**
 * The reminder to invite more, for an amplified live job: after an extension, 5 days before closing, halfway, and a few days after
 * publishing; the most recent one not answered with "Not now". None when reminders are off for the job.
 */
export function reachMoment(job: DemoJob, today: number): Moment | null {
  if (job.plan !== 'amplify' || job.status !== 'live' || job.reachReminders === false || !job.publishedAt) return null;
  const done = new Set(job.reachDismissed ?? []);
  const lastSent = Math.max(job.publishedAt, ...(job.reach?.rounds.map((r) => r.at) ?? []));
  const days = Math.round((today - job.publishedAt) / 86_400_000);
  const left = job.facts.deadline ? daysUntil(today, job.facts.deadline) : null;
  const total = job.facts.deadline ? daysUntil(job.publishedAt, job.facts.deadline) : null;
  const extension = [...job.audit].reverse().find((a) => a.what.startsWith('Extended') && a.at > lastSent);
  const options: Array<Moment & { when: boolean }> = [
    { key: `extended-${extension?.at ?? 0}`, when: Boolean(extension), why: 'After the extension', title: `Invite more people for ${job.facts.title}?`, body: `It has a new closing date, ${job.facts.deadline ? longDate(job.facts.deadline) : 'later'}. Tell more people while there is time.` },
    { key: 'closing', when: left !== null && left >= 0 && left <= 5, why: 'Before closing', title: `A last round of invitations for ${job.facts.title}?`, body: `It closes in ${left} ${left === 1 ? 'day' : 'days'}; invitations now still reach people in time.` },
    { key: 'halfway', when: total !== null && total > 10 && days >= total / 2, why: 'Halfway', title: `${job.facts.title} is halfway: invite more people?`, body: 'Invite people you have thought of since it went live.' },
    { key: 'early', when: days >= 3, why: 'A few days in', title: `${job.facts.title} has been live ${days} days: invite more people?`, body: 'Invite more people who could apply, or ask your team again.' },
  ];
  const now = options.find((o) => o.when && !done.has(o.key));
  return now ? { key: now.key, title: now.title, body: now.body, why: now.why } : null;
}

/** "Sends when it goes live" or the delivery so far, for one list. */
export function deliveryText(list: Recipient[]): string {
  if (!list.length) return 'none';
  const by = (st: string) => list.filter((r) => r.status === st).length;
  if (by('waiting')) return `${by('waiting')} waiting for go-live`;
  if (by('queued') || by('sending')) return `${by('queued') + by('sending')} sending`;
  return `${by('sent')} sent${by('failed') ? `, ${by('failed')} failed` : ''}`;
}
