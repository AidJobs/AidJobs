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

1. Progress line under Preview / Earlier versions (header rule), not toward language tabs  
2. Undo / remove / walk focus (no Market steal; keep Undo until used)  
3. About us / Project: show saved text; working Save/Cancel; stop forced rename; stop yes-skip discard  
4. Grip: Project/Background when relevant; open menu without accidental drag  
5. Approve vs unsaved buffers; Add-panel blur/Escape  

---

## Round 1 — 15 November 2026 (recorded from chat + four independent agents)

**Agents:** [HR review UN agency](c56d4342-bc46-4b16-a61d-22cccb85cb07), [HR review local NGO](f87e9add-a843-44ea-a3eb-6c534199501a), [HR review INGO](54c43449-021d-4c76-977c-d0b3853bd5c6), [UX chrome audit](b6ab0953-572b-4d59-807e-442ed88e9a17).  
**Code tip when Round 1 was taken:** polish commits through `13891bb` (later tip may move; re-verify before fixing).

### A. User-reported bugs (confirmed in code) — all OPEN

| ID | Status | Fault | Evidence |
| --- | --- | --- | --- |
| U-1 | OPEN | Progress line sits as a second strip (`.ej-pline`) under `.ej-w-head`. User wants it tighter under the header rule next to Preview / Earlier versions icons — not toward the language / Preview tab row. Placement was misunderstood twice. | User (15 Nov); NGO; chrome |
| U-2 | OPEN | Undo after adding a section removes the section and opens Market check on top of the JD. `undoStep` clears the undo guard in the same update; `seenStep` effect then `setPart`s away. | User; chrome High #2; INGO |
| U-3 | OPEN | About us / Project Save and Cancel still do not work as a product action (buffer, rename, hide advert text, Cancel only clears local typing). | User; NGO; chrome High #8–10 |
| U-4 | OPEN | Grip ⋯ has no Project / Background when that section already exists under another heading (e.g. Local NGO “Project brief”). “Add About the project” only when `background` missing. Three names for one key. | User; NGO |

### B. Combined open findings (Round 1)

#### P0 — stops trust or a real publish

| ID | Status | Fault | Who |
| --- | --- | --- | --- |
| R1-01 | OPEN | About us / Project: after write, advert paragraph not shown; form stays (“Read this page / paste / Upload”). Sub-stored project hides original lines. | NGO, chrome |
| R1-02 | OPEN | Setup “If this job is for a project…”: typing yes / ok / sure skips project and discards paste. Setup card has no Save/Cancel; draft disabled under 40 chars; bullets / no full stop rejected. | NGO, INGO |
| R1-03 | OPEN | “Use our About us as it is” on Local NGO concise adds no About us section (template starts at Project brief); chat says kept. | NGO |
| R1-04 | OPEN | Undo / remove / walk: focus steal to Market; remove can mount Market without scroll; lingering `lastChange`/`undoStep` permanently skips later Market open; chat Undo may not pin part. | Chrome, INGO, U-2 |
| R1-05 | OPEN | Removed note auto-dismiss (~2s) calls `dismissChange` and deletes Undo — section unrestorable. | Chrome |
| R1-06 | OPEN | Approve ignores unsaved pencil / PageField `edit`; later Save stays approved; `nextStep` skips that section. | Chrome |
| R1-07 | OPEN | Language “Mark as reviewed” while still source language; Remove language permanent (live too); tab X confirms but no Undo. | INGO *(language — defer unless blocks English)* |
| R1-08 | OPEN | UN templates not classifiable: competencies, education, grade/GS/ICS, NY closing time, fake ICSC pay, no PSEA/special notice, CV-style apply. | UN *(format content — after English chrome)* |

#### P1 — English JD chrome / outline / workflow

| ID | Status | Fault |
| --- | --- | --- |
| R1-09 | OPEN | Progress line not under Preview/History; labels clip (~96px); Publish can sit early while Languages/Review in +N; icons hidden until writing (U-1). |
| R1-10 | OPEN | Grip: 3px move = drag (menu click swallowed); small drag reorders; Move up/down says “Moved” at ends; no group drop targets; remove group deletes its sections. |
| R1-11 | OPEN | Add panel: blur commits “Add your own” / group; Escape still adds; no Cancel. |
| R1-12 | OPEN | Section header row: Approve/Undo/Also-in clip; pencil/grip hard on narrow/touch (opacity 0.45). |
| R1-13 | OPEN | Preview Eye vanishes while Preview tab stays after picking a progress part. |
| R1-14 | OPEN | Check card vs progress “Check done” disagree (skipped/google points). |
| R1-15 | OPEN | Hide card + later ask leaves part highlighted with card shut. |
| R1-16 | OPEN | Project Save renames heading to “About the project”; compact `edit` can overwrite accepted draft; second PageField in chat is a separate buffer. |
| R1-17 | OPEN | Accept project draft: bullets/short lines → empty; inserts as sub if Background exists; no Undo; marks approved. |
| R1-18 | OPEN | Free plan hides Languages; Amplify/market/Reach sit in front of a small NGO post. |
| R1-19 | OPEN | Approve vanishes with no “Approved” mark on the section. |
| R1-20 | OPEN | Phone: template picker has no Cancel during first template choice; parts button label paints over Eye/History. |

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

**Synthesis status:** *In progress — parent chat appends Section Round 2 findings and deduped master list when agents complete.*

**Findings from Round 2:** *(append below when agents complete; do not delete Round 1.)*

---

## Fix log

| Date | IDs fixed | Commit | Notes |
| --- | --- | --- | --- |
| — | — | — | None yet after Round 1 record |

---

## How the next chat should use this file

1. Read this file and `employer-side-plan.md` Phase 6 / polish status.  
2. Confirm `demo/employer` tip and that English-first still holds.  
3. Take the recommended fix order (or the user’s new priority).  
4. Mark IDs Fixed in the tables and add a Fix log row in the same commit as the code.  
5. Do not close Phase 7 until the user says English chrome is good enough.
