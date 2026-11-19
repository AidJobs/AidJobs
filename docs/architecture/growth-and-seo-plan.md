# AidJobs — Growth, crawler, and SEO plan

**Status:** Recorded on 30 October 2026 from the user's decisions and delegations of 29 and 30 October 2026, after a read-only investigation of how UNjobs.org collects jobs, a scale analysis of the current crawler, and an independent review of the plan (29 October 2026). Where the user delegated a choice to the agent ("you decide", "do what is the best correct way to move forward"), this record says so; those choices are approved when the user explicitly approves merging this record (PR #67), and the merge request names them. This is approval of the direction and the order. Every step below still needs the user's explicit approval to plan, implement, and merge, and follows the working method in the ledger.

**Authority:** the contract (`aidjobs-migration-contract.md`) and the crawler plan (`crawler-completion-plan.md`) still govern. The amendments this plan needs are listed in section 6 and recorded in those documents with this plan. Where this plan and an older plan's order disagree, this plan's order (section 7) applies from 30 October 2026.

Evidence labels as in the ledger: **Verified**, **Repository**, **Not verified**.

## 1. Goal

AidJobs aims to be the most complete, freshest, and most useful source of jobs in international aid and development, the UN system, humanitarian work, NGOs, nonprofits, not-for-profits, and charities, better than UNjobs, ReliefWeb, and the others in coverage and service, with search-engine visibility built in from the start (user, 29 and 30 October 2026).

Searches AidJobs wants to lead: "international development jobs", "UN jobs", "NGO jobs", "nonprofit jobs", "not-for-profit jobs", "charity jobs", "humanitarian jobs", the searches around ReliefWeb, the major job titles of these sectors, and each of these by country.

**Realistic milestones (independent review, accepted):** first place for broad terms such as "UN jobs" or "NGO jobs" is not realistic within a year against ReliefWeb, UNjobs, LinkedIn, Idealist, and the UN's own careers site. The path is: specific searches first (an organisation, a country, a function, a job title, a grade, and their pairs) and Google's job panel; broad terms over 12 to 24 months as links and citations accumulate. "ReliefWeb" itself is a brand search: the target is the searches around it, not the brand.

## 2. Evidence

### 2.1 How UNjobs.org collects jobs (29 October 2026)

UNjobs does not publish its method. These are inferences from its public pages as search engines index them and from third-party write-ups. The agent fetched its home page and `robots.txt` once and nothing else after seeing that `robots.txt` blocks every crawler except Googlebot, Bingbot, Twitterbot, the AdSense bot, and a link checker. The independent review did not re-check them (Not verified).

- **Per-employer crawlers on a schedule.** "Updated" times come in tight runs per organisation, about one item a second, starting just after the hour: the International Rescue Committee about daily near 05:00 UTC; IOM about every two hours; the UN Secretariat entities on `careers.un.org` in one run.
- **Full original text copied.** An ITU vacancy page on UNjobs still contains ITU's unfilled template placeholders (`[[positionNumber]]`, `[[PositionGrade]]`).
- **Normalised fields added:** Organization, Country, City, Office, Grade, and Closing date; an office and duty-station list behind pages per organisation, duty station, office, and skill.
- **Vacancy IDs look like the time of first capture** in milliseconds (for example `1787062706329` decodes to about 18 August 2026 for a job closing 31 August).
- **Weaknesses:** only "Updated" times, no posting date; closing dates on a minority of jobs (57 of 200 recent vacancies, per a third-party scraper's description, Not verified); duplicate organisation records (IRC listed twice on one page) and organisations shown as raw slugs; script access blocked (`robots.txt`, and a Cloudflare challenge recorded in W-31).
- **An employer submission portal** at `submit.unjobs.org`.
- **Size:** about 107 UN and intergovernmental bodies (about 2,052 jobs) and about 535 other organisations (about 7,326 jobs), about 640 distinct organisations (ledger W-31, from lists the user pasted).

UNjobs cannot be a data source: its `robots.txt`, its bot challenge, and its terms forbid automated access. It stays a benchmark only.

### 2.2 Why today's crawler cannot reach that size (Repository, 29 October 2026)

- **Job pages:** when a listing has 1 to 50 candidates, every job page is reopened on every crawl; above 50, none is opened (any count for UNDP; skipped for UNICEF) (`crawler_v2/simple_crawler.py`, about lines 2110 to 2139). The ICRC crawl of 27 October 2026 took 2.4 minutes for 33 jobs, about 96 seconds of it opening job pages and about 23 seconds geocoding (ledger W-14). At about 10,000 jobs, reopening every page daily would take about 8 hours.
- **Scheduler:** inside the Render web service: every 5 minutes, 3 crawls at a time, 20 sources per pass, a 15-minute limit per crawl, a 25-minute lock (`orchestrator.py`, lines 32 to 34 and 64 to 65). Defaults by organisation type: UN every day, INGO every 2 days, NGO every 3 days, with adjustment by activity and health; in practice each live source is crawled about every 3 days. On Render's free plan the service, and so the scheduler, sleeps after 15 minutes without traffic.
- **Fields saved:** the writer's validated fields are title, apply link, description snippet, location, country, country code, city, remote, and deadline (`contracts/upsert.py`, lines 8 to 18). Contract or employment type helps admit a job and is then discarded. The repository schema has no `first_seen_at` (contract §5 names it), no full description (only `description_snippet`), and no posting date (`infra/supabase.sql`). The production schema is not verified (contract §15).
- **Admission today** (`contracts/admission.py`): an HTML link with a vacancy shape needs a title plus a location, deadline, or employment type, otherwise `thin_vacancy`; a repeated family of numeric-id or UUID links is admitted with no fields; an API candidate needs a deadline or a location; an RSS candidate needs a deadline. Two or more Lever or Ashby job links on one listing form a repeated UUID family and are admitted with no fields; a listing with only one such job is not a family, so a reader must supply its fields.
- **Seen and updated:** a job is marked seen, and its fields updated, only when its listing row is admitted: `persist_candidate` returns `rejected` for any row that is not admitted, and it finds existing jobs by `canonical_hash` (title plus link), not by apply link (`contracts/persist.py`, lines 69 to 86). A field captured later fills in for any job that is still open; only jobs that close before a field is captured never get it. `created_at` is never changed when a job is matched again (`contracts/upsert.py`, lines 20 to 31), so it already records when AidJobs first saved the job.
- **Unused columns already in the repository schema:** `contract_type`, `work_modality`, the `compensation_*` columns, `duplicate_of`, and `raw_metadata` (`infra/supabase.sql`, lines 318 to 349). `jobs.id` is a UUID (line 293). The Gate 8 migrations exist (`infra/migrations/gate8_organisations.sql`, `gate8_organisation_foreign_keys.sql`); whether they are applied in production is Not verified.
- **Event loop:** the scheduler runs inside the web server's event loop. Since PR #60, database steps and saves run in worker threads; parsing still runs on the event loop, and a cold process can still stall it for 1 to 2 seconds (security plan, stage 2; A2 is open).
- **Politeness and identity:** `core/robots.py` (`RobotsChecker`) and `core/domain_limits.py` (`DomainLimiter`) exist but nothing calls them, and neither is fit to switch on as is: the robots checker fetches through raw `httpx` outside the fetch policy (contract §9), has no `Allow` rule, wildcards, or longest-match, and treats server errors as "allowed"; the limiter holds one global lock across all hosts and queries the database on every call. On a 403 the HTML crawler retries with a Chrome browser user-agent and browser headers (`simple_crawler.py`, lines 109 to 127 and 289 to 292). The crawler identities point at the expired domain: `Mozilla/5.0 (compatible; AidJobs/1.0; +https://aidjobs.app)` in `simple_crawler.py` (line 210), `rss_crawler.py` (line 31), and `api_crawler.py` (line 30); `AidJobsBot/1.0 (+contact@aidjobs.app)` in `core/net.py` (line 18) and the admin source test (`app/sources.py`, line 675); `AidJobs/1.0 (contact@aidjobs.app)` in the geocoder (`core/geocoder.py`, line 109); `core/net.py` also sends `contact@aidjobs.app` as a `From` header (lines 19 and 135) and lets the settings `AIDJOBS_CRAWLER_UA` and `AIDJOBS_CONTACT_EMAIL` override both (lines 77 and 78; their values on Render are Not verified); `scripts/smoke_test_new_extractor.py` (line 44) uses the old identity; `tests/test_site_reader_fallback.py` (lines 727 to 730) asserts the Chrome retry. The robots checker reads and writes a `robots_cache` table on every call (`core/robots.py`); the table is in the repository schema (`infra/supabase.sql`, line 262) and Not verified in production.
- **Personal data:** the HTML crawler extracts emails and phone numbers from listing pages and logs how many it found (`simple_crawler.py`, about lines 700 to 703).
- **Public site:** the job loader stops at 50 pages of 100, 5,000 jobs (`apps/frontend/lib/site/loadJobs.ts`, line 5), but the decided move to server-side filtering comes first, at about 1,500 open jobs or 200 KB compressed (UX-08 item 10).

### 2.3 Sample of employers' recruitment systems (29 October 2026)

Twelve employers from UNjobs' lists, checked through search-engine copies of their own careers pages only; no request was made to their sites (Not verified by the independent review):

| Employer | System | Evidence |
| --- | --- | --- |
| International Rescue Committee | Workday | `theirc.wd1.myworkdayjobs.com/en-US/External_Careers` |
| PATH | Workday | `path.wd1.myworkdayjobs.com/en-US/External` |
| GiveDirectly | Greenhouse | `job-boards.greenhouse.io/givedirectly` |
| Human Rights Watch | Greenhouse | `job-boards.greenhouse.io/humanrightswatch` |
| Watershed | Ashby | `jobs.ashbyhq.com/Watershed` |
| Sylvera | Ashby (a stale Workable page also exists) | `jobs.ashbyhq.com/sylvera` |
| Clinton Health Access Initiative | iCIMS | `careers-chai.icims.com` |
| Mercy Corps | Jobvite, UltiPro for applications | `jobs.jobvite.com/mercycorps`, titled "Prosper Global Careers" |
| Norwegian Refugee Council | Webcruiter | `23109900.webcruiter.no/…` |
| Danish Refugee Council | Own listing | `drc.ngo/jobs` |
| Save the Children International | Own portal; national-staff jobs only on country sites | `savethechildren.net/careers/apply` |
| Innovations for Poverty Action | Own website pages | `poverty-action.org/current-opportunities` |

Findings for the survey: one organisation can have several careers sites; stale boards exist, so detection must find the live one; national-staff jobs are often only on country sites, which UNjobs probably misses and AidJobs can cover.

### 2.4 Independent review, 29 October 2026

An independent agent reviewed the plan against the repository, the contract, and vendor documentation. Its corrections are adopted here:

- **GitHub Actions must not run the crawler.** GitHub's terms limit hosted runners to building, testing, deploying, and publishing the project, and misuse can suspend the account that also publishes the site; scheduled runs can also be delayed or dropped.
- **Google's Indexing API** allows 200 publish requests a day by default, removals included, and screens submissions for spam. Sitemaps with accurate last-modified dates are the baseline.
- **IndexNow** reaches Bing, Yandex, Seznam, Naver, Yep, and Amazon, not Google.
- **The UN careers site** has an official RSS feed (`careers.un.org/jobfeed`), not a documented JSON API.
- **Greenhouse, Ashby, and Lever** have public job APIs without keys. Ashby's `publishedAt` is the last publication date; Greenhouse's `first_published` is on the single-job endpoint.
- **Render free** sleeps after 15 minutes without traffic, has 750 hours a month, and may suspend a free service with unusually high outbound traffic. **Supabase free** has 500 MB, pauses after 7 days of low activity, and has no automatic backups. **Vercel Hobby** is non-commercial only (donations allowed).
- **Google's job panel** is offered only in listed regions and tends to show the employer's own marked-up page over copies (the region list is Not verified by the agent). The plan does not depend on job-panel traffic.
- The review's conflicts and gaps are resolved in sections 4 to 6.

## 3. Decisions

| # | Decision | Outcome | By |
| --- | --- | --- | --- |
| 1 | Domain | `aidjobs.app`, treated as owned; connected at the launch check (UX-18). It stays in the code and the trusted origins | User, 30 October 2026 |
| 2 | Crawler contact | `aidjobz@gmail.com` in the crawler's identity until `aidjobs.app` is connected | User, 30 October 2026 |
| 3 | Hosting | Render free and Supabase free now; the code built for one always-on Render instance; paid plans when a signal in section 8 appears | User, 30 October 2026 |
| 4 | Market | International aid and development, plus domestic nonprofit and charity jobs in the US, UK, Australia, Canada, and Europe | User, 30 October 2026 |
| 5 | Descriptions | Full text stored and shown, with attribution, a display setting per source, and an employer opt-out | Delegated to the agent |
| 6 | Launch | After the crawler foundation, with about 2,000 open jobs, then growing to thousands (changed 3 November 2026) | User, 30 October and 3 November 2026 |
| 7 | Demo differences | Job pages, landing pages above a minimum job count, the job sheet using the job page's address, the heading widened | Delegated to the agent |
| 8 | Order | Section 7, chosen on technical grounds | Delegated to the agent |
| 9 | Posting date | Three dates, rules in section 4.4 | Delegated to the agent |
| 10 | Known jobs and expiry | The observation rule and expiry rule in section 4.3 | Delegated to the agent |
| 11 | ReliefWeb | API v2 for discovery, and as the feed only for organisations not crawled directly | User asked for the best way; agent's choice |
| 12 | Features | No display advertising; employer submissions first after launch, then alerts; paid, labelled sponsored listings allowed for jobs employers publish (clarified 3 November 2026) | User, 30 October and 3 November 2026 |
| 13 | Crawl frequency | Twice a day for large employers, daily for the rest, within the politeness rules | Delegated to the agent |
| 14 | Title facts (UX-08 item 11) | Worked out when read, on the server, in one shared module | Delegated to the agent |

Details, by decision number:

**1. Domain.** "I will buy aidjobs.app later … this is the domain we will use", then "think that we already own it, but are not using it" (user, 30 October 2026). It stays in the code and in the backend's trusted origins (`main.py`, lines 128 and 129). Accepted risk, recorded: until it is bought, anyone could register the name while it is still a trusted origin. Buying it is a dependency of the launch check (UX-18). Until it is connected, nothing answers at that address, so the crawler's identity uses decision 2.

**2. Contact.** For example `AidJobsBot/1.0 (+mailto:aidjobz@gmail.com)`. It is not a secret and may live in the code. It replaces `contact@aidjobs.app` in the geocoder too, until the offline country lookup replaces the geocoder. It moves to the domain at launch.

**3. Hosting.** The user's words: "we should build for $7", "we will add sources gradually, and when the need arises we will opt for a paid plan". The agent's design under that decision: built for always-on, with the scheduler staying inside the backend and crawling in the one process, sized for one instance with 512 MB, so no second crawl process is needed and contract §12's second-worker approval is not triggered. Because the crawl shares the web server's event loop, A2 (parsing off the event loop), or parsing each deadline once if the user chooses that instead (the user's decision, security plan stage 2), is carried out in the crawler foundation before twice-daily crawling and server-side search share that process. While on the free plan, crawling stays light and sources are added gradually (section 8). If a separate crawl process is ever needed, it needs the §12 record and approval, and it must install the same redacting log setup and refresh it after the environment loads, as `main.py` does (`log_safety.install()`, then `log_safety.refresh_secrets()`). GitHub Actions is not used to run crawls (2.4).

**4. Market.** Domestic nonprofit coverage is built systematically, not employer by employer: public charity registers with income figures (the US tax-exempt organisations list, the IRS Business Master File; the UK Charity Commission register; Australia's ACNC register; Canada's list of registered charities; European national registers and networks) rank employers by size for the survey, and readers per recruitment system cover many employers each. Sequencing (the agent's; the market decision covers all of Europe): at launch, international aid plus English-language nonprofits (US, UK, Canada, Australia, and English-language employers elsewhere); after launch, non-English Europe, which needs title rules per language and, later, landing pages per language. This amends contract §2 (section 6).

**5. Descriptions.** Classification, search, the job page, and Google's job panel all need the full text, so it is stored and shown in full, with:
- attribution ("Published by {employer}"), a link to the original advert, and the apply button;
- a display setting per source, full or excerpt; excerpt where the source's terms forbid reuse (the survey records each source's terms);
- an employer opt-out and takedown route on the About page (UX-27), before launch;
- cleaned text with a size cap; recruiters' emails and phone numbers removed;
- the description dropped 90 days after a job closes; the job's basic record stays.

AidJobs adds what neither UNjobs nor the employer shows: a facts summary at the top of each job (grade with typical experience, contract, deadline in the visitor's time zone, eligibility, sector).

**6. Launch.** After the crawler foundation (section 7, step 4), the admin's add-source flow (step 5), and gradual source growth (step 6), so the site launches with thousands of jobs.

Changed by the user on 3 November 2026: "we will launch with around 2000 and then gradually add more." Thousands of jobs is the vision; the launch comes at about 2,000 open jobs, and sources keep being added after it. Server-side search and paging (UX-11) still come before launch, because about 2,000 is above the 1,500-job threshold of UX-08 item 10, and so does the always-on Render instance (section 8).

**7. Demo differences** (delegated to the agent; approved with this record; added to the UX plan's revision of 30 October 2026):
- a permanent, server-rendered page per job at `/jobs/{readable-title}-{id}`, where the id is the job's database id (`jobs.id`, a UUID, or a short unique form of it fixed in UX-24's plan), never the identity key. Tidying how a title is displayed never changes the address. A job whose identity changes (a title change at the employer, or W-24's cleaning at save time) is a new row with a new address; redirecting the old address uses `jobs.duplicate_of` and is its own database-write decision;
- opening a job from the list still opens the sheet without a page load, but the address becomes the job page's address, so every shared link is the indexable page;
- landing pages per organisation and per country, and the hubs (UN, NGO, nonprofit, charity, humanitarian, international development); sector, function, contract, grade, and job-title pages only above the minimum job count, with "do not index" below it;
- filter combinations stay in the browser; only combinations that become landing pages get their own address;
- the heading widened to include nonprofit and charity jobs; the exact words are a fidelity-check item for the user;
- otherwise the look and behaviour stay exactly the demo's.

**8. Order.** Section 7. **9. Posting date.** Section 4.4. **10. Known jobs and expiry.** Section 4.3.

**11. ReliefWeb.** The user's words: "relief web is reliable, what do you say or is there a better way out, no hot fixes though". The agent's choice, a lasting design rather than a quick feed: API v2 (the user requests the `appname`) for discovery (which organisations post jobs, how many) and as the job feed only for organisations AidJobs does not crawl directly, often small NGOs that post only there. One primary source per organisation avoids guessing which jobs are duplicates; a duplicate report covers the remaining overlap, and nothing is merged automatically. Links go to the original advert; ReliefWeb's terms are checked in the survey. UN Talent (`untalent.org/open`) is a benchmark only. The UN careers site is read through its official RSS feed.

**12. Features.** No ads. After launch, employer submissions come first (moderated, for organisations without a recruitment system), then alerts; each changes contract §2 (it says "Users do not submit career sources" and rules out user accounts) and needs its own scope decision then.

Clarified by the user on 3 November 2026: "no ads" meant display advertising. Paid sponsored listings ("Premium") for jobs that employers publish are allowed, always labelled, in a section of their own, so the Recommended order stays the same for every visitor. They arrive with the employer side (`employer-side-plan.md`, decisions E2 and E6), which needs its own §2 scope decision; the contract's "no advertising" wording (§2 amendment of 30 October 2026) and the Vercel note in section 8 are updated with that decision, and Vercel Pro comes before any live payment.

**13. Crawl frequency.** Twice a day for UN agencies and large NGOs, daily for the rest; the adaptive scheduler slows sources that rarely change (every 2 or 3 days) and speeds up busy ones. The aim is to keep crawling without being blocked (section 4.2). Full frequency depends on the always-on instance. The new targets replace today's defaults (UN 1 day, INGO 2, NGO 3) as part of W-39.

**14. Title facts.** One Python module in the backend works out sector and SDG, function, level, UN grade and typical experience, contract, eligibility, remote work, and advert language, from the title and, once stored, the description (fixed rules, no AI; the contract §2 amendment covers both). Search, job pages, landing pages, and the admin use it. Its results are kept in an in-memory cache, rebuilt after each crawl and on start-up; it is not a database table. Server-side filtering by these facts (UX-11) runs on that cache, not in SQL. Nothing is stored on the jobs, so an improvement applies to every job at once; storing facts on existing jobs would be a historical normalisation rewrite, which the contract does not authorise (§4). The demo's TypeScript rules and their tests move into it. Because the market includes Europe, the rules handle French, Spanish, German, and other languages, added language by language. Fixed lists in code with tests; no editor and no tables (section 6).

## 4. Design rules, built in from the start

### 4.1 The crawler foundation: an upgrade, not a new crawler

What stays, as the contract requires (§4): the one scheduler and orchestrator, the outbound fetch policy (§9), the crawl locks and run ownership (security stage 2), admission (`admit_batch`), the identity rules (§7), the one writer (`persist_candidate`), and "a partial crawl never expires anything". Every change follows contract §11: small fixtures, today's output recorded, one stage changed, the same output proven.

What changes:

1. **One reader interface.** Each reader returns candidate jobs in the field-contract shape (4.4), whether the listing was read completely, and the expected total. The UNICEF reader and the general reader move behind it with identical output. Readers are chosen by what the page or system shows (Workday, Greenhouse, Clinch…), never by organisation name or by editing a source's address (rule of 19 October 2026).
2. **Readers per recruitment system**, in the survey's order (amended 7 November 2026, section 7): Clinch (UNICEF, W-04); Greenhouse, Ashby, and Lever (documented public APIs, cheapest), now Workable and Greenhouse first, then Teamtailor, Lever, Personio and Ashby; then Workday, Oracle, SuccessFactors, iCIMS, Jobvite, the UN careers RSS feed, ReliefWeb, and others. Workday and Oracle use undocumented endpoints and come later; Workday's job search is a POST request, allowed by the user on 6 November 2026 within the limits recorded in contract §9 (its amendment of that date).
3. **Each reader is tested** with small fixtures from saved responses, and has a canary check that warns when its system's pages or responses change.
4. **Job pages opened only for new jobs**, within a cap per crawl, together with the observation rule (4.3).
5. **Completeness for every source:** found against expected, and how many of the required fields each source fills. That fill rate is a quality measure in the admin, not a gate.
6. **A daily crawl-health message** to the user, so failed crawls are not silent.
7. **A2: parsing off the event loop,** or parsing each deadline once if the user chooses that instead (the user's decision, security plan stage 2), before twice-daily crawling and server-side search share the process (decision 3).

Done when: adding a source on a known system needs no code; a new system is one new reader with fixtures; a new classification or page type is a change outside the crawler, unless it needs a field that is not captured yet.

### 4.2 Polite crawling, and never bypassing a block

- One honest crawler identity everywhere (decision 2); the disguised browser retry removed in the first crawler pull request.
- `robots.txt` honoured inside the fetch policy (§9), rewritten rather than switching on `RobotsChecker` as it is: proper `Allow` and wildcard rules, and a defined behaviour for server errors.
- One request at a time per host with a few seconds between requests, a simple delay in the process (not the database-backed `DomainLimiter`), any requested crawl delay honoured, and a time and request budget per source. Recruitment-system hosts shared by many employers (Greenhouse, Ashby, Lever, Workday and others) get a budget per host set from that vendor's documented limits, so twice-daily crawling of many employers on one host stays within them.
- Stop early when a listing's set of job ids has not changed.
- On a refusal or challenge (403, 429, a challenge page): stop that source, record it, and try again the next day. A challenge is never solved or bypassed (ledger W-04, W-31).
- The offline country lookup, reusing the frontend's country table, replaces Nominatim; it also closes the geocoder's gap against §9 (W-27).

### 4.3 Known jobs, deadlines, and expiry

This amends crawler plan C3 and C4 and is the written W-06 policy the contract requires (§6): a trust policy and a consecutive-missing threshold, as a decision separate from any implementation pull request. The user delegated the choice to the agent ("you decide"); it is approved when the user explicitly approves merging this record. The implementation is a separate pull request with its own approval, and it may not add rules beyond these.

- **Observation rule.** A listing row rejected as too thin, whose normalised apply link matches exactly one saved, not-suppressed job of the same source that is active or expired by absence, counts as that job seen. A job expired by a passed deadline is not matched. This needs a new, narrow observation path in the one writer (`contracts/persist.py`), because today `persist_candidate` rejects any row that is not admitted and finds jobs by `canonical_hash`, not by apply link. That path updates only `last_seen_at`; it changes no other field, no identity, and no suppression. If more than one such row of the source has the link, nothing is observed, as with B3's two-row conflict. A new job still needs full admission evidence (C3); an unknown URL is still not admitted on this rule.
- **Trust.** Only a complete crawl counts as evidence of absence: `listing_complete` true, as agreed on 18 October 2026; the crawl status and failure counter never decide it. A source without a completeness report cannot expire anything by absence until its own completeness rule exists (W-39 or its reader, W-35); today only UNICEF reports completeness. A complete crawl with zero valid jobs never counts (§6). A complete crawl whose rows (admitted or observed) match fewer than half of the source's jobs that were active when the crawl started does not count as evidence either; it is recorded on the crawl run, and shown in the daily crawl-health message and crawl review once they exist. A crawl that counts is a "counting crawl".
- **Missing threshold.** A job expires by absence when the counting crawls of its source since it was last seen number at least two, span at least 24 hours, and none of them saw it.
- **Passed deadline.** A job expires when its stored deadline is earlier than the database's current date (`deadline < CURRENT_DATE`, the rule public search already applies in `app/search.py`). Being seen again does not reverse that; only a newer reading that stores a deadline on or after the current date does. A past deadline is information, not permission to destroy the row (§6, "Deadline").
- **What expiry does.** It changes lifecycle to expired only; it never deletes or suppresses the row. A job expired by absence returns to active when any crawl sees it again, unless its stored deadline has passed: being seen is evidence on its own; only absence needs a counting crawl.
- **Deadline changes.** Within each crawl's budget, the crawler reopens known jobs' pages when their deadline is within 3 days or has just passed, so extensions are caught, plus a slow rotation through all other known jobs.

**Amendment of 11 November 2026** (decided by the user with the plan for step 4.6, after the read-only investigation; effective when the user explicitly approves merging this record):
- **Save failures.** A complete crawl in which any job failed to save does not count as evidence of absence: that job was on the listing, but its sighting was not recorded, so it could otherwise expire while still open. Nor does one in which any listed row's sighting could not be recorded: a row matching two stored jobs at once (an identity conflict), a row the writer refuses, or one the save step drops as malformed (decided after the independent review of pull request 1). A hidden job seen again is recorded, so it does not stop a crawl counting.
- **Hidden jobs.** Expiry by absence, and the half-matched test, cover only jobs that are not hidden (suppressed): the observation path cannot see hidden rows, so absence is weaker evidence for them. Expiry by a passed deadline still applies to every row, hidden or not.
- **No backfill.** Only crawls whose completeness is recorded on their own crawl run count; the complete UNICEF crawls of 8 to 10 November 2026, recorded only in `extraction_logs`, do not.

### 4.4 The field contract

The minimum needed to save a job is today's admission rule, unchanged (2.2). Everything else is captured when the employer publishes it, stored empty when not, and never invented (§10). No job is lost because a field is missing.

| Field | How it is obtained |
| --- | --- |
| Title, apply link, organisation (via the source) | Captured; required as today |
| Description (full text, cleaned, capped, contacts removed) | Captured when published |
| Employer's posting date | Captured when published; each reader documents its field |
| First seen (`created_at`), last seen (`last_seen_at`) | Recorded by AidJobs on every job |
| Deadline | Captured when published |
| Contract or employment type | Captured when published; stored, no longer discarded |
| Locations, all of them, as written | Captured; several locations stay several |
| Salary, remote marker, advert language | Captured when published |
| Country and city | Worked out from the locations |
| Sector, SDG, function, level, UN grade, eligibility | Worked out when read (decision 14) |
| Organisation type | From the organisation record (Gate 8) |

**Dates (decision 9).** Every job carries up to three dates: the employer's posting date where given (Greenhouse `first_published`, Workday "posted on", UNICEF "Advertised"; Ashby's `publishedAt` only when it is earlier than first seen), first seen on AidJobs, and last seen on the employer's site.
- On the site: "Posted {date}" when the employer's date exists, otherwise "First seen {date}".
- In Google's structured data: the employer's date, or first seen when the previous complete crawl of that source was at most 3 days earlier, so the true date is within 3 days. Jobs from a new source's first crawl get no structured data until they have an employer date.

First seen comes from `created_at`, which already records when AidJobs first saved each job; no `first_seen_at` column is backfilled, because the migration date would be wrong for existing jobs and would reach Google's structured data. Existing unused columns (`contract_type`, `work_modality`, `compensation_*`, `raw_metadata`, `duplicate_of`) are reused where they fit, after the production schema is verified (§15); contract §5 says not to invent columns. Any new column is a database change with its own approval, after a manual backup (section 8).

### 4.5 Search-engine design

- **Page types:** at launch, job pages and landing pages per organisation, per country, and for the hubs. After launch (section 7, step 8): sector, function, contract, grade, and job-title pages, then pairs (for example "WASH jobs in Kenya"), each only as it passes the minimum job count; guides later. SDG pages and the salary calculator are deferred.
- **Thresholds:** each landing page needs a minimum number of open jobs to be indexed, with a gap between the count that switches it to "do not index" and the count that switches it back, so pages do not flip. This guards against Google's thin-content and scaled-content policies.
- **Each page's title, heading, short factual introduction, and structured data come from the same fixed lists** (decision 14), so the hundredth page is as complete as the first.
- **Job pages carry JobPosting structured data** only when the required fields exist (title, description, posting date, organisation, location or remote markers); `validThrough`, `employmentType`, and `baseSalary` when known; several `jobLocation` entries for several places.
- **Closed jobs:** structured data removed at once; the page kept for a while saying the job has closed, with similar open jobs, marked "do not index"; then 410 Gone. The timings are set in UX-24's plan.
- **Pages never wait for the backend.** The job list is already a cached page (UX-08 item 5). Job pages and landing pages are built and cached ahead of time and refreshed after crawls, so visitors and Google never meet a cold start, on either plan.
- **Indexing:** sitemaps split by type with accurate last-modified dates are the baseline. IndexNow for Bing and others. Google's Indexing API, which Google recommends for job pages, for new and closed job pages first, within its quota of 200 a day including removals.
- **Server-side search and paging** before open jobs pass about 1,500 (UX-08 item 10), which also removes the 5,000-job loader cap. Server-side search answers each visitor's search through the backend, so at launch it needs the always-on instance (section 8); the cached pages do not.
- **No website-to-database read path.** The backend stays the one reader of the database for the public site. If such a path is ever needed, it reads one database view that defines which jobs are public, with a read-only role granted on that view only (contract §13 and Gate 7 for which jobs are public; security stage 6 and contract §15 for the role).
- **Keyword families:** the agent drafts them from public sources (autocomplete, "People also ask", competitors' category pages, AidJobs' own titles); the user adds Google Keyword Planner and Trends data with their Google account and sets the order of markets; Search Console revises them after launch.
- **Accessibility** covers job pages and landing pages too, not only the list.

### 4.6 Data honesty and privacy

- Recruiters' emails and phone numbers are never stored; the crawler stops collecting them; the Privacy page says so.
- Attribution and the opt-out route (decision 5).
- `raw_pages` and the extraction logs are kept small: no raw HTML stored for every page, and old rows trimmed, always keeping at least the last few runs per source, because their `listing_complete` records are the expiry rule's evidence.

## 5. What is new compared with the existing plans

Existing items this plan uses: W-02, W-04, W-05, W-06, W-09, W-10 (B5), W-18, W-19, W-24, W-27, W-31, W-33, Gate 8, UX-11, UX-17, UX-22 to UX-25, UX-27, UX-29, UX-18, UX-19, UX-20. New ledger items W-34 to W-43 (ledger, "Growth plan"):

- W-34 honest crawler identity and polite crawling (4.2);
- W-35 the reader interface (4.1);
- W-36 the observation rule with W-06 (4.3);
- W-37 captured fields and the three dates (4.4);
- W-38 Greenhouse, Ashby, and Lever readers;
- W-39 completeness for every source and the daily crawl-health message;
- W-40 the add-source flow and crawl review in the admin before launch;
- W-41 ReliefWeb API v2 and the UN careers RSS feed;
- W-42 the title-facts module on the server (decision 14);
- W-43 backups, storage, and hosting signals (section 8).

## 6. Amendments recorded with this plan

Each is written into its document in the same pull request as this record. "Delegated" means the user asked the agent to choose; every item takes effect only when the user explicitly approves merging this record.

1. **Contract §2, product scope:** the market (decided by the user) includes domestic nonprofit and charity jobs in the US, UK, Australia, Canada, and Europe; no advertising (user). Job pages and landing pages built from real data (decision 7, delegated), and facts read from titles and descriptions by fixed rules, worked out when read (decision 14, delegated). Employer submissions, alerts, and accounts stay out until their own decisions.
2. **Contract §5, organisation type and classification** (decision 14 and the review, delegated): fixed lists in code with tests are allowed (organisation types, sectors and SDGs, functions, levels and grades, contract types). No editor, no taxonomy tables, and `seed_taxonomy.sql`, `levels`, and `org_types` are not revived.
3. **Contract §6, expiry policy** (decision 10, delegated): section 4.3.
4. **Crawler plan, C3 and C4** (decision 10, delegated): the observation rule and the reopening of known jobs' pages (4.3), and job pages opened only for new jobs within a cap (W-09 re-scoped).
5. **Crawler plan, "After this plan"** (part of the order, decision 8, delegated): the reader interface and Gate 8 may start after B4 and B5 are recorded; C5's remaining sites (W-08) no longer gate them and are handled through the survey and the add-source flow.
6. **UX-08:** item 4 (launch timing, user), item 5 (hosting, user), item 9 (domain, user), item 10 (server-side search before launch, order), item 11 (title facts, delegated), item 12 (W-06's place in the order, delegated).
7. **UX plan:** a revision of 30 October 2026 with the demo differences (decision 7) and the new order (decision 8), both delegated.

Not amended, because the design avoids it: contract §12 (no second crawl process while the scheduler stays in the one always-on backend).

## 7. Order of work

Chosen by the agent on technical grounds, at the user's request ("do what is the best correct way to move forward", 30 October 2026); approved with this record. Each step needs the one before. Each step is its own pull request or set of pull requests, each approved by the user.

W-06, which UX-08 item 12 (21 October 2026) moved ahead of the other crawler items, now comes at step 4.6, with the observation rule, after the Clinch reader gives UNICEF its completeness report. Other sources can expire by absence only once W-39 gives them a completeness report (step 4.10); expiry by a passed deadline applies to every source from step 4.6. It still lands well before the switch (UX-29).

1. **Record the decisions.** This pull request (docs only). Before it: PR #66, the stage 3 phase 2 PR 1 live record.
2. **Finish the security plan as approved:** stage 3A (dependency security, added by the user on 30 October 2026: backend pins, the Next.js upgrade, continuous dependency checks); stage 3 (phase 2 PRs 2 to 5 and its small extra pull request, then phase 3, which also rewrites how crawl messages are stored, so the crawler code is changed once); stage 4 (frontend proxies); stage 5 (secret-printing guard); stage 7 (two decisions); the stage 6 plan (least-privilege database roles), whose implementation timing is decided with that plan.
3. **The employer survey** (security stage 8, W-31), widened to the charity registers (decision 4), with two more columns: which keyword families each employer serves, and which fields and terms its recruitment system exposes. It decides which readers come first.
4. **Crawler foundation:**
   1. B4, the failure and lifecycle audit, and W-05 (read-only);
   2. W-34: one honest identity, no disguised retry, `robots.txt` inside the fetch policy, a delay per host; and W-44 (added 30 October 2026): real jobs rejected because their link contains "membership", a C3 amendment;
   3. W-04: the Clinch reader for UNICEF;
   4. B5, the completion record (W-10);
   5. W-37: production schema check, then the new columns and capture (description, the three dates, contract type, all locations, salary, remote, language); since 8 November 2026 (B5), also the offline country lookup in place of the geocoder's Nominatim requests (W-27);
   6. W-36 with W-02 and W-06: the observation rule and the expiry policy;
   7. W-35: the reader interface;
   8. W-38: the public job-feed readers, in the survey's order (amended 7 November 2026, below): Workable and Greenhouse, then Teamtailor, Lever, Personio and Ashby;
   9. A2: parsing off the event loop, or parsing each deadline once if the user chooses that instead (security plan, stage 2), before twice-daily crawling;
   10. W-39: completeness for every source, the daily crawl-health message, and the crawl-frequency targets (decision 13);
   11. W-42: the title-facts module on the server.
5. **Admin before launch** (W-40): the add-source flow (paste a careers address, the system is detected, one approved fetch, a report of which fields are filled, then admit) and crawl review (parts of UX-19 and UX-20).
6. **Sources, added gradually,** in survey order, with more readers (amended 7 November 2026, below: Workday first, then SuccessFactors, iCIMS, Jobvite, BambooHR, Taleo, Oracle and Cornerstone; W-41 ReliefWeb and the UN careers RSS feed), until there are about 2,000 open jobs for the launch (decision 6, changed 3 November 2026), and more after it. The paid Render plan when a signal in section 8 appears.
7. **The public site and launch:** server-side search and paging (UX-11, W-18); the rest of Stage B (UX-12 to UX-17, UX-26 to UX-28); job pages (UX-24) and the first landing pages (UX-25); About, Privacy, and the opt-out route (UX-27); the switch (UX-29); the launch check with `aidjobs.app`, Search Console, and Bing (UX-18).
8. **After launch:** employer submissions, then alerts (each a §2 decision); the rest of Stage C (UX-19 to UX-21); more landing pages and guides; non-English Europe; feeds and partner widgets; the hiring report.

**Amendment of 7 November 2026: the rest of step 4, and the readers in the survey's order** (the agent's plan after step 4.1, the B4 audit, and the employer survey's step F; approved by the user on 7 November 2026). Each step below still brings its own detailed plan for approval before it is built.
- **Step 4.2** is two pull requests. The first is W-34 inside the fetch policy (a security boundary, with an independent review). It includes B4's defect: a first page answered with any 2xx other than 200, or with a challenge, is a refusal. Before it merges, one approved `robots.txt` request per live source, so the new check cannot stop UNICEF, ICRC or Oxfam GB unnoticed. The second is W-44 with its C3 amendment (independent review). Status, 7 November 2026: the detailed plan approved by the user and reviewed independently; the first pull request built (ledger, W-34). Done, 8 November 2026: both merged (PR #116 and PR #117) and live-checked (ledger, W-34 and W-44).
- **Step 4.3** (W-04): built on 8 November 2026 as the PageUp career-site reader, the platform UNICEF's listing pages show (this plan calls it Clinch, the name on UNICEF's firewall page), chosen by page structure and asking 100 jobs a page; merged after the scheduled UNICEF crawl of 9 November 2026, then checked by one manual crawl (ledger, W-04). Done, 8 November 2026: merged as PR #118 after the user's baseline crawl, and the manual crawl read all 270 jobs, complete (ledger, W-04).
- **Step 4.4** (B5, W-10): done, 8 November 2026. The fetch policy was checked on the deployed backend without a crawl, through the admin's link validation (crawler plan, "B5 record"). One completion line stays open by the user's decision: the geocoder's Nominatim requests bypass the policy until step 4.5 replaces them with the offline country lookup (ledger, W-27 and W-37).
- **Step 4.5** (W-37, with W-27): investigated on 8 November 2026, read-only, starting with the production schema check (contract §15); two pull requests, the order left to the agent by the user: first the offline country lookup in place of Nominatim (no schema change; city never guessed from the text; no single country when several are named, the user's decisions), then, after a manual backup (W-43) and the migration applied by the user, the new columns and their capture. Pull request 1 merged as PR #124 and live-checked on 9 November 2026 (ledger, W-37); B5's last completion line is met. Pull request 2, the migration (`infra/migrations/w37_captured_fields.sql`: `description`, `posted_on`, `locations`, `advert_language`) and the capture, planned and approved on 9 November 2026 with the user's choices: the advert language only when the advert itself declares it, never the whole page's; `description_snippet` left empty, so search and quality grades are unchanged; the 90-day drop of descriptions built with step 4.6 (ledger, W-37). Done, 10 November 2026: the migration applied by the user after a backup, PR #130 merged and live-checked by the user's crawls of the three sources (ledger, W-37).
- **Step 4.6** first moves the completeness report onto the crawl run (B4 record), then the observation path and expiry, with a read-only list of what would expire before expiry is switched on. It also drops each stored description 90 days after its job closes (section 4.4), due before 1 February 2027, before any job closing after 9 November 2026 is 90 days closed (the user's decision, 9 November 2026). Investigated read-only and planned on 11 November 2026; the plan and three decisions approved by the user the same day (section 4.3, amendment of 11 November 2026; ledger, W-06): three pull requests in order. First, the run's completeness record and whether it counts, with the migration `infra/migrations/w06_crawl_run_lifecycle.sql`; nothing is expired (PR #135; its follow-up, PR #136, measures a crawl against the jobs the policy treats as open). Second, the observation path and job pages opened only for new jobs (W-36, W-09), up to 40 a crawl, known jobs' pages reopened within 3 days of their deadline either side and in a rotation of one crawl in seven. Then the read-only list (`scripts/expiry_preview.py`) after two crawls that count, at least 24 hours apart; third, expiry switched on: by absence in the run's finish, the return on sight in the writer, and a daily pass for passed deadlines and the 90-day description drop. Pull requests 1 and 2 are merged (PRs #135, #136, #138). On 12 November 2026 no run counted yet; UNICEF's runs were expected to start counting around 15 or 16 November, once enough of its old-link copies pass their deadlines (ledger, W-06). By the user's decision that day, pull request 3 and the preview are built in the meantime and merged only after the preview. Built on 12 November 2026 (PR #145, no migration). The 12 November gate was two counting UNICEF runs and the preview; on 15 November 2026 the user changed it to merge after the preview alone, because no run had counted (W-55's old-link copies) and absence expiry stays inert until crawls count. Merged the same day as `45505aa` (content head `a160431`); the daily pass expired 545 jobs by passed deadline on live check; step 4.6 is done (ledger, W-06).
- **Step 4.7** (W-35): investigated read-only and planned on 14 November 2026; the plan approved by the user after an independent review and a re-review. Four pull requests: the interface with the HTML readers behind it and no behaviour change; the canary; the admin's simulation through the crawl's own readers with the v1 API schema, the presets and two unused diagnostics routes removed (W-33); after PR #145, the RSS and JSON readers and one save step for all three types. The contract §10 amendment for readers recognised from a recruitment system's address comes with step 4.8's plan (ledger, W-35). Pull request 1 merged as PR #154 (`4280a64`) on 13 November 2026 and live-checked on 14 November 2026: the three crawls each named their reader in `extraction_logs` (ledger, W-35). Pull request 2, the canary (notes only), merged as PR #160 (`6b2e658`) on 15 November 2026; Oxfam GB and ICRC canary paths live-checked the same morning; Sites canary on UNICEF still waits on its next crawl (~18 November UTC) (ledger, W-35). Pull request 3a (Simulate extraction and W-33 cleanup) merged as PR #167 (`800e29d`) on 15 November 2026; Render live on `800e29d` (the user, 15 November 2026 IST). Pull request 3b (RSS feed and JSON API readers behind the interface; one shared save step) merged as PR #171 (`3d4312d`) on 15 November 2026 at the approved head `9278347`; CI green on `main`; Render live on `3d4312d` (the user, 20 November 2026) (ledger, W-35). Step 4.7's four pull requests are merged; Sites canary on UNICEF and the signed-in Simulate live check remain open.
- **Readers, ordered by the survey's step F** (`source-survey/step-f-systems.csv`: first batch, organisations and UNjobs jobs):
  - **Step 4.8, the public job feeds, all GET requests:** Workable (8, 157) and Greenhouse (6, 141) in one pull request; then Teamtailor (5, 81), Lever (1), Personio (1, 13) and Ashby in a second. The first batch found no employer on Ashby, though step E's guesses had one. Its reader is built in that second pull request when step F's batch 2 slices, read alongside the foundation, confirm an employer on it; otherwise it waits for step 6 and the first such employer.
  - **Step 6 starts with Workday** (20, 1,225), the largest system: first the fetch policy's POST support (its own reviewed pull request, contract §9), then the reader. Then SuccessFactors (10, 275; ICRC is already live through the general reader), iCIMS (14, 233), Jobvite (2, 250), BambooHR (12, 117), Taleo (8, 110), Oracle (4, 99; any request other than GET needs its own decision, §9) and Cornerstone (3, 75).
  - **Own-site employers** (63, 900) need no reader of their own: they go through the general reader and the add-source flow (W-40), with completeness from W-39.
  - **Not crawled while their `robots.txt` forbids it:** SmartRecruiters' public API (3, 145) and Dayforce (3).

Rejected alternatives: launching first on today's three sources (the user chose to launch with thousands of jobs, and job pages without descriptions or dates would be indexed); building the public site alongside the crawler (page templates need the new fields, so it would mean rework); moving the survey before the security stages (it needs this record's wider scope first, and would mix two streams of approvals).

## 8. Hosting, storage, and cost signals

Free plans now; the code works on both.

**Move to the always-on Render instance (about $7 a month) when any of these appears:**
- sources are regularly more than about 24 hours overdue because the backend was asleep;
- new jobs take more than a day to appear;
- Render emails about traffic or memory, or a crawl stops for lack of memory;
- launch approaches with many sources.

A keep-alive monitor every 5 minutes (UX-08 item 5) was skipped by the user until after launch (21 October 2026); using it earlier is the user's decision. It works only while this is the workspace's one free web service, and it delays the paid plan but adds no memory.

**Supabase:** free now. A manual database backup (`pg_dump`, run on the user's machine) weekly and before every database change, through the read-only login since 13 November 2026 (security plan, stage 6; README, "Secrets on this machine"). The connection string stays in the vault and is never printed, and the `pg_dump` client must be at least the server's version (PostgreSQL 17). Move to Pro (about $25 a month) at about 400 MB, or when backups need to be automatic. Expected size: thousands of jobs with descriptions, roughly 40 to 80 MB; at full scale about 1 GB a year without the 90-day description rule (decision 5).

**Vercel:** Hobby stays valid while there are no ads and no income other than donations.

## 9. Measurement

- **Coverage:** employers covered against the survey list; jobs per employer against the employer's own count and UNjobs' count; time for a new job to appear and a closed job to leave; field fill rates per source.
- **Search:** pages indexed, impressions and clicks, job-listing appearances, positions for a fixed set of target searches checked monthly, Core Web Vitals, referring domains (Search Console and Bing Webmaster Tools, from launch).
- **Product:** clicks through to employers, returning visitors, and after launch, submissions and alert subscribers.

## 10. Still open, for later decisions

- W-33: direction updated on 30 October 2026 (ledger W-33): fixed together with the reader interface (W-35), with no separate "plain public JSON" step.
- Workday's POST search under §9: decided by the user on 6 November 2026 (contract §9, amendment of that date).
- Stage 6 implementation timing.
- Employer submissions, alerts, and accounts (§2), after launch. The employer side is designed first as a demo that is never merged (W-51, `employer-side-plan.md`, 3 November 2026).
- Landing-page thresholds, closed-page timings, and the exact heading words, in their steps' plans.
- Languages after English, and their order.
- How the daily crawl-health message is delivered (email needs a provider and a secret), in W-39's plan.
- How job and landing pages are refreshed after crawls (an on-demand refresh route needs a secret and touches security stage 4), in UX-24's plan.
- Redirecting a replaced job's old address through `jobs.duplicate_of` (a database-write decision), in UX-24's plan.
- Whether the Gate 8 migrations are already applied in production: they are not (no `organisations` table and no `jobs.organisation_id`; Verified, read-only, 8 November 2026, ledger W-37).
- A2 itself, or parsing each deadline once instead, recorded as a decision for the user in the security plan (stage 2); placed in step 4.9.
- Cost: launching with server-side search needs the always-on Render instance (about $7 a month) at launch (section 4.5).
