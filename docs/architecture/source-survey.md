# Employer survey (W-31)

**Status: in progress.** Step A (this file and the seed lists) done on 3 November 2026. The survey is read-only: no source is added, nothing is crawled, no database is touched. Each step has its own approval and pull request. The rules and the plan's place in the order are in `progress-ledger.md` (W-31) and `security-hardening-plan.md` (stage 8).

## Purpose

Find every relevant employer's careers site and group the sites by recruitment system, so the crawler's readers can be built in the order that covers the most jobs (W-38 onwards). The unit of record is one careers site: an affiliate or national office with its own site is its own record, and organisations that share one site (probably the UN Secretariat offices on `careers.un.org`) are one record.

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
| B | Merged organisation list from open data: IATI Dashboard, ACNC, CRA, UK Charity Commission, IRS, and chosen European registers, filtered by a size threshold | Downloads from the publishers' servers |
| C | ReliefWeb: organisations, websites, job counts per organisation (a few dozen requests) | ReliefWeb's API, with the user's `appname` |
| D | Duplicate removal and ranking: website domain, then IATI ID, then cleaned name and acronym; uncertain matches to a review list for the user, nothing merged automatically; ranked by hiring evidence, then income | None |
| E | Likely careers pages and recruitment systems, from Common Crawl's public URL index (per domain, and by recruitment-system host patterns) and the agent's web search for the top unresolved organisations | Common Crawl, about one request a second (its terms checked in that step) |
| F | Confirmation, at most two spaced requests per organisation (`robots.txt`, then the careers page or the vendor's documented public job API), in batches such as the top 300 | Employers' sites: its own approval |
| G | Output: careers sites grouped by recruitment system, ranked by jobs covered, with keyword families and each system's fields and reuse terms; the master CSV; the ledger | None |

Scripts for steps B to F go in a new `tools/survey/` folder that the backend never imports, run on the user's machine (Python 3.11). Raw downloads stay in a git-ignored folder; only cleaned results are committed.

## Sources

"Checked" means confirmed from the publisher's documentation on 3 November 2026; "not checked" means not yet confirmed.

- **IATI.** The IATI Registry was replaced in December 2025 ([migration note](https://docs.account.iatistandard.org/en/latest/registry/), checked). The old `organization_list` and `organization_show` addresses still answer through a compatibility layer promised only until the end of 2026 ([announcement](https://connect.iatistandard.org/post/new-iati-dashboard-api-13837425), checked). The new IATI Dashboard API ([schema](https://github.com/IATI/IATI-Dashboard/blob/live/schema.yml), checked) returns every reporting organisation in one request with no key: name, IATI organisation ID, type, head-office country, `website`, number of published files; no contact email. The survey uses the Dashboard API.
- **ReliefWeb API v2.** Every request needs an approved `appname` ([terms](https://apidoc.reliefweb.int/), checked); content may belong to the original source. Organisation records (`/v2/sources`) carry a `homepage`, `type`, `country` and an FTS ID ([documentation](https://apidoc.reliefweb.int/read/resources/sources/), checked). Job counts per organisation come from one request with a breakdown by `source` ([documentation](https://apidoc.reliefweb.int/read/facets/), checked). The `appname` is kept in the local `.env`, never in a tracked file.
- **US: IRS Exempt Organizations Business Master File.** 1,975,975 records, posted 13 October 2026, CSV by state and region, free, no key ([IRS page](https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf), checked). Income, revenue, assets and activity codes (not checked). No website column (not checked). Public domain (not checked). Its "in care of" column holds people's names and is never kept.
- **UK: Charity Commission register (England and Wales).** Daily full extract, JSON or tab-separated, free ([download page](https://register-of-charities.charitycommission.gov.uk/en/register/full-register-download), checked). Income and website in the main `charity` file; email and phone dropped as the file is read (not checked). Open Government Licence (not checked). About 170,000 charities (not checked). The trustee file is never downloaded. Scotland and Northern Ireland have their own registers (open decision 2).
- **Australia: ACNC register.** CSV or Excel, weekly (last 2 November 2026), Creative Commons Attribution 3.0 Australia ([data.gov.au](https://data.gov.au/data/dataset/acnc-register), checked). Income in the separate Annual Information Statement datasets. About 60,000 charities and a website column (not checked).
- **Canada: CRA list of charities.** "2024 List of charities", CSV from charities' yearly returns, updated 4 October 2026: identification, financial data, a contact web address file ([open.canada.ca](https://open.canada.ca/data/en/dataset/80c00cdb-1358-415c-bb8b-0de7f12675b8), seen through search). Open Government Licence – Canada (seen through search). The directors file is never downloaded.
- **Europe.** Not chosen yet (open decision 2). Candidate: the EU Transparency Register, about 17,000 organisations, daily XML or Excel, a non-governmental organisations category and a website column ([data.europa.eu](https://data.europa.eu/data/datasets/transparency-register?locale=en); size and columns from a third-party description, not checked). National registers vary.
- **Network member lists**, as a final gap check: InterAction 170+ members (2024 post); ICVA about 175 (not checked); Bond 330+ members, its list only on request to its membership team ([Bond](https://www.bond.org.uk/about-us/), checked); VOICE and CHS Alliance not checked.

## Privacy rules

- Each script keeps a fixed list of allowed columns: emails, phone numbers and people's names are dropped as files are read and never written anywhere.
- Trustee and director files are never downloaded.
- No page content from employers' sites is committed; only what the survey records about each site.
- A bot challenge, a 403 or a 429 is recorded and stops that organisation; it is never solved or bypassed.

## Open decisions (the user's)

1. A size threshold per register (for example yearly income of at least £5m, US$10m, A$10m or C$10m). Without one the registers hold over 2 million organisations; the earlier estimate of 2,500 to 3,500 organisations predates the widening.
2. Europe: the EU Transparency Register only, or named national registers; and whether Scotland and Northern Ireland join England and Wales.
3. Finding careers pages without a paid search API: Common Crawl's index plus the agent's web search (proposed), or a paid search API with a key kept as a secret.
4. Whether the step F script reuses the backend's fetch policy (recommended, since its addresses come from outside lists).
5. UNjobs data in the private repository: names and counts (recommended) or names only.
6. The ReliefWeb `appname`: requested or received (steps C and W-41 wait on it).
7. The for-profit entries and the 19 proposed NGOs (step D).
8. A provisional keyword-family set (UN, NGO, nonprofit, charity, humanitarian, international development) until the growth plan's families (section 4.5) are drafted.
