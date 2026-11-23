"""W-42 title facts: parity with apps/frontend/lib/site/facts.ts plus plan rules."""
from __future__ import annotations

from app.title_facts import (
    DESCRIPTION_PREFIX_LIMIT,
    FUNCTIONS,
    SECTOR_SDG,
    SECTORS,
    facts_of,
    map_advert_language,
    map_contract_type,
    typical_experience,
)

_APOS = "\u2019"


def test_description_prefix_limit_is_five_hundred():
    assert DESCRIPTION_PREFIX_LIMIT == 500


def test_fixed_lists_are_non_empty():
    assert "Education" in SECTORS
    assert "M&E" in FUNCTIONS
    assert "Programme management" in FUNCTIONS
    assert SECTOR_SDG["Education"]["goal"] == 4
    assert SECTOR_SDG["Emergencies"] is None


def test_reads_contract_grade_level_open_to_and_sector_with_sdg():
    f = facts_of("Education Officer, P-3, Fixed Term, Juba, South Sudan")
    assert f["contract"] == "Fixed term"
    assert f["grade"] == "P-3"
    assert f["level"] == "Mid-career"
    assert f["openTo"] == "International"
    assert f["sectors"] == ["Education"]
    assert f["language"] == "English"
    assert f["remote"] is False
    assert [s["goal"] for s in f["sdgs"]] == [4]
    assert f["functions"] == []


def test_reads_national_consultancy_with_length_and_home_based():
    f = facts_of("National Consultant - Nutrition (11 months), Home-based")
    assert f["contract"] == "Consultancy"
    assert f["openTo"] == "Nationals"
    assert f["duration"] == "11 months"
    assert f["remote"] is True
    assert f["sectors"] == ["Nutrition"]
    assert f["level"] is None


def test_internship_is_entry_level():
    f = facts_of("Internship - Communication (Remote)")
    assert f["contract"] == "Internship"
    assert f["level"] == "Entry"
    assert f["remote"] is True
    assert f["functions"] == ["Communications"]


def test_national_officer_letter_grades_and_french():
    f = facts_of("Chargé(e) de suivi et évaluation, NO-B")
    assert f["grade"] == "NO-B"
    assert f["level"] == "Mid-career"
    assert f["openTo"] == "Nationals"
    assert f["language"] == "French"


def test_mel_is_not_education_sector():
    f = facts_of("Monitoring, Evaluation and Learning Officer")
    assert f["sectors"] == []
    assert f["functions"] == ["M&E"]


def test_driver_leaves_facts_empty():
    f = facts_of("Driver")
    assert f == {
        "contract": None,
        "grade": None,
        "duration": None,
        "openTo": None,
        "remote": False,
        "language": "English",
        "sectors": [],
        "sdgs": [],
        "level": None,
        "functions": [],
    }


def test_typical_experience_matches_typescript_apostrophe():
    assert typical_experience("P-3") == f"usually 5+ years{_APOS} experience"
    assert typical_experience("G-1") == "usually no minimum experience"
    assert (
        typical_experience("D-2")
        == f"usually more than 15 years{_APOS} experience"
    )
    assert typical_experience("NO-B") == f"usually 2+ years{_APOS} experience"


def test_eau_is_wash_not_noise():
    assert "WASH" in facts_of("Chargé de l'eau et assainissement")["sectors"]


def test_ta_ft_gs_grades():
    assert facts_of("Programme Assistant, TA")["contract"] == "Temporary"
    assert facts_of("Finance Officer, FT, P-2")["contract"] == "Fixed term"
    assert facts_of("Driver, GS-3")["grade"] == "G-3"
    assert facts_of("Driver, GS-3")["level"] == "Support staff"


def test_no_letter_grades_a_through_e():
    assert facts_of("Officer, NO-A")["level"] == "Entry"
    assert facts_of("Officer, NO-C")["level"] == "Mid-career"
    assert facts_of("Officer, NO-E")["level"] == "Senior"


def test_programme_officer_is_not_programme_management():
    f = facts_of("Programme Officer, P-3")
    assert "Programme management" not in f["functions"]
    assert f["functions"] == []


def test_programme_manager_is_programme_management():
    assert "Programme management" in facts_of("Programme Manager, P-4")["functions"]
    assert "Programme management" in facts_of("Project Manager - Health")["functions"]


def test_sectors_and_functions_ignore_description_boilerplate():
    title = "Driver"
    description = (
        "We work on education, health, water, climate resilience and humanitarian "
        "response. Our learning programmes and community engagement reach youth."
    )
    f = facts_of(title, description)
    assert f["sectors"] == []
    assert f["functions"] == []
    assert f["language"] == "English"


def test_description_fills_only_precision_gaps():
    description = (
        "This is a Fixed Term Appointment at P-4 for 12 months, home-based, "
        "open to international candidates only. The role covers education policy."
    )
    f = facts_of("Specialist", description)
    assert f["contract"] == "Fixed term"
    assert f["grade"] == "P-4"
    assert f["duration"] == "12 months"
    assert f["remote"] is True
    assert f["openTo"] == "International"
    assert f["level"] == "Senior"
    # Sector must not come from the description.
    assert f["sectors"] == []


def test_description_prefix_cap_stops_late_grade():
    # Grade only appears after the 500-character cap.
    padding = "x" * DESCRIPTION_PREFIX_LIMIT
    f = facts_of("Specialist", padding + " P-3 Fixed Term")
    assert f["grade"] is None
    assert f["contract"] is None


def test_stored_contract_type_maps_when_known():
    f = facts_of("Officer", contract_type="Fixed Term Appointment")
    assert f["contract"] == "Fixed term"
    f2 = facts_of("Officer", contract_type="Consultant")
    assert f2["contract"] == "Consultancy"


def test_unmapped_contract_type_leaves_title_result():
    f = facts_of("Education Officer, Fixed Term", contract_type="Full-time")
    assert f["contract"] == "Fixed term"
    assert map_contract_type("Full-time") is None
    assert map_contract_type("FULL_TIME") is None


def test_is_remote_true_overrides_title_false_does_not():
    assert facts_of("Officer", is_remote=True)["remote"] is True
    # Stored false must not clear a title remote signal.
    assert facts_of("Officer (Remote)", is_remote=False)["remote"] is True
    assert facts_of("Officer", is_remote=False)["remote"] is False


def test_advert_language_maps_codes_and_names():
    assert map_advert_language("fr") == "French"
    assert map_advert_language("en-US") == "English"
    assert map_advert_language("Spanish") == "Spanish"
    assert map_advert_language("de") is None
    assert facts_of("Officer", advert_language="pt")["language"] == "Portuguese"
    # Unmapped stored language leaves the title heuristic (French title).
    f = facts_of("Chargé(e) de suivi et évaluation, NO-B", advert_language="de")
    assert f["language"] == "French"


def test_sdg_colours_match_typescript_table():
    assert SECTOR_SDG["Education"] == {
        "goal": 4,
        "name": "Quality education",
        "colour": "#C5192D",
    }
    assert SECTOR_SDG["WASH"]["colour"] == "#26BDE2"
