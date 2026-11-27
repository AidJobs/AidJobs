# Independent technical-director review

Reviewer: anthropic/claude-opus-5.5 via OpenRouter, with zero data retention requested.
Date: 27 November 2026.
This review did not rewrite the assemblies.
Two calls: 133,629 then 50,359 prompt tokens. Reported cost US$0.77 and US$0.34. The first call was cut off and the second finished the report. Earlier calls that returned no written review cost about US$1.63. About US$2.75 of the US$5 key limit has been used.

---
# Phase 5 wave-1a review: is closing at revision 9 sound?

## 1. Verdict

**Fix-before-PR.** The close is not sound as stated. Of the 8 claimed "both" passes:

- **FN-B2** breaks the no-employer rule.
- **CA-B2** clears findability only because the template carries an employment type the source does not contain.
- Several passes (PM-B2, PM-B3, CA-B3, FN-B3) rest on duty detail or requirement reshuffles that are not in the source JSON.

The CA-B1 "structurally blocked" judgement is broadly right. However, the method that produced the other numbers has leakage and scorer-teaching problems. These need to be addressed before any "8/12" figure is committed.

## 2. Findings

**Blocker — FN-B2 names the employer in the template body**

- Evidence: finance packet, FN-B2 Candidature reads "https://boards.greenhouse.io/givedirectly". The same packet contains FN02, a real GiveDirectly advert. The ranker could connect the two, and FN-B2 moved from rank 5 to rank 2 in round 9.
- The Greenhouse URL was added deliberately in rev7 ("spell dossier contents + Greenhouse URL"). Every FN-B2 round from 7 onward is therefore tainted.
- Action: replace it with a neutral "online application on the listing". Then re-score, because the "how to apply" fact for decision facts may change. Re-rank FN-B2 as well.

**Blocker — CA-B2's pass depends on an employment type not in CA06**

- Evidence: the CA-B2 job-posting data says "employment type: Full-time". CA06 lines 1–28 never state full-time, part-time or a contract type.
- Template findability G counts title, description, organisation (by rule), Phnom Penh, and Full-time, giving 5. Without Full-time, G = 4. That makes findability 1, below the communications median of 2, so CA-B2 fails pass_dims.
- Action: check the full CA06 page. If the fact is not there, remove it and report CA-B2 as a findability fail. The swap investigation already listed CA06 as stuck ("place + closing").

**Blocker — The blind packets are not blind**

- Each packet header states the pass threshold ("Pass if template total >= 13.25").
- Each packet header carries the template organisation instruction.
- Item ids say `template:` or `real`.
- Templates use a distinct layout (a `Type:` line, a job-posting block, a standard footer). The reals use plain text.
- The scorer knows which items are templates and what score they need. The ranker sees the same ids; round 7 rationales comment "Employer name is absent".
- Action: use neutral ids (P01–P06). Remove thresholds and rule text from the packet; give the organisation rule to the scorer separately. Render reals and templates in one layout. Then re-run one clean confirmation round on revision 9 unchanged.

**Major — Invented fairness signals in every template footer**

- The footer "No fees are charged at any stage… safeguarding policy applies" is attached to all 12 templates.
- Only PM18 and FN11 carry a no-fee notice in their source, and CA10 mentions safeguarding.
- For the other templates this is an invented employer claim. It is also the trust signal that lifts fairness from 1 (the family median) to 2.
- Action: either mark it as an AidJobs platform statement outside the template body, or drop it and accept fairness 1. Most totals would fall by 1 and still clear p75, but the claim must not be credited to the employer.

**Major — Duty detail invented to buy specificity, length and outcomes**

- PM-B2: PM18 gives only duty headings ("Contract follow-up", "Filing"). Rev8 added "~8 unique… duties" to pass right_length. The resulting lines are invented: "within five working days", "two weeks beforehand", "win rates each quarter".
- PM-B3, ML-B1, ML-B3, CA-B1 and CA-B2 have the same pattern of invented cadences.
- See Section 5 for detail.
- Action: the change lists say "source-grounded only". These lines are not. Either label them as drafter-proposed structure or remove them.

**Major — The `Type:` line is relabelled to reach a length band**

- CA-B1, ML-B1 and FN-B1 are `domestic_charity` in selection.json and in their own headers. Their packet `Type:` line says "local or national NGO".
- Under guide §8, a domestic charity has no band. The scorer should use the feel rules and write `length:estimate`.
- Conversely, ML-B2, CA-B3 and FN-B3 have no `Type:` line at all.
- Action: use the true type. Check the scorer notes for `length:estimate`.

**Major — FN-B3 misstates the deadline and demotes a requirement**

- FN20 has two deadlines: 13 December at 15:00, and "by December 9, 2024" (line 36). The template keeps only one and hides the conflict.
- The template turns the bid deadline into a duty: "submit the signed opinion and workpapers by 15:00". The deadline is for the proposal, not the audit opinion.
- FN20 line 32 is in the requirements list ("should be provided"). The template moves it to Desirable, which helps realistic_must_haves reach 3.

**Major — CA-B3 duties are not in CA14**

- CA14 line 14 is truncated after "report to the Head of Communications however,". The rev9 duties are invented: press releases, web stories, partner sign-off, "every week" Director briefs, Cambridge website sections.
- The reporting line also conflicts within the source: line 6 says "Director - Communications" and line 14 says "Head of Communications".
- The closing date is probably mis-mapped (see Section 5).

**Minor — Employment types read from the wrong fact**

- ML-B3's "Full-time" comes from "4 years of full-time… work experience" (ML19 line 25). That describes the experience, not the contract.
- PM-B3 ("Full-time") and FN-B1 ("Full-time") have no visible source support.
- CA-B1's "Fixed-term" is not in the supplied CA10 lines either, although the swap investigation asserts it.
- Neither CA-B1 nor PM-B3 changes outcome, because CA-B1 already fails and PM-B3 keeps G of at least 5.
- **FN-B1 is different.** Its G is 5 only with "Full-time". Without it, findability drops to 1 and FN-B1 fails the rubric too. That would make it 10/12 rubric passes, not 11/12.

**Minor — Readability faults the scorer did not count**

- PM-B1 has "Candidates must show uS work authorisation" (capital fault).
- PM-B1 expands SDLC twice.
- The standard-phrase templating "Candidates must show…" creates 8-word repeats in several templates.

**Note — CA-B1 is correctly reported as blocked**

- I agree with this reading. CA10 has no pay, place, contract length, closing time or language.
- Its "how to apply" is a button, which guide §1.7 rules out.

**Note — Same-employer real adverts sit in two packets**

- FN01 (Educate!) and FN-B1 (from FN12, also Educate!) share a packet.
- FN02 and FN-B2 (both GiveDirectly) share a packet.
- Similar boilerplate invites recognition. Pick comparison reals from different employers.

## 3. Method

**Leakage.** See the Blocker above. The scorer knows the threshold and which items are templates. The ranker knows which items are templates. Neither condition holds in the stated design ("blind").

**Later revisions taught the scorer.** Every change list is written from the previous round's scorer and ranker notes:

- Rev7 dropped the pad because "scorers mark it as template residue".
- Rev9 removed the duty the ranker called "an application step".
- Rev9 expanded HR to clear readability 2.

Nine rounds with the same model family amount to optimisation against one judge. The real adverts show the size of that judge's noise:

| Real advert | Range of Grok totals across rounds |
| --- | --- |
| PM06 | 7–11 |
| ML13 | 12–16 |
| CA19 | 12–15 |
| FN16 | 14–18 |

Template gains of 1–2 points from round 7 to round 9 sit inside this noise. The forced-choice ranks of real adverts also swing widely. ML06 ranked 4, 6, 2, 6 across rounds 6, 7, 8, 9, and CA01 ranked 2, 2, 5, 3.

What is needed:
- a held-out confirmation round with a second scorer family;
- unchanged revision-9 text;
- a fresh real comparison set.

**Template-organisation rule.** The 23 November decision is defensible: the employer name is a publish-time field. It is applied only to findability, as stated. It is not a licence to supply the other facts. Yet CA-B2 and FN-B1 appear to have drifted that way through employment type.

**Calibration gap.** The thresholds come from Option A sealed totals, but the templates are scored by Grok. Grok scores the signature tops lower than their sealed totals:

| Top real | Sealed total | Grok range |
| --- | --- | --- |
| PM15 | 17 | 14–15 |
| CA19 | 16 | 12–15 |
| ML20 | 16 | 11–15 |

Templates are being judged on one scale against thresholds set on another. Report Grok's own p75 on the reals in each packet beside the sealed thresholds.

**PM17 and ML17 swaps.** Both are clean on facts:
- PM17 states remote US, $95–110k, Eastern Time hours and full-time.
- ML17 states San José, P1, fixed-term up to 28 months, and closing and posted dates.

Both were made after round 5 results, so they are post-hoc brief selection. That is acceptable only if the report says so and keeps the original PM13 and ML11 failures visible. ML17 is the employer of the CA14 HRMS boilerplate (IUCN). The CA-B3 and ML-B2 Selection and Apply lines are therefore near-identical, which a ranker can read as one template voice.

## 4. Rubric versus hiring value

- **Invented cadences.** These add specificity kinds and clear_outcomes targets but no hiring information. Examples: "within two weeks", "every fortnight", "first working day" (PM-B3), "three story ideas each month" (CA-B2). A hiring manager would have to retract them.
- **Recasting facts to hit rubric tokens.**
  - PM-B2's "staff contract, Length set under the country framework" turns "international staff position" into the findability token "staff contract". It also invents a contract-length phrase.
  - The ML-B2 and CA-B3 "Selection" sections are apply instructions relabelled to fill the selection fact.
- **Application steps written as duties.** FN-B3's "You evidence a valid Yemen audit licence… in the bid pack" is a duty in name only. The ranker penalised exactly this in FN-B2 in round 8.
- **Demoting requirements to Desirable.** FN-B3 and ML-B3 (the master's degree, where the source says "with a Master's degree" for the four years) gain on realistic_must_haves. For FN-B3 this misstates the bar applicants must meet.
- **Genuine gains.** These do help a hiring manager:
  - ML-B2's added languages, reporting line and Operational Guidelines §172/174 detail;
  - FN-B1's real effort split;
  - PM-B1's quantified bars.

## 5. Source fidelity

| Brief (source) | Grounded | Invented or distorted | Employer in body? |
| --- | --- | --- | --- |
| PM-B2 (PM18) | EUR 3,000–3,200 plus $300, Myanmar, guesthouse, master's, field experience | All 17 duty specifics (source gives headings only); "Length set under the country framework"; the selection steps; the security-plan line | No |
| PM-B3 (PM14) | Gurugram, up to 12 LPA, 1-year residential programme, AI-assisted plus holistic pedagogy, 4 hiring steps, WhatsApp | "Full-time"; all cadences and targets; the "graduation checklist". The source itself conflicts on 7+ versus 8+ years and the template uses 8 silently. The posting date is a *repost* date. | No |
| ML-B2 (ML17) | Place, P1, 28 months, closing and posting dates, reporting line, English/Spanish, French desirable, §172/174, Reactive Monitoring, geospatial data, World Heritage Outlook | Outcome "named follow-up owners"; communications duty inflated from "contribute content" to "draft". The closing time zone "GMT+1 / GMT+2" is the source's own. | No ("IUCN" removed; "World Heritage Panel" is generic) |
| CA-B1 (CA10) | Title, reporting line, department, deadline day, safeguarding checks, duty themes | "Fixed-term" not visible; "ten working days" and "each month" | No |
| CA-B2 (CA06) | Phnom Penh, English/Khmer, five years, bachelor's, email letter and CV, remote travel | "Full-time"; the entire duty list (the source has only qualifications plus "job description attached"); weekly and monthly cadences; the security and consent rules. The source's "salary requirements" request is dropped. | No |
| CA-B3 (CA14) | Cambridge, A3, 24 months renewable, bachelor's, 2 years, English | All rev9 craft duties (source line 14 is truncated); weekly Director briefs. **Closing date likely wrong**: in ML17 line 8 is the close and line 10 the posted date. Applying the same map to CA14 gives close 01 Dec 2016, posted 09 Oct 2016. The template's "2016-10-09" closing date is therefore probably the posting date. "Donor / intergovernmental" contradicts CA14 line 12, which says "non-governmental organisation" and "charity". "Director communications" is taken from line 6 and ignores line 14's "Head of Communications". "Development communication" is dropped from the experience bar. | No by name. "Wildlife-trade" plus "Cambridge" points to one employer, and the HRMS and "Swiss time" text is IUCN boilerplate shared with ML-B2. |
| FN-B1 (FN12) | CFO title; the 20/20/20/10/15/15 effort split; the four countries; hybrid; remote with "substantial travel" outside East Africa and the UK; 6–10 years; financial modelling; Certificate of Good Conduct | "Full-time"; "unit-cost" metrics; "monthly close packs"; "named owners and dates in the tracker"; "multi-year" budgets; "fundraising leads". **The must-have is distorted.** FN12 line 50 asks for "strategic leadership experience" and says "Specific finance leadership is NOT required". The template's "strategic finance leadership" raises the bar the source lowered. "African candidates strongly preferred" (line 58) is dropped without a note. The `Type:` line is relabelled (see Section 2). | No by name. The four countries, youth programmes and Good Conduct check match FN01 (Educate!) in the same packet. |
| FN-B2 (FN11) | Title; Goma; rural travel; 19 September 2025; the six community-engagement duties; degree; field audit and data analysis; physical aptitude; digital tools; Word/Excel; Lingala; dossier contents; verification of service attestations; no-fee notice (line 67) | "Full-time"; "chaque semaine"; complaints "le jour même" (the source only asks for polite handling); "plan de sécurité"; the post-mission "compte rendu". Line 28 data-collection experience is "un atout" but is listed under Profil recherché. "Langues: Français" is not supported, because line 46 lists French with Lingala as an asset. The source's own "Kinshasa" mismatch for a Goma post is copied without a flag. | **Yes**: "boards.greenhouse.io/givedirectly", twice in the Apply section |
| FN-B3 (FN20) | Title scope (2024–2025); all six opinion items (lines 19–25); Yemen licence; 8 years; external-project qualification; 3 projects in 4 years; lump-sum USD; email submission; 29 Nov posting; 13 Dec 15:00 Sanaa | The line 36 "December 9" conflict is hidden. The bid deadline is restated as an opinion-and-workpapers deadline. Line 32 is demoted to Desirable. "Within the last 4 years" is dropped from the must-have. "Employment type: consultant" does not fit, because line 28 asks for a "company or office license", so this is a firm tender. "Awards named in the bid" is invented. "Candidates must show" addresses individuals rather than bidders. Line 8 says the posting is closed, and the template does not say so. | No ("Sana'a Center" and "SLISPY" removed) |

## 6. Forced choice

### Ranks across rounds (6 / 8 / 9)

| Template | R6 | R8 | R9 | Reading |
| --- | --- | --- | --- | --- |
| PM-B3 | 5 | 4 | 4 | Stable as the weakest PM template. Both later rounds place it behind PM15, PM-B2 and PM-B1 (in a different order). The criticism repeats: thin bar, WhatsApp apply. This is a consistent fail, not noise. |
| ML-B2 | 1 | 4 | 1 | Swings 1→4→1. The R9 reasons cite "boss, languages, degree, years", which rev9 added from source, so part of the gain is genuine. The swing also coincides with large real-advert movement (ML06 2→6, ML13 6→4). One round at rank 1 does not settle it. |
| FN-B1 | 6 | 6 | 4 | The rationale barely changes: "pay, credential, and deadline" are missing in both rounds. The rise comes from FN16 (3→5) and FN01 (4→6) falling. The template did not improve; the reals around it were reshuffled. |
| FN-B2 | 5 | 5 | 2 | The jump comes in the round in which the Apply block carries the GiveDirectly Greenhouse URL and dossier list. The R9 rationale credits "documents". FN-B2 lands directly behind FN02, a GiveDirectly advert. This is the least trustworthy pass in the set. |
| CA-B3 | 5 | 4 | 5 | The rev9 duty rewrite did not help. R9 flags "the close date is long past". That date is itself probably the mis-mapped posting date (Section 5). |

### The six-item ceiling

The index note is arithmetically correct but used as an excuse. If any real advert takes a top-three rank, at most two of three templates can reach rank ≤3. This is not a forced fail, however. In R9, meal placed all three templates at ranks 1–3, so the ceiling can be reached.

The real defect is different. A template's pass depends on its sibling templates as well as on the reals. For example, PM-B3 would pass if PM-B1 were weaker. That makes the FC criterion non-independent across briefs.

Two remedies would fix this:
- Use one template per packet with five reals, keeping rank ≤3 of 6; or
- Score FC as "ranks above the packet's median real".

Until then, PM-B3 and FN-B1 must be reported as FC fails. The "directly behind" framing in the index should not be used to soften them.

## 7. Reproducibility

### What the files show

- Per-round CSVs exist for rounds 1–9. FC markdown files exist for rounds 6, 8 and 9. No round-7 FC file is named in the index, although round 7 claims "both" results.
- The model is recorded inconsistently:
  - R9 says "Model: Grok".
  - R8 names no model.
  - R6 says "Grok".
  - The index only "recommends" Grok 4.7.
- No round records a model version, date, temperature, prompt hash or packet hash.
- The "0 mismatches" checks only confirm that FC and CSV agree with each other. They do not show that a run is reproducible.
- The round-6 FC was "restored after a duplicate overwrite". This means at least two R6 rankings existed and one was chosen. Nothing shows how the "first" one was identified, or how the two differed. That difference would have been the only direct measure of ranker run-to-run noise, and it was discarded.

### What must be added

- Append-only run files. Never overwrite a run.
- For each run: model id and version, date, packet SHA, prompt SHA, settings, and every run including duplicates.
- A note recording which R6 file was kept and why.

### What must not be committed

- **Full third-party advert text.** The `phase5-blind/*-packet.md` files contain the full text of CA19, CA01, CA03, FN01, FN02 and FN16. The index says the reals are "never committed". If these paths are tracked, that rule is already broken.
- **The `phase5-source/*.json` archive text.** It needs the same check.
- **Contact and link artefacts:**
  - FN20 line 36 carries an email remnant ("[email protected]");
  - FN11 line 65 carries a personal Google Drive link.
- **Run configuration:** OpenRouter or Cursor keys and run configs.
- **Unqualified headline figures:** any "8/12" or "11/12" claim without the caveats in this review.

The review header says zero data retention was "requested". That is not the same as confirmed, so it should be recorded as requested only.

## 8. Readiness

### Template generator: not ready

A generator trained on these assemblies would learn the defects as patterns:
- invented cadences;
- the unattributed fairness footer;
- relabelled `Type:` lines;
- "Candidates must show…" boilerplate;
- application steps posing as duties;
- requirements demoted to Desirable.

What is needed first:
- **Per-line provenance**, in the form "source line n" or "drafter-proposed". Without it, a generator cannot tell evidence from filler.
- **Corrected facts.** FN-B2's employer, FN-B3's deadline and CA-B3's closing date are factual errors, and they would propagate.

### Hiring-manager test: not ready as is, but it is the right next step

A hiring manager would currently be asked to judge invented claims as if they were source facts, for example "three story ideas each month" and "within five working days". The test should run only after these steps:

1. Fix the three factual errors and FN-B1's must-have.
2. Mark drafter-proposed lines visibly, so hiring managers can confirm or strike them. The strike rate is itself the most useful measure of hiring value this project could collect.
3. Put the footer outside the template body as an AidJobs statement.
4. Keep the label "based on evidence, not yet tested with hiring managers" until the test is done.

The rubric numbers should not be cited to hiring managers. They are one judge's scores, optimised over nine rounds, against thresholds set on another scale.

### Effect on the verdict

The new rows add two problems: FN-B1's raised must-have and CA-B3's probable date error. The FC comparison shows that the FN-B1 and FN-B2 rank gains come from reshuffled reals and tainted apply text. Both findings strengthen the existing findings without changing the outcome.

Verdict unchanged: Fix-before-PR.
