import { longDate } from './engine';
import type { ApplySettings, Facts, Org, OrgType } from './types';

export const DOCUMENTS = ['CV', 'Cover letter', 'Motivation letter', 'Supporting statement', 'Statement of purpose', 'Academic certificates', 'Technical proposal', 'Financial proposal or daily rate', 'Work samples'];

/** The application method most organisations of each type use, from the research (plan, section 14). */
export function defaultApply(orgType: OrgType, careersUrl: string, domain = ''): ApplySettings {
  const base: ApplySettings = {
    method: 'system',
    address: careersUrl,
    documents: ['CV', 'Cover letter'],
    cvPages: '',
    statementWords: '',
    references: '',
    subjectLine: false,
    onePdf: false,
    maxMb: '',
    language: 'English',
    rolling: false,
    earlyClose: false,
    shortlistedOnly: true,
    interviewDates: '',
    replyWeeks: '',
    anonymised: false,
  };
  // FW-1: NGO email apply starts with jobs@domain when the org has a domain, so the fact matches applyLines.
  if (orgType === 'ngo') return { ...base, method: 'email', address: domain ? `jobs@${domain}` : '', documents: ['CV', 'Cover letter', 'Academic certificates'], subjectLine: true, onePdf: true, maxMb: '5' };
  if (orgType === 'charity') return { ...base, method: 'formOnly', documents: ['Supporting statement'], statementWords: '1500', shortlistedOnly: false, replyWeeks: '2' };
  if (orgType === 'contractor') return { ...base, documents: ['CV', 'Cover letter'], cvPages: '5', references: '3' };
  if (orgType === 'un') return { ...base, documents: ['CV'] };
  return { ...base, rolling: true };
}

/**
 * FW-1: the email the How to apply body and the essential fact share — typed address, or jobs@org.domain when email apply has none.
 */
export function emailAddress(a: ApplySettings, org: Pick<Org, 'domain'>): string {
  if (a.method !== 'email') return a.address.trim();
  return a.address.trim() || (org.domain ? `jobs@${org.domain}` : '');
}

/** Persist the jobs@domain fallback into apply.address when email apply would print it (FW-1). */
export function withEmailAddress(a: ApplySettings, org: Pick<Org, 'domain'>): ApplySettings {
  if (a.method !== 'email' || a.address.trim()) return a;
  const address = emailAddress(a, org);
  return address ? { ...a, address } : a;
}

export function applyLines(a: ApplySettings, f: Facts, org: Org): string[] {
  const by = f.deadline ? ` by ${longDate(f.deadline)}${f.closingTime ? `, ${f.closingTime}${f.timezone ? ` ${f.timezone}` : ''}` : ''}` : ' by [Closing date]';
  const docs = a.documents.length ? a.documents.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'your application';
  const lines: string[] = [];
  if (a.method === 'email') {
    lines.push(`Send ${docs.toLowerCase().replace(/^cv/, 'your CV')} to ${emailAddress(a, org) || `jobs@${org.domain}`}${by}.`);
    const rules = [a.subjectLine && `use the job title, "${f.title || 'job title'}", as the subject`, a.onePdf && 'combine everything into one PDF', a.maxMb && `keep attachments under ${a.maxMb} MB`].filter(Boolean);
    if (rules.length) lines.push(`Please ${rules.join(', ')}.`);
  } else if (a.method === 'formOnly') {
    lines.push(`Apply through the application form on our careers site${by}. We do not accept CVs.`);
  } else if (a.method === 'form') {
    lines.push(`Apply through the online form${by}, attaching ${docs.toLowerCase().replace(/^cv/, 'your CV')}.`);
  } else {
    lines.push(`Apply on ${org.short}'s careers site${by}, with ${docs.toLowerCase().replace(/^cv/, 'your CV')}.`);
  }
  const limits = [a.cvPages && `CV of no more than ${a.cvPages} pages`, a.statementWords && `statement of no more than ${a.statementWords} words`, a.references && `${a.references} professional references`].filter(Boolean);
  if (limits.length) lines.push(`Please include a ${limits.join(', ')}.`);
  if (a.language && a.language !== 'English') lines.push(`Applications in ${a.language} are welcome.`);
  if (a.anonymised) lines.push('Please remove your name, age, and photo from your CV; we shortlist anonymously.');
  const process = [
    a.rolling && 'We review applications as they arrive',
    a.earlyClose && 'we may close this vacancy early',
    a.shortlistedOnly && 'only shortlisted candidates will be contacted',
  ].filter(Boolean) as string[];
  if (process.length) lines.push(`${process.join(', and ').replace(/^./, (c) => c.toUpperCase())}.`);
  if (a.interviewDates) lines.push(`Interviews are planned for ${a.interviewDates}.`);
  if (a.replyWeeks) lines.push(`If you have not heard from us within ${a.replyWeeks} weeks of the closing date, your application has not been taken forward this time.`);
  return lines;
}
