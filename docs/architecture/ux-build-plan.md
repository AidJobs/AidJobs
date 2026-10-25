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

1. **The demo is not merged.** It runs on a fixed copy of 206 jobs, reads every fact in the browser, renders only in the browser, and contains inert admin screens. Stage B carries its components into the real site and connects them to the backend. The tag is the reference. The Netlify preview of PR #22 no longer exists (Netlify was deleted on 23 October 2026); to see the demo, build the tag (below).
2. **Public fixes to the current site are dropped.** UX-01 (PR #19), UX-02, UX-03, and the public parts of UX-07 repair code that the switch (UX-29) deletes, and no visitor sees the current site while `aidjobs.app` is down. PR #19 is closed without merging, with the user's approval. The admin keeps its fixes: UX-04, UX-05, UX-06, and the admin parts of UX-07.
3. **Build beside, then switch.** Stage B builds the new public site on `main` at a hidden address (working name `/v2`), marked `noindex` and linked from nowhere, in small pull requests. The current site keeps running until one switch pull request (UX-29) moves the new site to `/`, deletes the old public code, and redirects the old addresses. Production is never half old and half new, and every deletion is reviewed in one place.
4. **Public site first, admin after.** The admin is separate code used only by the user. The old admin keeps the old shared styles until Stage C; they are in use, not stale. New design tokens are built once (UX-09) so the admin reuses them.
5. **Domain.** `aidjobs.app` has expired and `www.aidjobs.app` does not resolve (observed by the user, 20 October 2026). Nothing in Stage B needs the domain. Until it returns: the "Live" check in step 6 of the method uses the Vercel production address; the site tells search engines not to index it; the site address is one setting, so connecting the domain later changes one value. Search-engine registration, the sitemap address, and canonical links wait for the domain (UX-18).
6. **Clean code.** Every step removes what it replaces. The switch removes the old public site entirely and runs a dead-code check. Stage C ends by removing the old shared styles.
7. **The demo is the specification** (decided by the user, 21 October 2026: "The website should be exactly as we finalised in the demo"). The public site's look and behaviour are those of the tag `ux-demo-approved-2026-10-21`. Nothing is added, removed, or restyled unless the user approves that difference. Where any step, acceptance criterion, or the direction's earlier text disagrees with the demo, the demo wins.

**Fidelity check, for every Stage B pull request:**

- Run the tagged demo and the pull request's preview side by side on the same jobs: the demo's job copy loaded into the new site's data path, or the same live jobs loaded into the demo. UX-10 used the Netlify preview of PR #22 for the demo and a local production build of the pull request, fed the demo's 206 jobs through a local stand-in for the search API. With Netlify gone, run the demo from the tag instead: a git worktree of `ux-demo-approved-2026-10-21`, then `npm ci` and `next build` and `next start` on another port, at `/demo`. Compare with the browser's time zone set to UTC, because the demo counts days in UTC and the new site follows the visitor's clock.
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
| 3 | UX-08 launch decisions and assessments, in parallel with the admin fixes UX-04, UX-05, UX-06, UX-07 (admin parts). UX-08 is done. Decided on 24 October 2026 (the user, with placement left to the agent): the admin fixes run next, in order UX-04 to UX-07, after the security follow-up W-22 and before UX-11 | Decisions; code |
| 4 | UX-09 to UX-17, at the hidden address, with UX-26 tests growing alongside from UX-12 | Code |
| 5 | UX-27 launch pages and UX-28 error monitoring | Code |
| 6 | W-02 inspection, then W-06 expiry rule, moved ahead of the other crawler items by the user at UX-08 | Crawler |
| 7 | UX-29 the switch | Code |
| 8 | UX-18 launch check, with the domain connected | Launch |
| 9 | Stage C, UX-19 to UX-21, then UX-30 removal of the old shared styles | Code |
| 10 | Stage D with the crawler | Code |

UX-31, the repository tidy-up, can run at any point with the user's approval of its list.

**Questions decided at UX-08** (21 October 2026; outcomes in `ux-08-launch-decisions.md`: filtering in the browser for launch, title facts read when the page is built, W-06 ahead, domain still being chosen). As first written:

- Filtering on the server or in the browser. Server filtering with counts per pill scales but needs new search features (UX-11). With 200 to 2,000 open jobs, loading all open jobs once and filtering in the browser, as the demo does, with the first page rendered on the server, may be enough for launch. Decide from measurements: payload size, time to first jobs on a phone, job counts expected within a year.
- Where title facts are read (sector, SDG, level, contract, open to, work style, language, UN grade, typical experience). Stored on each job at save time needs crawler changes and a one-off write to every existing job, which needs its own approval. Read from the title each time the backend returns a job needs no storage and no write. Either way it is enrichment under contract §2 and needs a recorded contract decision.
- Moving W-06, the expiry rule, ahead of the other crawler items. Sixteen jobs have not been seen since 6 December 2025 (W-02); a launch that shows them undermines trust. This changes the crawler order the user set, so it is the user's decision.
- Whether to renew `aidjobs.app`, which registrars release after their grace and redemption periods, or to choose another domain.

## How every step is run

1. **Plan.** Read the step, re-check the code and the live site, and write a short plan: files, exact change, tests, risks. Stop for the user's approval.
2. **Build.** A separate branch and pull request per step, from the latest `main`. Only the files the step names. Never stage `apps/backend/scripts/diagnose_enrichment_bias.py` or `tests/test_link_heuristics.py`.
3. **Test.** Frontend: `npm run test --workspace=@aidjobs/frontend` and `npx tsc --noEmit -p apps/frontend`. Backend changes: the CI Ruff and pytest lists in `.github/workflows/ci.yml`, with new tests added to them. CI must pass.
4. **Preview.** Check every acceptance criterion on the pull request's Vercel preview, at 390px and 1366px, and record the measurements in the pull request. The preview's address is the `environment_url` of the commit's GitHub deployment. Previews stay behind the Vercel login; the agent sends the `x-vercel-protection-bypass` header with the key in the user's Windows environment variable `VERCEL_AUTOMATION_BYPASS_SECRET`, never written to the repository, a log, or the chat. Vercel attaches the key to a preview when it is built, so a preview built before the key existed rejects it. Vercel's preview toolbar keeps the network busy, so browser checks wait for the page and the job rows, not for an idle network. The user sees previews by signing in to Vercel.
5. **Merge.** Only with the user's explicit merge approval for that pull request.
6. **Live.** After the deploy, check the acceptance criteria again on `aid-jobs-frontend.vercel.app` until the domain is connected (UX-18).
7. **Record.** Update this step's status line and the ledger. A step is **Done** only after the live check; merged code alone is not done.

Admin pages, on a preview or live:

- The user logs in; the agent never handles the password.
- Before interacting, install the read-only browser guard that blocks every non-GET request, test it with a dummy POST, and move between admin pages with the sidebar so the guard stays loaded. Reload the tab afterwards to remove it.
- Never click Run crawl, Run due sources, Delete, Execute Sync, Initialize Index, Backfill, or Restore during verification. Destructive controls are tested only with unit tests or with the user present and approving each action.

Status values: **Not started**, **Planning**, **Plan approved**, **In PR**, **Preview verified**, **Merged**, **Done** (live verified), **Blocked** (with the reason).

## Deployment, as established

| What | Behaviour | Evidence |
| --- | --- | --- |
| Merge to `main`, frontend | Vercel builds a Production deployment for `aid-jobs-frontend.vercel.app` within a few minutes; GitHub's webhooks sometimes start it several minutes late | Verified from GitHub deployments, most recently the UX-10 merge `d13d983` on 23 October 2026 |
| Merge to `main`, backend | Render redeploys automatically, unless a manual deploy of a specific commit has switched Auto-Deploy off (see the ledger) | Verified by the user for each merge; the agent cannot see Render, so each deploy is confirmed by the user |
| Pull request, Vercel preview | Built for every commit, behind the Vercel login; opened by the agent with the bypass key (method step 4) | Verified 23 October 2026: 302 to the Vercel login without the key; with it, all 275 jobs in the HTML, and the full phone (90 of 90) and desktop (33 of 33) checks passed |
| Pull request, Netlify preview | No longer used (user decision, 23 October 2026). The user deleted the Netlify site the same day, removing its previews and its old production copy | Verified 23 October 2026: every Netlify address returns 404 |
| Previews and data | Previews read the production backend. An admin action on a preview changes production | Verified for reads; writes inferred, not tested |
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

**Status:** Done 24 October 2026. PR #35, merged as `124cc3f` with the user's approval; CI passed on `124cc3f`; the user confirmed Render live on `124cc3f`; live check passed the same day (below).

What was found and done (24 October 2026):
- The code on `main` counted a job as a listing page when its apply link contained `/jobs` or `/careers` anywhere, host included (SQL `LIKE`, in the per-source and global reports and in the sources-with-issues list); the per-job check in `validate_job` used a word list against the whole link. The per-source report also failed on every call: its `LIKE '%/jobs%'` sat in a query with a `%s` parameter, so the database driver read the `%` signs as placeholders and raised `IndexError` (seen on all three sources, read-only). The admin per-source Data Quality view could never load.
- The fix is one rule, `is_listing_url` in `apps/backend/app/data_quality.py`, used by all four places. It reads the path only, ignoring host, query string, letter case, trailing slashes, and page extensions (`.html`, `.aspx`, `.php`, `.jsp`). A link is a job when a job word (`job`, `jobs`, `vacancy`, `vacancies`, `position`, `positions`, `posting`, `requisition`) is followed later in the path by a segment with an identifier (three or more digits, or a hex id of eight or more characters); a job link is never a listing, whatever word it ends in. Otherwise it is a listing when it has no path or its last segment is a listing word (`jobs`, `careers`, `vacancies`, `listing`, `search`, `home`, `internships`, and similar). A value that is not an absolute `http` or `https` address is not classified. The SQL counts are replaced by the same rule applied in Python to the fetched links. The score formula, the crawler, ingestion, and the admin interface are unchanged; nothing in the crawler or ingestion calls this module.
- Tests: `apps/backend/tests/test_data_quality_listing.py`, 41 tests, added to CI's Ruff and pytest lists. They cover the real UNICEF, ICRC, and Oxfam job links; real listing pages; job links ending in a listing word (`/job/12345/search`); capitals; query strings; trailing slashes; links with no path; malformed and relative values; host names containing `jobs` or `careers`; and both reports counting through the rule. Local result: CI's Ruff list passes; CI's pytest list, 282 passed.
- Live comparison, read-only (24 October 2026): every connection was opened read-only and checked with `SHOW transaction_read_only` = `on` before any query. Both the code on `main` and the new code ran against the live database; every link was also classified locally under both rules.

| Measure, jobs not deleted (322, all active) | `main` | New |
| --- | --- | --- |
| Listing pages, global report | 322 | 0 |
| Global quality score | 75.0 | 100.0 |
| Sources with issues | 3 | 0 |
| Per-source report, UNICEF (301 jobs) | fails (`IndexError`) | 0 listing pages, score 100.0 |
| Per-source report, ICRC (14 jobs) | fails (`IndexError`) | 0 listing pages, score 100.0 |
| Per-source report, Oxfam GB (7 jobs) | fails (`IndexError`) | 0 listing pages, score 100.0 |

All 322 were flagged by the old rule only; none by both rules or by the new rule only. Their shapes: UNICEF `jobs.unicef.org/en-us/job/{id}/{title}` (301, for example `https://jobs.unicef.org/en-us/job/585973/emergency-officer-no1-sokoto-nigeria-134792-temp-appointment`), ICRC `careers.icrc.org/job/{title}/{id}` (14, for example `…/job/Geneva-%28GVA%29-WatHab-WaSH-Project-Manager-33632/1448577233`), Oxfam `jobs.oxfam.org.uk/jobs/vacancy/{title}/{id}/description/` (7, for example `…/jobs/vacancy/finance-officer-int11802/25026/description/`). No null links, no duplicate links. The 16 soft-deleted jobs, which the reports exclude, were also checked: the new rule flags the two real listing pages (`https://www.unicef.org/careers`, `https://www.unicef.org/careers/internships`), and flags neither the 8 UNICEF careers articles (`www.unicef.org/careers/{article}`) nor the 6 social, badge, and reporting links. The old rule flagged the listing pages and the 8 articles.

Remaining after UX-04:
- Pages that are neither jobs nor listings, such as the UNICEF careers articles, are not counted by this check. Admission rejects them at crawl time (`root_careers_page`, `social_profile`, `vendor_badge`).
- A listing address that ends in a number, such as ICRC's `/go/Global-Opportunities/8821501/`, is not classified as a listing. No job links to it today.
- `app/data_quality.py` is not in CI's Ruff list. It has three style findings (import order, one long line, one unused variable), all already on `main`; `main` had five, and the change removes two.
- The Data Quality page lists only sources with issues, so with none it reads "No source quality data available" (moved to UX-05).

Live check, 24 October 2026, after the merge (Verified). The read-only comparison was run again on the merged code, read-only confirmed: the same figures as above. The user signed in to the admin in Cursor's browser; with the read-only guard installed and tested (a dummy POST blocked through both `fetch` and `XMLHttpRequest`), and no control clicked, the live Data Quality page read: Global Quality Score 100.0; Total Jobs 322 across 3 sources; Unique URLs 322 (100.0%); Issues Detected 0; Null URLs 0; Listing Page URLs 0; Sources with Issues 0. The page's own per-source request, sent as a GET for each source, answered `200` with `status: ok` for UNICEF (301 jobs), ICRC (14), and Oxfam GB (7): 0 listing pages, 0 null links, 0 duplicates, score 100 each. On the old code each of these failed, so this also shows the new code is live. The tab was reloaded afterwards to remove the guard. The preview was not used for this check: previews call the production backend, which ran the old code until the merge.

- **Scope:** `apps/backend/app/data_quality.py` counts a job as pointing to a listing page by matching `/jobs`, `/careers`, `/vacancies`, `/opportunities`, `/list`, or `/search` anywhere in `apply_url`, which matches host names such as `jobs.unicef.org`. Match the path only, and define "listing page" so verified vacancy links (UNICEF `/job/{id}/…`, ICRC `/job/…/{id}`, Oxfam `/jobs/vacancy/…/description/`) are not flagged. Both queries in the file. Tests with those three real link shapes and a real listing link.
- **Not in scope:** the score formula otherwise; other checks.
- **Depends on:** the docs pull request of 21 October 2026 (previously UX-03, now dropped).
- **Acceptance:** for today's 218 active jobs the count drops from 218 to the true number (expected 0); the global score rises accordingly; tests pass in CI.
- **Verify:** unit tests; admin Data Quality page on the preview and live, with the guard.

### UX-05. Admin numbers and status that mislead

**Status:** Plan approved by the user on 24 October 2026, with Decision 5 ("Key set, not tested" / "No key") and four clarifications: labels describe the existing count definitions without changing any count or job status; Recent Activity reuses the Crawls page's crawl log, with no crawler or logging change; database search confirmed as the real search path before the health score changes; UX-06, W-06, W-14, UX-19 and the crawler stay out. Done 24 October 2026: PR #37, merged as `826f59a` with the user's approval; CI passed on `826f59a`; Vercel production deployed `826f59a` (Verified from GitHub deployments); the user confirmed Render live on `826f59a`; live check passed the same day (below).

What each number counts (from the code; live values read-only on 24 October 2026, read-only confirmed):

| Where | Label before | Counts | Live |
| --- | --- | --- | --- |
| Dashboard | Total Jobs | every job row, deleted included | 338 |
| Dashboard | Active (Frontend) | active, not deleted, deadline not passed; the same filter as the public site | 263 |
| Jobs page | "of N jobs" (default filter) | not deleted, any status | 322 |
| Data Quality | Total Jobs | active, not deleted, any deadline | 322 |
| Data Quality, per source | jobs | not deleted, any status | 301, 14, 7 |
| Crawls, per run | Total Jobs | not deleted, any status, for that source | — |
| Dashboard | Active Sources / Sources | every source row | 3 |

338 − 322 = 16 deleted jobs; 322 − 263 = 59 active jobs whose deadline has passed (their retirement is W-06). Database search confirmed as the search path: `/api/search/query` answers `source: "db"` with 263 jobs, and `/api/search/status` answers `Meilisearch not configured` (Verified, 24 October 2026).

What was built (frontend only; no backend, count, crawler, or data change):
- `apps/frontend/lib/admin/status.ts`: the labels and the status rules in one place, with `lib/__tests__/adminStatus.test.ts` (20 tests).
- Labels: dashboard "All job records (including deleted)", "Open on the public site", "Sources", "Open jobs by source"; Jobs page totals name their filter ("not deleted, any status", "active, not deleted", "deleted only", "including deleted, any status"); Data Quality "Active jobs (including past deadline)" for the global total and "jobs (not deleted, any status)" per source; Crawls "Jobs (not deleted)". The dashboard's "Indexed Documents 0" shows only when Meilisearch is connected.
- Data Quality source list: every source from `GET /api/admin/sources` (deleted sources left out), each report loaded on its own. States: all healthy ("No issues found in N sources", each source listed with its score and openable); some with issues (marked "Has issues", listed first, healthy sources still listed); a report that failed (that row says so, with Retry; the others still shown); the list itself failing (an error with Retry); no sources ("No sources yet", the only "no data" wording); the global report failing (a banner with Retry). "Has issues" uses the global card's test: a job without a link or linking to a listing page.
- Dashboard Recent Activity: the latest 5 runs from `/api/admin/crawl/logs`, the Crawls page's own source; "No crawl runs yet" or "Could not load recent crawls" otherwise.
- Search status: "Search runs on the database (Meilisearch not used)" in grey when the backend reports Meilisearch not configured; a configured Meilisearch that fails, or a status that cannot be read, still shows red. The health score counts the database and the crawler, as before, and no longer Meilisearch.
- Settings: Database (Supabase) "Connected" / "Connection settings missing" / "Cannot connect"; Meilisearch "Not used: search runs on the database" only when the backend says it is not configured, otherwise "Connected", "Settings present, not connected", or "Not responding"; AI "Key set, not tested" or "No key".
- "Check console for details" and "Check server logs" / "Please check backend logs" removed from the dashboard's messages.
- Local checks: TypeScript passes; lint shows only two warnings already on `main` (Jobs page hooks); the frontend Jest suite, 96 passed.
- PR #37: CI green (backend, frontend, secrets, Vercel preview). Preview check, 24 October 2026 (Verified): the user signed in to Vercel and to the preview's admin in Cursor's browser; the read-only guard was installed and tested (a dummy POST blocked through `fetch` and `XMLHttpRequest`), pages were opened with client-side navigation so the guard stayed loaded, and no control was clicked except one Data Quality source row (opens its loaded report; no request). The preview reads the production backend. Dashboard: System Health 100%; "Open on the public site" 263; "All job records (including deleted)" 338; Sources 3; open jobs by source UNICEF 242, ICRC 14, Oxfam GB 7; Recent Activity the five newest runs, identical to the first five on the Crawls page (Oxfam 23 Oct found 5, new 2, updated 1; UNICEF 23 Oct `warn` found 120, new 102, updated 1; ICRC 21 Oct found 34; Oxfam 20 Oct and 19 Oct); Search "Search runs on the database (Meilisearch not used)" with a grey dot. Crawls: "Jobs (not deleted)" 7, 301, 14. Jobs: "Showing 1–50 of 322 jobs (not deleted, any status)". Data Quality: score 100.0; "Active jobs (including past deadline)" 322; "No issues found in 3 sources."; Oxfam GB, ICRC, and UNICEF each listed with score 100.0, "No issues found", and "jobs (not deleted, any status)" 7, 14, 301; UNICEF's report opened (301 jobs, 0 null, 0 listing). Settings: Database (Supabase) "Connected"; Meilisearch "Not used: search runs on the database"; AI "Key set, not tested". The tab was reloaded afterwards to remove the guard.
- Live check, 24 October 2026, after the merge (Verified): the user signed in to the live admin in Cursor's browser; the page was reloaded to load the new build, then the read-only guard was installed and tested (a dummy POST blocked through `fetch` and `XMLHttpRequest`), pages were opened with client-side navigation so the guard stayed loaded, and no control was clicked. The live admin showed the same as the preview: dashboard System Health 100%, "Open on the public site" 263, "All job records (including deleted)" 338, Sources 3, open jobs by source 242, 14, 7, Recent Activity the same five runs as the Crawls page, Search "Search runs on the database (Meilisearch not used)"; Crawls "Jobs (not deleted)" 7, 301, 14; Jobs "Showing 1–50 of 322 jobs (not deleted, any status)"; Data Quality score 100.0, "Active jobs (including past deadline)" 322, "No issues found in 3 sources.", all three sources listed at 100.0 with "No issues found"; Settings Database "Connected", Meilisearch "Not used: search runs on the database", AI "Key set, not tested". The tab was reloaded afterwards to remove the guard. The failure states (a report or the list failing, no sources) cannot appear while everything is healthy; the automated tests cover them, and none was forced on the live site.

- **Scope:**
  - Job totals: the dashboard shows 234, Jobs and Data Quality 218, the public site 206. First establish from the code what each counts (all rows, active, not hidden, deadline not passed), then label each number with that meaning.
  - Dashboard "Recent activity" reads "No recent activity" while Crawls lists crawls: show the latest crawl runs, or remove the card.
  - Settings shows "AI: Configured" while every call fails with `401` because the key was revoked, and "Meilisearch: Not configured" while the dashboard reports an invalid response. Report what is true: key present or absent, and the last call's outcome where known.
  - Replace "Check console for details" with a plain message.
  - Data Quality, "Source Quality Reports" (found 24 October 2026, after UX-04): the list is built from the global report's sources with issues, so when every source is healthy it reads "No source quality data available" and no source's report can be opened, although each report loads. The same message also shows when the reports fail to load, which hid the per-source failure fixed in UX-04. Separate three states: all sources healthy (every source listed with its score, each report still openable, worded as no issues found); some sources with issues (those marked, healthy sources still listed); a report that failed to load (an error message, never "no data"). The list of sources needs its own source of truth, not the issues list; the plan confirms which existing endpoint serves it.
- **Not in scope:** fixing Meilisearch (W-18) or AI (W-14); the menu change (UX-19).
- **Depends on:** UX-04.
- **Acceptance:** every number on the dashboard, Jobs, and Data Quality has a label saying what it counts, and the same quantity shows the same value everywhere; Data Quality lists every source when none has issues and tells "no issues found", "no data", and "failed to load" apart; recent activity matches the Crawls page; AI and search status match reality on 20 October terms (AI failing, search on the database).
- **Verify:** with the guard, compare the dashboard, Jobs, Data Quality, Crawls, and Settings on the preview and live; the user confirms totals with one read-only SQL count if needed.

### UX-06. Admin delete safety and dead controls

**Status:** Plan approved by the user on 24 October 2026, with the Jobs-page option "remove the per-row bin; Soft Delete keeps its window and Restore; Hard Delete requires typing the number of jobs", and safeguards: typed confirmations are exact and case-sensitive, with no trimming; destructive buttons stay disabled until they match, and the action itself checks again; if an impact count does not load, an error shows and the action stays disabled (applied to both source deletes); no change to backend deletion, restore, job status, or expiry; the broken Delete Jobs window removed, not repaired; Meilisearch controls hidden only when the backend confirms it is not configured; "Cleanup expired jobs" removed without adding expiry logic. Done 25 October 2026: PR #39, merged as `a021911` with the user's approval; CI passed on `a021911`; Vercel production deployed `a021911` (Verified from GitHub deployments); the user confirmed Render live on `a021911`; live check passed the same day (below).

Found before the plan (24 October 2026, code and the live backend's route list, read-only):
- Sources rows carried "Delete Jobs", "Delete Source", and "Permanently delete" beside Run, Pause, and Edit. "Delete Jobs" called `/api/admin/crawl/deletion-impact/{id}` (404 live) and `/api/admin/crawl/delete-jobs-by-source` (not a backend route), so it could never load its impact or delete; its "Proceed with Deletion" also re-ran the dry run. "Delete Source" (status `deleted`, its jobs soft-deleted; undone by Resume and Restore) and "Permanently delete" (only after a delete; removes the source and, by cascade, its crawl logs; jobs keep `source_id` NULL) used one browser `confirm`.
- Jobs rows carried a red bin beside View details; Soft Delete is undone by Restore; Hard Delete asked only for a reason.
- Dashboard "Check Sync", "Execute Sync", and "Initialize Index" showed while Meilisearch is not configured. Crawls "Cleanup expired jobs" calls a backend action that returns `disabled` and deletes nothing.
- Four other frontend proxies point at routes the backend does not have (`config-check`, `crawl-v2/run`, `data-quality/logs`, `data-quality/stats`); no page calls them. Left for UX-31 with the two Delete Jobs proxies.

What was built (frontend only):
- `apps/frontend/lib/admin/danger.ts` with `lib/__tests__/adminDanger.test.ts` (12 tests): exact confirmation, the Hard Delete count, which danger actions a source offers, impact counts and their failure, the "at least" wording for a capped count, enabling only when counts loaded and the text matches, and when Meilisearch controls show.
- Sources table: the three delete actions removed from the row; the whole Delete Jobs window, its dry-run result window, and their state removed. Tooltips: "Run crawl now"; the details button reads "Source details and delete options".
- Source page (`/admin/sources/{id}`): a red-bordered "Danger area" below the crawl runs. "Delete source…" (when not deleted) opens a window stating it stops crawling and hides N jobs (from `GET /api/admin/jobs/search?source_id=…`, the same not-deleted set the backend hides) and how to undo it. "Permanently delete…" (only when deleted) states it removes the source and M crawl runs (from `GET /api/admin/crawl/logs`, up to 100, shown as "at least 100" when capped), that it cannot be undone, and that its hidden jobs stay without a source. Each requires the exact organisation name; the button is disabled until it matches and every count loaded; a failed count shows an error and keeps it disabled; the confirm handler re-checks before sending the existing `DELETE` request.
- Jobs page: the per-row bin removed (deleted rows keep Restore); deleting requires a selection; Hard Delete shows "cannot be undone" and requires typing the exact number of selected jobs, checked on the button and in the action. The request still lists exactly the selected job IDs.
- Dashboard: Check Sync, Execute Sync, and Initialize Index hidden only when the backend reports Meilisearch not configured.
- Crawls: "Cleanup expired jobs" and its handler removed.
- Local checks: TypeScript passes; lint shows only the two warnings already on `main` (Jobs page hooks); the frontend Jest suite, 108 passed.
- PR #39: CI green (backend, frontend, secrets, Vercel preview). Preview check, 25 October 2026 (Verified): the user signed in to the preview's admin (the first sign-in was again "not accepted"; the second held; cause not investigated); the session was confirmed (`/api/admin/session` 200, authenticated) before the read-only guard was installed and tested (a dummy POST blocked through `fetch` and `XMLHttpRequest`); pages were opened with client-side navigation. The guard blocked only Vercel Analytics page-view pings; no admin write was attempted. Dashboard Search card: no buttons, "Search runs on the database (Meilisearch not used)". Crawls header: "Run due sources" and "Refresh status" only. Sources: all three rows offer Run crawl now, Pause, Edit, Test source, Simulate extraction, Export source, and "Source details and delete options"; no delete action anywhere on the page. Oxfam GB's page: "Danger area" with "Delete source…"; its window read "This stops crawling the source and hides 7 jobs from the public site", with the undo steps; the "Delete source" button stayed disabled for an empty field, `oxfam gb`, `Oxfam GB ` (trailing space), ` Oxfam GB` (leading space), and `Oxfam`, and became enabled only for `Oxfam GB`; it was not clicked; the text was cleared and the window cancelled. Jobs: rows offer only "View details"; one row was ticked, "Delete selected" opened the window, Hard Delete showed "Hard Delete cannot be undone. 1 job will be removed permanently." and "Type 1 to confirm" with its field; the main button read "Analyze Impact" (not clicked, as analysis is a POST); the window was cancelled and the row unticked. The Hard Delete button's enabled state after analysis was not exercised in the browser (it needs the analysis POST); the unit tests and the action's own check cover it. No source was in the deleted state, so "Permanently delete…" was not shown; the unit tests cover it. The tab was reloaded afterwards to remove the guard.
- Live check, 25 October 2026, after the merge (Verified): the user signed in to the live admin; the page was reloaded to load the new build; the session was confirmed (`/api/admin/session` 200, authenticated); the read-only guard was installed and tested; pages were opened with client-side navigation. The guard blocked only Vercel Analytics page-view pings; no admin write was attempted. As agreed with the user, the live check used wrong text only and ticked no job. Dashboard Search card: no buttons. Crawls header: "Run due sources" and "Refresh status" only. Sources: all three rows offer only Run crawl now, Pause, Edit, Test source, Simulate extraction, Export source, and "Source details and delete options"; no delete action on the page. Jobs: "Showing 1–50 of 322 jobs (not deleted, any status)"; rows offer only "View details". Oxfam GB's page: "Danger area" with "Delete source…"; its window read "This stops crawling the source and hides 7 jobs from the public site", with the undo steps; the button stayed disabled for an empty field, `oxfam gb`, `Oxfam GB ` (trailing space), ` Oxfam GB` (leading space), and `Oxfam`; the exact name was not typed on the live site (shown enabling the button on the preview); the field was cleared and the window cancelled. The tab was reloaded afterwards to remove the guard.

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

**Status:** Done, 21 October 2026. Every item is decided in `docs/architecture/ux-08-launch-decisions.md`, except the domain (item 9), which the user is still choosing and which only UX-18 needs. Consequences applied in this plan: UX-09 no longer waits for the logo, which UX-18 needs instead; UX-11 is narrowed to reading every open job; UX-17 carries the cached page and the always-on backend; W-06 is in the order table before UX-29; robots rules follow item 6 (all AI crawlers allowed except `Bytespider`).

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

**Status:** Done, 21 October 2026. PR #26, merged as `8083591`; live on `aid-jobs-frontend.vercel.app/v2` at 390px and 1366px: `noindex`, Manrope, dark mode, text size, and high contrast applied and kept after a reload, no sideways scrolling, no page errors; the current site and the admin unchanged. The new contrast test (`lib/__tests__/siteContrast.test.ts`) found three demo colours below WCAG AA; the user approved the fixes with the merge: count badges white on `sage-8` in light (was 3.94) and dark text on `sage-7` in dark (was 2.12); `sage-8` is `#33612b` in light high contrast (sage chips were 4.48). The flag component imports every flag; UX-17 reduces that. The acceptance item "favicon and app icon return 200" moved with the logo to UX-18 (UX-08); `favicon.ico` still returns 404. Plan, as approved: the demo's design settings (colours, text sizes, shapes) defined once; Manrope; the tooltip, flag, bottom-sheet, and settings-panel components carried over from the tag without redrawing; the flag-icon package; an empty shell at the hidden `/v2` address, marked `noindex`; contrast measured for every text colour in light, dark, and high contrast; no change to the current site, the admin, or the backend.

Stage B, UX-09 to UX-17, builds at the hidden address from the revision, not at `/`. Each step takes its look and behaviour from "Approved in the design demo" in `public-ux-direction.md` and carries the demo's components over from the tag; where a step's text below predates the demo, the approved demo decisions apply and the step's plan reconciles them.

- **Scope:** the typeface chosen in the demo (Manrope); text sizes 12, 13, and 15px plus one large light size for page titles and large numbers; ink and sage for light and dark, following the device; the user's logo, favicon, and app icon; Lucide icons with hover and long-press labels as one component; SVG flags; card, pill, and hairline shapes. Shared by the public site and the admin. The demo's styles are reused, not redrawn.
- **Not in scope:** page layouts (UX-10 onward); the final logo, favicon, and app icon, which arrive with the domain and are fitted at UX-18.
- **Depends on:** UX-00 (approved look), UX-08 (direction). Not on the logo (UX-08 item 3).
- **Acceptance:** tokens defined once and used by new components; favicon and app icon return 200; contrast meets WCAG AA for text.
- **Verify:** preview; contrast measured.

### UX-10. Server-rendered shell and search-engine foundation

**Status:** Done, 23 October 2026. PR #28, merged as `d13d983`. Live on `aid-jobs-frontend.vercel.app/v2`: "do not index" on `/`, `/v2`, the admin, `robots.txt`, and `sitemap.xml`; the backend was asleep during Vercel's build, so the first cached page was the "Loading jobs…" frame, and browsers loaded the jobs themselves (275 jobs in 3.0 s on a laptop and 6.6 s on a phone, no page errors); once the 10 minutes had passed, the next request got the old page while Vercel rebuilt it, and the following request had all 275 jobs in the HTML (Verified, 11:14 to 11:15 IST). Keeping the last good page when a refresh fails is still Not verified on Vercel (open item 4). The Netlify step (open item 17) is blocked: see that item. Before the merge, verified locally with a production build:

- Raw HTML of `/v2` holds every open job (287 rows, the backend's total) and the count; 98 KB compressed (804 KB uncompressed, of which about 300 KB is inline flag images and 148 KB the job data for the browser; UX-17).
- No hydration or page errors at 390px and 1366px, light and dark, and with saved settings (the only failed request locally is Vercel Analytics' script, which exists only on Vercel). Saved dark theme, larger text, collapsed menu, and divider position are in place before any JavaScript runs, and the list does not move when it loads.
- The desktop page does not scroll; no sideways scrolling at 390px; opening a job sets `?job=`, the tab shows its title, Back closes it without a page load; the divider survives a reload; a shared job link opens the job for a new visitor.
- `robots.txt` and `sitemap.xml` return 200 with the UX-08 rules; `X-Robots-Tag: noindex, nofollow` on `/`, `/v2`, the admin, and the search files, plus the page tag on `/`.
- Cache, with a 20-second refresh in a local build only and a stand-in backend: an answer of "ok" with no jobs, and an unreachable backend, each left the last good page in place over two refresh cycles (the server logged the refused rebuilds); when the backend returned, the next refresh rebuilt the page. A build with the backend not answering for 45 seconds and no saved answers finished after 40 seconds with the frame and "Loading jobs"; the browser then showed "Jobs could not be loaded" and "Try again", which loaded all jobs once the backend answered. Next.js keeps the previous backend answer in its fetch cache and uses it while it asks again, so a refreshed page can show data up to two refresh periods old. Vercel's own behaviour stays Not verified until seen live.
- Fidelity check against the tag with the demo's own 206 jobs (185 still open) served to both sites, at 360px, 390px, 412px, and 1366px, light and dark, every screen in the method: home, the Sector sheet and scrolled, Organisation, Country, Deadline, Filters, sort, the 10-day view, the job sheet and pane, Saved, the drawer, the settings panel, the collapsed rail and its pop-out, "Soonest deadline". Every screen is pixel-identical except the intended differences: the "demo" tag, the Demo menu section, the "Demo data" footnote, and the job sheet's "Demo note" (without it the phone sheet is shorter, so it starts lower). The check found one regression, fixed before the pull request: the phone search inside a sheet took focus, which would open the keyboard.
- Decided by the user, 23 October 2026, on the three points raised in the pull request:
  1. Loading and error wording left to the agent: "Loading jobs…"; "Jobs could not be loaded", "Please try again in a minute.", and "Try again". Shown only when a deploy ran while the backend was down.
  2. Locations: add the spellings. Names are now matched without regard to accents, apostrophe styles, "&" or "and", case, or a leading "The"; the official UN names and other common spellings are added; a location's country is the last part that names one ("Afghanistan, various sites"). Of the 19 live locations the demo left without a country, 10 now get one; the 9 left are regions (including "Fiji/Pacific Island Countries"), global roles, two empty locations, and "(excluding Kingston, Jamaica)", which correctly names no country. A few CLDR names are shown plainer: "Myanmar" (was "Myanmar (Burma)"), "DR Congo" and "Congo" (were "Congo - Kinshasa" and "Congo - Brazzaville"), "State of Palestine" (was "Palestinian Territories", the name UNICEF uses), "Hong Kong", "Macao", and "and" for "&".
  3. Time zone: "Today", days left, closed jobs, the 10-day view, the Recommended order, and "last checked" dates follow the visitor's own clock and time zone. The first render still uses the cached page's UTC day so it matches the server's HTML; the browser switches to its own day straight after, again at local midnight, and whenever the page is shown again. Checked with the browser set to UTC, India, New York, and New Zealand. The backend still drops a job once its deadline has passed in UTC, so in the Americas a job closing "today" leaves the list that evening.
- Review of 23 October 2026, asked for by the user, with phones first. Fixed:
  - Tapping a button on a phone opened its label and left it on screen (the tap's emulated hover and focus). Labels now open on a mouse hover, keyboard focus, or long-press only; a swipe across the day strip no longer opens one.
  - The phone Back button or gesture with the menu, a filter sheet, Filters, or sort open left the site. Each now has its own history entry, so Back closes it.
  - Closing a job with its close button or the scrim added a history entry, so Back reopened the job; a similar job opened from inside a job added another. Closing now returns to the list and Back does not reopen it.
  - The phone job sheet had a grab handle but no swipe; pulling it down from the top of its content now closes it.
  - The Saved count included saved jobs that have since closed, which no longer show in Saved.
  - A shared link to a closed job opened nothing; it now says "That job is no longer open" and clears the address.
  - The calendar file could fail to download in Safari and Firefox.
  - On iPhones before iOS 16, the browser's own job loading (only after a deploy with the backend down) would always fail.
  - Sideways on a notched iPhone, the list ran under the notch.
  - Netlify previews loaded Vercel Analytics, which exists only on Vercel, and logged an error on every page.
- Phone checks after the fixes, Android (Chromium, Pixel 7) and iPhone (WebKit, iPhone 13), 90 of 90: no errors and no sideways scrolling at 320px, 360px, 390px, and 412px at normal and the largest text size; a tap leaves no label; the Sector sheet's search does not raise the keyboard; Back closes the Sector sheet, the drawer, Filters opened from the drawer, and the job sheet, staying on the site; the swipe closes the job sheet; the search key closes the keyboard; a closed job's link says so; "Today" is the visitor's date in four time zones. Desktop checks 33 of 33, including labels on hover and keyboard focus. The fidelity subset against the tag after the fixes (360px, 390px, 1366px, light and dark) changed only where intended: Myanmar's flag and name on the Oxfam Yangon job. Real devices remain for UX-18; WebKit in Playwright is not iPhone Safari, and the on-screen keyboard cannot be emulated.

**Open after UX-10** (recorded 23 October 2026 at the user's request, to resolve later). Each item names the step that resolves it; none is approved for work until that step's plan is.

| # | Item | Why it matters | Resolved at |
| --- | --- | --- | --- |
| 1 | The backend drops a job once its deadline has passed in UTC (`deadline >= CURRENT_DATE`), so in the Americas a job closing "today" leaves the list that evening, before the visitor's day ends | Visitors in the Americas lose same-day jobs early | A backend change with its own approval: keep jobs until a day after the deadline and let the browser hide them on the visitor's clock (with UX-11) |
| 2 | Paging orders by `last_seen_at`, which is not unique; the page refuses an incomplete result, so a crawl during a refresh only delays the refresh | Delayed refreshes, never wrong data | UX-11: unique tie-breaker (`id`) with a test |
| 3 | Next.js reuses the previous backend answer while it asks again, so a refreshed page can show data up to about 20 minutes old | Freshness | UX-17, if it matters in practice |
| 4 | Vercel's own handling of the cached page. The refresh is verified live (23 October 2026: after 10 minutes the next request rebuilt the page with all jobs); keeping the last good page when a refresh fails is proven locally only | The cache is the answer to the sleeping backend | Observe it live the next time the backend fails during a refresh; no forced outage |
| 5 | Page weight: 98 KB compressed for 287 jobs; about 300 KB of the uncompressed HTML is inline flag images, and the flag component bundles every flag | Speed on slow phones | UX-17 |
| 6 | Where the visitor's date differs from UTC (India before 05:30, the Americas in the evening), the list updates once just after load; a visitor who chose "Soonest deadline" sees one re-sort after load | A brief visible change | Accepted; revisit at UX-17 only if it is noticeable on real phones |
| 7 | Real devices not yet checked: iPhone Safari with the keyboard and the fixed search bar, the notch padding when sideways, Samsung Internet, desktop Safari and Firefox | Emulation is not the real browser | UX-18 |
| 8 | The browser checks used for UX-10 (fidelity against the tag, phone flows, cache survival) are throwaway scripts outside the repository | They do not protect future changes | UX-26: turn them into repository tests run on every pull request |
| 9 | Accessibility from the demo: the job sheet and job pane do not move or trap keyboard focus; each job row is a button with the bookmark button inside it; Escape does not close the job pane on desktop | Keyboard and screen-reader use | UX-16 |
| 10 | At the largest text size the phone heading wraps to two or three lines | Fits the screen, no sideways scrolling; looks heavier | UX-16, with the text-size settings |
| 11 | Locations still without a country: regions, global roles, empty locations, French spellings such as "Guinee" when the job has no country code, and a location naming only a US state ("Atlanta, Georgia" would read as the country Georgia) | Missing or, rarely, wrong flag | The crawler's location cleaning (W-24 family); add spellings as new organisations arrive |
| 12 | Saved jobs that close are no longer shown or counted, but their ids stay in the browser's storage | Harmless growth | UX-15 |
| 13 | The job loader stops at 50 pages (5,000 jobs) and would then refuse every refresh | Not reachable soon (287 jobs) | UX-17, with the page-weight threshold |
| 14 | Vercel Analytics runs on the new site | Visitors should be told | UX-27, the Privacy page |
| 15 | Safari logs that it ignores the `interactive-widget` viewport setting, which Android needs for the keyboard | A console note only | None needed |
| 16 | The organisation name "ICRC (or International Committee of the Red Cross)" comes from the source record; the site shows "ICRC" | Data quality | Admin source clean-up (UX-19) |
| 17 | The locked Netlify production copy still serves the old site without "do not index". **Blocked, 23 October 2026:** the Netlify team has used its free credits for this billing cycle, so production builds are paused and the build of `main@d13d983` shows "Skipped"; deploy previews still build | Search engines could find a second copy; low risk while it sits on a Netlify address with no domain and the Vercel site says "do not index" | **Decided by the user, 23 October 2026:** stop using Netlify. Pull-request previews move to Vercel, kept behind the Vercel login, with a "Protection Bypass for Automation" key for the agent's checks, stored only on the user's machine and never in the repository. Once a Vercel preview is confirmed working that way, the user deletes the Netlify site, which removes the old copy; then the method's Netlify steps are rewritten for Vercel previews. **Vercel previews confirmed working, 23 October 2026, and the method rewritten (step 4). Resolved the same day: the user deleted the Netlify site; `moonlit-llama-d9f5a7.netlify.app`, its `/admin/login`, and its deploy previews all return 404 (Verified)** |
| 18 | Render holds an environment variable `BACKEND_CORS_ORIGINS` that the backend no longer reads (it reads only `AIDJOBS_CORS_ORIGINS`, which is not set; `main.py` always allows `aidjobs.app`, `www.aidjobs.app`, and localhost). The old `.env.sample` still lists `BACKEND_CORS_ORIGINS` | No effect today; misleading when someone changes allowed origins | UX-31, the repository tidy-up: delete it on Render and correct `.env.sample`; at UX-18, add the new domain to the allowed origins if a browser ever calls the backend directly |
| 19 | Production runs with `AIDJOBS_ENV=dev`: error tracebacks reach callers, the admin session cookie lacks the Secure flag, and the public single-job endpoint returns raw stored metadata (ledger W-22) | Security; the public site calls these endpoints | **Resolved 24 October 2026:** `AIDJOBS_ENV=production` on Render (the user), and the code safe in every mode (ledger W-22) |
| 20 | The repository root holds 73 old guides (for example `MEILISEARCH_SETUP_RENDER.md`, `FIX_ADMIN_PASSWORD_NOW.md`, `NEXT_STEPS.md`) describing setups that no longer exist; several held the secrets removed in W-30 | Misleading instructions; where secrets were pasted before | UX-31, the repository tidy-up, with the user's approval of the list |
| 21 | The 16 UNICEF rows from 6 December 2025 are still shown on `/v2` with no deadline (ledger W-02) | Visitors see jobs that have likely closed | W-02 then W-06, before the switch (UX-29), as the order table says |
| 22 | On a new Vercel preview, the first admin sign-in has twice ended at "Your session was not accepted. Sign in again." (PR #37 and PR #39 previews, 24–25 October 2026); the second sign-in held. Not seen on the production address. Cause not investigated | Slows every preview check; may hide a real session fault on new hosts | Investigated 25 October 2026 at the user's decision (below the table); the message fix is built on branch `fix/admin-session-startup`; the cause is not confirmed and stays open as items 24–26 |
| 23 | Six frontend proxies under `apps/frontend/app/api/admin/` call backend routes that do not exist: `crawl/delete-jobs-by-source`, `crawl/deletion-impact/{id}`, `config-check`, `crawl-v2/run`, `data-quality/logs`, `data-quality/stats`. After UX-06 no page calls them | Dead code | UX-31 |
| 24 | The live admin tab lost its session cookie between about 00:55 and 01:27 on 25 October 2026 (session check: 200, `reason: "missing"`); the user did not log out or clear browser data, and only Logout clears the cookie in the code. Not reproduced in a 21-minute idle test the same night | Could explain "first sign-in fails"; the cause may be Cursor's built-in browser | Open; investigate if it recurs |
| 25 | Each preview has two addresses (the deployment address and the branch alias), and the admin cookie is set for one host only; on the PR #37 preview the Vercel login landed on one address while the check ran on the other | May explain the preview failures | Open; untested |
| 26 | A cold start longer than the 55 s the route waits (60 s function limit) would still end at "did not answer" | Cold starts measured 34 s (25 October 2026) and 43–53 s earlier | Open; the fix shows a clear message and "Try again" instead of a false sign-in failure |

Item 22, investigated 25 October 2026 (read-only, at the user's decision). Findings from the code: sessions are HMAC tokens valid for 8 hours and not stored on the server, so expiry and competing sign-ins are ruled out; the admin layout treated "no cookie", "rejected", and "backend did not answer" alike and sent each to "Your session was not accepted"; the login page could show "Invalid password" when the request failed. A first live check found the tab's cookie missing (item 24). A controlled test the same night (live admin, user signed in at 01:31:40, 21 minutes idle, then one timed check): 01:31:40, 200, authenticated, 0.75 s; 01:52:44, 200, authenticated, 33.8 s, answered by the session route itself. So the backend was asleep and woke, Vercel waited at least 34 s, and the cookie survived; neither suspected cause reproduced. Fix approved by the user the same day (option 3), frontend only, without changing session creation or validation: the session check distinguishes not signed in, rejected or expired, and unavailable (503, `reason: "unavailable"`); the layout shows "The admin service is starting up…" after 3 s and retries only the session check, at most 3 attempts within 60 s, then shows a timeout message with "Try again"; the session and login routes allow 60 s (`maxDuration`) and wait at most 55 s for the backend; the login is never retried automatically and shows "Invalid password" only for a 401. Built in PR #41; CI green. Preview check, 25 October 2026 (Verified): with no session, the preview's `/admin` went to `/admin/login?reason=signed-out` showing "Sign in to continue." (session check `reason: "missing"`), where it used to say "Your session was not accepted"; the user then signed in once, on the deployment address, and it held (session 200, authenticated, 0.65 s; the dashboard loaded), checked with the read-only guard and no control clicked. The starting-up message was not seen on a real cold start; the unit tests cover it.

Plan approved, 23 October 2026, as option A: UX-10 carries the demo's whole public page from the tag (list, menu, filter pills and sheets, sort, the 10-day switch, the job sheet and pane, Saved) close to unchanged, connected to live jobs. UX-12 to UX-15 then check and test those parts against their acceptance criteria, and UX-12 adds the title-fact tests from real titles. UX-11 narrows to a unique tie-breaker in the search order. **Contract decision** (rule 15 rewrite; recorded at UX-08).

Approved plan, 23 October 2026:

- **Changes from the demo code,** each listed in the pull request: live jobs read by the server in pages of 100, keeping the demo's eight fields (`org_name` and `location_raw` mapped to `org` and `location`); the demo-only parts removed (the Demo menu section, the "demo" tag, the "Demo data" footnote, the job sheet's "Demo note"), links to `/v2`, storage keys `aidjobs.*`; one fixed country table generated once from the flag package and committed, looked up both ways, with the demo's extra spellings; the first render uses the date the page was cached, and the browser then recomputes days left, "Today", closed jobs, the 10-day count, and the Recommended order (the demo's UTC day is kept); the phone check starts as "not a phone" and updates after load, and the heading's "&" or "and" is a width rule; theme, text size, contrast, motion, menu collapse, and divider position are applied by a small script before the first paint. A visitor who chose "Soonest deadline" sees the list re-sort once after load. While a job is open, the browser tab shows its title (the user's approval, 23 October 2026).
- **Server page and cache:** cached 10 minutes, refreshed in the background, up to 60 seconds per refresh. A failed request, no jobs, `source: "none"`, a missing page, or fewer jobs than the total after removing repeats fails the refresh, so the last good page stays. A deploy with the backend asleep finishes with the frame and "Loading jobs", the browser fetches the jobs through the existing search address, and the next refresh replaces the page.
- **Search engines:** "do not index" on every address, by a page tag and a response header from the Next.js config, until one setting turns it off at UX-18; `robots.txt` allows everything except `Bytespider`, skips `/api/`, and names the sitemap; `sitemap.xml` holds the home page from the one site-address setting (default `https://aid-jobs-frontend.vercel.app`); the page title "NGO, humanitarian and development jobs | AidJobs", a description, and link-preview text without an image until the logo. The current `/` gets only the "do not index" tag; the admin and the backend are unchanged.
- **Tests:** job loading (pages joined, repeats removed, empty, short, error, and timeout rejected); the country table against every live location saved as a test file; the date and order rules with a fixed date; `robots.txt` and the sitemap; a basic test of the title-fact rules; the existing suite, type check, lint, and build.
- **Checks:** raw HTML has job titles and the backend's count; no hydration errors at 390px and 1366px in dark mode with saved settings; the desktop page does not scroll; the divider survives a reload; opening a job sets `?job=` and Back closes it without a reload; `robots.txt` and the sitemap return 200; the "do not index" header everywhere; the full fidelity check against the tag; the cache proved locally with a production build (refresh with the backend unreachable keeps the old page; a build with it unreachable finishes with the loading page), Vercel's own behaviour Not verified until seen live. After merge: live checks on `/v2`; the user publishes the merge's Netlify production deploy once; the agent checks the header on the Netlify address.

- **Scope:** one persistent frame with no header and a collapsible side menu (logo, Jobs, Saved with count, and on desktop the title-fact sections with live counts, as approved in the demo; collapsing to an icon rail whose section icons open pop-outs); phone: a brand bar with Saved, the list with the search bar at the bottom, the menu as a navigation drawer opened from the bar, filters in bottom sheets; desktop: menu, list, and job pane, with a draggable, remembered divider between list and job, each area scrolling and the page not; the keyword page title and the count of open roles above the list, as in the demo; the fixed country-name table and browser-side dates from the revision's porting work; the address carries the open job (`?job=…`) as in the demo, Back works, and moving between views does not reload the page. The first page of jobs is rendered on the server. A real title and description per view; `robots.txt`; `sitemap.xml`; canonical links; link previews (Open Graph); a "do not index" header on every page built on Netlify, which covers the locked Netlify production copy and all previews (UX-08 item 8).
- **Not in scope:** the filter pills and search (UX-12); job pages (UX-24).
- **Depends on:** UX-08, UX-09.
- **Acceptance:** the HTML returned for the new site's address (the hidden address until UX-29, then `/`), fetched without JavaScript, contains job titles; `robots.txt` and `sitemap.xml` return 200; on desktop the document does not scroll; switching views makes no full page load; the divider position survives a reload.
- **Verify:** raw HTML fetch of the preview; browser checks at both widths.

**Review of 22 October 2026, before the plan** (read-only, from `main` at `8083591`, the demo tag, and the live site). The UX-10 plan must answer each point, with a test where one is named.

- **Decided by the user, 23 October 2026:** the address carries only the open job (`?job=…`), as in the demo; the search and filters are not in the address. The direction's "the address bar always reflects what is shown" applies to the open job until the user decides otherwise.
- **An empty result must never be cached.** When the database cannot be reached, `/api/search/query` still answers `status: ok` with no jobs (`source: "none"`, or `total: 0` from the database fallback). The page treats that, or any error, as a failed build, so the last good page stays. Tested by building with the backend unreachable (UX-08 item 7).
- **A sleeping backend must not break a deploy.** The first page of jobs took 53 seconds on 22 October 2026 (backend asleep), the second 1 second. Next.js builds the page during each deploy, with a 60-second default per page. The plan states what a deploy does when the backend is slow or down, so a frontend deploy (the admin included) never fails or ships an empty list because of it.
- **Paging must not repeat or skip jobs.** The search orders by `last_seen_at`, which is not unique, in pages of at most 100 (185 open jobs on 22 October 2026: two pages, no repeats that time). The page removes repeated ids and checks that it received `total` jobs, or UX-11 adds a unique tie-breaker (`id`) to the order, with a test.
- **No flash of the wrong settings.** Theme, text size, menu collapse, divider position, and sort are read from the browser after the page loads; the demo hid this by drawing nothing until then, which server rendering cannot do. On `/v2` today a dark-mode visitor first sees the light page. The saved settings must apply before the first paint.
- **Dates and order.** The Recommended order and hiding closed jobs depend on today's date. The first render uses the date the page was cached, and the browser then recomputes with its own date, so React sees the same markup on both sides.
- **Country names both ways.** 96 of the 185 open jobs have no country code; the demo reads the country from the location text using the browser's names. The fixed country table maps code to name and name to code, with tests from the live locations.
- **Robots and indexing.** Every page carries "do not index" while there is no domain, the current `/` included (today it has none). `robots.txt` allows crawling, with the AI-crawler rules from UX-08 item 6; it does not block `/v2`, because a blocked page's "do not index" tag is never read. `sitemap.xml` is built from the one site-address setting.
- **Netlify.** The "do not index" header reaches the locked Netlify production copy only if that deploy is published by hand (UX-08 item 8, correction of 23 October 2026). Approved by the user on 23 October 2026: after UX-10 merges, the user publishes that merge's production deploy once with "Publish deploy", keeping the lock, and the agent checks the header on `moonlit-llama-d9f5a7.netlify.app`.
- **The demo's public page is one component of 1,403 lines** (`PublicDemo.tsx` at the tag). UX-10 splits it into the frame, menu, list, and pane, with no visible change, and records every part not yet wired (filter pills, sheets, the menu's title-fact counts) as an intended, temporary difference in the fidelity check.
- **A job's page title** can be set only in the browser: reading `?job=` on the server would turn off the cached page. Titles and previews per job wait for job pages (UX-24).
- **Already known, unchanged:** the API names are `org_name` and `location_raw` (the demo used `org` and `location`); ICRC appears as "ICRC (or International Committee of the Red Cross)" in the demo and in the data, a data-quality item for later; the root layout's old `globals.css` and Vercel Analytics still wrap `/v2`; the plan's "Live" check uses `aid-jobs-frontend.vercel.app` until the domain returns (revision item 5), not `www.aidjobs.app`.

### UX-11. Search API for the bar

**Status:** Not started. **Contract decision** (new public search features; recorded at UX-08). Narrowed on 21 October 2026: the suggestions endpoint is removed, because the demo has no suggestions (revision, "Removed from the plan"). What remains is what the server-rendered page needs to read every open job, decided with UX-08 item 10; if filtering stays in the browser, this step may need no backend change at all. Narrowed again on 23 October 2026 (UX-10 option A): a unique tie-breaker (`id`) in the search order, with a test, so paging can never repeat or skip a job.

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

- **Scope:** carry out the slow-first-load decision from UX-08 (item 5: the cached page; the paid always-on instance is deferred for budget and the keep-alive skipped until after launch, so the cached page must never wait for the backend); images, fonts, and the flag icons sized for phones; the page weight of all open jobs measured against the UX-08 item 10 threshold.
- **Depends on:** UX-16; the UX-08 hosting decision.
- **Acceptance:** first load on a cold backend within the target set at UX-08; a phone audit's Largest Contentful Paint under 2.5 seconds.
- **Verify:** preview and live measurements.

### UX-18. Launch check

**Status:** Not started.

- **Scope:** connect the domain and set the site address; allow indexing; repeat the W-26 review method on the preview at 390px and 1366px, public pages; the fidelity check on the whole site; checks on real devices: iPhone Safari, Android Chrome, Samsung Internet, and desktop Safari, Firefox, Chrome, and Edge, covering the bottom sheets, the keyboard with the search field and sheet search, the brand bar folding, the day strip swipe, share, and calendar (the demo was checked only in Chrome, and iPhone Safari handles the keyboard and screen height differently); the full frontend test suite and type check; a speed, accessibility, and search-engine audit; the user verifies the domain in Google Search Console and Bing Webmaster Tools and submits the sitemap.
- **Depends on:** UX-29; the domain (UX-08 item 9); the user's logo (UX-08 item 3), fitted here with the favicon and app icon.
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
