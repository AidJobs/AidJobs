"""Tests of the register script's pure helpers. Run: python -m pytest tools/survey -q"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import registers


def test_domain_is_the_host_without_www():
    assert registers.domain("https://www.Oxfam.org.uk/jobs") == "oxfam.org.uk"
    assert registers.domain("WWW.EQUINEABILITYNIAGARA.COM") == "equineabilityniagara.com"
    assert registers.domain("  ") == ""
    assert registers.domain(None) == ""
    assert registers.domain("http://[bad") == ""


def test_money_reads_numbers_and_rejects_text():
    assert registers.money("1,234,567") == 1234567.0
    assert registers.money("") is None
    assert registers.money("n/a") is None


def test_control_character_references_are_dropped_and_others_kept():
    text = "a&#x1;b&#2;c&#x9;d&#65;e&amp;f"
    assert registers._CHAR_REF.sub(registers._drop_control_refs, text) == "abc&#x9;d&#65;e&amp;f"


def test_a_row_records_whether_income_meets_the_recommended_cutoff():
    above = registers._row("uk", "1", "Oxfam", "GB", "k", "oxfam.org.uk", 3_000_000, "2025")
    below = registers._row("uk", "2", "Small", "GB", "k", "", 100_000, "2025")
    unknown = registers._row("uk", "3", "Silent", "GB", "k", "", None, "")
    assert (above["in_recommended_cutoff"], above["currency"]) == ("yes", "GBP")
    assert below["in_recommended_cutoff"] == "no"
    assert unknown["in_recommended_cutoff"] == ""
    assert registers._row("iati", "x", "  GIZ   Non  BMZ ", "DE", "k", "", None, "")["name"] \
        == "GIZ Non BMZ"


def test_the_name_filter_drops_hospitals_universities_and_schools_only():
    for name in ("American Hospital of Paris", "University of Alberta", "Holland College",
                 "Sofia American Schools Inc"):
        assert registers.EXCLUDED_NAME.search(name)
    for name in ("Church World Service", "World Vision", "Catholic Relief Services",
                 "Médecins Sans Frontières"):
        assert not registers.EXCLUDED_NAME.search(name)


def test_iati_keeps_aid_publishers_and_drops_academic_and_other():
    assert {"10", "21", "22", "40", "60"} <= registers.IATI_KEEP
    assert not {"80", "90"} & (registers.IATI_KEEP | registers.IATI_REVIEW)
    assert {"70", "71", "72", "73"} == registers.IATI_REVIEW
