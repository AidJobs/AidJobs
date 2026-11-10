# Independent review: role-content survey plan (W-54), 10 November 2026

*Read-only agent in an isolated clone of `docs/role-survey-plan` at `fa984cd` (the first draft), with no network access, before the user saw the plan. Kept as written; how each finding was taken is at the end.*

## Verdict
**Changes needed.** The plan covers every part of the user's brief and records the user's decisions faithfully. It keeps "never blocks publishing" and leaves the decision on required details open. Almost every count I re-made from the CSV files matches. Five points must change first:
- It names a contact cleaner that does not exist.
- It would commit job titles from employers' pages without the decision this needs.
- Its "beat the best quarter" test, as designed, favours the templates.
- Part of the scoring guide depends on Phase 3 findings, so the guide is not truly fixed before any advert is read.
- It calls its level mapping "AidJobs' convention" when that contradicts the site's own levels.

All of these are text fixes; none needs a new plan.

## Must fix

**M1. The cleaner it cites does not exist.**
- Evidence: `role-survey.md` §3 says contact details are removed "with the crawler's own cleaner (`contracts/captured.py`)". `apps/backend/contracts/` has no such file (18 modules, none called `captured`). Capturing descriptions with contacts removed is W-37 pull request 2, which is not built yet (ledger, line 639).
- Change: "Contact details are removed before coding by the survey's own step in `tools/survey/` (with tests), or by W-37's cleaner once that is merged." Remove the file name.

**M2. Committing job titles conflicts with the employer survey's privacy rules, and no decision is named.**
- Evidence: the privacy rule says "No page content from employers' sites is committed" (`source-survey.md`, line 265). Step F recorded "hosts and paths only; no page content" (lines 205 and 212). The user's brief says "count job titles only". Even so, `role-titles.csv` commits each title with the organisation's id (§12), and §6 asserts "titles are short facts, not advert text". Reading step F's saved responses for a new purpose (batch P1-0) is also not named as a decision.
- Change, one of:
  - (a) Commit only counts per organisation for each function, sector, level and context, plus a list of title variants pooled across organisations (no organisation id, each variant seen at least twice). Raw titles stay in `tools/survey/raw/roles/`.
  - (b) Add a decision to §15 and to the ledger row: "Amend the employer survey's privacy rule so that job titles (not advert text) may be committed, and allow step F's saved responses to be reread for titles."

  Option (a) is recommended.

**M3. "Beat the best quarter" is not well defined, and the test favours the templates.**
- Evidence (§5 and §10):
  - **The target never applies as written.** The target needs at least 8 scored adverts per cell, but Phase 2 samples "about 3 … up to 5" per cell (§7), so the fallback always applies. "No dimension below the cell's median" is then judged on 3 to 5 adverts.
  - **The briefs favour the templates.** The agent writes the three "standard briefs". The briefs supply the facts that about half of the 100 weight points depend on: decision facts 20, field realism 10, the trust part of fairness, findability 5. A template output scores well because the brief is complete, not because the template is good.
  - **Unlike things are compared.** Real adverts carry 35 to 60% standard text (employer plan, line 455). Template outputs do not, which favours templates on the length and readability scores.
  - **The scorer is not independent enough.** The same agent scores with the guide and then makes the forced choice, and an AI scorer may prefer AI-written text.
- Change:
  - Set the target per family, pooled across organisation types (about 30 adverts). Define it as the 75th-percentile total, stating n. Say whether a template must pass on all three briefs.
  - Build each brief only from facts a real median or bottom-quarter advert states. Compare the template's output with that original and with the family's top quarter.
  - Remove standard text from both sides before scoring.
  - Use a separate forced-choice agent that never sees the guide, and a scorer from a different model family than the writer (Kimi K2.5).

**M4. Part of the scoring guide depends on Phase 3's findings.**
- Evidence: Specificity's top score requires "the role's signature facts present" (§5 table). Signature facts are only found in Phase 3, by comparing the top and bottom quarters by score (§8). So the guide is not complete before reading, and the top quarter is partly defined by the facts it is used to find.
- Change: score specificity from the unit-level specifics only (number, place, standard, tool, frequency, counterpart, scale). For the signature-fact analysis, rank adverts by total score without the specificity dimension.

**M5. "AidJobs' convention" for UN grades contradicts the site's own levels.**
- Evidence: §6 maps NO-B with P-1 and P-2 to officer, NO-C with P-3 and P-4 to coordinator or manager, and P-5 to head. The public site's levels in `apps/frontend/lib/site/facts.ts` (lines 12 to 21) are different: Entry (P-1, P-2, NO-A), Mid-career (P-3, NO-B, NO-C), Senior (P-4, P-5), Leadership (D), Support staff (G). §6 also says the role map feeds W-42's fixed lists, so two level vocabularies would follow.
- Change: keep the brief's four levels, drop "AidJobs' convention", and record the plan's mapping as the agent's proposal. Add a crosswalk to `facts.ts`'s levels and name W-42 as where the two are reconciled.

## Should fix

**S1. Using mirrors after a refusal is in tension with "never bypassed".**
- Evidence: growth plan §4.2 (line 166), the survey's privacy rule (line 266) and the plan's own §3 say a refusal is never bypassed. Yet "UN pages that refuse use a mirror" (§7). The user's brief allows mirrors.
- Change: record mirrors as the user's explicit exception, and limit it: never where `robots.txt` forbids the official page; only for a page refused once to the honest identity; each mirror's terms checked first. Note that mirrors are job boards, and `untalent.org` is one of the eight covered by the decision of 4 November 2026, so it is out. Reword decision 8 to match.

**S2. Phase 1's job links will not supply Phase 2's sample for several organisation types.**
- Evidence: step F's 46 confirmed listings are mostly plain listing pages and public job feeds from Workable, Greenhouse and similar systems. 61 sites need JavaScript, and Workday's 20 employers cannot be listed without a POST. Donors and government, contractors, banks, UN agencies and Red Cross bodies will have few links, if any. Only national NGOs are named as a gap.
- Change: after Phase 1, add a table per organisation type showing which job links are available, with named fallbacks. One fallback: job pages found through search results only, then read with a single GET (for example a Workday job page, which needs no POST).

**S3. The agreement target is too lenient.**
- Evidence: "80% within one point" on a 0 to 3 scale. Random scores agree within one point 62.5% of the time.
- Change: require exact agreement of at least 70% and a weighted kappa of at least 0.6 per dimension (Phases 0 and 3). Use two coders from different model families. Optionally, the user scores 10 adverts (about 30 minutes) as the only human check.

**S4. The yield from sharing visits with step F is overstated.**
- Evidence: "adds up to 683 organisations". Batch 1 gave readable titles for 46 of 231 organisations (20%), so batch 2 would give about 135. Batch 2 holds 54 Belgian and French organisations (35 BE, 19 FR), 25 of them DG ECHO partners; "many" should be that number.
- Change: state "about 135 organisations (Estimate, from batch 1's rate), about 54 of them Belgian or French".

**S5. The wave 1a estimate is low.**
- Evidence: the 3 families can only be chosen after Phase 1 runs in full (5 to 8 days), plus Phase 0 (2 to 3) and records. Phases 2 to 5 pro rata for 3 of 11 families add about 9 to 13 days. That totals roughly 18 to 27 days, not 15 to 20.
- Change: re-estimate, and say whether wave 1a waits for Phase 1's second snapshot.

**S6. The fixed reason list misses common sector cases.**
- Evidence (employer plan §20.2): international posts closed to nationals of the duty station (the reverse of reason 2); programme eligibility rules with age or nationality limits (for example JPO and YPP; Unverified); nationality limits for security reasons. "Right to work" is listed under reason 3, but a right-to-work statement should not be flagged as a nationality restriction at all.
- Change: add "6. the eligibility rule of a named programme, or the organisation's staff rules (for example international posts not open to nationals of the duty station)", marked for the user's decision because it goes beyond the user's examples. Move right-to-work statements under "Never flagged".

**S7. The description of the demo's INCLUSIVE rules is inaccurate.**
- Evidence: §20.2 says the rules "detect no explicit restriction". In `engine.ts` around line 1000, the `physical` rule matches "able-bodied", an explicit disability restriction, and also "valid driving licence", often a genuine requirement; the `native` rule ("native speaker", "mother tongue") is about origin.
- Change: say where each of the 8 rules goes in production: able-bodied moves to the fairness check (disability); a driving licence is not flagged; native moves to the fairness check or stays a quiet word; years becomes an inflation prompt; acronym becomes a readability point; the masculine, pronoun, gendered-title and age-coded words stay quiet.

**S8. The record of when the 13 role families were written is inaccurate.**
- Evidence: `ROLE_FAMILIES` first appears in commit `ed0d453` ("round 2, the Create a job page", 3 November 2026) with 12 families. "ESG and Safeguards Specialist" was added in `0344882` on 9 November 2026. All three files say "round 1 on 3 November 2026".
- Change, in `role-survey.md` §1, employer plan §20.1 and ledger W-54: "12 written by the agent in round 2 on 3 November 2026; the 13th (ESG and Safeguards Specialist) added on 9 November 2026". The user's decision stands.

**S9. Running W-54 alongside the current work is not recorded where a new chat looks.**
- Evidence: the ledger's "How to resume" item 1 (line 27) lists the exceptions to the order of work (security stage 4, the employer survey). W-54 is not there, and §16 says the plan "does not change … the order of work".
- Change: add "W-54 runs alongside as background research (the user, 10 November 2026)" to that line, and reword §16 to match.

**S10. Whether crawled descriptions may be used is inconsistent.**
- Evidence: §7 uses ICRC's and Oxfam GB's stored descriptions in wave 1. §13 says whether crawled descriptions may be used for this analysis "is a decision for then" (later waves). Decision 4 covers "descriptions once W-37's capture is merged".
- Change: make decision 4 explicitly cover using them for analysis under growth plan decision 5's attribution rule, or leave them out of wave 1.

**S11. "Rebuilt by CI from committed inputs" overstates what CI can do.**
- Evidence (§3, §12): `units.csv`, the scores in `adverts.csv` and `template-lines.csv` are coded by agents. They are not built by a script from committed files, and the raw pages are git-ignored.
- Change: list which files are built by script and which are coded. For the coded files, say what CI checks: the schema, allowed values, labels present, no email or phone number, quotes under 15 words marked *(std)*, paraphrases of 12 words or fewer. Run the 8-word overlap check on `template-lines.csv` too, with *(std)* quotes exempt.

**S12. Crawl-delay handling is wrongly attributed to step F.**
- Evidence: §6 says "Pacing is step F's: … a `Crawl-delay` up to 60 seconds honoured". `confirm.py` has no Crawl-delay handling; only `contracts/robots.py` has `crawl_delay` (tested in `test_crawler_politeness.py`, lines 417 to 423).
- Change: "`roles.py` honours `Crawl-delay` with `contracts.robots.crawl_delay` (new for the survey)".

**S13. The request ceiling is not a ceiling.**
- Evidence: P1-1 covers 53 organisations, each with a `robots.txt` and up to 3 listing pages, so up to 212 requests, not "about 130". So "about 210 requests at most" is wrong.
- Change: give each batch a hard cap (for example, at most 1 extra listing page per organisation) and state the true maximum.

## Minor

- **N1.** "as `step-d-decisions.csv`": that file's columns are `action,a,b,reason`, with no `label` column. Say "like".
- **N2.** Two batches are both called P1-0. Rename them P1-0a and P1-0b.
- **N3.** The length dimension mixes whole-advert bands for local NGOs (style study group C, lines 307 to 308) with "role-specific words". The bands are "to test, not settled" (`plan-draft-v3.md`, line 38). Say so in the guide.
- **N4.** §20.3 option (a), "as sending is never blocked today (sections 14 and 15)": section 15 item 1.5 is about the chat's Send button, not publishing. Reword.
- **N5.** Define these on first use in `role-survey.md`: R&R, MEAL, GBV, WASH, ESG, INEE, IASC, CIPS, CIPD, ACCA, PSEA.
- **N6.** BRAC and Amref are given as national NGOs, but `organisations.csv` classes BRAC (Bangladesh) and Amref's head office (Kenya) as "International NGO". Change the examples or mark them.
- **N7.** The weights for "value to paying employers" are not stated. Give the proposed numbers.
- **N8.** Ledger W-54 says "reviewed independently". Add the verdict and what was taken once known.
- **N9.** Branch `origin/docs/w52-w53-records` also edits the ledger. Expect a conflict; rebase before the merge.
- **N10.** Titles taken from a plain page's link text can be "Apply now" or "Read more". Filter them.

## Verified
- **Organisations by country** (`organisations.csv`): Belgium 606, France 240, Kenya 74 (the largest Southern country). The order US, UK, Belgium, Netherlands, Germany, France, Canada, Australia is correct.
- **First wave** (`first-wave.csv`): 914 rows, 37 Belgian and 28 French organisations. Groups: 395 NGO, INGO, consultancy or foundation; 29 agencies; 28 banks and bodies. Batch 2 has 683. There are 38 `first-wave-hq` decisions, and 40 UN-system organisations plus 44 Secretariat offices are in the later wave.
- **Step F** (`step-f-confirmed.csv`): 231 rows; 46 confirmed with 805 job links; 17 public feeds (Workable 7, Greenhouse 6, Teamtailor 2, Personio 1, Lever 1); 29 plain listing pages; 61 need JavaScript; 17 blocked; 9 refused `robots.txt`; 7 allowed on the recheck. Workday has 20 organisations and 1,225 UNjobs jobs, the largest system. 191 saved bodies fits 193 pages minus the 2 deleted.
- **Demo:** the 13 `ROLE_FAMILIES` titles match the list in §1 exactly.
- **Shared code and settings:** `SURVEY_USER_AGENT` is "AidJobsSurvey/0.1 (+mailto:aidjobz@gmail.com)" (`outbound.py`, line 50); step F's pacing in `confirm.py`: 5 seconds between requests, 10 per host, and the stop rule of 3, 5 and 5; the robots check uses `contracts/robots.py`; `/tools/survey/raw/` is git-ignored, and CI has step D, E and F jobs.
- **Database:** the six `compensation_*` columns are at `supabase.sql` lines 340 to 345. `salary_range_text` exists only in production and old scripts, and both are empty (ledger, line 629, 8 November 2026). 690 jobs as of 9 November 2026.
- **Contract:** §9's Workday POST is limited to the crawler's Workday reader. §5 says do not invent columns, and §15 requires the production schema to be verified first.
- **Other sources:** growth plan §4.5 includes `baseSalary` when known; "UN Talent is a benchmark only" is in decision 11's details; the eight job boards and the decision of 4 November 2026 (`source-survey.md`, line 125) are cited correctly; Castilla and Rho 2023 (about 296,000 postings) is in group C §2.4; the style study's outcome-statement ranking and the inflation examples are cited correctly; the length bands match `plan-draft-v3.md`; the user's view that "the UN hardly pays" dates from 5 November 2026 (`source-survey.md`, line 167).
- **Brief coverage:** every item of the brief is covered: decisions 1 to 5, Phases 0 to 5, English and French, the waves, the rules, the known limits, the pace, and all three deliverables.

## Good, keep
- Every outside framework and law is labelled Unverified. §20.2 never calls a requirement legal or illegal and says it is not legal advice.
- The decision on required details is kept open with both options fairly stated, and "not disclosed" counts as an answer.
- The job-board decision of 4 November 2026 is kept, with any new boards only proposed after their terms are read (batch P1-4).
- The Workday limit under the contract is respected, and the resulting under-count is reported as a bias.
- The library is designed as a function core plus sector modules and level and context variants, rather than hundreds of templates.
- A forced-choice holistic measure guards against "teaching to the test" (strengthen it per M3).
- The 8-word overlap check, the 12-word paraphrase limit and the CI test for emails and phone numbers are concrete copy and privacy safeguards.
- The limit of having no practitioners is stated plainly, with the label "based on evidence, not yet tested with hiring managers".
- §20.4's schema handling: the misleading US-dollar column names are flagged, and reuse, rename or add is deferred to that step's plan under contract §5 and §15, with a backup first (W-43).
- Wave 1a as a pilot is the right way to manage the effort risk.

## How the findings were taken (the author, 10 November 2026)

All taken. The author checked M1 (`contracts/captured.py` is on W-37's branch only), M5 (`facts.ts`), S4 (35 Belgian and 19 French organisations in batch 2, 25 of them DG ECHO partners), S8 (`git log -S` on `demo/employer`) and S12 (`confirm.py` has no `Crawl-delay` handling) before changing the text.

- **M1:** the survey's own cleaning step in `tools/survey/`, or W-37's cleaner once merged; no file named.
- **M2:** option (a): `role-counts.csv` (counts, no titles) and `title-variants.csv` (pooled, seen at two or more organisations, none named); raw titles local; decisions committed with a title only when it is pooled. Option (b) and the rereading of step F's responses are decision 3.
- **M3:** the target pooled per family with its n; pass on every brief; briefs built from a median or bottom-quarter advert's facts, compared with it and with the top quarter; standard text removed from both sides; a separate forced-choice agent without the guide; no scorer of the writer's model family.
- **M4:** specificity from unit specifics only; the top and bottom quarters ranked without it.
- **M5:** the four levels kept; the grade reading is the agent's proposal, aligned where it can be with `facts.ts`; each row records the site's level; W-42 reconciles them.
- **S1:** the user's exception, narrowed; `untalent.org` out; other mirrors only after their terms (batch P1-4); decision 6.
- **S2:** a table per organisation type after Phase 1, with fallbacks (search results, then one GET; stored descriptions; mirrors); shortfalls recorded as gaps.
- **S3:** 70% exact agreement and a weighted kappa of 0.6; coders of different model families; the user's optional 10 adverts (decision 2).
- **S4:** about 135 organisations (Estimate), with the Belgian and French counts.
- **S5:** wave 1a re-estimated at 18 to 27 days; it is chosen from the first snapshot and does not wait for the second.
- **S6:** right-to-work statements never flagged; a sixth reason proposed for the user's decision (decision 12).
- **S7:** each of the eight demo rules placed in production.
- **S8:** corrected in all three files.
- **S9:** recorded in the ledger's "How to resume", item 1; section 16 reworded.
- **S10:** decision 5 covers stored descriptions for analysis under growth plan decision 5; section 13 refers to it.
- **S11:** the output table marks script and coded files; CI's form checks listed; the overlap check covers template lines.
- **S12:** `Crawl-delay` through `contracts.robots.crawl_delay`, new for the survey.
- **S13:** hard caps per batch; at most 237 requests in Phase 1.
- **N1 to N10:** taken (N9: the records branch exists only locally and is not pushed; the branch is rebased on `main` before the merge if it moves).
