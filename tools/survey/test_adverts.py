"""Tests of the broad layer's reading and measuring (W-54, no network). Every advert and page here was
written for the tests by AidJobs; none is copied from a real advert. Run: python -m pytest tools/survey -q"""
import csv
import gzip
import json
import sys
from pathlib import Path

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
<li>At least three (3) years of experience in humanitarian logistics.</li>
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
    assert adverts.years_asked("At least three (3) years of experience in logistics.") == ("3", "")
    assert adverts.years_asked("Minimum 5+ years of relevant experience.") == ("5", "")
    un = ("A master's degree with seven years of relevant experience, or a bachelor's degree "
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
        return {k for k, p in adverts.RESTRICTIONS.items() if p.search(text)}
    assert found("Female candidates only.") == {"sex"}
    assert found("Applicants must be aged between 25 and 35.") == {"age"}
    assert found("Open to Kenyan nationals only.") == {"nationality"}
    assert found("Please attach a recent passport-size photo.") == {"photo_appearance"}
    assert found("Women are strongly encouraged to apply.") == set()
    assert found("Candidates must have the right to work in the UK.") == set()
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


def row(**kw):
    base = {f: "" for f in adverts.ADVERT_FIELDS}
    base.update(advert_id="abc", org_id="seed:1", org_type="ingo", org_type_basis="rule", source="archive",
                batch="r2", system="own site", family_id="finance", function="finance", sector="none",
                level="officer", staff_consultant="unknown", national_international="unknown",
                humanitarian_development="unknown", field_hq="unknown", language="en", extraction="html",
                words_total="500", words_role="400", sections="6", held_out="false", facts_given="pay;hours")
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
    assert adverts.check(roles_dir=tmp_path) == 1


def warc_record(uri, http_head, body):
    payload = http_head.encode() + b"\r\n\r\n" + body
    warc = (f"WARC/1.0\r\nWARC-Type: response\r\nWARC-Target-URI: {uri}\r\n"
            f"Content-Length: {len(payload)}\r\n").encode()
    return gzip.compress(warc + b"\r\n" + payload)


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
    assert adverts.specificity("Liaise with stakeholders as needed.")[0] == 0
    score, kinds = adverts.specificity("Submit a monthly report to the donor on the 12 sites using Kobo.")
    assert score == 3 and {"number", "frequency", "standard_or_tool"} <= set(kinds)


def test_the_partial_scores():
    assert adverts.score_decision_facts(set(adverts.DECISION_FACTS), False) == 3
    assert adverts.score_decision_facts(set(adverts.DECISION_FACTS) - {"pay"}, False) == 2
    assert adverts.score_decision_facts({"how_to_apply"}, False) == 0
    assert adverts.score_readability(16) == 3 and adverts.score_readability(40) == 0
    assert adverts.score_length("ingo", 1200, 800, 0.2) == 3
    assert adverts.score_length("ingo", 1200, 800, 0.6) == 0
    assert adverts.score_length("foundation", 1200, 800, 0.2) is None
