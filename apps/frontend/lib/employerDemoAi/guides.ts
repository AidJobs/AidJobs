import { EXAMPLES } from './examples';

/**
 * How each template is written, for the AI chat's drafts: structure, voice, length, and section rules, from the style study of real
 * adverts (employer-generator/style-study) and the third test round's instructions. Lengths count the text the AI writes, without
 * the organisation's fixed text, About us, or How to apply.
 */
/** What the demo checks in each section after a draft: words, bullets, group labels, and lines. */
export type SectionRule = { minWords?: number; bullets?: [number, number]; groups?: [number, number]; minLines?: number };

/** `example`: a brief and a complete draft for another role, shown to the model as the standard to reach (provisional: see examples.ts). */
export type Guide = { words: [number, number]; text: string; rules: Record<string, SectionRule>; example?: string };

const UN_COMPETENCIES =
  "Core competencies of UN funds and programmes, one line each: Achieve Results; Be Innovative; Learn Continuously; Adapt with Agility; Act with Determination; Engage and Partner; Enable Diversity and Inclusion. Then four to six functional or technical competencies for this role, each with a one-line description.";

export const GUIDES: Record<string, Pick<Guide, 'words' | 'text'>> = {
  'un-agency': {
    words: [900, 1400],
    text: `UN agency format (UNDP and other UN funds and programmes). Formal, third person ("the incumbent", "the [title]"); recognisable headings in this fixed order; candidates expect the agency's structure.
- Background: 150 to 250 words. The programme or project the post belongs to and why the post exists; the country and sector context in general, well-known terms (no figures unless given).
- Duties and responsibilities: 3 to 6 function groups, each a short label line ending with ":" followed by 4 to 6 bullets; 15 to 25 bullets in all. Base-form verbs (Lead, Coordinate, Monitor, Provide, Ensure), 20 to 40 words per bullet, each concrete about what, with whom, and to what end. Keep every duty given. End with the bullet "- Perform other duties within the functional profile as required."
- Institutional arrangement: third person; who the post reports to, technical supervision if any, direct reports, and the main counterparts. Missing facts as bracketed placeholders.
- Competencies: ${UN_COMPETENCIES}
- Required skills and experience: "Education:" then "Experience:" then "Required skills:" then "Desired skills:" labels. Education: exactly what the manager gave; only when none is given, the UN formula (an advanced university degree, Master's or equivalent, or a first-level degree with two additional years of qualifying experience). Experience: the years the manager gave; otherwise by a UN grade when one is given (P1/NO-A 0 to 1 years, P2/NO-B 2, P3/NO-C 5, P4/NO-D 7, P5 10 years of progressively responsible experience with a Master's); otherwise "[years by grade]". Split required and desired strictly.
- Languages: the standard formula ("Fluency in English is required. Knowledge of ... is desirable."), using the languages given, or the official language of the duty station when it is well known.`,
  },
  'un-secretariat': {
    words: [800, 1300],
    text: `UN Secretariat format (UN Careers, Inspira). Formal, third person.
- Org. setting and reporting: the office, its mandate in general terms, where the post sits, and who it reports to (placeholders for anything not given).
- Responsibilities: open with "Within delegated authority, the [title] will be responsible for the following duties:" then 12 to 20 bullets, verb-led, grouped by function where natural.
- Competencies: the UN Secretariat values-based competencies most relevant here (for example Professionalism, Planning and Organising, Communication, Teamwork, Client Orientation), each with a two-line description in the Secretariat's style.
- Education and work experience: "Education:" and "Work experience:" labels; education exactly as the manager gave it, otherwise an advanced university degree or a first-level degree with two additional years; years as given, otherwise by grade as in the UN rule (P2 2, P3 5, P4 7, P5 10), otherwise "[years by grade]".
- Languages: English and French are the working languages of the Secretariat; state fluency required in one and knowledge of the other as desirable, plus any language given.
- Assessment: "Evaluation of qualified candidates may include an assessment exercise which may be followed by a competency-based interview."`,
  },
  'ingo-role-profile': {
    words: [800, 1300],
    text: `INGO role profile (Save the Children, World Vision). Formal and third person ("the post holder"); sector candidates recognise the section names.
- Role purpose: 3 to 5 sentences that lead with the outcome ("The post holder will..."), the context, and the reporting line. No organisation history.
- Scope of role: labelled lines, one per line: "Reports to:", "Staff reporting to this post:", "Budget responsibilities:", "Location and travel:", "Contract:", "Grade:", "Child safeguarding level:" (and "Key working relationships:" with internal and external counterparts). A value not given is a bracketed placeholder such as "[to confirm]".
- Key areas of accountability: 4 to 6 headed groups, each a short label line ending with ":" followed by 4 to 6 verb-led bullets of 12 to 30 words; 18 to 28 bullets in all. Typical groups: programme quality and delivery; partnership and coordination; monitoring, evaluation, accountability and learning; people and capacity building; safeguarding and compliance. Keep every duty and target given. No person-specification lines here.
- Behaviours: the organisation's values if given; otherwise 4 to 5 widely used INGO behaviours (Accountability, Ambition, Collaboration, Creativity, Integrity), each with a one-line, role-specific description.
- Qualifications and experience: "Essential:" 5 to 7 lines, then "Desirable:" 3 to 5 lines. A relevant degree or equivalent experience; experience described without a number of years unless given; languages explicit; safeguarding commitment.`,
  },
  'ingo-purpose': {
    words: [700, 1100],
    text: `INGO purpose-led (Oxfam). Three layers: Team purpose, then Job purpose, then Key responsibilities.
- Team purpose: one or two sentences (up to 50 words) on what the team exists to change, with the geography.
- Job purpose: one paragraph of 60 to 100 words on the role's remit and how it delivers (directly or through partners).
- Key responsibilities: 10 to 16 imperative bullets, optionally under 2 to 4 short labels ending with ":".
- What we are looking for: open warmly ("We are looking for someone who..."), then "Essential:" and "Desirable:" lists; languages explicit; no years unless given.
- We offer: only what is given; otherwise one line naming what will be confirmed, and list it in the reply.`,
  },
  'about-you': {
    words: [700, 1100],
    text: `"About you" narrative (Plan International, CARE International UK, Christian Aid). Warm, second person ("you"), confident.
- The opportunity: two short paragraphs (100 to 160 words) on why the role matters and what the person will achieve.
- Key responsibilities: 10 to 16 bullets, optionally under 2 to 4 short labels ending with ":".
- About you: a warm opening sentence, then "Essential:" and "Desirable:" lists; no years unless given.
- What we offer: only what is given; otherwise one line naming what will be confirmed.`,
  },
  'field-profile': {
    words: [700, 1100],
    text: `Humanitarian field profile (MSF, IRC, NRC). Plain, direct, operational.
- Main purpose: 2 to 4 sentences on what the post delivers in the field.
- Accountabilities: 3 to 5 labelled groups ending with ":" and 4 to 6 bullets each, concrete and operational (activities, sites, partners, reporting, security and safeguarding).
- Key working relationships: internal and external counterparts, one line each.
- Requirements: "Essential:" and "Desirable:"; field experience and languages explicit; no years unless given.
- Conditions: the duty station and travel in general terms; security level, rest and recuperation, or accommodation only if given, otherwise the single line of the general rule.`,
  },
  donor: {
    words: [650, 1050],
    text: `Government donor and grant-making agency (GIZ style; FCDO uses essential and desirable criteria). Formal, precise, "you" form.
- About the programme: 150 to 250 words. The programme, its objective, the sector and the country in general terms; on whose behalf it runs only if given; why this post is needed.
- Your tasks: 10 to 16 bullets, optionally under 2 to 4 labels ending with ":"; advisory, coordination, partner and reporting duties typical of a donor-funded programme; keep every task given.
- Your profile: labels "Education:", "Professional experience:", "Other knowledge and skills:", "Personal skills:"; then languages. No years unless given.
- What we offer: only what is given (contract, duration, pay); otherwise one line naming what will be confirmed.`,
  },
  contractor: {
    words: [650, 1050],
    text: `Development contractor (DAI, Palladium, Chemonics). Formal and specific.
- Position overview: the project, the donor only if given, and the position's role in 80 to 150 words.
- Responsibilities: 12 to 18 verb-led bullets, optionally grouped.
- Deliverables: concrete outputs; dates or durations only if given.
- Qualifications: required and preferred; level of effort and key-personnel status only if given.`,
  },
  'local-concise': {
    words: [300, 550],
    text: `Local NGO concise (BRAC, Amref, Kenya Red Cross). Readers are often on a phone and in their second language; plain and direct, "you".
- Project brief: 2 to 3 sentences.
- Job purpose: 2 sentences on what the person will achieve and where.
- Key responsibilities: 5 to 8 concrete bullets of 8 to 15 words.
- Qualifications and experience: 3 to 5 must-haves, then "Good to have:".`,
  },
  charity: {
    words: [450, 800],
    text: `Domestic charity (UK, US, Australian charities). Warm, second person, inclusive.
- About the role: one or two short paragraphs.
- What you'll do: 8 to 12 bullets.
- About you: "Essential:" and "Desirable:", with the encouragement to apply even without every point.
- Why join us: only what is given; otherwise one line naming what will be confirmed.`,
  },
};

/** The checks each template's sections must pass, by section key, matching the guides above. */
export const RULES: Record<string, Record<string, SectionRule>> = {
  'un-agency': { background: { minWords: 150 }, responsibilities: { groups: [3, 6], bullets: [15, 26] }, relationships: { minWords: 50 }, competencies: { minLines: 10 }, requirements: { minLines: 6 } },
  'un-secretariat': { setting: { minWords: 80 }, responsibilities: { bullets: [12, 21] }, competencies: { minLines: 4 }, requirements: { minLines: 4 } },
  'ingo-role-profile': { purpose: { minWords: 50 }, relationships: { minLines: 7 }, responsibilities: { groups: [4, 6], bullets: [18, 28] }, competencies: { minLines: 4 }, requirements: { minLines: 8 } },
  'ingo-purpose': { team: { minWords: 15 }, purpose: { minWords: 50 }, responsibilities: { bullets: [10, 16] }, requirements: { minLines: 6 } },
  'about-you': { purpose: { minWords: 90 }, responsibilities: { bullets: [10, 16] }, requirements: { minLines: 6 } },
  'field-profile': { purpose: { minWords: 30 }, responsibilities: { groups: [3, 5], bullets: [12, 30] }, relationships: { minLines: 3 }, requirements: { minLines: 6 } },
  donor: { background: { minWords: 150 }, responsibilities: { bullets: [10, 16] }, requirements: { minLines: 6 } },
  contractor: { purpose: { minWords: 80 }, responsibilities: { bullets: [12, 18] }, deliverables: { minLines: 3 }, requirements: { minLines: 5 } },
  'local-concise': { responsibilities: { bullets: [5, 8] }, requirements: { minLines: 3 } },
  charity: { responsibilities: { bullets: [8, 12] }, requirements: { minLines: 4 } },
};

/** The organisation's own format: its headings and order, written to the depth of the family its organisation type belongs to. */
const OWN_BY_ORG: Record<string, string> = {
  ingo: 'ingo-role-profile',
  ngo: 'local-concise',
  un: 'un-agency',
  charity: 'charity',
  donor: 'donor',
  contractor: 'contractor',
};

export function guideFor(templateKey: string, orgType: string): Guide {
  const own = GUIDES[templateKey];
  if (own) return { ...own, rules: RULES[templateKey] ?? {}, example: EXAMPLES[templateKey] };
  const baseKey = OWN_BY_ORG[orgType] ?? 'ingo-role-profile';
  const base = GUIDES[baseKey];
  return {
    words: base.words,
    rules: RULES[baseKey] ?? {},
    example: EXAMPLES[baseKey],
    text: `The organisation's own format: keep its headings and their order exactly. Write each section to the depth and length of this model, mapping its sections to the closest headings:\n${base.text}`,
  };
}
