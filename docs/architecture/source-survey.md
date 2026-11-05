# Employer survey (W-31)

**Status: in progress.** Step A (this file and the seed lists) done on 3 November 2026. Step B (candidates from public registers) done on 4 November 2026 (below). Step D (one ranked list of organisations) built on 4 November 2026 (below); step C waits for ReliefWeb's `appname`. Step E (likely careers pages and recruitment systems) in progress since 5 November 2026 (below). The survey is read-only: no source is added, nothing is crawled, no database is touched. Each step has its own approval and pull request. The rules and the plan's place in the order are in `progress-ledger.md` (W-31) and `security-hardening-plan.md` (stage 8).

## Purpose

Find every relevant employer's careers site and group the sites by recruitment system, so the crawler's readers can be built in the order that covers the most jobs (W-38 onwards). The unit of record is one careers site: an affiliate or national office with its own site is its own record, and organisations that share one site (probably the UN Secretariat offices on `careers.un.org`) are one record.

## Target (the user's decision, 4 November 2026)

International development and aid organisations, and major national organisations, that hire regularly and are most likely to pay to advertise jobs. The user set the target and income as a cut-off, and left the rest to the agent, who decided:
- **In:** UN agencies and other intergovernmental bodies; bilateral agencies (for example GIZ, AFD, JICA, Enabel, SIDA, KfW); international NGOs; major national NGOs (for example BRAC); development consultancies that hire for aid projects (for example DAI, Chemonics, Palladium); large foundations that fund development.
- **Out:** hospitals, universities, colleges and schools; companies outside aid (Zipline, Mozilla, Euroclear, Control Risks); small local charities without aid work. Church-run aid agencies (for example Catholic Relief Services, World Vision) stay in.
- **The 19 proposed NGOs** (seed additions) stay in: all are aid organisations.
- **Ranking:** hiring evidence first (jobs on UNjobs, later ReliefWeb), by job count; then income.
- **Other open decisions settled by the agent:** a provisional keyword set (UN, NGO, nonprofit, charity, humanitarian, international development); no paid search service (Common Crawl's index and the agent's own search, step E); the step F script follows the backend's fetch policy; UNjobs names and job counts are kept.

## Seed lists (step A)

Saved from the user's lists of 26 October 2026, which until now existed only in a chat. Counted from the saved files on 3 November 2026; the counts match those recorded on 26 October.

| File | Source | Entries | Jobs shown |
| --- | --- | --- | --- |
| `source-survey/unjobs-un-organisations-2026-10-26.csv` | UNjobs "UN and Intergovernmental Organizations" (`unjobs.org/organizations`), as read on 26 October 2026 | 108 (107 distinct: UNICEF twice) | 2,052 |
| `source-survey/unjobs-non-un-organisations-2026-10-26.csv` | UNjobs "Non-UN and other International Organizations" (`unjobs.org/non-un-organizations`), pasted by the user because the site serves a Cloudflare challenge to scripts; UNjobs' advert lines removed | 539 (535 distinct) | 7,326 |
| `source-survey/seed-additions.csv` | The 12-employer sample (`growth-and-seo-plan.md`, section 2.3) and the 19 possibly missing NGOs (W-31) | 31 | — |

**Columns** of the two UNjobs files: `position` (order on the page), `name_as_shown`, `unjobs_jobs`, `kind`, `duplicate_of`, `note`.
- `kind`: `un-or-intergovernmental` or `un-secretariat (likely)` on the UN page (35 entries whose names are departments, offices, commissions or missions; whether they all post on `careers.un.org` is not checked); on the non-UN page `non-un` (492), `intergovernmental` (26), `government agency` (10), `un-secretariat (likely)` (9 UN offices filed there), `on the UN page too` (The Global Fund, BIPM). The kinds are a first sort for the survey, not checked against each organisation.
- `duplicate_of`: the same organisation listed again (UNICEF; Conciliation Resources, Prosper Global, Norwegian Refugee Council and Antora Energy on the non-UN page; the two entries also on the UN page).
- `note`: entries kept separate on purpose (RAND Corporation and RAND Europe, Oxfam and Oxfam Novib, Citizen Lab and CitizenLab) and the four non-aid entries for the user's decision (Zipline, Control Risks, Mozilla, Euroclear).

**UNjobs' job counts are a benchmark only:** they may include old postings, and each employer's own site gives the real count. Only names, counts and the page they came from are kept; UNjobs' pages are not read by any script (its terms forbid automated access; the user copied the lists by hand). Keeping the counts, rather than names only, is the agent's recommendation and the user's decision (open decision 5 below).

In the non-UN list the 37 largest entries hold just over half of the jobs (3,701 of 7,326; the estimate of "about 25" made on 26 October was low). The largest: International Rescue Committee 671, Zipline 346, Mercy Corps 211, Médecins Sans Frontières 197, International Potato Center 145, Control Risks 126, Mozilla 123, Euroclear 102, World Wildlife Fund 100, ACF International 93.

## Steps

Each step needs the user's approval. Employers' own sites are first contacted in step F.

| Step | What | Contacts |
| --- | --- | --- |
| A | Seed lists and this file | None (done) |
| B | Candidate organisations from open data: IATI Dashboard, IRS, UK Charity Commission, OSCR, ACNC, CRA, EU Transparency Register, filtered by the target and an income cut-off | Downloads from the publishers' servers (built, below) |
| C | ReliefWeb: organisations, websites, job counts per organisation (a few dozen requests) | ReliefWeb's API, with the user's `appname` |
| D | Duplicate removal and ranking: website domain, then IATI ID, then cleaned name and acronym; uncertain matches to a review list for the user, nothing merged automatically; ranked by hiring evidence, then income | None |
| E | Likely careers pages and recruitment systems, from Common Crawl's public URL index (per domain, and by recruitment-system host patterns) and the agent's web search for the top unresolved organisations | Common Crawl's index files, one request every 10 seconds (the user's decision of 5 November 2026); Wikidata's query service (in progress, below) |
| F | Confirmation, at most two spaced requests per organisation (`robots.txt`, then the careers page or the vendor's documented public job API), in batches such as the top 300 | Employers' sites: its own approval |
| G | Output: careers sites grouped by recruitment system, ranked by jobs covered, with keyword families and each system's fields and reuse terms; the master CSV; the ledger | None |

Scripts for steps B to F go in a new `tools/survey/` folder that the backend never imports, run on the user's machine (Python 3.11). Raw downloads stay in a git-ignored folder; only cleaned results are committed.

## Candidates from public registers (step B)

`tools/survey/registers.py download` fetches 15 public files and IATI's organisation list (2,132 organisations) into `tools/survey/raw/` (git-ignored), one at a time, with an honest identity (`AidJobsSurvey/0.1 (+mailto:aidjobz@gmail.com)`), recording each file's size and checksum; `build` filters them and writes `source-survey/register-candidates.csv` and `source-survey/register-counts.csv`. Run on 4 November 2026; the registers' extract dates are those of that day (IRS posted 13 October 2026; CRA's list is the 2024 returns; ACNC's income is the 2023 statements; the EU file is the June 2026 export).

**Filters, per source:**

| Source | In the target when | Income |
| --- | --- | --- |
| IATI | organisation type government, other public sector, NGO (international, national, regional, partner-country), public-private partnership, multilateral or foundation; private sector kept and marked for review (development contractors and investors); academic and other dropped | none (all kept) |
| IRS (US) | NTEE major group Q (international, foreign affairs), without domestic national security (Q43) and exchange programmes (Q21 to Q23) | revenue, US$5m |
| UK Charity Commission (England and Wales) | registered main charity classified "Overseas aid/famine relief" (code 106) | latest income, £2.5m |
| OSCR (Scotland) | active, and geographical spread "Overseas only", or "UK and overseas" with aid work abroad in its stated objectives (for example "developing countries", "humanitarian", "throughout the world") | most recent income, £2.5m |
| ACNC (Australia) | operates in a country other than Australia (register), or ran programmes overseas (2023 statement) | 2023 total revenue, A$5m; with no statement, kept if the register says Large (A$3m or more), marked |
| CRA (Canada) | carried out programmes in another country (schedule 2), or answered yes to activities outside Canada (T3010 line 2100), which covers agencies working through partners | 2024 total revenue (line 4700), C$5m |
| EU Transparency Register | non-governmental organisation with "development" or "humanitarian aid" among its interests | none in this register (all kept) |

In every source, names that say hospital, university, college or school, with singular and plural forms in English, French, Spanish, Italian, German and Dutch (also "health sciences", "health system", "polytechnique"), are dropped: 689 in all, at any income (`excluded_by_name` in the counts), for example the University of Alberta, Université de Montréal, the American Hospital of Paris and Hamilton Health Sciences. Aid organisations with such words in their names are kept by name, each checked: World University Service of Canada, United World Schools, Haiti Hospital Appeal (that name only), Promoting Equality in African Schools, Baylor College of Medicine Children's Foundation Malawi. Mission hospitals stay out (hospitals are outside the target).

**Counts** (`register-counts.csv`; "in target" before the name filter):

| Source | Records | In target | Lower cut-off | Recommended | Higher cut-off |
| --- | --- | --- | --- | --- | --- |
| IATI | 2,132 | 1,894 | — | 1,887 (no income) | — |
| IRS | 1,975,975 | 20,205 | 1,084 at US$2.5m | 674 at US$5m | 431 at US$10m |
| UK | 171,919 | 9,246 | 549 at £1m | 307 at £2.5m | 192 at £5m |
| OSCR | 22,617 active | 769 | 120 at £1m | 88 at £2.5m | 57 at £5m |
| ACNC | 65,979 | 4,051 | 281 at A$2.5m | 174 at A$5m | 94 at A$10m |
| CRA | 83,761 | 5,103 | 619 at C$2.5m | 378 at C$5m | 215 at C$10m |
| EU | 17,424 | 2,801 | — | 2,780 (no income) | — |

The candidate list at the recommended cut-offs has 6,349 rows (with 61 Australian charities whose income is not reported but whose size is Large), before duplicates are removed: the same organisation often appears in several sources (for example Oxfam in the UK register, OSCR, IATI and the EU register). Duplicate removal and ranking are step D. The record totals match each publisher's own figure (IATI's API count, the IRS page's 1,975,975, the EU file's declared 17,424); OSCR's file has 24,982 rows, of which 22,617 are active (the others "Not Submitted" or "Not Monitored"); ACNC's 65,979 leave out 614 lines that continue a quoted field.

**Known gaps and noise, for step D:**
- **Large US aid organisations outside group Q:** for example Samaritan's Purse (X20), Partners In Health (E70), GiveDirectly (P60), Internews, the International Republican Institute and IntraHealth, and Population Services International and Smile Train, which have no NTEE code (12,801 organisations at US$5m or more have none). They are found through IATI, UNjobs and ReliefWeb in steps C and D.
- **Canada, line 2100:** 102 of the Canadian candidates qualify by line 2100 alone; most are aid agencies working through partners, but some are not (YMCAs, dioceses, Special Olympics, the Terry Fox Foundation). Step D's ranking puts hiring evidence first.
- **Scotland:** about a third of the "UK and overseas" candidates at the recommended cut-off are not aid agencies; a generic phrase in their objectives ("throughout the world", "overseas", "abroad") matched: churches and religious bodies (for example the Church of Scotland), arts and research bodies (the Royal Scottish National Orchestra, Moredun), professional bodies, Dogs Trust, the British Council. Dropping those phrases would also drop real aid agencies that match only on them (Christian Aid, WaterAid, UNICEF UK, the British Red Cross), so step D sorts them. English charities registered in Scotland too repeat the UK list.
- **Name filter casualties to check in step D:** School for Life Foundation Australia (schools in Uganda, A$4.8m) and Royal College Canada International (C$10.4m), both below or near the cut-off; CHESTRAD International (UK, under £20k).
- **IATI:** one organisation ID (`NL-KVK-30285304`) is used by two publishers (Stichting Humana and Sympany+).

**Spot checks** (well-known agencies, at the recommended cut-offs): present: International Rescue Committee, Mercy Corps, CARE USA, Save the Children (US and UK), World Vision (US, Australia, Canada), Oxfam (UK, Australia, Canada), Christian Aid, Plan International Canada, GIZ, the UK's Foreign, Commonwealth and Development Office, UNICEF national committees, CARE International. The first build missed four; each was fixed: Australian charities listing only Australia counted as overseas (the filter now needs another country); Oxfam Australia has no 2023 statement (now kept by its size band); World Vision, Plan International and CARE Canada work through partners and are not in schedule 2 (now also line 2100). Mercy Corps Europe is not on Scotland's register (correct). After the independent review the name filter, the US and Scottish filters and the blank Australian lines were corrected (see the review in the pull request); SCIAF (Scotland's Catholic aid agency) was checked to stay in.

**Each row** (`register-candidates.csv`): source, the source's own ID, name, country, kind (type or category), website domain (IRS has no website), income and currency, income year, whether it meets the recommended cut-off, and a note. Nothing else is read from the files: no emails, phone numbers, addresses or people's names.

## One ranked list of organisations (step D)

Plan approved by the user on 4 November 2026, after asking how thorough it was and on what basis each point was decided (answered from the data measured first and the decisions already recorded). `tools/survey/dedupe.py` reads the committed files only (no network): the 6,349 register candidates, the 647 UNjobs entries (108 on the UN page, 539 on the other) and the 31 seed additions, 7,027 records, with the decisions in `source-survey/step-d-decisions.csv`. It writes `source-survey/organisations.csv`, one row per organisation, and `source-survey/step-d-review.csv`, the pairs still awaiting a decision (none). CI rebuilds the list and fails if the committed one differs.

**Joined automatically, when certainly the same organisation** (joins that merged two groups, by rule):
- the same registry number: an IATI identifier carrying a UK, Scottish, US, Canadian or Australian register number (`GB-CHC-1047501` is UK charity 1047501; US EINs with or without a hyphen) (130);
- the same website, in the same country, with compatible names (similar words, or one is the other's acronym) (172); hosts shared by unrelated bodies (`gov.uk`, `facebook.com`, `sites.google.com`, `un.org`, `who.int` and others) never count as evidence, though one can still be shown as an organisation's website (`who.int` for WHO);
- the same name in the same country, after case, accents, punctuation, legal forms ("Inc", "Ltd", "Stichting") and acronyms in brackets are set aside, and "UN" read as "United Nations"; a country in brackets stays part of the name, so "Médecins Sans Frontières (UK)" is the UK section (46);
- the same acronym and a similar name where the countries do not differ ("WFP - World Food Programme" and "United Nations World Food Programme (WFP)") (12);
- a UNjobs entry or seed addition with the same name as records in one country only (192), or as another UNjobs entry or seed addition (18); UNjobs' own repeats (4).

**National affiliates stay separate, as one family:** records with the same website or the same distinctive name in different countries are kept apart (each usually has its own registration and careers site, the survey's unit of record) and given a family name taken from the words they share, or else the strongest member's name: 71 families (for example ActionAid, Save the Children, World Vision, WaterAid), and the UN Secretariat's departments and offices on UNjobs' UN page, which hire through one site, as the family "UN Secretariat (careers.un.org)" (44 organisations); 208 organisations in families in all. A recorded family decision renames a whole family or, as "none", removes it (three donor governments' foreign ministries are not one family).

**Decided by the agent, each with its reason** (`step-d-decisions.csv`, 807 decisions, the user spot-checks a sample):
- **120 joins** the rules could not make: a UNjobs entry or seed addition and the organisation it names, usually its headquarters (ACTED, MSF International in Geneva, the ICRC, Save the Children International, CIFF, FHI 360, whose legal name is Family Health International, Humanity & Inclusion, which IATI lists as the Handicap International Federation, Médecins du Monde France); the organisations' own US registrations (the ICRC, IITA, CIP, IISD, the Mastercard Foundation, the World Economic Forum and Chatham House); the same organisation registered twice under different names (Cesvi; ICCO, which merged into Cordaid; THET, now Global Health Partnerships).
- **232 kept apart:** 45 pairs are different organisations (the Asia Foundation and the Asia Society; charity: water and Water.org); 180 are a separate national member, arm or fund of one network; 7 undo or prevent a join to a country office or a national registration (Kvinna till Kvinna's Jordan office, Partners In Health's Malawi office, Samaritan's Purse's Cambodia office, Médecins du Monde Canada, World Vision's US registration twice, NIMD's Central America office).
- **4 names and 13 family labels:** Mercy Corps has operated as Prosper Global since 9 September 2026 (its announcement; the same organisation and legal identity), shown as "Prosper Global (formerly Mercy Corps)"; three foreign ministries named with their countries; the network's name for the ActionAid, CARE, Amref Health Africa and World Vision families.
- **438 records excluded** as outside the target, with the reasons counted: churches, religious orders and religious bodies 126; donor funds and family or members' foundations that do not run aid work ("American Friends of …", donor-advised funds) 52; domestic social, youth and sport services (YMCAs, Age UK, Junior Achievement chapters) 39; missionary and evangelism bodies 36; companies outside aid (climate, software and finance companies on UNjobs' list, among them Zipline, Control Risks, Mozilla and Euroclear) 32; bodies working mainly on domestic issues in one country (US domestic policy institutes, for example) 31; industry, professional, standards and internet bodies 30; universities, colleges and schools, or parts of one (the user's rule) 21; science and space bodies 17; domestic health and medical research 16; arts, heritage and zoos 12; central banks and financial, food-safety or measurement bodies (the ECB, BIS, BIPM) 6; domestic environment 5; government bodies that report aid spending but do not run aid work 5; hospitals and health services (the user's rule) 4; political movements 2; lobbying and media monitoring 2; animal welfare 2. Reviewed by hand: every UNjobs entry, the Scottish "UK and overseas" candidates and the Canadian line-2100-only candidates (the noise step B recorded), the top 300 of the income tier, and every name that signals a category outside the target (245 matches). Kept when unsure, and kept when the work is aid: church development bodies in aid countries (Ethiopian Orthodox DICAC), faith-based agencies (Compassion, Tearfund, World Relief), national YWCAs in aid countries, donor ministries (bilateral agencies), international think tanks and environmental organisations.

**Ranking:** hiring evidence first (UNjobs job count; ReliefWeb's counts join in step C), then income in US dollars (Federal Reserve G.5A, 2024 annual averages: £1 = $1.2781, A$1 = $0.6597, C$1 = $0.7300; used only for ordering), then the rest by name.

**Result:** 5,915 organisations: 539 with hiring evidence (7,918 UNjobs jobs), 1,185 ranked by income, 4,191 listed only (mostly the IATI and EU entries, which carry no income); 4,487 with a website; 504 drawn from two or more sources. The top: International Rescue Committee (671 jobs), Prosper Global (formerly Mercy Corps) (234), UNICEF (227), Médecins Sans Frontières (197), IOM (173), FAO (147), the International Potato Center (145), UNDP (131), WFP (105), WWF (100). Each row: rank, an ID (its main record), name, acronym, family, kind, country, website, UNjobs jobs, income in dollars and where it comes from, the kind of evidence, every source record, and notes.

**Independent review** (head `67ead74`): request changes, all taken. It read all 476 multi-source groups and found 3 wrong joins (about 0.6%; World Vision's seed joined to its US office, two Mouvement Européen branches, three Junior Achievement chapters), and about 30 missed duplicates in the top 600, among them seven UN agencies, because register names keep their acronym in brackets ("(WFP)") and "UN" was not read as "United Nations". Both are now handled in the code (acronyms read from every register; the acronym rule; a suggestion when a UNjobs name is a register name plus a country), and each missed pair is joined by rule or decision. Also taken: the six US registrations joined, more exclusions from the income and hiring tiers, the website column (shared hosts as a fallback; junk values dropped), names recased only from the registers that write in capitals, family labels, the join counts above (merges, not attempted pairs), and the UN Secretariat family. The re-review (head `a5c2e7e`): approve with changes; every earlier item confirmed resolved, the 12 joins of the acronym rule all correct; its changes taken: three more duplicates (People in Need, IFPIM, the Fossil Fuel Treaty) and Chatham House's US registration joined, 21 more exclusions from the income tier's top 300, the family labels above, and Australian and Scottish names recased.

**Limits:** the listed-only tier (4,191, mostly the EU register's development NGOs and IATI publishers) was reviewed only by the name scan, not one by one; it ranks last and steps E and F will show which hire. Income is a register's latest year (2023 to 2025), converted at 2024 rates. Some international organisations are absent from the registers (Partners In Health's and Samaritan's Purse's head offices, outside the IRS group Q); they appear from UNjobs without income.

**Other job boards, checked read-only on 4 November 2026** at the user's question, for more hiring evidence: none allows its employer data to be collected for another job site. Devex's user agreement forbids using the service to build a competing product; Impactpool's terms forbid scraping or copying platform data without permission; DevelopmentAid's daily limits exist "to prevent automated data extraction" and its API is for internal use only; DevNetJobs forbids reproducing its content without permission (and charges international organisations to post); UN Talent forbids copying or reproducing its material; Idealist forbids recording information about the service; CharityJob grants a limited licence for normal use; Bond's job board (every advert paid) allows reuse only with its consent; Guardian Jobs closed in October 2026. Decided by the user: no data from these boards, and no permission request for now. Hiring evidence comes from UNjobs (copied by hand by the user), ReliefWeb's API (step C) and employers' own sites (step F).

## Likely careers pages and recruitment systems (step E)

**In progress: paused for the day on 5 November 2026**, when Common Crawl refused two requests in a row (below). The committed outputs are a snapshot from part of the index and are rebuilt when the download finishes; the figures below are that snapshot's.

Plan approved by the user on 5 November 2026 (the recommended choices). `tools/survey/careers.py` has three commands: `download`, run on the user's machine; `extract`, which turns the raw downloads into a small committed extract (no network); and `build`, which turns the committed files into the outputs (no network; CI runs it and fails if the committed outputs differ). No employer's website and no recruitment system's page is contacted; that is step F. Scope: the 1,724 ranked organisations (hiring evidence or income).

**Method:**
- **Websites first**, for the organisations without one: Wikidata, by the identifiers the survey holds (US EIN, UK and Scottish charity numbers, Canada's business number, Australia's ABN and charity ID, IATI and EU Transparency Register IDs; the eight properties checked on 5 November 2026), then by exact name, which is never accepted automatically; then the agent's web search for the top 600 still without one, marked "unverified (search-engine copy)", search results only (no site opened).
- **Common Crawl's URL index, read as files** from `data.commoncrawl.org`, not through its query server: a crawl's table of contents (`cluster.idx`), then only the index blocks that may hold the wanted addresses, by HTTP Range requests. Two readings: every account of 16 recruitment systems whose accounts carry a name (Workday, Greenhouse, Lever, Ashby, SmartRecruiters, Jobvite, iCIMS, BambooHR, Workable, Pinpoint, Teamtailor, Recruitee, Personio, Avature, Taleo, Zoho Recruit); and each organisation's website, whole when it fits in four index blocks, otherwise only its careers-like paths and subdomains (careers words in 13 languages). 14 more systems (Oracle, SuccessFactors, UKG, Cornerstone, PageUp, Webcruiter and others) are recognised when an organisation's page redirects to them.
- **`extract`** keeps careers-like pages on each organisation's own site (the landing page, its status, any redirect, how many pages below it answered) and the system accounts whose name could match an organisation; hosts and paths only, query strings dropped, no page content.
- **`build`** rates each candidate. High: the organisation's careers page redirects to a recruitment system, or it answered and is at most two levels deep; or an account carries the full name (8 letters or more) or is the one the organisation's own page redirects to. Medium: a deeper or redirecting careers page, or pages below it that answered; an account named after the website (6 letters or more); anything on a host shared by unrelated bodies. Low: a careers address that did not answer; a shorter website name. The UN Secretariat family's offices get `careers.un.org`. **Never automatic, sent to review:** an account matching only an abbreviation; one account matching two or more organisations; and an account in another system than the one the organisation's page points to, or accounts in two systems.
- **Decisions** (`step-e-decisions.csv`, each with its reason, as in step D): 186 on Wikidata's matches (171 accepted, 15 rejected); 112 websites from the search (110 found, 2 none); the 66 account matches to review in the top 600 (40 accepted with a confidence, 26 rejected). Rejected, for example: `Workday:primerica` matched Penal Reform International only through a site named "PRI"; `Taleo:inl` is Idaho National Laboratory's, not the State Department bureau's; `Workday:bloomberg`'s site is Bloomberg Industry Group's. The account decisions rest on the account's name, its captured site names and capture counts, and what is known of the organisation; none was opened.

**Terms checked (5 November 2026):** Common Crawl's [terms of use](https://commoncrawl.org/terms-of-use) (last updated 7 March 2024): a limited licence; no interfering with or disrupting the service or its servers; no collecting personal information for use apart from the crawled content; crawled content may be subject to its owners' terms. The survey keeps only hosts and paths of careers pages and accounts, no content and no personal data. Wikidata's data is CC0; requests follow Wikimedia's User-Agent policy (contact details and "bot" in the identity), one every 5 seconds.

**Requests made** (every one logged in `tools/survey/raw/*/requests.log`, git-ignored), with an honest identity:
- Wikidata: 32 queries, all answered.
- Common Crawl: 390 requests on 5 November 2026: 152 answered, 212 refused with 503 "SlowDown", 26 connections dropped. The first run read the last three crawls (2026-43, -39 and -34) at about one request a second, and the data server refused 208 of 374 requests. **The user decided the same day:** read only the latest crawl, CC-MAIN-2026-43; wait 10 seconds between requests; pause for the day after repeated refusals: the tool now stops itself after two refusals in a row, and at once on a 403 (none seen). Resumed at 15:38 IST: 16 requests, 11 answered, 4 refused, 1 dropped; two refusals in a row at 15:41 IST stopped it for the day. The older crawls' partial files are kept but not read.
- **Downloaded so far** from CC-MAIN-2026-43: the table of contents; all 16 systems (21,325 accounts seen, 402 whose name could match an organisation); 81 of the 1,282 websites, in rank order.

**Coverage in this snapshot** (each organisation by its best candidate):

| Organisations | High | Medium | Low | None yet | Without a website |
| --- | --- | --- | --- | --- | --- |
| Top 600 | 81 | 115 | 30 | 374 | 38 |
| All 1,724 | 106 | 123 | 37 | 1,458 | 420 |

The top 600's best guesses by system: own site, system not yet known 52; `careers.un.org` 44 (the UN Secretariat family); BambooHR 39; Workable 24; Workday 17; Greenhouse 15; iCIMS 12; Personio 5; SmartRecruiters, Jobvite, Recruitee and Taleo 3 or 4 each; Lever, Avature, Zoho Recruit and Teamtailor 1 each. Most organisations without a candidate are those whose websites are not read yet. Of the 38 top-600 organisations without a website, 36 are UN Secretariat offices that hire through `careers.un.org`, and 2 have none: SALT International (UNjobs' listing appears to be The Nature Conservancy's Salt Lake City jobs, mislabelled) and The CH Foundation (UK), a grant-maker with no website.

**Unresolved:**
- 1,201 websites not yet read from the index (478 of them the top 600's); at one request every 10 seconds and with Common Crawl's refusals, several more days. **The user decided on 5 November 2026:** if the first run on 6 November again stops within minutes, read only the top 600's websites (`download sites --top 600`); step F finds the other organisations' careers pages when it contacts their sites.
- The next search batch: the 382 organisations ranked 601 to 1,724 still without a website; approved by the user on 5 November 2026 and in progress.
- 95 review rows below rank 600.
- Found by the search to be outside the target or doubtful, for step G: Albo (a Mexican fintech company), CitizenLab (renamed Go Vocal, civic software), Sunflower Services (back-office services for US nonprofits), GoodPower (US renewable-energy advocacy, formerly the Alliance for Climate Education), and Land O'Lakes Venture37 (stopped work on 30 June 2026).

**What step F must confirm:** every candidate is likely, not confirmed. For each organisation: that the page is its current careers page and lists jobs; which recruitment system it uses (most own-site candidates show none); that an accepted account is the organisation's own, above all those of low confidence and those matched by an abbreviation; the websites from the search (unverified); and, where an organisation has accounts in two systems, which one is current.

## Sources

"Checked" means confirmed from the publisher's documentation on 3 November 2026; "not checked" means not yet confirmed.

- **IATI.** The IATI Registry was replaced in December 2025 ([migration note](https://docs.account.iatistandard.org/en/latest/registry/), checked). The old `organization_list` and `organization_show` addresses still answer through a compatibility layer promised only until the end of 2026 ([announcement](https://connect.iatistandard.org/post/new-iati-dashboard-api-13837425), checked). The new IATI Dashboard API ([schema](https://github.com/IATI/IATI-Dashboard/blob/live/schema.yml), checked) returns every reporting organisation in one request with no key: name, IATI organisation ID, type, head-office country, `website`, number of published files; no contact email. The survey uses the Dashboard API.
- **ReliefWeb API v2.** Every request needs an approved `appname` ([terms](https://apidoc.reliefweb.int/), checked); content may belong to the original source. Organisation records (`/v2/sources`) carry a `homepage`, `type`, `country` and an FTS ID ([documentation](https://apidoc.reliefweb.int/read/resources/sources/), checked). Job counts per organisation come from one request with a breakdown by `source` ([documentation](https://apidoc.reliefweb.int/read/facets/), checked). The `appname` is kept in the local `.env`, never in a tracked file.
- **US: IRS Exempt Organizations Business Master File.** 1,975,975 records, posted 13 October 2026, CSV by state and region, free, no key ([IRS page](https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf), checked). Income, revenue, assets and activity codes (not checked). No website column (not checked). Public domain (not checked). Its "in care of" column holds people's names and is never kept.
- **UK: Charity Commission register (England and Wales).** Daily full extract, JSON or tab-separated, free ([download page](https://register-of-charities.charitycommission.gov.uk/en/register/full-register-download), checked). Income and website in the main `charity` file; email and phone dropped as the file is read (not checked). Open Government Licence (not checked). About 170,000 charities (not checked). The trustee file is never downloaded. Scotland and Northern Ireland have their own registers (open decision 2).
- **Australia: ACNC register.** CSV or Excel, weekly (last 2 November 2026), Creative Commons Attribution 3.0 Australia ([data.gov.au](https://data.gov.au/data/dataset/acnc-register), checked). Income in the separate Annual Information Statement datasets. About 60,000 charities and a website column (not checked).
- **Canada: CRA list of charities.** "2024 List of charities", CSV from charities' yearly returns, updated 4 October 2026: identification, financial data, a contact web address file ([open.canada.ca](https://open.canada.ca/data/en/dataset/80c00cdb-1358-415c-bb8b-0de7f12675b8), seen through search). Open Government Licence – Canada (seen through search). The directors file is never downloaded.
- **Scotland: OSCR register.** CSV in a zip from `oscr.org.uk/download/charity-register`, 24,982 rows (22,617 active): income, website, geographical spread and main operating location (checked by download, 4 November 2026). Its site refused one connection and answered the next.
- **Europe: EU Transparency Register.** The June 2026 XML export: 17,424 organisations, each with a registration category, interests, head-office country and website; it also lists phone numbers and people, which are not read (checked by download). XML 1.1: references to control characters are removed before parsing.
- **Network member lists**, as a final gap check: InterAction 170+ members (2024 post); ICVA about 175 (not checked); Bond 330+ members, its list only on request to its membership team ([Bond](https://www.bond.org.uk/about-us/), checked); VOICE and CHS Alliance not checked.

## Privacy rules

- Each script keeps a fixed list of allowed columns: emails, phone numbers and people's names are dropped as files are read and never written anywhere.
- Trustee and director files are never downloaded.
- No page content from employers' sites is committed; only what the survey records about each site.
- A bot challenge, a 403 or a 429 is recorded and stops that organisation; it is never solved or bypassed.

## Open decisions (the user's)

Settled on 4 November 2026 (see Target): the size threshold (income, as above; the user confirms the levels after seeing the counts); Europe (the EU Transparency Register; Scotland added; Northern Ireland not, for now); finding careers pages (Common Crawl and the agent's search); the step F script on the fetch policy; UNjobs names and counts kept; the for-profit entries and the 19 NGOs; the provisional keyword set.

The income cut-offs: the user confirmed the recommended levels on 4 November 2026.

Still open:
1. The ReliefWeb `appname` (steps C and W-41 wait on it). ReliefWeb's request form (a Google Form linked from `apidoc.reliefweb.int`) asks for a name, organisation, purpose, preferred appname and website, and processes only official organisation email addresses (not Gmail or similar). On 4 November 2026 the agent filled it with the user's details but did not send it; the user expects the AidJobs domain and an address on it in about 8 or 9 days.
