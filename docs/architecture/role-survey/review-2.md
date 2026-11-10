# Re-review: role-content survey plan (W-54), 10 November 2026

*The same read-only reviewer, in the same isolated clone, at `2d4fbc0` (the plan after the first review's fixes), with no network access. Kept as written; how its findings were taken is at the end.*

## Verdict
**Approve with changes.** All 28 earlier findings are resolved as the author's note at the end of `review-1.md` says. The employer plan's section 20 now matches `engine.ts` on `origin/demo/employer` (all eight INCLUSIVE rules are placed, and the `physical` rule's wording is quoted correctly). Cross-references between numbered sections and decisions are correct, and the ledger row covers all 12 decisions in section 15. Five small new problems remain, all text fixes. The only one of substance is R2: removing standard text before scoring would leave two of the nine scoring dimensions unmeasurable.

## Status of earlier findings
- **M1** Resolved: the survey uses its own cleaning step in `tools/survey/`, or W-37's cleaner once merged; no file is named.
- **M2** Resolved: titles are committed only as counts (`role-counts.csv`) and as variants seen at two or more organisations (`title-variants.csv`). Rereading step F's responses and amending the privacy rule are decision 3.
- **M3** Resolved: the target is pooled per family and stated with its number of adverts; a template must pass on every brief, and briefs are built from a median or bottom-quarter advert's facts; a separate forced-choice agent never sees the guide, and no scorer is of the writer's model family. The standard-text removal it added causes R2.
- **M4** Resolved: specificity is scored from unit specifics only, and the top and bottom quarters are ranked without that dimension.
- **M5** Resolved: the grade reading is the agent's proposal, close to `facts.ts`; each row records the site's level, and W-42 reconciles the two.
- **S1** Resolved: the mirror exception is narrowed, `untalent.org` is out, and other mirrors are used only after their terms are read (decision 6).
- **S2** Resolved: a table of available links per organisation type, with fallbacks, after Phase 1.
- **S3** Resolved: 70% exact agreement and a weighted kappa of 0.6, coders from different model families, and the user's optional scoring of 10 adverts.
- **S4** Resolved: about 135 organisations, and 54 Belgian and French organisations (35 and 19, 25 of them DG ECHO partners).
- **S5** Partly: re-estimated and the dependency on the first snapshot stated, but the lower bound is off by one (R3).
- **S6** Resolved: right-to-work statements are never flagged, and a sixth reason is proposed as decision 12.
- **S7** Resolved: each of the eight demo rules is placed in production and matches `engine.ts`.
- **S8** Resolved: corrected in `role-survey.md` §1, employer plan §20.1 and ledger W-54.
- **S9** Resolved: the ledger's "How to resume", item 1 (line 27), and §16 are updated.
- **S10** Resolved: decision 5 covers stored descriptions, and §7 and §13 point to it.
- **S11** Resolved: the output table marks which files a script builds and which agents code; CI's form checks are listed, and the overlap check covers template lines.
- **S12** Resolved: `Crawl-delay` is honoured through `contracts.robots.crawl_delay`, new for the survey.
- **S13** Partly: there are now hard caps per batch, but the stated total is wrong (R1).
- **N1** Resolved ("like `step-d-decisions.csv`").
- **N2** Resolved (P1-0a and P1-0b).
- **N3** Resolved: the bands are marked "to test, not settled", and the citation `plan-draft-v3.md` A2 is correct (A2 starts at line 35; the length text is at line 38).
- **N4** Resolved: §20.3 now compares option (a) with the fairness check's open check.
- **N5** Resolved: abbreviations are defined at the top.
- **N6** Resolved: BRAC and Amref are no longer counted as national NGOs.
- **N7** Resolved: weights of 1 and 0.5, as decision 9.
- **N8** Resolved: the ledger and the status line record the verdict.
- **N9** Resolved as noted by the author; I cannot check whether the branch exists on GitHub from the clone.
- **N10** Resolved: a fixed list drops link texts such as "Apply now".

## New findings

**R1. The Phase 1 request total does not add up.**
- Evidence: §6's caps are P1-1 159 (53 × 3), P1-2 26, P1-3 "2, then at most 40" (42) and P1-4 12. That sums to 159 + 26 + 42 + 12 = **239**, but the text says "At most 237 requests".
- Change: "At most 239 requests", or lower one cap so the total is 237.

**R2. Removing standard text before scoring contradicts two of the nine dimensions.**
- Evidence: §5 says standard text (commitments, legal and organisation boilerplate) is removed from real adverts and template outputs "before scoring". But fairness scores concrete inclusion and trust signals (the no-fee notice, adjustments offered), which sit in exactly those standard sections (§7's section types include "equal opportunity and inclusion" and "no-fee and fraud notice"); and right length scores "boilerplate over half the advert" and "boilerplate at or below the type's norm", which cannot be measured once boilerplate is removed. As written, every advert's Phase 2 scores would also be taken on stripped text.
- Change: "Standard text is removed only for the readability and length-of-role-content measures and for the blind Phase 5 layout. Decision facts and fairness (trust and inclusion) are scored from the full advert. The boilerplate share is taken from Phase 2's `standard share` measure, not from the stripped text." Make §10's "with standard text removed (section 5)" match.

**R3. The wave 1a lower bound is off by one.**
- Evidence: §13's parts are 2–3 + 5–8 + 9–13 + 1–3, which gives **17 to 27** days; the text says 18 to 27.
- Change: "about 17 to 27 days".

**R4. The P1-4 cap only allows one mirror.**
- Evidence: P1-4 reads the terms and `robots.txt` of up to 5 boards "and of the UN mirrors" (plural), capped at 12. That is 2 requests per site, so only 6 sites, meaning one mirror.
- Change: "up to 5 national boards and 1 UN mirror (`unzhaopin.com`)", or raise the cap to 2 per site.

**R5. The ledger row attributes a decision to section 15 that section 15 does not hold.**
- Evidence: ledger line 746 lists "whether an unanswered required detail blocks publishing" and cites `role-survey.md` section 15. Section 15 has 12 decisions, and only decision 12 is for later (the sixth fairness reason); the required-details decision lives in employer plan §20.3.
- Change: add to §15 "13. For later (`employer-side-plan.md`, section 20.3): whether an unanswered required detail blocks publishing", or have the ledger row cite §20.3 for it.

## Good, keep
- The validation design now tests the template rather than its brief: briefs come from real median and bottom-quarter adverts, and the extra run with signature-fact answers is reported but never used to pass.
- The mirror exception is explicit, narrow, and tied both to "never bypassed" and to the decision of 4 November 2026.
- The per-type table of available links, where a type that falls short is recorded as a gap rather than filled from elsewhere, makes the sampling bias visible.
- Placing each INCLUSIVE rule individually in production, including no longer highlighting the driving-licence wording, is accurate and sensible.
- The effort table still totals 49 to 73 days, and wave 1a's dependency on the first snapshot is stated.

## How the findings were taken (the author, 10 November 2026)

All five taken: R1, "at most 239 requests (159, 26, 42 and 12)"; R2, standard text set aside only for readability, the length of role content and Phase 5's blind layout, with decision facts and fairness scored from the full advert and the boilerplate share from Phase 2's measure (sections 5 and 10); R3, "about 17 to 27 days"; R4, one UN mirror, `unzhaopin.com`, with 2 requests for each of the 6 sites; R5, decision 13 added to section 15. Text fixes only, so no further review.
