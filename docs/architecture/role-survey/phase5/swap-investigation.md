# Phase 5 — brief-swap investigation (23 November 2026)

Approved package: swap the five structural findability briefs, then rev6 + blind round 6.

## Method

Option A sealed pool: 20 adverts per wave-1a family under `survey-raw-archive/.../stage2/{family}/`. Quartiles from sealed unweighted totals (null `field_realism` excluded). Pass-briefs must stay **bottom or median**. Findability for templates omits organisation name, so a brief needs **G ≥ 5** from {title, description, place, pay, posting, closing, employment}.

## Stuck briefs

| Brief | Source | Type | Sealed total / find | Why G≤4 without org |
| --- | --- | --- | --- | --- |
| PM-B1 | PM13 | domestic_charity | 8 / 1 | closing + fixed-term only |
| CA-B1 | CA10 | domestic_charity | 10 / 1 | closing + fixed-term only |
| CA-B2 | CA06 | ingo | 8 / 2 | place + closing; pay competitive only |
| FN-B1 | FN12 | domestic_charity | 7 / 1 | place + full-time; pay competitive only |
| ML-B2 | ML11 | ingo (fr) | 7 / 1 | place + fixed-term; no pay/close/post |

## Clean swaps found (G ≥ 5, bottom/median, unused, real JD)

| Replace | With | Type | Sealed tot / find | Facts without org |
| --- | --- | --- | --- | --- |
| PM-B1 (PM13) | **PM17** | ingo | 11 / 2 | remote US, $95–110k, full-time |
| ML-B2 (ML11) | **ML17** | donor_government | 13 / 2 | San José, P1 grade, fixed-term ≤28 months, close/post dates |

## Not usable (examples)

- **PM10** (WWF): pay + full-time but **no duty station** (only “relocation none”) → G=4.
- **PM09** (CIPRB): Dhaka + deadline but salary **negotiable** → pay absent → G=4.
- **CA07** (Ground Zero marketing): LPA + repost date but **no place / employment type** → G=4.
- **CA20** (CBF CORE): part-time + USD 18k but **no place / labelled dates** → G=4.
- **CA09** (GiveWell): remote + $225k but **no employment type / close** → G=4.
- **FN17** (Heifer Dhaka): place + deadline but **no pay figure** → G=4.
- **FN03** (CDP London): place + £ pay but sealed total **13 = family p75** → top quarter, out of pass-brief rule.
- **FN07 / CA12**: chrome or about-pages, not usable briefs.
- **FN08**: commercial insurtech, wrong product fit even if facts exist.

**Communications and finance have no clean bottom/median swap in this pool of 20.**

## Recommendation (revised after evidence)

1. **Do the two clean swaps:** PM-B1→PM17, ML-B2→ML17.
2. **For CA-B1, CA-B2, FN-B1**, do **not** invent facts. Choose one:
   - **A (recommended):** Phase 5 scoring note — for **templates only**, count findability’s organisation fact as present (employer name is a publish-time field on AidJobs). Still never invent pay/place/closing. Reals unchanged. Needs an explicit user decision.
   - **B:** Keep those three briefs and accept they cannot clear findability ≥2; report them blocked and pass the other nine when ready.
3. **Same rev6:** ML-B3 must-haves split; FN-B2/FN-B3 forced-choice; readability on PM-B2/CA-B3; then one Grok blind round.

Prefer **1 + 2A + 3**.
