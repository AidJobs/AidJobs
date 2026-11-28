"""Tests of the broad layer's reading and measuring (W-54, no network). Every advert and page here was
written for the tests by AidJobs; none is copied from a real advert. Run: python -m pytest tools/survey -q"""
import csv
import gzip
import json
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import adverts
import roles

PAGE = """<html><head><title>Logistics Officer | Acme Relief</title></head><body>
<nav><a href="/">Home</a><a href="/jobs">Jobs</a></nav>
<header class="site-header">Acme Relief menu</header>
<main>
<h1>Logistics Officer</h1>
<p><strong>Location:</strong> Goma, with travel up to 30% to field sites</p>
<h2>About us</h2><p>Acme Relief is a made-up organisation used only in these tests of the survey.</p>
<h2>Key responsibilities</h2>
<ul><li>Run the warehouse in Goma and keep stock records up to date every week.</li>
<li>Manage a fleet of twelve vehicles and their drivers across three sites.</li></ul>
<h2>Requirements</h2>
<ul><li>A bachelor's degree in logistics or a related field.</li>
<li>At least three (3) years of humanitarian logistics experience.</li>
<li>Fluency in French and English is required.</li></ul>
<p>Contact the team at jobs@acme.example or +243 812 345 678 for questions.</p>
<h2>How to apply</h2><p>Submit your CV and a cover letter by the closing date, 30 November 2026, 23:59 (GMT+1).</p>
</main>
<footer class="footer">Copyright Acme Relief</footer>
</body></html>"""


def test_page_text_keeps_the_advert_and_drops_site_furniture():
    lines = adverts.html_lines(PAGE)
    texts = [ln["text"] for ln in lines]
    assert "Home" not in texts and not any("menu" in t for t in texts)
    assert not any("Copyright" in t for t in texts)
    assert any(ln["heading"] and ln["text"] == "Key responsibilities" for ln in lines)
    assert any(t.startswith("Manage a fleet") for t in texts)


def test_a_wrapper_with_a_furniture_like_class_keeps_the_advert():
    body = " ".join(f"Run task {i} with the partners in the district every month." for i in range(40))
    page = (f'<html><body><nav class="menu">Home Jobs</nav><div class="page job-entry with-sticky-share">'
            f'<h1>Finance Officer</h1><p>{body}</p></div></body></html>')
    lines = adverts.html_lines(page)
    assert adverts.words_of(" ".join(ln["text"] for ln in lines)) > 300
    assert not any(ln["text"] == "Home Jobs" for ln in lines)
    aspnet = f'<html><body><form id="aspnetForm"><h1>Finance Officer</h1><p>{body}</p></form></body></html>'
    assert adverts.words_of(" ".join(ln["text"] for ln in adverts.html_lines(aspnet))) > 300


def test_emails_and_phone_numbers_are_removed_but_years_and_dates_stay():
    s = adverts.scrub("Write to a.b@acme.example or call +254 712 345 678; 5 years; 30 November 2026; 2025-2026")
    assert "@" not in s and "712" not in s
    assert "5 years" in s and "30 November 2026" in s and "2025-2026" in s
    assert "0712" not in adverts.scrub("Mobile: 0712 345 678")
    assert "345" not in adverts.scrub("Tel. 22 345 6789 for questions")
    assert "120 000 - 150 000" in adverts.scrub("Salary KES 120 000 - 150 000 per month")
    assert "1 200 000" in adverts.scrub("XOF 1 200 000 net")


def test_an_advert_is_read_from_its_page_with_contacts_removed():
    ad = adverts.advert_from_html(PAGE, "https://www.acme.example/jobs/logistics-officer-goma")
    assert ad["method"] == "html" and ad["title"] == "Logistics Officer"
    joined = " ".join(ln["text"] for ln in ad["lines"])
    assert "jobs@acme.example" not in joined and "812 345" not in joined


def test_the_title_is_read_from_the_page_not_its_generic_heading():
    page = ('<html><head><title>Logistics Officer | Acme Relief</title></head><body><h1>Job Details</h1>'
            '<p>text</p></body></html>')
    assert adverts.page_title(page, adverts.html_lines(page), "https://acme.example/jobs/1") == "Logistics Officer"
    gh = '<html><head><title>Job Application for Finance Manager at Acme</title></head><body></body></html>'
    assert adverts.page_title(gh, [], "https://job-boards.greenhouse.io/acme/jobs/1") == "Finance Manager"
    assert adverts.clean_title("Job Application for Grants Officer at Acme Relief") == "Grants Officer"


def test_job_posting_data_is_used_where_the_page_has_it():
    desc = "<p>" + "Coordinate the team's monthly reporting and field visits. " * 20 + "</p>"
    page = ('<html><body><script type="application/ld+json">' + json.dumps({
        "@context": "https://schema.org", "@type": "JobPosting", "title": "Finance Officer",
        "description": desc, "validThrough": "2026-12-01", "datePosted": "2026-11-01",
        "employmentType": "FULL_TIME", "hiringOrganization": {"name": "Acme Relief"},
        "baseSalary": {"currency": "USD", "value": {"minValue": 1000}}}) + "</script></body></html>")
    ad = adverts.advert_from_html(page, "https://example.org/jobs/1")
    assert ad["method"] == "jsonld" and ad["title"] == "Finance Officer"
    assert ad["facts"]["pay"] and ad["facts"]["closing_date"] and ad["employer"] == "Acme Relief"


def test_sections_are_typed_in_english_and_french():
    assert adverts.section_type("Key responsibilities:") == "responsibilities"
    assert adverts.section_type("Vos missions") == "responsibilities"
    assert adverts.section_type("Profil recherché") == "essential_requirements"
    assert adverts.section_type("What we offer") == "pay_benefits"
    assert adverts.section_type("How to apply") == "how_to_apply"
    assert adverts.section_type("About us") == "about_organisation"
    assert adverts.section_type("Desirable") == "desirable_requirements"
    assert adverts.section_type("Random words here") == "unclassified"
    assert adverts.section_type("ROLE & RESPONSIBILITIES:") == "responsibilities"
    assert adverts.section_type("JOB REQUIREMENTS") == "essential_requirements"
    assert adverts.section_type("Software skills") == "essential_requirements"
    assert adverts.section_type("Starting Date") == "header_facts"
    sub = [{"text": "Duties", "heading": True, "tag": "h2"}, {"text": "Do the work well.", "heading": False, "tag": "p"},
           {"text": "Team leadership", "heading": True, "tag": "h3"}, {"text": "Lead the team.", "heading": False,
                                                                      "tag": "p"}]
    assert [s["type"] for s in adverts.sections_of(sub)] == ["responsibilities"]
    secs = adverts.sections_of(adverts.html_lines(PAGE))
    types = [s["type"] for s in secs]
    assert types.index("responsibilities") < types.index("essential_requirements") < types.index("how_to_apply")
    assert all(s["words"] >= 0 for s in secs)


def test_facts_given_are_found_by_pattern():
    text = " ".join(ln["text"] for ln in adverts.html_lines(PAGE))
    given = {k for k, p in adverts.FACTS.items() if p.search(text)}
    assert {"duty_station", "travel", "closing_date", "closing_time", "how_to_apply", "languages"} <= given
    assert "pay" not in given and "start_date" not in given


def test_years_of_experience_and_the_un_form():
    assert adverts.years_asked("At least three (3) years of logistics experience.") == ("3", "")
    assert adverts.years_asked("Minimum 5+ years of relevant experience.") == ("5", "")
    un = ("A master's degree with seven years of relevant experience, alternatively a bachelor's degree "
          "with nine years of relevant experience.")
    assert adverts.years_asked(un) == ("7", "9")
    assert adverts.years_asked("Au moins 4 ans d'expérience dans la gestion de projets.") == ("4", "")
    assert adverts.years_asked("No experience needed.") == ("", "")


def test_degree_level():
    assert adverts.degree_asked("An advanced university degree in economics") == "master"
    assert adverts.degree_asked("A bachelor's degree in finance") == "bachelor"
    assert adverts.degree_asked("Licence en gestion") == "bachelor"
    assert adverts.degree_asked("PhD in epidemiology") == "phd"
    assert adverts.degree_asked("Nothing about schooling") == ""


def test_explicit_restrictions_are_found_and_inclusion_is_never_a_restriction():
    def found(text):
        return adverts.restrictions_of(text)
    assert found("Female candidates only.") == {"sex"}
    assert found("Applicants must be aged between 25 and 35 years.") == {"age"}
    assert found("Open to Kenyan nationals only.") == {"nationality"}
    assert found("Please attach a recent passport-size photo.") == {"photo_appearance"}
    assert found("Women are strongly encouraged to apply.") == set()
    assert found("Each candidate needs the right to work in the UK.") == set()
    assert found("Chargé de projet (H/F)") == set()
    inc = {k for k, p in adverts.INCLUSION.items() if p.search("Women are strongly encouraged to apply. (H/F)")}
    assert "women_encouraged" in inc


def test_language_of_an_advert():
    assert adverts.language_of("The officer will manage the team and report to the director of the programme.") == "en"
    assert adverts.language_of("Le chargé de projet est responsable de la mise en oeuvre des activités avec les "
                               "partenaires et du suivi des indicateurs pour le programme.") == "fr"
    assert adverts.language_of("ok") == "unknown"


def page(pid, org, lang="eng"):
    return {"page_id": pid, "org_id": org, "languages": lang}


def test_the_cap_per_organisation_and_the_french_cap():
    pages = [page(f"a{i:03d}", "a") for i in range(50)] + [page(f"f{i:03d}", "f", "fra") for i in range(80)]
    taken = adverts.capped(pages, cap=30, french_cap=60)
    assert sum(1 for p in taken if p["org_id"] == "a") == 30
    assert sum(1 for p in taken if p["org_id"] == "f") == 60
    first = {"a049"}
    assert "a049" in {p["page_id"] for p in adverts.capped(pages, cap=1, first=first)}


def test_near_duplicates_keep_the_employer_copy_over_the_board_copy():
    body = [{"text": "Manage the warehouse and the fleet in Goma, report monthly to the logistics coordinator, "
                     "and train two storekeepers on stock control and safety rules in all sites.", "heading": False,
             "tag": "p"}]
    ads = [{"id": "b1", "source": "board", "lines": body}, {"id": "a1", "source": "archive", "lines": body},
           {"id": "x1", "source": "archive", "lines": [{"text": "A different advert about finance and audits in "
                                                                "Dakar with no overlap at all here.", "heading": False,
                                                        "tag": "p"}]}]
    assert adverts.near_duplicates(ads) == {"b1": "a1"}
    shared = " ".join(f"standard{i} block{i} text{i}" for i in range(40))
    two = [{"id": "j1", "source": "archive", "title": "Finance Officer",
            "lines": [{"text": shared + " reconcile the ledgers each month", "heading": False, "tag": "p"}]},
           {"id": "j2", "source": "archive", "title": "Logistics Officer",
            "lines": [{"text": shared + " run the warehouse in the north", "heading": False, "tag": "p"}]}]
    assert adverts.near_duplicates(two) == {}            # different jobs sharing an organisation's text
    two[1]["title"] = "Finance Officer"
    assert adverts.near_duplicates(two) == {"j2": "j1"}


def test_the_eight_word_copy_check():
    saved = adverts.eight_word_runs("manage a fleet of twelve vehicles and their drivers across three sites")
    assert adverts.copy_matches("We manage a fleet of twelve vehicles and their drivers today.", saved)
    assert not adverts.copy_matches("Manage the vehicles and drivers at three sites.", saved)
    assert not adverts.copy_matches('"manage a fleet of twelve vehicles and their drivers" *(std)*', saved)
    long_quote = '"' + "we manage a fleet of twelve vehicles and their drivers across three sites in the east" + \
        '" *(std)*'
    assert adverts.copy_matches(long_quote, saved)               # a quote of 15 words or more is not exempt


def row(**kw):
    base = {f: "" for f in adverts.ADVERT_FIELDS}
    base.update(advert_id="0123456789abcdef", org_id="seed:1", org_type="ingo", org_type_basis="rule", source="archive",
                batch="r2", system="own site", family_id="finance", function="finance", sector="none",
                level="officer", staff_consultant="unknown", national_international="unknown",
                humanitarian_development="unknown", field_hq="unknown", language="en", extraction="html",
                words_total="500", words_role="400", sections="6", held_out="false", facts_given="pay;hours",
                standard_basis="recurring")
    base.update(kw)
    return base


def write_rows(path, rows):
    with path.open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=adverts.ADVERT_FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def test_the_form_check_refuses_contacts_addresses_and_unknown_values(tmp_path):
    p = tmp_path / "broad-adverts.csv"
    write_rows(p, [row()])
    assert adverts.check_file(p, adverts.ADVERT_FIELDS) == []
    write_rows(p, [row(org_id="someone@example.org")])
    assert adverts.check_file(p, adverts.ADVERT_FIELDS)
    write_rows(p, [row(system="https://example.org/jobs/1")])
    assert adverts.check_file(p, adverts.ADVERT_FIELDS)
    write_rows(p, [row(function="astronaut")])
    assert adverts.check_file(p, adverts.ADVERT_FIELDS)
    write_rows(p, [row(facts_given="pay;secret_fact")])
    assert adverts.check_file(p, adverts.ADVERT_FIELDS)
    write_rows(p, [row(words_total="+254 712 345 678")])
    assert adverts.check_file(p, adverts.ADVERT_FIELDS)
    write_rows(p, [row(system="Logistics Officer at Acme, apply now!")])
    assert adverts.check_file(p, adverts.ADVERT_FIELDS)            # free text in a code column
    write_rows(p, [row(advert_id="1234567890123456", words_total="1234567890", org_id="irs:521231983")])
    assert adverts.check_file(p, adverts.ADVERT_FIELDS) == []      # register ids and counts are not phones
    assert adverts.check(roles_dir=tmp_path) == 0
    write_rows(p, [row(org_id="someone@example.org")])
    assert adverts.check(roles_dir=tmp_path) == 1


def test_real_organisation_id_shapes_pass_the_form_check(tmp_path):
    p = tmp_path / "broad-adverts.csv"
    ids = ["iati:XM-DAC-41/123", "acnc:28004778081", "eu:171598852000-42", "board-employer:h0123456789",
           "site:reach-iraq.org", "cra:100072586RR0001"]
    write_rows(p, [row(advert_id=f"{i:016x}", org_id=o) for i, o in enumerate(ids)])
    assert adverts.check_file(p, adverts.ADVERT_FIELDS) == []
    ad = {"employer": "", "url": "https://www.example.org/job/x"}
    assert adverts.board_org(dict(ad, employer="Some Local Group"), roles.Organisations(), {})[0].startswith(
        "board-employer:h")


def test_role_counts_with_register_ids_pass_the_form_check(tmp_path):
    with (tmp_path / "role-counts.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h, lineterminator="\n")
        w.writerow(roles.COUNT_FIELDS)
        w.writerow(["archive", "cc-2026", "cra:100072586RR0001", "foundation", "finance", "none", "officer",
                    "unknown", "unknown", "unknown", "unknown", "3"])
    assert adverts.check(roles_dir=tmp_path) == 0


def test_title_variants_must_be_seen_at_two_organisations(tmp_path):
    with (tmp_path / "title-variants.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h, lineterminator="\n")
        w.writerow(roles.VARIANT_FIELDS)
        w.writerow(["finance officer", "finance", "none", "officer", "en", "1", "3"])
    assert adverts.check(roles_dir=tmp_path) == 1


def warc_record(uri, http_head, body):
    payload = http_head.encode() + b"\r\n\r\n" + body
    warc = (f"WARC/1.0\r\nWARC-Type: response\r\nWARC-Target-URI: {uri}\r\n"
            f"Content-Length: {len(payload)}\r\n").encode()
    return gzip.compress(warc + b"\r\n" + payload)


def test_a_page_read_before_r0_is_extracted_only_where_r0_allows_it(tmp_path, monkeypatch):
    earlier = tmp_path / "earlier"
    earlier.mkdir()
    head = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8"
    for name, uri in (("01", "https://refuses.example/jobs/a-b-c"), ("02", "https://allows.example/jobs/a-b-c")):
        (earlier / f"{name}.warc.gz").write_bytes(warc_record(uri, head, b"<html><body><p>Duties</p></body></html>"))
    refused_id = adverts.page_id("https://refuses.example/jobs/a-b-c")
    work = tmp_path / "work"
    (work / "adverts").mkdir(parents=True)
    (work / "adverts" / f"{refused_id}.json").write_text("{}", encoding="utf-8")   # from an earlier run
    monkeypatch.setattr(adverts, "READING", tmp_path / "reading")
    monkeypatch.setattr(adverts, "WORK", work)
    monkeypatch.setattr(adverts, "EARLIER_PAGES", [earlier])
    monkeypatch.setattr(adverts, "RobotsVerdicts", lambda: FakeVerdicts({"https://allows.example/jobs/a-b-c"}))
    monkeypatch.setattr(adverts, "step_f_feed_adverts", list)
    adverts.extract()
    assert sorted(p.stem for p in (work / "adverts").glob("*.json")) == \
        [adverts.page_id("https://allows.example/jobs/a-b-c")]


def test_an_archived_record_is_decoded_chunked_and_gzipped():
    inner = gzip.compress(b"<html><body><p>hello archive</p></body></html>")
    chunked = hex(len(inner))[2:].encode() + b"\r\n" + inner + b"\r\n0\r\n\r\n"
    rec = warc_record("https://example.org/jobs/1",
                      "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Encoding: gzip\r\n"
                      "Content-Type: text/html; charset=utf-8", chunked)
    uri, body, _headers = adverts.http_body(rec)
    assert uri == "https://example.org/jobs/1" and b"hello archive" in body
    assert adverts.warc_uri(rec) == "https://example.org/jobs/1"


class FakeVerdicts:
    def __init__(self, allowed):
        self.allowed = allowed

    def verdict(self, url):
        return "allowed" if url in self.allowed else "forbidden"


def cand(pid, org, url, lang="eng"):
    return {"page_id": pid, "org_id": org, "url": url, "host": url.split("/")[2], "languages": lang,
            "system": "own site"}


def test_a_batch_plans_only_pages_r0_allowed_and_not_read_before():
    pages = [cand("p1", "a", "https://a.example/jobs/x-y-z"), cand("p2", "a", "https://a.example/jobs/forbidden-x-y"),
             cand("p3", "b", "https://b.example/jobs/a-b-c"), cand("p4", "b", "https://b.example/jobs/d-e-f", "deu")]
    v = FakeVerdicts({"https://a.example/jobs/x-y-z", "https://b.example/jobs/a-b-c", "https://b.example/jobs/d-e-f"})
    chosen = adverts.plan_batch("r2", pages, v, done={"p3"})
    assert [c["page_id"] for c in chosen] == ["p1"]       # p2 forbidden, p3 read before, p4 German
    assert adverts.plan_batch("r2", pages, v, done=set(), held={"a"}) == [pages[2]]
    assert adverts.plan_batch("r2", pages, v, done={"p3"}, asked={"p1", "p3"}) == []   # p1 asked before


def test_a_redone_plan_keeps_the_earlier_one_for_the_pages_it_read(tmp_path):
    folder = tmp_path / "r2"
    folder.mkdir()
    adverts.write_local(folder / "plan.csv", adverts.PLAN_FIELDS, [{"page_id": "p1", "crawl": "CC-MAIN-2026-39"}])
    (folder / "held-orgs.txt").write_text("un:1\n", encoding="utf-8")
    adverts.keep_earlier_plan(folder)
    assert not (folder / "plan.csv").exists() and not (folder / "held-orgs.txt").exists()
    adverts.write_local(folder / "plan.csv", adverts.PLAN_FIELDS, [{"page_id": "p2"}])
    files = adverts.plan_files(folder)
    assert len(files) == 2 and files[-1] == folder / "plan.csv"
    assert [r["page_id"] for f in files for r in adverts.read_csv(f)] == ["p1", "p2"]
    assert (files[0].parent / "held-orgs.txt").read_text(encoding="utf-8") == "un:1\n"


def test_pages_asked_before_are_read_from_the_requests_log(tmp_path):
    (tmp_path / "r2").mkdir()
    (tmp_path / "r2" / "requests.log").write_text(
        "2026-11-12T07:53:09+00:00\tGET\tr2 page a7c2b4091b5b0c4b\n"
        "2026-11-12T13:09:00+00:00\tGET\tr6 index CC-MAIN-2026-34 (3 blocks)\n", encoding="utf-8")
    assert adverts.asked_pages(tmp_path / "r1", tmp_path / "r2") == {"a7c2b4091b5b0c4b"}


def test_un_system_pages_are_held():
    assert roles.un_system("un_agency")
    assert roles.un_system("other", "jobs.ilo.org")
    assert roles.un_system("other", "careers.un.org")
    assert not roles.un_system("ingo", "www.acme.example")
    assert not roles.un_system("donor_government", "jobs.osce.org")


def test_the_ai_test_set_draw_caps_each_organisation():
    ads = []
    for org, name, n in (("o1", "IMPACT Initiatives", 63), ("o2", "World Relief", 39), ("o3", "CDP Worldwide", 11),
                         ("o4", "Technopolis Group", 3)):
        ads += [{"id": f"{org}-{i:02d}", "org_id": org, "org_name": name, "source": "step-f-feed"} for i in range(n)]
    ads += [{"id": f"cc-{i:03d}", "org_id": f"c{i % 40}", "org_name": "", "source": "archive"} for i in range(200)]
    pilot, test = adverts.ai_test_set(ads)
    assert len(pilot) == 20 and not set(pilot) & test
    by_org = {}
    for a in ads:
        if a["id"] in test:
            by_org[a["org_id"]] = by_org.get(a["org_id"], 0) + 1
    assert by_org["o1"] <= 10 and by_org["o2"] <= 10 and by_org["o3"] <= 5 and by_org.get("o4", 0) <= 1
    assert len(test) == 30
    assert adverts.ai_test_set(ads) == (pilot, test)       # fixed seed


def test_duty_lines_and_their_specificity():
    lines = adverts.duty_lines(adverts.advert_from_html(PAGE, "https://www.acme.example/jobs/x"))
    assert any(t.startswith("Manage a fleet") for t in lines)
    assert not any("bachelor" in t for t in lines)                 # requirements are not duties
    mixed = {"lines": [{"text": "Key responsibilities", "heading": True, "tag": "h2"},
                       {"text": "Prepare the monthly donor financial reports for the programme.", "heading": False,
                        "tag": "li"},
                       {"text": "4+ years of financial and accounting experience in an NGO.", "heading": False,
                        "tag": "li"}]}
    assert adverts.duty_lines(mixed) == ["Prepare the monthly donor financial reports for the programme."]
    assert adverts.specificity("Liaise with stakeholders as needed.")[0] == 0
    score, kinds = adverts.specificity("Submit a monthly report to the donor on the 12 sites using Kobo.")
    assert score == 3 and {"number", "frequency", "standard_or_tool"} <= set(kinds)


def test_the_partial_scores():
    # Guide v1.1: contract type+length and closing day+time each count as one fact; pay doubles.
    assert adverts.score_decision_facts(set(adverts.DECISION_FACTS)) == 3
    assert adverts.score_decision_facts(set(adverts.DECISION_FACTS) - {"pay"}) == 2
    assert adverts.score_decision_facts(set(adverts.DECISION_FACTS) - {"start_date"}) == 2   # 3 needs every fact
    assert adverts.score_decision_facts({"how_to_apply"}) == 0
    assert adverts.score_decision_facts({"pay", "contract_type"}) == 1  # length missing → contract absent
    assert adverts.score_readability(16) == 3 and adverts.score_readability(40) == 0
    # Length: in band + share ≤ 1/3 → 3; below lower but ≥ half lower → 2; far short → 0; share > 1/2 → 0
    assert adverts.score_length("ingo", 1200, 800, 0.2) == 3
    assert adverts.score_length("ingo", 1200, 400, 0.2) == 2
    assert adverts.score_length("ingo", 1200, 200, 0.2) == 0
    assert adverts.score_length("ingo", 2400, 2000, 0.2) == 0
    assert adverts.score_length("ingo", 1200, 800, 0.6) == 0
    assert adverts.score_length("ingo", 1200, 800, 0.4) == 2   # in band, share above one third
    assert adverts.score_length("foundation", 1200, 800, 0.2) is None
    # Findability: 3 needs all eight Google facts, not seven
    role = type("R", (), {"function": "finance", "level": "officer"})()
    assert adverts.score_findability(role, "Finance Officer", {k: True for k in range(8)}) == 3
    assert adverts.score_findability(role, "Finance Officer", {k: True for k in range(7)}) == 2


def given(text):
    return {k for k, p in adverts.FACTS.items() if p.search(text)}


def test_pay_needs_a_figure_or_a_named_scale():
    for text in ("Salary: USD 2,500 per month", "KES 120,000 - 150,000 gross", "The salary is 45,000 a year",
                 "Grade P-3 on the UN salary scale", "Annual net base salary plus allowances", "INR 6 lakhs per annum"):
        assert "pay" in given(text), text
    for text in ("a network of 25 partners", "the annual report 2025", "internet 24 hours a day",
                 "competitive salary and benefits", "monthly meetings with 12 partners"):
        assert "pay" not in given(text), text
    assert "pay_vague" in given("We offer a competitive salary and benefits.")


def test_other_facts_do_not_fire_on_ordinary_words():
    assert "hours" not in given("reduce stunting by 20% across the district")
    assert "hours" in given("This is a 50% FTE position.")
    assert "contract_length" not in given("Minimum 5 years in a similar role; founded 30 years ago.")
    assert "contract_length" in given("A 12-month fixed-term contract.")
    assert "contract_length" in given("Duration of the assignment: 6 months")
    assert "duty_station" not in given("Au lieu de cela, le projet continue.")
    assert "duty_station" in given("Lieu d'affectation : Goma")
    assert "languages" not in given("Good language and writing skills.")
    assert "languages" in given("Fluency in French and English is required.")


def restricted(text):
    return adverts.restrictions_of(text)


def test_restrictions_found_by_the_re_review():
    for text in ("You will work with children under 18 years.", "youth aged 15 to 35 years",
                 "Candidates will train women aged 15-49 years.", "The post is open to all nationals.",
                 "Open to nationals and non-nationals.", "You will work at a height of 3 metres.",
                 "presentable reports for donors", "Run a safe space for women only."):
        assert not restricted(text) - {"national_post"}, text
    assert restricted("Candidates should be between 25 and 40 years old.") == {"age"}
    assert restricted("Applicants should be 35 years or younger.") == {"age"}
    assert restricted("Age: 25 - 35 years") == {"age"}
    assert restricted("This position is for women only.") == {"sex"}
    assert restricted("You must be an EU citizen.") == {"nationality"}
    assert restricted("National Professional Officer, NOB") == {"national_post"}
    assert restricted("national professional officer") == {"national_post"}


def test_more_fact_and_years_cases_from_the_re_review():
    assert "pay" not in adverts.facts_of("Salary range: commensurate with experience.")
    assert "pay_vague" in adverts.facts_of("Salary range: commensurate with experience.")
    assert "pay" not in adverts.facts_of("Remuneration according to the 2024 policy.")
    assert "pay" in adverts.facts_of("A monthly allowance of 15,000 is paid.")
    assert "contract_length" not in adverts.facts_of("The position requires a minimum of 5 years of relevant experience.")
    assert "contract_length" in adverts.facts_of("The position is for 12 months, renewable.")
    assert "hours" not in adverts.facts_of("You may be called outside working hours.")
    assert "duty_station" not in adverts.facts_of("We run evidence-based in-country programmes.")
    assert adverts.years_asked("Over 10 years of experience in finance.") == ("10", "")
    assert adverts.years_asked("Experience working with children under 5 years.") == ("", "")
    assert adverts.years_asked("Founded 30 years ago, we seek 4 years of experience in grants.") == ("4", "")
    assert {k for k, p in adverts.INCLUSION.items() if p.search("Referent (m/f/d)")} == {"both_sexes_mark"}
    assert adverts.section_type("About the team") == "working_relationships"
    assert adverts.section_type("About the Candidate") == "essential_requirements"


def test_travel_and_hours_are_not_required_for_a_3_and_pay_lifts_a_0():
    core = set(adverts.DECISION_FACTS) - adverts.OPTIONAL_FACTS
    assert adverts.score_decision_facts(core) == 3
    assert adverts.score_decision_facts({"pay"}) == 1


def test_restrictions_need_the_applicant_as_their_subject():
    for text in ("services for children under 18 years", "women aged 15-49 years in the district",
                 "youth aged 15 to 35 years", "contracts not exceeding 12 months", "do not include a photo",
                 "at the height of the crisis", "the only women's rights network in the region",
                 "unmarried adolescent girls", "candidates must be physically fit for field travel",
                 "les enfants âgés de moins de 5 ans"):
        assert not restricted(text) - {"national_post"}, text
    assert restricted("Applicants must be aged between 25 and 35 years.") == {"age"}
    assert restricted("Maximum age: 35") == {"age"}
    assert restricted("Candidates must be able-bodied.") == {"disability"}
    assert restricted("Female applicants only.") == {"sex"}
    assert restricted("Please attach a recent passport-size photo.") == {"photo_appearance"}
    assert restricted("This is a national position.") == {"national_post"}
    assert "national_post" not in adverts.FAIRNESS_CATEGORIES


def test_the_both_sexes_mark_is_its_own_inclusion_item():
    inc = {k for k, p in adverts.INCLUSION.items() if p.search("Chargé de projet (H/F)")}
    assert inc == {"both_sexes_mark"}


def test_years_ranges_additional_years_and_ages():
    assert adverts.years_asked("5 to 7 years of experience in finance") == ("5", "")
    assert adverts.years_asked("2-3 years of relevant experience") == ("2", "")
    assert adverts.years_asked("Experience with children under 5 years; 4 years of experience in nutrition.") == \
        ("4", "")
    un = ("A minimum of five years of relevant experience. A first-level university degree plus two "
          "additional years of qualifying experience may replace the advanced degree.")
    assert adverts.years_asked(un) == ("5", "7")
    semi = ("A master's degree with seven years of relevant experience; alternatively a bachelor's degree with "
            "nine years of relevant experience.")
    assert adverts.years_asked(semi) == ("7", "9")


def test_degree_words_that_are_not_degrees():
    assert adverts.degree_asked("A valid driving licence is required") == ""
    assert adverts.degree_asked("Mastery of Excel; payments by Mastercard") == ""
    assert adverts.degree_asked("La maîtrise du français est requise") == ""         # mastery of a language
    assert adverts.degree_asked("Maîtrise en sciences sociales") == "master"
    assert adverts.degree_asked("Permis de conduire et licence de conduire exigés") == ""
    assert adverts.degree_asked("Licence en économie ou équivalent") == "bachelor"
    assert adverts.degree_asked("Master's degree in public health") == "master"


def test_about_the_role_is_not_organisation_text():
    assert adverts.section_type("About the role") == "role_purpose"
    assert adverts.section_type("About the job") == "role_purpose"
    assert adverts.section_type("About you") == "essential_requirements"
    assert adverts.section_type("About Acme Relief") == "about_organisation"
    assert adverts.section_type("About us") == "about_organisation"
    assert adverts.section_type("Overview of the organisation") == "about_organisation"
    assert adverts.section_type("Location") == "header_facts"


def test_site_furniture_removal_keeps_standard_sentences():
    eo = "Acme Relief, an equal opportunity employer, never charges a fee at any stage of hiring."
    ads = [{"org_id": "o", "method": "html", "lines": [{"text": "Home", "heading": False, "tag": "a"},
                                                        {"text": eo, "heading": False, "tag": "p"},
                                                        {"text": f"Duty {i}", "heading": False, "tag": "p"}]}
           for i in range(4)]
    chrome = adverts.chrome_lines(ads)["o"]
    assert "Home" in chrome and eo not in chrome
    short = "We are an equal opportunity employer."
    for a in ads:
        a["lines"].append({"text": short, "heading": False, "tag": "p"})
    assert short not in adverts.chrome_lines(ads)["o"]


def test_the_ai_test_set_stays_frozen_and_is_only_topped_up():
    ads = [{"id": f"o1-{i:02d}", "org_id": "o1", "org_name": "IMPACT Initiatives", "source": "step-f-feed"}
           for i in range(40)]
    ads += [{"id": f"cc-{i:03d}", "org_id": f"c{i % 5}", "org_name": "", "source": "archive"} for i in range(6)]
    pilot, test = adverts.ai_test_set(ads)
    more = ads + [{"id": f"cd-{i:03d}", "org_id": f"d{i}", "org_name": "", "source": "archive"} for i in range(50)]
    pilot2, test2 = adverts.ai_test_set(more, {"pilot": pilot, "test": sorted(test)})
    assert pilot2 == pilot and test <= test2 and len(test2) == 30


def test_board_employer_is_read_after_the_last_at():
    orgs = roles.Organisations()
    names = {"savethechildren": "org:stc"}
    ad = {"employer": "", "url": "https://www.example.org/job/finance-officer-at-save-the-children-3"}
    assert adverts.board_org(ad, orgs, names) == ("org:stc", "matched by name")
    ad = {"employer": "", "url": "https://www.example.org/job/finance-officer-kampala"}
    assert adverts.board_org(ad, orgs, names)[0] == "board-employer:unknown-board"
    ad = {"employer": "", "url": "https://www.example.org/job/head-of-at-risk-programmes-at-save-the-children"}
    assert adverts.board_org(ad, orgs, names) == ("org:stc", "matched by name")    # the last "-at-"


def test_a_board_that_names_itself_gives_way_to_the_pages_organisation_link():
    page = '<a href="/organisations/acme-health-trust">Acme Health Trust</a>'
    assert adverts.board_employer("Ground Zero", page, "groundzero") == "acme health trust"
    assert adverts.board_employer("Evidence Partners", page, "myjobmag") == "Evidence Partners"
    assert adverts.board_employer("", "<p>no link</p>", "ngojobsinafrica") == ""
    own = '<a href="/company/groundzerocommunity">Ground Zero</a>'
    assert adverts.board_employer("Ground Zero", own, "groundzero") == ""
    assert adverts.board_org({"employer": "", "url": "https://x.example/jobs/1", "system": "groundzero"},
                             roles.Organisations(), {})[0] == "board-employer:unknown-groundzero"
    names = {"actionagainsthunger": "org:acf"}
    ad = {"employer": "Action Against Hunger | ACF Nigeria LTD", "url": "https://www.example.org/job/x"}
    assert adverts.board_org(ad, roles.Organisations(), names) == ("org:acf", "matched by name")


def test_r6_keeps_the_latest_allowed_capture_of_each_reliefweb_job():
    def row(url, crawl, status="200", mime="text/html", lang="eng"):
        return {"url": url, "status": status, "mime": mime, "languages": lang, "offset": "1", "length": "2",
                "filename": f"crawl-data/{crawl}/segments/x.warc.gz"}
    rows = [row("https://reliefweb.int/job/4100001/finance-officer", "CC-MAIN-2026-34"),
            row("https://reliefweb.int/job/4100001/finance-officer", "CC-MAIN-2026-43"),
            row("https://reliefweb.int/job/4100002/chargee-de-programme", "CC-MAIN-2026-39", lang="fra"),
            row("https://reliefweb.int/job/4100003/x", "CC-MAIN-2026-39", lang="deu"),
            row("https://reliefweb.int/job/4100004/x", "CC-MAIN-2026-39", status="301"),
            row("https://reliefweb.int/jobs?search=x", "CC-MAIN-2026-39"),
            row("https://reliefweb.int/job/4100005/x", "CC-MAIN-2026-39")]
    chosen = adverts.select_r6(rows, lambda url: "forbidden" if "4100005" in url else "allowed")
    assert sorted(c["url"].split("/")[4] for c in chosen) == ["4100001", "4100002"]
    assert {c["crawl"] for c in chosen if "4100001" in c["url"]} == {"CC-MAIN-2026-43"}
    assert all(c["org_id"] == "board-employer:reliefweb" and c["system"] == "reliefweb" for c in chosen)
    assert len(adverts.select_r6(rows, lambda url: "allowed", n=1)) == 1


def test_a_failed_reliefweb_robots_read_is_retried_only_an_hour_later(tmp_path):
    from datetime import UTC, datetime, timedelta
    record = tmp_path / "abc.json"
    first = datetime(2026, 11, 12, 12, 0, tzinfo=UTC)
    assert adverts.r6_may_retry(record, first)                       # never tried
    record.write_text(json.dumps({"status": None, "read_at": first.isoformat()}), encoding="utf-8")
    assert not adverts.r6_may_retry(record, first + timedelta(minutes=59)) and record.exists()
    assert adverts.r6_may_retry(record, first + timedelta(hours=1))
    assert not record.exists() and (tmp_path / "abc.failed-1.json").exists()   # kept aside, not replayed
    second = first + timedelta(hours=1, minutes=5)
    record.write_text(json.dumps({"status": None, "read_at": second.isoformat()}), encoding="utf-8")
    assert not adverts.r6_may_retry(record, second + timedelta(minutes=30))
    record.write_text(json.dumps({"status": 200, "read_at": second.isoformat()}), encoding="utf-8")
    assert adverts.r6_may_retry(record, second) and record.exists()  # an answer is replayed, not asked again


def test_a_refused_reliefweb_robots_answer_on_disk_ends_r6_without_a_request(tmp_path, monkeypatch):
    monkeypatch.setattr(adverts, "READING", tmp_path)
    bodies = tmp_path / "r6" / "live" / "bodies"
    bodies.mkdir(parents=True)
    (tmp_path / "r6" / "live" / "state.json").write_text(json.dumps(
        {"refusals": [["reliefweb.int", "aws"]], "failures": 0, "blocked_hosts": ["reliefweb.int"]}), encoding="utf-8")
    (bodies / f"{adverts.page_id('https://reliefweb.int/robots.txt')}.json").write_text(json.dumps(
        {"status": 202, "error": "", "protection": "AWS WAF", "read_at": "2026-11-12T13:09:32+00:00"}),
        encoding="utf-8")
    assert adverts.fetch_r6_robots() == 1
    assert "R6 ends" in (tmp_path / "r6" / "stopped.txt").read_text(encoding="utf-8")
    assert adverts.live_requests_sent(tmp_path / "r6" / "live") == 0
    assert adverts.r6_index() == 0 and adverts.requests_sent(tmp_path / "r6") == 0
    with pytest.raises(adverts.Stopped):
        adverts.plan_r6()


def test_a_reliefweb_employer_outside_the_list_is_estimated_international():
    ad = {"employer": "Acme Relief Alliance", "url": "https://reliefweb.int/job/4100001/x", "system": "reliefweb"}
    oid, basis, t = adverts.board_identity(ad, roles.Organisations(), {})
    assert oid.startswith("board-employer:h") and t == "ingo" and basis == "board default (Estimate)"
    oid, basis, t = adverts.board_identity(dict(ad, system="myjobmag"), roles.Organisations(), {})
    assert t == "national_ngo_south"
    page = '<a href="https://reliefweb.int/organization/acme-relief">Acme Relief</a>'
    assert adverts.board_employer("ReliefWeb", page, "reliefweb") == "acme relief"


def test_a_board_copy_with_at_employer_is_still_a_copy():
    body = [{"text": " ".join(f"word{i}" for i in range(80)), "heading": False, "tag": "p"}]
    ads = [{"id": "a1", "source": "archive", "title": "Finance Officer", "lines": body},
           {"id": "b1", "source": "board", "title": "Finance Officer at Acme Relief", "lines": body},
           {"id": "f1", "source": "step-f-feed", "title": "Finance Officer", "lines": body}]
    assert adverts.near_duplicates(ads) == {"a1": "f1", "b1": "f1"}   # step F's feed copy is kept
    assert adverts.near_duplicates(ads, keep={"a1"}) == {"b1": "a1", "f1": "a1"}   # a held-out advert is kept
    shared = " ".join(f"word{i}" for i in range(100))
    two = [{"id": "a2", "source": "archive", "title": "Finance Officer",
            "lines": [{"text": shared + " apply by email to the team", "heading": False, "tag": "p"}]},
           {"id": "b2", "source": "board", "title": "Finance Officer at Acme Relief",
            "lines": [{"text": shared + " see more jobs like this today on the board", "heading": False,
                       "tag": "p"}]}]
    assert adverts.near_duplicates(two) == {"b2": "a2"}             # 0.8 to 0.95 alike, same job


class FakeResponse:
    def __init__(self, status, body=b""):
        self.status_code, self.body, self.closed = status, body, False

    def iter_content(self, size):
        for i in range(0, len(self.body), size):
            yield self.body[i:i + size]

    def close(self):
        self.closed = True


class FakeSession:
    def __init__(self, answers):
        self.answers, self.calls = list(answers), 0

    def get(self, *a, **k):
        self.calls += 1
        return self.answers.pop(0)


def reader(tmp_path, answers, cap=3):
    return adverts.ArchiveReader(tmp_path, cap, session=FakeSession(answers), sleep=lambda s: None)


def test_the_archive_batch_size_holds_across_runs(tmp_path):
    r = reader(tmp_path, [FakeResponse(206, b"x" * 10)] * 2, cap=3)
    assert r.get("crawl-data/a", 0, 10, "p1") and r.get("crawl-data/a", 0, 10, "p2")
    r2 = reader(tmp_path, [FakeResponse(206, b"x" * 10)] * 5, cap=3)
    assert r2.get("crawl-data/a", 0, 10, "p3")
    try:
        r2.get("crawl-data/a", 0, 10, "p4")
        raise AssertionError("the batch's size was not kept")
    except adverts.Stopped:
        pass
    assert r2.session.calls == 1


def test_the_archive_reader_never_retries_and_reads_no_further_than_the_record(tmp_path):
    s = FakeSession([FakeResponse(404), FakeResponse(200, b"y" * 10_000_000)])
    r = adverts.ArchiveReader(tmp_path, 10, session=s, sleep=lambda x: None)
    assert r.get("crawl-data/a", 0, 10, "p1") is None and s.calls == 1
    assert r.get("crawl-data/a", 0, 10, "p2") is None              # a 200 is not a byte range: not read
    big = FakeSession([FakeResponse(206, b"z" * 1_000_000)])
    assert adverts.ArchiveReader(tmp_path / "b", 10, session=big, sleep=lambda x: None).get(
        "crawl-data/a", 0, 10, "p3") is None


def test_a_403_stops_the_archive_batch_for_good(tmp_path):
    r = reader(tmp_path, [FakeResponse(403)], cap=10)
    try:
        r.get("crawl-data/a", 0, 10, "p1")
        raise AssertionError("a 403 did not stop the batch")
    except adverts.Stopped:
        pass
    try:
        reader(tmp_path, [FakeResponse(206, b"x")], cap=10)
        raise AssertionError("a stopped batch was resumed")
    except adverts.Stopped:
        pass


def test_a_planned_row_is_checked_again_before_it_is_read(monkeypatch):
    monkeypatch.setattr(adverts, "UN_PAGES_ALLOWED", False)       # the hold, as it stood until 12 November 2026
    v = FakeVerdicts({"https://a.example/jobs/x-y-z"})
    ok = {"url": "https://a.example/jobs/x-y-z", "filename": "crawl-data/x", "languages": "eng"}
    assert adverts.row_still_allowed(ok, v, set()) == ""
    assert adverts.row_still_allowed(dict(ok, url="https://a.example/jobs/other-x-y"), v, set()) == "not allowed by R0"
    assert adverts.row_still_allowed(dict(ok, url="https://acme.wd1.myworkdayjobs.com/x"), v, set()) == "shell host"
    assert adverts.row_still_allowed(dict(ok, languages="deu"), v, set()) == "language outside wave 1"
    assert adverts.row_still_allowed(dict(ok, url="https://jobs.ilo.org/x"), v, set()).startswith("held")
    assert adverts.row_still_allowed(ok, v, {"a.example"}).startswith("held")


def test_un_pages_are_read_since_the_users_decision():
    assert adverts.UN_PAGES_ALLOWED
    v = FakeVerdicts({"https://jobs.ilo.org/jobs/x-y-z"})
    row = {"url": "https://jobs.ilo.org/jobs/x-y-z", "filename": "crawl-data/x", "languages": "eng"}
    assert adverts.row_still_allowed(row, v, set()) == ""
    pages = [{"org_id": "un:1", "host": "jobs.ilo.org"}]
    assert adverts.held_organisations(pages, roles.Organisations()) == set()


class FakeFetcher:
    """Answers by host; writes one resolver line per request, as the counting resolver does."""

    def __init__(self, folder, answers):
        self.folder, self.answers, self.urls = folder, answers, []

    def get(self, url, what):
        self.urls.append(url)
        with (self.folder / "resolver.log").open("a", encoding="utf-8") as h:
            h.write(f"x\t{what}\n")
        host = url.split("/")[2]
        answer = self.answers.get(url, self.answers.get(host, (200, b"<html></html>")))
        if isinstance(answer, dict):
            return {"headers": {}, "error": "", "bytes": len(answer.get("body", b"")), **answer}
        status, body = answer
        return {"status": status, "final_url": url, "headers": {}, "body": body, "error": "", "bytes": len(body)}


def live(tmp_path, answers, cap=20):
    f = FakeFetcher(tmp_path, answers)
    return adverts.LiveRun("r3", cap, fetcher=f, folder=tmp_path), f


def test_a_resumed_live_run_does_not_ask_a_host_that_refused(tmp_path):
    run, _ = live(tmp_path, {"bad.example": (403, b"no")})
    run.get("https://bad.example/a", "page")
    run2, f2 = live(tmp_path, {})
    run2.get("https://bad.example/a", "page")          # cached: blocks the host again
    assert run2.get("https://bad.example/b", "page") is None and f2.urls == []


def test_the_live_batch_size_holds_across_runs(tmp_path):
    run, _ = live(tmp_path, {}, cap=2)
    run.get("https://a.example/1", "page")
    run2, f2 = live(tmp_path, {}, cap=2)
    run2.get("https://a.example/2", "page")
    assert adverts.live_requests_sent(tmp_path) == 2
    assert run2.get("https://a.example/3", "page") is None and run2.stopped and len(f2.urls) == 1


class PolicyNet:
    """The fetch policy's lowest step replaced: each call is one request the policy would send. It
    asks the policy's resolver first, as the real step does, so the counting resolver sees it."""

    def __init__(self, routes):
        self.routes, self.sent = routes, []

    async def hop(self, url, method, headers, timeout, max_bytes, resolver, backend_factory, pool_factory,
                  dns_timeout, body=b""):
        from urllib.parse import urlsplit as split
        assert body == b""                              # the survey sends no body (only Workday's POST does)
        addresses = await resolver(split(url).hostname, 443)
        assert addresses == ["93.184.216.34"]          # the lookup's own answer reaches the policy
        self.sent.append(url)
        status, location, body = self.routes.get(url, (404, None, b""))
        if isinstance(status, Exception):
            raise status
        return status, {"content-type": "text/html", **({"location": location} if location else {})}, \
            (None if location else body), location


def real_run(tmp_path, monkeypatch, routes, cap=50):
    """A live run through the real confirm.Fetcher and fetch policy; only the network step is fake."""
    import confirm
    from contracts import outbound
    net = PolicyNet(routes)

    async def no_wait(*_a, **_k):
        return None

    async def lookup(host, port):
        return ["93.184.216.34"]

    monkeypatch.setattr(outbound, "_hop", net.hop)
    monkeypatch.setattr(outbound, "_sleep", no_wait)
    monkeypatch.setattr(outbound, "_robots", type(outbound._robots)())
    monkeypatch.setattr(outbound, "_last_answer", type(outbound._last_answer)())
    monkeypatch.setattr(confirm.time, "sleep", lambda s: None)
    return adverts.LiveRun("r3", cap, folder=tmp_path, lookup=lookup), net


def test_every_request_the_policy_sends_is_counted(tmp_path, monkeypatch):
    routes = {"https://a.example/x": (301, "https://www.a.example/y", None),
              "https://www.a.example/y": (302, "https://www.a.example/z", None),
              "https://www.a.example/z": (outbound_error("timeout"), None, None)}
    run, net = real_run(tmp_path, monkeypatch, routes)
    run.get("https://a.example/x", "page")
    # two robots.txt reads (a.example, www.a.example), three page hops, the last timing out
    assert len(net.sent) == 5 and adverts.live_requests_sent(tmp_path) == 5


def test_the_policys_robots_redirects_are_counted_and_the_size_is_a_hard_limit(tmp_path, monkeypatch):
    routes = {f"https://a.example/r{i}": (301, f"https://a.example/r{i + 1}", None) for i in range(6)}
    routes["https://a.example/robots.txt"] = (301, "https://a.example/r0", None)
    run, net = real_run(tmp_path, monkeypatch, routes, cap=4)
    run.get("https://a.example/page", "page")
    assert len(net.sent) == 4 and adverts.live_requests_sent(tmp_path) == 4
    assert run.stopped


def test_a_redirect_off_the_site_is_never_contacted(tmp_path, monkeypatch):
    routes = {"https://b.example/x": (302, "https://other.example/z", None)}
    run, net = real_run(tmp_path, monkeypatch, routes)
    meta = run.get("https://b.example/x", "page")
    assert not any("other.example" in u for u in net.sent)
    assert meta["body"] == b"" and meta["error"].startswith("redirected off the site")
    assert "b.example" in run.blocked_hosts and not run.failures and not run.refusals


def test_a_normal_page_after_an_off_site_one_is_kept(tmp_path, monkeypatch):
    routes = {"https://b.example/x": (302, "https://other.example/z", None),
              "https://c.example/y": (200, None, b"<p>a page</p>")}
    run, _ = real_run(tmp_path, monkeypatch, routes)
    run.get("https://b.example/x", "page")
    meta = run.get("https://c.example/y", "page")
    assert meta["body"] == b"<p>a page</p>" and "c.example" not in run.blocked_hosts


def test_a_resumed_run_judges_a_host_on_its_own_robots_answer(tmp_path, monkeypatch):
    routes = {"https://c.example/robots.txt": (404, None, b""),
              "https://b.example/x": (302, "https://c.example/z", None),
              "https://c.example/y": (200, None, b"<p>c page</p>")}
    run, _ = real_run(tmp_path, monkeypatch, routes)
    assert run.robots("c.example")                       # run 1 keeps c.example's robots.txt answer on disk
    from contracts import outbound
    monkeypatch.setattr(outbound, "_robots", type(outbound._robots)())   # a new process
    run2 = adverts.LiveRun("r3", 50, folder=tmp_path, lookup=run.resolver.lookup)
    run2.get("https://b.example/x", "page")              # off the site: c.example's robots read refused
    assert run2.robots("c.example")                      # answered from disk, handed to the policy
    meta = run2.get("https://c.example/y", "page")
    assert meta["body"] == b"<p>c page</p>" and "c.example" not in run2.blocked_hosts


def test_the_policy_follows_at_most_two_redirects(tmp_path, monkeypatch):
    routes = {f"https://a.example/p{i}": (302, f"https://a.example/p{i + 1}", None) for i in range(5)}
    run, net = real_run(tmp_path, monkeypatch, routes)
    meta = run.get("https://a.example/p0", "page")
    assert meta["error"] == "redirect limit" and len([u for u in net.sent if "/p" in u]) == 3


def outbound_error(message):
    from contracts.outbound import FetchError
    return FetchError(message)


def test_live_state_reloads_refusals_and_a_cached_robots_refusal_blocks(tmp_path):
    run, _ = live(tmp_path, {"a.example": (403, b""), "b.example": (403, b"")}, cap=50)
    run.get("https://a.example/x", "page")
    run.get("https://b.example/x", "page")
    run2, _ = live(tmp_path, {}, cap=50)
    assert len(run2.refusals) == 2 and {"a.example", "b.example"} <= run2.blocked_hosts
    f = tmp_path / "f"
    runf, _ = live(f, {"c.example": (None, b""), "d.example": (None, b"")}, cap=50)
    runf.get("https://c.example/x", "page")
    runf.get("https://d.example/x", "page")
    assert live(f, {}, cap=50)[0].failures == 2                     # the failure streak reloads
    run3, _ = live(tmp_path / "r", {"https://c.example/robots.txt": (403, b"")}, cap=50)
    assert run3.robots("c.example") is False
    run4, f4 = live(tmp_path / "r", {}, cap=50)
    assert run4.robots("c.example") is False and run4.get("https://c.example/page", "page") is None
    assert f4.urls == []


def test_refusals_on_the_final_host_and_robots_errors_block_hosts(tmp_path):
    run, _ = live(tmp_path, {"https://a.example/x": {"status": 403, "final_url": "https://www.a.example/y",
                                                     "body": b""},
                             "https://b.example/x": {"status": None, "final_url": "", "body": b"",
                                                     "error": "robots.txt forbids this address"}}, cap=50)
    run.get("https://a.example/x", "page")
    assert {"a.example", "www.a.example"} <= run.blocked_hosts and run.refusals[-1][0] == "www.a.example"
    run.get("https://b.example/x", "page")
    assert "b.example" in run.blocked_hosts and not run.failures


def test_a_saved_off_site_record_blocks_its_host_again(tmp_path):
    meta = {"url": "https://b.example/x", "what": "page", "status": None, "error": "redirected off the site, "
            "not followed (off the site (other.example))", "final_url": "", "protection": "", "content_type": ""}
    run, f = live(tmp_path, {}, cap=50)
    (tmp_path / "bodies" / f"{adverts.page_id(meta['url'])}.json").write_text(json.dumps(meta), encoding="utf-8")
    run.get("https://b.example/x", "page")
    assert "b.example" in run.blocked_hosts and run.get("https://b.example/other", "page") is None and not f.urls


def test_the_next_page_must_be_the_next_number(tmp_path):
    listing = b'<a href="https://board.example/job/a-b-c/">x</a><a href="https://board.example/page/3/">3</a>'
    run, f = live(tmp_path, {"https://board.example/": (200, listing)}, cap=50)
    cfg = {"listings": ["https://board.example/"], "next": r"/page/(\d+)/?$",
           "link": r"^https://board\.example/job/[^/?#]+/?$", "adverts": 5, "listing_pages": 3}
    adverts.board_pages(run, "b", cfg, random.Random(1))
    assert "https://board.example/page/3/" not in f.urls


def test_r5_is_held_while_un_pages_are_not_allowed(tmp_path, monkeypatch):
    import argparse
    monkeypatch.setattr(adverts, "READING", tmp_path)
    monkeypatch.setattr(adverts, "UN_PAGES_ALLOWED", False)
    assert adverts.fetch_live(argparse.Namespace(batch="r5", cap=0, un_terms_decided=False)) == 0
    assert adverts.live_requests_sent(tmp_path / "r5") == 0


def test_a_slow_down_answer_doubles_the_spacing(tmp_path):
    waits = []
    s = FakeSession([FakeResponse(503), FakeResponse(206, b"x"), FakeResponse(206, b"x")])
    clock = iter(range(0, 1000, 1))
    r = adverts.ArchiveReader(tmp_path, 10, session=s, sleep=waits.append, clock=lambda: next(clock))
    for i in range(3):
        r.get("crawl-data/a", 0, 1, f"p{i}")
    assert abs(r.interval - 12.8) < 1e-9 and max(waits) > 15        # 10 doubled to 20, eased twice to 12.8
    assert abs(adverts.ArchiveReader(tmp_path, 10, session=s, sleep=lambda x: None).interval - 12.8) < 1e-9


def test_archive_streaks_persist_and_redirects_are_not_followed(tmp_path):
    s = FakeSession([FakeResponse(429)])
    adverts.ArchiveReader(tmp_path, 10, session=s, sleep=lambda x: None).get("crawl-data/a", 0, 10, "p1")
    try:
        reader(tmp_path, [FakeResponse(503)], cap=10).get("crawl-data/a", 0, 10, "p2")
        raise AssertionError("two refusals in a row across runs did not stop the batch")
    except adverts.Stopped:
        pass
    f = tmp_path / "f"
    for i in range(2):
        reader(f, [FakeResponse(302)], cap=10).get("crawl-data/a", 0, 10, f"p{i}")
    try:
        reader(f, [FakeResponse(500)], cap=10).get("crawl-data/a", 0, 10, "p3")
        raise AssertionError("three failures in a row did not stop the batch")
    except adverts.Stopped:
        pass


class RecordingSession(FakeSession):
    def get(self, *a, **k):
        self.kwargs = k
        return super().get(*a, **k)


def test_the_archive_session_does_not_follow_redirects(tmp_path):
    s = RecordingSession([FakeResponse(206, b"x")])
    adverts.ArchiveReader(tmp_path, 10, session=s, sleep=lambda x: None).get("crawl-data/a", 0, 1, "p1")
    assert s.kwargs["allow_redirects"] is False


def test_fetch_archive_checks_each_row_again(tmp_path, monkeypatch):
    import argparse
    folder = tmp_path / "r1"
    folder.mkdir()
    rows = [{"page_id": "p1", "org_id": "seed:1", "system": "own site", "host": "a.example", "crawl": "",
             "languages": "eng", "filename": "crawl-data/x", "offset": "0", "length": "1",
             "url": "https://a.example/jobs/x-y-z"},
            {"page_id": "p2", "org_id": "seed:2", "system": "own site", "host": "b.example", "crawl": "",
             "languages": "eng", "filename": "crawl-data/y", "offset": "0", "length": "1",
             "url": "https://b.example/jobs/x-y-z"},
            {"page_id": "p3", "org_id": "un:1", "system": "own site", "host": "c.example", "crawl": "",
             "languages": "eng", "filename": "crawl-data/z", "offset": "0", "length": "1",
             "url": "https://c.example/jobs/x-y-z"}]
    adverts.write_local(folder / "plan.csv", adverts.PLAN_FIELDS, rows)
    monkeypatch.setattr(adverts, "READING", tmp_path)
    monkeypatch.setattr(adverts, "RobotsVerdicts",
                        lambda: FakeVerdicts({"https://a.example/jobs/x-y-z", "https://c.example/jobs/x-y-z"}))
    args = argparse.Namespace(batch="r1", cap=0)
    assert adverts.fetch_archive(args) == 1                          # no held lists: refused
    (folder / "held-hosts.txt").write_text("\n", encoding="utf-8")
    assert adverts.fetch_archive(args) == 1                          # the held organisations missing: refused
    (folder / "held-orgs.txt").write_text("un:1\n", encoding="utf-8")
    s = FakeSession([FakeResponse(206, b"x")] * 3)
    real = adverts.ArchiveReader
    monkeypatch.setattr(adverts, "ArchiveReader", lambda f, c: real(f, c, session=s, sleep=lambda x: None))
    adverts.fetch_archive(args)
    assert s.calls == 1 and (folder / "pages" / "p1.warc.gz").exists()   # p2 not allowed, p3 held


def test_fetch_archive_never_asks_for_a_page_again(tmp_path, monkeypatch):
    import argparse
    folder = tmp_path / "r2"
    folder.mkdir()
    rows = [{"page_id": f"{i:016x}", "org_id": "seed:1", "system": "own site", "host": "a.example", "crawl": "",
             "languages": "eng", "filename": "crawl-data/x", "offset": "0", "length": "1",
             "url": f"https://a.example/jobs/x-y-{i}"} for i in (1, 2)]
    adverts.write_local(folder / "plan.csv", adverts.PLAN_FIELDS, rows)
    for name in ("held-hosts.txt", "held-orgs.txt"):
        (folder / name).write_text("\n", encoding="utf-8")
    (folder / "requests.log").write_text(f"2026-11-12T07:53:09+00:00\tGET\tr2 page {1:016x}\n", encoding="utf-8")
    monkeypatch.setattr(adverts, "READING", tmp_path)
    monkeypatch.setattr(adverts, "RobotsVerdicts", lambda: FakeVerdicts({r["url"] for r in rows}))
    s = FakeSession([FakeResponse(206, b"x")] * 2)
    real = adverts.ArchiveReader
    monkeypatch.setattr(adverts, "ArchiveReader", lambda f, c: real(f, c, session=s, sleep=lambda x: None))
    adverts.fetch_archive(argparse.Namespace(batch="r2", cap=0))
    assert s.calls == 1 and (folder / "pages" / f"{2:016x}.warc.gz").exists()
    assert not (folder / "pages" / f"{1:016x}.warc.gz").exists()          # asked on 12 November: not again


def page_ad(i, host="acme.example", words=200):
    text = " ".join(f"duty{i}x{j}" for j in range(words))
    return {"id": f"{i:016x}", "source": "archive", "batch": "r2", "system": "own site", "crawl": "",
            "languages": "", "method": "html", "facts": {}, "employer": "", "title": "Finance Officer",
            "url": f"https://{host}/jobs/finance-officer-{i}-x-y",
            "lines": [{"text": "Key responsibilities", "heading": True, "tag": "h2"},
                      {"text": text, "heading": False, "tag": "p"},
                      {"text": "How to apply: send your CV by the closing date.", "heading": False, "tag": "p"}]}


def test_measure_drops_un_pages_and_keeps_held_out_adverts_beside_the_cap(tmp_path, monkeypatch):
    work, docs = tmp_path / "work", tmp_path / "docs"
    (work / "adverts").mkdir(parents=True)
    ads = [page_ad(i) for i in range(32)] + [page_ad(99, host="jobs.ilo.org")]
    for ad in ads:
        adverts._save_advert(work / "adverts", ad)
    held = [ads[0]["id"], ads[1]["id"]]
    (work / "ai-test-set.json").write_text(json.dumps({"pilot": [], "test": held}), encoding="utf-8")
    monkeypatch.setattr(adverts, "WORK", work)
    monkeypatch.setattr(adverts, "ROLES_DIR", docs)
    monkeypatch.setattr(adverts, "UN_PAGES_ALLOWED", False)
    assert adverts.measure() == 0
    rows = list(csv.DictReader((docs / "broad-adverts.csv").open(encoding="utf-8")))
    assert all(r["org_id"] != "site:jobs.ilo.org" for r in rows)       # held while UN pages are not allowed
    assert len(rows) == 32 and sum(r["held_out"] == "true" for r in rows) == 2   # 30 evidence + 2 held


def test_measure_keeps_a_held_out_advert_over_its_copy(tmp_path, monkeypatch):
    work, docs = tmp_path / "work", tmp_path / "docs"
    (work / "adverts").mkdir(parents=True)
    held, copy = page_ad(7), dict(page_ad(7), id="0000000000000001", source="step-f-feed", org_hint="seed:1")
    for ad in (held, copy):
        adverts._save_advert(work / "adverts", ad)
    (work / "ai-test-set.json").write_text(json.dumps({"pilot": [], "test": [held["id"]]}), encoding="utf-8")
    monkeypatch.setattr(adverts, "WORK", work)
    monkeypatch.setattr(adverts, "ROLES_DIR", docs)
    adverts.measure()
    rows = list(csv.DictReader((docs / "broad-adverts.csv").open(encoding="utf-8")))
    assert [(r["advert_id"], r["held_out"]) for r in rows] == [(held["id"], "true")]


def test_a_recorded_type_decision_is_named_as_the_basis(tmp_path, monkeypatch):
    work, docs = tmp_path / "work", tmp_path / "docs"
    (work / "adverts").mkdir(parents=True)
    for ad in (page_ad(1, host="jobs.itu.int"), page_ad(2)):
        adverts._save_advert(work / "adverts", ad)
    (work / "ai-test-set.json").write_text(json.dumps({"pilot": [], "test": []}), encoding="utf-8")
    monkeypatch.setattr(adverts, "WORK", work)
    monkeypatch.setattr(adverts, "ROLES_DIR", docs)
    monkeypatch.setattr(adverts, "_decisions", lambda: [{"action": "org-type", "key": "site:jobs.itu.int",
                                                         "value": "un_agency", "reason": "", "label": "Fact"}])
    adverts.measure()
    rows = {r["org_id"]: r for r in csv.DictReader((docs / "broad-adverts.csv").open(encoding="utf-8"))}
    assert (rows["site:jobs.itu.int"]["org_type"], rows["site:jobs.itu.int"]["org_type_basis"]) == \
        ("un_agency", "decision")
    assert rows["site:acme.example"]["org_type_basis"] == "rule"


def test_menu_lines_are_still_site_furniture():
    menu = ["Apply now", "Remote jobs", "Part-time jobs", "Closing soon", "Upload your CV", "Personal data policy"]
    ads = [{"org_id": "o", "method": "html", "lines": [{"text": t, "heading": False, "tag": "a"} for t in menu] +
            [{"text": f"Duty number {i} of this advert", "heading": False, "tag": "p"}]} for i in range(3)]
    assert set(menu) <= adverts.chrome_lines(ads)["o"]
    assert adverts.carries_meaning("Closing date: 30 November 2026")
    assert adverts.carries_meaning("We are an equal opportunity employer.")


def test_contract_length_before_an_experience_line_is_kept():
    assert "contract_length" in adverts.facts_of("Contract duration: 12 months. Experience: 5 years")
    assert "contract_length" in adverts.facts_of("Contract duration: 12 months\nExperience: 5 years")
    assert "contract_length" not in adverts.facts_of("The position requires 5 years of professional experience.")
    assert "contract_length" not in adverts.facts_of("The position requires 5 years' experience.")
    assert "contract_length" not in adverts.facts_of("The position requires 5 years’ experience.")


def test_minor_points_of_the_third_re_review():
    assert adverts.carries_meaning("Equal opportunity employer")
    assert not adverts.carries_meaning("Personal data policy")
    assert not restricted("The role supports a project for women only.")
    assert "pay" not in adverts.facts_of("Salary review 2025/26 is under way.")
    assert "pay" in adverts.facts_of("Salary: 2000/month")


def test_restrictions_from_the_second_re_review():
    for text in ("A scholarship programme for women only.", "You must be able to work at height.",
                 "Reports must be presentable.", "Duties include national recruitment of staff.",
                 "We welcome all regardless of nationality. Our training for women only runs monthly."):
        assert not restricted(text), text
    assert restricted("Support women farmers.\nAge: 25 - 35 years") == {"age"}
    assert restricted("We hire regardless of nationality. Only Kenyan nationals may apply.") == {"nationality"}
    assert restricted("Applicants (youth) must be aged 18-35 years.") == {"age"}
    assert restricted("This position is for women only.") == {"sex"}


def test_pay_cases_from_the_second_re_review():
    assert "pay" in adverts.facts_of("Salary: 2000 per month")
    assert "pay" not in adverts.facts_of("Allowances 4.2 and 4.3 of the staff rules apply.")
    assert "pay_vague" not in adverts.facts_of("Partners pay close attention to competitive bids.")
    assert "pay_vague" in adverts.facts_of("Pay: competitive.")


def test_years_ago_is_not_years_asked():
    assert adverts.years_asked("Founded 30 years ago, our experience in grants is wide.") == ("", "")


def test_the_at_employer_cut_is_for_board_titles_only():
    assert adverts.comparable_title("Finance Officer at Acme", "board") == "finance officer"
    assert adverts.comparable_title("Officer at Headquarters", "archive") != adverts.comparable_title(
        "Officer at Headquarters", "board")


def test_live_stop_rules_persist(tmp_path):
    run, _ = live(tmp_path, {"a.example": (403, b""), "b.example": (403, b""), "c.example": (403, b""),
                             "d.example": (403, b""), "e.example": (403, b"")}, cap=50)
    for h in "abcde":
        run.get(f"https://{h}.example/x", "page")
    assert run.stopped and (tmp_path / "stopped.txt").exists()
    try:
        live(tmp_path, {})
        raise AssertionError("a stopped live batch was resumed")
    except adverts.Stopped:
        pass


def test_board_pages_follow_only_the_boards_own_next_page(tmp_path):
    listing = (b'<a href="https://board.example/job/a-b-c/">x</a>'
               b'<a href="https://evil.example/page/2/">next</a><a href="https://board.example/page/2/">next</a>')
    run, f = live(tmp_path, {"https://board.example/": (200, listing),
                             "https://board.example/page/2/": (200, b"")}, cap=50)
    cfg = {"listings": ["https://board.example/"], "next": r"/page/(\d+)/?$",
           "link": r"^https://board\.example/job/[^/?#]+/?$", "adverts": 5, "listing_pages": 3}
    adverts.board_pages(run, "b", cfg, random.Random(1))
    assert all("evil.example" not in u for u in f.urls)
    assert "https://board.example/page/2/" in f.urls
