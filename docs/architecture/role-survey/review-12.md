# Review 12: Phase 0 scoring guide v1 (W-54)

**Scope.** Independent read-only review of `docs/architecture/role-survey/scoring-guide.md` (version 1) before dual coding the pilot of 20. Checked against `role-survey.md` section 5 and 19.19, and against `tools/survey/phase0.py` `SCORE_KEYS`. No advert files opened; nothing edited by the reviewer.

**Reviewer.** Grok 4.7 (read-only agent), 15 November 2026.

**Verdict (first pass).** Changes needed. Seven must-fixes (specificity and must-haves partitions; field-realism example vs 0; fairness trust desert; `[email]`/`[phone]` vs template residue; findability “staff”; length needs a `Type:` line).

**Fixes taken.** All seven must-fixes, should-fixes 8, 9, 12 and the sentence-break part of 10, plus the three wording minors, applied to guide v1 before any coding. Packets emit a `Type:` line from `broad-adverts.csv` when known. A re-review of logic was not required: the fixes clarify anchors and presence tests; they do not change the plan’s 0/3 definitions or the weights.

**After fixes.** Guide v1 is cleared for the dual-coded pilot of 20. Calibration after the seal (and the user’s 10-advert session) may still revise anchors into v1.1.
