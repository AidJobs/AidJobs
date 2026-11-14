"""Tests of the broad layer's rule revision (W-54, role-survey.md 19.17), one or more per error pattern
of 19.16; each fails on the rules as they stood at d62f97e. Every advert and line here was written
for the tests by AidJobs; none is copied from a real advert. Run: python -m pytest tools/survey -q"""
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import advert_set
import adverts


def line(text, tag="p", heading=False):
    return {"text": text, "tag": tag, "heading": heading}


def types(lines, title=""):
    return [s["type"] for s in (adverts.sections_of(lines, title) if title else adverts.sections_of(lines))]


DUTIES = "Lead the quarterly review of the stock records with the district teams and the partners."


# --- the advert set stays as it was drawn (19.16) ---------------------------------------------------

def fingerprint(m) -> str:
    parts = []
    for name in ("SECTION_TYPES", "SECTION_EXTRA"):
        parts += [f"{k}\t{p.pattern}\t{p.flags}" for k, p in getattr(m, name)]
    for name in ("FACTS", "RESTRICTIONS", "INCLUSION"):
        parts += [f"{k}\t{p.pattern}\t{p.flags}" for k, p in getattr(m, name).items()]
    parts += [f"{p.pattern}\t{p.flags}" for p in (m.KNOWN_STANDARD, m.SHORT_STANDARD)]
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()


def test_the_patterns_that_decide_the_advert_set_are_frozen():
    # The hash of adverts.py's patterns at d62f97e, when the validation sample of 100 was drawn.
    assert fingerprint(advert_set) == "50912658541c63ccb8c0d886e59240ab5282a0e52ba295e2d0c3f19cfc4334a7"


def test_which_pages_are_adverts_and_which_lines_are_furniture_ignore_the_measures_patterns(monkeypatch):
    body = " ".join(f"Keep the warehouse ledger {i} current for the district office." for i in range(20))
    ad = {"source": "archive", "method": "html", "org_id": "o",
          "lines": [line("Key responsibilities", "h2", True), line(body), line("Closing date: 30 November 2026"),
                    line("Location: Goma")]}
    monkeypatch.setattr(adverts, "FACTS", {})
    monkeypatch.setattr(adverts, "section_type", lambda h: "unclassified")
    assert adverts.is_advert(ad)
    assert adverts.carries_meaning("Closing date: 30 November 2026")
    pages = [{"source": "archive", "method": "html", "org_id": "o", "lines": [line("Key responsibilities", "h2", True)]}
             for _ in range(3)]
    assert "Key responsibilities" not in adverts.chrome_lines(pages).get("o", set())


# --- 1. headings the page does not format ------------------------------------------------------------

def test_an_unmarked_title_case_heading_line_starts_its_section():
    assert "role_purpose" in types([line("Position Overview"), line(DUTIES)])
    # A list item, a sentence-case line and a line with no text after it are not headings.
    assert "scope" not in types([line("Budget management and reporting", "li"), line(DUTIES)])
    assert "essential_requirements" not in types([line("Experience in grants management"), line(DUTIES)])
    assert "role_purpose" not in types([line(DUTIES), line("Position Overview")])


def test_a_label_opening_a_line_is_a_heading_only_with_a_sentence_after_it():
    assert "role_purpose" in types([line("Purpose of the Job: " + DUTIES)])
    assert "pay_benefits" in types([line("Salary – the post is paid on the national scale with a medical allowance.")])
    assert types([line("Duration: 6 months"), line(DUTIES)]) == ["preamble"]
    # A list of values is not a sentence, and a list item is never a heading (the coding guide).
    assert "languages" not in types([line("Languages: English (fluent), French (good), Arabic (basic), Swahili (basic)")])
    assert "role_purpose" not in types([line("Purpose of the Job: " + DUTIES, "li")])


def test_an_about_heading_set_as_the_main_heading_starts_its_section():
    lines = [line("Finance Officer", "h1", True), line("About us", "h1", True), line(DUTIES)]
    assert types(lines) == ["about_organisation"]
    # The job's own title as the main heading is never a section, even when it reads like one.
    assert types([line("Budget Officer", "h1", True), line(DUTIES)]) == ["preamble"]
    assert types([line("About the Programme", "h1", True), line(DUTIES)], "About the Programme") == ["preamble"]


def test_a_one_line_advert_is_cut_at_the_headings_it_carries():
    text = ("About us: " + " ".join(["We run made-up clinics for the tests."] * 6) + " Responsibilities: " +
            " ".join([DUTIES] * 6) + " Requirements: " + " ".join(["A degree in logistics and four years of work."] * 6)
            + " Duration: 6 months.")
    found = types([line(text)])
    assert found[:3] == ["about_organisation", "responsibilities", "essential_requirements"]
    assert "header_facts" not in found


def test_two_job_fact_lines_before_any_heading_are_the_header_facts():
    lines = [line("Location: Goma"), line("Contract type: Fixed-term"), line(DUTIES)]
    assert types(lines) == ["header_facts", "preamble"]          # the text after the run is not a job fact
    assert "header_facts" not in types([line("Location: Goma"), line(DUTIES)])
    assert "header_facts" not in types([line("Location Goma"), line(DUTIES)])


# --- 2. the job-posting data's employment type ------------------------------------------------------

def test_the_employment_type_follows_the_guides_table():
    assert adverts.employment_facts("FULL_TIME") == {"hours"}
    assert adverts.employment_facts("PART_TIME, TEMPORARY") == {"hours", "contract_type"}
    assert adverts.employment_facts("CONTRACTOR") == {"contract_type"}
    assert adverts.employment_facts("OTHER") == set()
    assert adverts.employment_facts("2026-12-31") == set()
    assert adverts.employment_facts("Permanent") == {"contract_type"}


def test_the_job_posting_data_gives_facts_through_the_table():
    ad = {"title": "Driver", "lines": [line(DUTIES)],
          "facts": {"employment_type": True, "employment_type_text": "FULL_TIME", "closing_time": True}}
    given = adverts.facts_given(ad, adverts.sections_of(ad["lines"]))
    assert "hours" in given and "contract_type" not in given and "closing_time" in given


def test_the_postings_closing_time_counts_unless_it_is_midnight_or_has_no_offset():
    assert adverts.posting_facts({"validThrough": "2026-11-30T23:59:59+03:00"})["closing_time"]
    assert adverts.posting_facts({"validThrough": "2026-11-30T17:00:00Z"})["closing_time"]
    assert not adverts.posting_facts({"validThrough": "2026-11-30T00:00:00Z"})["closing_time"]
    assert not adverts.posting_facts({"validThrough": "2026-11-30T23:59:59"})["closing_time"]
    assert not adverts.posting_facts({"validThrough": "2026-11-30"})["closing_time"]


# --- 3. words in another sense ----------------------------------------------------------------------

def test_contract_type_needs_a_type_named():
    assert "contract_type" not in adverts.facts_of("At this stage the team trains volunteers; the contrat goes to "
                                                    "partners. Contract type: to be confirmed.")
    assert "contract_type" in adverts.facts_of("Un stage de six mois au siège.")
    assert "contract_type" in adverts.facts_of("This is a volunteer position based in the capital.")
    assert "contract_type" in adverts.facts_of("A secondment from a member agency.")
    assert "contract_type" in adverts.facts_of("Type de contrat : durée déterminée")


def test_a_title_that_names_the_engagement_gives_the_contract_type():
    for title, named in (("Evaluation Consultant", True), ("Communications Intern", True),
                         ("Volunteer Coordinator", False), ("Technical Expertise Lead", False)):
        ad = {"title": title, "lines": [line(DUTIES)]}
        assert ("contract_type" in adverts.facts_given(ad, adverts.sections_of(ad["lines"]))) is named, title


def test_a_supervisor_alone_is_not_a_reporting_line():
    assert "reports_to" not in adverts.facts_of("Supervise the distribution activities and keep the supervisor informed.")


def test_a_reporting_line_needs_the_post_named():
    assert "reports_to" in adverts.facts_of("The post reports to the Head of Finance.")
    assert "reports_to" in adverts.facts_of("The post reports to the Manager, Finance and Grants.")
    assert "reports_to" in adverts.facts_of("Reporting to\nCountry Director")
    assert "reports_to" not in adverts.facts_of("The post reports to the line manager.")
    assert "reports_to" not in adverts.facts_of("Reports to: Supervisor")


def test_the_employers_own_budget_and_a_portfolio_without_a_figure_are_not_the_jobs():
    ad = {"title": "Grants Officer", "lines": [
        line("About us", "h2", True), line("Our yearly budget of USD 166 million funds work in nine countries."),
        line("Key responsibilities", "h2", True), line("Track a portfolio of grants with the finance team.")]}
    assert "budget" not in adverts.facts_given(ad, adverts.sections_of(ad["lines"]))
    ad = {"title": "Grants Officer", "lines": [line("Context", "h2", True),
                                               line("The wider response has a budget of USD 40 million this year.")]}
    assert "budget" not in adverts.facts_given(ad, adverts.sections_of(ad["lines"]))
    assert "budget" in adverts.facts_of("You will hold a budget of USD 2 million for the response.")


def test_a_safeguarding_commitment_is_not_a_check():
    assert "safeguarding_checks" not in adverts.facts_of("We hold ourselves to high safeguarding and PSEA standards.")
    assert "safeguarding_checks" in adverts.facts_of("Any offer is subject to references and a police check.")


# --- 4. boilerplate the guide codes as vague --------------------------------------------------------

def test_shortlisting_alone_is_not_a_selection_step():
    assert "selection_steps" not in adverts.facts_of("Only shortlisted candidates will be contacted.")
    assert "selection_steps" not in adverts.facts_of("Only shortlisted applicants will be called for an interview.")
    assert "selection_steps" not in adverts.facts_of("Our recruitment process is fair and open to all.")
    assert "selection_steps" not in adverts.facts_of("Conduct key informant interviews in each camp.")
    assert "selection_steps" in adverts.facts_of("Those selected will sit a written test in Goma.")


def test_a_closing_date_needs_a_calendar_date():
    assert "closing_date" not in adverts.facts_of("Open until filled; closing soon.")
    assert "closing_date" in adverts.facts_of("Closing date: 30 November 2026")
    assert "closing_date" in adverts.facts_of("Deadline\n30/11/2026")
    # "before" and a date is a deadline for applications only when the sentence is about applying.
    assert "closing_date" not in adverts.facts_of("The project began before 1 March 2019 in two districts.")
    assert "closing_date" not in adverts.facts_of("The post existed before 1 March 2019 in another unit.")
    assert "closing_date" in adverts.facts_of("Submit the form before 30 November 2026.")


def test_how_to_apply_needs_a_how():
    assert "how_to_apply" not in adverts.facts_of("Interested people are encouraged to apply.")
    assert "how_to_apply" in adverts.facts_of("To apply, send a short letter and your CV.")
    for how in ("Apply for this job", "Postuler", "Applications should be sent before Friday.",
                "Please use the online portal.", "Those interested should submit their papers.",
                "Send your papers by mail to [email]."):
        assert "how_to_apply" in adverts.facts_of(how), how
    assert "how_to_apply" not in adverts.facts_of("For questions about the role, write to [email].")
    assert "how_to_apply" not in adverts.facts_of("The officer will screen each CV received by the unit.")
    assert "how_to_apply" not in adverts.facts_of("The duties include a review of each CV the unit gets.")
    assert "how_to_apply" in adverts.facts_of("Please attach a CV of two pages.")
    assert "how_to_apply" in adverts.facts_of("Applications must hold a CV of two pages.")


def test_direct_reports_keep_round_ones_rule():
    assert adverts.FACTS["direct_reports"].pattern == advert_set.FACTS["direct_reports"].pattern


def test_travel_required_alone_is_vague():
    assert "travel" not in adverts.facts_of("Travel required.")


# --- 5. facts the script missed ---------------------------------------------------------------------

def test_a_closing_time_with_a_citys_local_time():
    assert "closing_time" in adverts.facts_of("Closing date: 30 November 2026, 23 h 59 (Fiji time)")
    assert "closing_time" in adverts.facts_of("Applications close at midnight Geneva time on 30 November.")
    assert "closing_time" not in adverts.facts_of("Office hours are 8:30 to 17:00 EAT on weekdays.")
    assert "closing_time" not in adverts.facts_of("Apply by 5 pm.")


def test_languages_named_without_fluent_or_required():
    assert "languages" in adverts.facts_of("Excellent English and good French.")
    ad = {"title": "Officer", "lines": [line("Languages", "h2", True), line("English and Swahili")]}
    assert "languages" in adverts.facts_given(ad, adverts.sections_of(ad["lines"]))


def test_a_country_in_the_title_is_the_duty_station():
    ad = {"title": "Programme Officer – Kenya", "lines": [line(DUTIES)]}
    assert "duty_station" in adverts.facts_given(ad, adverts.sections_of(ad["lines"]))
    ad = {"title": "Programme Officer", "lines": [line(DUTIES)]}
    assert "duty_station" not in adverts.facts_given(ad, adverts.sections_of(ad["lines"]))


def test_field_missions_are_travel():
    assert "travel" in adverts.facts_of("Regular field missions to the project sites in the north.")


def test_a_reference_number_in_the_title_but_not_a_year():
    ad = {"title": "Fundraising Coordinator - 2025770", "lines": [line(DUTIES)]}
    assert "reference_number" in adverts.facts_given(ad, adverts.sections_of(ad["lines"]))
    for title in ("Graduate Programme 2026", "Data Request Officer", "Job Details", "Driver #1"):
        ad = {"title": title, "lines": [line(DUTIES)]}
        assert "reference_number" not in adverts.facts_given(ad, adverts.sections_of(ad["lines"])), title


def test_a_contract_length_written_as_an_end_date():
    assert "contract_length" in adverts.facts_of("The contract runs until 31 March 2027.")
    assert "contract_length" in adverts.facts_of("From 1 May 2026 to 30 April 2027, based in Goma.")
    assert "contract_length" not in adverts.facts_of("Applications are open until 30 November 2026.")
    assert "contract_length" not in adverts.facts_of("The role is open until 31 March 2027.")


def test_renewal_subject_to_funding():
    assert "funding_status" in adverts.facts_of("The contract is renewable subject to continued funding.")


def test_adjustments_offered_to_applicants():
    assert "adjustments" in adverts.facts_of("Tell us of any adjustments you want for the interview day.")
    assert "adjustments" in adverts.facts_of("We run a guaranteed interview scheme.")


# --- 6. years of experience -------------------------------------------------------------------------

def secs_of(essential="", desirable=""):
    lines = []
    if essential:
        lines += [line("Requirements", "h2", True), line(essential)]
    if desirable:
        lines += [line("Desirable", "h2", True), line(desirable)]
    return adverts.sections_of(lines)


def test_years_are_the_largest_essential_figure():
    secs = secs_of("Five years' experience in audit and two years' experience leading a team.")
    assert adverts.years_required(secs, "")[0] == "5"
    # In a requirements section the figure needs no "experience": "5 years in finance".
    assert adverts.years_required(secs_of("At least 5 years in finance, 2 of them managing staff."), "")[0] == "5"
    assert adverts.years_asked("At least 5 years in finance.") == ("", "")


def test_a_desirable_figure_counts_only_when_it_is_the_only_one():
    secs = secs_of("5 years of experience in M&E.", "2 years of experience with donors an asset.")
    assert adverts.years_required(secs, "")[0] == "5"
    assert adverts.years_required(secs_of(desirable="2 years of experience with donors."), "")[0] == "2"


def test_months_count_as_a_share_of_a_year():
    assert adverts.years_required(secs_of("18 months of relevant experience."), "")[0] == "1.5"


def test_the_employers_own_years_are_not_asked():
    text = "We have over 30 years of experience in the region.\nYou have 4 years of experience in logistics."
    assert adverts.years_required([], text)[0] == "4"
    text = "The organisation has 30 years of experience in the region.\nYou need 4 years of experience."
    assert adverts.years_required([], text)[0] == "4"
    assert adverts.years_required([], "Four years of experience in an NGO with refugees.")[0] == "4"


# --- 7. level from a labelled grade -----------------------------------------------------------------

def test_a_labelled_grade_in_the_text_gives_the_level():
    assert adverts.text_grade_level([line("Grade: P-3"), line(DUTIES)]) == "coordinator_manager"
    assert adverts.text_grade_level([line("Grade level: NOB")]) == "coordinator_manager"
    assert adverts.text_grade_level([line("We value grade P-3 colleagues.")]) == ""
