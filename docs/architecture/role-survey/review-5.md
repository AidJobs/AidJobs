# W-54: independent review of `roles.py` and `adverts.py` before batch R1 (11 November 2026)

Reviewer: a separate read-only agent in an isolated clone of `w54/role-survey-r1-r5` at `25fdbd4`, about 35 minutes, no network request. Kept as written; the fixes are recorded at the end.

## Verdict: changes needed

The network code mostly follows the rules. Live reads go through the backend fetch policy, which only allows GET or HEAD, checks robots.txt on every hop including redirects, and honours Crawl-delay. Archive reads are GET-only and paced 10 seconds apart; they stop at once on a 403 and stop after two 429 or 503 answers in a row. Today's plans stay inside their limits.

Four things need fixing before R1 to R5 run: resumed runs forget the batch size and any earlier refusals; one R3 pattern can lead to a host outside the approved list; several measuring rules give false positives that would distort the committed files (mainly pay, age restrictions, section typing and site-chrome removal); the AI test set is not frozen between builds. The tests never exercise the network safeguards: every network-safety mutation survived.

## Must-fix

1. **The batch size is not kept across resumed runs** (`fetch_archive`; `LiveRun.get`). The request counter starts at 0 on every run; failed pages are tried again each night; `careers.Requester` can retry one page up to 4 times, counted as one request. With fakes, three R1 runs sent 180 page requests against R1's size of 60. Fix: count the batch's lines in its `requests.log`, which covers all runs, and stop at the cap.
2. **A resumed live run asks again a host that refused earlier.** A cached record with 401, 403, 429 or a bot challenge is returned without blocking its host. Fix: block the host when loading such a record; save the run's stop reason and check it on start.
3. **The R3 "next page" patterns are not tied to the board's host.** `/page/(\d+)/?$` accepts any link ending in `/page/2`, which could reach a host outside R3's list. Fix: anchor each pattern to its board's host, or compare the hostname before queueing.
4. **The pay fact has many false positives.** `net`, `annual` and `monthly` have no word boundaries and accept any number within 60 characters; "competitive salary" counts as pay. "Network of 25 partners", "annual report 2025", "internet 24 hours" all counted. Pay counts double in the decision-facts score, and section 5 asks for a figure, range, named scale or allowance. Fix: add `\b`, require a currency or figure next to the pay word, record vague pay as its own item, add negative tests.
5. **Restrictions have false positives** (they feed the fairness check). Age: "children under 18", "women aged 15-49", "youth aged 15 to 35", "contracts not exceeding 12 months" are flagged; require a candidate subject and make "years" mandatory. Photo: "do not include a photo", "at the height of the crisis"; add a negation window and a person context for height. Sex: "the only women's rights network"; require an applicant noun. Marital: "unmarried adolescent girls"; require an applicant noun. Disability: section 20.2 keeps "physically fit" as a quiet word; only "able-bodied" is explicit. Nationality: UN national posts are a case of their own; put them in their own category.
6. **"About the role", "About the job", "About the position" and "About you" are typed as organisation boilerplate.** Role words are then counted as standard text. Fix: limit the organisation pattern; type "about the role/job/position" as role purpose and "about you" as essential requirements.
7. **Site-chrome removal deletes an organisation's standard text.** Any line on 60% of an organisation's pages is removed, including equal-opportunity, no-fee and safeguarding sentences, undercounting the standard share and raising the missing-facts counts. Fix: remove only short lines outside recognised sections; work out standard sentences before any chrome removal.
8. **The AI test set is drawn again on every `measure` run**, so the held-out set changes as archived adverts arrive, and an advert already turned into a brief could enter the evidence. Fix: reuse the saved file and only top it up toward 30; add a test.

## Should-fix

9. **Years of experience:** ranges give the upper number ("5 to 7 years" gives 7); the UN "first-level degree with two additional years" is not read; a semicolon before "or a bachelor's" loses the alternative; "experience with children under 5 years" gives 5.
10. **Degree level:** "driving licence" counts as a bachelor's; "mastery", "Mastercard" and the French word "ma" count as a master's.
11. **"(H/F)" is counted as "women encouraged"**; it is a both-sexes mark and needs its own category.
12. **Other fact false positives:** hours match any percentage; contract length matches "minimum 5 years in a similar role", "under 5 years", "founded 30 years ago"; duty station matches French "au lieu de"; languages match the bare word "language".
13. **The decision-facts score differs from section 5:** field facts (accompanied, hardship, housing) belong to field realism; "field post" includes any humanitarian title; a 3 needs 85% where section 5 says all applicable facts.
14. **`roles.py` precedence errors:** "management" beats "officer" for level; "Water Supply Engineer" becomes supply chain; "Food and Nutrition Security", "Human Security", "Global Health Security" become safety and security; "Regional Network Coordinator" becomes ICT; "Programme Design Specialist" becomes communications; "Community Facilitator" becomes teaching; "Gestionnaire de projets" becomes administration; "Child Wellbeing Officer" becomes HR.
15. **The form check:** `PHONE_LIKE` fires on an advert id made only of digits (about 1 expected in 2,000 adverts); free-text columns (`org_id`, `system`, `grade`, `period`, `batch`) have no form checks; the title-variants rule is untested.
16. **`Requester` retries non-206 answers:** a 404 costs 4 requests, and a 200 answer to a byte-range request would download the whole archive file (possibly about 1 GB), up to 4 times, with no size cap. Fix: treat any non-206 as a failure with no retry, or stream with a byte cap.
17. **`fetch-archive` trusts `plan.csv` as it is.** Re-check the R0 verdict, shell hosts and language per row before each request.
18. **Board employer read from the address:** "finance-officer-at-save-the-children" gives "officer at save the children"; take the part after the last "-at-".
19. **Near-duplicates:** board titles ending "at Employer" never equal the employer's title; `hash()` is salted per process; when a step F feed advert also appears in the archive, the archived copy is kept and the feed copy dropped, shrinking the test set's pool.
20. **R5's pages are never used:** `extract` skips R5 and `roles.py titles` does not read it.
21. **Held-out adverts take places within the cap of 30;** consider capping the evidence separately.
22. **`LiveRun` refusal streaks differ from `confirm.py`:** a policy refusal of a redirect hop's robots.txt resets the streak; on resume, the policy reads each host's robots.txt again without counting it.

## Minor

23. "Overview of the organisation" becomes role purpose; "Location" or "Travel" headings become field conditions.
24. The copy check's *(std)* exemption allows up to 200 characters; enforce under 15 words.
25. `score_length` lowers the score below the band, though section 5 calls the bands ceilings; confirm the intent.
26. "United Nations Association" charities and national committees like "UNICEF UK" are typed as UN agencies; Aga Khan Foundation (kind "NGO") is typed as an INGO; `role_map` counts unplaced titles when scaling to the cap.
27. `language_of` gives ties to English; the Spanish word list lacks "la".

## Checked and found sound

The R1 plan (60 pages at 23 organisations) and the R2 plan (2,181 at 106, within 2,300): no shell-host page, no page R0 did not allow, at most 60 per organisation. Live sizes: R3 at most 222 requests (235), R4 6 (10), R5 26 (26). R3 pagination cannot loop. Pacing 5 seconds and 10 per host; archive reads one byte-range GET at least 10 seconds apart; partial files written as `.part` and renamed. The committed broad files have no title or address column; ids are hashes. `scrub` removes emails and phone numbers and keeps spaced salary figures, dates, years and P.O. Box codes. The French cap as decision 21 says. `roles.py build` deterministic, the cap and the UN weight tested. 33 tests passed, ruff clean.

## Mutations

Survived: shell hosts never skipped; the batch size ignored; a live refusal not blocking its host; live stop rules never applied; R1 ignoring pages already read; R1 ignoring R0's verdicts; pay not needed for a 3; held-out adverts dropped; the title-variants check removed; chrome removal applied to every organisation. Caught: `scrub` skipping phone words; one threshold for different-title duplicates; the *(std)* exemption removed; the UN years alternative ignored; the UN weight at 1.0; the cap removed from `role_map`; the food-security exclusion removed; the ESG precedence removed.

## Fixes (11 November 2026)

All 27 points taken; 57 tests pass (33 before), ruff clean. The fixes change logic, so a re-review follows (operating conventions).

- **1, 16, 17:** archive reads have their own reader (`ArchiveReader`): one GET per page, never retried; only a 206 is kept, read no further than the record's length plus 4 KB; each request is a line of the batch's `requests.log`, written before it is sent, and the batch's size is counted from the log across runs; a 403, two 429 or 503 in a row, or three failures in a row write `stopped.txt`, and a stopped batch is not resumed. `fetch-archive` re-checks each planned row (R0's verdict, shell host, language, the UN hold) before reading it. `careers.Requester` is no longer used for pages.
- **2, 22:** `LiveRun` keeps its refusals, failures and blocked hosts in `state.json` and its stop reason in `stopped.txt`; a cached refusal blocks its host again; the fetch policy's own robots.txt reads (the first request to a host in a process, or after a redirect) are logged and counted toward the batch's size; a policy refusal of robots.txt counts as a refusal.
- **3:** R3's next-page and job links must be on the board's own host; only the next page number is followed.
- **4, 12:** pay needs a currency and figure, a salary word next to a figure, or a named scale; vague pay is its own item (`pay_vague`). Hours, contract length, duty station and languages tightened; negative tests added.
- **5, 11:** every restriction needs the applicant as its subject; age needs "years" (or an explicit "age limit" or "maximum age"); photo has a negation guard; disability is "able-bodied" only; UN-style national posts are their own item (`national_post`), outside the fairness categories; "(H/F)" is its own inclusion item (`both_sexes_mark`).
- **6, 23:** "About the role/job/position" are role purpose, "About you" essential requirements, "Overview of the organisation" organisation text; "Location" and "Travel" headings are header facts.
- **7:** site-chrome removal takes only lines of 6 words or fewer that are not section headings; standard sentences are worked out before it.
- **8:** the AI test set is frozen once drawn and only topped up toward 30; the early draw from the offline test run was deleted, so the first draw is made at the first measure after reading.
- **9, 10:** year ranges count from their low end; "under", "aged" and similar before a number are skipped; the UN "first-level degree with N additional years" is read as the alternative; the UN form is read across semicolons. Degree patterns no longer match "driving licence", "mastery" or "Mastercard".
- **13, 25:** the decision-facts score uses section 5's facts only (field conditions belong to field realism, which is coded); a 3 needs every fact with pay; the 1 and 2 anchors (a third, two thirds) are provisional until Phase 0. Length bands are ceilings: at or under the ceiling scores 3 unless under half the lower end.
- **14, 26:** the `roles.py` precedence errors fixed with tests; UN associations, national committees and "friends of" charities are not UN agencies; Aga Khan Foundation's three entries typed as foundations by recorded decision (`role-decisions.csv`). `role_map` keeps counting unplaced titles toward the cap of 30, deliberately: the cap is on an organisation's titles, placed or not.
- **15, 24:** the form check skips id and count columns for phone-like numbers, checks the free-text columns' forms, and the title-variants rule is tested; a *(std)* quote is exempt from the copy check only under 15 words.
- **18, 19:** a board's employer is read after the last "-at-"; copies are compared on titles without a board's " at Employer" ending; shingles use `zlib.crc32`; step F's feed copy of an advert is kept over the archived one.
- **20:** R5's listing pages feed `roles.py titles` through their job links (R5 itself is held for the UN terms decision).
- **21:** held-out adverts no longer take places within the cap of 30.
- **27:** "la" added to the Spanish word list.
