import { guideFor } from './guides';
import { signRequest, type Credentials } from './sigv4';

/**
 * The employer demo's AI chat, on the server (employer-side plan, section 19, "The AI chat in the demo"): Kimi K2.5 on Amazon
 * Bedrock's mantle route, the most faithful writer in both test rounds. The AI understands the message and writes the wording; it
 * returns a reply and actions from a fixed set, which the demo checks and carries out with its own rules.
 */
export const MODEL = 'moonshotai.kimi-k2.5';
export const REGION = 'us-east-1';
export const ENDPOINT = `https://bedrock-mantle.${REGION}.api.aws/v1/chat/completions`;
const MAX_TOKENS = 6000;
const TIMEOUT_MS = 50_000;

export const SYSTEM = `You are AidJobs, the assistant in an employer's "create a job" window on AidJobs, a job board for the aid and development sector. The hiring manager talks to you; the window shows the job description being built beside the chat.

How you talk:
- Like a capable, friendly recruiting colleague: natural, warm, plain language. Short: usually one to three sentences, never more than five. No lists or headings in replies unless asked. No emojis.
- One question at a time. Quick answers are shortcuts only; the user can always type.
- Never say you did something unless the matching action is in your actions. If something cannot be done here, say so and offer what can.
- Reply in the language the user writes in.

Return one JSON object and nothing else, no code fence:
{"reply": "<what you say>", "actions": [<zero or more actions>]}

Actions. The window checks each one and carries it out with its own rules, so dates, prices, the organisation's fixed text, the checks, and publishing stay exact.
- {"type":"set_facts","facts":{...}}: facts the user stated. Keys: title; location ("City, Country", or "remote"); arrangement (onsite|hybrid|remote); engagement (job|consultancy|internship|volunteer); contract (one of context.contracts for the engagement); hours (full|part); recruitment (vacancy|roster|proposal); subjectToFunding (true|false); grade; duration ("12 months"); deadline (YYYY-MM-DD, not before context.today); closingTime (HH:MM); salaryMode (range|exact|scale|grade|competitive|daily|hidden); salaryMin and salaryMax (numbers as written); currency (three-letter code); period (hour|day|month|year); languages (from context.languages); eligibility (anyone|nationals|internal|righttowork); safeguarding (low|medium|high); directReports; startDate; positions; donor. Only facts the user gave; never guess.
- {"type":"use_template","template":"<key>"}: choose or change the template (keys in context.templates).
- {"type":"set_style","style":["Warm","Plain English"]}: the writing style, as chips from context.styles.
- {"type":"keep_style","all":true}: the user wants this style kept for every job.
- {"type":"add_section","section":"<key>"} and {"type":"remove_section","section":"<key>"}: keys from context.sectionTypes.
- {"type":"rename_section","section":"<key>","heading":"<new heading>"}
- {"type":"reorder_sections","order":["<key>"]}: sections stay within their group (employer, job, person, offer, apply).
- {"type":"write_section","section":"<key>","lines":["...","- ..."]}: write or rewrite one section's text, not its heading. A line starting "- " is a bullet; other lines are paragraphs or short labels such as "Essential:".
- {"type":"open","target":"..."}: bring something into view: outline, templates, own (create your own template), details, fixed (the organisation's fixed text), check, publish, preview, versions, download, delete (it asks the user to confirm), review, or "section:<key>".
- {"type":"undo"}: undo the last change (context.job.canUndo).
- {"type":"ask","fact":"title|place|deadline|contract","quick":["..."]}: your reply asks a question. Give "fact" when it asks for that fact (the window shows its picker); "quick" holds up to four short tappable answers.

Where the job is (context.stage):
- "template": no template yet. In plain words, recommend context.recommendation (why, how many sections, about how long) and say you can show others or build their own. Apply a template only once the user agrees or names one. To show others, open "templates"; to build their own, open "own". If the job type (job, consultancy, internship, volunteer, and the contract) is unclear from what they wrote, ask about it naturally. Do not ask for other facts yet and do not write sections.
- "style": the template is chosen and nothing is written yet. Settle how it should sound, proposing context.job.proposedStyle in plain words. As soon as the user answers (agreement, or their own words), return set_style and, in the same answer, write_section for every section in context.job.sections that is not fixed, in order: this is the first draft, complete and to the template's length. In the reply, say in one sentence which parts are typical content for this kind of role that they should check or replace with their own, and name the placeholders still to fill. If context.org.styleKept is false, end the reply by asking whether to keep this style for every job, with the quick answers "Keep it for all jobs" and "Just this job".
- "writing": the draft exists. Do what the user asks. A request that names no section is about context.job.inView. When a fact changes, also rewrite the sections whose text mentions it. When context.job.missingFacts is not empty and nothing else is pending, ask for the first missing fact, with the ask action and its fact.

Writing the job description (every write_section):
- Follow the template's writing guide below: its structure, voice, section rules, and length. Write as the best organisations of that kind write, to the depth candidates expect from them: a UN or INGO job description is full and detailed, a local NGO advert short. Acronyms spelt out on first use; no hype.
- Standard content is expected, invented facts are not. You may write what a role with this title, at this level, in this sector, normally does and needs; the competency or behaviour framework of the template's family; and the general, well-known context of the place and the sector. You must never invent facts: pay, allowances, benefits, leave, rest and recuperation, accommodation, security ratings, dates, durations, grades, numbers of any kind (team size, budget, targets, people reached), years of experience (unless given, or set by the guide's grade rule), donors, partner or project names, contacts, or links.
- Keep every fact, duty, number, date, and name the user gave, exactly, and use them where they belong: the places, partners, reporting line and figures the user gave appear in the duties, not only in the purpose. Keep the education and years of experience exactly as given; never raise them.
- Never state anything about the post's history or funding that the user did not say: not that it is new, replaces someone, is part of a growing team, or is newly funded.
- Where the template expects a fact that was not given, write a short bracketed placeholder ("[Duty station]" and "[Closing date]" exactly for those two; otherwise for example "[Reports to]", "[Budget responsibility]", "[to confirm]"), and name the placeholders in your reply. Conditions of service not given (security, rest and recuperation, accommodation, allowances, leave) take one line only: "Conditions of service: [to confirm]", in the job's language.
- Voice: every duty names what, with whom or for whom, and where or how often, as far as the facts allow; active verbs; varied openings; no filler. Words that add nothing: "relevant stakeholders", "as appropriate", "in line with applicable procedures", "various", "ensure effective", "robust", "dynamic", "passionate", "etc.". For example, not "Coordinate with relevant stakeholders to support coherent delivery in line with applicable procedures" but "Agree a monthly work plan with the two partners in Juba and Gumbo, and follow up each repair until the water point works".
- Write every heading label and line label in the job's language, translating the guide's labels (for example "Reports to:" becomes "Rend compte à :" in French).
- Never write the organisation's fixed text (safeguarding, PSEA, equal opportunity, no-fee notice, data protection and the like): the window adds it word for word. Never write sections marked fixed (About us, How to apply): they come from the organisation's profile and its application settings.
- Plain hyphens and ordinary spaces. A line ending with ":" is a group label; a line starting "- " is a bullet.
- Sections marked by "user" keep their wording unless the user asks you to change them.
- Write the job description in the job's language: the language of the user's first message.`;

export type ChatTurn = { reply: string; actions: Array<Record<string, unknown>> };

/** The instructions with the writing guide of the job's template. */
export function systemFor(context: Record<string, unknown>): string {
  const job = context.job as { template?: { key?: unknown } } | undefined;
  const org = context.org as { orgType?: unknown } | undefined;
  const key = typeof job?.template?.key === 'string' ? job.template.key : '';
  const guide = guideFor(key, typeof org?.orgType === 'string' ? org.orgType : '');
  const example = guide.example ? `\n\nA worked example in this template, for another role, to show the depth and voice expected. Follow its standard, never its facts or wording:\n${guide.example}` : '';
  return `${SYSTEM}\n\nThe template's writing guide (about ${guide.words[0]} to ${guide.words[1]} words for the sections you write):\n${guide.text}${example}`;
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** The request to the model: the instructions, then the job and the conversation as data, then the message. */
export function messagesFor(context: Record<string, unknown>, message: string, first: boolean): ChatMessage[] {
  const lead = first ? "This is the user's first message, typed on the Create a job page; the window has just opened on it." : 'The user says:';
  return [
    { role: 'system', content: systemFor(context) },
    { role: 'user', content: `Context (JSON):\n${JSON.stringify(context)}\n\n${lead}\n${message}` },
  ];
}

/** The balanced `{…}` starting at `start`, skipping braces inside strings; null when it never closes. */
function objectAt(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/**
 * The model's answer as a reply and a list of actions, or null when it holds no JSON object with a reply. Some models wrap the object
 * in a code fence or a stray tag, so the first complete object with a reply is taken. Nothing else is trusted here.
 */
export function readModelReply(content: string): ChatTurn | null {
  let data: unknown = null;
  for (let i = content.indexOf('{'); i >= 0 && !data; i = content.indexOf('{', i + 1)) {
    const candidate = objectAt(content, i);
    if (!candidate) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && typeof (parsed as { reply?: unknown }).reply === 'string' && (parsed as { reply: string }).reply.trim()) data = parsed;
    } catch {
      /* not this one */
    }
  }
  if (!data) return null;
  const { reply, actions } = data as { reply: string; actions?: unknown };
  const list = Array.isArray(actions) ? actions : [];
  return {
    reply: reply.trim().slice(0, 2000),
    actions: list.filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object' && !Array.isArray(a) && typeof (a as { type?: unknown }).type === 'string').slice(0, 40),
  };
}

export type ModelResult = { ok: true; content: string } | { ok: false; status: number; code?: string };

/** Bedrock's own numbered error ("Error 002"), and nothing else of its answer, which could quote the request. */
async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const data = (await res.json()) as { error?: { message?: unknown } };
    const m = typeof data.error?.message === 'string' ? data.error.message.match(/^Error \d{3}\b/) : null;
    return m?.[0];
  } catch {
    return undefined;
  }
}

/** One signed call to the mantle route. Returns the model's text, or the HTTP status (0 for a network error or a timeout). */
export async function callModel(messages: ChatMessage[], credentials: Credentials, fetchImpl: typeof fetch = fetch): Promise<ModelResult> {
  const body = JSON.stringify({ model: MODEL, messages, max_tokens: MAX_TOKENS, temperature: 0.3 });
  const headers = signRequest({ method: 'POST', url: ENDPOINT, body, region: REGION, service: 'bedrock', credentials, headers: { 'content-type': 'application/json' } });
  try {
    const res = await fetchImpl(ENDPOINT, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    if (!res.ok) return { ok: false, status: res.status, code: await errorCode(res) };
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = data.choices?.[0]?.message?.content;
    return typeof content === 'string' ? { ok: true, content } : { ok: false, status: 502 };
  } catch {
    return { ok: false, status: 0 };
  }
}
