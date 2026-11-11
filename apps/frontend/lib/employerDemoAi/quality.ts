import { guideFor, RULES } from './guides';
import { readModelReply, type ChatMessage, type ChatTurn, type ModelResult } from './model';

/**
 * The demo's checks on what the AI writes, and one targeted repair (employer-side plan, section 19, the AI chat). A first draft is
 * checked against its template's rules (length, duties, groups, lines) and every turn that writes is checked for content: numbers not
 * given, claims about the post nobody made, filler, raised education, labels left in English in another language, and the facts the
 * user gave. Problems go back to the model once, with exactly what to fix; the sections it rewrites replace the first ones.
 */
type Ctx = {
  stage?: string;
  job?: { template?: { key?: string }; facts?: Record<string, unknown>; sections?: Array<{ key: string; heading: string; fixed?: boolean; text?: string | null }> };
  org?: { orgType?: string };
  walk?: { next?: { kind?: string; sections?: Array<{ key: string }> } | null } | null;
  conversation?: Array<{ from?: string; text?: string }>;
};

const FILLER = ['relevant stakeholders', 'as appropriate', 'in line with applicable procedures', 'ensure effective', 'robust', 'dynamic', 'passionate', 'etc.'];
const HISTORY = /\b(?:new|newly created|newly established) (?:post|position|role)\b|\bnouveau poste\b|\bposte nouvellement\b/i;
const ADVANCED = /\bmaster'?s\b|\badvanced university degree\b|\bmaster\b|\bdiplôme universitaire supérieur\b/i;
const DEGREE = /\bdegree\b|\bdiplôme\b|\bbachelor|\blicence\b|\bdiploma\b/i;
const ENGLISH_LABEL = /^(reports to|staff reporting to this post|budget responsibilities|location and travel|contract|child safeguarding level|key working relationships|essential|desirable|education|experience|required skills|desired skills|professional experience|other knowledge and skills|personal skills|conditions of service)\s*:/i;
const FRENCH = /\b(le|la|les|des|du|une|nous|vous|pour|avec|recrutons|poste|est)\b/gi;
const QUANTITY = /(\d[\d,.]*)\s+(?:[\p{L}-]+\s+)?(?:years?|ans|days?|jours|weeks?|semaines|months?|mois|households?|ménages|volunteers?|bénévoles|relais|promoters?|promoteurs?|partners?|partenaires|staff|officers?|people|personnes|members?|membres|sites?|clinics?|cliniques|schools?|écoles|facilities|villages?|districts?|communities|communautés)\b/giu;
const MAX_PROBLEMS = 8;

const plainNumbers = (t: string) => t.replace(/(\d)[,.\s](?=\d{3}\b)/g, '$1');

function stats(lines: string[]) {
  const kept = lines.map((l) => l.trim()).filter(Boolean);
  return {
    words: kept.join(' ').split(/\s+/).filter((w) => /\w/.test(w)).length,
    bullets: kept.filter((l) => l.startsWith('- ')).length,
    groups: kept.filter((l) => !l.startsWith('- ') && l.length < 90 && l.endsWith(':')).length,
    lines: kept.length,
  };
}

/** Everything the user wrote in this job's conversation, including the message being answered. */
export function userTextOf(ctx: Ctx, message: string): string {
  return [...(ctx.conversation ?? []).filter((m) => m.from === 'user').map((m) => m.text ?? ''), message].join('\n');
}

function writesOf(turn: ChatTurn) {
  return turn.actions
    .filter((a) => a.type === 'write_section' && typeof a.section === 'string' && Array.isArray(a.lines))
    .map((a) => ({ key: a.section as string, lines: (a.lines as unknown[]).filter((l): l is string => typeof l === 'string') }));
}

/**
 * What the demo's checks find in a turn that writes; an empty list when it passes or writes nothing. A section written for the first
 * time is held to its template's rules; a whole draft also to its length and to the facts given; an edit only for content, so a
 * section shortened on purpose is never repaired back to full length.
 */
export function draftProblems(turn: ChatTurn, ctx: Ctx, message: string): string[] {
  const writes = writesOf(turn);
  if (!writes.length && ctx.walk?.next?.kind !== 'write') return [];
  const key = ctx.job?.template?.key ?? '';
  const guide = guideFor(key, ctx.org?.orgType ?? '');
  const rules = RULES[key] ?? guide.rules;
  const headings = Object.fromEntries((ctx.job?.sections ?? []).map((s) => [s.key, s.heading]));
  const user = userTextOf(ctx, message);
  const userLower = user.toLowerCase();
  const text = writes.map((w) => w.lines.join('\n')).join('\n');
  const problems: string[] = [];
  const next = ctx.walk?.next;
  const asked = next?.kind === 'write' ? (next.sections ?? []).map((s) => s.key) : [];
  const wholeDraft = ctx.stage === 'style' || asked.length > 1;
  const fresh = wholeDraft ? writes : writes.filter((w) => (ctx.job?.sections ?? []).find((s) => s.key === w.key)?.text === null);

  for (const w of fresh) {
    const rule = rules[w.key];
    if (!rule) continue;
    const st = stats(w.lines);
    const h = headings[w.key] ?? w.key;
    if (rule.minWords && st.words < rule.minWords) problems.push(`${h}: ${st.words} words; it needs at least ${rule.minWords}.`);
    if (rule.bullets && st.bullets < rule.bullets[0]) problems.push(`${h}: ${st.bullets} duties; it needs ${rule.bullets[0]} to ${rule.bullets[1]}, each a line starting "- ".`);
    if (rule.bullets && st.bullets > rule.bullets[1]) problems.push(`${h}: ${st.bullets} duties; keep it to ${rule.bullets[1]} at most.`);
    if (rule.groups && st.groups < rule.groups[0]) problems.push(`${h}: ${st.groups} groups; it needs ${rule.groups[0]} to ${rule.groups[1]}, each a short label line ending with ":".`);
    if (rule.minLines && st.lines < rule.minLines) problems.push(`${h}: ${st.lines} lines; it needs at least ${rule.minLines}.`);
  }
  const missingAsked = asked.filter((k) => !writes.some((w) => w.key === k));
  if (missingAsked.length) problems.unshift(`Write ${missingAsked.length > 1 ? 'every section asked for' : 'the section asked for'} now; missing: ${missingAsked.map((k) => headings[k] ?? k).join(', ')}.`);

  if (wholeDraft) {
    if (!asked.length) {
      const need = (ctx.job?.sections ?? []).filter((s) => !s.fixed).map((s) => s.key);
      const missing = need.filter((k) => !writes.some((w) => w.key === k));
      if (missing.length) problems.push(`Write every section of the first draft; missing: ${missing.map((k) => headings[k] ?? k).join(', ')}.`);
    }
    const total = stats(writes.flatMap((w) => w.lines)).words;
    if (total < guide.words[0]) problems.push(`The draft has ${total} words; this template needs about ${guide.words[0]} to ${guide.words[1]} for the sections you write. Add depth where the rules below ask, with standard content for this role, never invented facts.`);
    const city = String(ctx.job?.facts?.location ?? '').split(',')[0].trim();
    if (city && !text.toLowerCase().includes(city.toLowerCase())) problems.push(`Use the duty station, ${city}, in the text.`);
    const unused = Array.from(user.matchAll(QUANTITY))
      .map((m) => m[0])
      .filter((q) => !plainNumbers(text.toLowerCase()).includes(plainNumbers(q.toLowerCase()).split(/\s+/)[0]));
    if (unused.length) problems.push(`Use the facts the user gave: ${Array.from(new Set(unused)).slice(0, 5).map((q) => `"${q}"`).join(', ')} do not appear in the draft.`);
  }

  const gradeYears = key.startsWith('un-') ? ' 0 1 2 5 7 10 ' : '';
  const allowed = plainNumbers(`${user} ${JSON.stringify(ctx.job?.facts ?? {})}${gradeYears}`).toLowerCase();
  const strange = Array.from(new Set(plainNumbers(text).match(/\d+/g) ?? [])).filter((n) => !allowed.includes(n));
  if (strange.length) problems.push(`Remove numbers that were not given: ${strange.slice(0, 8).join(', ')}.`);
  const history = text.match(HISTORY);
  if (history && !userLower.includes(history[0].toLowerCase())) problems.push(`Remove "${history[0]}": nobody said the post is new.`);
  const filler = FILLER.filter((f) => text.toLowerCase().includes(f) && !userLower.includes(f));
  if (filler.length) problems.push(`Replace filler with specifics: ${filler.map((f) => `"${f}"`).join(', ')}.`);
  if (DEGREE.test(user) && !ADVANCED.test(user) && ADVANCED.test(text)) problems.push("Keep the education exactly as the user gave it; do not raise it to a Master's or an advanced degree.");
  const french = (userTextOf(ctx, '').match(FRENCH) ?? []).length >= 4;
  if (french) {
    const english = writes.flatMap((w) => w.lines).map((l) => l.trim().match(ENGLISH_LABEL)?.[0]).filter(Boolean);
    if (english.length) problems.push(`Write the labels in French: ${Array.from(new Set(english)).slice(0, 4).map((l) => `"${l}"`).join(', ')} are still in English.`);
  }
  return problems.slice(0, MAX_PROBLEMS);
}

/** The repair request: the conversation, the model's own answer, then exactly what to fix. */
export function repairMessages(messages: ChatMessage[], content: string, problems: string[]): ChatMessage[] {
  return [
    ...messages,
    { role: 'assistant', content },
    {
      role: 'user',
      content: `The window's checks found these problems in your answer:\n${problems.map((p) => `- ${p}`).join('\n')}\nFix them. Change only what is needed and keep everything else. Return one JSON object with the reply (adjusted if needed) and write_section actions only for the sections you changed.`,
    },
  ];
}

/** The first answer with the repaired sections in place of the first ones; its other actions and its reply stay. */
export function mergeRepair(turn: ChatTurn, fix: ChatTurn): ChatTurn {
  const fixed = new Map(writesOf(fix).map((w) => [w.key, w.lines]));
  const actions = turn.actions.map((a) => (a.type === 'write_section' && typeof a.section === 'string' && fixed.has(a.section) ? { ...a, lines: fixed.get(a.section) } : a));
  for (const [key, lines] of fixed) if (!writesOf(turn).some((w) => w.key === key)) actions.push({ type: 'write_section', section: key, lines });
  return { reply: turn.reply, actions };
}

export type Checked = { ok: true; turn: ChatTurn; problems: string[]; repaired: boolean; left: string[] } | { ok: false; status: number; code?: string };

/**
 * One turn with the checks: the model's answer, and when the checks find problems and time allows, one repair. `budgetMs`: no repair
 * is started after this, so the route stays within its time limit.
 */
export async function answerWithChecks(call: (messages: ChatMessage[]) => Promise<ModelResult>, messages: ChatMessage[], ctx: Ctx, message: string, budgetMs = 30_000): Promise<Checked> {
  const started = Date.now();
  const first = await call(messages);
  if (!first.ok) return first;
  const turn = readModelReply(first.content);
  if (!turn) return { ok: false, status: 502, code: 'unreadable' };
  const problems = draftProblems(turn, ctx, message);
  if (!problems.length || Date.now() - started > budgetMs) return { ok: true, turn, problems, repaired: false, left: problems };
  const second = await call(repairMessages(messages, first.content, problems));
  const fix = second.ok ? readModelReply(second.content) : null;
  if (!fix) return { ok: true, turn, problems, repaired: false, left: problems };
  const merged = mergeRepair(turn, fix);
  return { ok: true, turn: merged, problems, repaired: true, left: draftProblems(merged, ctx, message) };
}
