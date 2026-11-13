# W-54: review of the validation sample's tools (`validation.py`), 13 November 2026

Reviewer: a separate read-only agent (Grok 4.7, a model family different from both coders') on `w54/broad-validation` at `80d8eac`, about 20 minutes, no network request, before the code was used on the sample. A first attempt on Gemini 4 Hydrogen did not start (the model was not available on the account) and reviewed nothing. The reviewer ran `test_validation.py` and `test_adverts.py` (104 passed). It also ran the draw in memory on `broad-adverts.csv` to check its rules (100 adverts, 20 French, at most 2 per organisation, every system of 50 or more represented, the same ids on a second run). That read only the stratification columns; nothing was saved, and no advert text was opened.

## Verdict: approve with changes

No must-fix, so no second round (review-10) is needed. The reviewer confirmed these points.
- The split of `measure()` keeps writing the AI test set and `measured.jsonl` from `measure()`.
- Packets and their index carry only the neutral id, the batch and the line count, never the advert id.
- Section types are compared as presence per advert. `preamble` and `unclassified` are not measures, and `other_standard` is never produced by the script.
- A fact counts only when it is `given`.
- On the committed rows, `family_id` is always the function, or the function and sector, with `unplaced`.
- Kappa formats such as `-1.000` and `1.000` pass the form check.

## Should-fix

1. **The draw could crash moving places to a system's floor** when no other cell could give one up. Fixed: the transfer stops, and the draw's own check reports the short system. Tested.
2. **The organisation cap could leave a system of 50 or more under its floor.** The places then went to other cells, and the shortfall step still returned 100. Fixed: the draw stops with the systems named. Tested on a system whose organisations were already capped elsewhere. The test of passing places on now checks a full, rule-keeping draw with one organisation capped at 3.
3. **A frozen draw was never checked again** before packets or scoring. Fixed: every use of the draw refuses it if any of these fail:
   - its seed;
   - the hash of `broad-adverts.csv` it was drawn from;
   - its neutral ids;
   - every rule of the draw, including that no advert of the AI test set was drawn.
   Tested on a changed source file and on an edited draw.
4. **Reconciled items were sealed without the guide's form,** so a years pair could break it. Fixed: each reconciled advert is checked item by item, the years pair included, before anything is sealed. Tested.
5. **The CI check passed with no results file, and did not recompute results.** Fixed: a missing file fails. Each result must be what its counts and shares give under the same rules. Shares are judged as committed, at three decimals, so the recomputation is exact. Tested.
6. **The guide and the script read several years' figures differently.** The guide takes the largest essential figure, while `years_asked` takes the smallest of all it finds. Taken in its aim, not by its suggested fix: the user ruled out changing the script's rules in this step, and the guide must record what the advert asks. Instead, the error patterns of 19.16 separate years errors that come from this aggregation (the reconciled figure is among the advert's figures) from extraction misses.
7. **The guide put a junior "Adviser" at officer level from the advert's text,** while the rules read only the title. Fixed in guide version 1 before any coding: a title with "Adviser" is `head_adviser` unless the title itself says otherwise. Level is judged from the title first, then a grade, then the text, as the guide says.

## Minor

1. **A JSON `true` was accepted as heading line 1.** Fixed: booleans are refused. Tested.
2. **The guide did not name three labels a packet can carry:** applicant location, location type and estimated pay. Fixed: the guide names every label and the fact each gives.
3. **The family test used no sector.** Fixed: a test with a sector, which a `family_of` that ignored the sector would fail.

All points taken; 126 tests pass, and ruff is clean.
