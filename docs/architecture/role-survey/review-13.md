# Review 13: W-54 Stage 3 library schema and `library.py` (PR #183)

**Scope.** Read-only review of `tools/survey/library.py`, `tools/survey/test_library.py`, `docs/architecture/role-survey/library/schema.json`, and how `deep_fields_ready` interacts with `signature-facts.csv`, `duty-group-names.csv`, and the rebuilt JSON under `docs/architecture/role-survey/library/`. Commit `b3c0e12` on `w54/stage3-library`, base `origin/main` `bcf2dc4`. No worktree. Nothing committed, pushed, or written into `survey-raw-archive`. Sealed files were not opened for text; only hashes, keys, ids, and counts were compared.

**Reviewer.** Grok 4.7, 21 November 2026.

## Verdict

**Approve with changes.** No must-fix. On this commit the stage rules hold: `schema_version` is `0.2.0`; `signature_fact_questions` and `duty_bank_naming` are true because the rows are present and the live seals match; `duty_bank_phrasing` and `reference_jds` stay false; every `groups[].phrasing` is null; `un-values-behaviours` is only on the UN variant, not in `default_source_ids`. An in-memory `build` matches the git blobs of `schema.json`, `index.json`, and all four family files byte for byte, and `check_problems()` is empty with the archive present. `python -m pytest tools/survey/test_library.py` — 11 passed.

Three should-fixes should land in this pull request before merge. The schema is not yet the contract in `role-survey.md` section 9, and the tests would not catch the two regressions that matter most (LF-normalising a raw seal, and a partial duty bank still marked naming-ready).

## What was checked

**Ready flags.** All four families, in both `index.json` and the family file: `duty_bank_naming` true, `signature_fact_questions` true, `duty_bank_phrasing` false, `reference_jds` false. Questions are emitted only when the fact flag is true (6, 5, 5, 6). `reference_jds` is `[]`. `duty_bank.deep_fields_ready` is the phrasing boolean `false`; `duty_bank.naming_ready` mirrors the naming flag. The CSV reader refuses an empty question, a bad id, or a named row without English and French. 22 signature rows, all with both questions. 213 duty rows: 98 named, every named row has `advert_count` >= 5, every unnamed row is below 5, stable ids unique. Those 213 rows match archive `stage2/measured/{family}/duty-banks.jsonl` on `group_id`, heuristic name, and the three counts (no paraphrase text read). Family group counts match `wave-1a-broad-measured.json` `n_groups_reported` (66, 32, 55, 60).

**Seals.** With `survey-raw-archive` present, each `reconciled.json` is CRLF and its raw SHA-256 equals `reconciled.sha256` (64 hex chars). The first 12 match `DEEP_SEAL_PREFIX` (`cfc5a6058309`, `cc3f7f7e7711`, `707a745d6cd2`, `ea5ecc373c70`). The LF-normalised hash of those same files does **not** match. Using `sha256_file` on a seal would mark every family not ready on this machine. When the archive directory is absent, the code trusts the prefix constant, which is what CI needs.

**Determinism.** `sha256_file` strips CRLF on the committed inputs. Canonical LF from `build_family_files` equals `git show HEAD` for every file under `library/`. CI on `ubuntu-24.04` runs `library.py build` then `git diff --exit-code -- docs/architecture/role-survey/library/`. That diff would be clean at this commit. `*.json text eol=lf` is why a Windows worktree of CRLF still matches the LF blobs.

**Schema and index.** `schema.json` is exactly `schema_document()` at `0.2.0`. The four `deep_fields_ready` keys match the code tuple, the index, and the family objects. Bump from `0.1.0` adds `duty_bank_naming` and does not rename or drop a key. `built_at` changed from an ISO timestamp to `wave1a-0.2.0-{12 hex}` so the rebuild does not move.

**Templates.** `default_source_ids` are `chcf`, `chs-2024`, `un-generic-job-profiles` on every family. `un-values-behaviours` is only under `variants.un_organisation_type`. No signature row cites it.

## Must-fix

None.

## Should-fix

1. **`library/schema.json` and `schema_document()` do not state the invariants the files obey, and `check` never validates a document against the schema.**
   - **Where:** `tools/survey/library.py` (`schema_document`, around the root `"additionalProperties": True`, and `check_problems`, which only compares the schema text to itself); `docs/architecture/role-survey/library/schema.json`.
   - **Issue:** Section 9 says CI checks every library file with a stated subset (`type`, `required`, `enum`, `items`, `additionalProperties: false`), tested, and that this schema is reviewed before its first committed version. The root schema sets `additionalProperties` true and requires only `schema_version` and `wave`. `duty_bank` and `signature_fact_questions` are bare objects and arrays. `groups[].phrasing` is not `type: null`. Index flags live on `families[]`, which the schema types only as an array, so the object a reader actually loads from `index.json` is undescribed. `{"schema_version":"0.2.0","wave":"1a"}` would satisfy the schema.
   - **Why it matters:** Rebuild equality currently saves the commit. The schema is what a later generator is supposed to trust. Shipping `additionalProperties: true` on the first version makes a later tightening a breaking change.
   - **Fix:** Keep one schema version, but describe the two shapes separately (family file and index entry). Require `deep_fields_ready` with the four booleans and `additionalProperties: false` (already true for that object). Give `duty_bank.groups.items` required fields and `"phrasing": {"type": "null"}`, with `additionalProperties: false` on the group. Constrain `default_source_ids` so `un-values-behaviours` cannot appear there. Walk that subset in `check` and test the walker with a document that has a non-null `phrasing` or an extra group field, without relying on a full-file mismatch. Leave `measured_broad` explicitly open in the description if closing it is too large for this stage.

2. **The tests would not catch the seal regression or a hand-edit the validators are meant to refuse.**
   - **Where:** `tools/survey/test_library.py` (`test_ci_safe_seal_ok_without_archive`, `test_check_refuses_un_values_in_default_sources`, `test_check_refuses_phrasing_when_present`, `test_check_refuses_ready_when_seal_not_ok`). `sha256_file_raw` is only used in `deep_reconciled_seal_prefix`.
   - **Issue:** Absence of the archive is tested; a present archive is not. There is no fixture of CRLF `reconciled.json` whose raw hash matches `reconciled.sha256` and whose LF-normalised hash does not. The two `check() == 1` tests rewrite a built file, and `check_problems` already fails with `{family}.json out of date` on any parsed difference, so they still pass if `validate_normative_citations` or the phrasing branch is deleted. The seal test monkeypatches `deep_scores_ok_for_ready` and never calls `check`. It also leaves `duty_bank_naming` true, so it does not show that the signature flag alone trips the seal message.
   - **Why it matters:** Replacing `sha256_file_raw` with `sha256_file` would turn every live seal into a failure on this archive (confirmed: LF hash mismatches, raw hash matches) and would still pass CI, where the archive is absent and the tests never build a seal file.
   - **Fix:** Add a tmp-path archive test: CRLF bytes, matching `.sha256`, prefix equal to the constant, `deep_scores_ok_for_ready` true; then flip one byte and expect false. Assert the refusal tests on the validator's own message (`un-values-behaviours`, `phrasing`, `seal`), not only on `check() == 1`.

3. **Naming can be marked ready on a partial bank, and a bad live seal is reported as "run build".**
   - **Where:** `deep_fields_ready_for` and `build_family_files` in `tools/survey/library.py`; the `{fid}.json out of date; run library.py build` branch in `check_problems`; `build_family` dropping `signature_fact_questions` when the seal helper is false.
   - **Issue:** `duty_bank_naming` is true when the seal helper passes and at least one named group has ids, both names, and `advert_count` >= 5. It does not require the family's row count to equal `n_groups_reported`, and it does not require every group at or above 5 to be named. `test_named_groups_meet_advert_floor` only checks the named side (`>= 90`). Today the CSV is complete (the converse holds, and the archive counts match), so the committed flags are honest. Separately, if the archive is present and the raw hash or the prefix fails, `build()` still exits 0 and writes `signature_fact_questions: []` with both new flags false. `check` then says the committed file is out of date and tells you to rebuild, which would delete the questions.
   - **Why it matters:** A shortened `duty-group-names.csv` would still flip `duty_bank_naming` and match a rebuild, so CI would stay green. A damaged local seal would look like a stale library rather than a seal error.
   - **Fix:** Refuse the build unless each family in the CSV has the same groups as `duty_grouping` (`n_groups_reported`, and the same ids if you already have them) and `named` is exactly `advert_count >= 5`. If the archive is present and `reconciled.json` does not match `reconciled.sha256` or `DEEP_SEAL_PREFIX`, exit non-zero from `build` and `check` with that sentence, and do not treat it as a content gap. Keep the CI path that trusts the prefix when `survey-raw-archive` is absent.

## Minor

1. **`Path.write_text` still emits CRLF on Windows.** `write_schema` and `write_library` call `write_text` without `newline="\n"`. Python 3.14 on this machine writes `\r\n`. The index stays LF only because `.gitattributes` says `*.json text eol=lf`, and `git diff` normalises. Pass `newline="\n"` so the script's own bytes match CI without depending on that attribute.

2. **`built_at` is no longer a time.** `0.1.0` used `2026-11-15T14:27:26Z`. `0.2.0` uses `wave1a-0.2.0-7466f847b07b`, derived from the input hashes. That is the right way to keep `git diff` stable, and nothing reads it yet. The schema types it as a string and does not say it is an id. Add that to the field description so a 0.1.0 reader does not parse it as a date. The version rule would call a meaning change major; staying on `0.2.0` is acceptable only while no reader depends on a timestamp.

3. **A few named rows are noise, and one signature row is not a band keep.** Three programme-management groups at `advert_count` 5 are named as noise and labeled `Fact`: `pm-cps-requirements`, `pm-cps-financial-aspects`, `pm-sanaa-place-noise`. `communications_advocacy` / `ca-languages` is `top_count` 0, `bottom_count` 0, no normative source; the row itself says it is not a sealed specificity delta (88 adverts, languages often missing). The family still has four other questions, so the flag would stay true without it. Neither flips a flag falsely. When phrasing starts, do not treat those three groups as duties to phrase, and do not let a 0/0 row with an empty note count toward the minimum of three.

`deep_reconciled_path` and `deep_scores_sealed_in_archive` are unused. `duty_bank.phrasing` is rejected only when it is truthy (`[]` would pass that branch), and a non-null `phrasing` on an unnamed group is checked only when naming is ready. Rebuild equality still catches both on `check`. Fold a `phrasing is None` check for every group into the validator while fixing item 2.
