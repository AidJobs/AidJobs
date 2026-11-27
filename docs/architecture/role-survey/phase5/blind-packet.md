# Phase 5 blind scoring — packet index (wave 1a)

Scorer and forced-choice ranker: Cursor read-only agents from a model family other than the hand writer (Composer). Recommended: Grok 4.7, as Stage 3b.

Guide: `docs/architecture/role-survey/scoring-guide.md` (v1.1) for the scorer only. Forced-choice ranker never sees the guide.

**Template organisation fact (user, 23 November 2026):** for templates only, count findability’s organisation fact as present — see `scoring-note-template-org.md`. Reals unchanged.

Pass rule (every brief): total at or above family Option A p75 (see `tools/survey/raw/ai-test-set/phase5-briefs/selection.json` thresholds) and no dimension below family median; plus forced-choice top half (rank ≤3 of 6).

Hand assemblies: `phase5/hand-assemblies/{brief_id}.md` (current revision **10**).
Swaps in rev6: PM-B1 source **PM17**; ML-B2 source **ML17**. Change lists: `rev7-change-list.md`, `rev8-change-list.md`, `rev9-change-list.md`, `rev10-change-list.md`. Real comparison adverts: prepared locally for the scorer from archive pretags in plain layout (never committed). The blind packets on disk are still the revision 9 text that was scored. Do not run `assemble_rev9.py`: it would copy revision 10 into those packets and leave the pass mark in the header.

Round 1: 1/12 score-pass (CA-B3 only), 0/12 both — `validation-round1.csv`.
Round 2: 0/12 both — `validation-round2.csv`.
Round 3: 0/12 both — `validation-round3.csv`.
Round 4: **1/12 both** (ML-B1) — `validation-round4.csv`.
Round 5: **2/12 both** (ML-B1, PM-B3) — `validation-round5.csv`.
Round 6: **3/12 both** (ML-B1, ML-B2, FN-B3) — `validation-round6.csv` (first sealed FC restored after a duplicate overwrite).
Round 7: **3/12 both** (PM-B1, PM-B3, ML-B2) — `validation-round7.csv`.
Round 8: **6/12 both** (PM-B1, PM-B2, ML-B1, ML-B3, CA-B2, FN-B3) — `validation-round8.csv`, `forced-choice-round8.md` (FC↔CSV 0 mismatches).
Round 9: **8/12 both** (`PM-B1`, `PM-B2`, `ML-B1`, `ML-B2`, `ML-B3`, `CA-B2`, `FN-B2`, `FN-B3`) — `validation-round9.csv`, `forced-choice-round9.md` (0 score mismatches, 0 FC mismatches). **11/12 pass full rubric score** (only `CA-B1` blocked on `decision_facts` 0). Score-only FC fails: `PM-B3` (rank 4, directly behind `PM15` + `PM-B2` + `PM-B1`), `FN-B1` (rank 4, directly behind `FN02` + `FN-B2` + `FN-B3`), and `CA-B3` (rank 5). Note: in a 6-item packet with 3 templates and 1 top-quartile real advert at rank 1, at least one template is mathematically forced to rank ≥4 even when all 3 templates beat the mid and bottom real adverts.

Independent review, 27 November 2026, Claude Opus 5.5 via OpenRouter: **Fix-before-PR** (`independent-td-review.md`). Round 9’s 8/12 both and 11/12 rubric figures must not be cited as the result. The packets showed the pass mark, and one model family scored every round. Revision 10 corrects the factual errors named in that review and has not been re-scored. CA-B1 stays blocked on decision facts.

Label on all templates: based on evidence, not yet tested with hiring managers.
