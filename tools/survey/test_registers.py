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


def _dropped(name):
    return bool(registers.EXCLUDED_NAME.search(name)) and not registers.KEPT_DESPITE_NAME.search(name)


def test_the_name_filter_drops_hospitals_universities_and_schools_in_several_languages():
    for name in ("American Hospital of Paris", "University of Alberta", "Holland College",
                 "Sofia American Schools Inc", "Université de Montréal", "Collège Jean-de-Brébeuf",
                 "Universidad del Valle de Guatemala", "Polytechnique Montréal",
                 "Hamilton Health Sciences Corporation", "Sinai Health System",
                 "HEC Montréal (École des hautes études commerciales)", "Hochschule Bremen",
                 "Vereniging Universiteiten van Nederland", "Fédération des écoles",
                 "Rectores de universidades", "Hôpitaux de Paris", "Krankenhaus Hamburg",
                 "Ospedale San Raffaele", "Ziekenhuis Amsterdam", "Colegios Mayores"):
        assert _dropped(name), name
    assert _dropped("Bansang Hospital Appeal")


def test_aid_organisations_are_kept_whatever_their_names():
    for name in ("Church World Service", "World Vision", "Catholic Relief Services",
                 "Médecins Sans Frontières", "Doctors with Africa CUAMM",
                 "World University Service of Canada", "United World Schools",
                 "Haiti Hospital Appeal", "Promoting Equality in African Schools",
                 "Baylor College of Medicine Children's Foundation Malawi"):
        assert not _dropped(name), name


def test_the_us_filter_keeps_international_aid_and_drops_security_and_exchanges():
    for code in ("Q30", "Q33", "Q70", "Q20", "Q40", "Q50", "Q"):
        assert registers.IRS_NTEE.match(code), code
    for code in ("Q43", "Q21", "Q22", "Q23", "E70", "X20", "P60", ""):
        assert not registers.IRS_NTEE.match(code), code


def test_scottish_aid_text_reads_aid_abroad_and_not_domestic_work():
    assert registers.OSCR_AID_TEXT.search("to relieve poverty in developing countries")
    assert registers.OSCR_AID_TEXT.search("humanitarian relief for refugees")
    assert registers.OSCR_AID_TEXT.search("the relief of poverty throughout the world")
    assert not registers.OSCR_AID_TEXT.search("lifeboat rescue around the coasts of the UK")
    assert not registers.OSCR_AID_TEXT.search("research into cancer")


ECHO_HEADER = ("No.                          Partner                                               "
               "Partner full name                                   Country                      "
               "Type of Certificate")


def _echo_line(number, code, name, country, certificate):
    return f"{number:<6}{code:<54}{name:<65}{country:<46}{certificate}".rstrip()


def test_dg_echo_rows_are_read_by_column_with_wrapped_cells():
    page = "\n".join([
        "          List of Non-Governmental Organisations certified as EU Humanitarian partners",
        ECHO_HEADER, "",
        _echo_line(" 1", "AADK", "ActionAid Denmark", "DENMARK", "Partner"),
        _echo_line("10", "ADRA NORGE", "ADVENTIST DEVELOPMENT AND RELIEF AGENCY", "NORWAY", ""),
        f"{'':<60}{'NORGE':<111}Partner",
        _echo_line("170", "TROCAIRE-IR", "Trocaire, (IRL)", "IRELAND",
                   "Potential Programmatic Partner"),
        "      " + f"{'TWB':<54}{'Translators Without Borders Ireland Company Limited by':<65}IRELAND",
        _echo_line("171", "", "guarantee", "", "Partner"),
    ])
    rows = registers.echo_rows([page])
    assert [(r["number"], r["partner_code"], r["name"], r["country"], r["certificate"])
            for r in rows] == [
        ("1", "AADK", "ActionAid Denmark", "DENMARK", "Partner"),
        ("10", "ADRA NORGE", "ADVENTIST DEVELOPMENT AND RELIEF AGENCY NORGE", "NORWAY",
         "Partner"),
        ("170", "TROCAIRE-IR", "Trocaire", "IRELAND", "Potential Programmatic Partner"),
        ("171", "TWB", "Translators Without Borders Ireland Company Limited by guarantee",
         "IRELAND", "Partner")]


def test_iati_keeps_aid_publishers_and_drops_academic_and_other():
    assert {"10", "21", "22", "40", "60"} <= registers.IATI_KEEP
    assert not {"80", "90"} & (registers.IATI_KEEP | registers.IATI_REVIEW)
    assert {"70", "71", "72", "73"} == registers.IATI_REVIEW
