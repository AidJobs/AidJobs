# Scoring guide: role-content survey (W-54), version 1.1

Score every advert from 0 to 3 on nine dimensions. The weights below sum to 100. This version is frozen for the rescore of the Phase 0 pilot of 20. The same guide is what Phases 2, 3, and 5 score with. The user's 10-advert session was skipped (user, 15 November 2026); this calibration uses only the sealed pilot disagreements.

You are one of two independent coders. Read only this guide and the packet you were given. Change nothing on disk. Do not open, search, or list any other file or folder.

The examples in this guide were written by AidJobs to show a score. They are not real adverts.

## How to answer

Return one JSON object per advert, one line each, in packet order, and no other text. Use the advert's id. Every score key is present on every line. Scores are integers 0, 1, 2, or 3. The only `null` is `field_realism`, and only when the post is not a field post. Do not omit a key, and do not write `"N/A"` or leave a score blank.

```
{"id": "P01", "decision_facts": 2, "specificity": 1, "realistic_must_haves": 2, "clear_outcomes": 1, "field_realism": null, "fairness": 2, "readability": 2, "right_length": 1, "findability": 2, "note": "optional, at most 40 words"}
```

`note` may be omitted when you have nothing to say. When you include it, keep it to 40 words and do not copy advert text into it. When `right_length` is an estimate (see that section), the note must contain the token `length:estimate`.

You do not compute the total. For later use, the total is the sum of (score × weight) / 3, which runs from 0 to 100. When `field_realism` is `null`, leave it out and share its weight of 10 across the other eight in proportion to their weights (those eight sum to 90, so multiply each of their weights by 100/90).

## The packet

Each advert starts with `=== P01 ===` (the id), then:

- `Title:` the job title on the page.
- `Type:` the organisation type, when it is known. A value may be a length-table row, or local or national NGO, INGO, or UN agency or secretariat. Right length reads this line and does not infer the type from the prose. If the line is absent, or the value is none of those, use the feel rules and write `length:estimate`.
- `Job-posting data on the page:` on some adverts only. These lines are part of the advert. A fact they state counts as stated. A closing value here is a closing day; it does not by itself supply a clock time or a time zone. `date posted` fills findability's posting date. Pay, place, and employment type count when the value actually states them.
- `Lines:` the advert, one numbered line per paragraph, list item, or table cell. `#` marks the page's main heading (usually the title). `##` marks a line the page formats as a heading (bold, a heading tag, capitals, or ending with a colon). The marks are the page's formatting, not a judgement: some `##` lines are not headings, and some headings carry no mark.

Emails and phone numbers may appear as `[email]` and `[phone]`. Ignore leftover website text (menus, buttons, "share" links) unless it says something about the job.

Decision facts and fairness are scored on the full advert, including organisation and legal text and any job-posting data. Specificity is scored on duty units only. Readability sets organisation, commitment, and legal sections aside when a heading marks them, and sets the job-posting block aside, before the sentence count and the fault scan. Length counts those sections as standard text, using the rules in that section.

## Weights

| Key | Dimension | Weight | In this pilot |
| --- | --- | ---: | --- |
| `decision_facts` | Decision facts | 20 | Automatic; you score it, for calibration |
| `specificity` | Specificity | 15 | Coded |
| `realistic_must_haves` | Realistic must-haves | 15 | Coded |
| `clear_outcomes` | Clear outcomes | 10 | Coded |
| `field_realism` | Field realism | 10 | Coded; `null` if the post is not field |
| `fairness` | Fairness | 10 | Coded |
| `readability` | Readability | 10 | Automatic; you score it, for calibration |
| `right_length` | Right length for the organisation type | 5 | Automatic; you score it, for calibration |
| `findability` | Findability in search | 5 | Automatic; you score it, for calibration |

The four automatic dimensions are human-scored in this pilot. Follow the cut-points in this guide.

## 1. decision_facts (weight 20) — AUTOMATIC

Human-scored in this pilot, for calibration.

**Definition.** Score the facts a candidate uses to decide whether to apply. Field conditions (housing, hardship, security, and the rest) belong to field realism, not here. Pay counts double: it is one of the facts, and it adds one extra point in the tests below.

The measuring script currently splits some of these into separate tokens (contract type apart from contract length; closing date apart from closing time). Humans use this list, not the script's tokens.

Always applicable:

1. **Pay** — a currency figure, a numeric range, a named scale, or a named allowance. A stated range is one pay fact. Two contradictory pay figures still leave pay present.
2. **Contract** — type and length. Both are required. A type with no length is absent. A length with no contract type is absent.
3. **Duty station** — the same place test as findability: a city, country, office, camp, or an explicit remote or home-based arrangement. "Various locations" is absent.
4. **Closing** — a calendar day, a clock time, and a time zone, all three. A month with no day does not fill a date.
5. **Start date** — a calendar day, or a counted offset from a named event ("15 days after the contract is signed"). "ASAP", "immediately", and a month with no day are absent.
6. **Selection** — selection steps or a selection timeline.
7. **How to apply** — present only when the advert names an email, a form, or a URL. An Apply button is leftover website text.
8. **Languages** — any named language counts, including as an asset.

Applicable only where the advert shows that they vary:

9. **Travel or roving** — applicable when the advert says the person travels, roves, or is mobile. Present when a share, a percentage, or a repeating pattern is given, including a stated zero ("no travel"). Silence leaves it out of both sides of the count.
10. **Hours or level of effort** — applicable when the advert says hours or effort vary, or says part-time, or gives a shift or percentage pattern. "Part-time" with no hours, percentage, or pattern is applicable and absent. Present when a number, a percentage, or a clear pattern of hours or days is given. The word "part-time" alone is not that pattern. A bare "full-time" leaves hours not applicable. Silence leaves it out of both sides.

Let `A` be the number of applicable facts, `P` the number present, and `pay` be 1 when pay is present and 0 when it is absent. Pay is already inside `P` and inside `A` once. The extra `pay` is its second count.

**Anchors.**

- **0.** Fewer than a third of the applicable facts, and no pay: `pay = 0` and `3*P < A`.
- **1.** Pay is present, or at least one third of the applicable facts are present, and the weighted share is still under two thirds: (`pay = 1` or `3*P >= A`) and `3*(P+pay) < 2*(A+1)`.
- **2.** The weighted share is at least two thirds, and at least one applicable fact is still absent: `3*(P+pay) >= 2*(A+1)` and `P < A`.
- **3.** All applicable facts, pay included: `P = A`.

With the eight always-applicable facts and neither conditional fact: pay plus four other facts is a 2 (`P = 5`, weighted points 6 of 9); pay plus three other facts is a 1; three facts and no pay is a 1; two facts and no pay is a 0. All seven non-pay facts, with pay absent, is a 2.

**What separates 1, 2, and 3.** A 1 has crossed the thin line (some pay, or a third of the facts) and still leaves the weighted share under two thirds. A 2 has reached two thirds and still misses something. A 3 is the full applicable set, which includes pay. A stated pay figure with few other facts is a 1. A full set except the selection timeline is a 2. Pay alone is a 1. There is no 3 without pay.

**Example A (score 1).** Travel and hours are silent, so `A = 8`. Present: pay, Kisumu, the email, English. The contract has a type and no length. `P = 4`, `pay = 1`. `3*4 >= 8`, and `3*(4+1) = 15` against `2*9 = 18`.

> Riverbend Aid seeks a Finance Officer in Kisumu. The role is a national fixed-term contract. Monthly pay is 1,850 USD. Apply by email to [email]. English is the working language.

**Example B (score 2).** `A = 8`. Present: pay, contract type and length, Mombasa office, closing date with clock time and time zone, start date, the form, languages. Selection steps are absent. `P = 7`, `pay = 1`. `3*(7+1) = 24` against `2*9 = 18`, and `P < A`.

> Coastal Relief Network invites a Logistics Officer for its Mombasa office, on a 9-month consultant contract. Pay is 2,400 to 2,700 USD a month. The post starts on 6 April 2026. Send a CV by the form at the address on this page before 18:00 East Africa Time on 20 March 2026. English and Kiswahili are required.

**Edge cases.**

- Equality goes upward. `3*P = A` is a 1 when the weighted test fails. `3*(P+pay) = 2*(A+1)` is a 2 when the set is still incomplete.
- The closing fact needs a calendar day, a clock time, and a time zone together. A day alone is absent. A month with no day does not fill a date. Findability's closing fact is a different, weaker test.
- "Some travel" or "hours vary by season", with no share and no figure, makes that fact applicable and absent. "One week in four" and "50 percent level of effort" are present.
- A stated range is one pay fact. Two contradictory pay figures still leave pay present. Two different closing days leave the closing fact absent.
- Job-posting data can supply pay, place, employment type, and a closing day. It supplies the closing fact only when time and time zone are there too.
- Length with no contract type is absent, the same as type with no length. How to apply is absent when the advert names no email, form, or URL.

## 2. specificity (weight 15) — CODED

**Definition.** Score how concrete the duty units are. Score duty units only. Requirements, benefits, employer facts, and signature lines do not count, and do not infer duties from the title.

Count a duty unit only after the edge cases below (a requirement is not a unit, a duplicated duty is one unit, and no duty section scores 0). Let `n` be the number of units, `k` the number with at least one kind, and `d` the number with at least two kinds. A kind counts only when it is a number, a named place, a named standard, a named product or system, a frequency, a named counterpart (a role or an organisation, not "the team", "partners", or "stakeholders"), or a scale. A unit counts toward `d` only when you can name both kinds on that unit.

**Anchors.** Apply in this order and stop at the first match.

- **0.** `k = 0`.
- **1.** `k >= 1`, `3*k < n`, and `d = 0`.
- **3.** `5*d >= 3*n` (at least 60 percent of the units each clearly carry two kinds you can name). A score of 3 is uncommon.
- **2.** Every remaining case, including breadth without depth and one deep unit in an otherwise generic list. Breadth with one kind per duty stays 2.

**Choosing between 2 and 3.** If you are choosing between 2 and 3, score 2 unless at least 60 percent of the duty units each clearly carry two kinds you can name. Breadth with one kind per duty stays 2. A score of 3 is uncommon.

**What separates 1, 2, and 3.** A 1 is a thin set: at least one unit has a kind, fewer than a third of the units have any kind, and none has two. A 3 is depth across the list: at least 60 percent of the units each clearly carry two kinds you can name. A 2 is every remaining case. Breadth without that depth stays a 2, and so does one deep unit in an otherwise generic list. Breadth with one kind per duty stays 2.

**Example A (score 1).** Five duties. Only the last has one kind (a named spreadsheet product). The others name no number, place, standard, product or system, frequency, counterpart, or scale. `n = 5`, `k = 1`, `d = 0`, and `3*1 < 5`.

> Riverbend Aid, Logistics Assistant. Maintain warehouse stock records. Support distribution to partners. Coordinate with the team on invoices. Attend team meetings. Help prepare reports using Excel.

**Example B (score 2).** Five duties. Two carry one kind each (a number; a named database). None carries two kinds. `n = 5`, `k = 2`, `d = 0`. `3*2` is not under `n`, and `5*d` is under `3*n`, so the score is the remaining case.

> Coastal Relief Network, Monitoring Officer. Visit three field hubs to verify tally sheets. Enter the figures into FieldLedger. Draft a brief for the team. Support ad hoc surveys. Join partner calls as needed.

**Edge cases.**

- A bullet that is only a requirement ("a degree is required") is not a duty unit.
- "National" or "international", without a named country, region, or site list, is generic.
- A frequency with no task ("weekly meetings" as the whole line) is one kind, on that one unit.
- The same duty copied twice is one unit. Do not double-count it.
- If there is no duty section, score 0. Do not infer duties from the title.

## 3. realistic_must_haves (weight 15) — CODED

**Definition.** Score whether the essentials are few, labelled, and appropriate to the level, and whether real essentials the duties need are stated (a local language, a licence, a professional registration). Desirables should be separated from essentials.

A **severe** inflation is a postgraduate degree for an assistant or officer post outside a UN grade formula, a senior skill on a junior or very short post, or years of experience more than the level's own minimum. One severe inflation in a labelled list is a **1**. Two or more, or a senior set with no desirable label, is a **0**. A UN grade's own published minimum is not inflation and does not count toward the 3-to-5 cap.

A **soft** flaw is exactly one of: one essential with no matching duty, one missing real essential, or one requirement a single step above the level. One soft flaw in a labelled list of at most five essentials is a **2**.

**Anchors.** Match in the order 0, 1, 3, 2.

- **0.** No usable split, unless the essentials can be separated with no guesswork, in which case score that separated list. Also a 0: two or more severe inflations, a senior set with no desirable label, or an unlabelled mix.
- **1.** Labelled split, and any of: six or more essentials outside the UN minimum, one severe inflation, or two or more essentials with no matching duty.
- **3.** Labelled split, three to five essentials outside the UN minimum, no severe inflation, no soft flaw, and the local language, licence, or registration named where the duties need it.
- **2.** Labelled split, no severe inflation, and exactly one soft flaw, with at most five essentials outside the UN minimum.

**What separates 1, 2, and 3.** A 1 is a labelled list with six or more essentials outside the UN minimum, one severe inflation, or two or more essentials with no matching duty. A 2 is a labelled list of at most five essentials, no severe inflation, and exactly one soft flaw. A 3 is a labelled split, three to five essentials outside the UN minimum, no severe inflation, no soft flaw, and the real essentials named where the duties need them. One severe inflation in a labelled list is a 1, not a 0. Two severe inflations, or an unlabelled mix, is a 0.

**Example A (score 1).** The split exists, so the list is not undifferentiated. Six essentials, and one severe inflation (a master's degree on a short community post, outside any grade formula). The licence matches the travel in the duties.

> Highland Health Trust, Community Mobiliser, 6 months. Essential: a secondary-school certificate; one year of community work; spoken English; a motorcycle licence; willingness to travel to villages; a master's degree. Desirable: a first-aid certificate. You visit villages, explain the clinic timetable, and record who attends.

**Example B (score 2).** Clear split, five essentials, no severe inflation, and exactly one soft flaw: a driving licence with no matching duty.

> Riverbend Aid, Finance Officer. Essential: an accounting certificate; three years of bookkeeping; donor reporting; use of the office spreadsheet; a valid driving licence. Desirable: a certificate in a named finance system. You keep the project ledgers and file the monthly donor pack. The role does not involve driving.

**Edge cases.**

- A UN grade's published minimum of education or years is not inflation and does not count toward the 3-to-5 cap. Extra requirements on top of that minimum still need a matching duty.
- "Fluent English" on a post recruited across countries is not automatically inflation. Omitting the local language when the duties are community conversations is a missing real essential: a 2 when that is the only soft flaw and the labelled list has at most five essentials, a 1 when the list also has six or more essentials.
- One combined list with no labels is a 0, unless the essentials can be separated with no guesswork, in which case score that separated list.
- A licence or registration sitting only under desirable, while the duties require driving or clinical work, is one missing real essential. That is a 2 when the list is labelled, has at most five essentials, and has no severe inflation.
- An intern or volunteer post that requires senior management experience takes the severe-inflation path. With no split that isolates it as desirable, that is a 0.

## 4. clear_outcomes (weight 10) — CODED

**Definition.** Score whether the advert says what the post is for and how success is seen: scope (team, budget, caseload, or a clear boundary of the remit), deliverables, and results or targets (a number, a date, or a pass/fail standard). A purpose line counts only when it carries scope or a measurable result. A slogan does not.

**Anchors.**

- **0.** None. Duties only, with no purpose, scope, deliverable, or success measure.
- **1.** A vague purpose only ("support the team", "contribute to the work"), with no scope and no measurable or time-bound result.
- **2.** Scope or deliverables, without measurable results: a caseload, team size, or budget band, or named outputs, but no target. Or numeric targets with no scope around them. Named outputs without targets stay 2. "Monthly report", with no quality bar and no date, is 2.
- **3.** Scope and a measurable, dated, or pass/fail result, both required: a remit boundary (team, budget, caseload, or a clear boundary of the remit), and a quantified target, a date, or an explicit pass/fail standard. Named outputs without targets are not a 3.

**Rule for 3.** A 3 requires scope and a measurable, dated, or pass/fail result. Both are required. Named outputs without targets stay 2. "Monthly report", with no quality bar and no date, is 2.

**What separates 1, 2, and 3.** A 1 is aspiration. A 2 names what is in play, or gives a number alone, but not the pair. Named outputs without targets stay 2. A 3 links the remit to how achievement is judged: scope, and a measurable, dated, or pass/fail result. "Submit a monthly report" with no quality bar and no date is 2.

**Example A (score 1).** Purpose only. No team, budget, caseload, deliverable, or target.

> Coastal Relief Network, Programme Assistant. You will support programme implementation and help the team deliver sound services. The organisation values teamwork and commitment to its mission.

**Example B (score 2).** Scope (a team of eight, one named site) and deliverables (weekly stock checks, monthly summaries). No numeric target and no pass/fail standard.

> Highland Health Trust, Clinic Supervisor. Supervise a team of eight at the Marengo site clinic. Deliver weekly stock checks and monthly activity summaries to the area manager. Keep the patient flow moving during opening hours.

**Edge cases.**

- A results word in the title, with nothing in the body, is a 0.
- "Performance is reviewed each year", with no criteria, does not rise above 1.
- A budget marked as not yet set, plus clear output targets, is a 2. Both a scope and a measure are required for a 3.
- "Timely and high quality", with no statement of what timely means, is a 1, or a 2 if a real scope or deliverable is also there. It is not a 3.
- An outcome that sits only in an employer footer still counts, if it is in the text you were given.

## 5. field_realism (weight 10) — CODED

Score this dimension only when the advert uses field posting, field deployment, hardship, unaccompanied, or R&R, or says the person relocates to the duty station. Otherwise write `null`. Do not write 0 for a post outside that test. A 0 means the test is met and zero of the seven topics are closed.

A headquarters post, a fully remote post, and a commute in a capital, including day visits with no relocated residence, are `null`.

**Definition.** Seven topics: accompanied or not; hardship and rest and recuperation, which are **one** topic, closed by either a hardship category or an R&R rule; housing; security; travel mode; connectivity; and what is not provided. For each topic that applies, either a concrete statement or a plain "not stated" closes it. A generic line (no number, place, category, or named arrangement) is a close only for a score of 1. "Field based", and the words that show the dimension applies, are not one of the seven.

**Anchors.**

- **0.** Field, and zero of the seven closed. "Field based" alone is a 0.
- **1.** Exactly one topic is closed, and only by a generic line with no number, place, category, or named arrangement.
- **2.** Two or more topics closed but not all, or exactly one topic closed by a concrete fact.
- **3.** Every applicable topic is closed by a fact or a plain "not stated". No silent hole among the seven.

**What separates 1, 2, and 3.** A 0 is a field post with none of the seven closed. A 1 closes exactly one topic, and only with a generic line. A 2 closes two or more topics but not all, or closes exactly one topic with a concrete fact. A 3 closes every applicable topic with a fact or with an explicit "not stated".

**Example A (score 0).** The advert says "field posting", so the dimension applies. "Regular travel" names no mode. Nothing closes accompaniment, hardship and rest and recuperation, housing, security, connectivity, or what is not provided.

> Riverbend Aid, Field Coordinator, Karsen Valley. This is a field posting in the valley, with regular travel to village sites.

**Example B (score 1).** Exactly one topic, the hardship topic, closed only by a generic line with no category. Nothing else is closed.

> Highland Health Trust, Clinic Nurse. This is a hardship posting. You provide clinic care at the duty station.

**Example C (score 2).** Accompaniment, housing, a travel mode, and a security line are closed. "Hardship category B" closes the one hardship and rest-and-recuperation topic. Connectivity is silent, and so is what is not provided. The score is 2 because those two topics are silent.

> Coastal Relief Network, Water Engineer, field deployment. Unaccompanied posting. Hardship category B. Housing is in the district compound. A four-wheel-drive vehicle is provided for official travel. On security, follow the local warden's messages.

**Edge cases.**

- A headquarters post, a fully remote post, and a commute in a capital, including day visits with no relocated residence, are `null`.
- One topic closed only by a plain "not stated", with the other applicable topics silent, is a 2. A 1 requires a generic line. A 3 requires every applicable topic closed.
- "Accompanied status depends", with no rule and no pointer, does not close that topic. The score is then at best a 2, and only when other topics are closed.
- "As the organisation decides" counts for a topic only when that topic is named (housing, or rest and recuperation). Otherwise it does not close the topic.
- "Danger pay may apply", with no hardship category and no R&R rule, is a generic close of that one topic: a 1 when nothing else is closed. It is not a 2 and not a 3.
- A topic the post makes inapplicable is not a hole. Say so only when the dimension is scored. A post outside the field test is `null`, not a high score.

## 6. fairness (weight 10) — CODED

**Definition.** Score access and trust.

A trust signal is a no-fee notice, a sentence that names the only official channel, or a reference a candidate can check. An email address or a careers URL alone is not one. Concrete inclusion is an adjustment a person can ask for, or encouragement of a named group. A generic equal-opportunity sentence is not it. Low-bandwidth is an email or a short form that needs no account. If an attachment limit exists, it must be stated; an unstated limit does not by itself fail the test. A portal that requires large uploads, with no email or short form, cannot be a 3.

A fee, or a pointer to a paid placement, with no named official channel, is a **0** even when there is no demographic restriction. Stop. This is a deliberate extension of the survey plan's score 0 for this dimension (that cell is an unexplained restriction; this guide also scores the fee path as 0). If a channel is named, the fee does not by itself cap the score; apply steps 1 to 4.

Stop at the first match. Do not score a later step once an earlier step has matched.

**Stop box.**

- Fee, or a pointer to a paid placement, with no named official channel: **0**. Stop.
- Step 1. An unexplained faith, religion, age, or nationality bar (and the same for gender, family status, or a similar bar) with no trust signal: **0**. Stop.
- Step 1. The same bar with any trust signal: **1**. That 1 is a cap. Stop. Do not score 2 when step 1 matched.
- Step 2. No trust signal, and step 1 did not match: **1**. Stop.
- Step 3. Concrete inclusion, at least one trust signal, and a low-bandwidth route, and step 1 did not match: **3**. Stop.
- Step 4. Otherwise: **2**.

1. An **exclusion** with no duty-linked reason (faith, religion, age, nationality, gender, family status, or a similar bar). A preference or an encouragement does not count ("nationals preferred", "women are encouraged"). Accompanied or unaccompanied status is field realism, not this cap, unless the advert also excludes applicants by family status. If this step matches: **0** when there is no trust signal, **1** when there is one. Stop. Do not score 2 when step 1 matched.
2. No trust signal: **1**. Stop. A bare "email a CV" stays here.
3. Concrete inclusion, at least one trust signal, and a low-bandwidth route: **3**. Stop. The survey plan's score-3 cell for this dimension names the three items that cannot be missing; the low-bandwidth route is required as well because that same cell lists it in the dimension. An explained narrowing is not required for a 3.
4. Otherwise: **2**.

**Anchors.**

- **0.** The fee extension above, or step 1 with no trust signal.
- **1.** Step 1 with a trust signal, or step 2.
- **2.** Step 4.
- **3.** Step 3.

**What separates 1, 2, and 3.** A 1 is an exclusion that still has a trust signal, or a trust desert. A trust desert is only a 1: inclusion without a trust signal does not rise to a 2. A 2 is what remains when the fee test, the exclusion test, the trust test, and the score-3 test have not matched. Do not score 2 when step 1 matched. An unexplained faith, religion, age, or nationality bar with no trust signal is 0. The same bar with any trust signal is 1, and that 1 is a cap. A 3 has concrete inclusion, at least one trust signal, and a low-bandwidth route, and it has no unexplained exclusion. An explained narrowing is not required for a 3.

**Example A (score 1).** The age bar has no duty-linked reason, so step 1 matches and the score cannot rise above 1. The no-fee sentence is a trust signal, which keeps it off 0.

> Highland Health Trust. Applicants must be under 45. Send a CV by email to the address on this page. Highland Health Trust does not charge a fee to apply.

**Example B (score 2).** No exclusion, so step 1 does not match. Trust is present (a no-fee notice, and a sentence that names the only channel), so step 2 does not match. Inclusion is a generic welcome, and the only route is a web page, so step 3 does not match. The score is step 4.

> Riverbend Aid, Grants Officer. Riverbend Aid welcomes every qualified applicant. Apply through the careers page on this site. The organisation never charges a fee, and that page is the only channel.

**Edge cases.**

- An explained restriction ("this contract can be held only by someone with the legal right to work in the duty country", tied to the contract) does not match step 1. Score the later steps.
- "Nationals only", with a duty-linked reason (a government secondment the advert states), is not a cap. Without that reason it matches step 1.
- "Nationals preferred" and "women are encouraged" are not exclusions.
- A single "equal opportunity" sentence is not concrete inclusion, and does not by itself make a 3.
- A portal that requires large uploads, with no email or short form, cannot be a 3.
- The exclusion cap applies even when the no-fee notice and the inclusion lines are excellent. An unexplained bar plus those lines is a 1 when a trust signal is present, and a 0 when it is not. Do not score 2 when step 1 matched.

## 7. readability (weight 10) — AUTOMATIC

Human-scored in this pilot, for calibration.

**Definition.** Score whether the role text can be read straight through. The median sentence is 13 to 20 words. Shortened forms are written in full at first use. The text has no catch-all line, no duplicated wording, no template residue, no clash between title and body, and no conflicting dates. French uses this same word count, not an English grade formula. Set organisation, commitment, and legal sections aside when a heading marks them, and set the job-posting block aside, before both the median and the fault scan.

Split the role text on full stops, question marks, exclamation marks, and line breaks. Do not split on a decimal point or on e.g., i.e., etc., No., Mr., Ms., Dr., or St. Count the words of the rejoined sentence. Strip punctuation from the ends of tokens, then count tokens separated by spaces. A segment of 8 or more words is a sentence. When at least three sentences exist, the median uses only those. When fewer than three exist, the median uses every segment that still has a word. An even set uses the mean of the two middle values, unrounded. The title line stays out of the median. A shortened form of two or more letters, in capitals or with a capital inside it, is a fault when its full words have not already appeared. Currency codes, and CV, are exempt.

Length band `L` from the median `m`:

- `L = 3` when `13 <= m <= 20`
- `L = 2` when `10 <= m < 13` or `20 < m <= 25`
- `L = 1` when `7 <= m < 10` or `25 < m <= 30`
- `L = 0` when `m < 7` or `m > 30`

**Six-fault checklist.** Each category is 0 or 1. Sum them as `F`. When you are unsure whether a fault applies, count it.

1. A shortened form whose full words are missing at first use.
2. A catch-all line: a sentence that reserves unnamed extra work for a supervisor and states no concrete task of its own.
3. The same run of 8 or more consecutive words twice.
4. Template residue: an unfilled bracket, a drafter's note, or a string of placeholder characters.
5. A title and body that disagree on the function, the level, or the duty station.
6. Conflicting dates: two different calendar days for the close, two for the start, or a start on an earlier calendar day than the close.

The score is `max(0, L - F)`.

**Anchors.**

- **0.** Several of these faults. The score is `max(0, L - F) = 0`: `L = 0`, or `L - F <= 0`.
- **1.** `max(0, L - F) = 1`. A typical case is a median inside 13 to 20 with exactly two coded faults, or a median in the band just outside 13 to 20 with one coded fault.
- **2.** `max(0, L - F) = 2`. A typical case is a median inside 13 to 20 with exactly one coded fault, or a median in the 10-to-12 or 21-to-25 band with no coded fault.
- **3.** None of these faults. A median inside 13 to 20 with `F = 0` is the only 3 (`L = 3` and `F = 0`). Any counted fault keeps the score off 3.

**What separates 1, 2, and 3.** The score is `max(0, L - F)`. A 2 is one step off a clean text: the median sits just outside 13 to 20, or a single coded fault sits on a median already in range. A 1 is two steps off. A third step, or a median outside 7 to 30, is a 0. Many instances of one category still count as one fault. Three categories on a healthy median are a 0. When you are unsure whether a fault applies, count it. A median inside 13 to 20 with `F = 0` is the only 3.

**Example A (score 1).** Sentence lengths 13, 15, 13, 11. The mean of the two middle values is 13, so `L = 3`. Faults: the third sentence is a catch-all, and GMS is never written in full. `F = 2`. Score `3 - 2 = 1`.

> Grants Officer
>
> Riverbend Aid is hiring a Grants Officer for its small coastal grants desk. You will track donor files and draft two reports each month for the grants lead. Other tasks may be added by the supervisor whenever the desk needs them. Staff update the GMS at the end of each working day.

**Example B (score 2).** Sentence lengths 13, 15, 12, 13. Median 13, so `L = 3`. One fault: KOBO is never written in full. `F = 1`. Score `3 - 1 = 2`.

> Monitoring Officer
>
> Coastal Relief Network seeks a Monitoring Officer to work from its Lamu office. You will visit three clinics each month and check whether records match the tally sheets. You will brief the county lead every Friday morning in plain language. The field team stores each clinic form in KOBO before leaving the site.

**Edge cases.**

- The bounds are inclusive. A median of 13 or 20 is band 3. A median of 10, 12, 21, or 25 is band 2. A median of 7, 9, 26, or 30 is band 1.
- An even median uses the exact mean. 12.5 is band 2. 20.5 is band 2. 9.5 is band 1. 6.5 and 30.5 are band 0.
- Repeated instances of one category add nothing to `F`. A job title shorter than 8 words may repeat freely.
- The same moment written in two time zones is one date. A closing day and a later interview day are two events, not a conflict.
- The full words of a shortened form may appear in either language of a bilingual advert, provided they appear before the short form.
- `[email]` and `[phone]` are redactions, not template residue and not shortened forms.

## 8. right_length (weight 5) — AUTOMATIC

Human-scored in this pilot, for calibration. In the pilot answer, `right_length` is always an integer 0, 1, 2, or 3. Never `null`.

**Decision tree.** Apply these in order. Do not pick 3 until each one that applies has been checked.

(a) Read `Type:`. Do not infer the type from the prose. Do not guess a 3 when `Type:` is INGO and the body is mostly standard text.

(b) For an INGO or a UN agency or secretariat, count role-content words (`total - standard`), not the whole advert. For a local or national NGO, `n` is the whole advert.

(c) If organisation, legal, or commitment blocks are over half the advert (`2*standard > total`), score 0.

(d) A count below the lower band but at or above half that lower band (`2*n >= low` and `n < low`), with standard text at or under half, is 2, not 3.

(e) A count inside the band with boilerplate above one third (`low <= n <= high` and `3*standard > total`), and the share still at or under half, is 2, not 3.

**Definition.** Score whether the role wording sits inside the ceiling for that organisation type, and whether organisation and standard text crowd the role out. The bands are ceilings, never targets. Until Phase 2 records a measured norm, the stand-in norm for boilerplate is one third (`3*standard <= total`). Other organisation types have no band in this version.

Words are tokens separated by spaces, with punctuation stripped from the ends, the same way as readability. `total` is every word in the advert, including standard text. `standard` is words in organisation, commitment, and legal sections. For a local or national NGO, `n` is `total` (the whole advert). For an INGO or a UN agency or secretariat, `n` is `total - standard` (role content). The boilerplate share is `standard / total` for every type.

Do not infer the type from the prose. If `Type:` is absent, or it names neither a table row nor local or national NGO, INGO, or UN agency or secretariat, use the feel rules and write `length:estimate`.

Choose the row from `Type:` first. A full row name selects that row. The field and officer bands apply only inside local or national NGO. An INGO "Finance Officer" uses the INGO row.

Inside local or national NGO, when `Type:` does not already name the field row or the officer row, a published grade wins over the title: a G grade (written G or GS, with its number) uses the field band; a P, D, or NO grade uses the officer band. With no grade, the title words officer, coordinator, manager, head, adviser, advisor, or director use the officer band, and any other title uses the field band.

Let `low` and `high` be the band edges. Apply the first match.

**Anchors.**

- **0.** Far outside the band, or boilerplate over half the advert: `2*standard > total`, or `2*n < low`, or `2*n > 3*high`.
- **1.** Standard text is at or under half, and the count sits between five quarters of the ceiling and one-and-a-half times the ceiling: `4*n > 5*high` and `2*n <= 3*high`.
- **2.** Standard text is at or under half, and either the count is inside the band while boilerplate is above the stand-in norm, or the count is just outside the band: from half the lower bound up to the lower bound (`2*n >= low` and `n < low`), or from one word over the ceiling up to five quarters of the ceiling (`n > high` and `4*n <= 5*high`).
- **3.** Within the band, and boilerplate at or below the type's norm: `low <= n <= high` and `3*standard <= total`.

| Type | `n` counts | Inside (3, if the share is at or under the norm) | Score 2 on length alone | Score 1 | Score 0 on length alone |
| --- | --- | --- | --- | --- | --- |
| Local / national NGO, field | whole advert | 200 to 400 | 100 to 199, or 401 to 500 | 501 to 600 | under 100, or over 600 |
| Local / national NGO, officer | whole advert | 350 to 600 | 175 to 349, or 601 to 750 | 751 to 900 | under 175, or over 900 |
| INGO | role content | 650 to 1,150 | 325 to 649, or 1,151 to 1,437 | 1,438 to 1,725 | under 325, or over 1,725 |
| UN agency or secretariat | role content | 700 to 1,300 | 350 to 699, or 1,301 to 1,625 | 1,626 to 1,950 | under 350, or over 1,950 |

A share over half is a 0 on any row. An in-band count with a share above one third and at or under one half is a 2. The length columns do not repeat that case.

**What separates 1, 2, and 3.** A 3 is inside the ceiling with standard text at or under one third. Do not guess a 3 when `Type:` is INGO and the body is mostly standard text: role-content words, not the whole advert, and a share above one third, are a 2 or a 0, not a 3. A 2 is a near miss: inside the ceiling with standard text above one third and at or under one half, or just short of the lower bound (below the lower band but at or above half that lower band), or modestly over the ceiling, while standard text stays at or under half. A count below the lower band but at or above half that lower band is 2, not 3. A count inside the band with boilerplate above one third is 2, not 3. A 1 is only the further overflow, past five quarters of the ceiling and still at or under one-and-a-half times it. Half the lower bound, and one-and-a-half times the ceiling, are the far-outside lines. A count on the lower bound is inside the band.

**Pilot, when you cannot apply a band.** If `Type:` is absent, or it names neither a table row nor local or national NGO, INGO, or UN agency or secretariat (a donor, a contractor, a Red Cross or Red Crescent society, a foundation, a research body, a domestic charity, or any other type not in the table), still give 0, 1, 2, or 3, from length feel, and put `length:estimate` in the note. Do not borrow a neighbouring band. Do not infer the type from the prose.

- Feel of 0: boilerplate is over half, or the advert is a stub, or it is far too long for the kind of post.
- Feel of 1: clearly long, or the role text is thin beside a long standard section, and standard text is not most of the advert.
- Feel of 2: a bit long or a bit short, or standard text is noticeable and still under half.
- Feel of 3: the role text is the bulk, the length feels ordinary for that kind of post, and standard text does not crowd it.

A text with no words scores 0. Add `length:estimate` as well when the missing piece is the type. When a band does apply, do not write `length:estimate`.

**Example A (score 1).** Score the stated counts; the extract only shows the kind of sentence. `Type:` is local or national NGO. No published grade. The title is Finance Officer, so the officer band applies (350 to 600). Whole advert 820 words. Standard text 200 words. The share is under half (`2*200 = 400 <= 820`) and under the stand-in (`3*200 = 600 <= 820`). `4*820 = 3,280 > 5*600 = 3,000`, and `2*820 = 1,640 <= 1,800`. The count is in the score-1 overflow.

> Finance Officer, Riverbend Aid. You reconcile three project accounts each week, file the monthly pack for the board, and chase two late partner returns before the fifth working day. You sit in the Kisumu office and report to the finance lead.

**Example B (score 2).** `Type:` is local or national NGO. No published grade. The title is Logistics Officer, so the officer band applies. Whole advert 520 words. Standard text 200 words. `n = 520`, inside 350 to 600. `3*200 = 600 > 520`, so the share is above the stand-in. `2*200 = 400 <= 520`, so the share is at or under half.

> Coastal Relief Network was formed by neighbours after the 2019 floods, and it still introduces that story at the top of every post. The Logistics Officer in Mombasa books the warehouse gate, counts inbound kits each morning, and sends the stock note by noon.

**Edge cases.**

- A share of exactly one half fails `2*standard > total`, so it is not a 0. A share of exactly one third meets the score-3 boilerplate test when `n` is inside the band.
- One word over the ceiling is a 2 when the share is at or under half and `4*n <= 5*high`. The last score-1 count is the largest `n` with `2*n <= 3*high`. The next word is a 0.
- For an INGO or a UN agency, a long legal annex leaves `n` unchanged and can still force a 0 through the share. For a local or national NGO the same annex also raises `n`, because `n` is the whole advert.
- "Field Officer", with no published grade, uses the 350-to-600 band. A G or GS grade uses the field band even when the title says officer. A community mobiliser title with none of the officer-band words, and no P, D, or NO grade, uses the 200-to-400 band.
- Do not leave this key null in the pilot, including when the type is unknown.

## 9. findability (weight 5) — AUTOMATIC

Human-scored in this pilot, for calibration.

**Definition.** Score whether a searcher, and a search engine's job-posting fields, can tell what the job is. The title carries a recognised function and a level, rather than only an internal code, and it avoids a capital-letter title and the symbols `! * # @`. The eight facts are: title; description; posting date; closing date; organisation; place or remote; employment type; salary.

Strip a parenthetical or trailing reference code (digits, a letter-and-digit code, or the word "ref" plus a code) before reading the title. The remainder has a function when it names the work in ordinary words a candidate would search (finance, logistics, grants, monitoring, health, nursing, engineering, and the same kind of word). A slogan, "team member", or only an internal code is not a function. It has a level when it contains assistant, officer, coordinator, manager, head, adviser, advisor, director, intern, fellow, or lead, or a published grade token such as G, P, D, or NO with its number or letter. A title is clear when that remainder has both a function and a level, contains none of `! * # @`, and passes the capital-letter rule: if the title has at least 4 letters, half or fewer of those letters are capitals. "MEAL Officer" passes. A title whose letters are mostly capitals fails the clear test and can still keep its function word.

A fact is present or absent:

- title: any title string is stored
- description: at least 8 words of body beyond the title
- posting date: a calendar day labelled as posted or published (including `date posted` in the job-posting block)
- closing date: a calendar day labelled as the close or the apply-by day. A clock time is not required here. This is weaker than decision facts' closing fact.
- organisation: the employer is named
- place or remote: a city, country, office, camp, or an explicit remote or home-based arrangement
- employment type: full-time, part-time, consultant, intern, volunteer, temporary, fixed-term, or casual. "national staff", "international staff", and "local staff" do not count. "staff contract" and "staff position" do.
- salary: the same pay test as decision facts (a figure, a range, a named scale, or a named allowance)

Let `G` be how many of the eight are present (0 to 8). Test in this order and stop at the first match.

**Anchors.**

- **0.** An internal or vague title, and required facts missing: no recognised function, and fewer than 4 of the eight facts.
- **3.** A clear title and all 8 facts. Clear means a function and a level, none of `! * # @`, and the capital-letter rule, all together. `G = 8` is required as well. Either one missing keeps the score off 3.
- **1.** The title has a function and `G` is 4 or fewer. A clear title with `G` at most 4 is still a 1. Also a 1: the title has no function and `G` is at least 4.
- **2.** The title has a function, `G` is at least 5, and the score is not 3. A function with `G` from 5 to 7 is a 2 when the title is not clear, and a clear title with `G` under 8 is a 2 when `G` is still at least 5. A function with all 8 facts when the title is not clear (no level, a capital-letter title, or a forbidden symbol) is a 2.

**What separates 1, 2, and 3.** A 3 needs a clear title (a function and a level, and the capital-letter and symbol rules) and all 8 facts. A function with `G` from 5 to 7 when the title is not clear is a 2, and a clear title with `G` under 8 is a 2 when `G` is at least 5. A function with `G` at most 4 is a 1, including when the title is clear. Seven facts with a clear title is a 2. A 1 is also no function word with at least four facts. A code-only title with three or fewer facts is a 0.

**Example A (score 1).** The title has a function and a level, ordinary capitals, and none of the four symbols, so it is clear. Present: title, description, organisation, place. Absent: posting date, closing date, employment type, salary. `G = 4`.

> Grants Officer
>
> Riverbend Aid, Kisumu. You will check partner receipts and file the monthly grant folder for two donor awards.

**Example B (score 2).** The title is clear. Present: title, description, posting date, closing date, organisation, place, employment type. Salary is absent. `G = 7`.

> Logistics Officer
>
> Coastal Relief Network posted this on 2 March 2026. The work is full-time at the Mombasa warehouse, and the closing date is 20 March 2026. You schedule inbound trucks and keep the stock book.

**Edge cases.**

- All eight facts with a function and no level is a 2. All eight facts with no function word is a 1. A clear title with four facts is a 1.
- More than half the letters in capitals fails "clear" and leaves the function test untouched, so a shouted title with five or more facts is a 2.
- One calendar day fills only the event its label names. An unlabelled day fills neither posting nor closing. The same day may fill both when each label is present.
- "national staff", "international staff", and "local staff" do not count as an employment type. "staff contract" and "staff position" do. "Various locations", with no named place and no remote wording, leaves place absent.
- A parenthetical code beside a clear title, as in "Finance Officer (REF 441)", is removed before the function and level test and does not by itself fail the title. A title that is only "REF 441" has no function.

## Changes in version 1.1 (15 November 2026)

The user's 10-advert session was skipped (user, 15 November 2026). This calibration uses only the sealed dual-coded pilot disagreements. Passing dimensions are unchanged: decision facts (exact 0.80, weighted kappa 0.77), realistic must-haves (0.90 / 0.69), and field realism (0.90 / 1.00). Weights are unchanged. The plan's meanings of 0 and of 3 are unchanged. Only the six dimensions below the agreement line (exact agreement under 0.70, or weighted kappa under 0.60) are adjusted.

- **Specificity** (exact 0.45, weighted kappa 0.18). The split was almost always coder A at 2 against coder B at 3. Coder B (Composer) overscored 3. The sealed score was 2. Added the rule: if you are choosing between 2 and 3, score 2 unless at least 60 percent of the duty units each clearly carry two kinds you can name. Breadth with one kind per duty stays 2. A score of 3 is uncommon.
- **Right length** (exact 0.20, weighted kappa 0.37). Coders mis-applied `Type:`, role-content words, and the standard-text share. The sealed scores followed this guide's cut-points on measured role words and the standard share. Added the decision tree at the top of the section: read `Type:`; for an INGO or a UN body, count role-content words, not the whole advert; organisation, legal, or commitment blocks over half the advert score 0; a count below the lower band but at or above half that lower band is 2, not 3; a count inside the band with boilerplate above one third is 2, not 3. Coders are told not to guess a 3 when `Type:` is INGO and the body is mostly standard text.
- **Readability** (exact 0.55, weighted kappa 0.59). Fault counting varied. A median inside 13 to 20 often set `L` to 3 while the scores were 0, 1, or 2. Added the six-fault checklist. The score is `max(0, L - F)`. When you are unsure whether a fault applies, count it. A median inside 13 to 20 with `F = 0` is the only 3.
- **Clear outcomes** (exact 0.85, weighted kappa 0.32). Few cells disagreed, and a 2 against a 3 moved kappa. Stated that a 3 requires scope and a measurable, dated, or pass/fail result. Named outputs without targets stay 2. "Monthly report", with no quality bar and no date, is 2.
- **Fairness** (exact 0.90, weighted kappa 0.50). Few cells disagreed, and a 0 against a 1 or a 2 moved kappa. Restated stop-at-first-match in one box. An unexplained faith, religion, age, or nationality bar with no trust signal is 0. The same bar with any trust signal is 1, and that 1 is a cap. Do not score 2 when step 1 matched.
- **Findability** (exact 0.75, weighted kappa 0.47). Coders split 1 against 2. The sealed score followed the measuring script. Stated that a 3 needs a clear title (a function and a level, and the capital-letter and symbol rules) and all 8 facts. A function with `G` from 5 to 7 when the title is not clear, or a clear title with `G` under 8 and `G` still at least 5, is 2. A function with `G` at most 4 is 1.

Version 1.1 (15 November 2026). Frozen for the rescore of the pilot of 20. Score these anchors as written.
