"""Tests of step D's matching and ranking. Run: python -m pytest tools/survey -q"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dedupe
from dedupe import Decisions, Record


def rec(key, name, country="", domain="", income=None, jobs=0, acronym=""):
    source = key.split(":", 1)[0].split("-")[0]
    return Record(key=key, source=source, name=name, country=country, domain=domain,
                  income_usd=income, income="" if income is None else str(income),
                  currency="USD" if income is not None else "", unjobs_jobs=jobs, acronym=acronym)


def run(records, decisions=None, repeats=()):
    decisions = decisions or Decisions()
    groups, pending, families = dedupe.match(records, list(repeats), decisions)
    rows = dedupe.organisations(records, groups, decisions, families)
    return groups, pending, rows


def together(groups, a, b):
    return groups.find(a) == groups.find(b)


def test_names_are_compared_without_case_accents_legal_forms_or_acronyms():
    assert dedupe.strict_name("MÉDECINS SANS FRONTIÈRES INC") == "medecins sans frontieres"
    assert dedupe.strict_name("Natural Resource Governance Institute (NRGI)") \
        == dedupe.strict_name("NATURAL RESOURCE GOVERNANCE INSTITUTE")
    assert dedupe.strict_name("The HALO Trust") == dedupe.strict_name("HALO Trust")


def test_a_country_in_brackets_stays_part_of_the_name():
    assert dedupe.strict_name("MEDECINS SANS FRONTIERES (UK)") != dedupe.strict_name("Médecins Sans Frontières")
    assert dedupe.strict_name("Prosper Global (NL)") != dedupe.strict_name("Prosper Global")


def test_unjobs_names_are_split_into_name_and_acronym():
    assert dedupe.split_acronym("UNICEF - United Nations Children's Fund") \
        == ("United Nations Children's Fund", "UNICEF")
    assert dedupe.split_acronym("Mercy Corps (MC)") == ("Mercy Corps", "MC")
    assert dedupe.split_acronym("Save the Children") == ("Save the Children", "")
    assert dedupe.split_acronym("Mines Advisory Group (MAG UK office)")[1] == ""


def test_iati_identifiers_link_to_the_register_they_carry():
    records = [rec("iati:US-EIN-13-5660870", "The International Rescue Committee", "US"),
               rec("irs:135660870", "INTERNATIONAL RESCUE COMMITTEE INC", "US"),
               rec("iati:GB-CHC-202918", "Oxfam GB", "GB"), rec("uk:202918", "OXFAM", "GB"),
               rec("iati:CA-CRA_ACR-817387277", "Mastercard Foundation", "CA"),
               rec("cra:817387277RR0001", "Mastercard Foundation", "CA"),
               rec("iati:US-IRS-13-5661832", "Plan International USA", "US"),
               rec("irs:135661832", "PLAN INTERNATIONAL USA INC", "US")]
    links = {(a, b) for a, b, _ in dedupe.registry_links(records)}
    assert links == {("iati:US-EIN-13-5660870", "irs:135660870"), ("iati:GB-CHC-202918", "uk:202918"),
                     ("iati:CA-CRA_ACR-817387277", "cra:817387277RR0001"),
                     ("iati:US-IRS-13-5661832", "irs:135661832")}


def test_a_shared_website_joins_within_a_country_and_marks_a_family_across_countries():
    records = [rec("uk:288701", "WATERAID", "GB", "wateraid.org"),
               rec("oscr:SC039479", "Wateraid", "GB", "wateraid.org"),
               rec("acnc:99700687141", "Wateraid Australia Limited", "AU", "wateraid.org")]
    groups, _, rows = run(records)
    assert together(groups, "uk:288701", "oscr:SC039479")
    assert not together(groups, "uk:288701", "acnc:99700687141")
    assert {r["family"] for r in rows} == {"Wateraid"}


def test_shared_hosts_are_never_evidence():
    records = [rec("iati:GB-GOV-1", "Foreign, Commonwealth and Development Office", "GB", "gov.uk"),
               rec("iati:GB-GOV-28", "Medicines and Healthcare products Regulatory Agency", "GB", "gov.uk")]
    groups, pending, _ = run(records)
    assert not together(groups, "iati:GB-GOV-1", "iati:GB-GOV-28")
    assert pending == []


def test_a_shared_website_with_different_names_waits_for_a_decision():
    records = [rec("eu:1", "International Council of Voluntary Agencies", "CH", "icvanetwork.org"),
               rec("eu:2", "The International PRIDE Centre", "CH", "icvanetwork.org")]
    groups, pending, _ = run(records)
    assert not together(groups, "eu:1", "eu:2")
    assert [(a, b) for a, b, _ in pending] == [("eu:1", "eu:2")]


def test_a_unjobs_entry_joins_the_only_country_with_its_name_else_it_is_a_family():
    records = [rec("unjobs-nonun:1", "Room to Read", jobs=80), rec("irs:1", "ROOM TO READ", "US"),
               rec("unjobs-nonun:2", "Save the Children", jobs=80),
               rec("irs:2", "SAVE THE CHILDREN", "US"), rec("uk:2", "SAVE THE CHILDREN", "GB")]
    groups, _, rows = run(records)
    assert together(groups, "unjobs-nonun:1", "irs:1")
    assert not together(groups, "unjobs-nonun:2", "irs:2")
    assert not together(groups, "unjobs-nonun:2", "uk:2")
    assert {r["family"] for r in rows if "Save" in r["name"]} == {"Save the Children"}


def test_decisions_merge_separate_and_exclude():
    records = [rec("unjobs-nonun:17", "Agency for Technical Cooperation and Development", jobs=19),
               rec("eu:1", "Acted", "FR", "acted.org"),
               rec("unjobs-nonun:435", "Samaritan's Purse", jobs=2),
               rec("iati:KH-1", "Samaritan's Purse", "KH"),
               rec("unjobs-nonun:524", "Zipline", jobs=346)]
    decisions = Decisions(merge=[("unjobs-nonun:17", "eu:1", "ACTED")],
                          separate={frozenset(("unjobs-nonun:435", "iati:KH-1"))},
                          exclude={"unjobs-nonun:524": "a company outside aid"})
    groups, _, rows = run(records, decisions)
    assert together(groups, "unjobs-nonun:17", "eu:1")
    assert not together(groups, "unjobs-nonun:435", "iati:KH-1")
    assert "Zipline" not in {r["name"] for r in rows}


def test_ranking_puts_hiring_evidence_first_then_income_in_dollars():
    records = [rec("irs:1", "Big Charity", "US", income=900_000_000),
               rec("unjobs-nonun:1", "Hiring Agency", jobs=5),
               rec("unjobs-nonun:2", "Busier Agency", jobs=50),
               rec("eu:1", "Listed Only", "BE"),
               Record(key="uk:1", source="uk", name="UK Charity", country="GB",
                      income_usd=10_000_000 * dedupe.USD_PER["GBP"], income="10000000",
                      currency="GBP")]
    _, _, rows = run(records)
    assert [r["name"] for r in rows] == ["Busier Agency", "Hiring Agency", "Big Charity",
                                         "UK Charity", "Listed Only"]
    assert [r["rank"] for r in rows] == [1, 2, 3, 4, 5]
    assert rows[3]["income_usd"] == "12781000"


def test_repeated_unjobs_entries_count_once_per_entry():
    records = [rec("unjobs-un:1", "United Nations Children's Fund", jobs=185),
               rec("unjobs-un:108", "unicef", jobs=42)]
    _, _, rows = run(records, repeats=[("unjobs-un:108", "unjobs-un:1")])
    assert len(rows) == 1 and rows[0]["unjobs_jobs"] == 227


def test_capitalised_register_names_are_made_readable():
    assert dedupe.tidy_case("INTERNATIONAL COMMITTEE OF THE RED CROSS") \
        == "International Committee of the Red Cross"
    assert dedupe.tidy_case("UNITED STATES FUND FOR UNICEF") == "United States Fund for UNICEF"
    assert dedupe.tidy_case("SAVE THE CHILDREN'S FUND") == "Save the Children's Fund"
    assert dedupe.tidy_case("OXFAM-QUEBEC INC") == "Oxfam-Quebec Inc"
    assert dedupe.tidy_case("Oxfam Novib") == "Oxfam Novib"


def test_only_names_from_capitalised_registers_are_recased():
    assert dedupe.shown_name(rec("irs:1", "HEIFER PROJECT INTERNATIONAL", "US")) == "Heifer Project International"
    assert dedupe.shown_name(rec("unjobs-nonun:1", "FHI 360")) == "FHI 360"
    assert dedupe.shown_name(rec("iati:X", "UNITAID", "CH")) == "UNITAID"


def test_un_is_united_nations_and_bracketed_acronyms_are_read_from_every_register():
    assert dedupe.strict_name("UN Office for Project Services") \
        == dedupe.strict_name("United Nations Office for Project Services")
    assert dedupe.split_acronym("United Nations World Food Programme (WFP)") \
        == ("United Nations World Food Programme", "WFP")
    assert dedupe.split_acronym("MEDECINS SANS FRONTIERES (UK)") == ("MEDECINS SANS FRONTIERES (UK)", "")


def test_the_same_acronym_with_a_similar_name_joins_unless_the_countries_differ():
    records = [rec("unjobs-un:102", "World Food Programme", acronym="WFP", jobs=105),
               rec("iati:XM-DAC-41140", "United Nations World Food Programme", "IT", acronym="WFP"),
               rec("eu:1", "World Fishing Platform", "NL", acronym="WFP")]
    groups, _, _ = run(records)
    assert together(groups, "unjobs-un:102", "iati:XM-DAC-41140")
    assert not together(groups, "unjobs-un:102", "eu:1")


def test_a_website_shared_by_unrelated_bodies_is_still_shown_when_it_is_the_only_one():
    records = [rec("unjobs-un:103", "World Health Organization", jobs=79),
               rec("iati:XM-DAC-928", "World Health Organization", "CH", "who.int")]
    _, _, rows = run(records)
    assert rows[0]["website_domain"] == "who.int"
    assert dedupe.clean_domain("idrf.ca or idrf.com") == "idrf.ca"
    assert dedupe.clean_domain("s") == "" and dedupe.clean_domain("shaw.ca") == ""


def test_a_recorded_name_replaces_the_shown_one_and_un_offices_form_one_family():
    records = [rec("iati:US-EIN-91-1148123", "Prosper Global (US)", "US", jobs=0),
               rec("unjobs-un:1", "Office of the Special Adviser on Africa", jobs=3)]
    records[1].kind = "un-secretariat (likely)"
    decisions = Decisions(name={"iati:US-EIN-91-1148123": "Prosper Global (formerly Mercy Corps)"})
    _, _, rows = run(records, decisions)
    by_key = {r["org_id"]: r for r in rows}
    assert by_key["iati:US-EIN-91-1148123"]["name"] == "Prosper Global (formerly Mercy Corps)"
    assert by_key["unjobs-un:1"]["family"] == dedupe.UN_SECRETARIAT


def test_a_recorded_family_renames_or_removes_the_whole_family():
    records = [rec("uk:1", "ACTIONAID", "GB", "actionaid.org"), rec("eu:1", "ActionAid", "ZA", "actionaid.org"),
               rec("iati:A", "Ministry of Foreign Affairs", "GR"), rec("iati:B", "Ministry of Foreign Affairs", "NL")]
    decisions = Decisions(family={"uk:1": "ActionAid network", "iati:A": "none"})
    _, _, rows = run(records, decisions)
    families = {r["org_id"]: r["family"] for r in rows}
    assert families["uk:1"] == families["eu:1"] == "ActionAid network"
    assert families["iati:A"] == families["iati:B"] == ""
    assert dedupe.tidy_case("FONDATION L'ARCHE") == "Fondation L'Arche"


def test_a_family_is_named_after_the_words_its_members_share():
    assert dedupe.family_label(["Save the Children UK", "Save the Children International"]) \
        == "Save the Children"
    assert dedupe.family_label(["ActionAid Rwanda", "ACTIONAID INTERNATIONAL KENYA"]) == "ActionAid"
    assert dedupe.family_label(["DKT International", "DKT - (Pakistan)"]) == "DKT International"  # strongest first
    assert dedupe.family_label(["Restless Development", "Restless Development- Zambia"]) == "Restless Development"


def test_the_committed_decisions_name_only_records_that_exist():
    records, _, decisions = dedupe.load()
    keys = {r.key for r in records}
    named = {*decisions.exclude, *decisions.family, *decisions.name,
             *(k for a, b, _ in decisions.merge for k in (a, b)),
             *(k for a, b, _ in decisions.link for k in (a, b)),
             *(k for pair in decisions.separate for k in pair)}
    assert named <= keys


def test_dg_echo_partners_are_read_with_country_codes_and_join_by_name(tmp_path):
    path = tmp_path / "echo-partners.csv"
    path.write_text("number,partner_code,name,country,certificate\n"
                    "1,AADK,ActionAid Denmark,DENMARK,Partner\n"
                    "56,CROIX-ROUGE-LU,Aide internationale de la Croix-Rouge,LUXEMBURG,Partner\n",
                    encoding="utf-8")
    echo = dedupe.read_echo(path)
    assert [(r.key, r.country) for r in echo] == [("echo:1", "DK"), ("echo:56", "LU")]
    assert dedupe.read_echo(tmp_path / "missing.csv") == []
    groups, _, rows = run([rec("iati:DK-CVR-1", "ActionAid Denmark", "DK"), *echo])
    assert together(groups, "iati:DK-CVR-1", "echo:1")
    assert {r["org_id"] for r in rows} == {"iati:DK-CVR-1", "echo:56"}  # echo never anchors


def test_a_family_link_puts_differently_named_members_in_one_family():
    records = [rec("unjobs-nonun:1", "Save the Children", jobs=5), rec("echo:1", "Red Barnet", "DK"),
               rec("cra:1", "Save the Children Canada", "CA")]
    decisions = Decisions(link=[("unjobs-nonun:1", "echo:1", "national member"),
                                ("unjobs-nonun:1", "cra:1", "national member")])
    groups, _, rows = run(records, decisions)
    assert not together(groups, "unjobs-nonun:1", "echo:1")
    assert len({r["family"] for r in rows}) == 1 and rows[0]["family"]
