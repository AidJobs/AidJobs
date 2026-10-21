# AidJobs — UX build plan

**This is the single, authoritative step-by-step plan for user-experience work.** Take the first step whose status is not **Done** and whose dependencies are met. Do not skip ahead, and do not start a step without the user's approval of its plan.

- What to build and why: `docs/architecture/public-ux-direction.md` (W-28). This file is the order and the acceptance criteria; it does not change the direction.
- Review evidence: ledger W-26.
- Rules: `docs/architecture/aidjobs-migration-contract.md`. A step marked **Contract decision** is not approved for implementation until the user records that decision, even if its plan is otherwise ready.
- Design reference: the git tag `ux-demo-approved-2026-10-21`, the approved design demo (UX-00). Its decisions are in `public-ux-direction.md`, "Approved in the design demo".
- Replaced: `docs/architecture/ux-public-layout-plan.md` on the unmerged branch `ux/public-layout` (worktree `AidJobsGit-ux`). Do not follow it. Its U1 and U2 commits are kept for reference only; its U3 colour fix is redone here as UX-02 on a fresh branch from `main`.

**Recorded:** 20 October 2026, from `main` at `2a2e02f`. Order changed the same day by the user: the design demo (UX-00) comes first, then Stage A. Priority, set by the user on 20 October 2026: this plan comes before crawler work. Crawler work resumes in ledger order after Stage C, or earlier if the user changes the priority. Stage D runs together with the crawler items it depends on.

**Revised:** 21 October 2026, from `main` at `3d688ec`, approved by the user. The revision below replaces the order of the steps; where it and a step disagree, the revision applies.

## Revision of 21 October 2026

The user approved the look of the design demo (UX-00) on their phone on 21 October 2026. The approved choices are recorded in `public-ux-direction.md` under "Approved in the design demo". The demo code is kept at the git tag `ux-demo-approved-2026-10-21` (commit `acb1fcf`, branch `demo/ux-design`, draft PR #22).

**What changes:**

1. **The demo is not merged.** It runs on a fixed copy of 206 jobs, reads every fact in the browser, renders only in the browser, and contains inert admin screens. Stage B carries its components into the real site and connects them to the backend. The tag is the reference; the Netlify preview of PR #22 is a convenience, not a backup.
2. **Public fixes to the current site are dropped.** UX-01 (PR #19), UX-02, UX-03, and the public parts of UX-07 repair code that the switch (UX-29) deletes, and no visitor sees the current site while `aidjobs.app` is down. PR #19 is closed without merging, with the user's approval. The admin keeps its fixes: UX-04, UX-05, UX-06, and the admin parts of UX-07.
3. **Build beside, then switch.** Stage B builds the new public site on `main` at a hidden address (working name `/v2`), marked `noindex` and linked from nowhere, in small pull requests. The current site keeps running until one switch pull request (UX-29) moves the new site to `/`, deletes the old public code, and redirects the old addresses. Production is never half old and half new, and every deletion is reviewed in one place.
4. **Public site first, admin after.** The admin is separate code used only by the user. The old admin keeps the old shared styles until Stage C; they are in use, not stale. New design tokens are built once (UX-09) so the admin reuses them.
5. **Domain.** `aidjobs.app` has expired and `www.aidjobs.app` does not resolve (observed by the user, 20 October 2026). Nothing in Stage B needs the domain. Until it returns: the "Live" check in step 6 of the method uses the Vercel production address; the site tells search engines not to index it; the site address is one setting, so connecting the domain later changes one value. Search-engine registration, the sitemap address, and canonical links wait for the domain (UX-18).
6. **Clean code.** Every step removes what it replaces. The switch removes the old public site entirely and runs a dead-code check. Stage C ends by removing the old shared styles.
7. **The demo is the specification** (decided by the user, 21 October 2026: "The website should be exactly as we finalised in the demo"). The public site's look and behaviour are those of the tag `ux-demo-approved-2026-10-21`. Nothing is added, removed, or restyled unless the user approves that difference. Where any step, acceptance criterion, or the direction's earlier text disagrees with the demo, the demo wins.

**Fidelity check, for every Stage B pull request:**

- Run the tagged demo and the pull request's preview side by side on the same jobs: the demo's job copy loaded into the new site's data path, or the same live jobs loaded into the demo.
- Screenshot the same screens at 360px, 390px, 412px, and 1366px: home; each filter sheet and dropdown, scrolled; the Filters sheet; sort; the 10-day view; a job sheet and the job pane; Saved; the menu, collapsed rail, and phone drawer; the settings panel; light and dark.
- Record every visible difference in the pull request, each marked "intended" (one of the expected differences below) or "for approval". A difference not approved by the user is fixed before merge.

**Expected differences from the demo,** the only ones allowed without a further decision: live jobs instead of the 20 October copy; the user's logo when it arrives; no "Demo" menu section, "demo" tag, "Demo data" footnote, or "Demo note" about descriptions in the job sheet; no demo admin screens; the server renders the first screen; launch pages (UX-27) in the demo's style.

**Removed from the plan, because they are not in the demo.** Each could return later only as a new step with the user's approval:

- Search chips inside the bar, typed suggestions with counts, and smart views on an empty bar (previously UX-11, UX-12). The demo's search is a plain text box that filters as you type.
- A strip of counts with "new this week" and "closing this week" (previously UX-10). The demo shows the number of open roles and the 10-day switch. "New on AidJobs" stays parked until the backend records a first-seen date.
- A saved-list link, meaning a web address that reopens the same saved jobs on another device, and moving saved jobs closing soon to the top (previously UX-15). The demo's Saved list itself stays exactly as it is: the bookmark, the Saved entry with its count, saves kept on the device.

Sharing is not removed. The demo's job sheet has one Share button, labelled "Share: WhatsApp, LinkedIn, email, or copy link", which opens the phone's share menu (where WhatsApp, LinkedIn, and email appear) or copies the link where there is no share menu, plus a separate "Email this job to myself" button. Both are carried over as they are.
- "At least eight jobs visible on a 390px phone" (previously UX-13). The demo shows about seven with the brand bar and switch; the acceptance is the fidelity check instead.

**Porting work the demo does not show,** needed to make the same design render on the server:

- Country names: the demo renders only in the browser because Node and browsers name some countries differently. The real site uses one fixed country-name table, identical on server and browser.
- Dates: "Today" and days left depend on the visitor's clock and time zone, so they are worked out in the browser after the page loads, never baked into the cached page.
- Title-fact rules: the demo's rules were tuned on 206 titles, mostly UNICEF, with no tests. They move with unit tests built from real titles (each sector, level, contract, open-to, remote, language, and grade case, plus "not stated"), and are re-checked against the live titles whenever a new organisation is added.
- Saved keys: the demo stores saves under `aidjobs.demo.*`; the real site uses its own keys.

**Order of steps (authoritative):**

| # | Step | Kind |
| --- | --- | --- |
| 1 | This docs pull request and the tag; UX-00 Done when it merges | Docs |
| 2 | Close PR #19 without merging | Housekeeping, needs approval |
| 3 | UX-08 launch decisions and assessments, in parallel with the admin fixes UX-04, UX-05, UX-06, UX-07 (admin parts) | Decisions; code |
| 4 | UX-09 to UX-17, at the hidden address, with UX-26 tests growing alongside from UX-12 | Code |
| 5 | UX-27 launch pages and UX-28 error monitoring | Code |
| 6 | W-06 expiry rule, if the user moves it ahead of the other crawler items at UX-08 | Crawler |
| 7 | UX-29 the switch | Code |
| 8 | UX-18 launch check, with the domain connected | Launch |
| 9 | Stage C, UX-19 to UX-21, then UX-30 removal of the old shared styles | Code |
| 10 | Stage D with the crawler | Code |

UX-31, the repository tidy-up, can run at any point with the user's approval of its list.

**Open questions, decided at UX-08 and not before.** These are proposals, not decisions:

- Filtering on the server or in the browser. Server filtering with counts per pill scales but needs new search features (UX-11). With 200 to 2,000 open jobs, loading all open jobs once and filtering in the browser, as the demo does, with the first page rendered on the server, may be enough for launch. Decide from measurements: payload size, time to first jobs on a phone, job counts expected within a year.
- Where title facts are read (sector, SDG, level, contract, open to, work style, language, UN grade, typical experience). Stored on each job at save time needs crawler changes and a one-off write to every existing job, which needs its own approval. Read from the title each time the backend returns a job needs no storage and no write. Either way it is enrichment under contract §2 and needs a recorded contract decision.
- Moving W-06, the expiry rule, ahead of the other crawler items. Sixteen jobs have not been seen since 6 December 2025 (W-02); a launch that shows them undermines trust. This changes the crawler order the user set, so it is the user's decision.
- Whether to renew `aidjobs.app`, which registrars release after their grace and redemption periods, or to choose another domain.

## How every step is run

1. **Plan.** Read the step, re-check the code and the live site, and write a short plan: files, exact change, tests, risks. Stop for the user's approval.
2. **Build.** A separate branch and pull request per step, from the latest `main`. Only the files the step names. Never stage `apps/backend/scripts/diagnose_enrichment_bias.py` or `tests/test_link_heuristics.py`.
3. **Test.** Frontend: `npm run test --workspace=@aidjobs/frontend` and `npx tsc --noEmit -p apps/frontend`. Backend changes: the CI Ruff and pytest lists in `.github/workflows/ci.yml`, with new tests added to them. CI must pass.
4. **Preview.** Check every acceptance criterion on the pull request's Netlify preview, at 390px and 1366px, and record the measurements in the pull request.
5. **Merge.** Only with the user's explicit merge approval for that pull request.
6. **Live.** After the deploy, check the acceptance criteria again on `www.aidjobs.app`.
7. **Record.** Update this step's status line and the ledger. A step is **Done** only after the live check; merged code alone is not done.

Admin pages, on a preview or live:

- The user logs in; the agent never handles the password.
- Before interacting, install the read-only browser guard that blocks every non-GET request, test it with a dummy POST, and move between admin pages with the sidebar so the guard stays loaded. Reload the tab afterwards to remove it.
- Never click Run crawl, Run due sources, Delete, Execute Sync, Initialize Index, Backfill, or Restore during verification. Destructive controls are tested only with unit tests or with the user present and approving each action.

Status values: **Not started**, **Planning**, **Plan approved**, **In PR**, **Preview verified**, **Merged**, **Done** (live verified), **Blocked** (with the reason).

## Deployment, as established

| What | Behaviour | Evidence |
| --- | --- | --- |
| Merge to `main`, frontend | Vercel builds a Production deployment for `www.aidjobs.app` within about a minute | Verified from GitHub deployments for every merge from `15d6e4e` to `2a2e02f`; `2a2e02f` succeeded |
| Merge to `main`, backend | Render redeploys automatically | Verified by the user for each merge; the agent cannot see Render, so each deploy is confirmed by the user |
| Pull request, Vercel preview | Built for every commit, but protected by a Vercel login | Verified 20 October 2026: the agent is sent to the Vercel login page |
| Pull request, Netlify preview | `https://deploy-preview-<number>--moonlit-llama-d9f5a7.netlify.app`, public | Verified on PR #19 |
| Previews and data | The Netlify preview reads the production backend: it showed the same 206 jobs. An admin action on a preview changes production | Verified for reads on PR #19; writes inferred from that, not tested |
| `aidjobs.app` | Redirected to `www.aidjobs.app` until the domain expired; `www.aidjobs.app` does not resolve as of 20 October 2026. Live checks use the Vercel production address until the domain returns | Verified earlier; expiry reported by the user |

To establish before Stage B (part of UX-08): whether Netlify also publishes a production site from `main`, which backend address each preview uses, and the Vercel production address used for live checks while the domain is down.

## Stage 0 — Design demo

### UX-00. Clickable design demo

**Status:** Done (PR #23, merged as `fbcfffe`). Built in twelve rounds on `demo/ux-design` (draft PR #22), approved by the user on their phone on 21 October 2026, kept at the tag `ux-demo-approved-2026-10-21`. Type check, lint, and build pass at the tag; the frontend test suite was run at the first demo build, not after the last round; colours were checked against WCAG AA when first chosen, not the ones added in later rounds; checked only in Chromium and on the user's Android phone. Those gaps are closed at UX-16 and UX-18. The demo grew beyond the scope below (title facts, Sector with SDGs, bottom sheets); what was approved is recorded in `public-ux-direction.md`.

- **Why:** the user supplied three dashboard designs (Crewix, Crextio, BizLink) as the visual reference for both the public site and the admin. The demo turns `public-ux-direction.md` and that reference into something the user can try on a phone and a laptop before any real build.
- **Scope:**
  - Branch `demo/ux-design` from `main`, with a draft pull request titled "DO NOT MERGE", only so Netlify publishes a preview link. Never merged.
  - Files only under `apps/frontend/app/demo/`. No backend change, no change to existing pages, no data written. Demo pages carry `noindex`, because Netlify previews are public.
  - Data: public screens use a fixed copy of the public jobs, read once through the public search API, the same read any visitor makes; admin screens use figures already verified in the ledger, labelled as demo data.
  - Screens: a token page (ink and sage palette, text sizes, icons, an Inter and Manrope switch); public, phone first: the collapsible side menu with Organisations and Countries, the search with Organisation, Country, and Deadline pills, the dense list with flags and days left, the job pane and phone sheet, Saved, "Closing this week"; admin: the side menu with the V1 navigation, the dashboard, Sources, and the Jobs table. Admin action buttons are inert.
- **Not in scope:** anything on `main`; real search, saving, or admin behaviour; the logo, which the user provides later.
- **Depends on:** this plan's update merged.
- **Acceptance:** the user approves the look on their own phone and laptop. The approved choices (typeface, sage shade, density, menu behaviour) are recorded in `public-ux-direction.md` in a docs pull request.
- **Verify:** type check and the existing frontend tests still pass on the demo branch; screenshots at 390px and 1366px; text contrast measured to WCAG AA.

## Stage A — Fixes on the current site

Within the existing contract: these repair behaviour; they add no public search feature.

### UX-01. Laptop overflow and blank Saved page

**Status:** Dropped, 21 October 2026. PR #19 is closed without merging: the switch (UX-29) deletes `HomeClient.tsx` and the old Saved page, and no visitor reaches the current site while the domain is down. The preview measurements below are kept as a record.

- **Scope:** `min-w-0` on the results column in `HomeClient.tsx`; the Saved page unwraps the `/api/jobs/{id}` envelope through `lib/jobResponse.ts`, with tests.
- **Not in scope:** the phone menu, the stale saved count (UX-07).
- **Depends on:** UX-00, by the user's order of 20 October 2026.
- **Acceptance:** at 1366px the page is no wider than the window, every save button and Sort are on-screen; at 390px the save button is on-screen; a saved job shows its title, organisation, and deadline on the Saved page, and Remove works.
- **Verify:** preview measured 20 October 2026 (page 1351px at 1366px; stars at x=1282; Sort ends at x=1335; 429px wide at 390px; Saved card and Remove work). Repeat on the live site after merge.

### UX-02. Colour tokens

**Status:** Dropped, 21 October 2026. The public site gets new tokens (UX-09); the yellow background on the admin login is fixed with the admin's move to those tokens in Stage C (UX-19).

- **Scope:** in `apps/frontend/tailwind.config.js`, read the colour variables with `rgb(var(--…))` instead of `hsl(var(--…))`. `globals.css` stores RGB channels.
- **Not in scope:** new colours, the palette change (UX-09), `globals.css`, page components.
- **Depends on:** UX-01 merged, to keep pull requests separate.
- **Acceptance:** `body` computes to background `rgb(255, 255, 255)` and text `rgb(29, 29, 31)`; the All Jobs heading is no longer brown; no yellow on the admin login. Every page that uses `bg-background`, `text-foreground`, `border-border`, `bg-primary`, or `bg-accent` is checked for unintended change.
- **Verify:** computed styles and screenshots on the preview: home, Saved, a job panel, admin login, admin dashboard (with the guard).

### UX-03. Public backup-search banner

**Status:** Dropped, 21 October 2026. The banner lives in `HomeClient.tsx`, which the switch (UX-29) deletes; the new site has no such banner.

- **Scope:** remove "Running on backup search (temporarily)" and its "Try again" from the public pages (`HomeClient.tsx`). Search health stays on the admin dashboard.
- **Not in scope:** the Meilisearch fault itself (W-18).
- **Depends on:** UX-02.
- **Acceptance:** no banner on any public page; search, filters, and paging still work; the admin Search card is unchanged.
- **Verify:** preview, public pages at both widths; admin dashboard with the guard.

### UX-04. False "listing page" alarm in Data Quality

**Status:** Not started.

- **Scope:** `apps/backend/app/data_quality.py` counts a job as pointing to a listing page by matching `/jobs`, `/careers`, `/vacancies`, `/opportunities`, `/list`, or `/search` anywhere in `apply_url`, which matches host names such as `jobs.unicef.org`. Match the path only, and define "listing page" so verified vacancy links (UNICEF `/job/{id}/…`, ICRC `/job/…/{id}`, Oxfam `/jobs/vacancy/…/description/`) are not flagged. Both queries in the file. Tests with those three real link shapes and a real listing link.
- **Not in scope:** the score formula otherwise; other checks.
- **Depends on:** the docs pull request of 21 October 2026 (previously UX-03, now dropped).
- **Acceptance:** for today's 218 active jobs the count drops from 218 to the true number (expected 0); the global score rises accordingly; tests pass in CI.
- **Verify:** unit tests; admin Data Quality page on the preview and live, with the guard.

### UX-05. Admin numbers and status that mislead

**Status:** Not started.

- **Scope:**
  - Job totals: the dashboard shows 234, Jobs and Data Quality 218, the public site 206. First establish from the code what each counts (all rows, active, not hidden, deadline not passed), then label each number with that meaning.
  - Dashboard "Recent activity" reads "No recent activity" while Crawls lists crawls: show the latest crawl runs, or remove the card.
  - Settings shows "AI: Configured" while every call fails with `401` because the key was revoked, and "Meilisearch: Not configured" while the dashboard reports an invalid response. Report what is true: key present or absent, and the last call's outcome where known.
  - Replace "Check console for details" with a plain message.
- **Not in scope:** fixing Meilisearch (W-18) or AI (W-14); the menu change (UX-19).
- **Depends on:** UX-04.
- **Acceptance:** every number on the dashboard, Jobs, and Data Quality has a label saying what it counts, and the same quantity shows the same value everywhere; recent activity matches the Crawls page; AI and search status match reality on 20 October terms (AI failing, search on the database).
- **Verify:** with the guard, compare the dashboard, Jobs, Data Quality, Crawls, and Settings on the preview and live; the user confirms totals with one read-only SQL count if needed.

### UX-06. Admin delete safety and dead controls

**Status:** Not started.

- **Scope:**
  - Delete Jobs and Delete Source leave the row's action column. They move to a separate, visually distinct danger area on the source, with a confirmation that shows the impact summary the code already has and requires typing the organisation name.
  - Hide controls that cannot work, or explain why: "Cleanup expired jobs" (the backend returns `disabled`), "Execute Sync" and "Initialize Index" while search is not working, the "Run crawl (enterprise-grade)" tooltip wording.
- **Not in scope:** the Sources table layout (UX-19); any backend delete behaviour.
- **Depends on:** UX-05.
- **Acceptance:** no destructive control sits beside or looks like a routine action; a delete cannot happen without the typed confirmation; no visible control does nothing.
- **Verify:** unit tests for the confirmation; preview with the guard, opening the dialogs only, never confirming.

### UX-07. Small fixes

**Status:** Not started. Narrowed on 21 October 2026 to the admin: the public items (saved count, search clear button, public dates) belong to code the switch (UX-29) deletes.

- **Scope:**
  - Dates: one shared formatter, `lib/dates.ts`, giving unambiguous dates such as "28 Oct 2026", used by the admin, replacing raw timestamps such as `2026-10-19T19:24:44.794571+00:00`. The new public site reuses it.
  - The admin login does not say "Your session was not accepted" to a first-time visitor.
- **Not in scope:** public pages; the search behaviour behind the clear button (W-17 is removed with Trinity at the switch).
- **Depends on:** UX-06.
- **Acceptance:** each item observed fixed on the preview at both widths; formatter unit tests.
- **Verify:** preview and live.

## Stage B — Launch redesign

### UX-08. Launch decisions (gate)

**Status:** Assessed 21 October 2026; awaiting the user's decisions. The findings, options, and recommendations for every item are in `docs/architecture/ux-08-launch-decisions.md`, where each decision is recorded. **Nothing in UX-09 to UX-18 starts until every item here is recorded as decided.**

1. **Direction approval.** The user approves `public-ux-direction.md` as written or amended, including the look approved in the demo (UX-00). Merging the pull request that added it records the proposal; it is not the approval.
2. **Contract decision** for the public scope changes in contract §2: the organisation filter (a new public search feature); the Sector filter with SDGs, multi-choice filters, and the title-fact filters approved in the demo (new public search features, and enrichment where facts are read from titles); the Recommended order; and the user-interface rewrite under rule 15 with the product reason recorded in the direction document. This brings forward the UX-22 contract decision, because the approved design uses title facts at launch.
3. **Logo** file received from the user (SVG preferred).
4. **Launch date.**
5. **Slow first load.** Assess first, read-only: measure the cold start on Render, find the plan and sleep behaviour, list the options (always-on instance, keep-alive, caching or server rendering that does not wait on a sleeping backend) with cost. Then the user decides.
6. **AI crawlers.** Assess which crawlers exist and what allowing each means, then the user decides which may read the site.
7. **Server rendering approach.** A short technical plan for rendering the job list and job view on the server with the existing Next.js 14 app and backend, and how preview and production reach the backend.
8. **Deployment unknowns** from the table above established.
9. **Domain.** Renew `aidjobs.app` or choose another; the launch date depends on it.
10. **Filtering approach,** on the server or in the browser, decided from measurements (see "Open questions" in the revision).
11. **Where title facts are read,** stored at save time or read when the backend returns a job (see "Open questions").
12. **W-06 ahead of the other crawler items,** or not (see "Open questions").
13. **A saved job that closes:** leaves Saved, as in the demo, or stays marked "Closed".

### UX-09. Design foundation

**Status:** Not started.

Stage B, UX-09 to UX-17, builds at the hidden address from the revision, not at `/`. Each step takes its look and behaviour from "Approved in the design demo" in `public-ux-direction.md` and carries the demo's components over from the tag; where a step's text below predates the demo, the approved demo decisions apply and the step's plan reconciles them.

- **Scope:** the typeface chosen in the demo (Manrope); text sizes 12, 13, and 15px plus one large light size for page titles and large numbers; ink and sage for light and dark, following the device; the user's logo, favicon, and app icon; Lucide icons with hover and long-press labels as one component; SVG flags; card, pill, and hairline shapes. Shared by the public site and the admin. The demo's styles are reused, not redrawn.
- **Not in scope:** page layouts (UX-10 onward).
- **Depends on:** UX-00 (approved look), UX-08 (logo, direction).
- **Acceptance:** tokens defined once and used by new components; favicon and app icon return 200; contrast meets WCAG AA for text.
- **Verify:** preview; contrast measured.

### UX-10. Server-rendered shell and search-engine foundation

**Status:** Not started. **Contract decision** (rule 15 rewrite; recorded at UX-08).

- **Scope:** one persistent frame with no header and a collapsible side menu (logo, Jobs, Saved with count, and on desktop the title-fact sections with live counts, as approved in the demo; collapsing to an icon rail whose section icons open pop-outs); phone: a brand bar with Saved, the list with the search bar at the bottom, the menu as a navigation drawer opened from the bar, filters in bottom sheets; desktop: menu, list, and job pane, with a draggable, remembered divider between list and job, each area scrolling and the page not; the keyword page title and the count of open roles above the list, as in the demo; the fixed country-name table and browser-side dates from the revision's porting work; the address reflects the search and the open job, Back works, and moving between views does not reload the page. The first page of jobs is rendered on the server. A real title and description per view; `robots.txt`; `sitemap.xml`; canonical links; link previews (Open Graph).
- **Not in scope:** the filter pills and search (UX-12); job pages (UX-24).
- **Depends on:** UX-08, UX-09.
- **Acceptance:** the HTML returned for the new site's address (the hidden address until UX-29, then `/`), fetched without JavaScript, contains job titles; `robots.txt` and `sitemap.xml` return 200; on desktop the document does not scroll; switching views makes no full page load; the divider position survives a reload.
- **Verify:** raw HTML fetch of the preview; browser checks at both widths.

### UX-11. Search API for the bar

**Status:** Not started. **Contract decision** (new public search features; recorded at UX-08). Narrowed on 21 October 2026: the suggestions endpoint is removed, because the demo has no suggestions (revision, "Removed from the plan"). What remains is what the server-rendered page needs to read every open job, decided with UX-08 item 10; if filtering stays in the browser, this step may need no backend change at all.

- **Scope:** if UX-08 puts filtering in the browser: confirm the existing `/api/search/query` returns every open job with the fields the list needs, and add only what is missing, with tests in the CI lists. If UX-08 puts filtering on the server: an organisation filter and several values per filter on the search query, and counts per choice over the current filters, with tests.
- **Not in scope:** AI; Meilisearch.
- **Depends on:** UX-10.
- **Acceptance:** the server-rendered page receives every open job; where the server filters, counts equal the number of jobs the same filters return; response time measured.
- **Verify:** unit tests; preview requests.

### UX-12. One search bar, and removals

**Status:** Not started.

- **Scope:** the plain search box as in the demo (filters as you type; the enter key closes the phone keyboard); the Sector, Organisation, Country, and Deadline pills, each a multi-choice list with counts (searchable where long); on phones each opens as a bottom sheet, and a Filters pill opens the title-fact filters, as approved in the demo. The removals (`TrinitySearchBar` and its public use of `/api/search/parse` and `/api/search/autocomplete`, the five collections, the old field-based Level, International eligible, and Mission Tags filters, the on-page country list) happen at the switch (UX-29), because the old site keeps running until then.
- **Not in scope:** backend AI code removal (separate, later); filling each source's empty organisation type, which only the UN Jobs collection used.
- **Depends on:** UX-11.
- **Acceptance:** the fidelity check passes; every choice shows a count above zero or is a picked value; clearing the search and every filter shows all jobs and a clean address (W-17 closed once the switch removes Trinity); the title-fact rules have unit tests from real titles in CI.
- **Verify:** preview at both widths.

### UX-13. Dense job list

**Status:** Not started.

- **Scope:** two lines per job (title; organisation and place with an SVG country flag, and the SDG where clear); days left on the right, orange within 10 days and red within 3, full date on hover or long-press; the Recommended order by default and "Soonest deadline" as the alternative, as approved in the demo; bookmark per row; the open job's row in the sage highlight; "Closing in the next 10 days" with the day strip in the job pane when no job is open, on wide screens, and the "All jobs | Closing in 10 days" switch on phones.
- **Depends on:** UX-12, and `lib/dates.ts` from UX-07.
- **Acceptance:** the fidelity check passes; no horizontal overflow at 320px; urgency colours match the rule.
- **Verify:** preview.

### UX-14. Job sheet and job pane

**Status:** Not started.

- **Scope:** title, organisation, place with country names (not codes), deadline with days left; the freshness line; fact chips only for facts that exist in the data, including sector with SDG and typical experience on UN grades; similar jobs; "Apply on {organisation}"; save, share (system share sheet or copy link), add the deadline to a calendar (`.ics` with a reminder), email to myself; more from the same organisation and country; the address changes to the job's link and opening that link opens the job. No "International eligible: No" or other values that are unfilled for every job.
- **Not in scope:** the permanent job page and structured data (UX-24); storing title facts in the database (UX-22). The facts themselves are in scope, read as decided at UX-08 item 11.
- **Depends on:** UX-13.
- **Acceptance:** the fidelity check passes; a shared job link opens that job for a new visitor; the calendar file imports into Google Calendar and Outlook; the sheet closes with a swipe and Back.
- **Verify:** preview on a phone-sized screen and a laptop.

### UX-15. Saving without accounts

**Status:** Not started.

- **Scope:** as in the demo: the bookmark on each row and in the job, saves kept on the device, the Saved entry in the menu and the phone brand bar with its count, showing only saved jobs in the same list, and the "Saved on this device" note. What happens to a saved job after it closes follows UX-08 item 13.
- **Not in scope:** sign-in, sync, alerts (contract §2 excludes user accounts); the saved-list link and reordering, removed on 21 October 2026 because they are not in the demo.
- **Depends on:** UX-14.
- **Acceptance:** the fidelity check passes; counts stay correct after every add and remove, and after a reload.
- **Verify:** preview.

### UX-16. Accessibility and polish

**Status:** Not started.

- **Scope:** every icon has a label shown on hover and long-press and read by screen readers; full keyboard use; visible focus; text contrast WCAG AA, measured for every text colour the demo uses in light, dark, and high contrast, including the colours added in later rounds (the amber count in the 10-day switch, the green Clear link, the switch, the badges, the freshness note); every empty, loading, and error state has plain wording; reduced motion respected; the demo's settings panel (text size, high contrast, reduce motion, light or dark) carried over.
- **Depends on:** UX-15.
- **Acceptance:** an automated accessibility audit has no serious issues; a keyboard-only pass completes search, open, save, share, and apply.
- **Verify:** preview.

### UX-17. Speed

**Status:** Not started.

- **Scope:** carry out the slow-first-load decision from UX-08; one search sends one request, not four; images and fonts sized for phones.
- **Depends on:** UX-16; the UX-08 hosting decision.
- **Acceptance:** first load on a cold backend within the target set at UX-08; a phone audit's Largest Contentful Paint under 2.5 seconds.
- **Verify:** preview and live measurements.

### UX-18. Launch check

**Status:** Not started.

- **Scope:** connect the domain and set the site address; allow indexing; repeat the W-26 review method on the preview at 390px and 1366px, public pages; the fidelity check on the whole site; checks on real devices: iPhone Safari, Android Chrome, Samsung Internet, and desktop Safari, Firefox, Chrome, and Edge, covering the bottom sheets, the keyboard with the search field and sheet search, the brand bar folding, the day strip swipe, share, and calendar (the demo was checked only in Chrome, and iPhone Safari handles the keyboard and screen height differently); the full frontend test suite and type check; a speed, accessibility, and search-engine audit; the user verifies the domain in Google Search Console and Bing Webmaster Tools and submits the sitemap.
- **Depends on:** UX-29; the domain (UX-08).
- **Acceptance:** no open finding above Low; the user approves the launch.
- **Verify:** recorded results.

### UX-26. Phone-flow tests in the repository

**Status:** Not started. Added 21 October 2026.

- **Scope:** automated browser tests, kept in the repository and run on every pull request, for the key flows at 390px and 1366px: filter sheets (open, choose several, "Show N jobs", close by button, scrim, and swipe), the fixed search inside long lists, the search key closing the phone keyboard, the "Closing in 10 days" switch and day strip, the Filters sheet, sort, open a job, save, share link. They run in Chromium and in WebKit, the engine of Safari, which catches many iPhone differences before the real-device check at UX-18. The demo was checked with throwaway scripts outside the repository; this replaces them.
- **Depends on:** UX-12; grows with each later Stage B step.
- **Acceptance:** the tests run in CI and fail when a flow breaks.
- **Verify:** CI on the pull request; one deliberate break shown to fail.

### UX-27. Launch pages

**Status:** Not started. Added 21 October 2026.

- **Scope:** About (what AidJobs is, which organisations it reads, how often), Privacy (saved jobs stay on the device; what the site does and does not collect), and "Report a problem" on each job and in the menu.
- **Depends on:** UX-14.
- **Acceptance:** each page reachable from the menu on both widths; the report path works without an account.
- **Verify:** preview.

### UX-28. Error monitoring

**Status:** Not started. Added 21 October 2026.

- **Scope:** errors in the public site reported to a monitoring service, chosen with the user, so failures after launch are visible. No personal data sent.
- **Depends on:** UX-17.
- **Acceptance:** a test error from the preview appears in the service.
- **Verify:** preview.

### UX-29. The switch

**Status:** Not started. Added 21 October 2026.

- **Scope:** one pull request that moves the new site from the hidden address to `/`, and deletes the old public code in the same change: `app/HomeClient.tsx`, `components/TrinitySearchBar.tsx`, `app/api/search/parse`, `app/api/search/autocomplete`, `app/collections/`, `components/CollectionsNav.tsx`, `lib/collections.ts`, `app/saved/`, `components/SavedJobsPanel.tsx`, the tests that cover only them (`app/__tests__/search-ux.test.tsx`, `lib/__tests__/collections.test.ts`), and any old public style or helper left without a user. Each is confirmed unused by the new site before deletion. Old addresses (`/collections/…`, `/saved`) redirect to `/`. A dead-code check (for example `knip`) runs before merge and reports nothing unused in the public site. Shared code the old admin still uses stays until UX-30.
- **Depends on:** UX-17, UX-26, UX-27, UX-28; W-06 if the user moved it ahead at UX-08.
- **Acceptance:** `/` serves the new site; the old addresses redirect; the dead-code check is clean for the public site; the admin is unchanged.
- **Verify:** preview at both widths; admin with the guard; raw HTML fetch of `/`.

## Repository and clean-up

### UX-30. Remove the old shared styles

**Status:** Not started. Added 21 October 2026.

- **Scope:** after Stage C, delete the old shared styles and components the old admin used (old colour variables, `AdminTopBar` and others replaced by the admin redesign), and run the dead-code check over the whole frontend.
- **Depends on:** UX-21.
- **Acceptance:** the dead-code check is clean for the whole frontend.

### UX-31. Repository tidy-up

**Status:** Not started. Added 21 October 2026. Needs the user's approval of the list.

- **Scope:** list every remote branch and local worktree with what it holds and whether `main` already contains it (about 30 branches from 2025, `ux/public-layout` and its worktree `AidJobsGit-ux`). Tag anything worth keeping, then delete what the user approves. The demo branch is kept until Stage B is done; its tag is permanent.
- **Acceptance:** only active branches remain; every deleted branch is either merged or tagged.

## Stage C — Admin redesign

### UX-19. Admin navigation and Sources

**Status:** Not started. The revised proposal keeps the contract's admin V1 navigation (Dashboard, Organisations, Sources, Jobs, Crawls, Data Quality, with Settings and logout; contract "Admin V1 navigation" and Gate 9), so the menu needs no contract decision if the user agrees. The earlier four-item menu would change that navigation; it is withdrawn unless the user asks for it, and would then need a **Contract decision**.

- **Scope:** the V1 navigation in the shared collapsible side menu; the dashboard as one health view with real counts and changes, source health sparklines and listing completeness, upcoming crawls, and the new-source checklist; Sources with one actions menu per row, an optional view by stage, and a page per source holding its crawl history, test and simulate tools, and the danger area from UX-06; Jobs as a table with filter pills, a column picker, and export. Menu items become links with their own addresses (today they are buttons). The admin moves to the UX-09 design tokens, which also removes the yellow background left by the dropped UX-02.
- **Depends on:** UX-18, the user's agreement to the revised menu.
- **Acceptance:** each source row is one line; each source's page shows organisation, URL, type, status, schedule, last and next crawl, failure count, recent crawl runs, and health, as the contract asks.
- **Verify:** preview with the guard.

### UX-20. Crawl review

**Status:** Not started.

- **Scope:** a read-only admin view per crawl: found, inserted, updated, rejected by reason, listing completeness (`listing_complete`, `listing_stop`), jobs missing a location or deadline, duplicate links. It replaces the SQL queries the user runs by hand after a crawl.
- **Depends on:** UX-19. It lives under the contract's Data Quality menu item.
- **Acceptance:** for the latest Oxfam, ICRC, and UNICEF crawls the view matches the SQL results.
- **Verify:** compare with the user's queries.

### UX-21. Admin on a phone

**Status:** Not started.

- **Scope:** at 390px the menu collapses and content uses the full width. Admin accessibility basics: the job details overlay is announced as a dialog and closes with Escape; icon-only buttons have names.
- **Depends on:** UX-20.
- **Acceptance:** every admin page usable at 390px without horizontal scrolling; an automated accessibility audit of the admin has no serious issues.
- **Verify:** preview with the guard.

## Stage D — Growth, with the crawler

### UX-22. Facts read from titles

**Status:** Not started. **Contract decision:** enrichment expansion is out of scope in §2. The decision is brought forward to UX-08 (item 2), because the approved design uses title facts at launch; where the facts are read is UX-08 item 11.

- **Scope:** at save time, read UN grade, contract type, duration, eligibility, and remote work from titles, stored on the job.
- **Depends on:** the contract decision; W-24 (clean titles) planned alongside.

### UX-23. Descriptions and posting dates

**Status:** Not started.

- **Scope:** the crawler stores each job's description and posting date. A crawler-plan item, coordinated with W-09 and the platform readers (W-19).
- **Depends on:** crawler work resumed.

### UX-24. Job pages with structured data

**Status:** Not started.

- **Scope:** a permanent server-rendered page per job, such as `/jobs/child-protection-officer-unicef-ethiopia-596228`, with JobPosting structured data, listed in the sitemap while open and removed when closed.
- **Depends on:** UX-23; the expiry policy (W-06) so closed jobs leave search and the sitemap.
- **Acceptance:** Google's Rich Results Test passes for a sample of jobs.

### UX-25. Landing pages, keywords, AI search

**Status:** Not started.

- **Scope:** landing pages by organisation, country, function, and contract type where enough jobs exist; the four keyword layers in the direction document; evergreen guides; `llms.txt`; the AI-crawler decision from UX-08 applied.
- **Depends on:** UX-24.

## Later decisions

- Sign-in for saved jobs across devices and job alerts: user accounts are out of scope in contract §2.
- AI features, such as job summaries: depend on W-14.
