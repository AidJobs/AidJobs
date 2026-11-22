# Employer demo — master JD-generator assessment

**Branch:** `demo/employer` (never merge)  
**Recorded:** 15 November 2026  
**Purpose:** Survive chat loss. This file is the fix backlog and the living assessment of the job-description generator. Update it when a finding is fixed or a new round lands.  
**Preview:** `https://aid-jobs-frontend-git-demo-employer-aidjobs-projects.vercel.app/employer-demo`  
**Code:** `apps/frontend/components/employer-demo/` in the `AidJobsGit-employer-demo` worktree  
**Related plan:** `docs/architecture/employer-side-plan.md` (Round 7 / Phase 6 polish and later)

**Demo AI (20 November 2026):** User confirmed **OpenRouter credits are up and running** on the employer demo preview — chat/AI paths that call OpenRouter can be exercised again during review and manual QA (Vercel env still gated to `demo/employer` only; no secret values in this file).

**User lock (15 November 2026):** Finalise **English** first. Language-variant work waits unless a bug blocks English chrome. Do not invent polish; fix only recorded findings the user prioritises.

**Recommended fix order (English first), unchanged until the user says otherwise:**

1. ~~Progress line / window chrome (U-1)~~ — **Fixed 20 Nov 2026** (user confirmed on preview)  
2. ~~Undo / remove / walk focus (no Market steal; keep Undo until used)~~ — **Fixed 20 Nov 2026** (U-2; user confirmed on preview, including Removed-note hide)  
3. ~~About us / Project (U-3)~~ — **Fixed 20 Nov 2026** (Step A + Step B; preview confirmed)  
4. ~~Grip: Project/Background when relevant; open menu without accidental drag~~ — **Fixed 20 Nov 2026** (U-4; user confirmed Step A + Step B)

5. ~~Approve vs unsaved buffers; Add-panel blur/Escape~~ — **Fixed 20 Nov 2026** (Step A R1-06; Step B R1-11; user confirmed on preview)

**Next (22 Nov 2026, after R1-18):** **R1-27** (groups invisible in draft; Move up silently joins neighbouring group). User approved investigate → A–E in a new chat. Phase 7 held.

---

## Round 1 — 15 November 2026 (recorded from chat + four independent agents)

**Agents:** [HR review UN agency](c56d4342-bc46-4b16-a61d-22cccb85cb07), [HR review local NGO](f87e9add-a843-44ea-a3eb-6c534199501a), [HR review INGO](54c43449-021d-4c76-977c-d0b3853bd5c6), [UX chrome audit](b6ab0953-572b-4d59-807e-442ed88e9a17).  
**Code tip when Round 1 was taken:** polish commits through `13891bb` (later tip may move; re-verify before fixing).

### A. User-reported bugs (confirmed in code) — U-1–U-4 Fixed

| ID | Status | Fault | Evidence |
| --- | --- | --- | --- |
| U-1 | **Fixed** (20 Nov 2026) | Progress line on the **job panel** (phase 3), flush under the window header; measure-row bug removed; header and progress hairlines removed; chat in `aj-card` aligned with the progress line; `+N` clear of the connector; side menu resizable (drag open/close) with open/closed remembered. | User confirmed on preview, 20 Nov 2026 |
| U-2 | **Fixed** (20 Nov 2026) | Undo / remove / walk no longer open Market over the JD; chat undo and `lastChange` pin like icon Undo. Removed note hides after ~2s **without** clearing `undoStep` (polish `3f0f4c4` + R1-05; U-2 had wrongly left the note forever). | User confirmed on preview, 20 Nov 2026 (Market steal + Removed note hide) |
| U-3 | **Fixed** (20 Nov 2026; Step A/B; JD open→write→Save/Cancel `6670de3`) | Step A/B as before. Follow-up: About us / Project match other sections — pencil opens one box with Save/Cancel; link/Read/Draft/Upload fill that same box (no always-on second pad). Project Save still uses `intoSection` (no heading rename / parent wipe). Chat window PageField still uses draft card Accept. | User confirmed on preview, 20 Nov 2026 |
| U-4 | **Fixed** (20 Nov 2026; Step A `314a4b0`, Step B `b7fbbf4`) | Step A: one `background` slot; Add uses format heading; no force-rename; no duplicate Project chip. Step B: grip drag threshold 3→12px so a normal press opens the menu (R1-10 click part). Fake Moved at ends closed 21 Nov 2026; group drops + remove-group rehome closed 21 Nov 2026 (R1-10 leftover). | User confirmed Step A and Step B on preview, 20 Nov 2026 |

### B. Combined open findings (Round 1)

#### P0 — stops trust or a real publish

| ID | Status | Fault | Who |
| --- | --- | --- | --- |
| R1-01 | **Fixed** (U-3, 20 Nov 2026; open→write confirmed) | About/Background reading view shows parent lines + subs. JD helpers (URL/Read/Draft/Upload) live inside the open pencil editor, not a second always-on pad. | NGO, chrome |
| R1-02 | **Fixed** (U-3, 20 Nov 2026; open→write confirmed) | Project yes/ok/sure no longer skips; bullet / short paste drafts via `you told us`. JD About/Project: open→write→Save/Cancel like other sections; chat setup card still draft-until-Accept. | NGO, INGO |
| R1-03 | **Fixed** (R2-P0-3, 21 Nov 2026) | “Use our About us as it is” sets `pack.about`; Local NGO concise stays pack-only with honest chat (no orphan About); templates with `about` write the section. | NGO |
| R1-04 | **Fixed** (with U-2, 20 Nov 2026) | Undo / remove / walk: focus steal to Market; remove can mount Market without scroll; lingering `lastChange`/`undoStep` permanently skips later Market open; chat Undo may not pin part. | Chrome, INGO, U-2 |
| R1-05 | **Fixed** (U-2 + note-hide follow-up, 20 Nov 2026) | Removed note auto-dismiss (~2s) called `dismissChange` and deleted Undo. Now the note hides in the UI only; `undoStep` stays for chat Undo until the next change. | Chrome |
| R1-06 | **Fixed** (20 Nov 2026; Step A `eccb4a7`) | Approve hidden while pencil open; Save that changes text clears `walk.approved` for that section (`editSection` / project Save). | User confirmed on preview, 20 Nov 2026 |
| R1-07 | OPEN | Language “Mark as reviewed” while still source language; Remove language permanent (live too); tab X confirms but no Undo. | INGO *(language — defer unless blocks English)* |
| R1-08 | OPEN | UN templates not classifiable: competencies, education, grade/GS/ICS, NY closing time, fake ICSC pay, no PSEA/special notice, CV-style apply. | UN *(format content — after English chrome)* |

#### P1 — English JD chrome / outline / workflow

| ID | Status | Fault |
| --- | --- | --- |
| R1-09 | **Fixed** (22 Nov 2026) | **U-1 placement Fixed 20 Nov 2026.** +N: sliding window ending at current so Review/Languages stay with Publish. Phone parts-over-icons: R2-P1-10. Eye until writing: kept (nothing to preview in setup). |
| R1-10 | **Fixed** (21 Nov 2026; click/drag U-4 B; fake Moved `7475fda`; group drops + rehome; agent confirmed on preview) | Grip threshold 12px; fake “Moved” at ends closed; outline group drag shows `data-group-drop` insertion bar; `removeGroup` rehomes sections (catalog → own group; custom → previous/next/`job`); Undo restores; AI path same. Draft has no group grips (by design). |
| R1-11 | **Fixed** (20 Nov 2026; Step B `732a06f`…`9e4ae13`) | Enter commits; blur/Escape cancel. Add your own under every group. After Enter-add, JD scroll preserved (no jump to top). | User confirmed on preview, 20 Nov 2026 |
| R1-12 | **Fixed** (21 Nov 2026) | Section headers wrap; change note full-width with Also-in / Undo visible (StepNote-shaped). Touch sizes/opacity: R2-P1-10. |
| R1-13 | **Fixed** (R2-P1-9, 21 Nov 2026) | Leaving Preview (progress part, Job description tab, walk, open/close tab) clears `preview` so Eye returns; Preview tab no longer lingers. | Agent confirmed on preview |
| R1-14 | **Fixed** (R2-P1-8, 21 Nov 2026) | Walk Check card uses `checkPoints` (same as progress); outline gaps block Check; google stays facts-only. |
| R1-15 | **Fixed** (22 Nov 2026) | Hide still pins the part; ask / walk / change auto-open clear `hidden` so the fields card returns (same as `goPart`). |
| R1-16 | **Fixed** (U-3 Step A, 20 Nov 2026; grip naming remains U-4) | Save no longer renames; shared `pageIntake` for JD + chat; Accept/Reject/skip clear intake so a dirty box cannot overwrite. |
| R1-17 | **Fixed** (U-3 Step B, 20 Nov 2026) | Bullets/short paste fixed in Step A. Sub-insert stays by design. Accept no longer auto-approves; Undo restores pack, body, and draft card. |
| R1-18 | **Fixed** (22 Nov 2026) | Free still hides Language versions on the progress line (by design). Chrome: plan chat Free-first; Amplify detail behind “What Amplify adds”; Check/Create language hints only on Amplify; progress part renamed Language versions. |
| R1-19 | **Fixed** (R2-P0-5, 21 Nov 2026) | After Approve, section header shows an **Approved** chip while `walk` is active; Edit+Save that changes text clears approval (R1-06) and Approve returns. |
| R1-20 | **Fixed** (21 Nov 2026) | Parts label vs Eye (R2-P1-10). Setup phone template strip Cancel returns to chat without applying. |
| R1-28 | **Fixed** (20–21 Nov 2026; `97e7fde`) | Pencil Save on How to apply no longer opens the How to apply fields card (`editSection` leaves `part` alone when that part has fields). Other sections still pin the progress line when the chat notices the edit. | User confirmed on preview, 21 Nov 2026 |

#### P2 — Languages / Amplify / UN policy (after English)

| ID | Status | Fault |
| --- | --- | --- |
| R1-21 | OPEN | French/Arabic drafts use catalogue headings / wrong source lines; AI French copied into Arabic. |
| R1-22 | OPEN | Market/full check English-only (`\d+ years`, Essential/Desirable). |
| R1-23 | OPEN | Flyer title + QR language-less; print CSS clips flyer; demo footer on flyer. |
| R1-24 | OPEN | Reach never settles step; invites English-only; team mail locked to one org domain. |
| R1-25 | OPEN | No Kiswahili; tab labels English vs native inconsistently; linking one language still shows link mark. |
| R1-26 | OPEN | UN: roster/pool wrong; eligibility Anyone; approval = author tick; inclusive flags parkable; Amplify full check can cut years / move essentials. |
| R1-27 | OPEN | Groups invisible in draft; Move up silently joins neighbouring group. |

### C. What Round 1 said works

- Chat quick replies (template, tone, one section vs all, “good”) move a novice without hunting menus.  
- One window: conversation + draft; publish does not post until pressed.  
- Arabic `dir="rtl"` on document/flyer/fixed editor with English controls `ltr`.  
- Market check names sample figures and stops below five similar jobs.  
- How to apply cannot be removed; content edit withdraws approval.  
- UN formats exist as their own family with expected headings; yearsFor uses familiar P/NO scales; past closing date flagged; fixed texts can be locked.

### D. Round 1 agent notes (pointers)

- Full UN top-10: agent `c56d4342-bc46-4b16-a61d-22cccb85cb07`  
- Full local NGO top-10: agent `f87e9add-a843-44ea-a3eb-6c534199501a`  
- Full INGO top-10: agent `54c43449-021d-4c76-977c-d0b3853bd5c6`  
- Full chrome High/Medium list (21 items): agent `b6ab0953-572b-4d59-807e-442ed88e9a17`  

---

## Round 2 — master assessment (relaunched 20 November 2026)

**Goal:** Exhaustive multi-persona pass over every tab, icon, menu, chat path, add/delete/save/cancel, workflow bottlenecks, design uniformity, and logic vs real HR use — novice to expert; local NGO, INGO, UN/donor; desktop and phone.

**Attempt 1 (15 November 2026):** All eight agents stopped on Cursor **weekly usage limit** before final reports (ids `406c4b33…` through `db60b9f0…` — no usable output).

**Attempt 2 (20 November 2026):** Relaunched after OpenRouter credits confirmed; synthesis into this file runs when all eight below finish (or as each completes, merged by parent agent).

| Persona | Focus | Agent id |
| --- | --- | --- |
| Novice local NGO | First JD; Save/Cancel; Undo; Free | [Novice NGO path R2](8442906c-3d03-4b4a-8a45-575f31966a17) |
| Programme manager | Chat vs icons; reorder; uniformity | [Programme manager R2](f89d6d5d-19b2-400e-b6b5-8fbeab44f4cb) |
| INGO talent acquisition | Languages; Amplify; Reach; flyer | [INGO TA R2](820bc43e-cbfc-4690-815f-1caef831312c) |
| UN / agency HR | UN format; clearance; chrome | [UN HR R2](25354dc1-d747-4981-be21-c5e2f542af3a) |
| Chat & walk auditor | Prompts; parks; dead ends | [Chat walk R2](c6278e66-6733-42d3-9872-0b2efbd22c89) |
| Chrome / icons / tabs | Every control inventory | [JD chrome R2](5269c381-e3ba-4468-9c1c-82c93246fbd3) |
| Design uniformity | Save/Cancel matrix; naming | [Design uniformity R2](991e0fd1-ac42-405e-818a-f2cf5ae86929) |
| Phone ~390px | Touch; clipped tools | [Phone R2](033c02d6-9e1f-40bd-a8a5-4e71b6565a6a) |

**Synthesis status:** *Complete (8/8, 20 November 2026). Deduped master list below.*

**Findings from Round 2:** *(append below; do not delete Round 1.)*

### [UN HR R2](25354dc1-d747-4981-be21-c5e2f542af3a) — Nadia Okello, UN country-office HR Officer

**Publishable: N** (demo essentials gate still passes; classifier would return the draft).

**Verdict:** Headings look UN; grade, education, competencies, eligibility, pay, closing instant, special notice, and apply method fail clearance. Chrome can make a good draft worse (Amplify cuts years; 2s Undo dismiss; Approve on unsaved buffer; progress line placement).

| R2-UN | Sev | Kind | Summary | Round 1 |
| --- | --- | --- | --- | --- |
| 1 | P0 | Content | UN body is NGO HR text (competencies, reporting line, education shape) | CONFIRMS R1-08 |
| 2 | P0 | Content | Riverstone B2–D2 vs P2–P4; GS/ICS/NPSA/IPSA not parsed; `G5` → wrong years line | CONFIRMS R1-08; **NEW** scale collision |
| 3 | P0 | Content | One ICSC USD band for all P/D grades and stations | CONFIRMS R1-08 |
| 4 | P0 | Content | Closing 23:59 duty-station TZ, not NY for IP posts | CONFIRMS R1-08 |
| 5 | P0 | Content | No full special notice / PSEA; agency “communities we work with” line | CONFIRMS R1-08 |
| 6 | P0 | Content | CV careers-site apply on INGO sample org, not Inspira/PHP | CONFIRMS R1-08 |
| 7 | P0 | Content | Eligibility “Anyone” not on UN outline (`practical` only) | CONFIRMS R1-26 |
| 8 | P0 | Content | Roster/pool wording = unpaid deployment block | CONFIRMS R1-26 |
| 9 | P0 | Content | Author Approve + skip review ≠ clearance | CONFIRMS R1-26 |
| 10 | P0 | Content | Full check rewrites years vs NGO sample (HR median ~3 vs P4 7) | CONFIRMS R1-26 |
| 11 | P1 | Content | Languages not UN levels; market pushes Swahili on Nairobi | NEW |
| 12 | P1 | Content | Contract picks not FTA/TA; no post number / org unit | NEW |
| 13 | P1 | Content | Safeguarding asked before person sections on UN formats | NEW |
| 14 | P1 | Content | Conditions block from high-risk station reorders vs Inspira | NEW |
| 15 | P1 | Chrome | Removed-section Undo dies at 2s | CONFIRMS R1-05 |
| 16 | P1 | Chrome | Undo/Market guard narrower after dismiss | CONFIRMS R1-04 |
| 17 | P1 | Chrome | Approve vs unsaved pencil | CONFIRMS R1-06 |
| 18 | P1 | Chrome | Progress line / icons (U-1, R1-09) | CONFIRMS |
| 19 | P2 | Chrome | Quality never blocks publish; past deadline advisory only | CONFIRMS gate |
| 20 | P2 | Content | Years inclusive skip on UN formats works; full check still rewrites | Works + hole |

**Works (UN path):** Dual UN formats and heading order; familiar P/NO year bands; grade underline hints; past deadline flagged; no-fee line; high-risk conditions section.

### [Design uniformity R2](991e0fd1-ac42-405e-818a-f2cf5ae86929) — action semantics across surfaces

**Verdict:** Save / Cancel / Approve / Undo / Remove / Add **do not mean the same thing** across chat, JD, pencil, About–Project field, languages, publish, and outline. **Uniform today:** pencil Save/Cancel on English and language versions; grip menu shape; Accept/Edit/Reject on drafts; How to apply cannot be removed.

**Action × surface (summary):** Chat setup cards — no Save/Cancel; yes/ok/sure skips project. JD title/facts — keystroke save, no Cancel. About/Project compact field — Save/Cancel but Save renames heading; hidden `sec.lines`. Section Approve — ignores pencil/`edit` buffer. Remove — grip immediate + 2s Undo; lang tab confirm, no Undo; lang Remove no confirm. Add — blur commits own name; Escape still adds (outline NameField differs).

**Top friction multipliers (Round 2):**

1. **Background / Project / About the project** — one key `background`, four names; grip “Add About the project” only when key missing; Save forces “About the project”. CONFIRMS U-4, R1-16.  
2. **Undo lifetime** — icon undo persists; remove undo + `lastChange` cleared at 2s (`dismissChange`); Accept, title, facts, lang remove often no undo. CONFIRMS R1-05, R1-04.  
3. **Approve vs buffer** — `approveSection` / “good” skip section while pencil or dirty PageField open; `walk.approved` not cleared on `editSection`. CONFIRMS R1-06.  
4. **Yes on project question** — same tokens as assent skip project and drop paste. CONFIRMS R1-02.  
5. **Clipped header row** — Approve/Undo/Also-in compete with ellipsis title. CONFIRMS R1-12.

**Findings (22):** Full matrix and items 1–22 in agent report; highlights:

| R2-UX | Sev | Summary | R1 |
| --- | --- | --- | --- |
| 1–5 | High | Naming, Save rename, form hides lines, yes-skip, Accept 40-char rule + no Undo + auto-approve | U-4, R1-01,02,17 |
| 6–8 | Med–High | Dual PageField buffers; Approve triple meaning; no “Approved” after tick | R1-06,19 |
| 9–11 | Med–High | 2s remove dismiss; `lastChange` vs `undoStep` split; chat undo order | R1-05,04; NEW facts no buffer |
| 12–15 | Med–High | Add blur/Escape; lang remove asymmetry; Mark reviewed while untranslated | R1-11,07 |
| 16–17 | Med | Grip 3px drag; group remove deletes sections | R1-10 |
| 18–22 | Med–Low | Label soup (Save/Done/Accept…); fixed-text variant controls; dual project UI during setup | NEW |

**Already uniform (keep):** Pencil Save/Cancel EN + langs; grip menu pattern; suggestion Accept/Edit/Reject; fixed-text pencil+grip; RTL version body / LTR chrome.

### [JD chrome R2](5269c381-e3ba-4468-9c1c-82c93246fbd3) — every tab and icon

**Verdict:** Uneven chrome. **Works:** Back, pencil Save/Cancel, progress dot states, fixed-text grip dead-ends, History dialog, reviewer Comment/Suggest. **Broken/partial:** Eye+Preview state, 3px grip drag, 2s remove Undo, Approve, language tab X, Add blur, phone label over Eye/History.

Full **icon inventory table** (Eye, History, progress, tabs, X, Approve, pencil, grip, +, gear, etc.) in agent report. **25 findings** — highlights:

| # | Status | Summary | R1 |
| --- | --- | --- | --- |
| 1 | **Fixed** (R2-P1-9) | Progress part while Preview open hides Eye; preview flag not cleared | R1-13 |
| 2–3 | Partial | Progress not under header; label clip; phone parts over icons | U-1, R1-09,20 |
| 4–7 | Broken/Partial | 3px grip; fake “Moved”; invisible group join; 2s dismiss | R1-10,05 |
| 8–10 | Broken/Partial | Approve ignores buffer; Project Save rename; no Approved mark | R1-06,16,19 |
| 11–14 | Partial/Broken | Header clip/opacity; Add no Cancel; lang X confirm-only | R1-12,11,07,25 |
| 15–25 | Partial | Unwritten sections; apply gear split; three close patterns; icon size soup; duplicate Flyer/Reach card | mixed |

**Uniformity note:** Fixed-text row is the strict pattern; section row is loose; language chrome looser still.

### [INGO TA R2](820bc43e-cbfc-4690-815f-1caef831312c) — Lea, multi-hub TA

**Verdict:** **Not publishable** for a multi-hub language launch. English Amplify path finishable; language/link/flyer/QR mostly **LANG-ONLY** (defer per English-first lock). **EN-BLOCK** items still block an English Amplify publish.

**21 findings** (tags EN-BLOCK / LANG-ONLY in agent report). EN-BLOCK highlights:

| # | Summary |
| --- | --- |
| 1 | `version` step cannot park — blocks Reach/flyer/publish |
| 2–3 | Pay for unreviewed/lang slot order wrong |
| 4 | Reach settled vs `reachPlan` disagree |
| 5 | Team email single `@org.domain` |
| 6 | Market/full check English patterns only |
| 7–8 | Flyer print clip + demo footer on field notice |
| 9 | Remove language no undo (except tab X confirm) |
| 21 | French edit withdraws English approval + stales flyer |

**Bottlenecks:** Serial walk; link-all vs miss-with-unlinked; one job cannot be multi-hub facts; QR/lang-less URL; Reach HQ-only.

**Works:** Free has no langs; Amplify price on button; RTL Arabic; tab X asks first; how to apply fixed.

### [Chat walk R2](c6278e66-6733-42d3-9872-0b2efbd22c89) — walk and prompts

**Verdict:** Single ordered walk is clear; **many replies leave the path** (yes/ok project, title=“Skip”, double bubbles, chat undo vs `lastChange`, 2s remove undo).

**Chat map** (agent report): template → About → Project → facts → tone → pace → write/approve → leftovers → go-out (checks, plan, review, Reach, flyer, publish).

**30 findings** — High (1–10): yes/ok skips project and About; card hides on non-quick reply; title stores Skip/Yes; email method loop; held+yes abandons park; chat undo leaves `lastChange`; 2s dismiss; stranded page draft; 40-char extract; dual buffers. **Medium (11–26):** double AI bubbles; leave-it vs Leave it as it is; no project not remembered; Accept renames/approves; version cannot park; essentials no park; AI project yes; eligibility/method gaps. **Low (27–30):** online→careers; hire-again ok; flag genuine; thinking duplicate.

**Dead ends** listed in agent report (project yes+hidden card, by-email loop, lang version, plan lockout, 2s undo, line stops following after text undo).

**Seamless:** `nextStep` order; template/tone/pace quick picks; explicit skip+hold+Next question; fact chips; AI tagged step no double bubble; how-to-apply protected.

### Round 2 — deduped master list (English-first)

**P0 — trust / wrong advert out (add to fix backlog after user priority)**

| ID | Finding | Round 2 sources |
| --- | --- | --- |
| R2-P0-1 | ~~**Free publish with empty / placeholder sections**~~ **Fixed 21 Nov 2026** (user confirmed on preview) | [Novice NGO R2](8442906c-3d03-4b4a-8a45-575f31966a17) #6 |
| R2-P0-2 | ~~**Sample org (Riverstone) on local NGO path**~~ **Fixed 21 Nov 2026** (Tumaini preset + recommendation ranking; user confirmed on preview, including live Key responsibilities local-scale) | Novice #1,5,7,14 |
| R2-P0-3 | ~~**About/Project setup leftovers**~~ **Fixed 21 Nov 2026** (user confirmed on preview, including Urmul **Read this page** → Accept → `pack.about`) | Design, Chat, Chrome, Novice, Sam; R1-03 |
| R2-P0-4 | ~~**Project Save renames heading; grip has no Project when `background` exists**~~ **Fixed 21 Nov 2026** (project Save body-only / no Heading rename; grip **Add About the project** when background exists without that sub; confirmed on preview) | U-4, all persona chrome |
| R2-P0-5 | ~~**Approve ignores pencil / PageField; section Approve vanishes with no mark**~~ **Fixed 21 Nov 2026** (R1-06 already covered pencil/buffer; R1-19 **Approved** chip on section header; confirmed on preview) | Chrome, Design, Sam, Novice |
| R2-P0-6 | ~~**Remove Undo deleted at 2s** (`dismissChange`)~~ **Fixed with U-2 (20 Nov 2026)** | Chrome, Chat, Design, UN, Novice |
| R2-P0-7 | ~~**Undo / chat undo / `lastChange` → Market or stuck progress line**~~ **Fixed with U-2 (20 Nov 2026)** | U-2, Chat #7, Sam #9 |

**P1 — English chrome / workflow (maps to recommended fix order 1–5 plus)**

| ID | Maps | Finding |
| --- | --- | --- |
| R2-P1-1 | **(1) U-1** | **Placement Fixed 20 Nov 2026** (user confirmed). +N ordering Fixed with R1-09 (22 Nov 2026). Phone sheet: R2-P1-10. Eye until sections: kept by design. |
| R2-P1-2 | **(2) Fixed with U-2** | Chat `undo` vs `undoStep`; remove dismiss |
| R2-P1-3 | **(3)** | Save/Cancel semantics; setup card no Save; 40-char draft rule |
| R2-P1-4 | **(4)/(5) Fixed** (21 Nov 2026) | Grip click Fixed (U-4 B); Add blur/Escape Fixed (R1-11); fake “Moved” at ends Fixed; group drop insertion bar + remove-group rehome Fixed (agent confirmed on preview) |
| R2-P1-5 | **(5) partial Fixed** | Approve vs buffer Fixed (R1-06); Approved mark Fixed (R1-19 / R2-P0-5). Still open: Approve triple meaning across chat / fixed texts |
| R2-P1-6 | **Fixed** (21 Nov 2026) | Opening brief pay/date on AI path — `groundPayDeadline` refuses invented pay; user’s `extractFacts` deadline wins |
| R2-P1-7 | **Fixed** (21 Nov 2026) | House vs org type + UN chips — ngo/charity type wins over house; chips National then INGO, UN only in See all |
| R2-P1-8 | **Fixed** (21 Nov 2026) | Check done vs empty Qualifications — outline gaps in `checkPoints`; card matches progress; gaps not skippable — Novice #11, R1-14 |
| R2-P1-9 | **Fixed** (21 Nov 2026) | Preview tab leaves Eye hidden — leave Preview clears flag; Eye returns — R1-13 |
| R2-P1-10 | **Fixed** (21 Nov 2026) | Mobile writing chrome ≥44px — touch token, full-opacity tools, sticky Save, parts row vs Eye — [Phone R2](033c02d6-9e1f-40bd-a8a5-4e71b6565a6a) |

**P2 — after English (langs, UN content, Amplify, mobile polish detail)**

UN clearance blockers (R1-08, R2-UN), INGO LANG-ONLY pack, Reach/flyer/version park (INGO EN-BLOCK), UN template content, composer ring, style step no chips.

**Round 2 still works (keep):** One-window create; template by plain English; quick picks when present; pencil Save/Cancel; Cancel/Undo recover on tested paths; How to apply protected; edit withdraws approval; Free path completes; preview shows paragraphs; grip menu on deliberate click; OpenRouter chat can follow pace/style.

### [Programme manager R2](f89d6d5d-19b2-400e-b6b5-8fbeab44f4cb) — Sam, national NGO WASH Coordinator

**Workflow: 4/10.** One window works; template/facts opening loses trust; Save/Cancel/Approve/Undo rules diverge after draft exists.

**22 findings** — CONFIRMS most English chrome (U-1–U-4, R1-01–06, 09–13, 20). **NEW (opening brief pay/date Fixed R2-P1-6):** was 180k→120k / wrong date on AI path. **Fixed R2-P1-7:** UN chips before Local NGO; org type vs house. Still open from this pass: org settings no Save; approval rule “senior P4/D” on national NGO; composer readiness ring swallows first Send.

**Repetitions:** Setup stack (About, project, style, pace) before write; “yes” means three different things; long walk after brief already typed.

**Icons vs chat:** Chat faster for template name in sentence and chips; worse for typed yes/ok and UN chip bias. Icons faster for pencil/grip/progress once writing; worse during setup (no Preview/History), clipped line, grip/Approve commits.

**Works:** Local NGO concise order; how to apply fixed; edit withdraws approval; pay not taken from budget without pay words.

### [Phone R2](033c02d6-9e1f-40bd-a8a5-4e71b6565a6a) — Fatima, ~390px mobile HR

**Mobile viable: No** for create-and-polish. **Publish** alone is OK (44px full-width). Writing chrome is not: 12–34px targets, 45% opacity tools, keyboard covers Save/Send.

Live preview checked (390×844): Communications Intern, Child Protection Specialist, Finance Officer. **18 findings** — touch killers 1–9 (pencil/grip 28px + 3px drag; Remove no confirm; Save 34px bottom; 12px chat grip; Send 30px; Chat/Job 28px; Reset in icon row; parts sheet hides Publish below fold; title crushes status). Also: quick replies 30px; Preview/History 30px overrides phone 40px; Approve 28px; draft/chat never together; phone CSS undone by inline heights.

**CONFIRMS:** R1-10 grip, R1-12 header/opacity, R1-20 phone parts, U-1 progress hidden on phone layout.

**Recommended to make mobile viable (agent):** pencil, grip, Approve, Save, Send, Chat/Job switch **≥44px, full opacity**, Save/Send **above keyboard**; Publish can stay.

### [Novice NGO R2](8442906c-3d03-4b4a-8a45-575f31966a17) — Amina, Kisumu local NGO (Free, first tool)

**Outcome:** Reached **live Free publish** on demo sample org (Riverstone Aid) — **unsafe** for her persona: incomplete Qualifications, INGO-flavoured responsibilities, wrong employer branding.

**Seamless vs confusing:** Chat can start from one paragraph, switch template in plain language, Preview paragraphs, Cancel/Undo recover — vs forms that hide copy, “yes” wiping project paste, silent rename, publish without empty-section block.

**22 findings** (table in agent report). **Blockers:** #6 free publish with placeholders; #1–5 Riverstone/UN path and fixed apply before asked; #7 INGO AI duties. **CONFIRMS:** R1-01,02,09,13,14,16,17,18; U-3; partial U-2. **NEW:** date conflict on Accept; `free: {}` allowance; dead quick replies on style; phone Chat/Job split; broken Accept copy; AI tip over title.

**Bottlenecks:** No side-by-side on phone; About/Project never show as advert text; stacked dead chips; progress allows Publish; only once-ever free terms confirm.

**Chat (OpenRouter):** Useful for template/pace/grade; harmful on dates, Riverstone apply text, style without buttons, broken rule strings.

---

## Fix log

| Date | IDs fixed | Commit | Notes |
| --- | --- | --- | --- |
| 20 Nov 2026 | U-1 (confirmed) | `3d8e2cc`…`2ac7419` | User confirmed on preview. Measure-row absolute (`3d8e2cc`); hairlines off + chat `aj-card` (`259e8e3`); `+N` below track (`9edf0db`); chat top aligned with progress + resizable menu (`0d190d6`); drag collapse/open (`9b448ad`…`cd6f266`); menu open/closed persisted (`2ac7419`). R1-09 / R2-P1-1 placement closed; their other bullets stay open. |
| 20 Nov 2026 | U-2, R1-04, R1-05, R2-P0-6, R2-P0-7, R2-P1-2 | `7780a69` | Amended plan after [independent review](efa9f95b-2154-433d-be52-95eb4c61db0c). `keepJdPart` + pin on remove / removeGroup / toggleSection; unified undo (chat + `undoLastChange` clear both offers); `currentPart` orphan guard; `walkAutoOpen` + suppressed step (Market walk still follows when not on a JD section); removed 2s `useRemovedNoteDismiss`. Confirm on preview. |
| 20 Nov 2026 | R1-05 / R2-P0-6 follow-up | `f34eb92` | U-2 left the Removed note forever (wrong). Restore polish `3f0f4c4`: hide Removed note after ~2s via `useRemovedNoteHidden` **without** `dismissChange`, so chat Undo still works. User confirmed on preview same day. |
| 20 Nov 2026 | R1-06 (item 5 Step A) | `eccb4a7` | Approve hidden while pencil open; Save that changes text clears that section’s approval. User confirmed on preview. |
| 20 Nov 2026 | R1-11 (item 5 Step B) | `732a06f`…`9e4ae13` | Add panel: Enter commits; Escape/blur cancel; Add your own under every group; Enter-add keeps JD scroll (`9e4ae13`). User confirmed on preview. |
| 20–21 Nov 2026 | R1-28 | `97e7fde` | Pencil Save on How to apply no longer opens the fields card at the top of the JD. User confirmed on preview, 21 Nov 2026. |
| 21 Nov 2026 | R2-P0-1 | `9fb0b76` | Empty / unfinished outline sections block every publish route (`sectionPublishBlock`); Publish CTA shows the reason. User confirmed on preview (empty + `[Duty station]` + clear after fill). |
| 21 Nov 2026 | R2-P0-2 | `b7a1787` | Tumaini Community Trust sample preset (local NGO); demo chrome switch; template `others` prefer org-type family; apply email / Tumaini commitments / AI `orgType: ngo` / Google title. User confirmed on preview the same day (preset switch, Local NGO concise path, live Key responsibilities without cluster/Sphere/donor/MEAL). |
| 21 Nov 2026 | R2-P0-3, R1-03 | `cb78694` (+ `aa3a008` Use-as-it-is) | `keepProfileAbout` sets `pack.about`; setup About/Project chips/sticky card; user confirmed on preview (incl. Urmul Read this page → Accept). |
| 21 Nov 2026 | R2-P0-4 | `b4a4185` | Project pencil Save no longer renames the Background/Project brief heading (body via `savePageFieldText` / `intoSection` only; Heading hidden in project editor). Grip offers **Add About the project** when `background` exists without that sub. Confirm on preview. |
| 21 Nov 2026 | R2-P0-5, R1-19 | `2f17568` | Section header shows **Approved** chip after Approve while walk is active; R1-06 already hid Approve during pencil and cleared approval on Save. Confirm on preview. |
| 21 Nov 2026 | R1-10 / R2-P1-4 (fake Moved) | `7475fda` | Move up on first / Move down on last: no “Moved” announce, menu items disabled (`off`), `outlineOp`/`versionOp` leave tags and undoStep unchanged. Confirmed on preview (first Move up disabled + empty status; last Move down disabled). |
| 21 Nov 2026 | R1-10 / R2-P1-4 (group drop + remove-group) | `d77138e`…`3f53f82` | Outline: string `data-group-drop` + sage insertion bar while dragging a group; keyboard `groupBy` unchanged. `removeCustomGroup` / `rehomeTarget`: remove empty custom group only, rehome sections (catalog → own; custom → prev/next/`job`); `outlineOp` / `versionOp` / `applyToEntries` / AI `remove_group`. Undo restores. Agent confirmed on preview (drop bar + status while dragging; Annex + Kit list → remove → Kit under Applying; keyboard move group). |
| 21 Nov 2026 | R2-P1-6 | `917804d` | AI `set_facts`: `groundPayDeadline` — salary digits must appear in the user’s words / brief; closing date from `extractFacts` on that corpus wins over the AI’s ISO; invented pay/date refused. Tests in `employerDemoAiChat.test.ts`. **Agent confirmed on preview** (WASH Coordinator brief: KES 180,000 + in 3 weeks → stayed `180000` / `2026-12-12` after template and AI re-apply). |
| 21 Nov 2026 | Background / Project heading polish (user) | `d16b5b1`…`9301374` | Restore Heading + other-title chips on project pencil (Save body still no force-rename). Formats without a `background` slot add **Project brief**. Grip: `Add Project brief` / `Add “About the project” under …`. Add panel: fixed `GROUPS` order even if the job regrouped. **Agent confirmed on preview** (Add Project brief; pencil Heading + Background / About the programme chips; Add panel About the employer → The job → …). |
| 21 Nov 2026 | R2-P1-7 | `c90cf88`…`d698879` | `recommendation` / `familiesForOrg`: ngo/charity chips National then INGO, UN excluded from quick chips; See all + phone strip org-aware. `defaultFormatKey`: ngo/charity use `FORMAT_FOR_TYPE`, not house. Tests `employerDemoR2P17.test.ts`. **Agent confirmed on preview** (Tumaini: chips Local NGO concise → Domestic charity → About you narrative; phone strip National/INGO/donors then UN last). |
| 21 Nov 2026 | R2-P1-8, R1-14 | `e7c5c4b`…`58deeba` | `checkPoints` includes outline gaps from `sectionOutlineGaps`; leave cannot skip them; walk Check card lists `checkPoints` (not `openPoints`). Tests `employerDemoR2P18.test.ts`. **Agent confirmed on preview** (pencil-clear Qualifications → Save → Check to do; card: “Qualifications and experience: still empty or unfinished”; earlier: inclusive point matched progress, no Google). |
| 21 Nov 2026 | R2-P1-9, R1-13 | `4a6e4f1`…`1300b7a` | `Window.tsx`: `pickPanelTab` + `setPreview(false)` on progress part, Job description / other panel tabs, walk focus, open/close tab, toJob, version tab. Test in `employer-demo-no-fetch.test.tsx` (leave Preview → Eye back). **Agent confirmed on preview** (Communications Intern: Eye → Preview tab; About us part restores Eye, Preview tab gone; Eye → Job description tab restores Eye). |
| 21 Nov 2026 | R2-P1-10, R1-12/20 partial | `031dcb0`…`148853d` | `--ej-touch: 44px` @ ≤1023; section icons / Chat·Job / Send / parts / pills / icons; tools opacity 1 under 1023; sticky `.ej-edit-actions`; parts row flex+truncate; strip winning Eye/History/Approve inlines. Tests `employerDemoR2P110.test.ts` + phone no-fetch. **Agent confirmed on preview ~390px** (Communications Intern: Chat/Job/Send/Eye/History/pencil/grip/Save all 44px; parts does not overlap Eye; sticky Save bar while editing). |
| 21 Nov 2026 | R1-20 | `6be0b11`…`7c2e638` | Phone setup template strip: Cancel always shown; closes strip and returns to chat without applying. Test in `employer-demo-no-fetch.test.tsx`. **Agent confirmed on preview ~390px** (Nutrition Officer: See all formats → Cancel → Chat; strip gone, setup unchanged). |
| 21 Nov 2026 | R1-12 | `aea3040`…`eee45e0` | `.ej-sec-head` wraps globally; `.ej-sec-change` full-width row with visible Also-in + `ej-change-actions` Undo. Tests `employerDemoR112.test.ts` + no-fetch. **Agent confirmed on preview** (Communications Intern: edit About us → Save; wrap; change row 100%; Approve/Undo/grip inside panel). |
| 22 Nov 2026 | R1-15 | `aa7576e`…`dafa4f6` | Ask / walk / change auto-open call `setHidden(null)` so Hide cannot leave a fields card shut after a later ask. Tests `employerDemoR115.test.ts` + no-fetch. **Agent confirmed on preview** (Communications Intern: Hide Details → part stays current, card shut; answer date → fields card returns on How to apply). |
| 22 Nov 2026 | R1-09 | `aa9fe60` | `onLine` sliding window ending at current so Publish does not sit on the line while Review/Languages are only in +N. Tests `employerDemoR109.test.ts` + window test. Eye-in-setup kept. **Agent confirmed on preview** (narrow split: Publish current → line shows Check · Free or Amplify · Review · Publish; early sections in +9). |
| 22 Nov 2026 | R1-18 | `12b8f4c`…*(confirm)* | Free-first plan chat; Amplify detail behind “What Amplify adds”; Check/Create language hints only on Amplify; progress part `Language versions`. Free still hides langs/market/reach on the line (by design). Tests `employerDemoR118.test.ts` + publishing `toPlan` skips About/Project (R2-P0-3). **Agent confirmed on preview** (Finance Officer: plan panel Free first + “What Amplify adds” collapsed; parts Check → Free → Review → Publish, no Language versions / Market / Reach). |

---

## How the next chat should use this file

1. Read this file and `employer-side-plan.md` Phase 6 / polish status.  
2. Confirm `demo/employer` tip and that English-first still holds.  
3. **Default next:** R1-27 (draft groups / silent join). Or the user’s new priority.  
4. Mark IDs Fixed in the tables and add a Fix log row in the same commit as the code.  
5. Do not close Phase 7 until the user says English chrome is good enough.  
6. Never stage leftover `apps/frontend/lib/__tests__/employerDemoPhase6Review.test.ts` or `apps/frontend/AGENTS.md` unless the user asks.
