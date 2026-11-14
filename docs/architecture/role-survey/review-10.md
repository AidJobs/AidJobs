# W-54: review of the broad layer's rule revision (`adverts.py`, `advert_set.py`, `validation.py`), 14 November 2026

Reviewer: a separate read-only agent (Grok 4.7) in an isolated clone of `w54/broad-rules`, first at `44f8383`, then at `ec9fc28`, about 35 and 15 minutes, no network request, before the rules were frozen and round 2 was drawn. Grok 4.7 and Composer 2.5 were again the only models the account allows: Claude Fable 5.2, Gemini 4 Carbon and GPT-5.6 Luna were each refused on 14 November 2026. The reviewer ran the four survey test files (168, then 171 passed) and ruff. It compared hashes and columns of the local files and called read-only functions in memory; it wrote nothing and quoted no advert text.

## Verdict, first round: changes needed

The reviewer confirmed:
- `advert_set.py` is d62f97e's patterns word for word, and `is_advert`, `carries_meaning` and `chrome_lines` read only it;
- after the rebuild, `measured.jsonl` and `ai-test-set.json` are byte-identical to the copies taken before it, with the same 1,324 advert ids and the same identity and strata columns, and the role map unchanged;
- no path in keeping, near-duplicates, caps or the AI test set uses a revised pattern;
- in memory, a round-2 draw by seed 20261114 left out all 100 round-1 adverts and all 30 of the AI test set, took 20 French, at most 3 per organisation, met the system floors, and ran V101 to V200 in five batches of 20;
- round 1's draw still loads after the rebuild, and the guide's hash is the frozen one;
- the new regex repeats are bounded.

### Must-fix

1. **CI's form check fails until round 2's file exists.** Not changed, and the reviewer accepted the reason in the second round: the pull request carries round 2's committed results before it is pushed, and requiring every round's file keeps review 9's point 5 (a missing file fails).
2. **A bare "before" and any date counted as a closing date.** Fixed: such a match counts only with an application word in its sentence. Tested.

### Should-fix

3. **An employer's own years, with the organisation as subject, could be taken as years asked.** Fixed: those sentences are left out. Tested.
4. **A bare CV mention counted as how to apply.** Fixed: a document word counts only with an apply verb in its sentence. Tested.
5. **Budget figures under Context counted.** Fixed: they are left out, as under About. Tested.
6. **An unformatted "Location" line is not read as header facts, and text after a run of fact lines joined the header facts.** The first part is not adopted: an unformatted label followed by its value is a value line, and the guide asks for a heading for job facts or a run of two value lines. The second is fixed: the run ends at the first other line, whose text starts a new preamble row. Tested.
7. **"reports to the Manager, Finance" was not counted.** Fixed: a comma ends the generic match only when no capital follows. Tested.
8. **"open until" a date gave a contract length.** Fixed. Tested.
9. **A round-2 draw without its strata and rules hashes would have been accepted.** Fixed: it is refused. Tested.
10. **`score` on round 1 would overwrite its committed results.** Fixed: an earlier round's committed file is never scored over (`recheck` writes locally). Tested.

### Minor

11. **Direct reports still counts a bare "supervises", which the guide calls vague.** Kept, by the user's choice: both revisions scored worse on the first 100.
12. **A title gave the contract type through the consultant context's broader words.** Fixed: consultant words or the intern level only. Tested.
13. **Scoring did not re-check the guide's hash.** Fixed for round 2. Tested.

## Verdict, second round: approve with changes

The reviewer found that each fix does what it says, with no regression in the tests, the identity checks or the round-2 checks. Two narrow points remained, both taken:
1. "post" and "position" no longer open the closing-date gate. Tested.
2. "include" counts as an apply verb only as an instruction ("please include", "include your"). Tested.

Noted and not changed: when one sentence carries both the employer's years and those asked, the sentence is left out; every budget figure under Context is left out, the job's own included; "the contract expires on" a date is neither a closing date nor a contract length.

All points are recorded here. 171 tests pass, and ruff is clean.
