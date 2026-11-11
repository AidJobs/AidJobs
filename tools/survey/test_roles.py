"""Tests of the role survey's grouping rules (W-54, no network). Every title here was written for the
tests by AidJobs; none is copied from an advert. Run: python -m pytest tools/survey -q"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import roles


def role(title):
    r = roles.classify(title)
    return r.function, r.sector, r.level


def test_normalise_takes_out_grades_codes_gender_marks_and_places():
    n = roles.normalise("Senior WASH Officer (P-3) - Juba, South Sudan | Ref 2026/045")
    assert n.grade == "P-3"
    assert "juba" not in n.text and "045" not in n.text
    assert n.text.startswith("senior wash officer")
    assert roles.normalise("Chargé(e) de projet (H/F)").text.startswith("charg")
    assert "h/f" not in roles.normalise("Logisticien (H/F)").text
    assert roles.normalise("National Officer NO-B").grade == "NO-B"
    assert roles.normalise("Finance Assistant G6").grade == "G-6"


def test_abbreviations_are_expanded_and_a_sector_part_is_kept():
    assert "monitoring and evaluation" in roles.normalise("M&E Officer").text
    assert roles.normalise("Sr. Prog Mgr").text == "senior programme manager"
    assert "information technology" in roles.normalise("IT Officer").text
    assert "information technology" not in roles.normalise("Make it happen coordinator").text
    n = roles.normalise("Programme Manager – Livelihoods")
    assert "livelihoods" in n.text


def test_functions_follow_the_rule_order():
    assert role("Head of Finance")[0] == "finance"
    assert role("Country Director")[0] == "leadership"
    assert role("Grants Manager")[0] == "grants_partnerships"
    assert role("MEAL Coordinator")[0] == "meal"
    assert role("Monitoring and Evaluation Assistant")[0] == "meal"
    assert role("Logistics Officer")[0] == "supply_chain"
    assert role("Officier logistique de base")[0] == "supply_chain"
    assert role("HR Business Partner")[0] == "hr"
    assert role("Software Developer")[0] == "ict"
    assert role("Food Security Officer")[0] != "safety_security"
    assert role("Security Manager")[0] == "safety_security"
    assert role("Community Health Worker")[0] == "community_field"
    assert role("Staff Nurse")[0] == "medical_clinical"
    assert role("Civil Engineer")[0] == "engineering"
    assert role("Driver")[0] == "drivers_support"
    assert role("Health Programme Officer")[:2] == ("programme_management", "health")
    assert role("Child Protection Specialist")[:2] == ("technical", "protection")
    assert role("Development Officer")[0] == "grants_partnerships"
    assert role("Responsable de recherche")[0] == "policy_research"


def test_precedence_errors_found_by_the_review_stay_fixed():
    assert role("Information Management Officer")[2] == "officer"
    assert role("Grants Management Officer")[2] == "officer"
    assert role("Water Supply Engineer")[0] == "engineering"
    for t in ("Food and Nutrition Security Officer", "Human Security Adviser", "Global Health Security Specialist"):
        assert role(t)[0] != "safety_security", t
    assert role("Regional Network Coordinator")[0] != "ict"
    assert role("Programme Design Specialist")[0] != "communications_advocacy"
    assert role("Community Facilitator")[0] == "community_field"
    assert role("Gestionnaire de projets")[0] == "programme_management"
    assert role("Child Wellbeing Officer")[0] != "hr"
    assert role("Graphic Designer")[0] == "communications_advocacy"
    assert role("Network Engineer")[0] == "ict"


def test_un_supporters_are_not_un_agencies():
    t = roles.org_type_of
    assert t({"name": "United Nations Association of the UK", "kind": "", "country": "GB"}) != "un_agency"
    assert t({"name": "UNICEF UK", "kind": "", "country": "GB"}) != "un_agency"
    assert t({"name": "UNICEF", "kind": "un-or-intergovernmental", "country": ""}) == "un_agency"


def test_sectors_take_the_earliest_and_tell_safeguards_from_safeguarding():
    assert role("Health and Nutrition Manager")[1] == "health"
    assert role("Nutrition and Health Manager")[1] == "nutrition"
    assert role("Safeguarding Officer")[1] == "protection"
    assert role("Environmental and Social Safeguards Specialist")[1] == "esg_safeguards"
    assert role("Gender-Based Violence Case Worker")[1] == "protection"
    assert role("Gender Adviser")[1] == "gender"
    assert role("Finance Officer")[1] == "none"


def test_levels_from_words_first_then_the_published_grade():
    assert role("Project Assistant")[2] == "assistant"
    assert role("Assistant Country Director")[2] == "head_adviser"
    assert role("Programme Coordinator")[2] == "coordinator_manager"
    assert role("Senior Programme Officer")[2] == "officer"
    assert role("WASH Adviser")[2] == "head_adviser"
    assert role("Internship in Communications")[2] == "intern_fellow"
    assert role("Programme Analyst P-2")[2] == "officer"
    assert role("Health P-4")[2] == "coordinator_manager"
    assert role("Driver")[2] == "assistant"


def test_contexts_are_read_or_left_unknown():
    r = roles.classify("International Consultant – Emergency WASH, field based")
    assert r.contexts["staff_consultant"] == "consultant"
    assert r.contexts["humanitarian_development"] == "humanitarian"
    assert r.contexts["field_hq"] == "field"
    assert roles.classify("Programme Officer NO-A").contexts["national_international"] == "national"
    assert roles.classify("Finance Officer").contexts == {c: "unknown" for c in roles.CONTEXT_FIELDS}


def test_titles_in_french_are_marked_and_placed():
    r = roles.classify("Coordinateur de projet santé")
    assert r.language == "fr"
    assert r.function == "programme_management" and r.sector == "health"
    assert roles.classify("Chargé de suivi-évaluation").function == "meal"
    assert roles.classify("Programme Manager").language == "en"


def test_a_recorded_decision_wins():
    decisions = {"widget coordinator": {"key": "widget coordinator", "value": "administration|none|coordinator_manager"}}
    assert roles.classify("Widget Coordinator").function == ""
    r = roles.classify("Widget Coordinator", decisions)
    assert (r.function, r.sector, r.level) == ("administration", "none", "coordinator_manager")


def test_link_texts_that_are_not_titles_are_left_out():
    assert roles.looks_like_title("Finance Officer")
    assert not roles.looks_like_title("How to apply")
    assert not roles.looks_like_title("Life at our organisation")
    assert not roles.looks_like_title("Spontaneous application")


def test_titles_are_read_from_addresses():
    assert roles.from_slug("senior-programme-officer-health-123456") == "senior programme officer health"
    assert roles.address_title("https://acme.wd1.myworkdayjobs.com/en-US/External/job/Nairobi/Finance-Officer_R123") \
        == "Finance Officer"
    assert roles.address_title("https://www.example.org/careers/logistics-officer-goma/") == "logistics officer goma"
    assert roles.address_title("https://www.example.org/careers/") == ""


def test_job_identity_of_an_address():
    assert roles.job_key("https://www.example.org/jobs/finance-officer-kampala/")
    assert roles.job_key("https://www.example.org/jobs/") is None
    assert roles.job_key("https://www.example.org/jobs/tag/finance-officer-kampala") is None
    assert roles.job_key("https://www.example.org/vacancies/12345")
    assert roles.job_key("https://www.example.org/careers/view?jobId=4567")
    assert roles.archive_job_key("https://job-boards.greenhouse.io/acme/jobs/4012345")
    assert roles.archive_job_key("https://job-boards.greenhouse.io/acme/jobs/4012345") == \
        roles.archive_job_key("https://job-boards.greenhouse.io/acme/jobs/4012345?gh_src=x")


def test_organisation_types_by_rule():
    t = roles.org_type_of
    assert t({"name": "Kenya Red Cross Society", "kind": "National NGO", "country": "KE"}) == "red_cross"
    assert t({"name": "United Nations Population Fund", "kind": "un-or-intergovernmental"}) == "un_agency"
    assert t({"name": "Pacific Community", "kind": "intergovernmental", "country": ""}) == "donor_government"
    assert t({"name": "Acme Health Initiative", "kind": "National NGO", "country": "UG"}) == "national_ngo_south"
    assert t({"name": "Acme Relief", "kind": "International NGO", "country": "GB"}) == "ingo"
    assert t({"name": "Acme Foundation", "kind": "Foundation", "country": "US"}) == "foundation"
    assert t({"name": "Acme Consulting", "kind": "Private sector", "country": "US"}) == "contractor"
    assert t({"name": "Acme Policy Institute", "kind": "", "country": "US"}) == "research"
    assert t({"name": "Acme Shelter", "kind": "", "country": "US"}, pool="domestic") == "domestic_charity"


def test_pages_are_matched_to_organisations_and_parents():
    o = roles.Organisations()
    o.domains = {"example.org": "org:1", "reach-example.org": "org:2"}
    o.accounts = {("Greenhouse", "acme"): "org:3"}
    o.parents = {"org:2": "org:1"}
    assert o.of_url("https://careers.example.org/job/1") == "org:1"
    assert o.of_url("https://www.reach-example.org/jobs/x") == "org:1"
    assert o.of_url("https://job-boards.greenhouse.io/acme/jobs/1") == "org:3"
    assert o.of_url("https://job-boards.greenhouse.io/other/jobs/1") == "account:greenhouse:other"
    assert o.of_url("https://unknown.example.net/jobs/1") == "site:unknown.example.net"


def counts(rows):
    out = []
    for r in rows:
        base = dict(zip(roles.COUNT_FIELDS, ["archive", "cc-2026", "", "", "", "none", "officer", "unknown",
                                             "unknown", "unknown", "unknown", "1"]))
        base.update(r)
        out.append(base)
    return out


def test_the_role_map_caps_each_organisation_and_weights_the_un_system():
    rows = counts([
        {"org_id": "a", "org_type": "ingo", "function": "finance", "count": "60"},
        {"org_id": "b", "org_type": "ingo", "function": "hr", "count": "10"},
        {"org_id": "c", "org_type": "un_agency", "function": "finance", "count": "10"},
    ])
    m = {(r[0], r[3], r[4]): r for r in roles.role_map(rows)}
    assert m[("finance", "officer", "ingo")][5] == "30.0"          # 60 capped at 30
    assert m[("finance", "all", "all")][6] == 2                     # two organisations
    # weighted: finance = 30 (INGO) + 10 * 0.5 (UN) = 35 of 30 + 10 + 5 = 45
    assert m[("finance", "all", "all")][8] == f"{35 / 45:.4f}"
    assert m[("hr", "all", "ingo")][7] == f"{10 / 40:.4f}"


def test_build_writes_the_role_map_from_the_committed_counts(tmp_path):
    rows = counts([{"org_id": "a", "org_type": "ingo", "function": "finance", "count": "3"}])
    with (tmp_path / "role-counts.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=roles.COUNT_FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    assert roles.build(roles_dir=tmp_path) == 0
    text = (tmp_path / "role-map.csv").read_text(encoding="utf-8")
    assert text.splitlines()[0] == ",".join(roles.MAP_FIELDS)
    assert "finance,finance,none,officer,ingo,3.0,1" in text
