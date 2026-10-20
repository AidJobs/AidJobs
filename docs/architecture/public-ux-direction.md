# AidJobs — Public site and admin direction

**Status:** Proposed, 20 October 2026. Not approved. Nothing in this document is built. Approval of this document is a product decision; each build step still needs its own approval.

**Relationship to the rules.** The contract (`aidjobs-migration-contract.md`, §2) puts user accounts, new public search features, recommendation systems, and enrichment expansion out of scope, and rule 15 forbids rewriting the public UI without a product reason. Approving this document records the product reason (below) and amends §2 only as far as the items marked **Scope change**. Everything else in the contract stands.

Evidence comes from the read-only UX review of 20 October 2026 (ledger W-26): the live site `www.aidjobs.app` on `main` `2a2e02f`, at 1366px and 390px, public and admin pages. An interactive mockup of the public design was shown to the user in a Cursor canvas; it is not part of the repository.

## Product reason

1. **Search engines and AI search see no jobs.** The HTML that `www.aidjobs.app` sends contains "Loading" and no job titles. There is no structured job data, the only page title is "AidJobs", and `robots.txt`, `sitemap.xml`, and the favicon return 404 (Verified, 20 October 2026). Most AI crawlers do not run JavaScript. Being found on Google and AI search is the user's key success measure.
2. **The public pages do not work as a job seeker needs.** On a laptop the save buttons and Sort sat off-screen; on a phone the menu covers most of the screen; the Saved page was blank; clearing a search shows no jobs (W-17); four of five collections return nothing and the fifth ignores its filter; filters for level, eligibility, and mission tags are empty for every job (Verified). The first two of these are fixed by PR #19, not yet merged.
3. **The interface assumes data the crawler does not collect.** Most filters and all five collections depend on fields that are never filled. The design has to start from the data that exists: title, organisation, location, deadline, and the apply link.

## Principles

- Phone first. Design for a 360–390px screen; desktop widens the same design.
- Show only what the data supports. Never offer a filter, view, or suggestion that returns nothing.
- Maximum information in minimum space without crowding. Icons with hover text on desktop and long-press labels on phones, the same text for screen readers.
- No full page reloads. One persistent frame; only the pane that changes is redrawn. The address bar always reflects what is shown, so links share and Back works.
- Server-rendered content, so the first HTML a crawler receives contains real jobs.

## Public site

### Layout

- No header and no menu. A small logo and the saved count at the top.
- Phone: one column of jobs; the search bar at the bottom, in thumb reach; a job opens as a bottom sheet over the list.
- Desktop: two panes, list and job, with a draggable divider whose position is remembered. Each pane scrolls on its own; the page itself does not scroll.

### One search bar

It replaces the filter panels, the five collections, and the "Trinity" search.

- Typing suggests values that exist in the database, each with a live count: organisations ("UNICEF · 187"), countries and places ("Kenya · 6"), and title words. A pick becomes a chip inside the bar; a tap or backspace removes it.
- The empty bar offers smart views: Closing within 7 days, each organisation, the largest countries, with counts.
- No AI call. "Trinity" is the current home-page search: it asks an AI model (OpenRouter) for suggestions and turns a sentence into filter categories such as "Water, Sanitation & Hygiene (WASH)". Those categories do not exist in the job data, and their text leaks into the search after clearing, which is W-17. With the key revoked, a keyword fallback does the same.
- **Scope change:** an organisation filter (the search API has none today) and place suggestions are new public search features.

### Job list

- Two lines per job: title; organisation and place. The right edge shows days left, orange inside 7 days and red inside 3, with the full date on hover or long-press. Soonest deadline first; jobs without a deadline after.
- A bookmark per row saves the job.

### Job sheet (launch) and job page (later)

The sheet, for launch:

- Clean title, organisation, place, deadline with days left.
- Fact chips with hover explanations, read from the title: UN grade (NO-2, P-4), contract (fixed term, consultancy, internship), duration, eligibility (nationals only), remote. **Scope change:** this is enrichment; it should be done once at save time, not in the browser.
- "Apply on {organisation}", opening the official vacancy page.
- Save, share (WhatsApp, LinkedIn, email, copy link), add the deadline to a calendar with a reminder, email the job to oneself.
- More from the same organisation, more in the same country.
- Opening a job changes the address to that job's own link.

The page, later: the same content at a permanent, server-rendered address such as `/jobs/child-protection-officer-unicef-ethiopia-596228`, with the full description and JobPosting structured data, removed from the sitemap when the job closes.

### Saving without accounts

Saves are stored in the browser (`localStorage`). They survive closing the tab and restarting the browser, but stay on one browser and device and are lost when site data is cleared. Without accounts:

- Add to calendar and email to myself give a permanent record outside AidJobs.
- A saved-list link reopens the same list on another device, with no sign-in.
- Saved jobs closing soon move to the top on return.
- Saved becomes a bookmark icon with a count that shows only saved jobs, not a separate page.

Sync across devices and email job alerts need sign-in. **Scope change, not proposed now:** user accounts stay out of scope until a separate decision.

### Removed

- The five collections (UN Jobs, Remote Jobs, Consultancies, Fellowships, Surge & Emergency). Delete, not hide.
- The Level, International eligible, and Mission Tags filters, and the country list on the page.
- Trinity search and its AI suggestions.
- The public "Running on backup search (temporarily)" banner. Search health belongs in the admin.

### Look and feel

- Logo: provided by the user (decision of 20 October 2026). A favicon and app icon are made from it.
- One typeface (Inter), three sizes: 12px for most text, 13px for list titles, 15px for the job title in the sheet. Weight carries hierarchy.
- Colour: neutral surfaces, ink text, grey secondary text. Accent: **ink** (near-black buttons; the orange star only in the logo), decision of 20 October 2026. Orange and red only for deadlines. Light and dark follow the device.

## Search engines and AI search

No one can promise first place. ReliefWeb, UNjobs, Impactpool, Devex, and Idealist are established. A new site wins first on specific searches and in Google's job panel, then on broad terms as authority grows.

**Foundation, before launch:**

- Server-render the job list and the job view, so the first HTML contains real jobs.
- A real title and description per view, for example "NGO and humanitarian jobs in Kenya: 6 open roles".
- `robots.txt`, `sitemap.xml` that follows jobs opening and closing, canonical links, favicon.
- Link previews (Open Graph) for WhatsApp, LinkedIn, and X.
- Fix the slow first load: the first three requests took about 20 seconds on 20 October, likely the backend waking from sleep on Render (not verified). A hosting decision.
- Google Search Console and Bing Webmaster Tools, verified by the user.

**Growth, after launch:**

- Job pages with JobPosting structured data, for Google's job search panel. Google requires a description and a posting date; the crawler stores neither today.
- Landing pages from real data, by organisation, country, function, and contract type, only where enough jobs exist.
- Keywords in four layers: sector (NGO, humanitarian, development, INGO, UN, charity, aid jobs); function (WASH, M&E or MEAL, protection, logistics, finance); place (country and city); contract and grade (consultancy, internship, P-3, NO-B).
- AI search: server-rendered facts, structured data, a short factual summary per page, an `llms.txt`, and a decision on which AI crawlers to allow.
- Evergreen guides, such as what UN grades mean and how to apply for UN jobs.

## Admin

Review findings (ledger W-26): job totals disagree (234, 218, 206) without labels; Data Quality flags every job as a listing page because its check matches `/jobs` and `/careers` in host names (`app/data_quality.py`); the dashboard reports no recent activity while Crawls lists crawls; Settings reports AI as configured with a revoked key; Delete Jobs and Delete Source look like Run crawl; the Sources table stacks nine icon actions, about 337px per row; "Cleanup expired jobs" does nothing; the admin is unusable on a phone.

Proposed menu, four items:

1. **Dashboard:** one health view. Each source's last crawl and whether it was complete, partial, or failed; the public job count; real alerts. Absorbs Crawls and Settings.
2. **Sources:** one actions menu per row. A source's page holds its crawl history, the test and simulate tools, and a separate danger zone for deletes.
3. **Jobs:** moderation, hide and restore.
4. **Crawl review:** replaces Data Quality. Per crawl: found, inserted, updated, rejected with reasons, listing completeness, jobs missing a location or deadline, duplicate links. It replaces the SQL queries run by hand after each crawl.

Organisations is hidden until the organisation model (Gate 8) is in use.

## Data the design needs from the crawler

- Descriptions and posting dates, for the job page and Google's job panel.
- Clean titles without glued place and date (W-24).
- Facts from titles (grade, contract, duration, eligibility) stored at save time.
- The expiry policy (W-06), so closed jobs leave search and the sitemap; Google penalises listings that stay up after closing.

## Phases

0. **Decide.** Approve this document. Receive the logo. Set a launch date.
1. **Launch.** Persistent shell, one bar, dense list, sheet and two panes, phone first; the bar on organisation, place, closing soon, and title words; the rich sheet; removals; the SEO foundation; the slow-start decision.
2. **Grow.** Crawler descriptions and posting dates; job pages with JobPosting data; landing pages; the expiry policy.
3. **Later decisions.** Sign-in for sync and alerts; AI features.

Admin work runs alongside, smallest first: correct the totals and the Data Quality check, separate the delete actions, then the four-item menu.

## The paused UX branch

`ux/public-layout` (worktree `AidJobsGit-ux`) holds two unmerged commits from 12–14 October: a responsive public layout (U1) and a single home search path that removes Trinity (U2), plus `docs/architecture/ux-public-layout-plan.md` and an uncommitted colour correction (U3). This direction replaces most of it. It is kept for reference, not merged, and not deleted without a separate decision.

## Decisions taken on 20 October 2026

- Write this direction up for approval.
- The user provides the logo.
- Accent colour: ink.
- Fix the two live bugs on the current design first: PR #19.
