# Independent review: role-library amendment (W-54), 10 November 2026

*Read-only agent in an isolated clone of `docs/role-library` at `7ba24cd` (the amendment's first draft), with no network access. Its findings are summarised here; how each was taken is at the end.*

## Verdict

**Approve with changes.** Every point of the user's amendment is present and none is weakened; the effort arithmetic, the decision numbering and the move of section 16 are correct. Four things needed fixing: the sample sizes did not support variants by organisation type as written; the held-out test set was contradicted by two sentences that still fed all 116 adverts on disk into Phases 2 and 3; Phase 5's calls to OpenRouter conflicted with section 3's GET-only rule; and two of the library's parts had no committed source. Several of the author's own choices were written as settled.

## Must fix

- **M1.** Wave 1 reads about 3 adverts per family and organisation type, yet variants needed 5 and best-quarter figures 8. State the pooling (structure and length per type across families; role content per family across types), one threshold throughout, and that most wave-1 variants will be thin; show the thresholds as the agent's choice.
- **M2.** The test set is "not used as evidence", but sections 7 and 17 still took "the 116 adverts on disk". Say "less the AI test set", and add a held-out flag to `adverts.csv` so `library.py` and CI exclude them reproducibly.
- **M3.** Section 3 allows only GET or HEAD through the fetch policy; OpenRouter's chat API is a POST. Add the model round as the survey's one exception, outside the fetch policy, approved per round, sending no fetched page and no advert text.
- **M4.** No committed file held the words that tell similar roles apart or French search terms; `title-variants.csv` was missing from the library's inputs; `signature-facts.csv` had no level and no section fed; the source of the signature-fact questions overlapped with `template-lines.csv`.

## Should fix

- **S1.** List the agent's choices within the amendment (the thresholds, one JSON per family, the version rule and schema review, the schema check without a dependency, about 3 formats per family, French references only where the format is used in French although the user asked for all user-facing text in both languages, the forced-choice bar for references, the test set's hold-out, caps and widening) as a decision; update the status line.
- **S2.** Section 10 stated decision 15's recommended option as decided.
- **S3.** Briefs kept out of git are then sent to OpenRouter: say they are AidJobs' paraphrases that pass the copy check, with the organisation shown by type; require no-training, no-retention providers with their terms recorded; say the blind scorers of real adverts run in Cursor, not through OpenRouter.
- **S4.** The key's place was wrong ("the vault, as the Bedrock keys": the Bedrock keys are in Vercel for the demo's previews) and missed W-01 and W-14: a new key for this round only, with a spending limit, in the vault, read through `scripts/with-secret.ps1`, never printed, revoked after, separate from W-14.
- **S5.** The reference file name carried a level the effort figures did not count; say who writes the references.
- **S6.** Extend the 8-word copy check and CI's email and phone checks to the library, the references and the briefs; references use a placeholder for an organisation's standard text.
- **S7.** Define the patch number, how readers treat versions, type changes and newly required fields as major, and a `built_from` value.
- **S8.** Name the subset of JSON Schema the script checks, or propose `jsonschema` as a test-only dependency.
- **S9.** State the draw order and caps of the pilot and the test set (at most 33 under a cap of 10 per organisation, not "30 to 35"); report results per organisation; hold out archive adverts added later; say the test set checks faithfulness, not the pass rule.
- **S10.** The demo files are uncommitted: rely on the checks listed, adopted from `quality.ts` once committed; write "the models the user chose for Phase 5"; say whether the change also covers the demo's chat.

## Minor

N1, the guides' ranges replaced only when the demo or generator adopts the library; N2, the scoring guide's length dimension moves to the measured bands, with rescoring; N3, define JD and OpenRouter; N4, one term, "blind scorer"; N5, the scorer's family differs from every writer, not "a third"; N6, `library.py` and the `templates/` folder in section 12; N7, which pull request carries the references and the round's results; N8, the employer plan's "What a template holds" points to the full list; N9, the ledger's sections and its open decisions; N10, split the long test-set bullet.

## Verified (by the reviewer)

The effort rows summed as stated; decisions 7, 8 and 11 to 16 are numbered and cross-referenced correctly; section 16 now precedes 17; "3 to 6" signature facts throughout; `tools/survey/raw/ai-test-set/` is git-ignored; the ledger matched the plan; every point of the user's amendment is present.

## How the findings were taken (the author, 10 November 2026)

All taken. The author checked S4 (`scripts/with-secret.ps1` and `scripts/env_check.mjs` exist; W-14 concerns a Render key for the crawler, which no longer uses AI) before changing the text.

- **M1:** "Pooling and thresholds" in section 9: pooled measures; one threshold (5 for a median, a frequency or a variant; 8 for a best-quarter figure); thin cells marked; decision 17.
- **M2:** "less the AI test set" in sections 7 and 17; a `held out` column in `adverts.csv`.
- **M3:** section 3's one exception for the model round.
- **M4:** `role-distinctions.csv` added; French search terms in `role-families.csv`; `signature-facts.csv` gains level, section fed and why it matters in both languages; the library's inputs listed per part; part 2 sourced from `signature-facts.csv` only.
- **S1:** the choices listed in section 2, decision 7, and as decision 17; the status line updated. On French references, the user's "all user-facing text in English and French" was followed: every reference job description in both languages, re-costed (Phase 4's references 16 to 24 days; wave 1 70 to 106; wave 1a 26 to 43).
- **S2 to S10, N1 to N10:** taken as proposed. On S10, the amendment records Phase 5 only; the demo's chat model stays W-51's, recorded in its own stream.
