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
    assert dedupe.tidy_case("Oxfam Novib") == "Oxfam Novib"


def test_a_family_is_named_after_the_words_its_members_share():
    assert dedupe.family_label(["Save the Children UK", "Save the Children International"]) \
        == "Save the Children"
    assert dedupe.family_label(["ActionAid Rwanda", "ACTIONAID INTERNATIONAL KENYA"]) == "ActionAid"
    assert dedupe.family_label(["GOAL Uganda", "GOAL"]) == "GOAL"


def test_the_committed_decisions_name_only_records_that_exist():
    records, _, decisions = dedupe.load()
    keys = {r.key for r in records}
    named = {*decisions.exclude, *decisions.family,
             *(k for a, b, _ in decisions.merge for k in (a, b)),
             *(k for pair in decisions.separate for k in pair)}
    assert named <= keys
