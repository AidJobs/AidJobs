# Phase 5 — structural findability gaps (rev 5)

Recorded 23 November 2026 while building assembly revision 5.

## Rule reminder

Findability needs `G` (count of eight facts) at least 5 for score 2 when the title has a function. Organisation name is omitted by design (type only). Without inventing facts, max `G` is therefore 7.

Family dim medians all require findability ≥ 2.

## Briefs that can reach G ≥ 5 from source facts (org omitted)

| Brief | Facts available after rev-5 brief updates |
| --- | --- |
| ML-B1 | title, description, place, employment, salary, closing (+ time/tz for DF) |
| ML-B3 | title, description, place, employment, salary, posting date |
| PM-B2 | title, description, place, salary, staff position/contract |
| PM-B3 | title, description, place, salary, posting, employment |
| FN-B2 | title, description, place, employment, closing (2025-09-19 from source) |
| FN-B3 | title, description, place, salary, posting, closing, consultant |
| CA-B3 | title, description, place, salary (grade), closing, employment |
| ML-B1 already passed round 4 |

## Briefs stuck at G ≤ 4 without inventing (org omitted)

| Brief | Present without inventing | Missing for G≥5 |
| --- | --- | --- |
| PM-B1 | title, description, closing, fixed-term | place, pay, posting (source has none usable) |
| CA-B1 | title, description, closing, fixed-term | place, pay, posting |
| CA-B2 | title, description, place, full-time | closing, posting; pay is “competitive” only (does not count) |
| FN-B1 | title, description, place (office/remote from source), full-time | closing, posting; pay competitive only |
| ML-B2 | title, description, place, fixed-term | pay, closing, posting (source has ASAP start only) |

## Recommendation

1. Finish rev-5 assemblies and blind round 5 for all 12.
2. If the five stuck briefs still fail only (or mainly) on findability, do **not** invent facts. Prefer one of:
   - **Swap** those pass-briefs for other Option A bottom/median briefs that already carry place+pay or posting+closing (needs a short plan approval), or
   - **Contract call:** when scoring templates, treat organisation as present once the employer name is a publish-time field (product truth for AidJobs), so thin briefs can still clear G≥5 on the other facts — needs an explicit user decision, because it changes the blind comparison with reals.

Do not name the real employer in assemblies unless the user reverses the type-only rule.
