# Draft plan, version 3 (8 November 2026; not agreed, not recorded)

Version 2 answered the independent review of version 1 (`PLAN-REVIEW.md`: changes needed, 8 must-fix, 11 should-fix, 9 minor). The re-review of version 2 (`PLAN-REVIEW-2.md`: approve with changes; 26 of 28 resolved, 2 partly; one new must-fix and ten smaller points, wording and ordering only, no third review needed) is answered in version 3. The user's decisions of 8 November 2026:
- **Stream scope:** until the crawler steps that change the writer (W-36), the jobs schema (W-37), organisations (Gate 8) and the fetch policy (W-34 and the Workday POST change) have merged, the employer stream works only in separate areas.
- **Length:** format bands are ceilings for Draft mode only; content follows the facts and typical role content, never padded.
- **Beta jobs: the agent's reading, unconfirmed until the user answers:** draft, review and approve, plus publishing as the demo designs it. Publishing needs the contract amendments and the crawler's writer steps first; until those have merged, the beta does draft, review and approve only, and nothing reaches the public jobs table.

Two linked proposals:
- **A. The JD generator in production** (the demo on `demo/employer` simulates it with fixed rules in `engine.ts`).
- **B. A parallel employer stream** before the public launch, replacing "after launch" (employer plan §12; growth plan §7, step 8).

## Part 1: what the demo does today (from an end-to-end read of the demo code; spot-checked by the reviewer)

- **Inputs:** first-screen box (completion, underlined facts, readiness ring, long-paste import, file drop); + menu (upload Word or PDF parsed in the browser, paste, link (simulated), hire again, continue a draft); fact slot; chat; direct editing; fact pills; JD outline (format, add, remove, reorder, standard texts); How to apply settings.
- **Drafting (`engine.ts`):** role by keyword (12 families); facts by regular expressions; sections from the format plus fact-driven extras; text from the role family's fixed lists, the same in every format; placeholders `[Duty station]`, `[Closing date]`.
- **A format:** headings, order, one tone word, default standard texts. No voice, depth, length or formality. Tone changes two sentences.
- **Not reaching the drafted text:** brand style (never read); sectors and SDGs (sectors only feed first-screen role suggestions); start date (only in "Changed since publishing"); positions. "Locked" standard texts can be unticked (`actions.ts` toggleCommitment). The format builder's tone tooltips promise "The incumbent will..." text the engine never writes.
- **Chat:** pattern matching: "shorter" keeps 3 bullets, "longer" adds library bullets, a language name anywhere adds it as a requirement, fact changes rebuild affected sections, acknowledgements change nothing, unrecognised requests are refused, and other sentences are appended.
- **Languages:** French, Arabic, Spanish, Portuguese versions from lookup tables, lines not covered stay English; line-by-line review; staleness tracking; Amplify only; no job in another language; chat English only; tables mix French vous, Spanish tú, formal Portuguese.
- **Other text:** fixed English templates (Reach, share, field-post notice, briefings, notices).
- **Bugs:** duplicated "pauses publishing" block in Settings; locked not enforced; language-name substring trigger.

## Part 2: the generator in production (proposal A)

### A1. Four kinds of content, each line with its source
| Kind | Source | Rule |
|---|---|---|
| Facts (title, place, pay, grade, dates, contract, contacts, budget, staff numbers) | the user | never invented. May be offered as labelled picks with a stated basis (published scales, closing-date picks, organisation memory, as agreed in employer plan §14 and §15), never inserted unless the user chooses one. Missing: placeholder plus question. |
| Given content (the user's duties, requirements, competencies) | the user | kept word for word by default; only regrouped and given headings. Rewording is opt-in per section with a before-and-after view, recorded as "edited by AI from given". |
| Suggested content (duties, competencies, background, requirements the AI drafts) | AI, in the format's style | marked "Suggested" until accepted or edited; Accept all and per line (user decision on whether Accept all is allowed). |
| Standard texts (about us, safeguarding, UN considerations, no fee, data protection) | organisation profile, or AidJobs starter texts | inserted word for word through markers; the AI never writes them. Starter texts never state practices the organisation has not confirmed (as the demo does for the Misconduct Disclosure Scheme; also background and counter-terrorism checks). Locked texts enforced in the interface and on the server. |

Line sources: given, edited by AI from given, suggested, edited by the user, standard.

### A2. A format becomes a full profile
Structure (existing); voice (third person, we/you, imperative); tone; section rules (what each contains, how phrased, e.g. UN base-verb duty bullets in 4 to 6 groups and the UN education formula); depth (groups and bullets); sector phrasings; one AidJobs-written example per section (never copied); language-specific phrasing where it exists.

**Length (user decision: ceilings, never targets).** Bands come from the study's recommended ranges, not from real padded adverts, and are marked "to test, not settled": UN agency 700-1,300, INGO role profile 650-1,150 and INGO purpose-led 550-1,000 (`style_rules.py`, used in the tests); local NGO field roles 200-400 and officer roles 350-600 (the style study's suggested targets, group C); other formats set the same way after model test round 4. They are ceilings for Draft mode only. Real totals with standard texts (UN agency 1,400-2,800; UN Secretariat 1,800-2,200; INGOs 950-2,400) are descriptions of the sector, used to explain to users why their advert is shorter, never as targets.

Custom, base and imported formats inherit a profile: the builder adds "Writes like" (nearest built-in), "Detail" (concise, standard, detailed, within the ceiling) and "Address candidates as" (third person, you, we/you). Imported adverts are read once by AI to propose voice (the simulated "learn my style"), confirmed by the user. Switching format redrafts unedited and suggested lines; given and edited lines kept.

### A3. Three drafting modes, chosen from the input
| Input | Mode | Behaviour |
|---|---|---|
| a few lines | Draft | the minimum useful advert for the chosen format: fact block, concrete duties and must-haves in the numbers the format profile sets (for example 4 to 7 duties and 3 to 5 must-haves for local NGO posts; 3 to 6 groups of duties for UN agency posts), the format's other sections briefly; questions instead of padding. Length checked only here, as advice, never triggering a repair. |
| a full job description or ToR | Restructure | every line and fact kept word for word, regrouped into the format, nothing added, markers placed (round 3 evidence). No length check. |
| an existing advert | Improve | rewrites vague lines (shown before and after), flags inflated requirements as questions, lists missing facts, keeps voice. No length check. |

### A4. Pipeline (server side)
1. **Intake:** text, paste, file (parsed in the browser, only text reaches the server, size capped), hire again; link import only after its own §9 decision (A6b). Emails, phone numbers and links found in uploads are replaced with placeholders by fixed rules before anything is sent to a model or stored, and the user is told. Personal names cannot be removed reliably by fixed rules before a model sees the text: the extraction model flags them for the user to remove or keep, and the provider's no-storage terms (A9) cover that first pass. A fast model (Gemma 4) extracts facts, role and given lines as structured output.
2. **Plan:** format profile, sections, mode, sections to draft.
3. **Write:** the writer model gets the format profile, the organisation's voice, language and formality, the honesty rules, facts and given lines (uploaded text marked as data, never instructions), role-library grounding. No tools; structured output only (sections as lines with sources). Streamed section by section.
4. **Verify:** facts and given lines kept (given lines word for word unless rewording was chosen); no new numbers, dates, money, links, emails, phone numbers or payment requests unless from the profile or typed facts; no unrequested statements; markers once; headings; language purity and formality; odd characters cleaned; inclusive highlights; length advice in Draft mode only. Numbers compared after localisation (so "3,1" and "3.1" match). One repair pass; the rest shown as checks.
5. **Assemble:** standard texts, placeholders, How to apply. Output rendered as escaped text or sanitised Markdown, never raw HTML.
6. **When AI is unavailable:** fact extraction and the outline still work (ported from the demo engine); any fallback draft lines are marked Suggested; no fallback for jobs in other languages ("AI unavailable, try again or write by hand"); a used-up budget keeps section 18's behaviour (hand editing free, Amplify offered), never a substitute draft.

### A5. Chat
AI intent reading replaces pattern matching; the chat edits this job and answers questions about it, and refuses anything off-topic. Every edit through verify, shown with Undo (existing `lastChange`, versions, approval reset). Fast local paths for undo and simple chips. Answers in the language typed (decided 7 November 2026).

### A6. Settings wired to text
Organisation type (existing defaults). Tone: job > chat > format > a new organisation default; affects all sections. Brand style turned into lasting style instructions (person, sentence length, terms to use or avoid, rights-based wording, UK/US spelling). New, subject to the user: formality per language (vous/tu, Sie/du, usted/tú, formal/plain Hindi); default job languages (§18); detail preference (within the ceiling). About us as a standard block, with an optional short version. Standard texts via markers, locked enforced, per-language versions from the organisation or shown in the source language and marked. Grade scale, countries, sectors as grounding. Approval workflow unchanged. Application language per job.

### A6b. Link import (needs a contract §9 amendment, security-boundary pull request of its own)
Only for verified organisations (or a per-account and a global cap), one page per job, HTML and text only, the existing size and time limits. Built only after W-34 has merged, and never in the same pull request or review window as the Workday POST change. Not in the first beta unless approved.

### A7. Languages
Writing in the job's language from the start (same profile, language phrasing, organisation formality). Language versions (Amplify): AI translation replacing lookup tables; line-by-line review, staleness, redraft only changed lines kept; per-version checks (numbers, links, dates kept and localised; duty count; no English left; register; right to left); glossary per language for sector terms. Offered languages: only those passing native review; until then "beta" or held back. Evidence so far: one translation task and a few briefs per language; Hindi, Bengali, Urdu and Swahili native reviews pending. Field-post notice, WhatsApp version, share message in the job's language. Interface stays English (decided).

### A8. Other generated text
AI: Reach invitation and team email, WhatsApp version (60 to 90 words), field-post notice summary. Templates: briefings, reminders, update, deletion and payment notices.

### A9. Models, cost, safeguards
- **Models (provisional until the user's Hindi rating):** Kimi K2.5 writes and translates; Gemma 4 extracts and checks. A fallback writer is named only after it passes the same evaluation set (round 2 found invented facts from Qwen 3 and Mistral Large 3).
- **Production access:** a separate production IAM user limited to the inference permission it needs, key only in Render, never on the development machine (security stage 6 principle); an in-application daily spending cap and kill switch beyond AWS's alerts; mantle's data terms (no storage, no training) and production support confirmed in writing; the region follows Render's region; data-processing terms and transfers for EU organisations documented. The standard Bedrock route once AWS lifts the new-account hold, subject to the same production checks (permission, caps, data terms, region).
- **Cost:** about US$0.004 measured per full job description call; a whole job's session (extraction, writing, chat, verify, repair) to be measured in model test round 4; the per-job token budget of §18, set per language.
- **Abuse:** off-topic refusal; per-account and per-address rate limits; a smaller allowance until the account's email is confirmed; a cap on new organisations per domain or device signal; a global circuit breaker tied to the spending cap.
- **EU AI Act and data protection:** written classification and reasoning (Annex III 4(a) covers recruitment systems, including targeting job advertisements): AI drafts adverts only, never chooses recipients or targets an audience, never assesses candidates; transparency for AI-generated text met by labelling and human approval; AidJobs as processor of employers' content with a data-processing agreement; employer terms and a privacy notice before the beta; moderation queue and "Report this job" before any employer job is visible (decision 12).
- **Evaluation set:** the test kit, run before any model or instruction change: facts 100%, invented 0, given lines word for word, plus seeded prompt-injection and personal-data cases and the verify step's own accuracy.

### A10. Model test round 4 (needs the user's approval of budget; sample data only; key in the vault)
Minimal input to a draft in each of the 10 formats; the same brief in UN, INGO and local NGO formats (content truly differs); about 20 chat intents; custom and imported formats; formality and languages; verify-step accuracy with seeded invented duties, statements and contacts; localised number comparison; whole-session cost; prompt-injection and personal-data cases; the candidate fallback writer.

### A11. Open decisions for the user
1. Suggested content: Accept all allowed, or each suggestion confirmed before publishing?
2. Format profiles authored by AidJobs from the style study, with the user's review?
3. Starter standard texts offered (limited to confirmed practices), or flagged as missing?
4. New settings: formality per language, default job languages, detail preference, terms to avoid or prefer?
5. Confirm the reading of the beta decision (above); until then it is recorded as unconfirmed.
6. Approve Gate 8's slot in stream one, right after W-37.

## Part 3: the parallel employer stream (proposal B)

### B1. The change and its rules
- Employer production runs before the launch as the second of the two allowed code streams. **Stream one (crawler foundation, path to launch) has priority** for the user's approvals and merges; production takes one merge at a time; the demo (W-51) still does not count as a stream.
- **Why the 30 October objection no longer holds** (growth plan §7 rejected parallel streams for rework and mixed approvals): the employer stream's first steps touch none of stream one's areas (B3), so there is no rework; approvals stay ordered by the stream-one-first rule.
- **Cost to the launch:** the launch at about 2,000 jobs comes later; rough size below (B6).

### B2. Gates: amendments before build plans, in two sets
Each amendment is written, independently reviewed and merged before the build plan that needs it, each the user's decision (decision 12 was the user's own).

**Set 1, for the drafting beta (accounts, drafts, review, approval; nothing published):**
- contract §2 scope (accounts and employer drafting; submissions and payments named as later);
- rule 9 and §14 (a second sign-in system and roles beside the admin);
- §4 and §10 ("another job table", "promotable shadow row") for the employer's drafts-and-versions store, never read by public search;
- growth plan 4.6 (stored employer user and reviewer emails);
- UX-08 item 2E (AI features out of scope at launch);
- `AGENTS.md`, the ledger and growth plan §7 updated together.

**Set 2, for publishing, written after the crawler's writer steps (W-36, W-37) and Gate 8 have landed, so it describes the real writer:**
- §3 and §5 (a direct source per organisation and how its writes are recorded without a crawl run); run ownership for writes from no crawl;
- §17 Gate 11 and crawler plan C3 (admission evidence for employer jobs; the earlier "§8" citation was wrong);
- §7 identity (title edits; variants per place);
- §6 lifecycle (close now, withdraw, reopen, no longer listed, deletion);
- §10 and rule 18 (applications by email);
- §13 and Gate 7 ("which jobs are public") if publishing before launch is wanted;
- §2's "no advertising" wording of 30 October (sponsored placement) and payments; UX-08 item 8 (no ads or payments at launch); growth plan section 8 (Vercel Hobby);
- growth plan 4.6 for Reach recipients' emails; decision 11 (a duplicates rule when a crawled organisation also publishes); decision 12 ("moderated, for organisations without a recruitment system").

**Separately:** §9 for link import (A6b), after W-34.

### B3. Order of work
**Gate 8 gets a slot in stream one** (it is a contract gate but not yet a numbered step in growth plan §7): proposed right after W-37, since both need the verified production schema. That gives "until Gate 8 merges" a place in the order; recorded with the growth plan §7 amendment.

**Now, separate areas only:**
1. Record proposal A as a plan section after the user's decisions.
2. Model test round 4 (A10), with the user's approval of its budget.
3. The Set 1 amendment drafts (B2).
4. The employer security stage (B4) as a plan.
5. The generator as its own backend module with no writes to `jobs` and no organisation tables (it takes facts and text in, returns sections out); its design, then its build after Set 1 merges.
6. Design documents only (no build) for employer sign-in and the drafts-and-versions store, using the single Organisation of Gate 8, extended, not duplicated.

**After Set 1 and Gate 8 have merged:** employer sign-in; the drafts-and-versions store (versioned migrations, an independent review, and a backup before the first one runs); review and approval. A beta for invited organisations can draft, review and approve; nothing reaches the public jobs table.

**After W-36 and W-37 have merged, Set 2 is merged and the writer-path design is reviewed:** publishing as the demo designs it, through the direct source and admission, with organisation verification, moderation and "Report this job"; public before launch only if §13 and Gate 7 are amended, otherwise at launch.

**Link import:** after W-34 and its §9 amendment, never alongside the Workday POST change.

**Waits for hard dependencies:** payments (Paddle: live domain, pricing page, terms, refund policy; Vercel Pro before any commercial use); Reach emails (domain with SPF, DKIM, DMARC).

### B4. Employer security stage (to be written before the first build plan)
Sign-in: a session cookie separate from the admin's (own secret and scope), password hashing or passwordless links, rate limits, no account enumeration, server-side revocation; tenancy: every query scoped to the organisation with cross-tenant tests; roles (Owner, Member, Reviewer); reviewer links (one person, expiring, single purpose); uploads (A4); Paddle webhooks (signature, replay protection, idempotency); new tables in `02_grants.sql` with personal-data tables excluded from the read-only role; retention and deletion periods; origin isolation: the employer application (or at least checkout) on its own subdomain, or the admin on its own origin; all employer content sanitised wherever rendered, including any admin moderation view; a Content Security Policy. Each item independently reviewed (ledger review rules).

### B5. Dependencies and hosting
- **The `aidjobs.app` domain (currently expired) and a transactional email provider are hard dependencies of employer sign-in** (verification, magic links or resets, invitations, own-domain verification), not only of Reach. Third-party sign-in would be another rule 9 decision.
- **Hosting:** the paid Render instance from the first beta user; a streaming path the frontend proxies support, with explicit time limits; AI calls fully asynchronous with a concurrency cap so crawls are never starved (contract §12: no second service unless shown to be needed); a load check before the beta.
- **AWS:** the Bedrock hold (mantle works meanwhile); production IAM user and caps (A9).

### B6. Rough size (working days of stream-two work, to refine in each step's plan; excludes the user's review and approval time)
| Step | Days |
|---|---|
| Docs and decisions (A record, Set 1 and Set 2 amendments, B4 plan) | 5-8 |
| Model test round 4 | 1-2 |
| Generator module with verify and safeguards | 6-10 |
| Sign-in and tenancy | 5-8 |
| Drafts-and-versions store, review and approval | 4-6 |
| Terms, privacy notice and data-processing agreement pages (plus legal advice) | 1-2 |
| Organisation verification (domain email, registers, vouching) | 4-6 |
| Publishing path, lifecycle actions (close, withdraw, reopen, delete) | 6-9 |
| Moderation queue and "Report this job" | 3-5 |
| Retention and deletion jobs | 1-2 |
| Transactional email and the outbox (sign-in, notifications, Reach) | 3-5 |
| Language versions (AI translation and review) | 4-6 |
| Market check (needs crawler data) | 3-5 |
| Payments, packages and Billing | 6-9 |

About 52 to 83 working days, roughly 10 to 16 weeks of stream-two work, interleaved with stream one under the priority rule, so the calendar time is longer.

### B7. Made official
A docs pull request amending growth plan §7 and the ledger (and `AGENTS.md`), replacing employer plan §12's "after launch" and growth plan step 8's place for the employer side, stating B1 to B6.

## Minor points carried from the review
Naming: "model test round 4" (not "round 4", which is the demo's). The badge text "details checked by AidJobs" (employer plan §16 decision 4) reworded so it does not overstate human review. The employer plan's own "§8" citation for admission corrected to §17 Gate 11 and C3 when it is next edited.
