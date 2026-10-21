# AidJobs — Public site and admin direction

**Status:** Proposed, 20 October 2026. The look and behaviour of the design demo were approved by the user on 21 October 2026 and are recorded under "Approved in the design demo"; where that section and the earlier text disagree, that section applies. The direction as a whole, and the scope changes to §2, are still approved at step UX-08 of `docs/architecture/ux-build-plan.md`, and each build step still needs its own approval. Nothing here is built on `main`. The order of work is in that plan, not here.

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

- No header. All navigation is in one collapsible side menu (decision of 20 October 2026), with the logo at its top.
- The side menu holds: Jobs; Closing soon; Saved, with its count; an Organisations section listing each organisation with its initials (logos later) and live count; a Countries section with a flag and live count. An entry appears only when its count is above zero. Entries are real links, which later become the landing pages under "Search engines and AI search".
- Desktop: three areas, the side menu, the job list, and the job pane, with a draggable divider between list and job whose position is remembered. The menu collapses to an icon rail with hover labels. Each area scrolls on its own; the page itself does not scroll.
- Phone: one column of jobs; the search bar at the bottom, in thumb reach; the side menu is a drawer, closed by default, opened from a button in the search bar; a job opens as a bottom sheet over the list.
- Above the list: a page title carrying the sector keywords, such as "NGO, humanitarian and development jobs", and a small strip of real counts (open jobs, new this week, closing this week).
- On wide screens, when no job is open, the job pane shows a "Closing this week" timeline: date, job, organisation.

### One search bar

It replaces the filter panels, the five collections, and the "Trinity" search.

- Beside the search field, three filter pills: Organisation, Country, Deadline. Each opens a searchable list with counts; a pick shows as a chip. On phones the pills scroll sideways under the bar.
- Typing suggests values that exist in the database, each with a live count: organisations ("UNICEF · 187"), countries and places ("Kenya · 6"), and title words. A pick becomes a chip inside the bar; a tap or backspace removes it.
- The empty bar offers smart views: Closing within 7 days, each organisation, the largest countries, with counts.
- No AI call. "Trinity" is the current home-page search: it asks an AI model (OpenRouter) for suggestions and turns a sentence into filter categories such as "Water, Sanitation & Hygiene (WASH)". Those categories do not exist in the job data, and their text leaks into the search after clearing, which is W-17. With the key revoked, a keyword fallback does the same.
- **Scope change:** an organisation filter (the search API has none today) and place suggestions are new public search features.

### Job list

- Two lines per job: title; organisation and place with its country flag. The right edge shows days left, orange inside 7 days and red inside 3, with the full date on hover or long-press. Soonest deadline first; jobs without a deadline after.
- A bookmark per row saves the job. The open job's row carries the sage highlight.

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
- Saved is a side-menu entry with a count that shows only saved jobs in the same list, not a separate page.

Sync across devices and email job alerts need sign-in. **Scope change, not proposed now:** user accounts stay out of scope until a separate decision.

### Removed

- The five collections (UN Jobs, Remote Jobs, Consultancies, Fellowships, Surge & Emergency). Delete, not hide.
- The Level, International eligible, and Mission Tags filters, and the country list on the page.
- Trinity search and its AI suggestions.
- The public "Running on backup search (temporarily)" banner. Search health belongs in the admin.

### Look and feel

Visual references: three admin dashboard designs the user supplied on 20 October 2026 (Crewix, Crextio, BizLink). They are adapted, not copied. What they share and AidJobs takes: mostly neutral surfaces with one soft tint; ink for active and primary; rounded white cards on a faintly tinted page; pill-shaped controls; thin outline icons in small round buttons; big light headings and numbers with small grey labels; status as small chips; places with flags; a sectioned side menu (BizLink). Not taken: top navigation pills (a header), low-contrast grey text, glass and blur effects, photographs, decorative charts on the public site.

- Logo: provided by the user (decision of 20 October 2026). A favicon and app icon are made from it. The exact sage shade is checked against the logo when it arrives.
- Colour: neutral surfaces, ink text, grey secondary text. Accent: **ink** for active and primary (near-black buttons, the selected menu entry), and one signature tint, **sage green**, for the page wash, highlights, and charts (decisions of 20 October 2026). Orange and red only for deadlines. Light and dark follow the device. Text contrast meets WCAG AA throughout.
- Type: one typeface. Inter and Manrope are compared in the demo (UX-00). Sizes: 12px for most text, 13px for list titles, 15px for the job title in the sheet, and one large light size only for page titles and large numbers. Weight carries hierarchy.
- Icons: Lucide (already in the frontend), thin outline, 16px, in 32px round buttons, each with a hover and long-press label.
- Shape: about 20px corners on cards, fully rounded pills, 1px hairlines, flat surfaces without shadows or blur, a faint sage wash on the page.
- Flags as small SVG images, not emoji: Windows shows emoji flags as letters.
- Performance: many users are on low-end phones and slow networks; the look uses plain colour fills, no blur effects, no photographs.

## Approved in the design demo (21 October 2026)

The demo (UX-00) was built in twelve rounds on the branch `demo/ux-design` and approved by the user on their phone. The code is kept at the git tag `ux-demo-approved-2026-10-21`. Figures below come from the demo's copy of 206 public jobs taken on 20 October 2026.

**Look**

- Typeface: Manrope only; Inter is dropped. Body text 12px on desktop and 13px on phones, with 40px tap targets on phones.
- Ink and sage, light and dark, as proposed. A settings panel in the menu: text size (A, A+, A++), high contrast, reduce motion, and a light or dark switch.
- The logo is a placeholder until the user's file arrives.

**Layout**

- No header. A collapsible side menu on every page; collapsed, it becomes an icon rail whose section icons open pop-outs; expanded, section headings are plain text and every section is open by default.
- Desktop: menu, job list, and job pane with a draggable, remembered divider. With no job open, the pane shows "Closing in the next 10 days" with a day strip that starts at Today and opens on the first day with deadlines.
- Phone, top to bottom: a brand bar (logo, name, Saved with its count) that folds away with the heading while scrolling down and returns when scrolling up; the heading on one line; the count of open roles with the sort control on the same line; an "All jobs | Closing in 10 days (count)" switch, with the day strip in the 10-day view; the filter pills; the list; a bottom bar with the menu button and the search field.
- Heading: "NGO, humanitarian and development jobs" on desktop; "NGO, humanitarian & development jobs" on phones, sized to stay on one line down to 360px screens.
- The phone menu is navigation only: Jobs, Saved, a Filters entry, the demo links, and settings.

**Filters**

- Pills above the list: Sector, Organisation, Country, Deadline. Every pill takes several choices, shows counts that follow the other filters, and offers a "not stated" choice where data is missing ("Sector not stated", "Location not listed"), so every job is reachable.
- Sector, read from the title, each with its SDG where the link is clear: Education (SDG 4), Health (3), Child protection (16), Nutrition (2), WASH (6), Gender (5), Social protection (1), Climate and environment (13), Disability inclusion (10); Emergencies, Behaviour change, and Adolescents and youth without an SDG. About 89 of 206 jobs (43%) have a sector today; the rest are "Not stated". SDG and sector replace a separate SDG or function filter, because most jobs cannot yet be classified by function.
- Title-fact filters, each with "Not stated": Contract (Consultancy, Fixed term, Temporary, Internship, Fellowship), Level (Entry, Mid-career, Senior, Leadership, Support staff), Open to (nationals of the country, international candidates), Work style (remote or home-based), Advert language. On desktop they are side-menu sections; on phones they are chips in one Filters sheet opened by a Filters pill that shows how many are on. These read titles, which is enrichment under §2 (**Scope change**, decided at UX-08).
- Deadline groups that do not overlap: within 10 days, 11 to 30 days, more than 30 days, no deadline listed.
- Phones: each pill opens a bottom sheet with a title, the current choice, and Clear; a search box fixed at the top while only the list scrolls; ticks on chosen rows; earlier choices under "Selected" at the top of long lists when reopened; and a "Show N jobs" button that updates as choices change. The sheet closes with that button, a tap on the dimmed area, a swipe down, or Escape. The search box does not open the keyboard by itself.
- Desktop: a dropdown under the pill that stays open while choosing and closes on a click outside.
- The search field's enter key closes the phone keyboard and keeps the results.

**Order and urgency**

- Recommended, the default: soonest deadline first, never more than two jobs in a row from one organisation while another has jobs left, and jobs not seen on the employer's site for more than 30 days last. The alternative is "Soonest deadline". The choice is remembered. This is a ranking choice; whether it counts as a recommendation system under §2 is decided at UX-08.
- The closing window is 10 days. Days-left chips are orange within 10 days and red within 3.

**Job list**

- Two lines of title; then organisation, flag and country, contract type, and the SDG where clear; days left on the right; a bookmark.

**Job sheet and pane**

- Title, organisation, place, deadline with days left.
- A freshness line: if the job has not been seen on the employer's site for more than 7 days, a quiet note; for more than 30 days, an orange warning that it may have closed.
- Fact chips with explanations: contract, UN grade with its typical minimum experience (UN Secretariat P-1 none, P-2 2 years, P-3 5, P-4 7, P-5 10, D-1 15, D-2 more than 15; National Officer NO-1 1, NO-2 2, NO-3 5, NO-4 8, NO-5 10; General Service G-1 none, G-2 1, G-3 2, G-4 3, G-5 5, G-6 7, G-7 10), duration, open to, remote, advert language, and sector with its SDG.
- "Apply on {organisation}"; save; add the deadline to a calendar (`.ics`, reminder two days before); share (the phone's share sheet, or copy link); email the job to myself.
- Similar jobs: up to four, at most two per organisation, each saying why it is similar. More from the same organisation and country.

**Saving**

- Saved is kept: stored on the device, with its count in the menu and the brand bar.
- "I applied" is dropped for launch: stored only in the browser, it is lost with the site data and adds little without accounts.

**Planned, not built**

- "New on AidJobs" needs a first-seen date per job from the backend.
- The expiry rule (W-06) so jobs that have closed leave the list; 16 jobs have not been seen since 6 December 2025 (W-02).

**What this replaces in the text above:** "Closing this week" and the 7-day window become 10 days; the menu's Organisations and Countries sections become pills; "soonest deadline first" becomes the Recommended default; Inter or Manrope becomes Manrope; the removed Level filter is the old field-based one, replaced by Level read from titles.

**Not in the demo, so not built** (user decision of 21 October 2026: the site is exactly the demo): search chips, typed suggestions, and smart views in the search bar (the demo has a plain search box); the counts strip with "new this week"; the saved-list link (a web address that reopens saved jobs on another device) and reordering saved jobs. The Saved list itself and sharing stay exactly as in the demo: one Share button that opens the phone's share menu (WhatsApp, LinkedIn, email) or copies the link, and "Email this job to myself". Any of these returns only as a new step the user approves. The rule and the fidelity check that enforces it are in `ux-build-plan.md`, revision item 7.

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

Menu, revised proposal of 20 October 2026: keep the contract's admin V1 navigation, Dashboard, Organisations, Sources, Jobs, Crawls, and Data Quality, with Settings and logout ("Admin V1 navigation" and Gate 9), in the same collapsible side menu and visual language as the public site. If the user agrees, no contract decision is needed for the menu. The earlier four-item menu, which merged Crawls and Settings into the Dashboard and hid Organisations, would change that navigation and is withdrawn unless the user asks for it.

What improves is inside the pages:

1. **Dashboard:** one health view. Real counts with their change; each source's health with a sparkline of its last crawls and its listing completeness (UNICEF on 20 October: 120 of 209); upcoming scheduled crawls; the checklist for adding a new source (one approved fetch, extraction, admission, report); real alerts.
2. **Sources:** one actions menu per row; optionally a view by stage (proposed, checked offline, live, needs attention). A source's page holds its crawl history, the test and simulate tools, and a separate danger zone for deletes.
3. **Jobs:** moderation, hide and restore, as a table with filter pills, a column picker, and export.
4. **Crawls:** each crawl's outcome.
5. **Data Quality, as crawl review:** per crawl, found, inserted, updated, rejected with reasons, listing completeness, jobs missing a location or deadline, duplicate links. It replaces the SQL queries run by hand after each crawl.
6. **Organisations and Settings:** kept, plain, until the organisation model (Gate 8) is in use.

Every number and chart comes from the database; nothing is decorative.

## Data the design needs from the crawler

- Descriptions and posting dates, for the job page and Google's job panel.
- Clean titles without glued place and date (W-24).
- Facts from titles (grade, contract, duration, eligibility) stored at save time.
- The expiry policy (W-06), so closed jobs leave search and the sitemap; Google penalises listings that stay up after closing.

## Order of work

`docs/architecture/ux-build-plan.md` holds the steps, their order, dependencies, acceptance criteria, and status. Its revision of 21 October 2026 sets the order: the docs record of the demo, admin fixes alongside the decision gate (UX-08), the new public site built beside the current one (Stage B), the switch (UX-29) and launch check (UX-18), the admin redesign (Stage C), and growth with the crawler (Stage D).

## The paused UX branch

`ux/public-layout` (worktree `AidJobsGit-ux`) holds two unmerged commits from 12–14 October: a responsive public layout (U1) and a single home search path that removes Trinity (U2), plus `docs/architecture/ux-public-layout-plan.md` and an uncommitted colour correction (U3). This direction replaces most of it, and `ux-build-plan.md` replaces its plan. It is kept for reference, not merged, and not deleted without a separate decision.

## Decisions taken on 20 October 2026

- Write this direction up for approval.
- The user provides the logo.
- Accent colour: ink.
- Fix the two live bugs on the current design: PR #19. Superseded on 21 October 2026: PR #19 is closed without merging, because the switch to the new site deletes that code.
- Signature tint: sage green.
- No header; all navigation in a collapsible side menu, for the public site and the admin.
- A clickable design demo comes first (UX-00), on a separate branch that is never merged, before the fixes in Stage A.

## Decisions taken on 21 October 2026

- The design demo's look and behaviour are approved, as recorded under "Approved in the design demo".
- The demo is not merged; Stage B carries its components into the real site, built beside the current site and switched in one step.
- The public site is replaced first; the admin redesign follows.
- Public fixes to the current site (UX-01, UX-02, UX-03, the public parts of UX-07) are dropped; the admin fixes stay.
- The domain has expired; nothing before the launch check needs it.
- The public site is exactly the demo. Differences need the user's approval; features described above but absent from the demo are not built.
