# Employer survey (W-31)

**Status: in progress.** Step A (this file and the seed lists) done on 3 November 2026. Step B (candidates from public registers) built on 4 November 2026 (below). The survey is read-only: no source is added, nothing is crawled, no database is touched. Each step has its own approval and pull request. The rules and the plan's place in the order are in `progress-ledger.md` (W-31) and `security-hardening-plan.md` (stage 8).

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
| E | Likely careers pages and recruitment systems, from Common Crawl's public URL index (per domain, and by recruitment-system host patterns) and the agent's web search for the top unresolved organisations | Common Crawl, about one request a second (its terms checked in that step) |
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

In every source, names that say hospital, university, college or school, in English, French, Spanish, Italian, German or Dutch forms (also "health sciences", "health system", "polytechnique", "école", "Hochschule"), are dropped: 681 in all, at any income (`excluded_by_name` in the counts), for example the University of Alberta, Université de Montréal, the American Hospital of Paris and Hamilton Health Sciences. Aid organisations with such words in their names are kept by name, each checked: World University Service of Canada, United World Schools, Haiti Hospital Appeal, Promoting Equality in African Schools, Baylor College of Medicine Children's Foundation Malawi. Mission hospitals stay out (hospitals are outside the target).

**Counts** (`register-counts.csv`; "in target" before the name filter):

| Source | Records | In target | Lower cut-off | Recommended | Higher cut-off |
| --- | --- | --- | --- | --- | --- |
| IATI | 2,132 | 1,894 | — | 1,887 (no income) | — |
| IRS | 1,975,975 | 20,205 | 1,084 at US$2.5m | 674 at US$5m | 431 at US$10m |
| UK | 171,919 | 9,246 | 549 at £1m | 307 at £2.5m | 192 at £5m |
| OSCR | 22,617 active | 769 | 120 at £1m | 88 at £2.5m | 57 at £5m |
| ACNC | 65,979 | 4,051 | 281 at A$2.5m | 174 at A$5m | 94 at A$10m |
| CRA | 83,761 | 5,103 | 619 at C$2.5m | 378 at C$5m | 215 at C$10m |
| EU | 17,424 | 2,801 | — | 2,785 (no income) | — |

The candidate list at the recommended cut-offs has 6,354 rows (with 61 Australian charities whose income is not reported but whose size is Large), before duplicates are removed: the same organisation often appears in several sources (for example Oxfam in the UK register, OSCR, IATI and the EU register). Duplicate removal and ranking are step D. The record totals match each publisher's own figure (IATI's API count, the IRS page's 1,975,975, the EU file's declared 17,424); OSCR's file has 24,982 rows, of which 22,617 are active (the others "Not Submitted" or "Not Monitored"); ACNC's 65,979 leave out 614 lines that continue a quoted field.

**Known gaps and noise, for step D:**
- **Large US aid organisations outside group Q:** for example Samaritan's Purse (X20), Partners In Health (E70), GiveDirectly (P60), Internews, the International Republican Institute and IntraHealth, and Population Services International and Smile Train, which have no NTEE code (12,801 organisations at US$5m or more have none). They are found through IATI, UNjobs and ReliefWeb in steps C and D.
- **Canada, line 2100:** 102 of the Canadian candidates qualify by line 2100 alone; most are aid agencies working through partners, but some are not (YMCAs, dioceses, Special Olympics, the Terry Fox Foundation). Step D's ranking puts hiring evidence first.
- **Scotland:** the "UK and overseas" test still lets in a few charities that are not aid agencies (for example the British Council, Dogs Trust, the Church of Scotland). English charities registered in Scotland too repeat the UK list.
- **IATI:** one organisation ID (`NL-KVK-30285304`) is used by two publishers (Stichting Humana and Sympany+).

**Spot checks** (well-known agencies, at the recommended cut-offs): present: International Rescue Committee, Mercy Corps, CARE USA, Save the Children (US and UK), World Vision (US, Australia, Canada), Oxfam (UK, Australia, Canada), Christian Aid, Plan International Canada, GIZ, the UK's Foreign, Commonwealth and Development Office, UNICEF national committees, CARE International. The first build missed four; each was fixed: Australian charities listing only Australia counted as overseas (the filter now needs another country); Oxfam Australia has no 2023 statement (now kept by its size band); World Vision, Plan International and CARE Canada work through partners and are not in schedule 2 (now also line 2100). Mercy Corps Europe is not on Scotland's register (correct). After the independent review the name filter, the US and Scottish filters and the blank Australian lines were corrected (see the review in the pull request); SCIAF (Scotland's Catholic aid agency) was checked to stay in.

**Each row** (`register-candidates.csv`): source, the source's own ID, name, country, kind (type or category), website domain (IRS has no website), income and currency, income year, whether it meets the recommended cut-off, and a note. Nothing else is read from the files: no emails, phone numbers, addresses or people's names.

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

Still open:
1. The income cut-offs: confirm the recommended levels, or choose the lower or higher ones from the counts above.
2. The ReliefWeb `appname`: requested or received (steps C and W-41 wait on it).
