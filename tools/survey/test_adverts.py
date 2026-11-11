"""Tests of the broad layer's reading and measuring (W-54, no network). Every advert and page here was
written for the tests by AidJobs; none is copied from a real advert. Run: python -m pytest tools/survey -q"""
import csv
import gzip
import json
import random
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
    assert found("Applicants must be aged between 25 and 35 years.") == {"age"}
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
    assert adverts.score_decision_facts(set(adverts.DECISION_FACTS)) == 3
    assert adverts.score_decision_facts(set(adverts.DECISION_FACTS) - {"pay"}) == 2
    assert adverts.score_decision_facts(set(adverts.DECISION_FACTS) - {"start_date"}) == 2   # 3 needs every fact
    assert adverts.score_decision_facts({"how_to_apply"}) == 0
    assert adverts.score_readability(16) == 3 and adverts.score_readability(40) == 0
    assert adverts.score_length("ingo", 1200, 800, 0.2) == 3
    assert adverts.score_length("ingo", 1200, 400, 0.2) == 3       # under the ceiling is not penalised
    assert adverts.score_length("ingo", 1200, 200, 0.2) == 2
    assert adverts.score_length("ingo", 2400, 2000, 0.2) == 0
    assert adverts.score_length("ingo", 1200, 800, 0.6) == 0
    assert adverts.score_length("foundation", 1200, 800, 0.2) is None


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
    return {k for k, p in adverts.RESTRICTIONS.items() if p.search(text)}


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
    un = ("A minimum of five years of relevant experience. A first-level university degree in combination "
          "with two additional years of qualifying experience may be accepted in lieu of the advanced degree.")
    assert adverts.years_asked(un) == ("5", "7")
    semi = ("A master's degree with seven years of relevant experience; or a bachelor's degree with nine years "
            "of relevant experience.")
    assert adverts.years_asked(semi) == ("7", "9")


def test_degree_words_that_are_not_degrees():
    assert adverts.degree_asked("A valid driving licence is required") == ""
    assert adverts.degree_asked("Mastery of Excel; payments by Mastercard") == ""
    assert adverts.degree_asked("La maîtrise du français est requise") == "master"   # maîtrise is the degree
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
    eo = "Acme Relief is an equal opportunity employer and does not charge any fee at any stage."
    ads = [{"org_id": "o", "method": "html", "lines": [{"text": "Home", "heading": False, "tag": "a"},
                                                        {"text": eo, "heading": False, "tag": "p"},
                                                        {"text": f"Duty {i}", "heading": False, "tag": "p"}]}
           for i in range(4)]
    chrome = adverts.chrome_lines(ads)["o"]
    assert "Home" in chrome and eo not in chrome


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
    assert adverts.board_org(ad, orgs, names)[0] == "board-employer:unknown"


def test_a_board_copy_with_at_employer_is_still_a_copy():
    body = [{"text": " ".join(f"word{i}" for i in range(80)), "heading": False, "tag": "p"}]
    ads = [{"id": "a1", "source": "archive", "title": "Finance Officer", "lines": body},
           {"id": "b1", "source": "board", "title": "Finance Officer at Acme Relief", "lines": body},
           {"id": "f1", "source": "step-f-feed", "title": "Finance Officer", "lines": body}]
    assert adverts.near_duplicates(ads) == {"a1": "f1", "b1": "f1"}   # step F's feed copy is kept


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


def test_a_planned_row_is_checked_again_before_it_is_read():
    v = FakeVerdicts({"https://a.example/jobs/x-y-z"})
    ok = {"url": "https://a.example/jobs/x-y-z", "filename": "crawl-data/x", "languages": "eng"}
    assert adverts.row_still_allowed(ok, v, set()) == ""
    assert adverts.row_still_allowed(dict(ok, url="https://a.example/jobs/other-x-y"), v, set()) == "not allowed by R0"
    assert adverts.row_still_allowed(dict(ok, url="https://acme.wd1.myworkdayjobs.com/x"), v, set()) == "shell host"
    assert adverts.row_still_allowed(dict(ok, languages="deu"), v, set()) == "language outside wave 1"
    assert adverts.row_still_allowed(dict(ok, url="https://jobs.ilo.org/x"), v, set()).startswith("held")
    assert adverts.row_still_allowed(ok, v, {"a.example"}).startswith("held")


class FakeFetcher:
    """Answers by host; writes one log line per request, as confirm.Fetcher does."""

    def __init__(self, folder, answers):
        self.folder, self.answers, self.urls = folder, answers, []

    def get(self, url, what):
        self.urls.append(url)
        with (self.folder / "requests.log").open("a", encoding="utf-8") as h:
            h.write(f"x\t{what}\n")
        host = url.split("/")[2]
        status, body = self.answers.get(url, self.answers.get(host, (200, b"<html></html>")))
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


def test_the_live_batch_size_counts_the_policys_robots_reads_across_runs(tmp_path):
    run, _ = live(tmp_path, {}, cap=4)
    run.get("https://a.example/1", "page")             # the page and the policy's robots.txt read: 2
    run2, _ = live(tmp_path, {}, cap=4)
    run2.get("https://a.example/2", "page")            # a new process: the policy reads robots.txt again
    assert adverts.requests_sent(tmp_path) == 4
    assert run2.get("https://a.example/3", "page") is None and run2.stopped


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
