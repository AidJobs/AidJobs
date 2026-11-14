# W-54: review of the restrictions revision (`adverts.py`, `validation.py`, guide 1.2), 14 November 2026

Reviewer: a separate read-only agent (Grok 4.7) in an isolated clone of `w54/restrictions` with no remote, at `98b37af`, then `8b8915e`, then `76616bc`; about 35, 15 and 10 minutes; no network request; before the rules were frozen and round 3 was drawn. Gemini 4 Hydrogen was tried first and refused on the account (14 November 2026), so the reviewer is again the same model as coder A. The reviewer ran the five survey test files (208, then 217, then 220 passed) and ruff, compared the broad files' columns and hashes, and called read-only functions in memory with invented sentences. It wrote nothing and quoted no advert text.

## Verdict, first round: changes needed

The reviewer confirmed:
- `advert_set.py` is unchanged, and so are `broad-sections.csv`, the role map, the AI test set and the local `measured.jsonl`; in `broad-adverts.csv` only the `restrictions` column changed (216 cells), with the same 1,324 ids;
- the fairness categories leave out `residence` and `national_post`;
- guide 1.2 matches guide 1.1 outside Part 7, its version lines and its change list;
- the new repeats are bounded, and a long single line runs in under a second;
- the targeted draw is valid for precision and not for recall, as described: precision on the script's positives in the sample, recall only as an Estimate weighted by each stratum's size;
- rounds 1 and 2 read the script's `residence` as `nationality`, and the rules lock holds only for the latest round.

### Must-fix

1. **"Hired locally" and the other local-post forms counted any mention**, an organisation's staff in general, a recruitment partner, contract law (the author's own check had found the first). Taken: they count only when the sentence is about this post and not the workforce in general. Tested.
2. **Three nationality false positives:** citizenship "not required", citizenship offered with a work permit, and a title in brackets read as a nationality. Taken. Tested.
3. **Religion matched an organisation describing its own faith.** Taken: skipped unless the sentence addresses the person sought. Tested.
4. **Residence matched without a limit on the applicant** (an office within commuting distance, children served nearby, colleagues in other time zones). Taken: the applicant must be the one limited, and the people-served check applies. Tested.
5. **Decided phrases not read:** "national candidates", the bare French "local candidates", "open to applicants in" a place. Taken. Tested.
6. **A preference word anywhere in a sentence made a limit a preference.** Taken: the preference word must govern the match, and a limit word in the match keeps it a limit. Tested.

### Should-fix

7. **Whole-sentence skips dropped real residence limits** (willing to travel after the limit, "regardless of nationality", encouragement after a semicolon). Taken: the skips apply to the match's own clause. Tested.
8. **Any colour picture counted as a photograph.** Taken: a passport photograph only. Tested.
9. **A French age line counted without an eligibility list.** Taken. Tested.
10. **The guide's opening answer example is the full object, and Part 7 counts the job-posting data's applicant location, which the script does not read.** Not changed. The user approved changing nothing outside Part 7, and Part 7 states the short form; the answer check refuses the long form, so a slip is caught and corrected as a recorded form slip. The applicant location is a true residence limit by the user's decision; the script's miss lowers recall only (3 of the 1,294 evidence adverts carry that field) and is recorded as known.
11. **CI's form check fails until round 3's file exists.** Not changed, as review 10 accepted: the pull request is pushed only with round 3's committed results, and requiring every round's file keeps review 9's point 5.

### Minor

12. **A line starting "must be based in" counted a field rota.** Taken: the line form needs a capitalised place and the end of the line. Tested.

## Verdict, second round: changes needed

Every first-round fix did what it said. New points, all taken and tested:
1. **(must-fix)** A local phrase proved the post by itself ("contract" is a post word; a lease, a fuel contract, post-conflict). Now judged on the sentence without the phrase; a lease, a recruitment partner, plan or fair, and contract law are not the post; law and partner no longer veto a named position.
2. **(must-fix)** "Open to applicants in" matched a language or a meeting city. It now needs a place alone, then "only" or the clause's end.
3. "Non-national candidates" read as a limit.
4. A work permit after a verb was not read as a right-to-work alternative, and any negation in the clause cleared citizenship.
5. Any "you" or "must" cancelled the organisation-faith skip.
6. A French age line about children counted.
7. A comma before "and" did not end a clause.

## Verdict, third round: approve

The seven fixes hold, with no regression in the tests or the identity checks (187 restriction cells changed against 2e8ed49, no other cell). Two minor points, both taken and tested before the rules were frozen: the local-post exclusions gained word boundaries ("act" no longer matches "actually"), and months and languages are left out of "open to applicants in".

All points are recorded here. 220 tests pass, and ruff is clean.
