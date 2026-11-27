# Employer Demo — Holistic JD Generator UX, Chat & Data Redesign Plan

**Branch / Worktree:** `demo/employer` (`AidJobsGit-employer-demo`, never merge)  
**Recorded:** 27 November 2026 (from tip `5f3c583`)  
**Status:** **APPROVED (27 November 2026) — IN PROGRESS (Phase A)**  
**Purpose:** Survive chat loss or usage-limit pauses. Captures the complete critical review (live walkthrough + 6 independent reviews + Round 1/2 cross-check) and the unified 4-phase plan so every fix fits one cohesive end-to-end JD creation flow.

---

## 1. Evidence & Independent Reviews (27 November 2026)

1. **Live preview walkthrough** (`?v=audit20261127`, `1366×840` + narrow): caught `.ej-ring svg` click interception on Send, 6 equal-weight template pills filling the viewport, 4-control About/Project cards inside chat bubbles, Grade-before-Style setup race, stale `About us · to do` badge, and `+5` sitting 12px off-baseline (`y=52..72` vs `y=40..67`).
2. **[Novice & blank-slate user critique](bbbe8ce1-410d-4b41-a0bc-c90ff7bfb2c9)** — first-time local NGO / charity with zero saved data + returning small-org user (desktop + 390px phone).
3. **[Returning INGO & UN HR critique](09f4225c-c5e2-46e4-bfa1-a17043118db0)** — multi-hub INGO TA & UN/donor/consultancy workflows, compliance, templates, profiles, languages, flyer, reach.
4. **[Chat & AI interaction critique](a31309eb-226c-4b9a-aec2-3fe1e487f874)** — `flow.ts`, `walkChat.ts`, `aiActions.ts`, `model.ts`, `ContextCards.tsx`, state-machine conflicts, prompt bloat.
5. **[Layout, tabs & IA audit](511bb3d1-371c-4354-a94b-1a908c222654)** — pixel budgets (`1366`, `1024`, `768`, `390`), chrome layers, duplications, Save/Cancel inconsistencies, dead code.
6. **[JD info matrix & suggestions review](cf2be53c-17b2-4546-baa4-b6c642ca7cdc)** — 3-tier information model (minimum to draft vs publish vs AI/data suggestions), "never invent" guardrails, audit of `engine.ts` fabrications.
7. **[End-to-end intuitiveness stress test](4a0b4bca-af20-4e6f-b059-d236cbec0c9c)** — walked Phases A–D across 3 personas; caught 7 subtle traps (0ms skeleton morphing, invisible AI assumptions, Chat hidden in Check/Review, `+Add language`/Amplify/Flyer sequencing, Publish pane flip, FactBar truncating missing facts, phone chrome & URL-paste hijack).

Cross-checked against all OPEN items in `docs/architecture/employer-demo-master-assessment-2026-11-15.md` (Round 1 & Round 2: `R1-07`, `R1-08`, `R1-21`–`R1-26`, `R2-UX`, `R2-UN`, `INGO #5/#6/#7–8/#9/#21`, `FW-3`).

---

## 2. The 3-Tier Information & Suggestion Model

A closing date or contract type makes a listing *publishable*; **scope** makes a JD *specific and worthy of strong candidates*.

### Tier 1 — Minimum to draft a *specific* JD (gathered calmly on `#create`, ~30s)
Extracted from natural typing first; inline helper chips show **only** for what is missing:
1. **Role title + level** (e.g. *Finance Officer* vs *Senior Finance Manager*, or UN grade `P3`/`NO-C`).
2. **Duty station + National / International / Remote** (changes tone, languages, conditions, and pay norms).
3. **Engagement & recruitment mode** (only if ambiguous: Staff / Consultancy / Internship / Volunteer; Vacancy / Roster / Proposal).
4. **One-line scope / context** (*project, team, community, or main deliverable* — with 1-click `Attach project brief / old JD` or `Skip`).

**Adaptive by user & org:**
- **Blank-slate local NGO:** 1–2 lines of About us (or website) + role, town/county, project/community. Hides corporate grade pickers and UN templates.
- **Returning INGO:** Reuses saved org profile, house format, voice, locked commitments, apply settings → Tier 1 collapses to **role + duty station + what's different**.
- **UN / Donor / Contractor:** **Grade** (`P1–D2`, `NO-A–D`, `G1–G7`, `ICS`/`NPSA`/`IPSA`) or **donor + proposal/key-personnel** moves into Tier 1.
- **Consultancy / Roster / Internship:** Consultancy → main deliverable + duration/LOE; Roster → region + availability (+ rolling `"Open until filled"` option); Internship → duration + **paid/stipend status**.

### Tier 2 — Required before Publish (NOT required to draft)
Pinned first in `Key details` when missing, and clickable in the pre-Publish checklist (never a disabled wall-of-text CTA):
- **Closing date + time & timezone** (snapped to a local working day via `f.iso`, or `"Open until filled"` for rosters).
- **How to apply** (verified email, careers URL, or form + required documents).
- **Contract type & duration** (fixed-term length, full/part-time).
- **Eligibility / right to work** (nationals only vs open — promoted to top-level chip).
- **Safeguarding contact level** & **mandatory locked org commitments** (PSEA, MDS, no-fee fraud notice; translated/approved when non-English).
- **Pay transparency decision** (range, scale/grade, daily rate, or deliberate `"Not shown"` — never silently omitted, and **never** a publish-blocking `[Salary]` body bracket).

### Tier 3 — Realistic AI & Data-Backed Suggestions *(Visually Dashed `Proposed`, Never Silently Baked In)*
Every suggestion renders with a dashed `"Suggested — click to confirm"` treatment, its explicit basis, and `[Accept] [Edit] [Dismiss]`:
- **Salary / daily rate range:** (1) Org's own `scale` by grade; (2) AidJobs median for `(role family × level × country × orgType)` **only when `n ≥ 5`** (with sample size, currency, gross/net caveat); (3) Official ICSC grade logic for UN. If data is thin, say so honestly instead of guessing a flat band.
- **Typical years & education:** UN ICSC grade rules (`P2=2, P3=5, P4=7…`) or AidJobs median, paired with *"or equivalent experience"* for non-UN roles.
- **Working & local languages:** Expanded country language map (add ET, NG, BD, AF, NP, IN, PH, Kiswahili) + role-family frequency, surfaced **during drafting** (not buried behind Amplify).
- **Safeguarding contact level:** Role-family default (`Child Protection/Health/Education → High`, `WASH/MEAL/Livelihoods → Medium`, `HQ Finance/Comms → Low/Medium`), 1-click editable.
- **Sensible closing date:** Role/urgency window (14d urgent/emergency, 21–28d standard) snapped to the next local working day (`f.iso`).
- **Role-specific duties, competencies & SDGs:** Role library + template competencies + 2–3 inferred SDGs, tagged *"typical for this role — check against your team"*.
- **Field / travel conditions prompt:** Triggered by field/risky duty station to **ask** about travel % and R&R — never to assert them.

### Hard "Never Invent" Rules (Both AI & Rules Fallback `engine.ts:buildSection`)
Never fabricate: pay figures without a cited basis; allowances, leave, medical cover, R&R, or accommodation; family/non-family station status (especially wrong for national staff); reporting line titles or headcount; budget sizes or beneficiary targets; donor/project/partner names; visa/relocation promises; or locked legal/safeguarding wording.

---

## 3. Unified Golden Path & Spatial Architecture

One consistent spatial grammar across **all 4 stages** on desktop: **Left = tools/guidance, Right = live document/preview**.

### Desktop Header & Breakpoints
- **Full-width 48px Header** (spans above both panes, `border-b aj-hair`; `SideMenu` auto-collapses to `64px` rail on `#job/:id` at `1024–1199px`, giving `<main>` `955px` instead of `803px`):
  - **Left (`min-w-0 flex-1`):** `← Back` + clickable truncated `Job title` + concise status pill (`Draft`, `In review`, `Live`).
  - **Center (`shrink-0`):** **4 stages** — **`Draft · Check · Review · Publish`** (`Review` clearly labelled optional when `approval === 'off'`; live counts e.g. `Draft · 2 missing`, `Check · 3`, `Review`).
  - **Right (`shrink-0`):** Persistent **`Preview` toggle** (`aria-pressed`; never morphs into a tab; icon+label `≥1200px`, icon-only `<1200px`) + **`⋯ More` menu** (`Earlier versions`, `Download copy`, `Save as job profile`, `Delete` / live actions).
- **Breakpoints:** Split `useIsPhone()` at **`≤767px`** (not `1023px`) so tablets `768–1023px` keep split/rail layout without 44px `!important` bloat on tiny controls.
- **Phone (`≤767px`):** Merge top headers into one 48px bar with a compact stage dropdown (`Draft ▾ · 2 missing`), land on **`Job`** after creating (so the instant draft is immediately visible) with a slim 1-line `"Tailoring…"` / **resizable half-sheet Chat bar** at the bottom (replaced by contextual `"Ask AI"` buttons in `Check`/`Review`), and keep Save/Send clear of the virtual keyboard.

### Stage-by-Stage Workspace
1. **`#create` (Adaptive Brief):**
   - One prompt box + Tier-1 Scope Chips (only for missing items) + 1-line Format/Type & `Attach brief / old JD` bar.
   - Messy pasted notes (>400 chars) draft normally; only show *"Use as a job description?"* when `≥2` recognised JD headings exist.
2. **Stage 1 — `Draft` (Left: Calm Chat + bottom `"Run Checks →"` · Right: Live JD):**
   - Matching Job Profile → 1 calm choice (`Use [Profile]` / `Start fresh`).
   - Instant draft with non-destructive `"Tailoring draft…"` shimmer per unpolished section (never overwrites a section the user opened for editing; `"Stop tailoring & edit now"` link).
   - **Right-pane header:** Persistent `EN  + Add language` (always discoverable; shows `Link languages` icon when `>1` language; never shows `Preview` or `Flyer` here), `Format & outline` drawer trigger (with 1-line impact note; keeps edited text & locked clauses), and a slim section-jump TOC for long JDs.
   - **Single-line adaptive `Key details` bar (`≤36px`):** Missing required facts **always sorted first** (never hidden inside `+N`); adapts by engagement type (`Eligibility` and `Languages` promoted; `Grade` hidden when `org.scale` empty & non-UN; `Paid/stipend` for internships; `Rate/LOE` for consultancies).
   - **Inline `How to apply`:** Dedicated `Configure` button (or prominent amber CTA when missing) opening `ApplyDialog` — removed from `SectionView` text Save/Cancel form so Cancel never leaves half-saved mutations.
   - **Blank-slate starter blocks:** Empty `About us` / `How to apply` appear cleanly inside the JD; single quiet checkbox inside the modal (*"Save as default for future jobs"*, owners only — no per-field nagging).
3. **Stage 2 — `Check` (Left: Basic + previewable Amplify Market/Full checks + `"Next: Review/Publish →"` · Right: Live JD):**
   - Preview/try Amplify `Market` & `Full` checks right here with transparent `"Included with Amplify · US$X at Publish"` tag (never dead-ending to Stage 4).
   - 1-tap fixes apply in place; non-1-tap flags (especially inclusive language) include an inline **`Ask AI to rewrite`** button (`Apply / Undo`) without leaving `Check`.
4. **Stage 3 — `Review` (Left: Review status, remarks & decisions + `"Next: Publish →"` · Right: Live JD):**
   - Same split for both authors and reviewers; supports reviewing/commenting on **all language versions** (EN + FR + AR) together; authors get inline **`Ask AI to draft edit`** on open remarks.
   - Editing a French translation does **not** silently withdraw English approval (`INGO #21`); material edits on approved/live jobs show a clear inline confirm banner distinguishing minor typo fixes from material edits (grade/salary/eligibility/scope).
5. **Stage 4 — `Publish` (Left: Publish controls + `Share & Reach` · Right: Live Public Page / Flyer Preview):**
   - Clickable missing-essentials checklist (opens `FactDialog`/`ApplyDialog` in place — never a disabled wall of text).
   - Clean 2-card `Free (US$0)` vs `Amplify` choice (2 plain bullets each; details expandable).
   - Schedule / Payment / Go Live + **`Share & Reach` sub-tab** (`Flyer` + `Reach`, showing `"Ready after Review"` if opened early; right pane switches to live Flyer preview when Flyer is open).

### Calm, Context-Aware Chat Rules
- **Declarative `readinessOf(job, s)`** replaces the rigid 20-step `walk` (`walk.settled`, `walk.parked`, `asksAhead`, `FW-3` fixed). Section `done` = `written && !unfinishedWording` (no forced `"Good, next"` approval loop).
- **Opt-in guided walk:** Single subtle `"Walk through section by section"` link on the first draft (and on phone short-prompt banner).
- **Deterministic control budget in `aiActions.ts` (never prompt-only):**
  - Render controls **only on the latest AI bubble** (no dead pill graveyard up the scrollback).
  - Routine edit → **0 buttons** (inline `Undo` link only when text changed).
  - Real decision or multi-part request (`"tighten… and check what's missing"`) → **max 2 controls** (1 subtle primary + 1 plain text link).
  - Structured fact pickers open `FactDialog` (exempt from 0–2 cap inside the dialog itself).
- **Import / Project modal (no 4-control forms in chat bubbles):** Only a **bare URL** or explicit import phrase opens the Import modal pre-filled (preserving `readPageVia` + `page_draft` safety); messages like `"Apply via https://…"` route directly to `ApplySettings`.
- **De-cluttered chrome & leaner AI prompt:** Remove per-bubble `Written by …` and composer `About: …` bar; silence routine manual-edit chat spam while passing `lastEditedByUser` + `readinessOf` into `contextFor` and clearing stale implicit `inView` focus; split `model.ts` into drafting vs publishing modes (~15 actions each instead of 46); attach `examples.ts` only on first draft; recover cleanly from transient 503s instead of flipping AI permanently `off`.

---

## 4. Phased Build Plan (4 Testable Steps on `demo/employer`)

### Phase A — Foundation, Truth, Compliance & P0 Fixes
1. **Input & dead-code fixes:** `.ej-ring svg { pointer-events: none; }` + `.ej-send` stacking (`employer-demo.css:1290`); fix `.ej-fact-mark` caret/drag handling (`Composer.tsx:125–145`); remove duplicate `flyer`/`reach` branch (`Window.tsx:478–493`) and duplicate checkbox (`Settings.tsx:319–345`); raise `.ej-sec-tools` rest opacity (`0.7` / `1` on focus) and fix `.ej-email-edit` dark-mode hex borders.
2. **Blank-slate preset & defaults:** Add **3rd demo preset (`New organisation — blank slate`)** in `sample.ts`; fix `apply.ts` blank-slate NGO/charity defaults (never print `jobs@` or `formOnly` without URL — use clickable `[Apply email or link]`); fix `JobPage` (`Publish.tsx:255`) to honour `job.apply.method` + `address`; fix messy-notes paste detection (`CreateEntry.tsx` — require `≥2` recognised JD headings).
3. **Eliminate silent fabrications in `engine.ts`:** Strip invented reporting lines, benefits, R&R/non-family claims, fake deliverable days, and flat `$6,500–$8,200` UN salary (`engine.ts:961–1050, 1121–1129`); remove UN-years false positive in `fullAdvertCheck` (`market.ts:189`); expand `LOCAL_LANG` (`market.ts:41`) with ET, NG, BD, AF, NP, IN, PH, Kiswahili.
4. **Compliance, approvals, profiles & safety:**
   - Always union locked `org.standard` clauses in `fixedFor` / `applyFormat` (`actions.ts:778, 2687`); block editing locked clauses in non-English (`fixed.ts:49`) and block publishing untranslated/unapproved locked clauses (`publishBlock`); support `org.primaryLang` (not hardcoded `'en'`).
   - Fix `R1-07`: block `"Mark as reviewed"` while still source language; add consistent confirmation + Undo on language removal (`INGO #9`).
   - Fix `extractFacts` (`engine.ts:710`) to parse `org.scale` grades; fix `approvalRequired` (`approval.ts:6`) to use an org-configured senior-grade list (not UN regex); pass `f.iso` to `weekend()` everywhere (`FactBar.tsx:197`, `Jobs.tsx:30`) + add timezone selector & rolling `"Open until filled"` roster mode.
   - Preserve `c-*` custom sections in `profileTags` (`profiles.ts:61`); preserve reviewed translations (`needs quick check`) and working-day deadline on `hireAgain` (`actions.ts:4337`); require confirm before mobile swipe-close (`Jobs.tsx:397`); allow partner/subdomain emails in `Reach` (`Reach.tsx:108`, `INGO #5`).
   - Upgrade `Flyer` (`Flyer.tsx`, `R1-23`/`INGO #7–8`): include grade, salary, closing time/tz, apply URL/email, real commitment text (not names), clean print CSS, no demo footer.
   - Unify `FormatBuilder` and `Settings` format editors onto `OutlineEditor` so custom groups/sections never vanish.

### Phase B — Unified 4-Stage Layout, Consistent Split & Responsive Alignment
1. Full-width 48px Window Header (`Back` + `Title` + status · `Draft · Check · Review · Publish` · persistent `Preview` toggle + `⋯ More` menu) + `SideMenu` auto-collapse to `64px` rail at `1024–1199px`.
2. Retire the 13–19 dot `PanelLine`, `+N` misalignment, and `PartFields` pop-over card; enforce consistent **Left = tools, Right = live JD / Preview** across all 4 stages (including `Publish` + `Share & Reach` sub-tab).
3. Right-pane hierarchy: persistent `EN  + Add language` + `Link languages`, `Format & outline` drawer with impact note, slim section-jump TOC, single-line adaptive missing-first `Key details` bar (`≤36px`), dedicated `Configure`/amber CTA for `How to apply` (removed from `SectionView` Save/Cancel).
4. Split `useIsPhone()` at `≤767px`; fix tablet (`768–1023px`) layout and `390px` merged phone header (`Draft ▾ · N missing`), landing on `Job` view with resizable half-sheet Chat bar.

### Phase C — Adaptive Brief, Proposed Suggestions & Calm Context-Aware Chat
1. Upgrade `CreateEntry.tsx` to Tier-1 Scope Chips + 1-line Format/Attach bar (and paid/stipend for internships, deliverable/LOE for consultancies, grade for UN).
2. Instant draft-first entry with non-destructive `"Tailoring draft…"` shimmer; dashed `Proposed` chips (`Accept / Edit / Dismiss`) for Tier-3 suggestions with honest data basis.
3. Replace rigid `walk` with pure `readinessOf(job, s)` (fixes Grade-before-Style, `About us · to do`, `FW-3`, `asksAhead`); keep opt-in `"Walk through section by section"` link; skip section-by-section chat loop on `Hire again`.
4. Deterministic control budget in `aiActions.ts` (latest bubble only; 0 buttons on routine edits + inline `Undo`; max 2 on decisions); inline `"Ask AI to rewrite"` inside `Check` and `Review`; Import/Project modal (bare URLs only + owner-only `"Save as default"` checkbox); approval/live-translation edit confirm banner distinguishing minor vs material edits (`INGO #21` fixed); remove `Written by` and `About:` clutter; split `model.ts` modes, first-draft-only `examples.ts`, transient 503 recovery.

### Phase D — End-to-End Human Walkthrough & Independent Verification
1. Verify all 4 scenarios on live Vercel preview: (a) Blank-slate new org (`"WASH Officer Kenya"`), (b) Returning local NGO (`Tumaini`), (c) Returning INGO (`Riverstone`, EN+FR+Review+Amplify+Flyer+Reach), (d) UN / Consultancy / Roster prompts.
2. Verify across `1366×768`, `1024×768`, `768×1024`, and `390×844` phone (including keyboard-open Save/Send and dark mode).
3. Run Jest test suite (new tests for Phases A–C + existing employer-demo tests) and an independent read-only code review before marking done.

---

## 5. Explicitly Tracked Out-of-Scope / Follow-Up Items (Not Silently Dropped)

Keeping the scope realistic and honest — these remain tracked in `employer-demo-master-assessment-2026-11-15.md` for their dedicated passes after Phases A–D:
- **Full UN agency/secretariat content & ICSC tables (`R1-08`, `R2-UN`):** Inspira/PHP workflow, full UN Special Notice/Core Values/per-agency competency libraries, real ICSC station-multiplier salary tables. *(Phase A removes the fake flat `$6,500–$8,200` salary, fixes UN-years false positive, and adds timezone + NY closing support; full UN content authoring stays its own pass.)*
- **Non-English Market/Full advert check regexes (`R1-22`):** French/Arabic regex equivalents for `\d+ years` and Essential/Desirable.
- **Role-library expansion (plan section J):** Expanding role-family content from W-54 role-survey findings once W-54 completes.
