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
  // FW-1 + Phase A: NGO email apply starts with jobs@domain only when domain exists; charity without careersUrl falls back to email.
  if (orgType === 'ngo') return { ...base, method: 'email', address: domain ? `jobs@${domain}` : '', documents: ['CV', 'Cover letter', 'Academic certificates'], subjectLine: true, onePdf: true, maxMb: '5' };
  if (orgType === 'charity') {
    if (!careersUrl.trim()) return { ...base, method: 'email', address: domain ? `jobs@${domain}` : '', documents: ['CV', 'Supporting statement'], shortlistedOnly: false, replyWeeks: '2' };
    return { ...base, method: 'formOnly', documents: ['Supporting statement'], statementWords: '1500', shortlistedOnly: false, replyWeeks: '2' };
  }
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
  const by = f.rolling
    ? ' (open until filled)'
    : f.deadline
      ? ` by ${longDate(f.deadline)}${f.closingTime ? `, ${f.closingTime}${f.timezone ? ` ${f.timezone}` : ''}` : ''}`
      : ' by [Closing date]';
  const docs = a.documents.length ? a.documents.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'your application';
  const lines: string[] = [];
  if (a.method === 'email') {
    const addr = emailAddress(a, org);
    lines.push(`Send ${docs.toLowerCase().replace(/^cv/, 'your CV')} to ${addr || '[Apply email or link]'}${by}.`);
    const rules = [a.subjectLine && `use the job title, "${f.title || 'job title'}", as the subject`, a.onePdf && 'combine everything into one PDF', a.maxMb && `keep attachments under ${a.maxMb} MB`].filter(Boolean);
    if (rules.length) lines.push(`Please ${rules.join(', ')}.`);
  } else if (a.method === 'formOnly') {
    const target = a.address.trim() || org.careersUrl.trim();
    lines.push(target ? `Apply through the application form on our careers site${by}. We do not accept CVs.` : `Apply through our online application form ([Apply email or link])${by}. We do not accept CVs.`);
  } else if (a.method === 'form') {
    const target = a.address.trim() || org.careersUrl.trim();
    lines.push(target ? `Apply through the online form${by}, attaching ${docs.toLowerCase().replace(/^cv/, 'your CV')}.` : `Apply through our online form ([Apply email or link])${by}, attaching ${docs.toLowerCase().replace(/^cv/, 'your CV')}.`);
  } else {
    const target = a.address.trim() || org.careersUrl.trim();
    lines.push(target ? `Apply on ${org.short}'s careers site${by}, with ${docs.toLowerCase().replace(/^cv/, 'your CV')}.` : `Apply online ([Apply email or link])${by}, with ${docs.toLowerCase().replace(/^cv/, 'your CV')}.`);
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
