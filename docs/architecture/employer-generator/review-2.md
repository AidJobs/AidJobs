# Re-review: draft plan version 2, "JD generator in production and a parallel employer stream" (8 November 2026)

Reviewer: the same independent, read-only agent. About 25 minutes. Nothing was changed in any repository, and no production system or AI service was contacted. This review checks version 2 against `PLAN-REVIEW.md` and verifies the new factual claims against the contract, the growth plan, the ledger, the crawler plan, `style_rules.py`, and the style study.

## Verdict: approve with changes

Version 2 resolves 26 of the 28 earlier findings, and partly resolves the other two. It adds no rule breaks.

One new contradiction must be fixed before the plan is recorded. Version 2 builds employer sign-in and the employer's drafts store before Gate 8 merges, yet it says that store uses "the single Organisation of Gate 8, extended". Gate 8 also has no place in the growth plan's order, so "until Gate 8 merges" has no date.

The other new points are should-fix or minor. The fixes are wording and ordering only, so no third review is needed unless the employer build's position in the order changes.

---

## Status of earlier findings

| # | Finding | Status | Reason |
|---|---|---|---|
| M1 | Writer path is not drop-in; amendments unlisted | Resolved | B2 lists §3, §5, run ownership, Gate 11 and C3, §7, §6, §10 with rule 18; publishing moved behind the writer steps; the "§8" citation corrected. |
| M2 | Private beta writes into the public jobs table | Resolved (pending the user's confirmation) | Until the amendments and the writer steps merge, the beta only drafts, reviews and approves, and nothing reaches `jobs`; §13 and Gate 7 are amended if public before launch is wanted. A11 question 5 asks the user to confirm. |
| M3 | Streams overlap in stream one's areas | Partly resolved | The user's decision and B3 keep the employer stream to separate areas, with stream one first. But the Gate 8 dependency is contradictory (N1), and fetch-policy timing is missing (N2). |
| M4 | Scope amendments must merge before any build | Resolved | B2's gate makes each amendment the user's decision, independently reviewed and merged, and updates `AGENTS.md`, the ledger and growth plan §7 together. The missing amendments are added. |
| M5 | Link import needs a §9 decision | Resolved | A6b: verified organisations or caps, one page, HTML and text, a security-boundary pull request of its own, not in the first beta unless approved. Its timing against W-34 is N2. |
| M6 | Organisations and jobs tables conflict with the contract | Partly resolved | B3 item 5 now describes a drafts-and-versions store that is never a catalogue and uses the single Organisation. Building it before Gate 8 is the contradiction in N1. |
| M7 | No prompt-injection or personal-data safeguards | Resolved | A4: browser parsing, a size cap, contact details replaced, uploaded text marked as data, no tools, structured output, the verify step refusing new links, contacts and payment requests, escaped output; A9 and A10 add seeded cases. One detail is N7. |
| M8 | Length bands pad drafts and penalise Restructure | Resolved | Bands are ceilings for Draft mode only, taken from `style_rules.py`, "to test, not settled"; no length check in Restructure or Improve. N3 (a fixed duty count) and N6 (a band citation) remain. |
| S1 | No employer security stage | Resolved | B4 covers sign-in, tenancy, roles, reviewer links, uploads, webhooks, grants, retention, origin isolation, sanitising and a Content Security Policy, each reviewed. Migrations are N9. |
| S2 | Sign-in depends on the domain and email | Resolved | B5 makes the domain and a transactional email provider hard dependencies of sign-in, and third-party sign-in a rule 9 decision. |
| S3 | Hosting limits | Resolved | B5: the paid Render instance from the first beta user, streaming within proxy time limits, asynchronous AI calls with a cap, a load check. |
| S4 | Secrets, caps and the AWS route | Resolved | A9: a separate production IAM user, key only in Render, an in-app cap and kill switch, mantle's terms in writing, region, EU transfers. |
| S5 | Abuse of the generator | Resolved | A5 and A9: off-topic refusal, rate limits, a smaller allowance before email confirmation, a cap on new organisations, a circuit breaker. |
| S6 | Same origin as the admin | Resolved | B4: origin isolation, sanitising including any admin moderation view, a Content Security Policy. |
| S7 | Rewording given content | Resolved | A1 and A3: word for word by default; rewording opt-in per section with before and after; its own line source. |
| S8 | Model and language claims ahead of evidence | Resolved | Models provisional until the Hindi rating; languages only after native review; numbers compared after localisation; whole-session cost, verify accuracy and the fallback writer in model test round 4. |
| S9 | Fallback is English-only and invents duties | Resolved | A4 step 6: only extraction and the outline are ported; fallback lines marked Suggested; no fallback for other languages; a used-up budget keeps §18's behaviour. |
| S10 | EU AI Act and data protection too thin | Resolved | A9: written classification under Annex III 4(a), no AI targeting, labelling with human approval, AidJobs as processor, terms and privacy before the beta, moderation and reporting before any job is visible. |
| S11 | No size estimate | Partly resolved | B6 gives one, but its sum is off and it leaves out several pieces of work (N5). |
| Minor 1 | Part 1 small inaccuracies | Resolved | Chat, start date and sectors corrected. Wording of "verified by the reviewer" is N11. |
| Minor 2 | Admission cited as §8 | Resolved | §17 Gate 11 and C3, in B2 and in "Minor points". |
| Minor 3 | "Round 4" name collision | Resolved | Now "model test round 4". |
| Minor 4 | Facts "never suggested" | Resolved | A1: labelled picks with a stated basis, never inserted unless chosen. |
| Minor 5 | Starter texts claiming practices | Resolved | A1: limited to confirmed practices; A11 question 3. |
| Minor 6 | "Details checked by AidJobs" badge | Resolved | To be reworded (Minor points). |
| Minor 7 | Locked texts not enforced | Resolved | Enforced in the interface and on the server (A1, A6). |
| Minor 8 | Duplicates with crawled jobs | Resolved | B2: a duplicates rule under decision 11. Decision 11 is titled "ReliefWeb", but its text states the one-primary-source principle (growth plan L132), so the citation stands. |
| Minor 9 | Model test spending approval | Resolved | A10's heading: the user approves the budget, sample data only, key in the vault. |

---

## Verification of the new factual claims

- **Domain "currently expired":** consistent with the ledger, W-34 ("the identities point at the expired domain").
- **W-36 and W-37 as the stream-one steps that change the writer and the jobs schema:** correct. W-36 is the observation path in `contracts/persist.py`. W-37 adds new columns and capture in `contracts/upsert.py`, after a production schema check. These are growth plan §7 steps 4.6 and 4.5.
- **Gate 8 as the organisation step:** correct by name (contract L670–672). But it is not a numbered step in growth plan §7. It is only allowed to start after B4 and B5 (growth plan amendment 5, L247; crawler plan L508). Whether its migrations are applied in production is Not verified (growth plan L40, L323). See N1.
- **The fetch policy:** the user's stream-scope decision names the fetch policy, but B3's gate names only W-36, W-37 and Gate 8. Stream one changes the fetch policy in W-34 (step 4.2) and in the Workday POST support (step 6). See N2.
- **The `style_rules.py` bands:** UN agency 700–1,300, INGO role profile 650–1,150 and INGO purpose-led 550–1,000 match (L21, L45, L58). The local NGO bands quoted (field 200–400, officer 350–600) do not: `style_rules.py` has 250–550 overall, 250–400 for field roles and 350–550 for officer roles (L35–40). The quoted figures are group C's suggested targets (L302–309). See N6.
- **The other citations:** §17 Gate 11 (admission), §13 with Gate 7 (which jobs are public), §3 and §5, run ownership (security stage 2), and Annex III 4(a) all check out.

---

## New findings

### Must fix

**N1. The employer build depends on Gate 8, but runs before Gate 8 merges, and Gate 8 has no place in the order.**
- **Evidence.** The user's stream-scope decision keeps the employer stream out of "organisations" until stream one's steps merge. B3 nonetheless builds employer sign-in and the drafts-and-versions store "after the amendments merge (still not touching stream one's areas)". Its design item says that store uses "the single Organisation of Gate 8, extended, not duplicated" (B3 item 5). Extending the organisation model is the area reserved for Gate 8, and sign-in needs organisation membership. Gate 8 is also missing from growth plan §7's numbered steps 4.1 to 4.11. So "until … Gate 8 have merged" (B3) has no date, and the publishing phase could wait indefinitely.
- **Change.** Do both:
  - (a) In the docs pull request that amends §7 (B7), give Gate 8 a place in stream one. A natural slot is after W-37, since both need the verified production schema (contract L672).
  - (b) Make employer sign-in and the drafts store wait for Gate 8. Only the generator module, the security-stage plan, the model test and the amendments come before it.

  If the user wants sign-in earlier, the plan needs a stated interim design that touches no organisation table, and the user must approve that exception to the stream-scope decision.

### Should fix

**N2. Link import's timing against stream one's fetch-policy work.**
- **Evidence.** The user's decision includes "the fetch policy". A6b changes the fetch policy, and stream one changes it in W-34 (step 4.2, a security-boundary pull request) and in the Workday POST support (step 6). B3 doesn't place A6b.
- **Change.** State that A6b comes after W-34 merges and never at the same time as the Workday POST pull request. Or leave it out of the pre-launch scope.

**N3. A fixed "4 to 7 duties, 3 to 5 must-haves" in Draft mode contradicts the format profiles.**
- **Evidence.** A3 applies one duty count to every format. That count comes from group C's local NGO recommendations 6 and 7. A2's own section rules give UN duty bullets "in 4 to 6 groups", and `style_rules.py` gives the UN agency format 3 to 6 groups of 3 to 6 bullets (L24). The user's decision says content follows "the facts and typical role content".
- **Change.** In Draft mode, take the minimum useful depth from each format profile's depth setting (A2), capped by the ceiling, and still ask questions rather than invent. Keep 4 to 7 duties for the local NGO and domestic charity formats.

**N4. B2's all-or-nothing gate holds back the beta and amends rules against code that is about to change.**
- **Evidence.** B2 needs every amendment merged before any build plan, including the publishing ones: §3 and §5, run ownership, Gate 11 and C3, §7, §6, §10 with rule 18, and decision 11. Those amendments have to describe the writer as W-36 and W-37 will leave it.
- **Change.** Split the gate in two:
  - **B2a, before the drafting beta's build:** §2 scope and the advertising wording, rule 9 and §14, §4 and §10 for the drafts store, growth plan 4.6, UX-08 2E, the employer terms and privacy notice, and decision 12's moderation scope as it applies.
  - **B2b, before the publishing build:** the rest, written after W-36, W-37 and Gate 8 merge.

  This keeps every rule, and avoids amending twice.

**N5. The size estimate is low and leaves work out.**
- **Evidence.** B6's parts add up to 31 to 49 working days, which is about 6 to 10 weeks, not 6 to 9. It leaves out work the design requires:
  - organisation verification (own-domain email, registers, vouching; employer plan §18);
  - the moderation queue and its admin view;
  - "Report this job";
  - the employer terms, privacy and refund pages;
  - jobs that enforce retention and deletion;
  - the email outbox;
  - round 5's lifecycle actions and Billing;
  - language versions;
  - the market check, which needs W-37's stored data.

  It also leaves out the independent review cycles and the user's approval turnaround. The demo alone took about 8 to 12 days with no backend (employer plan §12).
- **Change.** Correct the sum. List the missing items, or move them explicitly to "after launch". Say that calendar time depends on approvals under the stream-one-first rule. And name a minimum scope for the beta.

### Minor

- **N6.** Correct the local NGO band citation: either quote `style_rules.py` (250–400 field, 350–550 officer) or cite group C's suggested targets (200–400, 350–600). "INGOs 950–2,400" as a description leaves out World Vision's country posts of about 500 to 900 words (group B L28).
- **N7.** "Contact details … replaced with placeholders before anything is sent to a model" (A4 step 1). Emails, phone numbers and links can be removed by fixed rules before a model call; names can't reliably be. Say that names are flagged after extraction rather than promising removal. Also say how the employer's own application email (if applications by email are amended in) is kept under the 4.6 amendment.
- **N8.** A9's "the standard Bedrock route once AWS lifts the hold" needs the same production checks as mantle (IAM permissions, terms, region), which it doesn't mention.
- **N9.** The employer tables are schema changes. Under contract §15 they need versioned migrations, an independent review (ledger L45), a manual backup first (W-43), application by the user as in security stage 6's design, and grants in `02_grants.sql`. Add this to B3 or B4.
- **N10.** Until the user confirms A11 question 5, the docs pull request (B7) should record the beta reading as unconfirmed, or wait for the answer.
- **N11.** Part 1's heading says "verified in code by the reviewer". The reviewer spot-checked about a dozen claims, not every line; for example, the fixed English templates in "Other text" were not checked. Say "spot-checked by the reviewer".

---

## Good, keep

- The three user decisions are recorded plainly, and the agent's reading of the beta decision is flagged for confirmation rather than assumed.
- B2's amendment list is now complete and correctly cited.
- B4 is a credible outline for an employer security stage.
- A4's pipeline now carries its own safeguards, so the design doesn't depend on the model behaving.
- The stream-one-first rule, the paid Render instance from the first beta user, and the domain and email as dependencies of sign-in.
