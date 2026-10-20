# AidJobs — UX build plan

**This is the single, authoritative step-by-step plan for user-experience work.** Take the first step whose status is not **Done** and whose dependencies are met. Do not skip ahead, and do not start a step without the user's approval of its plan.

- What to build and why: `docs/architecture/public-ux-direction.md` (W-28). This file is the order and the acceptance criteria; it does not change the direction.
- Review evidence: ledger W-26.
- Rules: `docs/architecture/aidjobs-migration-contract.md`. A step marked **Contract decision** is not approved for implementation until the user records that decision, even if its plan is otherwise ready.
- Replaced: `docs/architecture/ux-public-layout-plan.md` on the unmerged branch `ux/public-layout` (worktree `AidJobsGit-ux`). Do not follow it. Its U1 and U2 commits are kept for reference only; its U3 colour fix is redone here as UX-02 on a fresh branch from `main`.

**Recorded:** 20 October 2026, from `main` at `2a2e02f`. Priority, set by the user on 20 October 2026: this plan comes before crawler work. Crawler work resumes in ledger order after Stage C, or earlier if the user changes the priority. Stage D runs together with the crawler items it depends on.

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
| `aidjobs.app` | Redirects to `www.aidjobs.app` | Verified |

To establish before Stage B (part of UX-08): whether Netlify also publishes a production site from `main`, and which backend address each preview uses.

## Stage A — Fixes on the current site

Within the existing contract: these repair behaviour; they add no public search feature.

### UX-01. Laptop overflow and blank Saved page

**Status:** Preview verified. PR #19, not merged. Waiting for the user's separate merge approval.

- **Scope:** `min-w-0` on the results column in `HomeClient.tsx`; the Saved page unwraps the `/api/jobs/{id}` envelope through `lib/jobResponse.ts`, with tests.
- **Not in scope:** the phone menu, the stale saved count (UX-07).
- **Depends on:** nothing.
- **Acceptance:** at 1366px the page is no wider than the window, every save button and Sort are on-screen; at 390px the save button is on-screen; a saved job shows its title, organisation, and deadline on the Saved page, and Remove works.
- **Verify:** preview measured 20 October 2026 (page 1351px at 1366px; stars at x=1282; Sort ends at x=1335; 429px wide at 390px; Saved card and Remove work). Repeat on the live site after merge.

### UX-02. Colour tokens

**Status:** Not started.

- **Scope:** in `apps/frontend/tailwind.config.js`, read the colour variables with `rgb(var(--…))` instead of `hsl(var(--…))`. `globals.css` stores RGB channels.
- **Not in scope:** new colours, the palette change (UX-09), `globals.css`, page components.
- **Depends on:** UX-01 merged, to keep pull requests separate.
- **Acceptance:** `body` computes to background `rgb(255, 255, 255)` and text `rgb(29, 29, 31)`; the All Jobs heading is no longer brown; no yellow on the admin login. Every page that uses `bg-background`, `text-foreground`, `border-border`, `bg-primary`, or `bg-accent` is checked for unintended change.
- **Verify:** computed styles and screenshots on the preview: home, Saved, a job panel, admin login, admin dashboard (with the guard).

### UX-03. Public backup-search banner

**Status:** Not started.

- **Scope:** remove "Running on backup search (temporarily)" and its "Try again" from the public pages (`HomeClient.tsx`). Search health stays on the admin dashboard.
- **Not in scope:** the Meilisearch fault itself (W-18).
- **Depends on:** UX-02.
- **Acceptance:** no banner on any public page; search, filters, and paging still work; the admin Search card is unchanged.
- **Verify:** preview, public pages at both widths; admin dashboard with the guard.

### UX-04. False "listing page" alarm in Data Quality

**Status:** Not started.

- **Scope:** `apps/backend/app/data_quality.py` counts a job as pointing to a listing page by matching `/jobs`, `/careers`, `/vacancies`, `/opportunities`, `/list`, or `/search` anywhere in `apply_url`, which matches host names such as `jobs.unicef.org`. Match the path only, and define "listing page" so verified vacancy links (UNICEF `/job/{id}/…`, ICRC `/job/…/{id}`, Oxfam `/jobs/vacancy/…/description/`) are not flagged. Both queries in the file. Tests with those three real link shapes and a real listing link.
- **Not in scope:** the score formula otherwise; other checks.
- **Depends on:** UX-03.
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

**Status:** Not started.

- **Scope:**
  - The saved count in the menu stays at its old value after removing a job until reload; it must update at once.
  - Dates: one shared formatter, `lib/dates.ts`, giving unambiguous dates such as "28 Oct 2026", used by the job list, the job panel, Saved, and the admin, replacing `10/28/2026` and raw timestamps such as `2026-10-19T19:24:44.794571+00:00`. The redesign reuses it.
  - The search clear button gets an accessible name.
  - The admin login does not say "Your session was not accepted" to a first-time visitor.
- **Not in scope:** the search behaviour behind the clear button (W-17 is removed with Trinity in UX-12).
- **Depends on:** UX-06.
- **Acceptance:** each item observed fixed on the preview at both widths; formatter unit tests.
- **Verify:** preview and live.

## Stage B — Launch redesign

### UX-08. Launch decisions (gate)

**Status:** Not started. **Nothing in UX-09 to UX-18 starts until every item here is recorded as decided.**

1. **Direction approval.** The user approves `public-ux-direction.md` as written or amended. Merging the pull request that added it records the proposal; it is not the approval.
2. **Contract decision** for the public scope changes in contract §2: the organisation filter and place suggestions (new public search features), and the user-interface rewrite under rule 15 with the product reason recorded in the direction document.
3. **Logo** file received from the user (SVG preferred).
4. **Launch date.**
5. **Slow first load.** Assess first, read-only: measure the cold start on Render, find the plan and sleep behaviour, list the options (always-on instance, keep-alive, caching or server rendering that does not wait on a sleeping backend) with cost. Then the user decides.
6. **AI crawlers.** Assess which crawlers exist and what allowing each means, then the user decides which may read the site.
7. **Server rendering approach.** A short technical plan for rendering the job list and job view on the server with the existing Next.js 14 app and backend, and how preview and production reach the backend.
8. **Deployment unknowns** from the table above established.

### UX-09. Design foundation

**Status:** Not started.

- **Scope:** Inter; three text sizes (12, 13, 15px); the ink palette for light and dark following the device; the user's logo, favicon, and app icon; icon set with hover and long-press labels as one component.
- **Not in scope:** page layouts (UX-10 onward).
- **Depends on:** UX-08 (logo, direction).
- **Acceptance:** tokens defined once and used by new components; favicon and app icon return 200; contrast meets WCAG AA for text.
- **Verify:** preview; contrast measured.

### UX-10. Server-rendered shell and search-engine foundation

**Status:** Not started. **Contract decision** (rule 15 rewrite; recorded at UX-08).

- **Scope:** one persistent frame with no header or menu; phone: list with the search bar at the bottom; desktop: list and job panes with a draggable, remembered divider, each pane scrolling and the page not; the address reflects the search and the open job, Back works, and moving between views does not reload the page. The first page of jobs is rendered on the server. A real title and description per view; `robots.txt`; `sitemap.xml`; canonical links; link previews (Open Graph).
- **Not in scope:** the search bar's suggestions (UX-11, UX-12); job pages (UX-24).
- **Depends on:** UX-08, UX-09.
- **Acceptance:** the HTML returned for `/`, fetched without JavaScript, contains job titles; `robots.txt` and `sitemap.xml` return 200; on desktop the document does not scroll; switching views makes no full page load; the divider position survives a reload.
- **Verify:** raw HTML fetch of the preview; browser checks at both widths.

### UX-11. Search API for the bar

**Status:** Not started. **Contract decision** (new public search features; recorded at UX-08).

- **Scope:** backend: an organisation filter on the search query; a suggestions endpoint returning organisations, countries and places, title words, and "closing within 7 days", each with a count over the current filters, never returning a zero count. Tests in the CI lists.
- **Not in scope:** AI; Meilisearch.
- **Depends on:** UX-10.
- **Acceptance:** counts equal the number of jobs the same filters return; no suggestion with zero; response time measured.
- **Verify:** unit tests; preview requests.

### UX-12. One search bar, and removals

**Status:** Not started.

- **Scope:** the bar with chips, keyboard use, and smart views on an empty bar. Remove `TrinitySearchBar` and its public use of `/api/search/parse` and `/api/search/autocomplete`, the five collections (pages, `lib/collections.ts`, menu), and the Level, International eligible, and Mission Tags filters and the on-page country list.
- **Not in scope:** backend AI code removal (separate, later); filling each source's empty organisation type, which only the UN Jobs collection used.
- **Depends on:** UX-11.
- **Acceptance:** no suggestion leads to zero jobs; removing every chip and clearing the text shows all jobs and a clean address (W-17 closed); the removed pages return 404 or redirect to `/`.
- **Verify:** preview at both widths.

### UX-13. Dense job list

**Status:** Not started.

- **Scope:** two lines per job (title; organisation and place); days left on the right, orange within 7 days and red within 3, full date on hover or long-press; soonest deadline first, jobs without a deadline after; bookmark per row.
- **Depends on:** UX-12, and `lib/dates.ts` from UX-07.
- **Acceptance:** on a 390px phone at least eight jobs are visible without scrolling; no horizontal overflow at 320px; urgency colours match the rule.
- **Verify:** preview.

### UX-14. Job sheet and job pane

**Status:** Not started.

- **Scope:** title, organisation, place with country names (not codes), deadline with days left; fact chips only for facts that exist in the data; "Apply on {organisation}"; save, share (system share sheet or copy link), add the deadline to a calendar (`.ics` with a reminder), email to myself; more from the same organisation and country; the address changes to the job's link and opening that link opens the job. No "International eligible: No" or other values that are unfilled for every job.
- **Not in scope:** the permanent job page and structured data (UX-24); facts read from titles (UX-22).
- **Depends on:** UX-13.
- **Acceptance:** a shared job link opens that job for a new visitor; the calendar file imports into Google Calendar and Outlook; the sheet closes with a swipe and Back.
- **Verify:** preview on a phone-sized screen and a laptop.

### UX-15. Saving without accounts

**Status:** Not started.

- **Scope:** the bookmark icon with a count shows only saved jobs; a saved-list link reopens the same list on another device; saved jobs closing soon move to the top on return.
- **Not in scope:** sign-in, sync, alerts (contract §2 excludes user accounts).
- **Depends on:** UX-14.
- **Acceptance:** the saved-list link reproduces the list in a fresh browser; counts stay correct after every add and remove.
- **Verify:** preview in two browsers.

### UX-16. Accessibility and polish

**Status:** Not started.

- **Scope:** every icon has a label shown on hover and long-press and read by screen readers; full keyboard use; visible focus; text contrast WCAG AA; every empty, loading, and error state has plain wording; reduced motion respected.
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

- **Scope:** repeat the W-26 review method on the preview at 390px and 1366px, public pages; a speed, accessibility, and search-engine audit; the user verifies the domain in Google Search Console and Bing Webmaster Tools and submits the sitemap.
- **Depends on:** UX-17.
- **Acceptance:** no open finding above Low; the user approves the launch.
- **Verify:** recorded results.

## Stage C — Admin redesign

### UX-19. Admin navigation and Sources

**Status:** Not started. **Contract decision:** the contract fixes the admin V1 navigation as Dashboard, Organisations, Sources, Jobs, Crawls, and Data Quality, with Settings and logout allowed (contract, "Admin V1 navigation", and Gate 9). The proposed four-item menu changes that and needs the user's decision first.

- **Scope, once decided:** Dashboard as one health view absorbing Crawls and Settings; Sources with one actions menu per row and a page per source holding its crawl history, test and simulate tools, and the danger area from UX-06; Jobs for moderation; Organisations hidden until Gate 8 is in use. Menu items become links with their own addresses (today they are buttons).
- **Depends on:** UX-18, the contract decision.
- **Acceptance:** each source row is one line; each source's page shows organisation, URL, type, status, schedule, last and next crawl, failure count, recent crawl runs, and health, as the contract asks.
- **Verify:** preview with the guard.

### UX-20. Crawl review

**Status:** Not started.

- **Scope:** a read-only admin view per crawl: found, inserted, updated, rejected by reason, listing completeness (`listing_complete`, `listing_stop`), jobs missing a location or deadline, duplicate links. It replaces the SQL queries the user runs by hand after a crawl.
- **Depends on:** UX-19 (or placed under the contract's Data Quality item if UX-19 is not approved).
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

**Status:** Not started. **Contract decision:** enrichment expansion is out of scope in §2.

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
