"""Tests of step E's keys, patterns, account extraction and matching. Run: python -m pytest tools/survey -q"""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import careers
from careers import ClusterIndex, Decisions


def row(url, status="200", redirect=""):
    data = {"url": url, "status": status}
    if redirect:
        data["redirect"] = redirect
    return f"{careers.url_key(url)} 20261008000000 {json.dumps(data)}"


def test_urls_become_index_keys_without_www_case_or_query():
    assert careers.surt_host("www.Rescue.org") == "org,rescue"
    assert careers.surt_host("careers.rescue.org") == "org,rescue,careers"
    assert careers.url_key("https://www.rescue.org/Careers?utm=x") == "org,rescue)/careers"
    assert careers.url_key("https://www2.unicef.org/") == "org,unicef)/"


def test_query_strings_and_fragments_are_dropped():
    assert careers.strip_query("https://jobs.lever.co/acme/123?lever-source=x#top") \
        == "https://jobs.lever.co/acme/123"
    assert careers.strip_query("careers.rescue.org/jobs?id=5") == "https://careers.rescue.org/jobs"
    assert careers.strip_query("") == ""


def test_websites_become_hosts_and_stems():
    assert careers.site_host("https://www.ICRC.org/en") == "icrc.org"
    assert careers.website_stem("savethechildren.org.uk") == "savethechildren"
    assert careers.website_stem("rescue.org") == "rescue"
    assert careers.website_stem("un.org") == ""  # shared by many organisations


LINES = [
    "a,example)/ 20261001000000\tcdx-00000.gz\t0\t100\t1",
    "org,rescue)/ 20261001000000\tcdx-00000.gz\t100\t100\t2",
    "org,rescue)/news 20261001000000\tcdx-00000.gz\t200\t100\t3",
    "org,rescue,careers)/ 20261001000000\tcdx-00000.gz\t300\t100\t4",
    "org,rescuer)/ 20261001000000\tcdx-00001.gz\t0\t100\t5",
]


def test_the_cluster_index_finds_the_blocks_that_may_hold_a_prefix():
    cluster = ClusterIndex(LINES)
    # A prefix that starts inside a block needs that block (rows before the first key too).
    assert cluster.blocks_for("org,rescue)") == [0, 1, 2]
    assert cluster.blocks_for("org,rescue,") == [2, 3]
    assert cluster.blocks_for("org,rescue)/careers") == [1]  # between "/" and "/news"
    assert cluster.blocks_for("zz,nothing)") == [4]


def test_neighbouring_blocks_of_one_file_become_one_range():
    cluster = ClusterIndex(LINES)
    assert cluster.ranges([1, 2, 3, 4]) == [("cdx-00000.gz", 100, 399, 3),
                                            ("cdx-00001.gz", 0, 99, 1)]


def test_a_large_site_is_read_by_careers_prefixes_only():
    lines = [f"org,big)/p{i:04d} 20261001000000\tcdx-00000.gz\t{i * 10}\t10\t{i}"
             for i in range(20)]
    prefixes = careers.site_prefixes(ClusterIndex(lines), "big.org")
    assert "org,big)/careers" in prefixes and "org,big,jobs" in prefixes
    assert "org,big)" not in prefixes
    assert careers.site_prefixes(ClusterIndex(LINES), "rescue.org") == ["org,rescue)", "org,rescue,"]


def test_careers_patterns_in_several_languages():
    site = "example.org"
    for path in ["/careers", "/en/careers", "/about-us/work-with-us", "/fr/recrutement",
                 "/emplois", "/es/trabaja-con-nosotros", "/de/stellenangebote", "/nl/vacatures",
                 "/it/lavora-con-noi", "/vacancies/123", "/join-us", "/careers-at-example"]:
        assert careers.careers_landing("https://www.example.org" + path, site), path
    for path in ["/report/rebuilding-her-career", "/news", "/joint-statement", "/about"]:
        assert not careers.careers_landing("https://www.example.org" + path, site), path
    assert careers.careers_landing("https://www.example.org/en/careers/job/12", site) \
        == "https://www.example.org/en/careers"
    assert careers.careers_landing("https://careers.example.org/job/12", site) \
        == "https://careers.example.org/"
    assert careers.careers_landing("https://careers.other.org/", site) == ""


def test_landings_keep_status_redirect_and_pages_below_without_queries():
    lines = [
        row("https://www.rescue.org/careers"),
        row("https://www.rescue.org/careers/job-1?src=feed"),
        row("https://www.rescue.org/careers/job-2", "404"),
        row("https://www.rescue.org/jobs", "301",
            "https://rescue.wd1.myworkdayjobs.com/en-US/External?source=web"),
        row("https://www.rescue.org/news/item"),
    ]
    found = {e["landing"]: e for e in careers.site_landings("rescue.org", "CC-MAIN-2026-43", lines)}
    assert set(found) == {"https://www.rescue.org/careers", "https://www.rescue.org/jobs"}
    assert found["https://www.rescue.org/careers"]["status"] == "200"
    assert found["https://www.rescue.org/careers"]["below_ok"] == 1
    assert found["https://www.rescue.org/careers"]["below_all"] == 2
    jobs = found["https://www.rescue.org/jobs"]
    assert jobs["system_redirect"] == "https://rescue.wd1.myworkdayjobs.com/en-US/External"
    assert "?" not in jobs["redirect"]


def test_accounts_are_read_from_each_system():
    cases = {
        "https://rescue.wd1.myworkdayjobs.com/en-US/IRC_External/job/x": ("Workday", "rescue", "IRC_External"),
        "https://wd3.myworkdaysite.com/en-US/recruiting/unhcr/External": ("Workday", "unhcr", "External"),
        "https://acme.impl-wd103.myworkdayjobs.com/en-US/x": ("Workday", "", ""),
        "https://boards.greenhouse.io/clintonhealthaccess/jobs/1": ("Greenhouse", "clintonhealthaccess", ""),
        "https://boards.greenhouse.io/embed/job_board?for=givedirectly": ("Greenhouse", "givedirectly", ""),
        "https://job-boards.eu.greenhouse.io/acme": ("Greenhouse", "acme", ""),
        "https://jobs.lever.co/wikimedia/abc": ("Lever", "wikimedia", ""),
        "https://jobs.ashbyhq.com/acme": ("Ashby", "acme", ""),
        "https://jobs.smartrecruiters.com/Acme1/123": ("SmartRecruiters", "acme1", ""),
        "https://jobs.jobvite.com/mercycorps/jobs": ("Jobvite", "mercycorps", ""),
        "https://careers-path.icims.com/jobs/1": ("iCIMS", "path", ""),
        "https://acme.bamboohr.com/careers/1": ("BambooHR", "acme", ""),
        "https://apply.workable.com/acme/j/1": ("Workable", "acme", ""),
        "https://acme.pinpointhq.com/": ("Pinpoint", "acme", ""),
        "https://acme.teamtailor.com/jobs": ("Teamtailor", "acme", ""),
        "https://acme.recruitee.com/o/x": ("Recruitee", "acme", ""),
        "https://acme.jobs.personio.de/job/1": ("Personio", "acme", ""),
        "https://acme.avature.net/careers": ("Avature", "acme", ""),
        "https://acme.taleo.net/careersection/2/jobsearch.ftl": ("Taleo", "acme", ""),
        "https://acme.zohorecruit.eu/jobs/Careers": ("Zoho Recruit", "acme", ""),
        "https://www.bamboohr.com/pricing": ("BambooHR", "", ""),
        "https://help.workable.com/x": ("Workable", "", ""),
    }
    for url, expected in cases.items():
        assert careers.tenant_of(url) == expected, url


def test_account_keys_drop_generic_endings_and_digits():
    assert {"rescue", "rescue1"} <= careers.tenant_keys("rescue1")
    assert "msf" in careers.tenant_keys("msfcareers")
    assert "irc" in careers.tenant_keys("rescue", "IRC_External")


def org(oid, name, acronym="", website="", rank=1, sources=""):
    return {"org_id": oid, "name": name, "acronym": acronym, "website_domain": website,
            "rank": str(rank), "sources": sources, "evidence": "income"}


def tenant(system, account, sites="", example=""):
    return {"system": system, "tenant": account, "sites": sites, "crawls": "2026-43",
            "captures": "5", "example": example or f"https://{account}.example/"}


def test_accounts_match_by_full_name_then_website_name_then_acronym():
    orgs = [org("a", "Clinton Health Access Initiative", "CHAI", "clintonhealthaccess.org"),
            org("b", "International Rescue Committee", "IRC", "rescue.org"),
            org("c", "Médecins Sans Frontières", "MSF", "msf.org")]
    websites = {o["org_id"]: o["website_domain"] for o in orgs}
    matches, shared = careers.match_tenants(orgs, [
        tenant("Greenhouse", "clintonhealthaccessinitiative"),
        tenant("Workday", "rescue"),
        tenant("Lever", "msf")], websites)
    assert matches[("a", "Greenhouse:clintonhealthaccessinitiative")][0] == "full name"
    assert matches[("b", "Workday:rescue")][0] == "website name"
    assert matches[("c", "Lever:msf")][0] == "acronym"
    assert not shared


def test_one_account_matching_many_organisations_goes_to_review():
    orgs = [org("a", "CARE USA", "CARE", "care.org"), org("b", "CARE Canada", "CARE", "care.ca")]
    matches, shared = careers.match_tenants(orgs, [tenant("Workday", "care")],
                                            {o["org_id"]: o["website_domain"] for o in orgs})
    assert not matches
    assert shared["Workday:care"][1] == ["a", "b"]


def write(path, fields, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def build(tmp_path, orgs, index=(), tenants=(), wikidata=(), decisions=()):
    fields = ["rank", "org_id", "name", "acronym", "family", "kind", "country", "website_domain",
              "unjobs_jobs", "income_usd", "income_from", "evidence", "sources", "note"]
    write(tmp_path / "organisations.csv", fields, orgs)
    write(tmp_path / "step-e-index.csv", careers.INDEX_FIELDS, index)
    write(tmp_path / "step-e-tenants.csv", careers.TENANT_FIELDS, tenants)
    write(tmp_path / "step-e-wikidata.csv", careers.WIKIDATA_FIELDS, wikidata)
    write(tmp_path / "step-e-decisions.csv", careers.DECISION_FIELDS, decisions)
    assert careers.build(survey=tmp_path) == 0
    return (careers.read_csv(tmp_path / "careers-candidates.csv"),
            careers.read_csv(tmp_path / "careers-review.csv"),
            careers.read_csv(tmp_path / "websites-filled.csv"))


def index_row(site, landing, status="200", redirect="", system_redirect="", below_ok=0):
    return {"crawl": "CC-MAIN-2026-43", "site": site, "landing": landing, "status": status,
            "redirect": redirect, "below_ok": below_ok, "below_all": below_ok,
            "system_redirect": system_redirect}


def test_build_rates_own_pages_and_accounts_and_sends_abbreviations_to_review(tmp_path):
    orgs = [org("a", "International Rescue Committee", "IRC", "rescue.org", 1),
            org("b", "Clinton Health Access Initiative", "CHAI", "clintonhealthaccess.org", 2),
            org("c", "Médecins Sans Frontières", "MSF", "msf.org", 3)]
    candidates, review, _ = build(tmp_path, orgs, index=[
        index_row("rescue.org", "https://www.rescue.org/careers", "301",
                  "https://rescue.wd1.myworkdayjobs.com/External",
                  "https://rescue.wd1.myworkdayjobs.com/External"),
        index_row("msf.org", "https://www.msf.org/careers/a/b/c", "404")],
        tenants=[tenant("Workday", "rescue"), tenant("Greenhouse", "clintonhealthaccessinitiative"),
                 tenant("Lever", "msf")])
    by_org = {}
    for c in candidates:
        by_org.setdefault(c["org_id"], []).append(c)
    assert by_org["a"][0]["system_guess"] == "Workday" and by_org["a"][0]["confidence"] == "high"
    assert any(c["rule"].startswith("account by website name, own site redirects")
               for c in by_org["a"])
    assert by_org["b"][0]["confidence"] == "high"
    assert [c["confidence"] for c in by_org["c"]] == ["low"]
    assert [(r["org_id"], r["kind"]) for r in review] == [("c", "abbreviation only")]


def test_an_account_in_another_system_than_the_own_site_points_to_is_a_conflict(tmp_path):
    orgs = [org("a", "International Rescue Committee", "IRC", "rescue.org")]
    candidates, review, _ = build(tmp_path, orgs, index=[
        index_row("rescue.org", "https://www.rescue.org/careers", "301",
                  "https://rescue.wd1.myworkdayjobs.com/x", "https://rescue.wd1.myworkdayjobs.com/x")],
        tenants=[tenant("Greenhouse", "internationalrescuecommittee")])
    assert [c["system_guess"] for c in candidates] == ["Workday"]
    assert review[0]["kind"] == "conflict"


def test_decisions_accept_or_reject_an_account(tmp_path):
    orgs = [org("a", "CARE USA", "CARE", "care.org"), org("b", "CARE Canada", "CARE", "care.ca", 2)]
    candidates, review, _ = build(tmp_path, orgs, tenants=[tenant("Workday", "care")], decisions=[
        {"action": "accept-tenant", "org_id": "a", "value": "Workday:care", "confidence": "medium",
         "reason": "CARE USA's own site links to it"}])
    assert [(c["org_id"], c["confidence"]) for c in candidates] == [("a", "medium")]
    assert review == []


def test_wikidata_fills_websites_by_identifier_and_reviews_name_only_matches(tmp_path):
    orgs = [org("a", "Samaritan's Purse", rank=1, sources="irs:580000000"),
            org("b", "Partners In Health", rank=2, sources="unjobs-nonun:5"),
            org("c", "Unknown Aid", rank=3, sources="unjobs-nonun:6")]
    wikidata = [
        {"match": "irs", "value": "58-0000000", "item": "Q1", "label": "Samaritan's Purse",
         "description": "", "website": "https://www.samaritanspurse.org/"},
        {"match": "name", "value": "Partners In Health", "item": "Q2",
         "label": "Partners In Health", "description": "organization",
         "website": "https://www.pih.org/"}]
    _, review, filled = build(tmp_path, orgs, wikidata=wikidata)
    by_org = {f["org_id"]: f for f in filled}
    assert by_org["a"]["website"] == "samaritanspurse.org"
    assert by_org["a"]["source"] == "wikidata (identifier)"
    assert by_org["b"]["website"] == "" and by_org["b"]["source"] == "not yet searched"
    assert [(r["org_id"], r["kind"]) for r in review] == [("b", "wikidata: name only")]
    _, review, filled = build(tmp_path, orgs, wikidata=wikidata, decisions=[
        {"action": "accept-wikidata", "org_id": "b", "value": "Q2", "confidence": "",
         "reason": "the same organisation"},
        {"action": "website", "org_id": "c", "value": "https://www.unknownaid.org/about?x=1",
         "confidence": "", "reason": "search: Unknown Aid"}])
    by_org = {f["org_id"]: f for f in filled}
    assert by_org["b"]["website"] == "pih.org"
    assert by_org["c"]["website"] == "unknownaid.org"
    assert by_org["c"]["source"] == "unverified (search-engine copy)"
    assert review == []


def test_identifiers_are_written_as_wikidata_writes_them():
    assert careers.identifiers(org("a", "x", sources="irs:135660870; uk:1047501; oscr:sc012345")) \
        == [("irs", "13-5660870"), ("uk", "1047501"), ("oscr", "SC012345")]
    assert ("cra", "127202349") in careers.identifiers(org("a", "x", sources="cra:127202349RR0001"))


def test_unknown_decisions_are_refused():
    try:
        Decisions.read([{"action": "merge", "org_id": "a", "value": "", "confidence": "",
                         "reason": ""}])
    except ValueError:
        return
    raise AssertionError("an unknown decision was accepted")
