# AidJobs — UX-08 launch decisions

**Status:** Decided 21 October 2026. Assessed read-only from `main` at `fbcfffe`; the user's decisions are recorded in each item. Item 9 (domain) stays open by the user's choice and is needed only by UX-18. Nothing here is decided until the user records it in the "Decision" line of each item. Once all thirteen are recorded, UX-08 is Done and Stage B of `ux-build-plan.md` can start.

Already decided by the user on 21 October 2026, and assumed throughout: the public site is exactly the approved demo (`ux-build-plan.md`, revision item 7). Every recommendation below keeps the demo's look and behaviour; none adds a feature the demo does not have.

How this was assessed: public pages and the public search API were read over HTTPS, the same requests any visitor makes; GitHub deployment records; the repository; vendor documentation. No crawl, database write, reindex, or admin action. Evidence labels as in the ledger: **Verified**, **Repository**, **Vendor docs**, **Not verified**.

## Summary of recommendations

Every recommendation below was approved by the user on 21 October 2026, except where the row says otherwise.

| # | Decision | Recommendation |
| --- | --- | --- |
| 1 | Direction | Approve `public-ux-direction.md` with the demo section |
| 2 | Contract | Approve the five amendments in item 2 |
| 3 | Logo | **Decided:** placeholder now, logo at the end with the domain |
| 4 | Launch date | Set when the domain is settled and Stage B is half done |
| 5 | Slow first load | Cached server-rendered page (in the design anyway), plus an always-on backend from $7 a month: a cold first request took 42.9 seconds |
| 6 | AI crawlers | **Decided:** allow search, user-triggered, and training crawlers; block only `Bytespider` |
| 7 | Server rendering | Cached page with every open job, refreshed every 10 minutes |
| 8 | Deployment | **Partly decided:** no ads or payments at launch, free Vercel plan fits. Open: the Netlify production copy |
| 9 | Domain | **Open:** the user is choosing, probably an `.org`; needed only by the launch check |
| 10 | Filtering | In the browser for launch, with a threshold to move to the server |
| 11 | Title facts | Read when the page is built, with the demo's code; store later if needed |
| 12 | W-06 | Move ahead, before launch |
| 13 | A saved job that closes | Keep the demo's behaviour for launch: it leaves Saved with the list |

## 1. Direction approval

The direction is `public-ux-direction.md`, including "Approved in the design demo (21 October 2026)". The demo look was approved on 21 October; this item approves the direction as a whole, the basis for every Stage B step.

- **Recommendation:** approve as written.
- **Decision:** 21 October 2026, the user approved the recommendation: the direction is approved as written, with the demo section.

## 2. Contract decisions

The contract (`aidjobs-migration-contract.md`) says, in §2: "Out of scope for this migration: … user accounts, recommendation systems, new public search features, enrichment expansion …"; in §13: "The public search UI, including `HomeClient`, stays unless a later product change says otherwise"; and rule 15: "Never rewrite the public UI without a product reason." The approved design needs these amendments, each recorded by the user:

| Amendment | What it allows | Contract text it amends |
| --- | --- | --- |
| A. Replace the public UI | The new public site replaces `HomeClient` and the current public pages at the switch (UX-29). The product reason is the "Product reason" section of the direction | §13, rule 15 |
| B. New public search features | As in the demo: Sector, Organisation, Country, and Deadline filters with several choices each; the title-fact filters; the 10-day view and day strip; the plain search box. No search suggestions or chips: they are not in the demo | §2 "new public search features" |
| C. Facts read from titles | Sector with SDG, level, contract, open to, work style, advert language, UN grade with typical experience, read from the job title by fixed rules, without AI, for display and filtering | §2 "enrichment expansion" |
| D. Ordering and similar jobs | The Recommended order (deadline, organisation mix, freshness) and "Similar jobs" (shared title words or SDG). Both are the same for every visitor and use no personal data. Recorded as permitted ordering, not a "recommendation system" in the personalised sense §2 excludes | §2 "recommendation systems" |
| E. Unchanged | User accounts, payments, CV processing, rewards, AI features, and taxonomy management stay out of scope. Saved jobs stay on the device | None |

- **Recommendation:** approve A to E.
- **Decision:** 21 October 2026, the user approved the recommendation: amendments A to E are approved and amend the contract as stated.

## 3. Logo

UX-09 (design foundation) lists the logo as a dependency. The logo matters for the favicon, the app icon, the brand bar, and checking the sage shade against it; none of that blocks the rest of UX-09 or later steps.

- **Recommendation:** start UX-09 with the placeholder star; the logo becomes a dependency of UX-18 (launch check) instead. The user sends an SVG when ready.
- **Decision:** 21 October 2026, the user: the logo is provided at the end, together with the domain choice (item 9). UX-09 starts with the placeholder; the logo is a dependency of UX-18.

## 4. Launch date

The launch needs the domain (item 9), Stage B, the switch (UX-29), and W-06 if item 12 moves it ahead.

- **Recommendation:** set the date when the domain is settled and Stage B is about half done, when the remaining work can be counted in pull requests.
- **Decision:** 21 October 2026, the user approved the recommendation: the date is set when the domain is settled and Stage B is about half done.

## 5. Slow first load

**Findings:**

- With the backend awake, a request through the production site took 0.4 to 1.5 seconds (Verified, 21 October 2026, three sites, three requests each).
- Cold: after 20 minutes with no requests from the agent, the first request took 42.9 seconds and the next ones 0.35 to 0.86 seconds (Verified, 21 October 2026, 12:16 UTC). That matches a free instance waking up. It is a single measurement; another visitor during those 20 minutes would have kept the service awake, so a cold start can only be longer, not shorter, than shown on a quiet day. On 20 October the first three requests of the review took about 20 seconds each (W-26).
- Render's documentation: a Free web service "spins down" after 15 minutes without inbound traffic and takes "about one minute" to spin up; paid compute plans do not spin down; the smallest paid instance is $7 a month (Vendor docs, render.com/docs/free and render.com/pricing, read 21 October 2026).
- The Render log of 19 October ends with `Shutting down … Scheduler stopping` without a deploy (ledger, W-05 notes). The scheduler runs inside the backend, so while the service sleeps, scheduled crawls do not run (Repository; sleep as the cause Not verified).
- The plan the backend runs on is not visible to the agent. The user can read it on the service's page in the Render dashboard (Instance type).

**Options:**

| Option | Cost | Effect |
| --- | --- | --- |
| A. Always-on backend instance | From $7 a month | No cold start; scheduled crawls run on time |
| B. An outside "keep-alive" request every 10 to 14 minutes | Free | Keeps a free instance awake, using about 744 of the 750 free hours a month; Render says free instances are not for production |
| C. Cached server-rendered page with every open job (item 7) | Free, part of Stage B | Visitors get the job list from the cache without waiting for the backend; the cache refreshes in the background, and the last good page is kept if the backend is slow or asleep |

- **Recommendation:** C, which the Stage B design needs anyway, so visitors never wait on the backend for the list. Add A: the 42.9-second first request points to the free plan (the user confirms in the dashboard), and sleeping also stops scheduled crawls, a crawler reliability problem a cache does not solve. A costs from $7 a month.
- **Decision:** 21 October 2026, the user approved the recommendation: C, the cached page, in Stage B; and A, an always-on backend instance from $7 a month. The user changes the instance type in the Render dashboard (the agent has no access), before the launch check and preferably soon, because scheduled crawls stop while the free instance sleeps.

## 6. AI crawlers

AI companies use three kinds of crawler, each named separately in `robots.txt` (Vendor docs: OpenAI, Anthropic, Perplexity, Google, Apple, Meta; cross-checked with two published lists dated 7 and 20 October 2026):

| Kind | Examples | What allowing it means |
| --- | --- | --- |
| Search: indexes pages so AI answers can cite and link them | `OAI-SearchBot` (ChatGPT search), `Claude-SearchBot`, `PerplexityBot`, `Googlebot` (also Google's AI Overviews and AI Mode), `Applebot`, `Meta-WebIndexer`, `Amzn-SearchBot`, `MistralAI-Index` | AidJobs can appear, with links, in AI answers. This is the success measure in the direction |
| User-triggered: opens a page when someone asks an assistant about it | `ChatGPT-User`, `Claude-User`, `Perplexity-User`, `Meta-ExternalFetcher` | Answers can read a job a person asked about. Several of these say they may not follow `robots.txt` |
| Training: collects pages to train models | `GPTBot`, `ClaudeBot`, `Meta-ExternalAgent`, `Amazonbot`, `CCBot` (Common Crawl), `MistralAI-Training`; control tokens with no crawler of their own: `Google-Extended`, `Applebot-Extended` | Content may be used to train models. No direct traffic. Note: `Google-Extended` also controls grounding in Gemini apps, so blocking it can keep AidJobs out of Gemini answers |

The job adverts are public pages of the employers; AidJobs adds the aggregation. None of these crawlers sees any job today: the home page HTML contains no job titles (Verified, item 8), which Stage B fixes.

- **Recommendation:** allow every search and user-triggered crawler. Training crawlers are your choice: allowing them maximises visibility, including Gemini; blocking them costs little traffic except through `Google-Extended`. Block `Bytespider`, which publishes no English crawler documentation and is reported to ignore `robots.txt`. Applied in `robots.txt` at UX-10, with `llms.txt` at UX-25.
- **Decision:** 21 October 2026, the user: allow AI crawlers at launch, training crawlers included (an earlier answer to block them was a misunderstanding and is withdrawn). `robots.txt` allows every search, user-triggered, and training crawler listed above, including `Google-Extended` and `Applebot-Extended`, and blocks only `Bytespider`, as recommended.

## 7. Server rendering approach

**Today:** `app/page.tsx` renders `HomeClient` in the browser; the HTML sent is 2.9 KB, contains "Loading", and no job titles (Verified, 21 October 2026). The frontend reaches the backend through rewrites in `next.config.js` (`/api/search/*`, `/api/jobs/*`) to `NEXT_PUBLIC_API_URL` (Repository).

**Proposed (Next.js 14, App Router, no new services):**

1. The new site's page is a server component that reads every open job from the backend's existing `/api/search/query` (pages of 100) when the page is built, and caches the result for 10 minutes (incremental static regeneration). The HTML carries the first screen of jobs as real text and every open job as data for the browser.
2. After 10 minutes, the next visitor still gets the cached page at once while a fresh one is built in the background. If the backend fails or is asleep during that rebuild, the last good page stays in the cache. This is how Next.js documents incremental regeneration (Vendor docs); it is **Not verified** on our Vercel and Netlify setup, and UX-10 must prove it by rebuilding with the backend unreachable before the approach is relied on.
3. Filtering, counts, sorting, and the job sheet run in the browser on that data (item 10), so they make no backend request.
4. Days left are worked out in the browser from the deadline date, so a cached page never shows a stale "Today"; jobs whose deadline passed since the cache are hidden.
5. A real page title and description, `robots.txt`, `sitemap.xml`, canonical links, and link previews come from Next's built-in metadata files. While the domain is down the site address is one setting, and the site tells search engines not to index it.
6. A shared job link (`?job=…`) opens the job from the same data. Its own link preview needs a job page (UX-24); until then a shared link previews as the site.
7. The same build works on Vercel and on Netlify previews (Not verified until UX-10).
8. The page looks exactly like the demo. Two pieces of porting work make that possible on the server: one fixed country-name table (the demo renders only in the browser because Node and browsers name some countries differently), and dates worked out in the browser (point 4).

- **Recommendation:** approve this approach for UX-10.
- **Decision:** 21 October 2026, the user approved the recommendation, including the proof at UX-10 that the last good page survives an unreachable backend.

## 8. Deployment unknowns

Established 21 October 2026:

| Question | Finding | Evidence |
| --- | --- | --- |
| Public production address while the domain is down | `https://aid-jobs-frontend.vercel.app` serves production (200). Each deployment's own address and `aid-jobs-frontend-aidjobs-projects.vercel.app` redirect to a Vercel login | Verified with direct requests and GitHub deployment records (merge `fbcfffe`) |
| `www.aidjobs.app` and `aidjobs.app` | `www` does not resolve; the bare domain resolves but refuses connections | Verified |
| Does Netlify publish production? | `https://moonlit-llama-d9f5a7.netlify.app` serves a public copy of the site (200). GitHub shows no Netlify build for merges to `main`, so which commit it serves is not visible to the agent | Verified (address); commit Not verified |
| Which backend do previews use? | Vercel production, Netlify production, and the Netlify preview of PR #22 all answer through the same Render backend (Render's `rndr-id` and `x-render-origin-server: uvicorn` headers) | Verified for reads. An admin action on any of them changes production (inferred, not tested) |
| Search engine files | `robots.txt`, `sitemap.xml`, and `favicon.ico` return 404 on production | Verified |
| Vercel plan | Which Vercel plan the project is on is not visible to the agent. Vercel's free Hobby plan is for "non-commercial personal use only"; advertising, payments from visitors, being paid to build or host the site, or affiliate links as the main purpose count as commercial; asking for donations does not. Pro costs $20 a month and includes one free first-year domain on `.app` and a few other endings | Vendor docs (vercel.com fair-use guidelines, terms, pricing, Pro plan page), read 21 October 2026 |

- **Recommendation:** live checks use `aid-jobs-frontend.vercel.app` until the domain returns. Confirm that AidJobs stays non-commercial while on Vercel's free plan; if ads, sponsored listings, or payment for the work are planned, move to Pro before launch. Decide the Netlify production copy: keep Netlify for pull-request previews (they are public and useful) but switch off its production site, or mark it `noindex`, so search engines never find two copies of AidJobs. The user checks Netlify's production branch setting under Site configuration, Build and deploy.
- **Decision:** partly decided, 21 October 2026, the user: no ads and no payments at launch, so the free plan fits the launch. After launch, changes come one step at a time; any step that adds ads, payments, or paid work moves Vercel to Pro first. Netlify, approved as recommended: Netlify keeps building pull-request previews; the user switches off its production site in Netlify, or, if that would also stop previews, the new site's `noindex` setting covers it until the domain is connected to Vercel only.

## 9. Domain

`aidjobs.app` has expired (W-29). Registrars usually allow a grace period, then a more expensive redemption period, after which the name is released for anyone to register. The exact dates depend on the registrar and are visible in its dashboard.

- **Recommendation:** if you want `aidjobs.app`, renew it now, even though launch is weeks away; connect it at UX-18. If you move Vercel to Pro anyway (item 8), its free first-year `.app` domain could cover a new registration, but not necessarily a renewal of a name held at another registrar; check before relying on it.
- **Decision:** open, 21 October 2026. The user is unsure about renewing `aidjobs.app` and is looking at an `.org` domain, which suits a non-profit job site better. Nothing before UX-18 depends on the choice: the site address is one setting, and search engines are kept out until the domain is connected. If the name itself changes, not only the ending, the brand text in the menu and the phone brand bar changes with it. Vercel Pro's free domain does not cover `.org`.

## 10. Filtering approach

**Measured, 21 October 2026:** 195 open jobs (the demo had 206 on 20 October; deadlines have passed since). Reading them all through the public search took two requests of 100 in 2.3 seconds; 28 KB compressed with all 28 fields the API returns; 24 KB compressed with the 8 fields the list needs, about 125 bytes per job compressed (Verified).

**Projection:** about 125 KB compressed at 1,000 open jobs, 250 KB at 2,000, 620 KB at 5,000. On a slow mobile connection of about 50 KB a second, 2,000 jobs add about 5 seconds to a first visit; on 4G it is under a second (Not verified on a device; arithmetic from the measurement).

| Option | Launch work | Limits |
| --- | --- | --- |
| In the browser: every open job arrives with the cached page (item 7); filters and counts run on the phone | No new backend search features; counts always add up; works with the backend asleep | Page weight grows with the number of jobs |
| On the server: the backend filters and returns counts per pill (UX-11 in full) | New backend query features with several values per filter, counts per choice, and tests | Every tap waits on the backend, including a sleeping one |

- **Recommendation:** in the browser for launch. Move to the server when open jobs pass about 1,500 or the job data passes about 200 KB compressed, measured at each launch check. UX-11 narrows to what the server-rendered page needs. The public list then reads PostgreSQL through the existing database path; the Meilisearch decision (W-18) is not needed for launch.
- **Decision:** 21 October 2026, the user approved the recommendation: filtering in the browser for launch; move to the server at about 1,500 open jobs or 200 KB compressed, measured at each launch check.

## 11. Where title facts are read

**Findings:** the backend's database search builds each job in a Python loop before returning it (`app/search.py`, Repository), so a backend version would be a small change. The demo already reads every fact from the title in TypeScript (`_lib/facts.ts` at the tag), tested in twelve rounds. The old enrichment columns the API returns are empty for every one of the 195 open jobs: `sdgs`, `impact_domain`, `functional_role`, `experience_level`, `level_norm`, `is_remote`, `international_eligible`, `mission_tags`, `org_type` (Verified, 21 October 2026). Only 98 jobs have a country code and 113 a deadline. Title facts are the only classification the site has.

| Option | Work | Trade-off |
| --- | --- | --- |
| A. When the page is built, in the frontend, with the demo's code | Reuse `facts.ts`; no backend change; no database write | Facts are not in the database, so the admin and future server filtering cannot query them |
| B. When the backend returns a job, in Python | Port the rules to the backend, with tests in CI | Two languages if the frontend also needs them; still not queryable |
| C. Stored on each job at save time | Crawler change, a new column or columns, and a one-off write to every existing job, which needs its own approval | Queryable everywhere; most work; needed for server filtering, landing pages, and structured data later |

- **Recommendation:** A for launch. Move to C together with server filtering (item 10) or landing pages (UX-25), whichever comes first.
- **Decision:** 21 October 2026, the user approved the recommendation: A, read when the page is built, with the demo's code and its new tests; move to C with server filtering or landing pages.

## 12. W-06 before launch

Sixteen active UNICEF rows from 6 December 2025 have no deadline and stay listed indefinitely (W-02). The demo shows them with an orange "may have closed" warning and places them last, which limits the harm but still lists them. W-06 is the written expiry rule the contract requires before any job leaves search because a crawl did not find it (§6); its agreed basis is a complete listing crawl (`listing_complete`).

- **Recommendation:** move W-06 ahead of the other crawler items, so it is decided and validated before UX-29. W-02, the read-only inspection of those rows, comes first.
- **Decision:** 21 October 2026, the user approved the recommendation: W-06 moves ahead of the other crawler items and is decided and validated before the switch (UX-29); W-02 comes first.

## 13. A saved job that closes

In the demo, Saved shows only saved jobs that are still in the list. When a saved job's deadline passes, or W-06 later expires it, it leaves Saved silently, and the count drops (Repository, the demo at the tag). This was not discussed during the demo rounds.

| Option | Effect |
| --- | --- |
| A. As in the demo | Saved holds only open jobs; nothing to build. A job someone meant to apply for can vanish without notice |
| B. Show it as closed | Saved keeps it greyed, marked "Closed", with a remove button; needs the job's title kept on the device. A difference from the demo, so it needs this approval |

- **Recommendation:** A for launch, because the site is exactly the demo; revisit after launch if people ask.
- **Decision:** 21 October 2026, the user approved the recommendation: A, as in the demo; revisit after launch.

## After the decisions

When every item has a decision: UX-08 is marked Done in `ux-build-plan.md`; the plan records the consequences (UX-09's logo dependency moved to UX-18 if item 3 is accepted; UX-11 narrowed further, possibly to nothing, if item 10 is accepted; UX-17 carries the caching from items 5 and 7; W-06 placed in the order table if item 12 is accepted); the ledger's "Decisions waiting" table is updated; and Stage B starts with UX-09's plan.
