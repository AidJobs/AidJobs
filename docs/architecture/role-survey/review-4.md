# Independent review: two-layer library amendment (W-54), 11 November 2026

*Read-only agent in an isolated clone of `docs/role-library` at `17b6f34` (section 19's first draft), with no network access. Its findings are summarised here; how each was taken is at the end.*

## Verdict

**Changes needed.** The two-layer design is sound, honest about cost and its limits, and its numbers mostly add up (the effort table sums correctly; every count in section 18 reconciles). Four points blocked approval: the reading batches left out the employers' own `robots.txt` check that decision 14 requires; held-out test adverts could return as duplicates from another source; the broad layer was said to give "best quarter" values though only the deep layer scores adverts; and two sample figures exceeded what the cap of 30 per organisation allows. Section 19.5 also left several older statements standing.

## Must fix

- **M1.** No employer `robots.txt` is on disk for the new first-wave sites, the 21 gap-filling sites or the recruitment-system hosts, yet R1 and R2 read their archived pages. Add a batch R0 reading those files, and drop any page they forbid.
- **M2.** Reposts were merged only by job id or address; boards republish employers' adverts, and REACH Iraq belongs to IMPACT Initiatives, a source of the AI test set. Add near-duplicate matching across sources before any measure, drop copies of held-out adverts, apply the cap per parent organisation, and draw the test set's widening before the broad build.
- **M3.** Best-quarter figures need the guide's full scores, which only the deep layer gives. Either carry medians and frequencies only until a family is deep-coded, or add an automatic partial score marked Estimate.
- **M4.** Under the cap, the pools give at most 180, 95 and 259 adverts, and at the first-wave text rate about 150, 80 and 215; the first-wave archive gives about 1,250 to 1,400, not 1,500. Restate the broad sample as about 1,900 to 2,150, with the method.

## Should fix

- **S1.** 19.5 should also settle: which Phase 1 batches stay (P1-0a to P1-0c and P1-2) and which go; the title cap; wave 1a's estimate; section 7's fallbacks and reading paragraph; section 14's pull requests (`roles.py` first; `adverts.py` reviewed before R1 and kept in `tools/survey/`); the status line's "only requests … section 17"; section 3's ReliefWeb and national-NGO limits; "every advert read in Phases 2 and 3 is scored"; section 10's "Phase 2's evidence".
- **S2.** Add the broad files to section 12 and to `library.py`'s inputs; no job title or address in `broad-adverts.csv`; distinguishing terms only pooled.
- **S3.** Ground Zero's terms restrict reproduction, which is not silence: make it the user's decision; give board adverts the type of the employer they name.
- **S4.** Define the validation: per measure with at least 15 positive cases, a seeded sample stratified by source, system, organisation and language, reconciled answers, targets for years, family, language and restrictions, overlap with the deep sample, use of embedded job-posting data.
- **S5.** Effort: add the deep layer's scoring (3 to 5 days); the role map 4 to 6; state the net change against section 13 (+7 to +10); later families about 4 to 6 days each.
- **S5a.** Sample own-site pages in R1 (only 3 were sampled); skip shell systems in R2.
- **S6.** ILO is a UN agency and the Red Cross societies their own type, so only 3 government donors were found; drop the claim about research bodies and banks; state the priority markets' gap plainly; the cap cuts the main French source.
- **S7.** Decision 20 would amend section 3's exception bullet; name its key; the coding model's family must differ from the blind scorers'.
- **S8.** Section 15's opening should list 18 to 21 and note decisions 6 and 7 carried out.
- **S9.** The ledger's W-54 item ran out of date order.

## Minor

N1 the domestic refusal count (27 not read, 23 refused); N2 185 or 184 accounts; N3 BambooHR's listing is not a documented feed; N4 R3 and R4 should count their `robots.txt` reads; N5 families with 8 to 29 adverts; N6 Savsign's country; N7 the searches' time; N8 later families should count only those not in wave 1.

## Verified (by the reviewer)

The effort table's sums; the requests (1,761 and 754, 2,515 in all); the job pages per pool; M1 to M3's totals and text estimates; the second round's 143 reads and 210 targets; decision 19's figures; the deep layer's size; the numbering; the user's recorded decisions carried through.

## How the findings were taken (the author, 11 November 2026)

All taken; section 19 rewritten.

- **M1:** batch R0 added (about 130 to 150 `robots.txt` reads, live, through the fetch policy), including the hosts of M1's 20 sample pages and the test's 10, read without that check; the miss is recorded in section 18, and any page R0 forbids is dropped from the text-rate sample.
- **M2:** near-duplicate matching across sources before any measure; held-out copies dropped; the cap per parent organisation; the test set's widening drawn first.
- **M3:** both: a family not yet deep-coded carries medians, frequencies and an automatic partial score's quartile marked Estimate; best-quarter figures come with the deep layer.
- **M4:** the broad sample restated as about 1,900 to 2,150, with the method beside it.
- **S1, S2:** 19.5 rewritten to cover every item; section 12's three new files, the privacy rule, and `library.py`'s inputs.
- **S3:** Ground Zero made part of decision 19; board adverts typed by the employer named.
- **S4:** the validation defined as proposed, the 100 being the deep sample's first 100.
- **S5, S5a:** effort restated (wave 1 77 to 116 days, net +7 to +10 against section 13; wave 1a 35 to 57; later families 4 to 6 days each); R1 adds about 20 own-site pages; R2 skips Workday, Taleo and Workable.
- **S6:** types corrected; the claim about research bodies and banks dropped; the priority markets' gap stated; French allowed up to 60 per organisation (decision 21).
- **S7, S8, S9:** decision 20 states that it amends section 3's bullet, names its own key and the scorer rule; section 15 updated; the ledger item rewritten in date order.
- **N1 to N8:** taken (N8 by 19.7's "remaining 18 to 30 families").
