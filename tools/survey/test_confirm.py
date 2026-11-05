"""Tests of step F's confirmation script (no network). Run: python -m pytest tools/survey -q"""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import careers
import confirm


def write(path, fields, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n",
                                extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def test_documented_public_feeds_are_used_for_their_systems():
    assert confirm.feed_for("https://job-boards.greenhouse.io/acme") == (
        "Greenhouse", "https://boards-api.greenhouse.io/v1/boards/acme/jobs")
    assert confirm.feed_for("https://job-boards.eu.greenhouse.io/acme")[1].startswith(
        "https://boards-api.eu.greenhouse.io/")
    assert confirm.feed_for("https://jobs.lever.co/acme") == (
        "Lever", "https://api.lever.co/v0/postings/acme?mode=json")
    assert confirm.feed_for("https://apply.workable.com/acme/") == (
        "Workable", "https://apply.workable.com/api/v1/widget/accounts/acme")
    assert confirm.feed_for("https://jobs.smartrecruiters.com/Acme1")[0] == "SmartRecruiters"
    assert confirm.feed_for("https://acme.recruitee.com/")[1] == "https://acme.recruitee.com/api/offers/"
    assert confirm.feed_for("https://acme.jobs.personio.de/")[1] == "https://acme.jobs.personio.de/xml"
    assert confirm.feed_for("https://acme.teamtailor.com/jobs")[1] == "https://acme.teamtailor.com/jobs.rss"
    assert confirm.feed_for("https://jobs.ashbyhq.com/acme")[0] == "Ashby"
    # Workday and Oracle: the careers page only (their job search is a POST request).
    assert confirm.feed_for("https://acme.wd3.myworkdayjobs.com/External") == ("", "")
    assert confirm.feed_for("https://www.rescue.org/careers") == ("", "")


def test_robots_txt_follows_rfc_9309_longest_match_and_wildcards():
    assert confirm.robots_allows("User-agent: *\nAllow: /\nDisallow: /jobs\n",
                                 "https://x.org/jobs") is False
    assert confirm.robots_allows("User-agent: *\nDisallow: /*/careers\n",
                                 "https://x.org/en/careers") is False
    assert confirm.robots_allows("User-agent: *\nDisallow: /jobs*\n",
                                 "https://x.org/jobs/list") is False
    assert confirm.robots_allows("User-agent: *\nDisallow: /jobs\nAllow: /jobs/open\n",
                                 "https://x.org/jobs/open/1") is True
    assert confirm.robots_allows("User-agent: *\nDisallow: /*.pdf$\n",
                                 "https://x.org/a.pdf?x=1") is True
    assert confirm.robots_allows("User-agent: *\nDisallow: /*.pdf$\n",
                                 "https://x.org/a.pdf") is False
    # Our own group, when there is one, replaces the '*' group; agents in a row share a group.
    rules = ("User-agent: Googlebot\nUser-agent: AidJobsSurvey\nAllow: /\n\n"
             "User-agent: *\nDisallow: /\n")
    assert confirm.robots_allows(rules, "https://x.org/careers") is True
    assert confirm.robots_allows("User-agent: *\nDisallow:\n", "https://x.org/a") is True
    assert confirm.robots_allows("User-agent: *\nDisallow: /\n", "https://x.org/robots.txt")


def test_a_cross_host_redirect_is_marked_its_robots_txt_unchecked():
    record = {"org_id": "a", "target_url": "https://jobs.jobvite.com/pih", "found_by": "x",
              "request": "page", "robots": {"verdict": "allowed", "host": "jobs.jobvite.com"},
              "response": {"status": 200, "final_url": "https://www.pih.org/employment"}}
    row = confirm.observation(record, b"<p>" + b"y" * 3000 + b"</p>")
    assert row["destination_robots"] == "not checked (www.pih.org)"


def test_postings_on_another_job_board_are_not_counted():
    filler = "<p>" + "text " * 400 + "</p>"
    page = ('<a href="https://reliefweb.int/job/4123456/officer">x</a>'
            '<a href="https://careers.acme.org/jobs/123">y</a>') + filler
    assert confirm.page_facts("https://www.acme.org/careers", page)["jobs_seen"] == 1


def test_a_listing_keeps_only_the_parameters_it_needs():
    assert confirm.listing_url("https://phg.tbe.taleo.net/phg02/ats/careers/v2/jobSearch"
                               "?org=CAREUSA&cws=52&utm_source=x") \
        == "https://phg.tbe.taleo.net/phg02/ats/careers/v2/jobSearch?org=CAREUSA&cws=52"
    assert confirm.listing_url("https://x.example/jobs?clientkey=ABC123&session=s") \
        == "https://x.example/jobs"


def test_robots_txt_rules_follow_rfc_9309_and_refusals_stop():
    rules = "User-agent: *\nDisallow: /private\n\nUser-agent: AidJobsSurvey\nDisallow: /jobs\n"
    assert confirm.robots_verdict(200, rules, "https://x.org/careers") == "allowed"
    assert confirm.robots_verdict(200, rules, "https://x.org/jobs/list") == "forbidden"
    assert confirm.robots_verdict(200, "User-agent: *\nDisallow: /\n", "https://x.org/a") \
        == "forbidden"
    assert confirm.robots_verdict(200, "", "https://x.org/a") == "allowed"
    assert confirm.robots_verdict(404, "", "https://x.org/a") == "allowed"
    assert confirm.robots_verdict(403, "", "https://x.org/a") == "refused"
    assert confirm.robots_verdict(429, "", "https://x.org/a") == "refused"
    assert confirm.robots_verdict(503, "", "https://x.org/a") == "unreachable"
    assert confirm.robots_verdict(None, "", "https://x.org/a") == "unreachable"


def test_the_run_stops_only_on_signs_of_a_block_against_the_survey():
    cf = confirm.service_of("Cloudflare challenge", "cloudflare")
    assert cf == "cloudflare" and confirm.service_of("refused (HTTP 403)", "") == ""
    assert confirm.run_stop([("a.org", ""), ("b.org", ""), ("c.org", "")]) == ""
    assert confirm.run_stop([("a.org", ""), ("a.org", ""), ("a.org", "")]).endswith("a.org")
    assert confirm.run_stop([("a.org", cf), ("b.org", cf), ("c.org", cf)]).endswith("cloudflare")
    assert confirm.run_stop([("a.org", cf), ("b.org", ""), ("c.org", cf)]) == ""
    assert confirm.run_stop([(f"{n}.org", "") for n in "abcde"]) == "5 refusals in a row"


def test_bot_challenges_are_recognised_but_a_normal_page_with_a_captcha_is_not():
    assert confirm.bot_protection(403, {"cf-mitigated": "challenge"}, "") == "Cloudflare challenge"
    assert confirm.bot_protection(503, {}, "<title>Just a moment...</title>") \
        == "Cloudflare challenge"
    assert confirm.bot_protection(403, {"server": "AkamaiGHost"}, "nope") \
        == "refused by akamaighost"
    assert confirm.bot_protection(429, {}, "") == "refused (HTTP 429)"
    page = ('<html><title>Careers</title><div class="g-recaptcha"></div>'
            '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></html>')
    assert confirm.bot_protection(200, {}, page) == ""


def test_a_page_shows_its_system_its_job_links_and_whether_it_needs_javascript():
    page = ('<a href="/careers/programme-manager/1234">PM</a>'
            '<a href="/careers/finance-officer/1235?utm=x">FO</a>'
            '<a href="/careers/finance-officer/1235">FO again</a>'
            '<a href="/about">About</a><a href="mailto:x@y.org">mail</a>'
            '<iframe src="https://careers-acme.icims.com/jobs/search?in_iframe=1"></iframe>'
            + "x" * 3000)
    facts = confirm.page_facts("https://www.acme.org/careers", page)
    assert facts["jobs_seen"] == 2
    assert facts["listing"] == "plain page with job links"
    assert facts["system"] == "iCIMS" and facts["system_evidence"].startswith("links to careers-acme")
    shell = confirm.page_facts("https://acme.wd3.myworkdayjobs.com/External",
                               '<div id="root"></div><noscript>enable JavaScript</noscript>')
    assert (shell["system"], shell["listing"], shell["jobs_seen"]) == (
        "Workday", "needs JavaScript", 0)


def test_system_postings_error_pages_sign_in_pages_and_closed_accounts_are_told_apart():
    filler = "<p>" + "text " * 400 + "</p>"
    breezy = confirm.page_facts("https://acme.breezy.hr/",
                                '<a href="/p/472440b1d6c2-programme-officer">x</a>' + filler)
    assert (breezy["listing"], breezy["jobs_seen"]) == ("plain page with job links", 1)
    taleo = confirm.page_facts("https://phg.tbe.taleo.net/phg02/ats/careers/v2/jobSearch",
                               '<a href="viewRequisition?org=X&cws=52&rid=1234">x</a>' + filler)
    assert taleo["jobs_seen"] == 1
    assert confirm.page_facts("https://www.aiib.org/en/general/404.html", filler)["listing"] \
        == "an error page"
    assert confirm.page_facts("https://acme.bamboohr.com/login.php", filler)["listing"] \
        == "a sign-in page"
    closed = confirm.page_facts("https://www.bamboohr.com/", filler)
    assert closed["listing"].startswith("the system's own site")
    assert confirm.outcome({"target_url": "x", "robots": "allowed", "status": "200",
                            "listing": closed["listing"]}) == "account not found"
    assert confirm.outcome({"target_url": "x", "robots": "allowed", "status": "200",
                            "listing": "an error page"}) == "not found"
    rich = confirm.page_facts("https://www.acme.org/careers", '<a href="/about">x</a>' + filler)
    assert rich["listing"] == "no job links seen"
    pointer = confirm.page_facts("https://www.acme.org/careers",
                                 '<a href="https://acme.wd3.myworkdayjobs.com/External">x</a>'
                                 + filler)
    assert pointer["listing"] == "links to its listing on Workday"
    assert confirm.outcome({"target_url": "x", "robots": "allowed", "status": "200",
                            "listing": pointer["listing"]}) \
        == "answers; links to its recruitment system"
    bamboo = confirm.page_facts("https://acme.bamboohr.com/careers", filler)
    assert bamboo["listing"] == "needs JavaScript"


def test_feeds_are_counted_per_system():
    assert confirm.count_feed("Greenhouse", json.dumps({"jobs": [{}, {}]}).encode()) == 2
    assert confirm.count_feed("Lever", b"[{}, {}, {}]") == 3
    assert confirm.count_feed("SmartRecruiters", b'{"totalFound": 7, "content": []}') == 7
    assert confirm.count_feed("Personio", b"<workzag-jobs><position/><position/></workzag-jobs>") == 2
    assert confirm.count_feed("Teamtailor", b"<rss><channel><item/></channel></rss>") == 1
    assert confirm.count_feed("Greenhouse", b"<html>not json</html>") is None


def wave_rows():
    def w(oid, name, batch, guess="", conf="", jobs=""):
        return {"rank": "1", "org_id": oid, "name": name, "group": "g", "unjobs_jobs": jobs,
                "income_usd": "", "website": "", "step_e_guess": guess,
                "step_e_confidence": conf, "step_f_batch": batch}
    return [w("a", "A Aid", 1, "https://job-boards.greenhouse.io/aaid", "high", "10"),
            w("b", "B Aid", 1, "https://www.baid.org/old-careers", "low", "4"),
            w("c", "C Aid", 1),
            w("d", "D Aid", 1, "https://www.daid.org/jobs", "high"),
            w("e", "E Aid", 2, "https://www.eaid.org/jobs", "high")]


def test_targets_prefer_a_recorded_web_search_over_step_es_guess(tmp_path):
    write(tmp_path / "first-wave.csv", careers.WAVE_FIELDS, wave_rows())
    write(tmp_path / "step-f-decisions.csv", confirm.DECISION_FIELDS, [
        {"action": "careers-page", "org_id": "b", "value": "https://baid.org/vacancies?x=1",
         "confidence": "high", "reason": "web search"},
        {"action": "careers-page", "org_id": "c", "value": "NONE", "confidence": "",
         "reason": "web search: none"}])
    found = {t["org_id"]: t for t in confirm.targets(tmp_path, batch=1)}
    assert set(found) == {"a", "b", "c", "d"}
    assert found["a"]["request"] == "feed (Greenhouse)"
    assert found["a"]["request_url"] == "https://boards-api.greenhouse.io/v1/boards/aaid/jobs"
    assert (found["b"]["target_url"], found["b"]["found_by"]) == (
        "https://baid.org/vacancies", "web search (high)")
    assert (found["c"]["request_url"], found["c"]["found_by"]) == ("", "web search: none found")
    assert found["d"]["found_by"] == "step E guess (high)"


def test_build_gives_outcomes_shared_sites_systems_and_corrections(tmp_path):
    write(tmp_path / "first-wave.csv", careers.WAVE_FIELDS, wave_rows())
    observed = [
        {"org_id": "a", "target_url": "https://job-boards.greenhouse.io/aaid",
         "request": "feed (Greenhouse)", "robots": "allowed", "status": "200",
         "final_url": "https://boards-api.greenhouse.io/v1/boards/aaid/jobs",
         "system": "Greenhouse", "listing": "public job feed", "jobs_seen": "12"},
        {"org_id": "b", "target_url": "https://baid.org/vacancies", "request": "page",
         "robots": "allowed", "status": "403", "bot_protection": "Cloudflare challenge"},
        {"org_id": "c", "target_url": "", "found_by": "web search: none found"},
        {"org_id": "d", "target_url": "https://www.daid.org/jobs", "request": "page",
         "robots": "allowed", "status": "200", "final_url": "https://www.daid.org/jobs",
         "system": "own site (system not seen)", "listing": "no job links seen",
         "jobs_seen": "0"}]
    write(tmp_path / "step-f-observations.csv", confirm.OBSERVATION_FIELDS, observed)
    write(tmp_path / "step-f-decisions.csv", confirm.DECISION_FIELDS, [
        {"action": "correct", "org_id": "d", "value": "outcome=answers; jobs in PDF files",
         "confidence": "", "reason": "its vacancies are PDF files"}])
    assert confirm.build(survey=tmp_path) == 0
    rows = {r["org_id"]: r for r in careers.read_csv(tmp_path / "step-f-confirmed.csv")}
    assert rows["a"]["outcome"] == "confirmed"
    assert rows["a"]["careers_page"] == "https://job-boards.greenhouse.io/aaid"
    assert rows["b"]["outcome"] == "blocked"
    assert rows["c"]["outcome"] == "no careers page found"
    assert rows["d"]["outcome"] == "answers; jobs in PDF files"
    assert "corrected: its vacancies are PDF files" in rows["d"]["note"]
    summary = careers.read_csv(tmp_path / "step-f-systems.csv")
    assert summary[0]["system"] == "Greenhouse" or summary[0]["organisations"] == "1"
    assert {s["system"]: s["jobs_seen"] for s in summary}["Greenhouse"] == "12"


def test_two_organisations_on_one_careers_page_are_marked(tmp_path):
    write(tmp_path / "first-wave.csv", careers.WAVE_FIELDS, wave_rows())
    page = {"robots": "allowed", "status": "200", "request": "page",
            "final_url": "https://www.shared.org/jobs/", "listing": "plain page with job links",
            "jobs_seen": "3", "system": "own site (system not seen)"}
    write(tmp_path / "step-f-observations.csv", confirm.OBSERVATION_FIELDS, [
        {**page, "org_id": "a", "target_url": "https://shared.org/jobs"},
        {**page, "org_id": "d", "target_url": "https://www.shared.org/jobs"}])
    write(tmp_path / "step-f-decisions.csv", confirm.DECISION_FIELDS, [])
    assert confirm.build(survey=tmp_path) == 0
    rows = {r["org_id"]: r for r in careers.read_csv(tmp_path / "step-f-confirmed.csv")}
    assert (rows["a"]["shares_site_with"], rows["d"]["shares_site_with"]) == ("d", "a")


def test_unknown_decisions_and_fields_stop_the_build(tmp_path):
    write(tmp_path / "first-wave.csv", careers.WAVE_FIELDS, wave_rows())
    write(tmp_path / "step-f-observations.csv", confirm.OBSERVATION_FIELDS, [])
    for bad in ({"action": "guess", "org_id": "a", "value": "", "reason": "x"},
                {"action": "correct", "org_id": "a", "value": "rank=1", "reason": "x"},
                {"action": "careers-page", "org_id": "zz", "value": "https://z.org", "reason": "x"}):
        write(tmp_path / "step-f-decisions.csv", confirm.DECISION_FIELDS, [bad])
        assert confirm.build(survey=tmp_path) == 1


def test_an_observation_keeps_hosts_and_paths_only():
    record = {"org_id": "a", "target_url": "https://x.org/jobs?session=secret",
              "found_by": "step E guess (high)", "request": "page",
              "robots": {"verdict": "allowed"},
              "response": {"status": 200, "final_url": "https://x.org/jobs/?token=abc",
                           "redirects": 1, "bot_protection": ""}}
    row = confirm.observation(record, b'<a href="/jobs/123">x</a>' + b"y" * 3000)
    assert row["target_url"] == "https://x.org/jobs" and row["final_url"] == "https://x.org/jobs/"
    assert row["jobs_seen"] == 1 and "secret" not in json.dumps(row)
